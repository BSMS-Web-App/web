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
    recentlyEndedRooms: new Map(), // roomId -> endedAt timestamp to prevent DB resurrection
    events: new Map(),       // clientId -> Array<EventPayload>
    lastDbSync: 0
};

const CLIENT_TTL_MS = 30000;
const ROOM_TTL_MS = 3600000;
const ENDED_TOMBSTONE_TTL_MS = 300000;

let wsSender = null;
let presenceBroadcaster = null;
export function registerWsSender(fn) {
    wsSender = fn;
}
export function registerPresenceBroadcaster(fn) {
    presenceBroadcaster = fn;
}
export function markRoomEnded(roomId) {
    const clean = cleanRoomCode(roomId);
    if (!clean) return;
    chessOnlineState.recentlyEndedRooms.set(clean, Date.now());
    try { db.ref(`/chess/online_runtime/rooms/${clean}`).remove().catch(() => {}); } catch {}
}
export function triggerPresenceBroadcast() {
    if (presenceBroadcaster) {
        try { presenceBroadcaster(); } catch {}
    }
}

export function pushClientEvent(clientId, event) {
    if (!clientId) return;
    if (wsSender) {
        try {
            if (wsSender(clientId, event) === true) return;
        } catch {
            // fallback to event queue if WS send failed
        }
    }
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

function ensureSpectatorList(room) {
    if (!room || !room.spectators) return [];
    if (room.spectators instanceof Set) return Array.from(room.spectators);
    if (Array.isArray(room.spectators)) return room.spectators;
    if (typeof room.spectators === 'object') return Object.values(room.spectators);
    return [];
}

function addSpectatorToRoom(room, clientId) {
    if (!room) return 0;
    if (room.spectators instanceof Set) {
        room.spectators.add(clientId);
        return room.spectators.size;
    }
    if (!Array.isArray(room.spectators)) room.spectators = ensureSpectatorList(room);
    if (!room.spectators.includes(clientId)) room.spectators.push(clientId);
    return room.spectators.length;
}

function removeSpectatorFromRoom(room, clientId) {
    if (!room || !room.spectators) return false;
    if (room.spectators instanceof Set) {
        return room.spectators.delete(clientId);
    }
    if (Array.isArray(room.spectators)) {
        const idx = room.spectators.indexOf(clientId);
        if (idx !== -1) {
            room.spectators.splice(idx, 1);
            return true;
        }
    }
    return false;
}

export function resolveMatchColors(prefA, prefB) {
    const a = prefA === 'w' || prefA === 'b' ? prefA : 'any';
    const b = prefB === 'w' || prefB === 'b' ? prefB : 'any';
    if (a === 'w' && b !== 'w') return { first: 'w', second: 'b' };
    if (a === 'b' && b !== 'b') return { first: 'b', second: 'w' };
    if (b === 'w' && a !== 'w') return { first: 'b', second: 'w' };
    if (b === 'b' && a !== 'b') return { first: 'w', second: 'b' };
    return Math.random() < 0.5 ? { first: 'w', second: 'b' } : { first: 'b', second: 'w' };
}

export function pruneStaleOnlineState() {
    const now = Date.now();
    for (const [cid, client] of chessOnlineState.clients.entries()) {
        if (now - (client.lastSeen || 0) > CLIENT_TTL_MS) {
            chessOnlineState.clients.delete(cid);
        }
    }
    for (const [rid, endedAt] of chessOnlineState.recentlyEndedRooms.entries()) {
        if (now - endedAt > ENDED_TOMBSTONE_TTL_MS) {
            chessOnlineState.recentlyEndedRooms.delete(rid);
        }
    }
    chessOnlineState.queue = chessOnlineState.queue.filter((q) => {
        const c = chessOnlineState.clients.get(q.clientId);
        return Boolean(c && now - (c.lastSeen || 0) <= CLIENT_TTL_MS);
    });
    for (const [rid, room] of chessOnlineState.rooms.entries()) {
        if (!room || room.status === 'finished') {
            markRoomEnded(rid);
            chessOnlineState.rooms.delete(rid);
            continue;
        }
        if (room.isBotMatch && room.status === 'playing') {
            const ownerId = room.humanClientId || room.whitePlayer?.clientId;
            const ownerAlive = chessOnlineState.clients.has(ownerId);
            if (!ownerAlive || now - (room.updatedAt || 0) > 90000) {
                for (const specId of ensureSpectatorList(room)) {
                    pushClientEvent(specId, { type: 'game:ended', roomId: room.roomId, reason: 'disconnected', winner: 'draw' });
                }
                markRoomEnded(rid);
                chessOnlineState.rooms.delete(rid);
                continue;
            }
        } else if (!room.isBotMatch && room.status === 'playing') {
            const wAlive = room.whitePlayer?.clientId ? chessOnlineState.clients.has(room.whitePlayer.clientId) : false;
            const bAlive = room.blackPlayer?.clientId ? chessOnlineState.clients.has(room.blackPlayer.clientId) : false;
            if ((!wAlive && !bAlive) || ((!wAlive || !bAlive) && now - (room.updatedAt || 0) > 35000)) {
                const winner = wAlive && !bAlive ? 'w' : bAlive && !wAlive ? 'b' : 'draw';
                const endEv = { type: 'game:ended', roomId: room.roomId, reason: 'disconnected', winner };
                if (wAlive && room.whitePlayer?.clientId) {
                    pushClientEvent(room.whitePlayer.clientId, endEv);
                    const wc = chessOnlineState.clients.get(room.whitePlayer.clientId);
                    if (wc) { wc.status = 'online'; wc.roomId = null; }
                }
                if (bAlive && room.blackPlayer?.clientId) {
                    pushClientEvent(room.blackPlayer.clientId, endEv);
                    const bc = chessOnlineState.clients.get(room.blackPlayer.clientId);
                    if (bc) { bc.status = 'online'; bc.roomId = null; }
                }
                for (const specId of ensureSpectatorList(room)) {
                    pushClientEvent(specId, endEv);
                }
                markRoomEnded(rid);
                chessOnlineState.rooms.delete(rid);
                continue;
            }
        } else if (room.status === 'waiting') {
            const creatorId = room.creatorClientId || room.whitePlayer?.clientId;
            const creatorAlive = creatorId ? chessOnlineState.clients.has(creatorId) : false;
            if (!creatorAlive && now - (room.updatedAt || 0) > CLIENT_TTL_MS) {
                markRoomEnded(rid);
                chessOnlineState.rooms.delete(rid);
                continue;
            }
        }
        if (now - (room.updatedAt || 0) > ROOM_TTL_MS) {
            markRoomEnded(rid);
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
                if (r && r.status !== 'finished' && !chessOnlineState.recentlyEndedRooms.has(rid) && now - (r.updatedAt || 0) <= ROOM_TTL_MS) {
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
        const roomsObj = {};
        for (const [rid, r] of chessOnlineState.rooms.entries()) {
            roomsObj[rid] = { ...r, spectators: ensureSpectatorList(r) };
        }
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
        .filter((r) => r.status === 'playing' && (r.blackPlayer || r.isBotMatch))
        .map((r) => {
            const specCount = r.spectators instanceof Set
                ? r.spectators.size
                : Array.isArray(r.spectators)
                    ? r.spectators.length
                    : 0;
            return {
                roomId: r.roomId,
                mode: r.mode,
                isBotMatch: Boolean(r.isBotMatch),
                botId: r.botInfo?.id || null,
                timeControlLabel: r.isBotMatch
                    ? `${r.baseMinutes || 10} | ${r.incrementSeconds || 0} • Bot`
                    : `${r.baseMinutes} | ${r.incrementSeconds}`,
                whitePlayer: r.whitePlayer?.username || 'Member',
                whiteElo: r.whitePlayer?.elo || 0,
                whiteAvatar: r.whitePlayer?.avatar || '/img/pfp.png',
                blackPlayer: r.blackPlayer?.username || r.botInfo?.name || 'Bot',
                blackElo: r.blackPlayer?.elo ?? (r.botInfo?.elo || 0),
                blackAvatar: r.blackPlayer?.avatar || r.botInfo?.avatar || '/img/pfp.png',
                moveCount: Array.isArray(r.moves) ? r.moves.length : 0,
                spectators: specCount
            };
        });

    const client = clientId ? chessOnlineState.clients.get(clientId) : null;
    const activeRoom = client?.roomId ? chessOnlineState.rooms.get(client.roomId) || null : null;
    const events = clientId ? drainClientEvents(clientId) : [];

    const members = users.map((u) => ({
        memberId: u.memberId || u.clientId,
        username: u.username || 'BSMS_Member',
        avatar: u.avatar || '/img/pfp.png',
        elo: typeof u.elo === 'number' ? u.elo : 0,
        wins: u.wins || 0,
        draws: u.draws || 0,
        losses: u.losses || 0,
        streak: u.streak || 0,
        badges: u.badges || {},
        online: true,
        status: u.status || 'online',
        lastSeen: u.lastSeen || Date.now()
    }));

    return {
        ok: true,
        users,
        members,
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
            badges: (body.badges && typeof body.badges === 'object') ? { ...(client?.badges || {}), ...body.badges } : (client?.badges || {}),
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
        const preferredColor = body.preferredColor === 'w' || body.preferredColor === 'b' ? body.preferredColor : 'any';

        chessOnlineState.queue = chessOnlineState.queue.filter((q) => q.clientId !== clientId);
        let matchIdx = chessOnlineState.queue.findIndex(
            (q) => q.mode === mode && q.clientId !== clientId && chessOnlineState.clients.has(q.clientId) && (preferredColor === 'any' || q.preferredColor !== preferredColor)
        );
        if (matchIdx === -1) {
            matchIdx = chessOnlineState.queue.findIndex(
                (q) => q.mode === mode && q.clientId !== clientId && chessOnlineState.clients.has(q.clientId)
            );
        }

        if (matchIdx !== -1) {
            const opponentQueue = chessOnlineState.queue.splice(matchIdx, 1)[0];
            const opponent = chessOnlineState.clients.get(opponentQueue.clientId);
            if (opponent) {
                const roomId = cleanRoomCode(Math.random().toString(36).substring(2, 7));
                const colors = resolveMatchColors(opponentQueue.preferredColor, preferredColor);
                const whitePlayer = colors.first === 'w' ? opponent : client;
                const blackPlayer = colors.first === 'w' ? client : opponent;
                const room = {
                    roomId,
                    mode,
                    baseMinutes: opponentQueue.mins || mins,
                    incrementSeconds: opponentQueue.inc ?? inc,
                    whitePlayer,
                    blackPlayer,
                    status: 'playing',
                    moves: [],
                    updatedAt: now
                };
                chessOnlineState.rooms.set(roomId, room);
                opponent.status = 'in_game';
                opponent.roomId = roomId;
                client.status = 'in_game';
                client.roomId = roomId;

                pushClientEvent(whitePlayer.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'w',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: blackPlayer
                });
                pushClientEvent(blackPlayer.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'b',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: whitePlayer
                });
            }
        } else {
            client.status = 'in_queue';
            chessOnlineState.queue.push({
                clientId,
                mode,
                mins,
                inc,
                preferredColor,
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
        const creatorColorPref = body.preferredColor === 'w' || body.preferredColor === 'b' ? body.preferredColor : 'any';
        const room = {
            roomId,
            mode: body.mode || 'classic',
            baseMinutes: Number(body.mins) || 10,
            incrementSeconds: Number(body.inc) || 0,
            creatorClientId: clientId,
            creatorColorPref,
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
        } else if ((room.creatorClientId || room.whitePlayer?.clientId) === clientId) {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'You created this room! Share the code with another player or open a new tab to join.'
            });
        } else {
            const creator = room.whitePlayer;
            const joinerPref = body.preferredColor === 'w' || body.preferredColor === 'b' ? body.preferredColor : 'any';
            const colors = resolveMatchColors(room.creatorColorPref, joinerPref);
            room.whitePlayer = colors.first === 'w' ? creator : client;
            room.blackPlayer = colors.first === 'w' ? client : creator;
            room.status = 'playing';
            room.updatedAt = now;
            client.status = 'in_game';
            client.roomId = room.roomId;

            const creatorClient = chessOnlineState.clients.get(creator.clientId);
            if (creatorClient) {
                creatorClient.status = 'in_game';
                creatorClient.roomId = room.roomId;
            }

            pushClientEvent(room.whitePlayer.clientId, {
                type: 'match:started',
                roomId: room.roomId,
                color: 'w',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: room.blackPlayer
            });
            pushClientEvent(room.blackPlayer.clientId, {
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
                inc: Number(body.inc) || 0,
                preferredColor: body.preferredColor === 'w' || body.preferredColor === 'b' ? body.preferredColor : 'any'
            });
        } else {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'That member is currently offline.'
            });
        }
    } else if (action === 'challenge:accept') {
        const challengerClient = chessOnlineState.clients.get(body.challengerClientId);
        if (!challengerClient) {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'Challenger is no longer online.'
            });
        } else {
            const roomId = cleanRoomCode(Math.random().toString(36).substring(2, 7));
            const colors = resolveMatchColors(body.challengerPreferredColor, body.preferredColor);
            const whitePlayer = colors.first === 'w' ? challengerClient : client;
            const blackPlayer = colors.first === 'w' ? client : challengerClient;
            const room = {
                roomId,
                mode: body.mode || 'classic',
                baseMinutes: Number(body.mins) || 10,
                incrementSeconds: Number(body.inc) || 0,
                whitePlayer,
                blackPlayer,
                status: 'playing',
                moves: [],
                updatedAt: now
            };
            chessOnlineState.rooms.set(roomId, room);
            challengerClient.status = 'in_game';
            challengerClient.roomId = roomId;
            client.status = 'in_game';
            client.roomId = roomId;

            pushClientEvent(whitePlayer.clientId, {
                type: 'match:started',
                roomId,
                color: 'w',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: blackPlayer
            });
            pushClientEvent(blackPlayer.clientId, {
                type: 'match:started',
                roomId,
                color: 'b',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: whitePlayer
            });
        }
    } else if (action === 'game:move') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.status === 'playing' && body.move) {
            if (!Array.isArray(room.moves)) room.moves = [];
            const isWhite = room.whitePlayer?.clientId === clientId;
            const isBlack = room.blackPlayer?.clientId === clientId;
            if (isWhite || isBlack) {
                const expectedTurnColor = room.moves.length % 2 === 0 ? 'w' : 'b';
                const playerColor = isWhite ? 'w' : 'b';
                if (playerColor === expectedTurnColor) {
                    const moveIndex = room.moves.length;
                    const moveEntry = {
                        ...body.move,
                        moveIndex,
                        byClientId: clientId,
                        timestamp: now
                    };
                    room.moves.push(moveEntry);
                    if (body.board) {
                        room.lastBoard = body.board;
                    }
                    room.updatedAt = now;
                    const targetId = isWhite ? room.blackPlayer?.clientId : room.whitePlayer?.clientId;
                    const nextTurn = room.moves.length % 2 === 0 ? 'w' : 'b';
                    if (targetId) {
                        pushClientEvent(targetId, {
                            type: 'game:opponent_move',
                            roomId: room.roomId,
                            move: moveEntry,
                            board: body.board || null,
                            turn: nextTurn
                        });
                    }
                    for (const specId of ensureSpectatorList(room)) {
                        pushClientEvent(specId, {
                            type: 'game:opponent_move',
                            roomId: room.roomId,
                            move: moveEntry,
                            board: body.board || null,
                            turn: nextTurn
                        });
                    }
                } else {
                    pushClientEvent(clientId, {
                        type: 'game:sync_state',
                        roomId: room.roomId,
                        moves: room.moves,
                        turn: expectedTurnColor,
                        board: room.lastBoard || null
                    });
                }
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
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'game:ended',
                    roomId: room.roomId,
                    reason: room.reason,
                    winner: room.winner
                });
            }
            if (room.spectators instanceof Set) room.spectators.clear(); else room.spectators = [];
            const wClient = chessOnlineState.clients.get(room.whitePlayer?.clientId);
            if (wClient) { wClient.status = 'online'; wClient.roomId = null; }
            const bClient = chessOnlineState.clients.get(room.blackPlayer?.clientId);
            if (bClient) { bClient.status = 'online'; bClient.roomId = null; }
            markRoomEnded(roomId);
            chessOnlineState.rooms.delete(roomId);
            triggerPresenceBroadcast();
        }
    } else if (action === 'draw:offer') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.status === 'playing' && !room.isBotMatch) {
            const isWhite = room.whitePlayer?.clientId === clientId;
            const isBlack = room.blackPlayer?.clientId === clientId;
            if (isWhite || isBlack) {
                const targetId = isWhite ? room.blackPlayer?.clientId : room.whitePlayer?.clientId;
                const fromUsername = (isWhite ? room.whitePlayer?.username : room.blackPlayer?.username) || 'Opponent';
                if (targetId) {
                    pushClientEvent(targetId, {
                        type: 'draw:offered',
                        roomId: room.roomId,
                        fromClientId: clientId,
                        fromUsername
                    });
                }
            }
        }
    } else if (action === 'draw:response') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.status === 'playing' && !room.isBotMatch) {
            const isWhite = room.whitePlayer?.clientId === clientId;
            const isBlack = room.blackPlayer?.clientId === clientId;
            if (isWhite || isBlack) {
                const targetId = isWhite ? room.blackPlayer?.clientId : room.whitePlayer?.clientId;
                const byUsername = (isWhite ? room.whitePlayer?.username : room.blackPlayer?.username) || 'Opponent';
                if (body.accepted) {
                    room.status = 'finished';
                    room.reason = 'agreement';
                    room.winner = 'draw';
                    room.updatedAt = now;
                    const endPayload = {
                        type: 'game:ended',
                        roomId: room.roomId,
                        reason: 'agreement',
                        winner: 'draw'
                    };
                    if (room.whitePlayer?.clientId) pushClientEvent(room.whitePlayer.clientId, endPayload);
                    if (room.blackPlayer?.clientId) pushClientEvent(room.blackPlayer.clientId, endPayload);
                    for (const specId of ensureSpectatorList(room)) {
                        pushClientEvent(specId, endPayload);
                    }
                    if (room.spectators instanceof Set) room.spectators.clear(); else room.spectators = [];
                    const wClient = chessOnlineState.clients.get(room.whitePlayer?.clientId);
                    if (wClient) { wClient.status = 'online'; wClient.roomId = null; }
                    const bClient = chessOnlineState.clients.get(room.blackPlayer?.clientId);
                    if (bClient) { bClient.status = 'online'; bClient.roomId = null; }
                    markRoomEnded(roomId);
                    chessOnlineState.rooms.delete(roomId);
                    triggerPresenceBroadcast();
                } else if (targetId) {
                    pushClientEvent(targetId, {
                        type: 'draw:declined',
                        roomId: room.roomId,
                        byUsername
                    });
                }
            }
        }
    } else if (action === 'bot_match:start') {
        for (const [rid, r] of chessOnlineState.rooms.entries()) {
            const ownerId = r.humanClientId || r.whitePlayer?.clientId;
            if (r.isBotMatch && ownerId === clientId) {
                for (const specId of ensureSpectatorList(r)) {
                    pushClientEvent(specId, {
                        type: 'game:ended',
                        roomId: r.roomId,
                        reason: 'ended',
                        winner: 'draw'
                    });
                }
                chessOnlineState.rooms.delete(rid);
            }
        }
        const roomId = cleanRoomCode(body.roomId || `BOT${Math.random().toString(36).substring(2, 6)}`);
        const botInfo = body.bot || {};
        const humanColor = body.playerColor === 'b' ? 'b' : 'w';
        const botSeat = {
            clientId: `bot_${botInfo.id || 'ai'}`,
            username: botInfo.name || 'Chess Bot',
            elo: Number(botInfo.elo) || 0,
            avatar: botInfo.avatar || '/img/pfp.png',
            title: botInfo.title || 'BOT'
        };
        const room = {
            roomId,
            isBotMatch: true,
            humanClientId: clientId,
            humanColor,
            botInfo,
            mode: body.mode || 'classic',
            baseMinutes: Number(body.mins) || 10,
            incrementSeconds: Number(body.inc) || 0,
            whitePlayer: humanColor === 'w' ? { ...client } : botSeat,
            blackPlayer: humanColor === 'w' ? botSeat : { ...client },
            status: 'playing',
            moves: [],
            lastBoard: body.board || null,
            lastMissile: null,
            lastSandevistan: null,
            lastGolden: null,
            lastPirate: null,
            lastNutella: null,
            spectators: [],
            updatedAt: now
        };
        chessOnlineState.recentlyEndedRooms.delete(roomId);
        chessOnlineState.rooms.set(roomId, room);
        client.status = 'in_game';
        client.roomId = roomId;
        pushClientEvent(clientId, { type: 'bot_match:started', roomId });
        triggerPresenceBroadcast();
    } else if (action === 'bot_match:move') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing' && body.move) {
            if (!Array.isArray(room.moves)) room.moves = [];
            const moveIndex = typeof body.move.moveIndex === 'number' ? body.move.moveIndex : room.moves.length;
            if (moveIndex >= room.moves.length) {
                room.moves.push(body.move);
            }
            if (body.board) room.lastBoard = body.board;
            room.updatedAt = now;
            const nextTurn = body.turn || (room.moves.length % 2 === 0 ? 'w' : 'b');
            room.turn = nextTurn;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'game:opponent_move',
                    roomId: room.roomId,
                    move: body.move,
                    board: body.board || null,
                    turn: nextTurn
                });
            }
        }
    } else if (action === 'bot_match:missile') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing') {
            room.lastMissile = body.missileStrike || null;
            if (body.board) room.lastBoard = body.board;
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'spectate:missile',
                    roomId: room.roomId,
                    missileStrike: body.missileStrike || null,
                    missileDetonation: body.missileDetonation || null,
                    board: body.board || null
                });
            }
        }
    } else if (action === 'bot_match:sandevistan') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing') {
            room.lastSandevistan = body.sandevistanState || null;
            if (body.turn) room.turn = body.turn;
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'spectate:sandevistan',
                    roomId: room.roomId,
                    sandevistanState: body.sandevistanState || null,
                    trail: body.trail || null,
                    turn: body.turn || null
                });
            }
        }
    } else if (action === 'bot_match:golden') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing') {
            room.lastGolden = body.goldenState || null;
            if (body.board) room.lastBoard = body.board;
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'spectate:golden',
                    roomId: room.roomId,
                    goldenState: body.goldenState || null,
                    board: body.board || null
                });
            }
        }
    } else if (action === 'bot_match:pirate') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing') {
            room.lastPirate = body.pirateState || null;
            if (body.board) room.lastBoard = body.board;
            if (body.turn) room.turn = body.turn;
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'spectate:pirate',
                    roomId: room.roomId,
                    pirateState: body.pirateState || null,
                    board: body.board || null,
                    turn: body.turn || null
                });
            }
        }
    } else if (action === 'bot_match:nutella') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch && room.status === 'playing') {
            room.lastNutella = body.nutellaState || null;
            if (body.board) room.lastBoard = body.board;
            if (body.turn) room.turn = body.turn;
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'spectate:nutella',
                    roomId: room.roomId,
                    nutellaState: body.nutellaState || null,
                    board: body.board || null,
                    turn: body.turn || null
                });
            }
        }
    } else if (action === 'bot_match:end') {
        const roomId = cleanRoomCode(body.roomId || client.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (room && room.isBotMatch) {
            room.status = 'finished';
            room.reason = body.reason || 'ended';
            room.winner = body.winner || 'draw';
            room.updatedAt = now;
            for (const specId of ensureSpectatorList(room)) {
                pushClientEvent(specId, {
                    type: 'game:ended',
                    roomId: room.roomId,
                    reason: room.reason,
                    winner: room.winner
                });
            }
            markRoomEnded(roomId);
            chessOnlineState.rooms.delete(roomId);
        }
        client.status = 'online';
        client.roomId = null;
        triggerPresenceBroadcast();
    } else if (action === 'spectate:join') {
        const roomId = cleanRoomCode(body.roomId);
        const room = chessOnlineState.rooms.get(roomId);
        if (!room || room.status === 'finished') {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'That match has already finished or is unavailable to spectate.'
            });
        } else if ((room.isBotMatch && (room.humanClientId || room.whitePlayer?.clientId) === clientId) || (!room.isBotMatch && (room.whitePlayer?.clientId === clientId || room.blackPlayer?.clientId === clientId))) {
            pushClientEvent(clientId, {
                type: 'room:error',
                message: 'You are already playing in this match.'
            });
        } else {
            for (const r of chessOnlineState.rooms.values()) {
                removeSpectatorFromRoom(r, clientId);
            }
            const specCount = addSpectatorToRoom(room, clientId);
            const activeSandySide = (room.lastSandevistan?.active && Date.now() < room.lastSandevistan.endsAt)
                ? (room.lastSandevistan.botSide || (room.humanColor === 'b' ? 'w' : 'b'))
                : null;
            pushClientEvent(clientId, {
                type: 'spectate:state',
                roomId: room.roomId,
                isBotMatch: Boolean(room.isBotMatch),
                humanColor: room.humanColor || 'w',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                whitePlayer: room.whitePlayer,
                blackPlayer: room.blackPlayer,
                botInfo: room.botInfo || null,
                board: room.lastBoard || null,
                moves: room.moves || [],
                turn: activeSandySide || room.turn || ((room.moves?.length || 0) % 2 === 0 ? 'w' : 'b'),
                missileStrike: room.lastMissile || null,
                sandevistanState: room.lastSandevistan || null,
                goldenState: room.lastGolden || null,
                pirateState: room.lastPirate || null,
                nutellaState: room.lastNutella || null,
                spectatorCount: specCount
            });
            triggerPresenceBroadcast();
        }
    } else if (action === 'spectate:leave') {
        const roomId = body.roomId ? cleanRoomCode(body.roomId) : null;
        for (const r of chessOnlineState.rooms.values()) {
            if (!roomId || r.roomId === roomId) {
                removeSpectatorFromRoom(r, clientId);
            }
        }
        triggerPresenceBroadcast();
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
