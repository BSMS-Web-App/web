/*
 * BSMS Web — Chess Arena Realtime Online Matchmaking, Rooms, Challenges & Move Sync API
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.js';

// Shared in-process state (used directly by server.js and warm serverless instances)
export const chessOnlineState = {
    clients: new Map(),      // clientId -> { clientId, memberId, username, elo, avatar, wins, draws, losses, streak, status, roomId, lastSeen }
    queue: [],               // Array<{ clientId, mode, mins, inc, joinedAt }>
    rooms: new Map(),        // roomId -> { roomId, mode, baseMinutes, incrementSeconds, whitePlayer, blackPlayer, status, moves, winner, reason, updatedAt }
    events: new Map(),       // clientId -> Array<EventPayload>
    lastDbSync: 0
};

const CLIENT_TTL_MS = 30000;
const ROOM_TTL_MS = 3600000;

export function pushClientEvent(clientId, event) {
    if (!clientId) return;
    const list = chessOnlineState.events.get(clientId) || [];
    list.push({ ...event, eventId: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` });
    if (list.length > 50) list.splice(0, list.length - 50);
    chessOnlineState.events.set(clientId, list);
}

export function drainClientEvents(clientId) {
    if (!clientId) return [];
    const list = chessOnlineState.events.get(clientId) || [];
    chessOnlineState.events.set(clientId, []);
    return list;
}

export function cleanRoomCode(raw) {
    return String(raw || '')
        .toUpperCase()
        .replace(/^ROOM[-_\s]*/i, '')
        .replace(/[^A-Z0-9]/g, '')
        .trim();
}

export function pruneStaleOnlineState() {
    const now = Date.now();
    for (const [cid, client] of chessOnlineState.clients.entries()) {
        if (now - (client.lastSeen || 0) > CLIENT_TTL_MS) {
            chessOnlineState.clients.delete(cid);
        }
    }
    chessOnlineState.queue = chessOnlineState.queue.filter((q) => {
        const c = chessOnlineState.clients.get(q.clientId);
        return Boolean(c && now - (c.lastSeen || 0) <= CLIENT_TTL_MS);
    });
    for (const [rid, room] of chessOnlineState.rooms.entries()) {
        if (now - (room.updatedAt || 0) > ROOM_TTL_MS) {
            chessOnlineState.rooms.delete(rid);
        }
    }
}

async function loadStateFromDbIfNeeded() {
    const now = Date.now();
    if (now - chessOnlineState.lastDbSync < 1500 && chessOnlineState.clients.size > 0) {
        return;
    }
    try {
        const snap = await db.ref('/chess/online_runtime').once('value');
        const val = snap.val();
        if (!val || typeof val !== 'object') return;

        if (val.clients && typeof val.clients === 'object') {
            for (const [cid, c] of Object.entries(val.clients)) {
                if (c && now - (c.lastSeen || 0) <= CLIENT_TTL_MS) {
                    const local = chessOnlineState.clients.get(cid);
                    if (!local || (c.lastSeen || 0) >= (local.lastSeen || 0)) {
                        chessOnlineState.clients.set(cid, c);
                    }
                }
            }
        }
        if (val.rooms && typeof val.rooms === 'object') {
            for (const [rid, r] of Object.entries(val.rooms)) {
                if (r && now - (r.updatedAt || 0) <= ROOM_TTL_MS) {
                    const local = chessOnlineState.rooms.get(rid);
                    const rMoves = Array.isArray(r.moves) ? r.moves : [];
                    const lMoves = Array.isArray(local?.moves) ? local.moves : [];
                    if (!local || (r.updatedAt || 0) > (local.updatedAt || 0) || rMoves.length > lMoves.length) {
                        chessOnlineState.rooms.set(rid, {
                            ...r,
                            moves: rMoves
                        });
                    }
                }
            }
        }
        if (Array.isArray(val.queue)) {
            const existingIds = new Set(chessOnlineState.queue.map((q) => q.clientId));
            for (const q of val.queue) {
                if (q && q.clientId && !existingIds.has(q.clientId) && chessOnlineState.clients.has(q.clientId)) {
                    chessOnlineState.queue.push(q);
                }
            }
        }
        if (val.events && typeof val.events === 'object') {
            for (const [cid, evList] of Object.entries(val.events)) {
                if (Array.isArray(evList) && evList.length > 0) {
                    const current = chessOnlineState.events.get(cid) || [];
                    const seenIds = new Set(current.map((e) => e.eventId));
                    for (const ev of evList) {
                        if (ev && (!ev.eventId || !seenIds.has(ev.eventId))) {
                            current.push(ev);
                        }
                    }
                    chessOnlineState.events.set(cid, current);
                }
            }
        }
        chessOnlineState.lastDbSync = now;
    } catch {
        // Ignore DB sync fallback error
    }
}

async function saveStateToDb() {
    try {
        pruneStaleOnlineState();
        const clientsObj = Object.fromEntries(chessOnlineState.clients.entries());
        const roomsObj = Object.fromEntries(chessOnlineState.rooms.entries());
        const eventsObj = Object.fromEntries(chessOnlineState.events.entries());
        chessOnlineState.lastDbSync = Date.now();
        await db.ref('/chess/online_runtime').set({
            clients: clientsObj,
            rooms: roomsObj,
            queue: chessOnlineState.queue,
            events: eventsObj,
            updatedAt: Date.now()
        });
    } catch {
        // Ignore DB write error
    }
}

export function getPublicLobbySnapshot(clientId) {
    pruneStaleOnlineState();
    const users = Array.from(chessOnlineState.clients.values());
    const liveMatches = Array.from(chessOnlineState.rooms.values())
        .filter((r) => r.status === 'playing' && r.blackPlayer)
        .map((r) => ({
            roomId: r.roomId,
            mode: r.mode,
            timeControlLabel: `${r.baseMinutes} | ${r.incrementSeconds}`,
            whitePlayer: r.whitePlayer.username,
            whiteElo: r.whitePlayer.elo,
            whiteAvatar: r.whitePlayer.avatar,
            blackPlayer: r.blackPlayer.username,
            blackElo: r.blackPlayer.elo,
            blackAvatar: r.blackPlayer.avatar,
            spectators: 0
        }));

    const client = clientId ? chessOnlineState.clients.get(clientId) : null;
    const activeRoom = client?.roomId ? chessOnlineState.rooms.get(client.roomId) || null : null;
    const events = clientId ? drainClientEvents(clientId) : [];

    return {
        ok: true,
        users,
        liveMatches,
        room: activeRoom,
        events
    };
}

export function processOnlineAction(action, body) {
    pruneStaleOnlineState();
    const clientId = String(body.clientId || '').trim();
    if (!clientId) {
        return { ok: false, error: 'clientId is required' };
    }

    const now = Date.now();
    let client = chessOnlineState.clients.get(clientId);

    if (!client || action === 'user:register' || action === 'heartbeat' || action === 'user:update') {
        const existingStatus = client?.status || 'online';
        const existingRoomId = client?.roomId || null;
        client = {
            clientId,
            memberId: body.memberId || client?.memberId || clientId,
            username: (body.username || client?.username || 'BSMS_Member').trim(),
            elo: typeof body.elo === 'number' ? Math.max(0, body.elo) : (client?.elo ?? 0),
            avatar: body.avatar || client?.avatar || '/img/pfp.png',
            wins: typeof body.wins === 'number' ? body.wins : (client?.wins ?? 0),
            draws: typeof body.draws === 'number' ? body.draws : (client?.draws ?? 0),
            losses: typeof body.losses === 'number' ? body.losses : (client?.losses ?? 0),
            streak: typeof body.streak === 'number' ? body.streak : (client?.streak ?? 0),
            status: existingStatus,
            roomId: body.roomId || existingRoomId,
            lastSeen: now
        };
        chessOnlineState.clients.set(clientId, client);
    } else {
        client.lastSeen = now;
    }

    if (action === 'user:update' && client.roomId) {
        const room = chessOnlineState.rooms.get(client.roomId);
        if (room) {
            if (room.whitePlayer?.clientId === clientId) {
                room.whitePlayer = { ...client };
                if (room.blackPlayer) {
                    pushClientEvent(room.blackPlayer.clientId, {
                        type: 'opponent:profile_updated',
                        opponent: client
                    });
                }
            } else if (room.blackPlayer?.clientId === clientId) {
                room.blackPlayer = { ...client };
                if (room.whitePlayer) {
                    pushClientEvent(room.whitePlayer.clientId, {
                        type: 'opponent:profile_updated',
                        opponent: client
                    });
                }
            }
            room.updatedAt = now;
        }
    } else if (action === 'queue:join') {
        const mode = body.mode || 'classic';
        const mins = Number(body.mins) || 10;
        const inc = Number(body.inc) || 0;

        chessOnlineState.queue = chessOnlineState.queue.filter((q) => q.clientId !== clientId);
        const matchIdx = chessOnlineState.queue.findIndex(
            (q) => q.mode === mode && q.clientId !== clientId && chessOnlineState.clients.has(q.clientId)
        );

        if (matchIdx !== -1) {
            const opponentQueue = chessOnlineState.queue.splice(matchIdx, 1)[0];
            const opponent = chessOnlineState.clients.get(opponentQueue.clientId);
            if (opponent) {
                const roomId = cleanRoomCode(Math.random().toString(36).substring(2, 7));
                const room = {
                    roomId,
                    mode,
                    baseMinutes: opponentQueue.mins || mins,
                    incrementSeconds: opponentQueue.inc ?? inc,
                    whitePlayer: opponent,
                    blackPlayer: client,
                    status: 'playing',
                    moves: [],
                    updatedAt: now
                };
                chessOnlineState.rooms.set(roomId, room);
                opponent.status = 'in_game';
                opponent.roomId = roomId;
                client.status = 'in_game';
                client.roomId = roomId;

                pushClientEvent(opponent.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'w',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: client
                });
                pushClientEvent(client.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'b',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent
                });
            }
        } else {
            client.status = 'in_queue';
            chessOnlineState.queue.push({
                clientId,
                mode,
                mins,
                inc,
                joinedAt: now
            });
            pushClientEvent(clientId, { type: 'queue:waiting' });
        }
    } else if (action === 'queue:leave') {
        chessOnlineState.queue = chessOnlineState.queue.filter((q) => q.clientId !== clientId);
        if (client.status === 'in_queue') {
            client.status = 'online';
        }
    } else if (action === 'room:create') {
        const roomId = cleanRoomCode(body.roomId || Math.random().toString(36).substring(2, 7));
        const room = {
            roomId,
            mode: body.mode || 'classic',
            baseMinutes: Number(body.mins) || 10,
            incrementSeconds: Number(body.inc) || 0,
            whitePlayer: client,
            blackPlayer: null,
            status: 'waiting',
            moves: [],
            updatedAt: now
        };
        chessOnlineState.rooms.set(roomId, room);
        client.roomId = roomId;
        client.status = 'online';
        pushClientEvent(clientId, { type: 'room:created', roomId });
    } else if (action === 'room:join') {
        const roomId = cleanRoomCode(body.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (!room || room.status === 'finished') {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: `Room code "${roomId || body.roomId}" not found or expired.`
            });
        } else if (room.whitePlayer.clientId === clientId) {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'You created this room! Share the code with another player or open a new tab to join.'
            });
        } else {
            room.blackPlayer = client;
            room.status = 'playing';
            room.updatedAt = now;
            client.status = 'in_game';
            client.roomId = room.roomId;

            const whiteClient = chessOnlineState.clients.get(room.whitePlayer.clientId);
            if (whiteClient) {
                whiteClient.status = 'in_game';
                whiteClient.roomId = room.roomId;
            }

            pushClientEvent(room.whitePlayer.clientId, {
                type: 'match:started',
                roomId: room.roomId,
                color: 'w',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: client
            });
            pushClientEvent(client.clientId, {
                type: 'match:started',
                roomId: room.roomId,
                color: 'b',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: room.whitePlayer
            });
        }
    } else if (action === 'challenge:send') {
        const targetId = String(body.targetClientId || '').trim();
        let target = chessOnlineState.clients.get(targetId);
        if (!target && body.targetUsername) {
            for (const c of chessOnlineState.clients.values()) {
                if (c.username.toLowerCase() === String(body.targetUsername).toLowerCase() && c.clientId !== clientId) {
                    target = c;
                    break;
                }
            }
        }
        if (target) {
            pushClientEvent(target.clientId, {
                type: 'challenge:received',
                fromUser: client,
                mode: body.mode || 'classic',
                mins: Number(body.mins) || 10,
                inc: Number(body.inc) || 0
            });
        } else {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'That member is currently offline.'
            });
        }
    } else if (action === 'challenge:accept') {
        const whiteClient = chessOnlineState.clients.get(body.challengerClientId);
        if (!whiteClient) {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'Challenger is no longer online.'
            });
        } else {
            const roomId = cleanRoomCode(Math.random().toString(36).substring(2, 7));
            const room = {
                roomId,
                mode: body.mode || 'classic',
                baseMinutes: Number(body.mins) || 10,
                incrementSeconds: Number(body.inc) || 0,
                whitePlayer: whiteClient,
                blackPlayer: client,
                status: 'playing',
                moves: [],
                updatedAt: now
            };
            chessOnlineState.rooms.set(roomId, room);
            whiteClient.status = 'in_game';
            whiteClient.roomId = roomId;
            client.status = 'in_game';
            client.roomId = roomId;

            pushClientEvent(whiteClient.clientId, {
                type: 'match:started',
                roomId,
                color: 'w',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: client
            });
            pushClientEvent(client.clientId, {
                type: 'match:started',
                roomId,
                color: 'b',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: whiteClient
            });
        }
    } else if (action === 'game:move') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && body.move) {
            if (!Array.isArray(room.moves)) room.moves = [];
            const moveIndex = typeof body.moveIndex === 'number' ? body.moveIndex : room.moves.length;
            const moveEntry = {
                ...body.move,
                moveIndex,
                byClientId: clientId,
                timestamp: now
            };
            // Avoid duplicate append of the exact same moveIndex
            if (!room.moves.some((m) => m.moveIndex === moveIndex && m.san === body.move.san)) {
                room.moves.push(moveEntry);
            }
            room.updatedAt = now;
            const targetId =
                room.whitePlayer?.clientId === clientId
                    ? room.blackPlayer?.clientId
                    : room.whitePlayer?.clientId;
            if (targetId) {
                pushClientEvent(targetId, {
                    type: 'game:opponent_move',
                    roomId: room.roomId,
                    move: moveEntry
                });
            }
        }
    } else if (action === 'game:end') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.status !== 'finished') {
            room.status = 'finished';
            room.reason = body.reason || 'resigned';
            room.winner = body.winner;
            room.updatedAt = now;
            const targetId =
                room.whitePlayer?.clientId === clientId
                    ? room.blackPlayer?.clientId
                    : room.whitePlayer?.clientId;
            if (targetId) {
                pushClientEvent(targetId, {
                    type: 'game:ended',
                    roomId: room.roomId,
                    reason: room.reason,
                    winner: room.winner
                });
            }
            const wClient = chessOnlineState.clients.get(room.whitePlayer?.clientId);
            if (wClient) wClient.status = 'online';
            const bClient = chessOnlineState.clients.get(room.blackPlayer?.clientId);
            if (bClient) bClient.status = 'online';
        }
    }

    return getPublicLobbySnapshot(clientId);
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    await loadStateFromDbIfNeeded();

    if (req.method === 'GET') {
        const clientId = String(req.query?.clientId || '').trim();
        if (clientId && chessOnlineState.clients.has(clientId)) {
            chessOnlineState.clients.get(clientId).lastSeen = Date.now();
        }
        const snap = getPublicLobbySnapshot(clientId);
        return res.status(200).json(snap);
    }

    if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = body.type || body.action || 'heartbeat';
        const result = processOnlineAction(action, body);
        await saveStateToDb();
        return res.status(200).json(result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
