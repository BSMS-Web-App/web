/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Authenticated voice-call orchestration and LiveKit token issuance.
 */

import crypto from 'node:crypto';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db, requestMacApi } from './db.js';
import { legalAcceptanceRequired } from './legal-policy.js';

const MAX_CALL_PARTICIPANTS = 20;
const RING_TIMEOUT_MS = 10 * 1000;
const MAX_CALL_AGE_MS = 6 * 60 * 60 * 1000;

function cleanId(value, max = 128) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= max ? id : null;
}

function response(res, status, body) {
    return res.status(status).json(body);
}

async function authenticate(sessionId) {
    if (!sessionId || !db) return null;
    try {
        const session = await requestMacApi('GET', '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId));
        if (!session?.uid) return null;
        const snapshot = await db.ref('/accounts/' + session.uid).once('value');
        const account = snapshot.val();
        if (!account || account.account_status === 'banned' || account.account_status === 'deleted') return null;
        if (legalAcceptanceRequired(account)) return { legalRequired: true };
        return { uid: session.uid, account };
    } catch {
        return null;
    }
}

async function getConversation(type, cid) {
    if (!['dms', 'gcs'].includes(type) || !cleanId(cid)) return null;
    const snapshot = await db.ref('/chat/conversations/' + type + '/' + cid).once('value');
    return snapshot.val();
}

async function getCall(callId) {
    if (!cleanId(callId)) return null;
    const snapshot = await db.ref('/voice/calls/' + callId).once('value');
    return snapshot.val();
}

async function addUserCall(uid, callId) {
    await db.ref('/voice/userCalls/' + uid + '/' + callId).set(Date.now());
}

async function removeUserCall(uid, callId) {
    await db.ref('/voice/userCalls/' + uid + '/' + callId).remove();
}

async function expireCall(callId, call, reason = 'ended') {
    if (!call || call.status === 'ended') return;
    await db.ref('/voice/calls/' + callId + '/endReason').set(reason);
    await db.ref('/voice/calls/' + callId + '/status').set('ended');
    const participants = Object.keys(call.participants || {});
    const invited = Object.keys(call.invited || {});
    const affectedUsers = [...new Set([call.createdBy, ...participants, ...invited].filter(Boolean))];
    await Promise.all(affectedUsers.map(uid =>
        db.ref('/voice/endedCalls/' + uid + '/' + callId).set({ at: Date.now(), reason })
    ));
    try {
        const livekitUrl = String(process.env.LIVEKIT_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/+$/, '');
        if (livekitUrl && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && call.roomName) {
            const roomService = new RoomServiceClient(livekitUrl, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET);
            await roomService.deleteRoom(call.roomName);
        }
    } catch (error) {
        console.warn('[BSMS Voice] Could not close LiveKit room:', error.message);
    }
    await Promise.all([
        ...affectedUsers.map(uid => removeUserCall(uid, callId)),
        ...invited.map(uid => db.ref('/voice/invitations/' + uid + '/' + callId).remove())
    ]);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return response(res, 405, { error: 'Method not allowed.' });
    if (!db) return response(res, 503, { error: 'Voice services are not configured.' });

    const auth = await authenticate(req.headers['x-session-id']);
    if (!auth) return response(res, 401, { error: 'Unauthorized session.' });
    if (auth.legalRequired) return response(res, 428, { error: 'Legal policy acceptance is required.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });

    const { uid, account } = auth;
    const action = String(req.query.action || req.body?.action || '');
    const payload = req.body || {};

    try {
        if (action === 'config') {
            const livekitUrl = String(process.env.LIVEKIT_URL || '').trim().replace(/\/+$/, '');
            const apiKey = process.env.LIVEKIT_API_KEY;
            const apiSecret = process.env.LIVEKIT_API_SECRET;
            const configured = Boolean(livekitUrl.startsWith('wss://') && apiKey && apiSecret);

            if (!configured) {
                return response(res, 200, { enabled: false, beta: true, reason: 'not_configured' });
            }

            // Verify the Mac-hosted LiveKit service is reachable before enabling the UI.
            try {
                const httpUrl = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
                const roomService = new RoomServiceClient(httpUrl, apiKey, apiSecret);
                await roomService.listRooms();
                return response(res, 200, { enabled: true, beta: true, livekitUrl });
            } catch (error) {
                console.warn('[BSMS Voice] LiveKit readiness check failed:', error.message);
                return response(res, 200, { enabled: false, beta: true, reason: 'server_unreachable' });
            }
        }

        if (action === 'poll') {
            const invitationSnapshot = await db.ref('/voice/invitations/' + uid).once('value');
            const invitationMap = invitationSnapshot.val() || {};
            const incoming = [];
            for (const callId of Object.keys(invitationMap).slice(0, 10)) {
                const call = await getCall(callId);
                if (!call || call.status === 'ended') {
                    await db.ref('/voice/invitations/' + uid + '/' + callId).remove();
                    continue;
                }
                if (call.status === 'ringing' && Number(call.ringExpiresAt || 0) < Date.now()) {
                    await expireCall(callId, call, 'no_answer');
                    continue;
                }
                if (!['ringing', 'active'].includes(call.status)) {
                    await db.ref('/voice/invitations/' + uid + '/' + callId).remove();
                    continue;
                }
                const conversation = await getConversation(call.type, call.cid);
                if (!conversation?.members?.[uid]) {
                    await db.ref('/voice/invitations/' + uid + '/' + callId).remove();
                    continue;
                }
                incoming.push({
                    callId,
                    type: call.type,
                    cid: call.cid,
                    callerUid: call.createdBy,
                    callerName: call.callerName || call.createdBy,
                    conversationName: call.conversationName || 'Chat',
                    createdAt: call.createdAt
                });
            }

            const endedSnapshot = await db.ref('/voice/endedCalls/' + uid).once('value');
            const endedMap = endedSnapshot.val() || {};
            const endedCallIds = Object.keys(endedMap);
            const endedCallReasons = {};
            for (const id of endedCallIds) {
                const value = endedMap[id];
                endedCallReasons[id] = value && typeof value === 'object' ? value.reason || 'ended' : 'ended';
            }
            if (endedCallIds.length) {
                await Promise.all(endedCallIds.map(id => db.ref('/voice/endedCalls/' + uid + '/' + id).remove()));
            }

            const activeSnapshot = await db.ref('/voice/userCalls/' + uid).once('value');
            const activeMap = activeSnapshot.val() || {};
            let activeCall = null;
            let outgoingCall = null;
            for (const callId of Object.keys(activeMap).slice(0, 5)) {
                const call = await getCall(callId);
                if (!call || call.status === 'ended') {
                    await removeUserCall(uid, callId);
                    continue;
                }
                if (call.status === 'ringing' && Number(call.ringExpiresAt || 0) < Date.now()) {
                    await expireCall(callId, call, 'no_answer');
                    continue;
                }
                if (Number(call.expiresAt || 0) < Date.now()) {
                    await expireCall(callId, call, 'expired');
                    continue;
                }
                if (call.type === 'dms' && call.status === 'ringing' && call.createdBy === uid) {
                    outgoingCall = {
                        callId,
                        type: call.type,
                        cid: call.cid,
                        conversationName: call.conversationName || 'Direct message',
                        calleeName: call.calleeName || 'The other person',
                        createdAt: call.createdAt,
                        ringExpiresAt: call.ringExpiresAt
                    };
                }
                if (call.participants?.[uid]) {
                    activeCall = {
                        callId,
                        type: call.type,
                        cid: call.cid,
                        roomName: call.roomName,
                        createdBy: call.createdBy,
                        conversationName: call.conversationName || 'Chat',
                        participants: Object.keys(call.participants || {}),
                        createdAt: call.connectedAt || call.createdAt
                    };
                    break;
                }
            }
            return response(res, 200, { incoming, activeCall, outgoingCall, endedCallIds, endedCallReasons });
        }

        if (action === 'start') {
            const cid = cleanId(payload.cid);
            const type = String(payload.type || '');
            if (!cid || !['dms', 'gcs'].includes(type)) return response(res, 400, { error: 'Invalid conversation.' });
            if (type === 'gcs') {
                return response(res, 409, {
                    error: 'Voice chat is not yet available for group chats.',
                    code: 'GROUP_VOICE_UNAVAILABLE'
                });
            }
            const conversation = await getConversation(type, cid);
            if (!conversation?.members?.[uid]) return response(res, 403, { error: 'You are not a member of this conversation.' });

            const memberIds = Object.keys(conversation.members || {});
            if (memberIds.length < 2) return response(res, 400, { error: 'At least two conversation members are required.' });
            if (memberIds.length > MAX_CALL_PARTICIPANTS) return response(res, 400, { error: 'This conversation has too many members for a voice call.' });

            const currentCalls = await db.ref('/voice/userCalls/' + uid).once('value');
            for (const existingCallId of Object.keys(currentCalls.val() || {})) {
                const existingCall = await getCall(existingCallId);
                if (!existingCall || existingCall.status === 'ended') {
                    await removeUserCall(uid, existingCallId);
                } else if (Number(existingCall.expiresAt || 0) < Date.now() ||
                    (existingCall.status === 'ringing' && Number(existingCall.ringExpiresAt || 0) < Date.now())) {
                    await expireCall(existingCallId, existingCall);
                } else {
                    return response(res, 409, { error: 'You are already in a voice call.' });
                }
            }

            const callId = crypto.randomUUID().replace(/-/g, '');
            const now = Date.now();
            const callerName = account.displayName || account.username || uid;
            let conversationName = conversation.name || 'Group chat';
            let otherUid = null;
            let otherName = null;
            if (type === 'dms') {
                otherUid = memberIds.find(id => id !== uid);
                const presenceSnapshot = await db.ref('/chat/users/' + otherUid).once('value');
                const presence = presenceSnapshot.val() || {};
                const lastSeen = Number(presence.lastSeen);
                const presenceAge = Date.now() - lastSeen;
                const online = presence.status === 'online' &&
                    Number.isFinite(lastSeen) &&
                    lastSeen > 0 &&
                    presenceAge >= 0 &&
                    presenceAge <= 20000;
                if (!online) {
                    return response(res, 409, {
                        error: 'This person is currently offline. You can only call someone who is online.',
                        code: 'USER_OFFLINE'
                    });
                }

                const otherAccountSnapshot = await db.ref('/accounts/' + otherUid).once('value');
                const otherAccount = otherAccountSnapshot.val() || {};
                otherName = otherAccount.displayName || otherAccount.username || 'Direct message';
                conversationName = callerName + ' and ' + otherName;
            }
            const invited = {};
            for (const memberId of memberIds) if (memberId !== uid) invited[memberId] = true;

            const call = {
                callId,
                cid,
                type,
                roomName: 'bsms-' + callId,
                createdBy: uid,
                callerName,
                calleeName: otherName,
                conversationName,
                status: 'ringing',
                createdAt: now,
                ringExpiresAt: now + RING_TIMEOUT_MS,
                expiresAt: now + MAX_CALL_AGE_MS,
                participants: type === 'dms' ? {} : { [uid]: { joinedAt: now } },
                invited
            };
            await db.ref('/voice/calls/' + callId).set(call);
            await addUserCall(uid, callId);
            await Promise.all(Object.keys(invited).map(memberId =>
                db.ref('/voice/invitations/' + memberId + '/' + callId).set({ createdAt: now })
            ));
            return response(res, 200, { success: true, callId, conversationName, createdAt: now, type, calleeName: otherName });
        }

        const callId = cleanId(payload.callId);
        if (!callId) return response(res, 400, { error: 'A valid call ID is required.' });
        const call = await getCall(callId);
        if (!call) return response(res, 404, { error: 'Call not found.' });

        const conversation = await getConversation(call.type, call.cid);
        if (!conversation?.members?.[uid]) return response(res, 403, { error: 'You are not a member of this conversation.' });

        if (action === 'cancel') {
            if (call.createdBy !== uid || call.status !== 'ringing') {
                return response(res, 403, { error: 'Only the caller can cancel an unanswered call.' });
            }
            await expireCall(callId, call, 'cancelled');
            return response(res, 200, { success: true });
        }

        if (action === 'accept') {
            if (call.type !== 'dms' || call.createdBy === uid || !call.invited?.[uid]) {
                return response(res, 403, { error: 'This invitation is not for your account.' });
            }
            const invitation = await db.ref('/voice/invitations/' + uid + '/' + callId).once('value');
            if (!invitation.val() || call.status !== 'ringing' || Number(call.ringExpiresAt || 0) < Date.now()) {
                return response(res, 410, { error: 'This call invitation has expired.' });
            }
            const currentCalls = await db.ref('/voice/userCalls/' + uid).once('value');
            if (Object.keys(currentCalls.val() || {}).length) {
                return response(res, 409, { error: 'You are already in a voice call.' });
            }

            // Only activate the call after the invited recipient has connected to LiveKit.
            // A transaction prevents duplicate/late answers from marking an ended call active.
            const joinedAt = Date.now();
            const callRef = db.ref('/voice/calls/' + callId);
            const transaction = await callRef.transaction(current => {
                if (
                    !current ||
                    current.type !== 'dms' ||
                    current.createdBy === uid ||
                    current.status !== 'ringing' ||
                    Number(current.ringExpiresAt || 0) < joinedAt ||
                    !current.invited?.[uid] ||
                    Object.keys(current.participants || {}).length
                ) return current;

                const participants = { ...(current.participants || {}) };
                participants[current.createdBy] = { joinedAt };
                participants[uid] = { joinedAt };
                const invited = { ...(current.invited || {}) };
                delete invited[uid];

                return {
                    ...current,
                    status: 'active',
                    connectedAt: joinedAt,
                    expiresAt: joinedAt + MAX_CALL_AGE_MS,
                    participants,
                    invited
                };
            });

            const acceptedCall = transaction.snapshot?.val();
            if (
                !transaction.committed ||
                acceptedCall?.connectedAt !== joinedAt ||
                !acceptedCall?.participants?.[uid] ||
                !acceptedCall?.participants?.[call.createdBy]
            ) {
                return response(res, 410, { error: 'This call is no longer available to answer.' });
            }

            await Promise.all([
                db.ref('/voice/invitations/' + uid + '/' + callId).remove(),
                addUserCall(call.createdBy, callId),
                addUserCall(uid, callId)
            ]);
            return response(res, 200, { success: true, connectedAt: joinedAt });
        }

        if (action === 'decline') {
            if (call.type === 'dms') {
                if (!call.invited?.[uid]) return response(res, 403, { error: 'This invitation is not for your account.' });
                if (call.status !== 'ringing' || Number(call.ringExpiresAt || 0) < Date.now()) {
                    return response(res, 410, { error: 'This call is no longer available.' });
                }
                await expireCall(callId, call, 'declined');
                return response(res, 200, { success: true });
            }
            await db.ref('/voice/invitations/' + uid + '/' + callId).remove();
            await db.ref('/voice/calls/' + callId + '/invited/' + uid).remove();
            const pendingInvites = await db.ref('/voice/calls/' + callId + '/invited').once('value');
            const participants = await db.ref('/voice/calls/' + callId + '/participants').once('value');
            if (!Object.keys(pendingInvites.val() || {}).length && Object.keys(participants.val() || {}).length <= 1) {
                await expireCall(callId, call);
            }
            return response(res, 200, { success: true });
        }

        if (action === 'token') {
            const isActiveParticipant = Boolean(call.participants?.[uid]);
            const isInvitedDmRecipient = call.type === 'dms' &&
                call.status === 'ringing' &&
                call.createdBy !== uid &&
                Boolean(call.invited?.[uid]) &&
                Number(call.ringExpiresAt || 0) >= Date.now();
            if (
                call.status === 'ended' ||
                Number(call.expiresAt || 0) < Date.now() ||
                (!isActiveParticipant && !isInvitedDmRecipient)
            ) {
                return response(res, 403, { error: 'You are not authorized to join this voice call.' });
            }
            const apiKey = process.env.LIVEKIT_API_KEY;
            const apiSecret = process.env.LIVEKIT_API_SECRET;
            const livekitUrl = String(process.env.LIVEKIT_URL || '').trim();
            if (!apiKey || !apiSecret || !livekitUrl.startsWith('wss://')) {
                return response(res, 503, { error: 'Voice calling has not been configured yet.' });
            }
            const token = new AccessToken(apiKey, apiSecret, {
                identity: uid,
                name: account.displayName || account.username || uid,
                ttl: '1h'
            });
            token.addGrant({
                roomJoin: true,
                room: call.roomName,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true
            });
            return response(res, 200, { token: await token.toJwt(), url: livekitUrl, roomName: call.roomName });
        }

        if (action === 'leave') {
            if (call.type === 'dms') {
                if (!call.participants?.[uid]) return response(res, 403, { error: 'You are not an active participant in this call.' });
                await expireCall(callId, call);
                return response(res, 200, { success: true });
            }
            await db.ref('/voice/calls/' + callId + '/participants/' + uid).remove();
            await removeUserCall(uid, callId);
            const remaining = await db.ref('/voice/calls/' + callId + '/participants').once('value');
            if (!Object.keys(remaining.val() || {}).length) await expireCall(callId, call);
            return response(res, 200, { success: true });
        }

        if (action === 'end') {
            if (call.type === 'dms' && call.createdBy === uid && call.status === 'ringing') {
                await expireCall(callId, call);
                return response(res, 200, { success: true });
            }
            if (!call.participants?.[uid]) return response(res, 403, { error: 'Only a current call participant can end this call.' });
            await expireCall(callId, call);
            return response(res, 200, { success: true });
        }

        return response(res, 400, { error: 'Unknown voice action.' });
    } catch (error) {
        console.error('[BSMS Voice]', error);
        return response(res, 500, { error: 'Voice request failed. Please try again.' });
    }
}
