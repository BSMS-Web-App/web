import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';

// @ts-ignore - JS API handlers from BSMS Web repository
import authHandler from './api/auth.js';
// @ts-ignore
import adminHandler from './api/admin.js';
// @ts-ignore
import chatHandler from './api/chat.js';
// @ts-ignore
import gamesHandler from './api/games.js';
// @ts-ignore
import exportDataHandler from './api/export-data.js';
// @ts-ignore
import profanityFilterHandler from './api/profanity-filter.js';
// @ts-ignore
import linkPreviewHandler from './api/link-preview.js';
// @ts-ignore
import announcementsHandler from './api/announcements.js';
// @ts-ignore
import versionHandler from './api/version.js';
// @ts-ignore
import halloweenHauntHandler from './api/halloween-haunt.js';
// @ts-ignore
import mediaHandler from './api/media.js';
// @ts-ignore
import membersHandler from './api/members.js';

export interface ConnectedUser {
  clientId: string;
  memberId: string;
  username: string;
  elo: number;
  avatar: string;
  status: 'online' | 'in_queue' | 'in_game';
  roomId?: string;
}

export interface WebsiteMemberRecord {
  memberId: string;
  username: string;
  avatar: string;
  elo: number;
  wins: number;
  draws: number;
  losses: number;
  streak: number;
  online: boolean;
  status: 'online' | 'in_queue' | 'in_game' | 'offline';
  lastSeen: number;
}

interface ActiveRoom {
  roomId: string;
  mode: string;
  baseMinutes: number;
  incrementSeconds: number;
  whitePlayer: ConnectedUser;
  blackPlayer?: ConnectedUser;
  status: 'waiting' | 'playing' | 'finished';
  spectators: Set<string>;
}

const ROOT_DIR = process.cwd();
const MEMBERS_DATA_FILE = path.resolve(ROOT_DIR, 'bsms_members.json');
const RUNTIME_MEMBERS_FILE = '/tmp/bsms_members.json';

function loadStoredMembers(): Map<string, WebsiteMemberRecord> {
  const map = new Map<string, WebsiteMemberRecord>();
  try {
    const fileToRead = fs.existsSync(RUNTIME_MEMBERS_FILE)
      ? RUNTIME_MEMBERS_FILE
      : MEMBERS_DATA_FILE;
    if (fs.existsSync(fileToRead)) {
      const raw = fs.readFileSync(fileToRead, 'utf-8');
      const parsed: WebsiteMemberRecord[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const m of parsed) {
          if (m && m.memberId && m.username) {
            map.set(m.memberId, {
              ...m,
              online: false,
              status: 'offline',
            });
          }
        }
      }
    }
  } catch {
    // Ignore file read errors
  }
  return map;
}

function saveStoredMembers(members: Map<string, WebsiteMemberRecord>) {
  try {
    const arr = Array.from(members.values());
    fs.writeFileSync(RUNTIME_MEMBERS_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch {
    // Ignore file write errors
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const clients = new Map<string, { ws: WebSocket; user: ConnectedUser }>();
  const membersRegistry = loadStoredMembers();
  const rooms = new Map<string, ActiveRoom>();
  let matchmakingQueue: { clientId: string; mode: string; mins: number; inc: number }[] = [];

  const upsertMemberFromUser = (
    user: ConnectedUser,
    stats?: { wins?: number; draws?: number; losses?: number; streak?: number }
  ) => {
    const key = user.memberId || user.clientId;
    const existing = membersRegistry.get(key);
    const updated: WebsiteMemberRecord = {
      memberId: key,
      username: user.username || existing?.username || 'BSMS_Member',
      avatar: user.avatar || existing?.avatar || '/img/pfp.png',
      elo: typeof user.elo === 'number' ? Math.max(0, user.elo) : existing?.elo ?? 0,
      wins: typeof stats?.wins === 'number' ? stats.wins : existing?.wins ?? 0,
      draws: typeof stats?.draws === 'number' ? stats.draws : existing?.draws ?? 0,
      losses: typeof stats?.losses === 'number' ? stats.losses : existing?.losses ?? 0,
      streak: typeof stats?.streak === 'number' ? stats.streak : existing?.streak ?? 0,
      online: true,
      status: user.status,
      lastSeen: Date.now(),
    };
    membersRegistry.set(key, updated);
    saveStoredMembers(membersRegistry);
  };

  const getSortedMembersList = (): WebsiteMemberRecord[] => {
    const activeByMemberId = new Map<string, ConnectedUser>();
    for (const { user } of clients.values()) {
      activeByMemberId.set(user.memberId || user.clientId, user);
    }

    const list: WebsiteMemberRecord[] = [];
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
          lastSeen: Date.now(),
        });
      } else {
        list.push({
          ...record,
          online: false,
          status: 'offline',
        });
      }
    }

    list.sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.lastSeen - a.lastSeen;
    });

    return list;
  };

  const broadcastPresence = () => {
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
        blackPlayer: r.blackPlayer!.username,
        blackElo: r.blackPlayer!.elo,
        blackAvatar: r.blackPlayer!.avatar,
        spectators: r.spectators.size,
      }));

    const payload = JSON.stringify({
      type: 'presence:update',
      users,
      members,
      liveMatches: activeRooms,
    });

    for (const { ws } of clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  };

  // Vercel redirects specified in vercel.json
  app.get('/account', (_req, res) => res.redirect(301, '/accounts'));
  app.get('/c', (_req, res) => res.redirect(301, '/chat'));
  app.get('/games', (_req, res) => res.redirect(301, '/g'));
  app.get('/rooms', (_req, res) => res.redirect(301, '/chat'));

  // BSMS Web API Routes
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

  // REST API for BSMS Website Member Directory & Account Sync
  app.get('/api/members', (req, res) => {
    const localList = getSortedMembersList();
    if (localList.length > 0) {
      res.json({
        members: localList,
        onlineCount: clients.size,
      });
      return;
    }
    membersHandler(req, res);
  });

  app.post('/api/members/sync', (req, res) => {
    const { memberId, username, avatar, pfp, elo, wins, draws, losses, streak } = req.body || {};
    if (!username || typeof username !== 'string') {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    const id = memberId || `member_${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
    const existing = membersRegistry.get(id);
    const resolvedAvatar = avatar || pfp || existing?.avatar || '/img/pfp.png';

    const record: WebsiteMemberRecord = {
      memberId: id,
      username: username.trim(),
      avatar: resolvedAvatar,
      elo: typeof elo === 'number' ? Math.max(0, elo) : existing?.elo ?? 0,
      wins: typeof wins === 'number' ? wins : existing?.wins ?? 0,
      draws: typeof draws === 'number' ? draws : existing?.draws ?? 0,
      losses: typeof losses === 'number' ? losses : existing?.losses ?? 0,
      streak: typeof streak === 'number' ? streak : existing?.streak ?? 0,
      online: existing?.online ?? false,
      status: existing?.status ?? 'offline',
      lastSeen: Date.now(),
    };
    membersRegistry.set(id, record);
    saveStoredMembers(membersRegistry);
    broadcastPresence();
    res.json({ ok: true, member: record, members: getSortedMembersList() });
  });

  const sendToClient = (clientId: string, data: Record<string, unknown>) => {
    const entry = clients.get(clientId);
    if (entry && entry.ws.readyState === WebSocket.OPEN) {
      entry.ws.send(JSON.stringify(data));
    }
  };

  wss.on('connection', (ws) => {
    let currentClientId = '';

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'user:register') {
          currentClientId = msg.clientId;
          const memberId = msg.memberId || msg.clientId;
          const userObj: ConnectedUser = {
            clientId: msg.clientId,
            memberId,
            username: msg.username || 'BSMS_Member',
            elo: typeof msg.elo === 'number' ? Math.max(0, msg.elo) : 0,
            avatar: msg.avatar || '/img/pfp.png',
            status: 'online',
          };
          clients.set(currentClientId, { ws, user: userObj });
          upsertMemberFromUser(userObj, {
            wins: msg.wins,
            draws: msg.draws,
            losses: msg.losses,
            streak: msg.streak,
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
              streak: msg.streak,
            });

            if (entry.user.roomId) {
              const room = rooms.get(entry.user.roomId);
              if (room) {
                if (room.whitePlayer.clientId === currentClientId) {
                  room.whitePlayer = { ...entry.user };
                  if (room.blackPlayer) {
                    sendToClient(room.blackPlayer.clientId, {
                      type: 'opponent:profile_updated',
                      opponent: entry.user,
                    });
                  }
                } else if (room.blackPlayer?.clientId === currentClientId) {
                  room.blackPlayer = { ...entry.user };
                  sendToClient(room.whitePlayer.clientId, {
                    type: 'opponent:profile_updated',
                    opponent: entry.user,
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
              const room: ActiveRoom = {
                roomId,
                mode: msg.mode,
                baseMinutes: opponentQueue.mins,
                incrementSeconds: opponentQueue.inc,
                whitePlayer: opponentEntry.user,
                blackPlayer: entry.user,
                status: 'playing',
                spectators: new Set(),
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
                opponent: entry.user,
              });

              sendToClient(entry.user.clientId, {
                type: 'match:started',
                roomId,
                color: 'b',
                mode: room.mode,
                mins: room.baseMinutes,
                inc: room.incrementSeconds,
                opponent: opponentEntry.user,
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
            inc: msg.inc || 0,
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
          const roomId =
            msg.roomId || Math.random().toString(36).substring(2, 7).toUpperCase();
          const room: ActiveRoom = {
            roomId,
            mode: msg.mode || 'classic',
            baseMinutes: msg.mins || 10,
            incrementSeconds: msg.inc || 0,
            whitePlayer: entry.user,
            status: 'waiting',
            spectators: new Set(),
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
              message: 'Room code not found or expired.',
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
            opponent: entry.user,
          });

          sendToClient(entry.user.clientId, {
            type: 'match:started',
            roomId: room.roomId,
            color: 'b',
            mode: room.mode,
            mins: room.baseMinutes,
            inc: room.incrementSeconds,
            opponent: room.whitePlayer,
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
            inc: msg.inc || 0,
          });
        } else if (msg.type === 'challenge:accept') {
          const blackEntry = clients.get(currentClientId);
          const whiteEntry = clients.get(msg.challengerClientId);
          if (!blackEntry || !whiteEntry) return;

          const roomId = `MATCH-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
          const room: ActiveRoom = {
            roomId,
            mode: msg.mode || 'classic',
            baseMinutes: msg.mins || 10,
            incrementSeconds: msg.inc || 0,
            whitePlayer: whiteEntry.user,
            blackPlayer: blackEntry.user,
            status: 'playing',
            spectators: new Set(),
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
            opponent: blackEntry.user,
          });

          sendToClient(blackEntry.user.clientId, {
            type: 'match:started',
            roomId,
            color: 'b',
            mode: room.mode,
            mins: room.baseMinutes,
            inc: room.incrementSeconds,
            opponent: whiteEntry.user,
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
            sendToClient(targetId, {
              type: 'game:opponent_move',
              move: msg.move,
            });
          }
          room.spectators.forEach((specId) => {
            sendToClient(specId, {
              type: 'game:opponent_move',
              move: msg.move,
            });
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
              winner: msg.winner,
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
        // Ignore malformed messages
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
  app.get('/raw/chat.html', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'chat.html')));
  app.get('/raw/users.html', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'users.html')));
  app.get('/raw/accounts.html', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'accounts.html')));
  app.get('/raw/chess.html', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'chess.html')));
  app.get('/raw/api/auth.js', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'api/auth.js')));
  app.get('/raw/api/chat.js', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'api/chat.js')));
  app.get('/raw/api/profanity-filter.js', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'api/profanity-filter.js')));
  app.get('/raw/api/db.js', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'api/db.js')));
  app.get('/raw/package.json', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'package.json')));
  app.get('/raw/vercel.json', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'vercel.json')));
  app.get('/raw/server.js', (_req, res) => res.type('text/plain').sendFile(path.join(ROOT_DIR, 'server.js')));

  let serveChessDev: ((req: express.Request, res: express.Response) => Promise<void>) | null = null;
  let viteMiddleware: express.RequestHandler | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    serveChessDev = async (req: express.Request, res: express.Response) => {
      try {
        const rawHtml = fs.readFileSync(path.join(ROOT_DIR, 'chess.html'), 'utf-8');
        const devHtml = rawHtml
          .replace('<link rel="stylesheet" href="/js/chess-bundle.css" />', '')
          .replace(
            '<script type="module" src="/js/chess-bundle.js"></script>',
            '<script type="module" src="/src/main.tsx"></script>'
          );
        const transformed = await vite.transformIndexHtml(req.originalUrl, devHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch {
        res.sendFile(path.join(ROOT_DIR, 'chess.html'));
      }
    };

    viteMiddleware = vite.middlewares;
  }

  // Clean URLs for BSMS Web + Chess Portal
  app.get('/', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));
  app.get('/chess', (req, res) => {
    if (serveChessDev) return serveChessDev(req, res);
    res.sendFile(path.join(ROOT_DIR, 'chess.html'));
  });
  app.get('/chess.html', (req, res) => {
    if (serveChessDev) return serveChessDev(req, res);
    res.sendFile(path.join(ROOT_DIR, 'chess.html'));
  });
  app.get('/accounts', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'accounts.html')));
  app.get('/chat', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'chat.html')));
  app.get('/countdown', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'countdown.html')));
  app.get('/g', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'g.html')));
  app.get('/events', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'events.html')));
  app.get('/privacy', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'privacy.html')));
  app.get('/401', (_req, res) => res.status(401).sendFile(path.join(ROOT_DIR, '401.html')));
  app.get('/admin', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'admin/index.html')));
  app.get('/users', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'users.html')));

  // Static asset folders
  app.use('/admin', express.static(path.join(ROOT_DIR, 'admin')));
  app.use('/img', express.static(path.join(ROOT_DIR, 'img')));
  app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
  app.use('/js', express.static(path.join(ROOT_DIR, 'dist/js')));

  if (viteMiddleware) {
    app.use(viteMiddleware);
  }

  // General static serving with clean URL support
  app.use(express.static(ROOT_DIR, { extensions: ['html'] }));

  // 404 handler
  app.use((_req, res) => {
    res.status(404).sendFile(path.join(ROOT_DIR, '404.html'));
  });

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`BSMS Web + Chess Arena listening on port ${PORT}`);
  });
}

startServer();
