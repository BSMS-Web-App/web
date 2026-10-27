/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authHandler from './api/auth.js';
import adminHandler from './api/admin.js';
import chatHandler from './api/chat.js';
import gamesHandler from './api/games.js';
import exportDataHandler from './api/export-data.js';
import profanityFilterHandler from './api/profanity-filter.js';
import linkPreviewHandler from './api/link-preview.js';
import announcementsHandler from './api/announcements.js';
import versionHandler from './api/version.js';
import halloweenHauntHandler from './api/halloween-haunt.js';
import mediaHandler from './api/media.js';
import membersHandler from './api/members.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Vercel redirects specified in vercel.json
app.get('/account', (req, res) => res.redirect(301, '/accounts'));
app.get('/c', (req, res) => res.redirect(301, '/chat'));
app.get('/games', (req, res) => res.redirect(301, '/g'));
app.get('/rooms', (req, res) => res.redirect(301, '/chat'));

// API Routes
app.use('/api/auth', (req, res) => authHandler(req, res));
app.use('/api/admin', (req, res) => adminHandler(req, res));
app.use('/api/chat', (req, res) => chatHandler(req, res));
app.use('/api/games/saves', (req, res) => gamesHandler(req, res));
app.use('/games/saves', (req, res) => gamesHandler(req, res));
app.use('/api/games', (req, res) => gamesHandler(req, res));
app.use('/api/link-preview', (req, res) => linkPreviewHandler(req, res));
app.use('/api/export-data', (req, res) => exportDataHandler(req, res));
app.use('/api/profanity-filter', (req, res) => profanityFilterHandler(req, res));
app.use('/api/announcements', (req, res) => announcementsHandler(req, res));
app.use('/api/version', (req, res) => versionHandler(req, res));
app.use('/api/halloween-haunt', (req, res) => halloweenHauntHandler(req, res));
app.use('/api/media', (req, res) => mediaHandler(req, res));

// BSMS Chess Arena Member Directory & Account Sync REST Endpoints
const MEMBERS_DATA_FILE = path.join(__dirname, 'bsms_members.json');

function loadStoredMembers() {
    const map = new Map();
    try {
        if (fs.existsSync(MEMBERS_DATA_FILE)) {
            const raw = fs.readFileSync(MEMBERS_DATA_FILE, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const m of parsed) {
                    if (m && m.memberId && m.username) {
                        map.set(m.memberId, { ...m, online: false, status: 'offline' });
                    }
                }
            }
        }
    } catch {
        // ignore read error
    }
    return map;
}

function saveStoredMembers(members) {
    try {
        fs.writeFileSync(MEMBERS_DATA_FILE, JSON.stringify(Array.from(members.values()), null, 2), 'utf-8');
    } catch {
        // ignore write error
    }
}

const clients = new Map();
const membersRegistry = loadStoredMembers();
const rooms = new Map();
let matchmakingQueue = [];

function upsertMemberFromUser(user, stats) {
    const key = user.memberId || user.clientId;
    const existing = membersRegistry.get(key);
    const updated = {
        memberId: key,
        username: user.username || existing?.username || 'BSMS_Member',
        avatar: user.avatar || existing?.avatar || '/img/pfp.png',
        elo: typeof user.elo === 'number' ? Math.max(0, user.elo) : (existing?.elo ?? 0),
        wins: typeof stats?.wins === 'number' ? stats.wins : (existing?.wins ?? 0),
        draws: typeof stats?.draws === 'number' ? stats.draws : (existing?.draws ?? 0),
        losses: typeof stats?.losses === 'number' ? stats.losses : (existing?.losses ?? 0),
        streak: typeof stats?.streak === 'number' ? stats.streak : (existing?.streak ?? 0),
        online: true,
        status: user.status,
        lastSeen: Date.now()
    };
    membersRegistry.set(key, updated);
    saveStoredMembers(membersRegistry);
}

function getSortedMembersList() {
    const activeByMemberId = new Map();
    for (const { user } of clients.values()) {
        activeByMemberId.set(user.memberId || user.clientId, user);
    }
    const list = [];
    for (const [memberId, record] of membersRegistry.entries()) {
        const liveUser = activeByMemberId.get(memberId);
        if (liveUser) {
            list.push({
                ...record,
                username: liveUser.username,
                avatar: liveUser.avatar,
                elo: liveUser.elo,
                online: true,
                status: liveUser.status,
                lastSeen: Date.now()
            });
        } else {
            list.push({ ...record, online: false, status: 'offline' });
        }
    }
    list.sort((a, b) => (b.elo - a.elo) || (b.wins - a.wins) || (b.lastSeen - a.lastSeen));
    return list;
}

function broadcastPresence() {
    const users = Array.from(clients.values()).map((c) => c.user);
    const members = getSortedMembersList();
    const activeRooms = Array.from(rooms.values())
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
            spectators: r.spectators.size
        }));

    const payload = JSON.stringify({
        type: 'presence:update',
        users,
        members,
        liveMatches: activeRooms
    });

    for (const { ws } of clients.values()) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(payload);
        }
    }
}

app.get('/api/members', (req, res) => {
    const localList = getSortedMembersList();
    if (localList.length > 0) {
        return res.json({ members: localList, onlineCount: clients.size });
    }
    return membersHandler(req, res);
});

app.post('/api/members/sync', (req, res) => {
    const { memberId, username, avatar, pfp, elo, wins, draws, losses, streak } = req.body || {};
    if (!username || typeof username !== 'string') {
        return res.status(400).json({ error: 'username is required' });
    }
    const id = memberId || `member_${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    const existing = membersRegistry.get(id);
    const record = {
        memberId: id,
        username: username.trim(),
        avatar: avatar || pfp || existing?.avatar || '/img/pfp.png',
        elo: typeof elo === 'number' ? Math.max(0, elo) : (existing?.elo ?? 0),
        wins: typeof wins === 'number' ? wins : (existing?.wins ?? 0),
        draws: typeof draws === 'number' ? draws : (existing?.draws ?? 0),
        losses: typeof losses === 'number' ? losses : (existing?.losses ?? 0),
        streak: typeof streak === 'number' ? streak : (existing?.streak ?? 0),
        online: existing?.online ?? false,
        status: existing?.status ?? 'offline',
        lastSeen: Date.now()
    };
    membersRegistry.set(id, record);
    saveStoredMembers(membersRegistry);
    broadcastPresence();
    return res.json({ ok: true, member: record, members: getSortedMembersList() });
});

function sendToClient(clientId, data) {
    const entry = clients.get(clientId);
    if (entry && entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(JSON.stringify(data));
    }
}

wss.on('connection', (ws) => {
    let currentClientId = '';

    ws.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'user:register') {
                currentClientId = msg.clientId;
                const memberId = msg.memberId || msg.clientId;
                const userObj = {
                    clientId: msg.clientId,
                    memberId,
                    username: msg.username || 'BSMS_Member',
                    elo: typeof msg.elo === 'number' ? Math.max(0, msg.elo) : 0,
                    avatar: msg.avatar || '/img/pfp.png',
                    status: 'online'
                };
                clients.set(currentClientId, { ws, user: userObj });
                upsertMemberFromUser(userObj, {
                    wins: msg.wins,
                    draws: msg.draws,
                    losses: msg.losses,
                    streak: msg.streak
                });
                broadcastPresence();
            } else if (msg.type === 'user:update') {
                const entry = clients.get(currentClientId);
                if (entry) {
                    if (msg.username) entry.user.username = msg.username;
                    if (typeof msg.elo === 'number') entry.user.elo = Math.max(0, msg.elo);
                    if (msg.avatar) entry.user.avatar = msg.avatar;
                    if (msg.memberId) entry.user.memberId = msg.memberId;

                    upsertMemberFromUser(entry.user, {
                        wins: msg.wins,
                        draws: msg.draws,
                        losses: msg.losses,
                        streak: msg.streak
                    });

                    if (entry.user.roomId) {
                        const room = rooms.get(entry.user.roomId);
                        if (room) {
                            if (room.whitePlayer.clientId === currentClientId) {
                                room.whitePlayer = { ...entry.user };
                                if (room.blackPlayer) {
                                    sendToClient(room.blackPlayer.clientId, {
                                        type: 'opponent:profile_updated',
                                        opponent: entry.user
                                    });
                                }
                            } else if (room.blackPlayer?.clientId === currentClientId) {
                                room.blackPlayer = { ...entry.user };
                                sendToClient(room.whitePlayer.clientId, {
                                    type: 'opponent:profile_updated',
                                    opponent: entry.user
                                });
                            }
                        }
                    }
                    broadcastPresence();
                }
            } else if (msg.type === 'queue:join') {
                const entry = clients.get(currentClientId);
                if (!entry) return;
                matchmakingQueue = matchmakingQueue.filter((q) => q.clientId !== currentClientId);
                const matchIdx = matchmakingQueue.findIndex(
                    (q) => q.mode === msg.mode && q.clientId !== currentClientId
                );
                if (matchIdx !== -1) {
                    const opponentQueue = matchmakingQueue.splice(matchIdx, 1)[0];
                    const opponentEntry = clients.get(opponentQueue.clientId);
                    if (opponentEntry) {
                        const roomId = `ROOM-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                        const room = {
                            roomId,
                            mode: msg.mode,
                            baseMinutes: opponentQueue.mins,
                            incrementSeconds: opponentQueue.inc,
                            whitePlayer: opponentEntry.user,
                            blackPlayer: entry.user,
                            status: 'playing',
                            spectators: new Set()
                        };
                        rooms.set(roomId, room);
                        opponentEntry.user.status = 'in_game';
                        opponentEntry.user.roomId = roomId;
                        entry.user.status = 'in_game';
                        entry.user.roomId = roomId;

                        upsertMemberFromUser(opponentEntry.user);
                        upsertMemberFromUser(entry.user);

                        sendToClient(opponentEntry.user.clientId, {
                            type: 'match:started',
                            roomId,
                            color: 'w',
                            mode: room.mode,
                            mins: room.baseMinutes,
                            inc: room.incrementSeconds,
                            opponent: entry.user
                        });
                        sendToClient(entry.user.clientId, {
                            type: 'match:started',
                            roomId,
                            color: 'b',
                            mode: room.mode,
                            mins: room.baseMinutes,
                            inc: room.incrementSeconds,
                            opponent: opponentEntry.user
                        });
                        broadcastPresence();
                        return;
                    }
                }
                entry.user.status = 'in_queue';
                upsertMemberFromUser(entry.user);
                matchmakingQueue.push({
                    clientId: currentClientId,
                    mode: msg.mode || 'classic',
                    mins: msg.mins || 10,
                    inc: msg.inc || 0
                });
                sendToClient(currentClientId, { type: 'queue:waiting' });
                broadcastPresence();
            } else if (msg.type === 'queue:leave') {
                matchmakingQueue = matchmakingQueue.filter((q) => q.clientId !== currentClientId);
                const entry = clients.get(currentClientId);
                if (entry && entry.user.status === 'in_queue') {
                    entry.user.status = 'online';
                    upsertMemberFromUser(entry.user);
                }
                broadcastPresence();
            } else if (msg.type === 'room:create') {
                const entry = clients.get(currentClientId);
                if (!entry) return;
                const roomId = msg.roomId || Math.random().toString(36).substring(2, 7).toUpperCase();
                const room = {
                    roomId,
                    mode: msg.mode || 'classic',
                    baseMinutes: msg.mins || 10,
                    incrementSeconds: msg.inc || 0,
                    whitePlayer: entry.user,
                    status: 'waiting',
                    spectators: new Set()
                };
                rooms.set(roomId, room);
                entry.user.roomId = roomId;
                sendToClient(currentClientId, { type: 'room:created', roomId });
                broadcastPresence();
            } else if (msg.type === 'room:join') {
                const entry = clients.get(currentClientId);
                const room = rooms.get((msg.roomId || '').toUpperCase());
                if (!entry || !room) {
                    sendToClient(currentClientId, {
                        type: 'room:error',
                        message: 'Room code not found or expired.'
                    });
                    return;
                }
                if (room.whitePlayer.clientId === currentClientId) return;
                room.blackPlayer = entry.user;
                room.status = 'playing';
                entry.user.status = 'in_game';
                entry.user.roomId = room.roomId;

                const whiteEntry = clients.get(room.whitePlayer.clientId);
                if (whiteEntry) {
                    whiteEntry.user.status = 'in_game';
                    upsertMemberFromUser(whiteEntry.user);
                }
                upsertMemberFromUser(entry.user);

                sendToClient(room.whitePlayer.clientId, {
                    type: 'match:started',
                    roomId: room.roomId,
                    color: 'w',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: entry.user
                });
                sendToClient(entry.user.clientId, {
                    type: 'match:started',
                    roomId: room.roomId,
                    color: 'b',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: room.whitePlayer
                });
                broadcastPresence();
            } else if (msg.type === 'challenge:send') {
                const fromEntry = clients.get(currentClientId);
                if (!fromEntry) return;
                sendToClient(msg.targetClientId, {
                    type: 'challenge:received',
                    fromUser: fromEntry.user,
                    mode: msg.mode || 'classic',
                    mins: msg.mins || 10,
                    inc: msg.inc || 0
                });
            } else if (msg.type === 'challenge:accept') {
                const blackEntry = clients.get(currentClientId);
                const whiteEntry = clients.get(msg.challengerClientId);
                if (!blackEntry || !whiteEntry) return;

                const roomId = `MATCH-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
                const room = {
                    roomId,
                    mode: msg.mode || 'classic',
                    baseMinutes: msg.mins || 10,
                    incrementSeconds: msg.inc || 0,
                    whitePlayer: whiteEntry.user,
                    blackPlayer: blackEntry.user,
                    status: 'playing',
                    spectators: new Set()
                };
                rooms.set(roomId, room);
                whiteEntry.user.status = 'in_game';
                whiteEntry.user.roomId = roomId;
                blackEntry.user.status = 'in_game';
                blackEntry.user.roomId = roomId;

                upsertMemberFromUser(whiteEntry.user);
                upsertMemberFromUser(blackEntry.user);

                sendToClient(whiteEntry.user.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'w',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: blackEntry.user
                });
                sendToClient(blackEntry.user.clientId, {
                    type: 'match:started',
                    roomId,
                    color: 'b',
                    mode: room.mode,
                    mins: room.baseMinutes,
                    inc: room.incrementSeconds,
                    opponent: whiteEntry.user
                });
                broadcastPresence();
            } else if (msg.type === 'game:move') {
                const room = rooms.get(msg.roomId);
                if (!room) return;
                const targetId =
                    room.whitePlayer.clientId === currentClientId
                        ? room.blackPlayer?.clientId
                        : room.whitePlayer.clientId;
                if (targetId) {
                    sendToClient(targetId, { type: 'game:opponent_move', move: msg.move });
                }
                room.spectators.forEach((specId) => {
                    sendToClient(specId, { type: 'game:opponent_move', move: msg.move });
                });
            } else if (msg.type === 'game:end') {
                const room = rooms.get(msg.roomId);
                if (!room) return;
                room.status = 'finished';
                const targetId =
                    room.whitePlayer.clientId === currentClientId
                        ? room.blackPlayer?.clientId
                        : room.whitePlayer.clientId;
                if (targetId) {
                    sendToClient(targetId, {
                        type: 'game:ended',
                        reason: msg.reason,
                        winner: msg.winner
                    });
                }
                const wEntry = clients.get(room.whitePlayer.clientId);
                if (wEntry) {
                    wEntry.user.status = 'online';
                    upsertMemberFromUser(wEntry.user);
                }
                if (room.blackPlayer) {
                    const bEntry = clients.get(room.blackPlayer.clientId);
                    if (bEntry) {
                        bEntry.user.status = 'online';
                        upsertMemberFromUser(bEntry.user);
                    }
                }
                broadcastPresence();
            }
        } catch {
            // ignore malformed message
        }
    });

    ws.on('close', () => {
        if (currentClientId) {
            const leaving = clients.get(currentClientId);
            if (leaving) {
                const rec = membersRegistry.get(leaving.user.memberId || leaving.user.clientId);
                if (rec) {
                    rec.online = false;
                    rec.status = 'offline';
                    rec.lastSeen = Date.now();
                    membersRegistry.set(rec.memberId, rec);
                    saveStoredMembers(membersRegistry);
                }
            }
            matchmakingQueue = matchmakingQueue.filter((q) => q.clientId !== currentClientId);
            clients.delete(currentClientId);
            broadcastPresence();
        }
    });
});

// Raw text endpoints for 1-click copy into GitHub
app.get('/raw/chat.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'chat.html')));
app.get('/raw/users.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'users.html')));
app.get('/raw/accounts.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'accounts.html')));
app.get('/raw/chess.html', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'chess.html')));
app.get('/raw/api/auth.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/auth.js')));
app.get('/raw/api/chat.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/chat.js')));
app.get('/raw/api/profanity-filter.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/profanity-filter.js')));
app.get('/raw/api/db.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'api/db.js')));
app.get('/raw/package.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'package.json')));
app.get('/raw/vercel.json', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'vercel.json')));
app.get('/raw/server.js', (req, res) => res.type('text/plain').sendFile(path.join(__dirname, 'server.js')));

// Clean URLs
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/chess', (req, res) => res.sendFile(path.join(__dirname, 'chess.html')));
app.get('/chess.html', (req, res) => res.sendFile(path.join(__dirname, 'chess.html')));
app.get('/accounts', (req, res) => res.sendFile(path.join(__dirname, 'accounts.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));
app.get('/countdown', (req, res) => res.sendFile(path.join(__dirname, 'countdown.html')));
app.get('/g', (req, res) => res.sendFile(path.join(__dirname, 'g.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/401', (req, res) => res.status(401).sendFile(path.join(__dirname, '401.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin/index.html')));
app.get('/users', (req, res) => res.sendFile(path.join(__dirname, 'users.html')));

// Static asset folders
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/js', express.static(path.join(__dirname, 'js')));

// General static serving with clean URL support
app.use(express.static(__dirname, { extensions: ['html'] }));

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

const PORT = parseInt(process.env.APP_PORT || process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
    console.log(`[BSMS Web + Chess Arena] Server listening on http://${HOST}:${PORT}`);
});
