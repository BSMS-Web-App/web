/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db } from './db.js';
import crypto from 'crypto';

// Matches auth.js password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Verify session belongs to an owner, admin or moderator
async function verifyStaff(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            if ((acc.role === 'owner' || acc.role === 'admin' || acc.role === 'mod') && acc.account_status !== 'banned') {
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
        return res.status(403).json({ error: 'Unauthorized: Staff privileges required.' });
    }

    const callerRole = staffUser.account.role;
    const isOwner = callerRole === 'owner';
    const isMod = callerRole === 'mod';
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
                    callerRole: callerRole,
                    callerUid: staffUser.uid
                });
            }

            case 'bulkBan': {
                // Strictly owner only: only owners can bulk ban people
                if (!isOwner) {
                    return res.status(403).json({ error: 'Forbidden: Only the server owner can perform bulk bans.' });
                }
                const { targetUids = [], reason = 'Bulk banned by administration.', ban_expires = null } = payload;
                let bannedCount = 0;
                for (const tUid of targetUids) {
                    const tSnap = await db.ref(`/accounts/${tUid}`).once('value');
                    const tAcc = tSnap.val() || {};
                    if (tUid === staffUser.uid) continue;

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

                const targetSnap = await db.ref(`/accounts/${targetUid}`).once('value');
                const targetAcc = targetSnap.val() || {};

                // Target is owner - only the owner can modify themselves, admins cannot touch the owner
                if (targetAcc.role === 'owner' && !isOwner) {
                    return res.status(403).json({ error: 'Admins cannot modify the server owner.' });
                }

                // If caller is admin (not owner):
                if (!isOwner) {
                    // Cannot promote anyone to owner
                    if (updates.role === 'owner') {
                        return res.status(403).json({ error: 'Only the server owner can transfer ownership.' });
                    }
                    // Only owners can make other people admin! Admins cannot make other people admin
                    if (updates.role === 'admin' && targetAcc.role !== 'admin') {
                        return res.status(403).json({ error: 'Forbidden: Only the server owner can promote users to Administrator.' });
                    }
                    // Admins cannot ban other admins
                    if (targetAcc.role === 'admin' && targetUid !== staffUser.uid) {
                        if (updates.account_status === 'banned') {
                            return res.status(403).json({ error: 'Admins cannot ban other administrators.' });
                        }
                        if (updates.role && updates.role !== 'admin') {
                            return res.status(403).json({ error: 'Admins cannot demote other administrators.' });
                        }
                    }
                }

                // Strict single-owner enforcement: if someone is set to owner, demote existing owner to admin
                if (updates.role === 'owner' && targetAcc.role !== 'owner') {
                    const allSnap = await db.ref('/accounts').once('value');
                    const allAccounts = allSnap.val() || {};
                    for (const [accId, acc] of Object.entries(allAccounts)) {
                        if (acc.role === 'owner' && accId !== targetUid) {
                            await db.ref(`/accounts/${accId}/role`).set('admin');
                        }
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
                // Strictly owner only! Admins cannot access raw db inspector
                if (!isOwner) {
                    return res.status(403).json({ error: 'Forbidden: Only the Owner can access the raw database inspector.' });
                }
                const snap = await db.ref('/').once('value');
                return res.status(200).json(snap.val() || {});
            }

            case 'updateDBNode': {
                // Strictly owner only! Admins cannot modify raw db
                if (!isOwner) {
                    return res.status(403).json({ error: 'Forbidden: Only the Owner can modify the raw database.' });
                }
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
