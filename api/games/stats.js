/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db } from '../db.js';
import { handleApiCors } from '../../lib/api-cors.js';
import { legalAcceptanceRequired } from '../legal-policy.js';
import { getUserBySession } from '../games.js';

const MAX_DEVICES = 20;
const MAX_DAYS = 400;
const MAX_GAMES = 1000;
const MAX_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_GAME_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GAME_ID = /^[a-zA-Z0-9_-]{1,100}$/;
const DEVICE_ID = /^[a-zA-Z0-9_-]{8,64}$/;

function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function cleanGameId(value) {
    const id = String(value || '');
    return GAME_ID.test(id) ? id : '';
}

/**
 * Accepts a device snapshot of play time and returns a normalized copy, or null
 * when the payload is malformed. Device snapshots hold absolute totals, so the
 * server can merge them idempotently (the highest value for each field wins).
 */
export function validateSnapshot(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;

    const gamesIn = input.games && typeof input.games === 'object' && !Array.isArray(input.games) ? input.games : {};
    const daysIn = input.days && typeof input.days === 'object' && !Array.isArray(input.days) ? input.days : {};
    const gameEntries = Object.entries(gamesIn);
    const dayEntries = Object.entries(daysIn);
    if (gameEntries.length > MAX_GAMES || dayEntries.length > MAX_DAYS) return null;

    const now = Date.now();
    const games = {};
    for (const [rawId, game] of gameEntries) {
        const id = cleanGameId(rawId);
        if (!id || !game || typeof game !== 'object' || Array.isArray(game)) return null;
        const total = number(game.total);
        if (total > MAX_GAME_MS) return null;
        games[id] = {
            name: String(game.name || id).slice(0, 120),
            total: Math.round(total),
            plays: Math.round(Math.min(number(game.plays), 1e9)),
            last: Math.round(Math.min(number(game.last), now + 86400000))
        };
    }

    const days = {};
    for (const [key, day] of dayEntries) {
        if (!DAY_KEY.test(key) || !day || typeof day !== 'object' || Array.isArray(day)) return null;
        const dayGamesIn = day.games && typeof day.games === 'object' && !Array.isArray(day.games) ? day.games : {};
        const dayGames = {};
        for (const [rawId, rawMs] of Object.entries(dayGamesIn)) {
            const id = cleanGameId(rawId);
            const ms = Math.round(number(rawMs));
            if (!id || ms > MAX_DAY_MS) return null;
            if (ms > 0) dayGames[id] = ms;
        }
        if (Object.keys(dayGames).length) days[key] = { games: dayGames };
    }

    return { games, days };
}

export function mergeMaxGames(existing, incoming) {
    const out = {};
    for (const [id, game] of Object.entries(existing && typeof existing === 'object' ? existing : {})) {
        if (!cleanGameId(id) || !game || typeof game !== 'object') continue;
        out[id] = {
            name: String(game.name || id).slice(0, 120),
            total: number(game.total),
            plays: number(game.plays),
            last: number(game.last)
        };
    }
    for (const [id, game] of Object.entries(incoming)) {
        const current = out[id] || { name: id, total: 0, plays: 0, last: 0 };
        out[id] = {
            name: game.name || current.name || id,
            total: Math.max(current.total, game.total),
            plays: Math.max(current.plays, game.plays),
            last: Math.max(current.last, game.last)
        };
    }
    return out;
}

export function mergeMaxDays(existing, incoming) {
    const out = {};
    for (const [key, day] of Object.entries(existing && typeof existing === 'object' ? existing : {})) {
        if (!DAY_KEY.test(key) || !day || typeof day !== 'object' || !day.games) continue;
        const games = {};
        for (const [id, ms] of Object.entries(day.games)) {
            if (cleanGameId(id) && number(ms) > 0) games[id] = number(ms);
        }
        if (Object.keys(games).length) out[key] = { games };
    }
    for (const [key, day] of Object.entries(incoming)) {
        const target = out[key] || { games: {} };
        for (const [id, ms] of Object.entries(day.games)) {
            target.games[id] = Math.max(number(target.games[id]), ms);
        }
        out[key] = target;
    }

    const keys = Object.keys(out).sort();
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete out[key];
    return out;
}

/**
 * Combines every device snapshot for an account into the totals shown in the UI.
 */
export function aggregateStats(state) {
    const games = {};
    const days = {};
    const devices = state && typeof state === 'object' && state.devices && typeof state.devices === 'object' ? state.devices : {};

    for (const device of Object.values(devices)) {
        if (!device || typeof device !== 'object') continue;

        for (const [id, game] of Object.entries(device.games && typeof device.games === 'object' ? device.games : {})) {
            if (!cleanGameId(id) || !game || typeof game !== 'object') continue;
            const entry = games[id] || { name: id, total: 0, plays: 0, last: 0 };
            entry.name = String(game.name || entry.name || id).slice(0, 120);
            entry.total += number(game.total);
            entry.plays += number(game.plays);
            entry.last = Math.max(entry.last, number(game.last));
            games[id] = entry;
        }

        for (const [key, day] of Object.entries(device.days && typeof device.days === 'object' ? device.days : {})) {
            if (!DAY_KEY.test(key) || !day || typeof day !== 'object') continue;
            const entry = days[key] || { total: 0, games: {} };
            for (const [id, ms] of Object.entries(day.games && typeof day.games === 'object' ? day.games : {})) {
                const value = number(ms);
                if (!cleanGameId(id) || value <= 0) continue;
                entry.games[id] = (entry.games[id] || 0) + value;
                entry.total += value;
            }
            if (entry.total > 0) days[key] = entry;
        }
    }

    return { games, days };
}

async function readAccountStats(uid) {
    const snap = await db.ref('/accounts/' + uid + '/game_stats').once('value');
    return aggregateStats(snap.val());
}

export default async function handler(req, res) {
    if (!handleApiCors(req, res)) return;
    if (!db) return res.status(503).json({ error: 'Database unavailable.' });

    const sessionId = String(req.headers['x-session-id'] || req.query.sessionId || '').trim();
    const uidHint = String(req.headers['x-uid'] || req.query.uid || '').trim();
    if (!sessionId) return res.status(401).json({ error: 'Unauthorized. A valid account session is required.' });

    const user = await getUserBySession(sessionId, uidHint);
    if (!user) return res.status(401).json({ error: 'Unauthorized session.' });

    const { uid, account } = user;
    if (account.account_status === 'banned') {
        return res.status(403).json({ error: 'Account banned.', account_status: 'banned' });
    }
    if (legalAcceptanceRequired(account)) {
        return res.status(428).json({ error: 'Legal policy acceptance is required.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });
    }

    if (req.method === 'GET') {
        try {
            return res.status(200).json({ success: true, stats: await readAccountStats(uid) });
        } catch (error) {
            console.error('[BSMS Web :: Game Stats] Failed to load play time:', error);
            return res.status(500).json({ error: 'Failed to load play time stats.' });
        }
    }

    if (req.method === 'POST' || req.method === 'PUT') {
        const deviceId = String(req.headers['x-device-id'] || '').trim();
        if (!DEVICE_ID.test(deviceId)) return res.status(400).json({ error: 'Invalid stats device id.' });

        let payload = req.body;
        if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { payload = null; }
        }
        if (!payload || payload.action !== 'syncStats') {
            return res.status(400).json({ error: 'Invalid stats request.' });
        }

        const stats = validateSnapshot(payload.stats);
        if (!stats) return res.status(400).json({ error: 'Invalid stats data.' });

        try {
            const result = await db.ref('/accounts/' + uid + '/game_stats').transaction(current => {
                const next = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
                const devices = next.devices && typeof next.devices === 'object' && !Array.isArray(next.devices) ? next.devices : {};
                const previous = devices[deviceId] && typeof devices[deviceId] === 'object' ? devices[deviceId] : {};

                devices[deviceId] = {
                    games: mergeMaxGames(previous.games, stats.games),
                    days: mergeMaxDays(previous.days, stats.days),
                    updated: Date.now()
                };

                // Keep the account record small by dropping the least recently
                // updated devices once the limit is reached.
                const ordered = Object.entries(devices)
                    .sort((a, b) => number(b[1] && b[1].updated) - number(a[1] && a[1].updated))
                    .map(([id]) => id);
                for (const id of ordered.slice(MAX_DEVICES)) delete devices[id];

                next.devices = devices;
                next.updated = Date.now();
                return next;
            });

            const value = result && result.snapshot ? result.snapshot.val() : null;
            return res.status(200).json({ success: true, stats: aggregateStats(value) });
        } catch (error) {
            console.error('[BSMS Web :: Game Stats] Failed to sync play time:', error);
            return res.status(500).json({ error: 'Failed to sync play time stats.' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed.' });
}
