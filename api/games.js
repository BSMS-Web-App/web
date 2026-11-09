/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db } from './db.js';
import { legalAcceptanceRequired } from './legal-policy.js';

async function getUserBySession(sessionId, uidHint) {
    if (!db || !sessionId) return null;

    try {
        if (uidHint) {
            const snap = await db.ref('/accounts/' + uidHint).once('value');
            const account = snap.val();
            if (!account || account.account_status === 'deleted') return null;
            if ((account.sessions && account.sessions[sessionId]) || account.creator_session_id === sessionId) {
                return { uid: uidHint, account };
            }
            return null;
        }

        const snap = await db.ref('/accounts').once('value');
        const accounts = snap.val() || {};
        for (const [uid, account] of Object.entries(accounts)) {
            if (account.account_status !== 'deleted' && (
                (account.sessions && account.sessions[sessionId]) ||
                account.creator_session_id === sessionId
            )) {
                return { uid, account };
            }
        }
    } catch (error) {
        console.error('[BSMS Web :: Games] Session validation failed:', error);
    }
    return null;
}

async function readLegacySaves(uid) {
    const rawSnap = await db.ref('/accounts/' + uid + '/game_saves_raw').once('value');
    const rawValue = rawSnap.val();
    if (rawValue) {
        try {
            const parsed = JSON.parse(rawValue);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    const legacySnap = await db.ref('/accounts/' + uid + '/game_saves').once('value');
    const legacy = legacySnap.val();
    return legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};
}

async function writeLegacySaves(uid, saves) {
    await db.ref('/accounts/' + uid + '/game_saves_raw').set(JSON.stringify(saves));
    const safeObject = {};
    for (const [key, value] of Object.entries(saves)) {
        const safeKey = key.replace(/[.#$[\]\/]/g, '_');
        safeObject[safeKey] = value;
    }
    await db.ref('/accounts/' + uid + '/game_saves').set(safeObject);
}

function validGameId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}

function validateGameSave(saveData) {
    if (!saveData || typeof saveData !== 'object' || Array.isArray(saveData)) return false;
    const entries = Object.entries(saveData);
    if (entries.length > 500) return false;
    for (const [key, value] of entries) {
        if (!key || key.length > 500 || typeof value !== 'string' || value.length > 256 * 1024) return false;
    }
    return Buffer.byteLength(JSON.stringify(saveData), 'utf8') <= 2 * 1024 * 1024;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID, X-UID');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (!db) return res.status(503).json({ error: 'Database unavailable.' });

    const sessionId = String(req.headers['x-session-id'] || req.query.sessionId || req.headers['x-device-id'] || '').trim();
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
            const gameId = req.query.gameId;
            if (gameId !== undefined) {
                if (!validGameId(String(gameId))) return res.status(400).json({ error: 'Invalid game ID.' });
                const snap = await db.ref('/accounts/' + uid + '/imported_game_saves/55gms/' + String(gameId)).once('value');
                const saveData = snap.val();
                return res.status(200).json({
                    success: true,
                    saveData: saveData && typeof saveData === 'object' && !Array.isArray(saveData) ? saveData : {}
                });
            }
            const saves = await readLegacySaves(uid);
            return res.status(200).json({ success: true, saves });
        } catch (error) {
            console.error('[BSMS Web :: Games] Error fetching saves:', error);
            return res.status(500).json({ error: 'Failed to load cloud saves.' });
        }
    }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        try {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
            if (payload.action === 'saveImportedGame') {
                const gameId = String(payload.gameId || '');
                const saveData = payload.saveData;
                if (!validGameId(gameId) || !validateGameSave(saveData)) {
                    return res.status(400).json({ error: 'Invalid imported-game save data.' });
                }
                await db.ref('/accounts/' + uid + '/imported_game_saves/55gms/' + gameId).set(saveData);
                return res.status(200).json({ success: true, gameId, count: Object.keys(saveData).length });
            }

            const saves = payload.saves || {};
            if (typeof saves !== 'object' || saves === null || Array.isArray(saves)) {
                return res.status(400).json({ error: 'Invalid saves format.' });
            }
            await writeLegacySaves(uid, saves);
            return res.status(200).json({ success: true, count: Object.keys(saves).length });
        } catch (error) {
            console.error('[BSMS Web :: Games] Error saving cloud saves:', error);
            return res.status(500).json({ error: 'Failed to persist cloud saves.' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed.' });
}
