/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';

// Safe Firebase Initialization
if (!admin.apps.length) {
    try {
        if (!process.env.FIREBASE_PRIVATE_KEY) {
            throw new Error("FIREBASE_PRIVATE_KEY is missing from environment variables.");
        }
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
    } catch (err) {
        console.error("[BSMS Web :: Games] Firebase Init Error:", err.message);
    }
}
const db = admin.apps.length ? admin.database() : null;

// Robust Session & User validator
async function getUserBySession(sessionId, uidHint) {
    if (!db) return null;
    
    // Fast path: direct lookup if uidHint is provided
    if (uidHint) {
        try {
            const snap = await db.ref(`/accounts/${uidHint}`).once('value');
            const acc = snap.val();
            if (acc && acc.account_status !== 'deleted') {
                if (!sessionId || (acc.sessions && acc.sessions[sessionId]) || acc.creator_session_id === sessionId) {
                    return { uid: uidHint, account: acc };
                }
            }
        } catch (e) {}
    }

    if (!sessionId) return null;

    try {
        const snap = await db.ref('/accounts').once('value');
        const accounts = snap.val() || {};
        
        // 1. Check sessions dictionary and creator_session_id
        for (const [uid, acc] of Object.entries(accounts)) {
            if (acc.account_status !== 'deleted' && (
                (acc.sessions && acc.sessions[sessionId]) ||
                acc.creator_session_id === sessionId
            )) {
                return { uid, account: acc };
            }
        }

        // 2. Fallback: check if sessionId is actually a direct UID
        if (accounts[sessionId] && accounts[sessionId].account_status !== 'deleted') {
            return { uid: sessionId, account: accounts[sessionId] };
        }
    } catch (e) {
        console.error("[BSMS Web :: Games] getUserBySession error:", e);
    }
    
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID, X-UID');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!db) {
        return res.status(503).json({ error: "Database unavailable." });
    }

    const sessionId = req.headers['x-session-id'] || req.query.sessionId || req.headers['x-device-id'];
    const uidHint = req.headers['x-uid'] || req.query.uid;

    if (!sessionId && !uidHint) {
        return res.status(401).json({ error: "Unauthorized. Session required." });
    }

    const user = await getUserBySession(sessionId, uidHint);
    if (!user) {
        return res.status(401).json({ error: "Unauthorized session." });
    }

    const { uid, account } = user;
    if (account.account_status === 'banned') {
        return res.status(403).json({ error: "Account banned.", account_status: "banned" });
    }

    if (req.method === 'GET') {
        try {
            const rawSnap = await db.ref(`/accounts/${uid}/game_saves_raw`).once('value');
            const rawVal = rawSnap.val();
            let saves = {};

            if (rawVal) {
                try {
                    saves = JSON.parse(rawVal);
                } catch(e) {
                    saves = {};
                }
            } else {
                const legacySnap = await db.ref(`/accounts/${uid}/game_saves`).once('value');
                saves = legacySnap.val() || {};
            }

            return res.status(200).json({ success: true, saves });
        } catch (err) {
            console.error("[BSMS Web :: Games] Error fetching saves:", err);
            return res.status(500).json({ error: "Failed to load cloud saves." });
        }
    }

    if (req.method === 'PUT' || req.method === 'POST') {
        try {
            const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
            const saves = payload?.saves || {};

            if (typeof saves !== 'object' || saves === null) {
                return res.status(400).json({ error: "Invalid saves format." });
            }

            // Store pure raw JSON string to preserve all key names (dots, slashes, brackets)
            const rawString = JSON.stringify(saves);
            await db.ref(`/accounts/${uid}/game_saves_raw`).set(rawString);

            // Also mirror sanitized object in /game_saves for readability
            const safeObj = {};
            for (const [k, v] of Object.entries(saves)) {
                const safeKey = k.replace(/[.#$\[\]\/]/g, '_');
                safeObj[safeKey] = v;
            }
            await db.ref(`/accounts/${uid}/game_saves`).set(safeObj);

            return res.status(200).json({ success: true, count: Object.keys(saves).length });
        } catch (err) {
            console.error("[BSMS Web :: Games] Error saving cloud saves:", err);
            return res.status(500).json({ error: "Failed to persist cloud saves." });
        }
    }

    return res.status(405).json({ error: "Method not allowed." });
}
