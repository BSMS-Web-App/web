/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db, admin } from './db.js';
import crypto from 'crypto';
import { moderateContent } from './moderation.js';

async function rejectFlaggedContent(res, value, label) {
    const result = await moderateContent(value);
    if (!result.flagged) return null;
    return res.status(400).json({
        error: `${label} was blocked by moderation: ${result.reason}`,
        moderation: { flagged: true, reasons: result.reasons, categories: result.categories || [], sources: result.sources || [] }
    });
}

function mediaUrl(value) {
    if (value && typeof value === 'object' && value.type === 'media' && /^[a-f0-9]{64}$/.test(value.mediaId || '')) {
        return `/api/media?id=${encodeURIComponent(value.mediaId)}`;
    }
    return value;
}

// Secure password hashing
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Session validator
async function getUserBySession(sessionId) {
    if (!sessionId || !db) return null;
    const snap = await db.ref('/accounts').once('value');
    const accounts = snap.val() || {};
    
    for (const [uid, acc] of Object.entries(accounts)) {
        if (acc.sessions && acc.sessions[sessionId]) {
            return { uid, account: acc };
        }
    }
    return null;
}

// Comprehensive Backend Evaluation (Device & Account Bans + Expiration Sync)
async function evaluateAndClearBans(uid, deviceId, accountObj) {
    const now = Date.now();

    // 1. Evaluate Device Ban first (highest priority)
    if (deviceId) {
        const deviceSnap = await db.ref(`/banned_devices/${deviceId}`).once('value');
        const deviceBan = deviceSnap.val();
        if (deviceBan) {
            if (deviceBan.ban_expires && now > deviceBan.ban_expires) {
                // Strict lazy deletion: device ban is expired, remove it entirely
                await db.ref(`/banned_devices/${deviceId}`).remove();
            } else {
                return {
                    isBanned: true,
                    banType: 'device',
                    banReason: deviceBan.reason || 'This device has been permanently banned from the ecosystem.',
                    banExpires: deviceBan.ban_expires || null
                };
            }
        }
    }

    // 2. Evaluate Account Ban next
    if (accountObj && accountObj.account_status === 'banned') {
        if (accountObj.ban_expires && now > accountObj.ban_expires) {
            // Strict lazy unban: account ban is expired, clear restrictions
            if (uid) {
                await db.ref(`/accounts/${uid}`).update({
                    account_status: 'active',
                    ban_expires: null,
                    ban_reason: null
                });
            }
            accountObj.account_status = 'active'; // Local override just in case
        } else {
            return {
                isBanned: true,
                banType: 'account',
                banReason: accountObj.ban_reason || 'This account has been banned.',
                banExpires: accountObj.ban_expires || null
            };
        }
    }

    return { isBanned: false };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!db) {
        return res.status(500).json({ error: "Database failed to initialize. Check environment variables." });
    }

    const payload = req.body || {};
    const action = req.query.action || payload.action;
    
    // Explicit extraction to support robust session tracking and strict device checking
    const sessionId = req.headers['x-session-id'];
    const clientDeviceId = req.headers['x-device-id'];

    try {
        switch (action) {
            case 'register': {
                const { email = "", username, password } = payload;
                if (!username || !password) return res.status(400).json({ error: 'Missing required fields.' });

                // STRICT: Block registration entirely if device is in /banned_devices
                const banCheck = await evaluateAndClearBans(null, clientDeviceId, null);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }

                const validUserRegex = /^[a-zA-Z0-9_.-]+$/;
                if (!validUserRegex.test(username)) return res.status(400).json({ error: 'Username contains invalid characters.' });
                
                const usernameModerationResponse = await rejectFlaggedContent(res, username, 'Username');
                if (usernameModerationResponse) return usernameModerationResponse;

                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                const inputEmail = email ? email.toLowerCase() : "";
                const inputUser = username.toLowerCase();

                // Strict Uniqueness Checks
                for (const [id, acc] of Object.entries(accounts)) {
                    if (acc.username && acc.username.toLowerCase() === inputUser) {
                        return res.status(400).json({ error: 'Username is already taken' });
                    }
                    if (acc.email && acc.email.toLowerCase() === inputEmail) {
                        return res.status(400).json({ error: 'Email is already taken' });
                    }
                }

                const uid = db.ref('/accounts').push().key;
                const newSessionId = sessionId || crypto.randomUUID();
                const currentTimestamp = Date.now();
                
                const newAccount = {
                    email,
                    username,
                    displayName: username,
                    password: hashPassword(password),
                    account_status: 'active',
                    role: 'user',
                    verified: false,
                    isDeveloper: false,
                    creator_session_id: sessionId || newSessionId,
                    creator_device_id: clientDeviceId || "",
                    followers: {},
                    following: {},
                    createdAt: currentTimestamp,
                    avatar: '', 
                    sessions: {
                        [newSessionId]: {
                            createdAt: currentTimestamp,
                            lastActive: currentTimestamp,
                            deviceId: clientDeviceId || "" // Storing ONLY in session scope
                        }
                    }
                };

                await db.ref(`/accounts/${uid}`).set(newAccount);
                await db.ref(`/chat/users/${uid}`).set({
                    status: 'online',
                    lastSeen: currentTimestamp,
                    lastMessageTimestamp: 0
                });
                await db.ref(`/chat/conversations/gcs/gc-general/members/${uid}`).set({
                    role: 'member',
                    joinedAt: currentTimestamp
                });

                const { password: _, ...safeProfile } = newAccount;
                return res.status(200).json({ success: true, sessionId: newSessionId, uid, profile: safeProfile });
            }

            case 'login': {
                const { username, password } = payload;
                if (!username || !password) return res.status(400).json({ error: 'Missing credentials.' });

                const hashedPw = hashPassword(password);
                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                let targetUid = null;
                let targetAcc = null;
                
                const inputLower = username.toLowerCase();
                for (const [id, acc] of Object.entries(accounts)) {
                    const accUserLower = acc.username ? acc.username.toLowerCase() : '';
                    const accEmailLower = acc.email ? acc.email.toLowerCase() : '';
                    if ((accUserLower === inputLower || accEmailLower === inputLower) && acc.password === hashedPw) {
                        targetUid = id;
                        targetAcc = acc;
                        break;
                    }
                }

                if (!targetUid) return res.status(401).json({ error: 'Invalid username/email or password.' });
                
                // EXPLICIT CHECK: Ensure banned devices/accounts are caught securely using our handler
                const banCheck = await evaluateAndClearBans(targetUid, clientDeviceId, targetAcc);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }

                const newSessionId = sessionId || crypto.randomUUID();
                await db.ref(`/accounts/${targetUid}/sessions/${newSessionId}`).set({
                    createdAt: admin.database.ServerValue.TIMESTAMP,
                    lastActive: admin.database.ServerValue.TIMESTAMP,
                    deviceId: clientDeviceId || "" // Storing ONLY in session scope
                });

                const { password: _, ...safeProfile } = targetAcc;
                safeProfile.avatar = mediaUrl(safeProfile.avatar);
                return res.status(200).json({ success: true, sessionId: newSessionId, uid: targetUid, profile: safeProfile });
            }

            case 'logout': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                // Naturally deletes the device ID linkage because it is scoped entirely inside this session node
                await db.ref(`/accounts/${user.uid}/sessions/${sessionId}`).remove();
                return res.status(200).json({ success: true });
            }

            // --- PROACTIVE CHECK & FRONTEND SYNC ---
            case 'removeExpiredBan':
            case 'checkBan': {
                let uid = null; let account = null;
                const user = await getUserBySession(sessionId);
                
                if (user) {
                    uid = user.uid; account = user.account;
                } else if (!clientDeviceId) {
                    return res.status(401).json({ error: 'Unauthorized.' });
                }

                // Checking the ban executes the database cleanup if it detects expiration
                const banCheck = await evaluateAndClearBans(uid, clientDeviceId, account);
                if (banCheck.isBanned) {
                    return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                }
                
                return res.status(200).json({ success: true, account_status: 'active' });
            }

            case 'getProfile': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                const { password: _, ...safeProfile } = user.account;
                safeProfile.avatar = mediaUrl(safeProfile.avatar);
                return res.status(200).json({ profile: safeProfile });
            }

            case 'updateProfile': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                const { displayName, bio, email, phone, avatar, showInUsersList, chatColor, nameColor } = payload;
                const updates = {};
                
                if (displayName !== undefined) {
                    const displayNameModerationResponse = await rejectFlaggedContent(res, displayName, 'Display name');
                    if (displayNameModerationResponse) return displayNameModerationResponse;
                    updates['displayName'] = displayName;
                }
                if (bio !== undefined) {
                    const bioModerationResponse = await rejectFlaggedContent(res, bio, 'Bio');
                    if (bioModerationResponse) return bioModerationResponse;
                    updates['bio'] = bio;
                }
                if (email !== undefined) updates['email'] = email;
                if (phone !== undefined) updates['phone'] = phone;
                if (showInUsersList !== undefined) updates['showInUsersList'] = Boolean(showInUsersList);
                if (avatar !== undefined) {
                    if (!avatar) {
                        await db.ref(`/accounts/${user.uid}/avatar`).remove();
                    } else {
                        updates['avatar'] = avatar;
                    }
                }
                const colorVal = (nameColor !== undefined ? nameColor : chatColor);
                if (colorVal !== undefined) {
                    if (!colorVal || colorVal === "" || colorVal === "default") {
                        await db.ref(`/accounts/${user.uid}/nameColor`).remove();
                        await db.ref(`/accounts/${user.uid}/chatColor`).remove();
                        updates['nameColor'] = "";
                        updates['chatColor'] = "";
                    } else {
                        const trimmedColor = String(colorVal).trim();
                        if (/^#[0-9a-fA-F]{3,8}$/.test(trimmedColor) || /^[a-zA-Z]+$/.test(trimmedColor)) {
                            updates['nameColor'] = trimmedColor;
                            updates['chatColor'] = trimmedColor;
                        } else {
                            return res.status(400).json({ error: 'Invalid color format. Please use a valid hex color code (e.g. #ef4444 or #BB001E).' });
                        }
                    }
                }

                if (Object.keys(updates).length > 0) {
                    await db.ref(`/accounts/${user.uid}`).update(updates);
                }
                const finalNameColor = updates['nameColor'] !== undefined ? updates['nameColor'] : (user.account.nameColor || user.account.chatColor || "");
                return res.status(200).json({ success: true, nameColor: finalNameColor, chatColor: finalNameColor });
            }

            case 'removeAvatar': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                await db.ref(`/accounts/${user.uid}/avatar`).remove();
                return res.status(200).json({ success: true });
            }

            case 'changeUsername': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                const { newUsername } = payload;
                const lastChange = user.account.lastUsernameChange || 0;
                
                if (Date.now() - lastChange < 7 * 24 * 60 * 60 * 1000) {
                    return res.status(400).json({ error: 'Username change is on cooldown (7 days).' });
                }

                if (!/^[a-zA-Z0-9_-]{3,20}$/.test(newUsername)) return res.status(400).json({ error: 'Invalid username format.' });
                const newUsernameModerationResponse = await rejectFlaggedContent(res, newUsername, 'Username');
                if (newUsernameModerationResponse) return newUsernameModerationResponse;
                
                const snap = await db.ref('/accounts').once('value');
                const allAccs = snap.val() || {};
                for (const [id, acc] of Object.entries(allAccs)) {
                    if (acc.username && acc.username.toLowerCase() === newUsername.toLowerCase()) {
                        return res.status(400).json({ error: 'Username is already taken' });
                    }
                }

                await db.ref(`/accounts/${user.uid}`).update({
                    username: newUsername,
                    lastUsernameChange: admin.database.ServerValue.TIMESTAMP
                });
                
                return res.status(200).json({ success: true });
            }

            case 'changePassword': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                const { currentPassword, newPassword } = payload;
                if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Missing password fields.' });
                
                if (user.account.password !== hashPassword(currentPassword)) {
                    return res.status(401).json({ error: 'Incorrect current password.' });
                }

                await db.ref(`/accounts/${user.uid}/password`).set(hashPassword(newPassword));
                return res.status(200).json({ success: true });
            }

            case 'getSessions': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });

                return res.status(200).json({ sessions: user.account.sessions || {} });
            }

            case 'revokeSession': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                if (payload.sessionId) {
                    await db.ref(`/accounts/${user.uid}/sessions/${payload.sessionId}`).remove();
                }
                return res.status(200).json({ success: true });
            }

            case 'deleteAccount': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const banCheck = await evaluateAndClearBans(user.uid, clientDeviceId, user.account);
                if (banCheck.isBanned) return res.status(403).json({ error: 'Banned.', account_status: 'banned', banType: banCheck.banType, reason: banCheck.banReason, ban_expires: banCheck.banExpires });
                
                if (user.account.password !== hashPassword(payload.password)) {
                    return res.status(401).json({ error: 'Incorrect password.' });
                }
                
                await db.ref(`/accounts/${user.uid}/account_status`).set('deleted');
                await db.ref(`/accounts/${user.uid}/sessions`).remove();
                return res.status(200).json({ success: true });
            }

            case 'getPublicUsers': {
                const accountsSnap = await db.ref('/accounts').once('value');
                const accounts = accountsSnap.val() || {};
                
                let myUid = null;
                if (sessionId) {
                    const currentUser = await getUserBySession(sessionId);
                    if (currentUser) myUid = currentUser.uid;
                }

                // Identify all banned and deleted accounts
                const bannedOrDeletedUids = new Set();
                for (const [id, acc] of Object.entries(accounts)) {
                    if (acc.account_status === 'banned' || acc.account_status === 'deleted') {
                        bannedOrDeletedUids.add(id);
                    }
                }

                // Asynchronously purge any follow links involving banned/deleted accounts
                for (const bannedId of bannedOrDeletedUids) {
                    const bAcc = accounts[bannedId];
                    if (bAcc) {
                        if (bAcc.following) {
                            for (const fTarget of Object.keys(bAcc.following)) {
                                db.ref(`/accounts/${fTarget}/followers/${bannedId}`).remove().catch(() => {});
                            }
                            db.ref(`/accounts/${bannedId}/following`).remove().catch(() => {});
                        }
                        if (bAcc.followers) {
                            for (const fOrigin of Object.keys(bAcc.followers)) {
                                db.ref(`/accounts/${fOrigin}/following/${bannedId}`).remove().catch(() => {});
                            }
                            db.ref(`/accounts/${bannedId}/followers`).remove().catch(() => {});
                        }
                    }
                }

                const list = [];
                for (const [id, acc] of Object.entries(accounts)) {
                    // Never include banned or deleted accounts
                    if (bannedOrDeletedUids.has(id)) continue;
                    if (acc.account_status === 'active' || (!acc.account_status && acc.username)) {
                        const rawFollowers = acc.followers ? Object.keys(acc.followers) : [];
                        const rawFollowing = acc.following ? Object.keys(acc.following) : [];

                        // Filter out any banned user IDs from followers and following counts
                        const followers = rawFollowers.filter(u => !bannedOrDeletedUids.has(u));
                        const following = rawFollowing.filter(u => !bannedOrDeletedUids.has(u));
                        const isFollowing = myUid ? followers.includes(myUid) : false;

                        list.push({
                            uid: id,
                            username: acc.username,
                            displayName: acc.displayName || acc.username,
                            avatar: mediaUrl(acc.avatar || ''),
                            bio: acc.bio || '',
                            role: acc.role || 'user',
                            verified: Boolean(acc.verified),
                            isDeveloper: Boolean(acc.isDeveloper),
                            nameColor: acc.nameColor || acc.chatColor || '',
                            chatColor: acc.nameColor || acc.chatColor || '',
                            followersCount: followers.length,
                            followingCount: following.length,
                            followersList: followers,
                            followingList: following,
                            isFollowing,
                            hiddenFromDirectory: acc.showInUsersList === false,
                            createdAt: acc.createdAt || null
                        });
                    }
                }

                return res.status(200).json({ users: list, myUid });
            }

            case 'follow': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const { targetUid } = payload;
                if (!targetUid || targetUid === user.uid) return res.status(400).json({ error: 'Invalid target user.' });

                const targetSnap = await db.ref(`/accounts/${targetUid}`).once('value');
                if (!targetSnap.exists()) return res.status(404).json({ error: 'User not found.' });

                await db.ref(`/accounts/${targetUid}/followers/${user.uid}`).set(Date.now());
                await db.ref(`/accounts/${user.uid}/following/${targetUid}`).set(Date.now());

                return res.status(200).json({ success: true });
            }

            case 'unfollow': {
                const user = await getUserBySession(sessionId);
                if (!user) return res.status(401).json({ error: 'Unauthorized.' });
                
                const { targetUid } = payload;
                if (!targetUid || targetUid === user.uid) return res.status(400).json({ error: 'Invalid target user.' });

                await db.ref(`/accounts/${targetUid}/followers/${user.uid}`).remove();
                await db.ref(`/accounts/${user.uid}/following/${targetUid}`).remove();

                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: 'Unknown action.' });
        }
    } catch (err) {
        console.error('[BSMS Web :: Auth] Error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
