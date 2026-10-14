/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import admin from 'firebase-admin';
import crypto from 'crypto';

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
        console.error("[BSMS Web :: Admin] Firebase Init Error:", err.message);
    }
}
const db = admin.apps.length ? admin.database() : null;

// Matches auth.js password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Verify session belongs to an admin or moderator
async function verifyStaff(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            if ((acc.role === 'admin' || acc.role === 'mod') && acc.account_status !== 'banned') {
                return { uid, account: acc };
            }
            return null;
        }
    }
    return null;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!db) {
        return res.status(500).json({ error: "Database failed to initialize." });
    }

    const sessionId = req.headers['x-session-id'];
    const staffUser = await verifyStaff(sessionId);
    
    if (!staffUser) {
        return res.status(403).json({ error: 'Unauthorized: Admin or Moderator privileges required.' });
    }

    const isMod = staffUser.account.role === 'mod';
    const payload = req.body || {};
    const action = req.query.action || payload.action;

    // Enforce Moderator read-only restriction
    if (isMod && action !== 'getUsers') {
        return res.status(403).json({ error: 'Moderator Read-Only: Moderation edits and bans are reserved for administrators.' });
    }

    try {
        switch (action) {
            case 'getUsers': {
                const [accountsSnap, devicesSnap] = await Promise.all([
                    db.ref('/accounts').once('value'),
                    db.ref('/banned_devices').once('value')
                ]);
                return res.status(200).json({
                    accounts: accountsSnap.val() || {},
                    banned_devices: devicesSnap.val() || {},
                    callerRole: staffUser.account.role,
                    callerUid: staffUser.uid
                });
            }

            case 'bulkBan': {
                const { targetUids = [], reason = 'Bulk banned by administration.', ban_expires = null } = payload;
                let bannedCount = 0;
                for (const tUid of targetUids) {
                    const tSnap = await db.ref(`/accounts/${tUid}`).once('value');
                    const tAcc = tSnap.val() || {};
                    // Admins cannot ban other admins
                    if (tAcc.role === 'admin') continue;

                    await db.ref(`/accounts/${tUid}`).update({
                        account_status: 'banned',
                        ban_reason: reason,
                        ban_expires: ban_expires
                    });
                    bannedCount++;
                }
                return res.status(200).json({ success: true, bannedCount });
            }

            case 'updateUser': {
                const { targetUid, updates, newPassword } = payload;
                if (!targetUid || !updates) return res.status(400).json({ error: 'Missing targetUid or updates.' });

                // Check admin protection: Admins cannot ban other admins or demote them
                const targetSnap = await db.ref(`/accounts/${targetUid}`).once('value');
                const targetAcc = targetSnap.val() || {};
                if (targetAcc.role === 'admin' && targetUid !== staffUser.uid) {
                    if (updates.account_status === 'banned') {
                        return res.status(403).json({ error: 'Admins cannot ban other administrators.' });
                    }
                    if (updates.role && updates.role !== 'admin') {
                        return res.status(403).json({ error: 'Admins cannot demote other administrators.' });
                    }
                }

                const finalUpdates = { ...updates };
                
                // If admin typed a new password, hash it using auth.js SHA-256 standard
                if (newPassword && newPassword.trim() !== '') {
                    finalUpdates.password = hashPassword(newPassword.trim());
                }

                await db.ref(`/accounts/${targetUid}`).update(finalUpdates);
                return res.status(200).json({ success: true });
            }

            case 'revokeSession': {
                const { targetUid, targetSessionId } = payload;
                if (!targetUid || !targetSessionId) return res.status(400).json({ error: 'Missing session parameters.' });
                await db.ref(`/accounts/${targetUid}/sessions/${targetSessionId}`).remove();
                return res.status(200).json({ success: true });
            }

            case 'banDevice': {
                const { deviceId, reason, ban_expires } = payload;
                if (!deviceId) return res.status(400).json({ error: 'Missing deviceId.' });
                
                // Matches evaluateAndClearBans in auth.js
                await db.ref(`/banned_devices/${deviceId}`).set({
                    reason: reason || 'This device has been permanently banned from the ecosystem.',
                    ban_expires: ban_expires || null
                });
                return res.status(200).json({ success: true });
            }

            case 'unbanDevice': {
                const { deviceId } = payload;
                if (!deviceId) return res.status(400).json({ error: 'Missing deviceId.' });
                await db.ref(`/banned_devices/${deviceId}`).remove();
                return res.status(200).json({ success: true });
            }

            case 'getDB': {
                const snap = await db.ref('/').once('value');
                return res.status(200).json(snap.val() || {});
            }

            case 'updateDBNode': {
                const { path, value } = payload;
                if (!path || path === '/') return res.status(400).json({ error: "Invalid database path." });
                await db.ref(path).set(value);
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: 'Unknown admin action.' });
        }
    } catch (err) {
        console.error('[BSMS Web :: Admin] Error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error.' });
    }
}
