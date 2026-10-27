/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { db, admin, requestMacApi } from './db.js';
import crypto from 'crypto';
import { moderateContent } from './moderation.js';

async function rejectFlaggedContent(res, value, label = 'Content') {
    const result = await moderateContent(value);
    if (!result.flagged) return null;
    return res.status(400).json({
        error: `${label} was blocked by moderation: ${result.reason}`,
        moderation: { flagged: true, reasons: result.reasons, categories: result.categories || [], sources: result.sources || [] }
    });
}

async function getUserBySession(sessionId) {
    if (!sessionId || !db) return null;
    try {
        const result = await requestMacApi('GET', '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId));
        return result?.uid && result?.account ? { uid: result.uid, account: result.account } : null;
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!db) return res.status(500).json({ error: "Database failed to initialize. Check environment variables." });

    const action = req.query.action || (req.body && req.body.action);
    const sessionId = req.headers['x-session-id'];
    const payload = req.body || {};

    try {
        const userLookup = await getUserBySession(sessionId);
        if (!userLookup) return res.status(401).json({ error: 'Unauthorized session.' });

        const { uid, account } = userLookup;
        
        // Pass complete ban data specifically for front-end global routing
        if (account.account_status === 'banned') {
            return res.status(403).json({ 
                error: 'Account banned.', 
                account_status: 'banned',
                banType: 'account',
                reason: account.ban_reason || null,
                ban_expires: account.ban_expires || null
            });
        }

        await db.ref(`/accounts/${uid}/sessions/${sessionId}/lastActive`).set(Date.now());

        switch (action) {
            case 'sync': {
                await db.ref(`/chat/users/${uid}/status`).set('online');
                await db.ref(`/chat/users/${uid}/lastSeen`).set(admin.database.ServerValue.TIMESTAMP);

                const chatData = await requestMacApi('GET', '/v1/chat/sync?uid=' + encodeURIComponent(uid));

                const hiddenDms = account.hidden_dms ? Object.keys(account.hidden_dms) : [];
                return res.status(200).json({
                    myUid: uid,
                    users: chatData.users || {},
                    accounts: chatData.accounts || {},
                    channels: chatData.channels || {},
                    hiddenDms
                });
            }

            case 'messages': {
                const { cid, type, limit = 20, beforeId } = payload;
                if (!cid || !type || !['dms', 'gcs'].includes(type)) {
                    return res.status(400).json({ error: 'Missing or invalid channel data.' });
                }

                // Keep the public general room join behavior without downloading any conversation history.
                if (cid === 'gc-general') {
                    const generalSnap = await db.ref('/chat/conversations/gcs/gc-general').once('value');
                    const general = generalSnap.val();
                    if (!general) {
                        await db.ref('/chat/conversations/gcs/gc-general').set({
                            name: 'BSMS General',
                            _type: 'gcs',
                            _id: 'gc-general',
                            config: { joinCode: 'GENERAL', allowCustomNicknames: true, lastMessageId: 100000 },
                            members: { [uid]: { role: 'member', joinedAt: Date.now() } },
                            messages: {}
                        });
                    } else if (!general.members || !general.members[uid]) {
                        await db.ref(`/chat/conversations/gcs/gc-general/members/${uid}`).set({ role: 'member', joinedAt: Date.now() });
                    }
                }

                const query = new URLSearchParams({
                    uid,
                    cid: String(cid),
                    type: String(type),
                    limit: String(Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 20)))
                });
                if (beforeId) query.set('beforeId', String(beforeId));
                const result = await requestMacApi('GET', '/v1/chat/messages?' + query.toString());
                if (result?.messages && typeof result.messages === 'object') {
                    for (const message of Object.values(result.messages)) {
                        if (message && (message.contentType === 'file' || message.contentType === 'image')) {
                            message.content = null;
                            message.hasContent = true;
                            message.attachmentMimeType = null;
                            message.attachmentName = 'Attachment';
                        }
                    }
                }
                return res.status(200).json(result);
            }

            case 'sendMessage': {
                const { cid, type, content, contentType = 'text', attachmentName, repliedTo } = payload;
                if (!cid || !type || !content) return res.status(400).json({ error: "Missing payload data" });
                if (contentType === 'file' || contentType === 'image') {
                    return res.status(403).json({ error: 'Sending files and images in chat is disabled.' });
                }

                const chSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = chSnap.val();
                if (!channel || !channel.members || !channel.members[uid]) return res.status(403).json({ error: "Not a member." });

                if (contentType === 'text') {
                    const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;
                    if (!validTextRegex.test(content)) return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
                    const messageModerationResponse = await rejectFlaggedContent(res, content, 'Message');
                    if (messageModerationResponse) return messageModerationResponse;
                } else if (contentType === 'poll') {
                    const pollQuestionModerationResponse = await rejectFlaggedContent(res, content.pollQuestion, 'Poll question');
                    if (pollQuestionModerationResponse) return pollQuestionModerationResponse;
                    if (content.pollOptions && typeof content.pollOptions === 'object') {
                        for (const option of Object.values(content.pollOptions)) {
                            const pollOptionModerationResponse = await rejectFlaggedContent(res, option, 'Poll option');
                            if (pollOptionModerationResponse) return pollOptionModerationResponse;
                        }
                    }
                } else if (contentType === 'invite') {
                    if (typeof content === 'object' && content.groupName) {
                        const inviteNameModerationResponse = await rejectFlaggedContent(res, content.groupName, 'Group name');
                        if (inviteNameModerationResponse) return inviteNameModerationResponse;
                    }
                }

                const lastMsgSnap = await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).once('value');
                const now = Date.now();
                if (type === 'dms' && (now - (lastMsgSnap.val() || 0) < 5000)) {
                    return res.status(429).json({ error: "Please wait 5 seconds before sending another message." });
                }

                const msgIdRef = db.ref(`/chat/conversations/${type}/${cid}/config/lastMessageId`);
                const transactionResult = await msgIdRef.transaction((current) => (current || 99999) + 1);
                const newId = transactionResult.snapshot.val();

                const rr = {};
                for (let mUid in channel.members) rr[mUid] = (mUid === uid);

                const userAcc = userLookup.account || {};
                const senderColor = userAcc.nameColor || userAcc.chatColor || null;
                const msgObj = {
                    senderUid: uid,
                    timestamp: admin.database.ServerValue.TIMESTAMP,
                    content: content,
                    contentType: contentType,
                    readReceipts: rr,
                    status: { unsent: false, deletedByMod: false, pinned: false, repliedTo: repliedTo || false }
                };
                if (senderColor) msgObj.senderColor = senderColor;
                if (attachmentName) msgObj.attachmentName = attachmentName;

                await db.ref(`/chat/conversations/${type}/${cid}/messages/${newId}`).set(msgObj);
                await db.ref(`/chat/users/${uid}/lastMessageTimestamp`).set(now);

                if (process.env.NTFY_CHAT_TOPIC) {
                    try { 
                        fetch(`https://ntfy.sh/${process.env.NTFY_CHAT_TOPIC}`, { 
                            method: 'POST', body: `New message delivered in ${type}`, headers: { 'Title': 'BSMS Chat System Notification' }
                        }); 
                    } catch(e) { }
                }

                return res.status(200).json({ success: true, messageId: newId });
            }

            case 'action': {
                const { action: msgAction, cid, type, msgId, emoji, optKey, content } = payload;
                if (!cid || !type || !msgId) return res.status(400).json({ error: "Missing data" });

                const msgRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}`);
                const msgSnap = await msgRef.once('value');
                const msg = msgSnap.val();

                if (!msg) return res.status(404).json({ error: "Message not found" });

                const roleSnap = await db.ref(`/chat/conversations/${type}/${cid}/members/${uid}/role`).once('value');
                const role = roleSnap.val() || 'member';
                const isMod = type === 'gcs' && (role === 'owner' || role === 'moderator');
                const isMine = msg.senderUid === uid;

                if (msgAction === 'unsend' && isMine) {
                    await msgRef.update({ 'status/unsent': true, content: null });
                } else if (msgAction === 'moderate' && isMod && !isMine) {
                    await msgRef.update({ 'status/deletedByMod': true, content: null });
                } else if (msgAction === 'pin' && isMod) {
                    await msgRef.update({ 'status/pinned': !(msg.status?.pinned || false) });
                } else if (msgAction === 'edit' && isMine && msg.contentType === 'text') {
                    const editedMessageModerationResponse = await rejectFlaggedContent(res, content, 'Edited message');
                    if (editedMessageModerationResponse) return editedMessageModerationResponse;
                    await msgRef.update({ content: content, 'status/edited': true });
                } else if (msgAction === 'react' && emoji) {
                    const rxRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/reactions/${uid}`);
                    const rx = (await rxRef.once('value')).val();
                    if (rx === emoji) await rxRef.remove(); else await rxRef.set(emoji);
                } else if (msgAction === 'votePoll' && optKey && msg.contentType === 'poll') {
                    const voteRef = db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/content/pollVotes/${uid}`);
                    const vote = (await voteRef.once('value')).val();
                    if (vote === optKey) await voteRef.remove(); else await voteRef.set(optKey);
                } else {
                    return res.status(403).json({ error: "Unauthorized message action." });
                }

                return res.status(200).json({ success: true });
            }

            case 'typing': {
                const { cid, type, isTyping } = payload;
                if (cid && type) await db.ref(`/chat/conversations/${type}/${cid}/members/${uid}/isTyping`).set(Boolean(isTyping));
                return res.status(200).json({ success: true });
            }

            case 'status': {
                const { status } = payload;
                if (status === 'online' || status === 'offline') {
                    await db.ref(`/chat/users/${uid}/status`).set(status);
                    await db.ref(`/chat/users/${uid}/lastSeen`).set(admin.database.ServerValue.TIMESTAMP);
                }
                return res.status(200).json({ success: true });
            }

            case 'startDM': {
                const { targetUid } = payload;
                if (!targetUid || targetUid === uid) return res.status(400).json({ error: "Invalid target." });

                const targetSnap = await db.ref(`/accounts/${targetUid}`).once('value');
                if (!targetSnap.exists()) return res.status(404).json({ error: "User not found." });

                const convosSnap = await db.ref(`/chat/conversations/dms`).once('value');
                const dms = convosSnap.val() || {};
                
                for (const [id, c] of Object.entries(dms)) {
                    if (c.members && c.members[uid] && c.members[targetUid]) return res.status(200).json({ cid: id }); 
                }

                // Generates random 6-digit ID for DMs
                let newCid;
                while (true) {
                    newCid = Math.floor(100000 + Math.random() * 900000).toString();
                    const check = await db.ref(`/chat/conversations/dms/${newCid}`).once('value');
                    if (!check.exists()) break;
                }

                await db.ref(`/chat/conversations/dms/${newCid}`).set({
                    config: { createdAt: Date.now(), lastMessageId: 99999 },
                    members: { [uid]: { role: 'member', isTyping: false }, [targetUid]: { role: 'member', isTyping: false } }
                });

                return res.status(200).json({ cid: newCid });
            }

            case 'createGroup': {
                const { name, joinCode, requireApproval, icon } = payload;
                if (!name || name.length < 3 || name.length > 30) return res.status(400).json({ error: "Group name must be 3-30 characters." });
                const groupNameModerationResponse = await rejectFlaggedContent(res, name, 'Group name');
                if (groupNameModerationResponse) return groupNameModerationResponse;

                const finalCode = joinCode || crypto.randomBytes(3).toString('hex').toUpperCase();
                
                // Group ID logic: URI Encoded Name ensures vanity URLs 
                const newCid = encodeURIComponent(name);
                const check = await db.ref(`/chat/conversations/gcs/${newCid}`).once('value');
                if (check.exists()) return res.status(400).json({ error: "A group with this name already exists." });

                await db.ref(`/chat/conversations/gcs/${newCid}`).set({
                    name: name,
                    config: { 
                        createdAt: Date.now(), 
                        lastMessageId: 99999, 
                        joinCode: finalCode, 
                        ownerUid: uid, 
                        requireJoinApproval: !!requireApproval, 
                        allowCustomNicknames: true, 
                        icon: icon || null 
                    },
                    members: { [uid]: { role: 'owner', isTyping: false } }
                });
                return res.status(200).json({ success: true, cid: newCid, joinCode: finalCode });
            }

            case 'joinGroup': {
                const { code } = payload;
                if (!code) return res.status(400).json({ error: "Missing invite code." });
                
                const gcsSnap = await db.ref('/chat/conversations/gcs').orderByChild('config/joinCode').equalTo(code.toUpperCase()).once('value');
                const gcs = gcsSnap.val() || {};
                
                const targetCid = Object.keys(gcs)[0];
                if (!targetCid) return res.status(404).json({ error: "Invalid invite code." });
                
                const group = gcs[targetCid];
                if (group.config?.requireJoinApproval) {
                    await db.ref(`/chat/conversations/gcs/${targetCid}/joinRequests/${uid}`).set({ username: account.username, displayName: account.displayName, timestamp: Date.now() });
                    return res.status(200).json({ success: true, requested: true });
                } else {
                    await db.ref(`/chat/conversations/gcs/${targetCid}/members/${uid}`).set({ role: 'member', isTyping: false });
                    return res.status(200).json({ success: true, cid: targetCid });
                }
            }

            case 'leaveGroup': {
                const { cid } = payload;
                const gcsSnap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = gcsSnap.val();
                
                if (!group || !group.members || !group.members[uid]) return res.status(404).json({ error: "Group not found or you are not a member." });
                
                await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}`).remove();
                
                const updatedMembers = { ...group.members };
                delete updatedMembers[uid];
                if (Object.keys(updatedMembers).length === 0) await db.ref(`/chat/conversations/gcs/${cid}`).remove();
                
                return res.status(200).json({ success: true });
            }

            case 'getGroupInfo': {
                const { cid } = payload;
                if (!cid) return res.status(400).json({ error: "Missing group CID" });
                const snap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = snap.val();
                if (!group) return res.status(404).json({ error: "Group not found" });
                
                return res.status(200).json({ 
                    name: group.name, 
                    icon: group.config?.icon, 
                    requireApproval: group.config?.requireJoinApproval, 
                    isMember: !!(group.members && group.members[uid]) 
                });
            }

            case 'groupAction': {
                const { cid, gAction, targetUid, value, configKey } = payload;
                if (!cid) return res.status(400).json({ error: "Missing CID" });

                const chSnap = await db.ref(`/chat/conversations/gcs/${cid}`).once('value');
                const group = chSnap.val();
                if (!group) return res.status(404).json({ error: "Group not found" });
                
                const myRole = group.members[uid]?.role || 'none';
                if (myRole === 'none' && gAction !== 'requestJoin' && gAction !== 'directJoin') return res.status(403).json({ error: "Not a member" });
                const isOwner = myRole === 'owner';
                const isMod = isOwner || myRole === 'moderator';

                switch (gAction) {
                    case 'rename':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        const groupTextModerationResponse = await rejectFlaggedContent(res, value, 'Group text');
                        if (groupTextModerationResponse) return groupTextModerationResponse;
                        await db.ref(`/chat/conversations/gcs/${cid}/name`).set(value);
                        break;
                    case 'updateConfig':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/${configKey}`).set(value);
                        break;
                    case 'updateIcon':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/icon`).set(value);
                        break;
                    case 'updateCode':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        let newCode = value || crypto.randomBytes(3).toString('hex').toUpperCase();
                        const check = await db.ref(`/chat/conversations/gcs`).orderByChild('config/joinCode').equalTo(newCode).once('value');
                        if (check.exists()) return res.status(400).json({ error: "Code already in use" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/joinCode`).set(newCode);
                        return res.status(200).json({ success: true, newCode: newCode });
                    case 'saveTheme':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        await db.ref(`/chat/conversations/gcs/${cid}/config/theme`).set(value);
                        break;
                    case 'kick':
                        if (!isMod) return res.status(403).json({ error: "Unauthorized" });
                        if (group.members[targetUid]?.role === 'owner') return res.status(403).json({ error: "Cannot kick owner" });
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}`).remove();
                        break;
                    case 'setRole':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        if (value === 'transfer') {
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}/role`).set('owner');
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}/role`).set('moderator');
                        } else {
                            await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}/role`).set(value);
                        }
                        break;
                    case 'saveNickname':
                        if (group.config?.allowCustomNicknames === false) return res.status(400).json({ error: "Nicknames disabled" });
                        if (value) {
                            const groupConfigModerationResponse = await rejectFlaggedContent(res, value, 'Group setting');
                            if (groupConfigModerationResponse) return groupConfigModerationResponse;
                        }
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}/nickname`).set(value || null);
                        break;
                    case 'requestJoin':
                        await db.ref(`/chat/conversations/gcs/${cid}/joinRequests/${uid}`).set({ username: account.username, displayName: account.displayName, timestamp: Date.now() });
                        break;
                    case 'directJoin':
                        await db.ref(`/chat/conversations/gcs/${cid}/members/${uid}`).set({ role: 'member', isTyping: false });
                        break;
                    case 'approveJoin':
                        if (!isOwner) return res.status(403).json({ error: "Unauthorized" });
                        if (value) await db.ref(`/chat/conversations/gcs/${cid}/members/${targetUid}`).set({ role: 'member', isTyping: false });
                        await db.ref(`/chat/conversations/gcs/${cid}/joinRequests/${targetUid}`).remove();
                        break;
                    default:
                        return res.status(400).json({ error: "Invalid group action" });
                }
                return res.status(200).json({ success: true });
            }

            case 'readReceipt': {
                const { cid, type, msgId } = payload;
                if (cid && type && msgId) {
                    await db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}/readReceipts/${uid}`).set(true);
                }
                return res.status(200).json({ success: true });
            }

            case 'getAttachment': {
                const { cid, type, msgId } = payload;
                if (!cid || !type || !msgId) return res.status(400).json({ error: "Missing parameters." });
                const channelSnap = await db.ref(`/chat/conversations/${type}/${cid}`).once('value');
                const channel = channelSnap.val();
                if (!channel || !channel.members || !channel.members[uid]) {
                    return res.status(403).json({ error: "Not a member of this conversation." });
                }
                const msgSnap = await db.ref(`/chat/conversations/${type}/${cid}/messages/${msgId}`).once('value');
                const msg = msgSnap.val();
                if (!msg) return res.status(404).json({ error: "Message not found" });
                if (msg.contentType === 'file' || msg.contentType === 'image') {
                    return res.status(403).json({ error: 'File and image attachments are disabled in chat.' });
                }
                let content = msg.content;
                let attachmentMimeType = null;
                if (content && typeof content === 'object' && content.type === 'media' && /^[a-f0-9]{64}$/.test(content.mediaId || '')) {
                    attachmentMimeType = content.mimeType || null;
                    content = `/api/media?id=${encodeURIComponent(content.mediaId)}`;
                } else if (typeof content === 'string' && content.startsWith('data:')) {
                    attachmentMimeType = content.slice(5).split(/[;,]/)[0] || null;
                }
                return res.status(200).json({ content, attachmentName: msg.attachmentName, attachmentMimeType });
            }

            case 'hideDM': {
                const { cid } = payload;
                if (!cid) return res.status(400).json({ error: "Missing CID." });
                await db.ref(`/accounts/${uid}/hidden_dms/${cid}`).set(true);
                return res.status(200).json({ success: true });
            }

            case 'unhideDM': {
                const { cid } = payload;
                if (!cid) return res.status(400).json({ error: "Missing CID." });
                await db.ref(`/accounts/${uid}/hidden_dms/${cid}`).remove();
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: "Unknown action." });
        }
    } catch (err) {
        console.error(`[BSMS Web :: Chat] Internal Error:`, err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
