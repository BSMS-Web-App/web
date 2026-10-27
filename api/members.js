/*
 * BSMS Web — Chess Arena Member Directory & Account Sync API
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.js';

function normalizeAvatar(avatar, pfp) {
    const raw = avatar || pfp || '';
    if (raw && typeof raw === 'object' && raw.type === 'media' && raw.mediaId) {
        return `/api/media?id=${encodeURIComponent(raw.mediaId)}`;
    }
    if (typeof raw === 'string' && raw.trim()) {
        return raw.trim();
    }
    return '/img/pfp.png';
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const [accountsSnap, chessMembersSnap] = await Promise.all([
            db.ref('/accounts').once('value'),
            db.ref('/chess/members').once('value')
        ]);

        const accounts = accountsSnap.val() || {};
        const chessMembers = chessMembersSnap.val() || {};
        const mergedMap = new Map();

        // 1. Pull all active BSMS Web accounts so every website member is synced into Chess
        for (const [uid, acc] of Object.entries(accounts)) {
            if (!acc || acc.account_status === 'deleted' || acc.account_status === 'banned') continue;
            const username = acc.displayName || acc.username || uid;
            const avatar = normalizeAvatar(acc.avatar, acc.pfp);
            const existingChess = chessMembers[uid] || {};

            mergedMap.set(uid, {
                memberId: uid,
                username,
                avatar,
                elo: typeof existingChess.elo === 'number' ? Math.max(0, existingChess.elo) : 0,
                wins: typeof existingChess.wins === 'number' ? existingChess.wins : 0,
                draws: typeof existingChess.draws === 'number' ? existingChess.draws : 0,
                losses: typeof existingChess.losses === 'number' ? existingChess.losses : 0,
                streak: typeof existingChess.streak === 'number' ? existingChess.streak : 0,
                online: Boolean(existingChess.online),
                status: existingChess.status || 'offline',
                lastSeen: existingChess.lastSeen || acc.lastLogin || Date.now()
            });
        }

        // 2. Merge any standalone Chess member records
        for (const [memberId, rec] of Object.entries(chessMembers)) {
            if (!rec || !rec.username) continue;
            const existingAcc = mergedMap.get(memberId);
            mergedMap.set(memberId, {
                memberId,
                username: existingAcc?.username || rec.username,
                avatar: existingAcc?.avatar && existingAcc.avatar !== '/img/pfp.png'
                    ? existingAcc.avatar
                    : normalizeAvatar(rec.avatar, rec.pfp),
                elo: typeof rec.elo === 'number' ? Math.max(0, rec.elo) : (existingAcc?.elo ?? 0),
                wins: typeof rec.wins === 'number' ? rec.wins : (existingAcc?.wins ?? 0),
                draws: typeof rec.draws === 'number' ? rec.draws : (existingAcc?.draws ?? 0),
                losses: typeof rec.losses === 'number' ? rec.losses : (existingAcc?.losses ?? 0),
                streak: typeof rec.streak === 'number' ? rec.streak : (existingAcc?.streak ?? 0),
                online: Boolean(rec.online),
                status: rec.status || 'offline',
                lastSeen: rec.lastSeen || Date.now()
            });
        }

        if (req.method === 'POST') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
            const { memberId, username, avatar, pfp, elo, wins, draws, losses, streak } = body;

            if (!username || typeof username !== 'string') {
                return res.status(400).json({ error: 'username is required' });
            }

            const id = memberId || `member_${username.toLowerCase().replace(/[^a-z0-9_]/g, '')}`;
            const prev = mergedMap.get(id);
            const record = {
                memberId: id,
                username: username.trim(),
                avatar: normalizeAvatar(avatar || pfp, prev?.avatar),
                elo: typeof elo === 'number' ? Math.max(0, elo) : (prev?.elo ?? 0),
                wins: typeof wins === 'number' ? wins : (prev?.wins ?? 0),
                draws: typeof draws === 'number' ? draws : (prev?.draws ?? 0),
                losses: typeof losses === 'number' ? losses : (prev?.losses ?? 0),
                streak: typeof streak === 'number' ? streak : (prev?.streak ?? 0),
                online: true,
                status: 'online',
                lastSeen: Date.now()
            };

            await db.ref(`/chess/members/${id}`).set(record);
            mergedMap.set(id, record);

            const sorted = Array.from(mergedMap.values()).sort((a, b) => (b.elo - a.elo) || (b.wins - a.wins));
            return res.status(200).json({ ok: true, member: record, members: sorted });
        }

        const sorted = Array.from(mergedMap.values()).sort((a, b) => (b.elo - a.elo) || (b.wins - a.wins));
        return res.status(200).json({
            members: sorted,
            onlineCount: sorted.filter((m) => m.online).length
        });
    } catch (error) {
        console.error('[BSMS Web :: Chess Members API]', error);
        return res.status(200).json({ members: [], onlineCount: 0 });
    }
}
