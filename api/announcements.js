/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';

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
        console.error("[BSMS Web :: Announcements] Firebase Init Error:", err.message);
    }
}
const db = admin.apps.length ? admin.database() : null;

// Verify session belongs to an owner or admin
async function verifyStaff(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            if ((acc.role === 'owner' || acc.role === 'admin') && acc.account_status !== 'banned') {
                return { uid, account: acc };
            }
            return null;
        }
    }
    return null;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (!db) {
        return res.status(503).json({ error: "Database unavailable." });
    }

    // Public GET endpoint: fetch announcements
    if (req.method === 'GET') {
        try {
            const snap = await db.ref('/announcements').once('value');
            const data = snap.val() || {};
            
            const announcements = Object.entries(data).map(([id, item]) => ({
                id,
                ...item
            })).sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));

            const recent = announcements.length > 0 ? announcements[0] : null;

            return res.status(200).json({
                success: true,
                announcements,
                recent
            });
        } catch (err) {
            console.error("[BSMS Web :: Announcements] Error fetching announcements:", err);
            return res.status(500).json({ error: "Failed to retrieve announcements." });
        }
    }

    // Authenticated actions (Create, Delete)
    if (req.method === 'POST') {
        const sessionId = req.headers['x-session-id'] || req.query.sessionId;
        const staff = await verifyStaff(sessionId);
        if (!staff) {
            return res.status(403).json({ error: "Unauthorized: Administrator or Owner privileges required." });
        }

        const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = req.query.action || payload.action;

        if (action === 'create' || !action) {
            const title = (payload.title || '').trim();
            const content = (payload.content || '').trim();

            if (!title) {
                return res.status(400).json({ error: "Announcement title is required." });
            }
            if (!content) {
                return res.status(400).json({ error: "Announcement content is required." });
            }

            const newRef = db.ref('/announcements').push();
            const id = newRef.key;
            const now = Date.now();

            const announcement = {
                id,
                title,
                content,
                authorUid: staff.uid,
                authorUsername: staff.account.username || staff.uid,
                authorDisplayName: staff.account.displayName || staff.account.username || staff.uid,
                authorAvatar: staff.account.avatar || '',
                authorRole: staff.account.role || 'admin',
                createdAt: now,
                timestamp: now
            };

            await newRef.set(announcement);
            return res.status(200).json({ success: true, announcement });
        }

        if (action === 'delete') {
            const id = payload.id || payload.announcementId;
            if (!id) {
                return res.status(400).json({ error: "Missing announcement id to delete." });
            }

            await db.ref(`/announcements/${id}`).remove();
            return res.status(200).json({ success: true, deletedId: id });
        }

        return res.status(400).json({ error: "Unknown action." });
    }

    return res.status(405).json({ error: "Method not allowed." });
}
