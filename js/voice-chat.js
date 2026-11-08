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
    let configurationReason = 'not_configured';
    let livekit = null;
    let room = null;
    let currentCallId = null;
    let currentCall = null;
    let currentCallAccepted = false;
    let acceptInProgress = false;
    let incomingCall = null;
    let outgoingCall = null;
    let pendingRejoinCall = null;
    let muted = false;
    let polling = false;
    let pollTimer = null;
    let disconnecting = false;
    let durationTimer = null;
    let betaNoticeDismissed = false;
    let miniCardDrag = null;
    let activeConversationType = 'dms';

    const el = (id) => document.getElementById(id);

    function showPanel(name) {
        ['voiceSetupPanel', 'voiceIncomingPanel', 'voiceOutgoingPanel', 'voiceRejoinPanel', 'voiceActivePanel'].forEach(id => {
            const node = el(id);
            if (!node) return;
            const shouldShow = id === name;
            node.hidden = !shouldShow;
            if (shouldShow) {
                node.classList.remove('voice-panel-enter');
                void node.offsetWidth;
                node.classList.add('voice-panel-enter');
            } else {
                node.classList.remove('voice-panel-enter');
            }
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
        if (!response.ok) {
            const error = new Error(data.error || 'Voice chat request failed.');
            error.status = response.status;
            error.action = action;
            throw error;
        }
        return data;
    }

    function activeConversation() {
        const state = context();
        const cid = state.activeChannelId;
        const channel = cid ? state.channels?.[cid] : null;
        if (!cid || !channel) return null;
        const type = state.activeType || channel._type || (cid.startsWith('gc') ? 'gcs' : 'dms');
        if (!['dms', 'gcs'].includes(type)) return null;
        const otherUid = Object.keys(channel.members || {}).find(uid => uid !== state.user?.uid);
        const otherAccount = otherUid ? state.accountsCache?.[otherUid] : null;
        const name = type === 'gcs'
            ? (channel.name || 'Group chat')
            : (otherAccount?.displayName || otherAccount?.name || otherAccount?.username || (otherUid ? '@' + otherUid : 'Direct message'));
        return { cid, type, name };
    }

    function setConversationName(name) {
        if (el('voiceConversationName')) el('voiceConversationName').textContent = name || 'Conversation voice room';
    }

    function open() {
        showError('');
        const conversation = activeConversation();
        setConversationName(conversation?.name || 'No conversation selected');
        if (conversation) activeConversationType = conversation.type;
        if (!conversation) {
            showPanel('voiceSetupPanel');
            showError('Open a direct message or group conversation before starting a call.');
        } else if (currentCallId) {
            showPanel('voiceActivePanel');
        } else if (outgoingCall) {
            showOutgoing(outgoingCall);
        } else if (pendingRejoinCall) {
            showPanel('voiceRejoinPanel');
        } else if (incomingCall) {
            showIncoming(incomingCall);
        } else {
            showPanel('voiceSetupPanel');
        }
        if (el('voiceStartButton')) {
            el('voiceStartButton').disabled = !conversation || (!configured && conversation.type !== 'gcs') || Boolean(currentCallId);
        }
        const setupDescription = el('voiceSetupDescription');
        if (setupDescription) {
            setupDescription.textContent = conversation?.type === 'gcs'
                ? 'Voice chat is not yet available for group chats.'
                : 'Start an audio call with the person in this direct message.';
        }
        if (!configured && conversation && conversation.type !== 'gcs') {
            const message = configurationReason === 'server_unreachable'
                ? 'The voice server is not reachable. Check that LiveKit is running on the Mac and that voice.bsms-web.com routes to it.'
                : configurationReason === 'api_unavailable'
                    ? 'The voice service could not be checked. Make sure the Mac-hosted BSMS API is online, then reload this page.'
                    : 'Voice calling is not configured yet. The beta interface is ready, but the Mac voice server still needs setup.';
            showError(message);
        }
        const modal = el('voiceChatModal');
        modal?.classList.remove('voice-modal-closing');
        modal?.classList.add('show');
        syncMiniCard();
    }

    function close() {
        const modal = el('voiceChatModal');
        showError('');
        if (modal?.classList.contains('show')) {
            modal.classList.remove('voice-modal-closing');
            modal.classList.add('voice-modal-closing');
            window.setTimeout(() => {
                modal.classList.remove('voice-modal-closing', 'show');
                syncMiniCard();
            }, 190);
        } else {
            syncMiniCard();
        }
    }

    function showBetaNotice() {
        const notice = el('voiceBetaNotice');
        if (!notice) return;
        notice.hidden = false;
        notice.classList.remove('is-closing');
        notice.classList.add('show');
    }

    function dismissBetaNotice() {
        betaNoticeDismissed = true;
        const notice = el('voiceBetaNotice');
        if (notice) {
            notice.classList.add('is-closing');
            window.setTimeout(() => {
                notice.classList.remove('show', 'is-closing');
                notice.hidden = true;
            }, 180);
        }
    }

    function syncMiniCard() {
        const card = el('voiceMiniCard');
        if (!card) return;
        const modalOpen = Boolean(el('voiceChatModal')?.classList.contains('show'));
        const active = Boolean(currentCallId && room);
        const shouldShow = active && !modalOpen;
        if (!shouldShow) {
            if (!card.hidden && !card.classList.contains('is-closing')) {
                card.classList.add('is-closing');
                window.setTimeout(() => {
                    if (el('voiceChatModal')?.classList.contains('show') || !currentCallId || !room) {
                        card.hidden = true;
                        card.classList.remove('is-closing');
                    }
                }, 160);
            } else if (card.hidden) {
                card.classList.remove('is-closing');
            }
            return;
        }
        card.hidden = false;
        card.classList.remove('is-closing');
        const name = currentCall?.conversationName || activeConversation()?.name || 'Voice call';
        if (el('voiceMiniName')) el('voiceMiniName').textContent = name;
        if (el('voiceMiniMute')) {
            el('voiceMiniMute').innerHTML = muted
                ? '<svg class="ic"><use href="#ico-mic"></use></svg>'
                : '<svg class="ic"><use href="#ico-mic"></use></svg>';
            el('voiceMiniMute').classList.toggle('is-muted', muted);
            el('voiceMiniMute').setAttribute('aria-label', muted ? 'Unmute microphone' : 'Mute microphone');
            el('voiceMiniMute').title = muted ? 'Unmute microphone' : 'Mute microphone';
        }
    }

    function setupMiniCardDragging() {
        const card = el('voiceMiniCard');
        const handle = card?.querySelector('.voice-mini-drag-handle');
        if (!card || !handle || handle.dataset.bound) return;
        handle.dataset.bound = 'true';
        handle.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            const rect = card.getBoundingClientRect();
            miniCardDrag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
            card.style.left = rect.left + 'px';
            card.style.top = rect.top + 'px';
            card.style.right = 'auto';
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!miniCardDrag || miniCardDrag.pointerId !== event.pointerId) return;
            const maxLeft = Math.max(8, window.innerWidth - card.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - card.offsetHeight - 8);
            card.style.left = Math.min(maxLeft, Math.max(8, event.clientX - miniCardDrag.offsetX)) + 'px';
            card.style.top = Math.min(maxTop, Math.max(8, event.clientY - miniCardDrag.offsetY)) + 'px';
        });
        const stop = event => {
            if (miniCardDrag?.pointerId === event.pointerId) miniCardDrag = null;
        };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
        window.addEventListener('resize', () => {
            if (card.hidden || !card.style.left) return;
            const rect = card.getBoundingClientRect();
            card.style.left = Math.min(window.innerWidth - card.offsetWidth - 8, Math.max(8, rect.left)) + 'px';
            card.style.top = Math.min(window.innerHeight - card.offsetHeight - 8, Math.max(8, rect.top)) + 'px';
        });
    }

    function expand() {
        if (!currentCallId) return;
        showPanel('voiceActivePanel');
        const modal = el('voiceChatModal');
        modal?.classList.remove('voice-modal-closing');
        modal?.classList.add('show');
        syncMiniCard();
    }

    function showOutgoing(call) {
        outgoingCall = call;
        if (el('voiceOutgoingName')) el('voiceOutgoingName').textContent = call.calleeName || 'The other person';
        if (el('voiceOutgoingConversation')) el('voiceOutgoingConversation').textContent = call.conversationName || 'Direct message';
        showPanel('voiceOutgoingPanel');
        const modal = el('voiceChatModal');
        modal?.classList.remove('voice-modal-closing');
        modal?.classList.add('show');
        syncMiniCard();
    }

    async function cancelOutgoing() {
        if (!outgoingCall) return;
        const call = outgoingCall;
        try {
            await api('cancel', { callId: call.callId });
            outgoingCall = null;
            showPanel('voiceSetupPanel');
            close();
        } catch (error) {
            showError(error.message || 'Could not cancel the call.');
        }
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
        const groupSection = el('voiceGroupPeopleSection');
        if (groupSection) groupSection.hidden = activeConversationType !== 'gcs';
        const status = el('voiceCallStatusText');
        if (status) status.textContent = activeConversationType === 'gcs'
            ? people.length + (people.length === 1 ? ' person connected' : ' people connected')
            : '';
    }

    function startDurationClock(startedAt) {
        if (durationTimer) window.clearInterval(durationTimer);
        const render = () => {
            const elapsed = Math.max(0, Math.floor((Date.now() - Number(startedAt || Date.now())) / 1000));
            const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const seconds = String(elapsed % 60).padStart(2, '0');
            const formatted = minutes + ':' + seconds;
            if (el('voiceCallDuration')) el('voiceCallDuration').textContent = formatted;
            if (el('voiceMiniDuration')) el('voiceMiniDuration').textContent = formatted;
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

    async function presentActiveCall() {
        muted = false;
        if (el('voiceMuteButton')) el('voiceMuteButton').innerHTML = '<svg class="ic"><use href="#ico-mic"></use></svg><span>Mute</span>';
        if (el('voiceActiveTitle')) el('voiceActiveTitle').textContent = 'In call';
        if (el('voiceActiveName')) el('voiceActiveName').textContent = currentCall?.conversationName || 'Voice call';
        setConversationName(currentCall?.conversationName || 'Voice call');
        showPanel('voiceActivePanel');
        showError('');
        updateParticipants();
        startDurationClock(currentCall?.createdAt);
        syncMiniCard();
        setupMiniCardDragging();
        const modal = el('voiceChatModal');
        modal?.classList.remove('voice-modal-closing');
        modal?.classList.add('show');
        syncMiniCard();
        if (room && !room.canPlaybackAudio) room.startAudio().catch(() => {});
    }

    async function connectCall(callId, options = {}) {
        const deferActivation = Boolean(options.deferActivation);
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
        room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => {
            if (!room?.canPlaybackAudio) room.startAudio().catch(() => {});
        });
        room.on(sdk.RoomEvent.Disconnected, () => {
            if (!disconnecting) handleUnexpectedDisconnect();
        });

        try {
            await room.connect(auth.url, auth.token, { autoSubscribe: true });
            // Joining the transport is not the same as answering. Keep the
            // microphone disabled until the server confirms explicit acceptance.
            await room.localParticipant.setMicrophoneEnabled(!deferActivation);
            if (deferActivation) {
                updateParticipants();
                return;
            }
        } catch (error) {
            console.error('[BSMS Voice] LiveKit connection failed:', {
                callId,
                status: error?.status || null,
                message: error?.message || String(error)
            });
            await disconnectRoom();
            currentCallId = null;
            throw error;
        }
        await presentActiveCall();
    }
    async function start() {
        const conversation = activeConversation();
        if (!conversation) return showError('Open a conversation before starting a voice call.');
        if (conversation.type === 'gcs') {
            if (typeof UI !== 'undefined' && UI.showConfirm) {
                UI.showConfirm(
                    'Voice chat is not yet available for group chats.',
                    [{ text: 'Got it', sec: true }],
                    'Voice chat unavailable'
                );
            } else {
                showError('Voice chat is not yet available for group chats.');
            }
            return;
        }
        showBetaNotice();
        if (!configured) return showError('Voice calling is not configured yet. The beta interface is ready, but the Mac voice server still needs setup.');
        const button = el('voiceStartButton');
        let startedCallId = null;
        if (button) { button.disabled = true; button.textContent = 'Starting…'; }
        showError('');
        try {
            const result = await api('start', conversation);
            startedCallId = result.callId;
            if (conversation.type === 'dms') {
                showOutgoing({
                    callId: result.callId,
                    type: 'dms',
                    cid: conversation.cid,
                    calleeName: result.calleeName || conversation.name,
                    conversationName: result.conversationName || conversation.name,
                    createdAt: result.createdAt
                });
            } else {
                currentCallId = result.callId;
                currentCall = { callId: result.callId, createdBy: context().user?.uid, conversationName: result.conversationName || conversation.name, createdAt: result.createdAt };
                await connectCall(result.callId);
            }
        } catch (error) {
            if (startedCallId) {
                try { await api('end', { callId: startedCallId }); } catch {}
            }
            currentCallId = null;
            currentCall = null;
            outgoingCall = null;
            syncMiniCard();
            showPanel('voiceSetupPanel');
            showError(error.message || 'Could not start the voice call.');
        } finally {
            if (button) { button.disabled = !configured; button.textContent = 'Start voice call'; }
        }
    }

    async function rejoin() {
        if (!pendingRejoinCall) return;
        const call = pendingRejoinCall;
        currentCall = {
            callId: call.callId,
            createdBy: call.createdBy,
            conversationName: call.conversationName,
            createdAt: call.createdAt
        };
        currentCallId = call.callId;
        currentCallAccepted = true;
        pendingRejoinCall = null;
        try {
            await connectCall(call.callId);
        } catch (error) {
            currentCallId = null;
            currentCall = null;
            currentCallAccepted = false;
            showPanel('voiceRejoinPanel');
            pendingRejoinCall = call;
            showError(error.message || 'Could not rejoin the voice call.');
        }
    }

    async function accept() {
        if (!incomingCall || acceptInProgress) return;
        acceptInProgress = true;
        const call = incomingCall;
        const joinButton = el('voiceIncomingPanel')?.querySelector('.voice-primary-btn');
        if (joinButton) {
            joinButton.disabled = true;
            joinButton.textContent = 'Joining…';
        }
        showError('');
        activeConversationType = 'dms';
        incomingCall = null;
        currentCallId = call.callId;
        currentCallAccepted = false;
        currentCall = {
            callId: call.callId,
            createdBy: call.callerUid,
            conversationName: call.conversationName,
            createdAt: Date.now()
        };

        let acceptedByServer = false;
        try {
            // The invited recipient may receive a temporary LiveKit token while ringing.
            // Connect the recipient first, then mark the call active only after LiveKit
            // confirms the recipient has actually joined. This prevents auto-answering.
            await connectCall(call.callId, { deferActivation: true });
            const accepted = await api('accept', { callId: call.callId });
            acceptedByServer = true;
            currentCallAccepted = true;
            currentCall.createdAt = accepted.connectedAt || Date.now();
            if (!room || !currentCallId) throw new Error('The voice connection ended before the call could be accepted.');
            await room.localParticipant.setMicrophoneEnabled(true);
            outgoingCall = null;
            await presentActiveCall();
        } catch (error) {
            stopDurationClock();
            await disconnectRoom();
            currentCallId = null;
            currentCall = null;
            currentCallAccepted = false;
            // If the server never activated this call, do not send "leave":
            // the recipient is not an active participant yet. Decline it instead.
            if (!acceptedByServer) {
                try { await api('decline', { callId: call.callId }); } catch {}
            } else {
                try { await api('leave', { callId: call.callId }); } catch {}
            }
            showPanel('voiceSetupPanel');
            showError(error.message || 'Could not join the call.');
        } finally {
            acceptInProgress = false;
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.textContent = 'Join call';
            }
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

    async function enableAudio() {
        if (!room) return;
        try {
            await room.startAudio();
            if (el('voiceEnableAudioButton')) el('voiceEnableAudioButton').hidden = true;
        } catch (error) {
            showError(error.message || 'Audio playback could not be started.');
        }
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
            syncMiniCard();
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
        pendingRejoinCall = null;
        muted = false;
        syncMiniCard();
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
        pendingRejoinCall = null;
        syncMiniCard();
        showPanel('voiceSetupPanel');
        close();
    }

    async function handleUnexpectedDisconnect() {
        const callId = currentCallId;
        const wasAccepted = currentCallAccepted;
        stopDurationClock();
        await disconnectRoom();
        currentCallId = null;
        currentCall = null;
        currentCallAccepted = false;
        syncMiniCard();
        // A ringing invitee is not a participant. Never send leave until the
        // explicit accept action has committed on the server.
        if (callId && wasAccepted) {
            try { await api('leave', { callId }); } catch {}
        } else if (callId && !acceptInProgress) {
            try { await api('decline', { callId }); } catch {}
        }
        showPanel('voiceSetupPanel');
        showError('The voice connection ended. You can try joining again.');
    }
    async function poll() {
        if (polling || !context().user?.uid || !sessionId()) return;
        polling = true;
        try {
            const result = await api('poll');

            if (currentCallId && result.endedCallIds?.includes(currentCallId)) {
                const panelWasOpen = Boolean(el('voiceChatModal')?.classList.contains('show'));
                stopDurationClock();
                await disconnectRoom();
                currentCallId = null;
                currentCall = null;
                pendingRejoinCall = null;
                muted = false;
                syncMiniCard();
                if (panelWasOpen) {
                    showPanel('voiceSetupPanel');
                    showError('The other person ended the call.');
                } else if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast('The other person ended the call.');
                }
                return;
            }

            if (outgoingCall && result.endedCallIds?.includes(outgoingCall.callId)) {
                const reason = result.endedCallReasons?.[outgoingCall.callId] || 'ended';
                const message = reason === 'declined'
                    ? 'The recipient declined your call.'
                    : reason === 'no_answer'
                        ? 'The recipient didn’t answer within 10 seconds.'
                        : 'The call ended before it was answered.';
                const panelWasOpen = Boolean(el('voiceChatModal')?.classList.contains('show'));
                outgoingCall = null;
                if (panelWasOpen) {
                    showPanel('voiceSetupPanel');
                    showError(message);
                } else if (typeof UI !== 'undefined' && UI.showToast) {
                    UI.showToast(message);
                }
            }

            if (result.activeCall && !currentCallId) {
                if (outgoingCall?.callId === result.activeCall.callId) {
                    currentCall = {
                        callId: result.activeCall.callId,
                        createdBy: result.activeCall.createdBy,
                        conversationName: result.activeCall.conversationName,
                        createdAt: result.activeCall.createdAt
                    };
                    currentCallId = result.activeCall.callId;
                    outgoingCall = null;
                    await connectCall(currentCallId);
                } else if (!pendingRejoinCall) {
                    pendingRejoinCall = result.activeCall;
                    showPanel('voiceRejoinPanel');
                    const modal = el('voiceChatModal');
                    modal?.classList.remove('voice-modal-closing');
                    modal?.classList.add('show');
                    syncMiniCard();
                }
            } else if (!result.activeCall && pendingRejoinCall) {
                pendingRejoinCall = null;
                showPanel('voiceSetupPanel');
            }

            if (outgoingCall && !result.activeCall) {
                if (result.outgoingCall?.callId === outgoingCall.callId) {
                    if (!el('voiceChatModal')?.classList.contains('show')) showOutgoing(outgoingCall);
                } else {
                    const panelWasOpen = Boolean(el('voiceChatModal')?.classList.contains('show'));
                    outgoingCall = null;
                    if (panelWasOpen) {
                        showPanel('voiceSetupPanel');
                        showError('The call ended before it was answered.');
                    } else if (typeof UI !== 'undefined' && UI.showToast) {
                        UI.showToast('The call ended before it was answered.');
                    }
                }
            }

            if (!currentCallId && !outgoingCall && !pendingRejoinCall && result.incoming?.length && !incomingCall) {
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
            configurationReason = config.reason || (configured ? '' : 'not_configured');
        } catch {
            configured = false;
            configurationReason = 'api_unavailable';
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
        rejoin,
        cancelOutgoing,
        decline,
        toggleMute,
        enableAudio,
        leave,
        endForEveryone,
        expand,
        dismissBetaNotice
    };

    window.addEventListener('load', () => {
        setupMiniCardDragging();
        initialize();
    }, { once: true });
})();
