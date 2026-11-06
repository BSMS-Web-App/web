/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Audio-only beta calling UI. LiveKit handles room signaling and media.
 */

(() => {
    'use strict';

    const API = '/api/voice';
    const POLL_INTERVAL = 5000;
    const context = () => window.BSMSChatContext || {};
    let configured = false;
    let livekit = null;
    let room = null;
    let currentCallId = null;
    let currentCall = null;
    let incomingCall = null;
    let muted = false;
    let polling = false;
    let pollTimer = null;
    let disconnecting = false;
    let durationTimer = null;

    const el = (id) => document.getElementById(id);

    function showPanel(name) {
        ['voiceSetupPanel', 'voiceIncomingPanel', 'voiceActivePanel'].forEach(id => {
            const node = el(id);
            if (node) node.hidden = id !== name;
        });
    }

    function showError(message) {
        const node = el('voiceError');
        if (!node) return;
        node.textContent = message || '';
        node.hidden = !message;
    }

    function sessionId() {
        return String(localStorage.getItem('session_id') || '').trim();
    }

    async function api(action, payload = {}) {
        const sid = sessionId();
        if (!sid) throw new Error('Your session has expired. Please sign in again.');
        const response = await fetch(API + '?action=' + encodeURIComponent(action), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sid
            },
            body: JSON.stringify(payload),
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Voice chat request failed.');
        return data;
    }

    function activeConversation() {
        const state = context();
        const cid = state.activeChannelId;
        const channel = cid ? state.channels?.[cid] : null;
        if (!cid || !channel) return null;
        const type = state.activeType || channel._type || (cid.startsWith('gc') ? 'gcs' : 'dms');
        if (!['dms', 'gcs'].includes(type)) return null;
        const name = type === 'gcs'
            ? (channel.name || 'Group chat')
            : (Object.keys(channel.members || {}).find(uid => uid !== state.user?.uid) || 'Direct message');
        return { cid, type, name };
    }

    function setConversationName(name) {
        if (el('voiceConversationName')) el('voiceConversationName').textContent = name || 'Conversation voice room';
    }

    function open() {
        showError('');
        const conversation = activeConversation();
        setConversationName(conversation?.name || 'No conversation selected');
        if (!conversation) {
            showPanel('voiceSetupPanel');
            showError('Open a direct message or group conversation before starting a call.');
        } else if (currentCallId) {
            showPanel('voiceActivePanel');
        } else if (incomingCall) {
            showIncoming(incomingCall);
        } else {
            showPanel('voiceSetupPanel');
        }
        if (el('voiceStartButton')) el('voiceStartButton').disabled = !configured || !conversation || Boolean(currentCallId);
        if (!configured && conversation) showError('Voice calling is not configured yet. The beta interface is ready, but the Mac voice server still needs setup.');
        el('voiceChatModal')?.classList.add('show');
    }

    function close() {
        el('voiceChatModal')?.classList.remove('show');
        showError('');
    }

    function showIncoming(call) {
        incomingCall = call;
        if (el('voiceCallerName')) el('voiceCallerName').textContent = call.callerName || 'A conversation member';
        if (el('voiceIncomingConversation')) el('voiceIncomingConversation').textContent = call.conversationName || 'Voice call';
        setConversationName(call.conversationName || 'Voice call');
        showPanel('voiceIncomingPanel');
        el('voiceChatModal')?.classList.add('show');
    }

    async function loadClient() {
        if (livekit) return livekit;
        if (!window.LivekitClient) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/dist/livekit-client.umd.min.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error('The voice calling client could not be loaded. Check whether this network allows the required service.'));
                document.head.appendChild(script);
            });
        }
        if (!window.LivekitClient?.Room) throw new Error('The voice calling client did not initialize.');
        livekit = window.LivekitClient;
        return livekit;
    }

    function updateParticipants() {
        const target = el('voiceParticipants');
        if (!target || !room) return;
        target.replaceChildren();
        const local = room.localParticipant;
        const people = [];
        if (local) people.push({ name: local.name || local.identity || 'You', local: true });
        room.remoteParticipants?.forEach(participant => {
            people.push({ name: participant.name || participant.identity || 'Participant', local: false });
        });
        people.forEach(person => {
            const chip = document.createElement('span');
            chip.className = 'voice-participant' + (person.local ? ' local' : '');
            const dot = document.createElement('span');
            dot.className = 'voice-participant-dot';
            const name = document.createElement('span');
            name.textContent = person.name + (person.local ? ' (you)' : '');
            chip.append(dot, name);
            target.appendChild(chip);
        });
        if (el('voiceCallStatusText')) {
            el('voiceCallStatusText').textContent = people.length + (people.length === 1 ? ' person connected' : ' people connected');
        }
    }

    function startDurationClock(startedAt) {
        if (durationTimer) window.clearInterval(durationTimer);
        const render = () => {
            const elapsed = Math.max(0, Math.floor((Date.now() - Number(startedAt || Date.now())) / 1000));
            const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const seconds = String(elapsed % 60).padStart(2, '0');
            if (el('voiceCallDuration')) el('voiceCallDuration').textContent = minutes + ':' + seconds;
        };
        render();
        durationTimer = window.setInterval(render, 1000);
    }

    function stopDurationClock() {
        if (durationTimer) window.clearInterval(durationTimer);
        durationTimer = null;
    }

    function attachAudio(track) {
        if (!track || !livekit || track.kind !== livekit.Track.Kind.Audio) return;
        const audio = track.attach();
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.voiceTrack = 'true';
        el('voiceAudioContainer')?.appendChild(audio);
        audio.play().catch(() => {});
    }

    function detachAudio(track) {
        if (!track) return;
        track.detach().forEach(node => node.remove());
    }

    async function connectCall(callId) {
        const auth = await api('token', { callId });
        const sdk = await loadClient();
        currentCallId = callId;
        room = new sdk.Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        disconnecting = false;
        room.on(sdk.RoomEvent.TrackSubscribed, (track) => attachAudio(track));
        room.on(sdk.RoomEvent.TrackUnsubscribed, (track) => detachAudio(track));
        room.on(sdk.RoomEvent.ParticipantConnected, updateParticipants);
        room.on(sdk.RoomEvent.ParticipantDisconnected, updateParticipants);
        room.on(sdk.RoomEvent.ActiveSpeakersChanged, updateParticipants);
        room.on(sdk.RoomEvent.Disconnected, () => {
            if (!disconnecting) handleUnexpectedDisconnect();
        });

        await room.connect(auth.url, auth.token, { autoSubscribe: true });
        await room.localParticipant.setMicrophoneEnabled(true);
        muted = false;
        if (el('voiceMuteButton')) el('voiceMuteButton').innerHTML = '<svg class="ic"><use href="#ico-mic"></use></svg><span>Mute</span>';
        if (el('voiceEndButton')) el('voiceEndButton').hidden = context().user?.uid !== currentCall?.createdBy;
        if (el('voiceActiveTitle')) el('voiceActiveTitle').textContent = currentCall?.conversationName || 'Voice call';
        setConversationName(currentCall?.conversationName || 'Voice call');
        showPanel('voiceActivePanel');
        showError('');
        updateParticipants();
        startDurationClock(currentCall?.createdAt);
        el('voiceChatModal')?.classList.add('show');
    }

    async function start() {
        const conversation = activeConversation();
        if (!conversation) return showError('Open a conversation before starting a voice call.');
        if (!configured) return showError('Voice calling is not configured yet. The beta interface is ready, but the Mac voice server still needs setup.');
        const button = el('voiceStartButton');
        if (button) { button.disabled = true; button.textContent = 'Starting…'; }
        showError('');
        try {
            const result = await api('start', conversation);
            currentCallId = result.callId;
            currentCall = { callId: result.callId, createdBy: context().user?.uid, conversationName: result.conversationName || conversation.name, createdAt: result.createdAt };
            await connectCall(result.callId);
        } catch (error) {
            if (currentCallId) {
                try { await api('end', { callId: currentCallId }); } catch {}
            }
            currentCallId = null;
            currentCall = null;
            showPanel('voiceSetupPanel');
            showError(error.message || 'Could not start the voice call.');
        } finally {
            if (button) { button.disabled = !configured; button.textContent = 'Start voice call'; }
        }
    }

    async function accept() {
        if (!incomingCall) return;
        const call = incomingCall;
        showError('');
        try {
            await api('accept', { callId: call.callId });
            currentCallId = call.callId;
            currentCall = {
                callId: call.callId,
                createdBy: call.callerUid,
                conversationName: call.conversationName,
                createdAt: call.createdAt
            };
            incomingCall = null;
            await connectCall(call.callId);
        } catch (error) {
            currentCallId = null;
            currentCall = null;
            incomingCall = null;
            showPanel('voiceSetupPanel');
            showError(error.message || 'Could not join the call.');
        }
    }

    async function decline() {
        if (!incomingCall) return;
        const call = incomingCall;
        incomingCall = null;
        try { await api('decline', { callId: call.callId }); } catch {}
        showPanel('voiceSetupPanel');
        showError('');
        close();
    }

    async function toggleMute() {
        if (!room) return;
        try {
            muted = !muted;
            await room.localParticipant.setMicrophoneEnabled(!muted);
            if (el('voiceMuteButton')) {
                el('voiceMuteButton').innerHTML = muted
                    ? '<svg class="ic"><use href="#ico-mic"></use></svg><span>Unmute</span>'
                    : '<svg class="ic"><use href="#ico-mic"></use></svg><span>Mute</span>';
            }
        } catch (error) {
            muted = !muted;
            showError(error.message || 'Could not change microphone state.');
        }
    }

    async function disconnectRoom() {
        disconnecting = true;
        if (room) {
            try { room.removeAllListeners(); } catch {}
            try { await room.disconnect(); } catch {}
            room = null;
        }
        el('voiceAudioContainer')?.replaceChildren();
    }

    async function leave() {
        const callId = currentCallId;
        stopDurationClock();
        await disconnectRoom();
        if (callId) {
            try { await api('leave', { callId }); } catch {}
        }
        currentCallId = null;
        currentCall = null;
        muted = false;
        showPanel('voiceSetupPanel');
        close();
    }

    async function endForEveryone() {
        const callId = currentCallId;
        if (!callId) return;
        try { await api('end', { callId }); } catch (error) { showError(error.message); return; }
        stopDurationClock();
        await disconnectRoom();
        currentCallId = null;
        currentCall = null;
        showPanel('voiceSetupPanel');
        close();
    }

    async function handleUnexpectedDisconnect() {
        const callId = currentCallId;
        stopDurationClock();
        await disconnectRoom();
        currentCallId = null;
        currentCall = null;
        if (callId) {
            try { await api('leave', { callId }); } catch {}
        }
        showPanel('voiceSetupPanel');
        showError('The voice connection ended. You can try joining again.');
    }

    async function poll() {
        if (polling || !context().user?.uid || !sessionId()) return;
        polling = true;
        try {
            const result = await api('poll');
            if (result.activeCall && !currentCallId) {
                currentCallId = result.activeCall.callId;
                currentCall = {
                    callId: result.activeCall.callId,
                    createdBy: result.activeCall.createdBy,
                    conversationName: result.activeCall.conversationName,
                    createdAt: result.activeCall.createdAt
                };
                await connectCall(currentCallId);
            } else if (!currentCallId && result.incoming?.length && !incomingCall) {
                showIncoming(result.incoming[0]);
            } else if (incomingCall && !result.incoming?.some(call => call.callId === incomingCall.callId)) {
                incomingCall = null;
                showPanel('voiceSetupPanel');
                showError('The call invitation is no longer available.');
            }
        } catch (error) {
            if (error.message?.includes('Unauthorized')) return;
            console.warn('[BSMS Voice] Poll failed:', error.message);
        } finally {
            polling = false;
        }
    }

    async function initialize() {
        try {
            const config = await api('config');
            configured = Boolean(config.enabled);
        } catch {
            configured = false;
        }
        if (el('voiceStartButton')) el('voiceStartButton').disabled = !configured;
        if (!pollTimer) {
            pollTimer = window.setInterval(poll, POLL_INTERVAL);
            poll();
        }
    }

    window.VoiceChatManager = {
        open,
        close,
        start,
        accept,
        decline,
        toggleMute,
        leave,
        endForEveryone
    };

    window.addEventListener('load', initialize, { once: true });
})();
