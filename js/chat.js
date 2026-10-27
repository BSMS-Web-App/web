/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

window.addEventListener('offline', () => document.getElementById('offlineBanner').classList.add('show'));
window.addEventListener('online', () => document.getElementById('offlineBanner').classList.remove('show'));
if (!navigator.onLine) document.getElementById('offlineBanner').classList.add('show');

const BOT_UID = "bsms_web_system";
const BOT_PFP = "https://uploads.onecompiler.io/44jajt6dm/1789516766282/bsms-web-pfp.png";

const State = {
    user: null,
    channels: {},
    activeType: null,
    activeChannelId: null,
    currentRole: 'member',
    usersCache: {},
    accountsCache: {},

    isScrolledUp: false,
    lastRenderedDate: null,
    searchTimeout: null,
    inviteSearchTimeout: null,
    typingTimeout: null,
    toastTimeout: null,
    dmBanTimer: null,

    isCooldown: false,
    isTypingEmitted: false,
    editContext: null,
    replyContext: null,
    attachmentData: null,
    attachmentName: null,

    hiddenDms: [],
    conversationCache: {},

    pendingRoute: null,
    syncInterval: null,
    msgInterval: null
};

document.addEventListener('error', (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.fallbackApplied === '1') return;
    img.dataset.fallbackApplied = '1';
    const avatar = img.closest('.c-av-inner');
    if (!avatar) {
        img.remove();
        return;
    }
    const owner = img.closest('[data-uid]');
    const uid = owner?.getAttribute('data-uid');
    const account = uid ? State.accountsCache?.[uid] : null;
    const label = account?.displayName || account?.username || '?';
    avatar.textContent = String(label).trim().charAt(0).toUpperCase() || '?';
}, true);

const ImageViewer = {
    open: function(src) {
        if (!src) return;
        const modal = document.getElementById('imageViewerModal');
        const img = document.getElementById('imageViewerImg');
        if (!modal || !img) return;
        img.src = src;
        modal.classList.add('show');
    },
    close: function() {
        const modal = document.getElementById('imageViewerModal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            const img = document.getElementById('imageViewerImg');
            if (img) img.src = '';
        }, 200);
    }
};
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('imageViewerModal')?.classList.contains('show')) {
        ImageViewer.close();
    }
});

const Utils = {
    escapeHTML: (str) => {
        if(typeof str !== 'string') return '';
        return str.replace(/[&<>'"]/g, t => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[t]));
    },
    extractUrls: (text) => {
        if (!text || typeof text !== 'string') return [];
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
        const matches = text.match(urlRegex);
        return matches ? Array.from(new Set(matches)) : [];
    },
    linkifyText: (text) => {
        if (!text || typeof text !== 'string') return '';
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/gi;
        const escaped = Utils.escapeHTML(text);
        return escaped.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-text-link">${url}</a>`;
        });
    },
    formatTime: (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    formatDuration: (sec) => {
        const s = Math.max(0, Math.floor(sec));
        return `${Math.floor(s/60)}:${(s%60).toString().padStart(2, '0')}`;
    },
    formatLastSeen: (timestamp) => {
        if (!timestamp) return "Offline";
        const diff = Date.now() - Number(timestamp);
        if (diff < 60000) return "Last seen just now";
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `Last seen ${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `Last seen ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
        const days = Math.floor(hours / 24);
        if (days === 1) return "Last seen yesterday";
        if (days < 7) return `Last seen ${days} days ago`;
        return `Last seen on ${new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    },
    timeAgo: (ts) => {
        if(!ts) return "a while ago";
        const diff = Math.floor((Date.now() - ts) / 1000);
        if(diff < 60) return "just now";
        if(diff < 3600) return `${Math.floor(diff/60)} mins ago`;
        if(diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
        return `${Math.floor(diff/86400)} days ago`;
    },
    formatDateDivider: (ts) => {
        const d = new Date(ts).toDateString();
        const t = new Date().toDateString();
        const y = new Date(Date.now() - 86400000).toDateString();
        if(d === t) return "Today";
        if(d === y) return "Yesterday";
        return new Date(ts).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
    },
    setCaretToEnd: (el) => {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    },
    username: (uid) => {
        if (uid === BOT_UID) return 'bsms';
        if (State.accountsCache[uid] && State.accountsCache[uid].username) {
            return State.accountsCache[uid].username;
        }
        return uid;
    },
    displayName: (uid, ch) => {
        if(ch && ch._type === 'gcs' && ch.config && ch.config.allowCustomNicknames !== false && ch.members && ch.members[uid] && ch.members[uid].nickname) return ch.members[uid].nickname;
        const acc = State.accountsCache[uid];
        if(acc && (acc.displayName || acc.username)) return acc.displayName || acc.username;
        return uid;
    },
    nameColor: (uid) => {
        if (!uid || uid === BOT_UID) return null;
        const acc = State.accountsCache[uid];
        if (acc && (acc.nameColor || acc.chatColor)) return acc.nameColor || acc.chatColor;
        if (State.user && (State.user.uid === uid || State.user.username === uid)) {
            if (State.user.nameColor || State.user.chatColor) return State.user.nameColor || State.user.chatColor;
            try {
                const s = JSON.parse(localStorage.getItem('bsms_auth_session') || localStorage.getItem('bsms_session') || '{}');
                if (s.nameColor || s.chatColor) return s.nameColor || s.chatColor;
            } catch(e) {}
        }
        return '#ef4444';
    },
    getBadgesHTML: (uid) => {
        if (uid === BOT_UID) return `<span class="bot-badge">Official</span>`;
        const acc = State.accountsCache[uid];
        if (!acc) return '';
        let html = '';
        const safeName = Utils.escapeHTML(acc.displayName || acc.username || uid);
        if (acc.verified) {
            html += `<svg class="ic verified-icon" title="Verified" onclick="event.stopPropagation(); UI.showVerifiedModal('${safeName}')"><use href="#ico-verified"></use></svg>`;
        }
        if (acc.role === 'owner') {
            html += `<span class="owner-badge" title="Platform Owner" onclick="event.stopPropagation(); UI.showOwnerModal('${safeName}')">Owner</span>`;
        } else if (acc.role === 'admin') {
            html += `<span class="admin-badge" title="Administrator" onclick="event.stopPropagation(); UI.showAdminModal('${safeName}')">Admin</span>`;
        } else if (acc.role === 'mod') {
            html += `<span class="mod-badge" title="Community Moderator" onclick="event.stopPropagation(); UI.showModModal('${safeName}')">Mod</span>`;
        }
        if (acc.isDeveloper) {
            html += `<div class="dev-badge" title="Developer" onclick="event.stopPropagation(); UI.showDevModal('${safeName}')"><svg class="ic"><use href="#ico-hammer"></use></svg></div>`;
        }
        return html;
    }
};

const AudioFX = {
    ctx: null,
    init: () => { if(!AudioFX.ctx) AudioFX.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
    play: (f, t, d, v=0.05) => {
        if(!AudioFX.ctx) return;
        if(AudioFX.ctx.state === 'suspended') AudioFX.ctx.resume();
        const o = AudioFX.ctx.createOscillator(), g = AudioFX.ctx.createGain();
        o.type = t; o.frequency.setValueAtTime(f, AudioFX.ctx.currentTime);
        g.gain.setValueAtTime(v, AudioFX.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, AudioFX.ctx.currentTime + d);
        o.connect(g); g.connect(AudioFX.ctx.destination);
        o.start(); o.stop(AudioFX.ctx.currentTime + d);
    },
    send: () => AudioFX.play(600, 'sine', 0.15),
    receive: () => AudioFX.play(800, 'sine', 0.2),
    startRec: () => AudioFX.play(400, 'square', 0.1),
    stopRec: () => AudioFX.play(300, 'square', 0.1),
    react: () => AudioFX.play(1200, 'triangle', 0.1)
};
document.addEventListener('click', AudioFX.init, { once: true });

const ApiClient = {
    call: async (action, params = {}) => {
        try {
            const sid = (localStorage.getItem('session_id') || "").trim();
            if (!sid && action !== 'status') {
                PollingManager.stop();
                AuthManager.reject();
                return null;
            }
            const res = await fetch(`/api/chat?action=${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
                body: JSON.stringify(params)
            });
            const data = await res.json().catch(() => ({}));
            
            if (res.status === 403 && data.account_status === "banned") {
                // If banned, smoothly redirect to accounts.html which handles global bans visually
                window.location.href = '/accounts.html';
                return null;
            }
            if (res.status === 401 || (data && data.error === 'Unauthorized session.')) {
                // Session expired or unauthenticated: stop background polling and prompt login cleanly
                PollingManager.stop();
                localStorage.removeItem('session_id');
                localStorage.removeItem('bsms_auth_session');
                localStorage.removeItem('bsms_session');
                AuthManager.reject();
                return null;
            }
            if (res.status === 403 && data.unauthorized) {
                // Channel membership error - return payload so caller can handle UI gracefully
                return data;
            }
            if (res.status === 400 && data.error && (data.error.includes("filter") || data.moderation?.flagged)) {
                const inp = document.getElementById('msgInput');
                if (inp) {
                    inp.style.borderColor = '#ef4444'; inp.style.animation = 'none'; void inp.offsetWidth;
                    inp.style.animation = 'pulseRecord 0.5s'; setTimeout(() => inp.style.borderColor = '', 1000);
                }
                throw new Error(data.error);
            }
            if (!res.ok) throw new Error(data.error || "API Error");
            return data;
        } catch (e) {
            console.error(`[BSMS Web :: Chat] API Call failed (${action}):`, e);
            throw e;
        }
    }
};

const PollingManager = {
    start: async () => {
        let ready = await PollingManager.syncGlobal();
        while (!ready) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            ready = await PollingManager.syncGlobal();
        }
        State.syncInterval = setInterval(PollingManager.syncGlobal, 5000);
    },
    stop: () => {
        clearInterval(State.syncInterval);
        clearInterval(State.msgInterval);
    },
    syncGlobal: async () => {
        try {
            const data = await ApiClient.call('sync');
            if (!data) return;
            
            if (data.myUid && State.user.uid !== data.myUid) {
                State.user.uid = data.myUid;
                let sessStr = localStorage.getItem('bsms_auth_session');
                if (sessStr) {
                    let sess = JSON.parse(sessStr);
                    sess.uid = data.myUid;
                    localStorage.setItem('bsms_auth_session', JSON.stringify(sess));
                }
            }

            const previousChannels = State.channels || {};
            const incomingChannels = data.channels || {};
            for (const [cid, channel] of Object.entries(incomingChannels)) {
                const previous = previousChannels[cid];
                const cached = State.conversationCache[cid];
                const previousMessages = previous?.messages || {};
                channel.messages = Object.keys(previousMessages).length
                    ? previousMessages
                    : (cached?.messages || previousMessages);
                if (cached) {
                    channel.messageCount = Math.max(channel.messageCount || 0, Object.keys(channel.messages).length);
                }
            }

            State.usersCache = { ...(State.usersCache || {}), ...(data.users || {}) };
            State.accountsCache = { ...(State.accountsCache || {}), ...(data.accounts || {}) };
            State.channels = incomingChannels;
            if (Array.isArray(data.hiddenDms)) State.hiddenDms = data.hiddenDms;
            if (typeof NameColorManager !== 'undefined' && NameColorManager.updateSidebarUser) {
                NameColorManager.updateSidebarUser();
            }
            
            if (State.activeChannelId && State.channels[State.activeChannelId]) {
                const c = State.channels[State.activeChannelId];
                ChatManager.updateHeader();
                ChatManager.updateReadReceipts();
                if (State.currentRole === 'owner') GroupManager.renderRequests();

                // Dynamic UI Re-evaluation if actively open DM target gets banned
                if (c._type === 'dms') {
                    const otherUid = Object.keys(c.members).find(id => id !== State.user.uid);
                    if (otherUid !== BOT_UID && State.accountsCache[otherUid]?.account_status === 'banned') {
                        ChatManager.open(State.activeChannelId); // Soft-reload to lock the UI
                    }
                }
            } else if (State.activeChannelId) {
                ChatManager.close();
                UI.showToast("You are no longer in this conversation.", 'error');
            }
            
            SidebarManager.render();
            return true;
        } catch(e) {
            console.error('[BSMS Web] Could not load conversation metadata:', e);
            return false;
        }
    },
    syncMessages: async () => {
        if (!State.activeChannelId) return;
        const requestedCid = State.activeChannelId;
        const requestedToken = State.activeChannelToken;
        const channelType = State.activeType || (State.channels[requestedCid] ? State.channels[requestedCid]._type : (requestedCid.startsWith('gc') ? 'gcs' : 'dms'));
        try {
            const data = await ApiClient.call('messages', { cid: requestedCid, type: channelType, limit: 20 });
            if (!data) return;
            if (State.activeChannelId !== requestedCid || State.activeChannelToken !== requestedToken) return;

            if (data && data.unauthorized) {
                ChatManager.showUnauthorized();
                const spinner = document.getElementById('chatLoadingSpinner');
                if (spinner) spinner.style.display = 'none';
                return true;
            }

            if (data && data.accounts) {
                State.accountsCache = { ...State.accountsCache, ...data.accounts };
            }

            if (data && data.messages) {
                ChatManager.mergeMessages(data.messages, requestedCid);
                if (data.oldestId && !ChatManager.oldestMessageId) {
                    ChatManager.oldestMessageId = data.oldestId;
                }
            }
            if (data && typeof data.hasMore !== 'undefined') {
                ChatManager.hasMoreMessages = Boolean(data.hasMore);
                ChatManager.checkScrollForEarlier();
            }
            if (data && data.members) ChatManager.renderTyping(data.members);

            const currentChannel = State.channels[requestedCid];
            if (currentChannel) {
                State.conversationCache[requestedCid] = {
                    messages: { ...(currentChannel.messages || {}) },
                    oldestId: ChatManager.oldestMessageId,
                    hasMore: ChatManager.hasMoreMessages,
                    updatedAt: Date.now()
                };
            }
            const spinner = document.getElementById('chatLoadingSpinner');
            if (spinner) spinner.style.display = 'none';
            return true;
        } catch(e) {
            // Keep the loading indicator visible until data actually arrives.
            console.error('[BSMS Web] Could not load chat messages:', e);
            return false;
        }
    }
};

const UI = {
    show: id => { const e = document.getElementById(id); if(e) e.style.display = 'flex'; },
    hide: id => { const e = document.getElementById(id); if(e) e.style.display = 'none'; },
    openModal: id => document.getElementById(id).classList.add('show'),
    closeModal: id => document.getElementById(id).classList.remove('show'),

    setLoad: (pct, label) => {
        const lb = document.getElementById('loadBar');
        const lp = document.getElementById('loadPct');
        const ls = document.getElementById('loadingScreen');
        if(lb) lb.style.width = Math.min(100,pct) + "%";
        if(lp) lp.innerText = Math.min(100,pct) + "%" + (label ? (" - " + label) : "");
        if(pct >= 100) {
            setTimeout(() => { if(ls) ls.style.opacity = '0'; }, 250);
            setTimeout(() => { if(ls) ls.style.display = 'none'; }, 650);
        }
    },

    showToast: (msg, type = 'info') => {
        const t = document.getElementById('toastContainer');
        t.className = type === 'error' ? 'error' : (type === 'success' ? 'success' : '');
        document.getElementById('toastText').innerText = msg;
        t.classList.add('show');
        clearTimeout(State.toastTimeout);
        State.toastTimeout = setTimeout(() => t.classList.remove('show'), 4000);
    },
    
    hideToast: () => document.getElementById('toastContainer').classList.remove('show'),

    showConfirm: (msg, actions, title = "Confirm") => {
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmMsg').innerText = msg;
        const b = document.getElementById('confirmBtns');
        b.innerHTML = '';
        actions.forEach(a => {
            const btn = document.createElement('button');
            btn.className = `btn ${a.danger ? 'warn' : (a.sec ? 'sec' : '')}`;
            btn.innerText = a.text;
            btn.onclick = () => { UI.closeModal('confirmModal'); if(a.cb) a.cb(); };
            b.appendChild(btn);
        });
        UI.openModal('confirmModal');
    },

    showVerifiedModal: (name) => {
        document.getElementById('vmUserDisplay').innerText = name;
        UI.openModal('verifiedModal');
    },

    showAdminModal: (name) => {
        document.getElementById('amUserDisplay').innerText = name;
        UI.openModal('adminModal');
    },

    showModModal: (name) => {
        document.getElementById('mmUserDisplay').innerText = name;
        UI.openModal('modModal');
    },

    showDevModal: (name) => {
        document.getElementById('dmUserDisplay').innerText = name;
        UI.openModal('devModal');
    },

    showOwnerModal: (name) => {
        document.getElementById('omUserDisplay').innerText = name;
        UI.openModal('ownerModal');
    },

    showVoiceChatModal: () => {
        UI.openModal('voiceChatModal');
    },

    openSettings: () => {
        if(!State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];

        if(State.activeType === 'dms') {
            document.getElementById('dmIdDisplay').innerText = State.activeChannelId;
            let html = '';
            for(let uid in c.members) {
                const acc = State.accountsCache[uid] || { displayName: uid };
                const uName = Utils.username(uid);
                html += `<div style="padding:10px;background:var(--section-bg);border-radius:12px;display:flex;align-items:center;gap:12px;">
                    <div class="c-av" style="width:40px;height:40px;font-size:1.1rem;cursor:default;">
                        <div class="c-av-inner">${acc.avatar ? `<img src="${Utils.escapeHTML(acc.avatar)}">` : uid.charAt(0).toUpperCase()}</div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-weight:bold;color:var(--fg); display:flex; align-items:center;">${Utils.escapeHTML(acc.displayName || uName)} ${Utils.getBadgesHTML(uid)}</div>
                        <div style="font-size:0.85rem;color:var(--fg2);">@${Utils.escapeHTML(uName)}</div>
                    </div>
                </div>`;
            }
            document.getElementById('dmMembersList').innerHTML = html;
            UI.openModal('dmSettingsModal');
        } else {
            document.getElementById('gsIdDisplay').innerText = State.activeChannelId;
            document.getElementById('gsCodeDisplayText').innerText = c.config?.joinCode || '------';
            document.getElementById('gsRequireApprovalToggle').checked = c.config?.requireJoinApproval || false;
            document.getElementById('gsAllowNickToggle').checked = c.config?.allowCustomNicknames !== false;

            document.getElementById('gsThemeFg').value = c.config?.theme?.text || '#ffffff';
            document.getElementById('gsThemeAccent').value = c.config?.theme?.accent || '#BB001E';
            const bgVal = c.config?.theme?.background;
            const isImage = bgVal && bgVal.startsWith('data:');
            GroupManager.setThemeMode(isImage ? 'image' : 'color');
            document.getElementById('gsThemeBgColor').value = (bgVal && !isImage) ? bgVal : '#000000';

            const isOwner = State.currentRole === 'owner';
            ['gsRequireApprovalToggle','gsAllowNickToggle','gsThemeFg','gsThemeAccent','gsThemeBgColor','gsThemeWpFile','gsRenameInput','gsCustomCodeInput'].forEach(id => {
                document.getElementById(id).disabled = !isOwner;
            });
            document.getElementById('btnRegenCode').style.display = isOwner ? 'flex' : 'none';
            document.getElementById('gsCustomCodeRow').style.display = isOwner ? 'flex' : 'none';

            const icn = document.getElementById('gsIconWrap');
            if (c.config?.icon) {
                icn.innerHTML = `<img src="${Utils.escapeHTML(c.config.icon)}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:3px solid var(--accent); cursor:${isOwner?'pointer':'default'};" ${isOwner?`onclick="document.getElementById('gsIconUpload').click()"`:''}>`;
            } else {
                icn.innerHTML = `<div style="width:100px; height:100px; border-radius:50%; background:var(--pill-bg); border:3px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:2.5rem; color:var(--fg); font-weight:bold; cursor:${isOwner?'pointer':'default'};" ${isOwner?`onclick="document.getElementById('gsIconUpload').click()"`:''}>${(c.name || '?').charAt(0).toUpperCase()}</div>`;
            }

            document.getElementById('gsRenameInput').value = c.name;
            document.getElementById('gsCustomCodeInput').value = '';
            GroupManager.renderRequests();
            UI.openModal('groupSettingsModal');
        }
    }
};

const Router = {
    init: function() {
        window.addEventListener('hashchange', () => this.handleHash());
    },
    setHash: function(type, id) {
        history.replaceState(null, null, `#${type}/${id}`);
    },
    clearHash: function() {
        history.replaceState(null, null, ' ');
        UI.closeModal('joinOverlay');
    },
    parseHash: function() {
        const h = window.location.hash;
        if(!h || h.length < 2) return null;
        const clean = h.replace(/^#+/, '').replace(/^\/+/, '');
        const p = clean.split('/');
        if(p.length < 2) return null;
        return { type: p[0], id: decodeURIComponent(p[1]) };
    },
    consumeInitialHash: function() {
        State.pendingRoute = this.parseHash();
    },
    resolvePendingRoute: async function() {
        const r = State.pendingRoute;
        State.pendingRoute = null;
        if(!r) return;
        if(r.type === 'dm' || r.type === 'gc') {
            if(State.channels[r.id]) { 
                if (State.hiddenDms.includes(r.id)) {
                    State.hiddenDms = State.hiddenDms.filter(id => id !== r.id);
                    ApiClient.call('unhideDM', { cid: r.id });
                }
                ChatManager.open(r.id); 
                return; 
            }
            await PollingManager.syncGlobal();
            if(State.channels[r.id]) { 
                if (State.hiddenDms.includes(r.id)) {
                    State.hiddenDms = State.hiddenDms.filter(id => id !== r.id);
                    ApiClient.call('unhideDM', { cid: r.id });
                }
                ChatManager.open(r.id); 
                return; 
            }
            if(r.type === 'dm') {
                await SearchManager.startDM(r.id);
                return;
            }
            this.clearHash();
        } else if(r.type === 'user') {
            await SearchManager.startDM(r.id);
        } else if(r.type === 'join') {
            await GroupManager.requestJoinById(r.id);
        }
    },
    handleHash: async function() {
        const r = this.parseHash();
        if(!r) return;
        if(r.type === 'join') { GroupManager.requestJoinById(r.id); return; }
        if(r.type === 'user') { await SearchManager.startDM(r.id); return; }
        if(State.channels[r.id]) { 
            if (State.hiddenDms.includes(r.id)) {
                State.hiddenDms = State.hiddenDms.filter(id => id !== r.id);
                ApiClient.call('unhideDM', { cid: r.id });
            }
            ChatManager.open(r.id); 
            return; 
        }
        await PollingManager.syncGlobal();
        if(State.channels[r.id]) {
            if (State.hiddenDms.includes(r.id)) {
                State.hiddenDms = State.hiddenDms.filter(id => id !== r.id);
                ApiClient.call('unhideDM', { cid: r.id });
            }
            ChatManager.open(r.id);
            return;
        }
        if(r.type === 'dm') {
            await SearchManager.startDM(r.id);
        }
    }
};

const SearchManager = {
    init: function() {
        const inp = document.getElementById('searchInput');
        const res = document.getElementById('searchResults');

        if(inp) {
            inp.addEventListener('input', () => {
                clearTimeout(State.searchTimeout);
                const q = inp.value.trim().toLowerCase().replace(/^@/, '');

                if (q.length < 2) { res.classList.remove('show'); return; }

                State.searchTimeout = setTimeout(() => {
                    let matches = [];
                    for(let uid in State.accountsCache) {
                        if (uid === State.user.uid || uid === BOT_UID) continue;
                        const acc = State.accountsCache[uid];
                        const searchable = `${acc.displayName || ""} @${acc.username || ""}`.toLowerCase();
                        if (searchable.includes(q) && acc.account_status !== 'banned') { // Only allow finding unbanned accounts via global
                            matches.push({
                                uid: uid,
                                displayName: acc.displayName || acc.username || uid,
                                username: acc.username || uid,
                                avatar: acc.avatar,
                                online: State.usersCache[uid]?.status === 'online'
                            });
                        }
                    }
                    this.renderResults(matches);
                }, 200);
            });
        }

        document.addEventListener('click', e => {
            if (!e.target.closest('.search-box') && res) res.classList.remove('show');
        });

        const invInp = document.getElementById('inviteSearchInput');
        if(invInp) {
            invInp.addEventListener('input', () => {
                clearTimeout(State.inviteSearchTimeout);
                const q = invInp.value.trim().toLowerCase().replace(/^@/, '');
                const r = document.getElementById('inviteSearchResults');
                if(q.length < 2) { r.innerHTML = ''; return; }
                State.inviteSearchTimeout = setTimeout(() => {
                    const c = State.channels[State.activeChannelId];
                    let matches = [];
                    for(let uid in State.accountsCache) {
                        if(uid === State.user.uid || uid === BOT_UID) continue;
                        const acc = State.accountsCache[uid];
                        const searchable = `${acc.displayName || ""} @${acc.username || ""}`.toLowerCase();
                        if(searchable.includes(q) && (!c.members || !c.members[uid]) && acc.account_status !== 'banned') {
                            matches.push({ uid, displayName: acc.displayName || acc.username || uid });
                        }
                    }
                    let html = '';
                    matches.slice(0,10).forEach(u => {
                        const sColor = Utils.nameColor(u.uid);
                        const sColorStyle = sColor ? `style="color:${sColor}; font-weight:bold;"` : '';
                        html += `<div class="member-item" style="cursor:pointer;" onclick="GroupManager.sendInvite('${u.uid}')">
                            <div class="member-info"><div style="font-weight:bold;color:var(--fg); display:flex; align-items:center;"><span ${sColorStyle}>${Utils.escapeHTML(u.displayName)}</span> ${Utils.getBadgesHTML(u.uid)}</div></div>
                            <button class="btn" style="width:auto;padding:4px 10px;font-size:0.9rem;">Invite</button>
                        </div>`;
                    });
                    r.innerHTML = html || `<div style="color:var(--fg2);text-align:center;">No users found</div>`;
                }, 200);
            });
        }
    },

    renderResults: function(matches) {
        const res = document.getElementById('searchResults');
        if(!res) return;
        if (matches.length === 0) {
            res.innerHTML = `<div class="search-item" style="color:var(--fg2); justify-content:center;">No users found</div>`;
        } else {
            let html = '';
            matches.slice(0,10).forEach(u => {
                const dot = u.online ? `<div class="status-dot online"></div>` : `<div class="status-dot"></div>`;
                const avHtml = u.avatar ? `<img src="${Utils.escapeHTML(u.avatar)}">` : u.displayName.charAt(0).toUpperCase();
                const uColor = Utils.nameColor(u.uid);
                const uColorStyle = uColor ? `style="color:${uColor}; font-weight:bold;"` : '';
                html += `
                <div class="search-item" onclick="SearchManager.startDM('${u.uid}')">
                    <div class="c-av" style="width:40px; height:40px; font-size:1.2rem;">
                        <div class="c-av-inner">${avHtml}</div>
                        ${dot}
                    </div>
                    <div style="flex:1; overflow:hidden;">
                        <div style="font-weight:bold; color:var(--fg); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center;">
                            <span ${uColorStyle}>${Utils.escapeHTML(u.displayName)}</span> ${Utils.getBadgesHTML(u.uid)}
                        </div>
                        <div style="font-size:0.9rem; color:var(--fg2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">@${Utils.escapeHTML(u.username)}</div>
                    </div>
                </div>`;
            });
            res.innerHTML = html;
        }
        res.classList.add('show');
    },

    startDM: async function(targetUid) {
        if(document.getElementById('searchInput')) document.getElementById('searchInput').value = "";
        if(document.getElementById('searchResults')) document.getElementById('searchResults').classList.remove('show');
        try {
            const res = await ApiClient.call('startDM', { targetUid });
            if (res && res.cid) {
                if (State.hiddenDms.includes(res.cid)) {
                    State.hiddenDms = State.hiddenDms.filter(id => id !== res.cid);
                    ApiClient.call('unhideDM', { cid: res.cid });
                }
                await PollingManager.syncGlobal();
                ChatManager.open(res.cid);
            }
        } catch(e) { UI.showToast("Failed to start conversation.", 'error'); }
    }
};

const SidebarManager = {
    render: function() {
        const list = document.getElementById('chatList');
        if(!list) return;

        const hiddenDms = State.hiddenDms || [];

        let arr = [];
        for (let id in State.channels) {
            const c = State.channels[id];
            // Filter out hidden DMs if not actively selected
            if (c._type === 'dms' && hiddenDms.includes(id) && State.activeChannelId !== id) {
                continue;
            }

            const lastM = c.lastMessage || null;
            const msgCount = Number(c.messageCount || 0);
            if (msgCount === 0 && !lastM && State.activeChannelId !== id) continue;

            let sortTime = lastM?.timestamp || c.config?.createdAt || 0;
            let previewText = "New conversation";
            let unread = false;
            if (lastM) {
                if (lastM.status?.deletedByMod) previewText = "[Deleted by Moderator]";
                else if (lastM.status?.unsent) previewText = "Message unsent";
                else if (lastM.contentType === 'audio') previewText = "Voice message";
                else if (lastM.contentType === 'file' || lastM.contentType === 'image') previewText = "Attachment";
                else if (lastM.contentType === 'poll') previewText = "Poll";
                else previewText = Utils.escapeHTML(lastM.content || '');
                unread = lastM.senderUid !== State.user.uid && (!lastM.readReceipts || lastM.readReceipts[State.user.uid] !== true);
            }
            arr.push({ id, c, sortTime, preview: previewText, unread });
        }

        arr.sort((a, b) => b.sortTime - a.sortTime);

        let html = '';
        arr.forEach(item => {
            let { id, c } = item;
            let title = c.name;
            let isOnline = false;
            let avHtml = "?";
            let isOfficial = false;
            let targetUid = null;

            if (c._type === 'dms') {
                targetUid = Object.keys(c.members).find(u => u !== State.user.uid);
                if (targetUid === BOT_UID) {
                    title = "BSMS Web";
                    avHtml = `<img src="${BOT_PFP}">`;
                    isOfficial = true;
                } else if (targetUid) {
                    const acc = State.accountsCache[targetUid] || {};
                    title = acc.displayName || acc.username || targetUid;
                    const uData = State.usersCache[targetUid];
                    isOnline = uData?.status === 'online' && (Date.now() - (uData.lastSeen || 0) < 25000);
                    avHtml = acc.avatar ? `<img src="${Utils.escapeHTML(acc.avatar)}">` : title.charAt(0).toUpperCase();
                } else {
                    title = "Unknown User";
                    avHtml = title.charAt(0).toUpperCase();
                }
            } else {
                if (c.config?.icon) avHtml = `<img src="${Utils.escapeHTML(c.config.icon)}">`;
                else avHtml = title ? title.charAt(0).toUpperCase() : "?";
            }

            const activeCls = State.activeChannelId === id ? 'active' : '';
            const unreadCls = item.unread ? 'unread' : '';
            const dot = (c._type === 'dms' && !isOfficial) ? `<div class="status-dot ${isOnline ? 'online' : ''}"></div>` : '';
            const badge = item.unread ? `<div class="unread-badge"></div>` : '';
            const offCls = isOfficial ? 'official' : '';
            const pfpAttr = (targetUid && !isOfficial) ? `class="c-av ${offCls} user-pfp-trigger" data-uid="${targetUid}" title="Click or hover to view profile"` : `class="c-av ${offCls}"`;

            const nameColor = (targetUid && Utils.nameColor(targetUid)) ? `style="color:${Utils.nameColor(targetUid)}; font-weight:bold;"` : '';

            html += `
            <div class="chat-row ${activeCls} ${unreadCls}" data-cid="${Utils.escapeHTML(id)}" onclick="ChatManager.open('${id}')">
                <div ${pfpAttr}>
                    <div class="c-av-inner">${avHtml}</div>
                    ${dot}
                </div>
                <div class="c-info">
                    <div class="c-name" ${nameColor}>${Utils.escapeHTML(title)} ${targetUid ? Utils.getBadgesHTML(targetUid) : ''}</div>
                    <div class="c-prev">${item.preview}</div>
                </div>
                ${badge}
            </div>`;
        });

        const nextMarkup = html || `<div style="text-align:center; padding:24px; color:var(--fg2);">No conversations yet.</div>`;
        if (list.innerHTML !== nextMarkup) {
            const staging = document.createElement('div');
            staging.innerHTML = nextMarkup;
            const oldRows = new Map(Array.from(list.querySelectorAll('.chat-row')).map(row => [row.getAttribute('data-cid'), row]));
            for (const nextRow of Array.from(staging.querySelectorAll('.chat-row'))) {
                const cid = nextRow.getAttribute('data-cid');
                const oldRow = oldRows.get(cid);
                if (oldRow && oldRow.outerHTML === nextRow.outerHTML) {
                    nextRow.replaceWith(oldRow);
                }
            }
            list.replaceChildren(...Array.from(staging.childNodes));
        }
    },
    togglePlusMenu: function() { document.getElementById('plusMenu').classList.toggle('show'); },
    hideMobile: function() {
        document.getElementById('sidebar').classList.add('hidden');
        document.getElementById('mobSidebarOverlay').style.display = 'none';
    },
    showMobile: function() {
        document.getElementById('sidebar').classList.remove('hidden');
        document.getElementById('mobSidebarOverlay').style.display = 'block';
    }
};

document.addEventListener('click', e => {
    if(!e.target.closest('#plusMenu') && !e.target.closest('.side-title-row .icon-btn')) {
        const pm = document.getElementById('plusMenu');
        if(pm) pm.classList.remove('show');
    }
});

const ScrollManager = {
    observer: null,
    init: function() {
        const feed = document.getElementById('chatLog');
        if(feed) {
            feed.addEventListener('scroll', () => {
                State.isScrolledUp = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) > 100;
                if (!State.isScrolledUp) {
                    document.getElementById('smartScrollPill').classList.remove('show');
                }
                ChatManager.checkScrollForEarlier();
            });

            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const msgId = entry.target.id.replace('msg-', '');
                        const cid = State.activeChannelId;
                        if(cid && State.channels[cid] && State.channels[cid].messages && State.channels[cid].messages[msgId]) {
                            const m = State.channels[cid].messages[msgId];
                            const type = State.channels[cid]._type;
                            if (m.senderUid !== State.user.uid && (!m.readReceipts || m.readReceipts[State.user.uid] !== true)) {
                                ApiClient.call('readReceipt', { cid, type, msgId });
                                m.readReceipts = m.readReceipts || {};
                                m.readReceipts[State.user.uid] = true;
                                ChatManager.updateReadReceipts();
                            }
                        }
                    }
                });
            }, { root: feed, threshold: 0.5 });
        }
    },
    scrollToBottom: function(smooth = false) {
        const feed = document.getElementById('chatLog');
        if(feed) feed.scrollTo({ top: feed.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        State.isScrolledUp = false;
        document.getElementById('smartScrollPill').classList.remove('show');
    },
    onNewMessage: function(isMine) {
        if (isMine || !State.isScrolledUp) this.scrollToBottom(true);
        else document.getElementById('smartScrollPill').classList.add('show');
    },
    scrollToPin: function() {
        const pb = document.getElementById('pinnedBanner');
        if(pb && pb.dataset.msgid) this.scrollToMessage(pb.dataset.msgid);
    },
    scrollToMessage: function(msgId) {
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.style.animation = 'none';
            el.offsetHeight;
            el.style.animation = 'highlightPin 1.5s ease';
        }
    }
};

const ChatManager = {
    oldestMessageId: null,
    hasMoreMessages: false,
    isLoadingEarlier: false,

    resetChatLog: function() {
        const log = document.getElementById('chatLog');
        if (!log) return;
        log.innerHTML = `
            <div id="loadEarlierWrap" class="load-earlier-wrap" style="text-align:center; padding:12px; margin-bottom:8px;">
                <button class="load-earlier-btn" id="btnLoadEarlier" onclick="ChatManager.loadEarlierMessages()" style="display:none; align-items:center; gap:8px; padding:6px 16px; border-radius:20px; background:var(--section-bg); border:1px solid var(--border); color:var(--fg); font-size:0.95rem; cursor:pointer; margin: 0 auto;">
                    <svg class="ic" style="width:16px; height:16px;"><use href="#ico-refresh"></use></svg>
                    <span id="loadEarlierText">Load Earlier Messages</span>
                </button>
                <div id="beginningLegendaryMsg" class="beginning-of-chat-banner" style="display:none; text-align:center; padding:16px 12px; color:var(--fg2); font-size:0.95rem; display:flex; flex-direction:column; align-items:center; gap:6px;">
                    <svg class="ic" style="width:24px; height:24px; opacity:0.6;"><use href="#ico-chat"></use></svg>
                    <span>You have reached the beginning of this legendary conversation.</span>
                </div>
            </div>
        `;
        State.lastRenderedDate = null;
        this.oldestMessageId = null;
        this.hasMoreMessages = false;
        this.isLoadingEarlier = false;
    },

    checkScrollForEarlier: function() {
        const wrap = document.getElementById('loadEarlierWrap');
        if (!wrap) return;
        const btn = document.getElementById('btnLoadEarlier');
        const legend = document.getElementById('beginningLegendaryMsg');
        wrap.style.display = 'block';
        if (this.hasMoreMessages) {
            if (btn) btn.style.display = 'inline-flex';
            if (legend) legend.style.display = 'none';
        } else {
            if (btn) btn.style.display = 'none';
            if (legend) legend.style.display = 'flex';
        }
    },

    loadEarlierMessages: async function() {
        if (this.isLoadingEarlier || !this.hasMoreMessages || !this.oldestMessageId) return;
        this.isLoadingEarlier = true;
        const btnText = document.getElementById('loadEarlierText');
        if (btnText) btnText.innerText = "Loading earlier messages...";

        const feed = document.getElementById('chatLog');
        const prevScrollHeight = feed.scrollHeight;
        const prevScrollTop = feed.scrollTop;
        const cid = State.activeChannelId;
        const type = State.activeType;

        try {
            const data = await ApiClient.call('messages', {
                cid: cid,
                type: type,
                limit: 20,
                beforeId: this.oldestMessageId
            });

            if (State.activeChannelId !== cid) return;

            if (data && data.accounts) {
                State.accountsCache = { ...State.accountsCache, ...data.accounts };
            }

            if (data && data.messages) {
                const keys = Object.keys(data.messages).sort((a,b) => {
                    const na = Number(a), nb = Number(b);
                    if (!isNaN(na) && !isNaN(nb)) return na - nb;
                    return a.localeCompare(b);
                });

                if (keys.length > 0) {
                    this.oldestMessageId = data.oldestId || keys[0];
                    const c = State.channels[cid];
                    if (c) {
                        c.messages = { ...data.messages, ...(c.messages || {}) };
                    }

                    const wrap = document.getElementById('loadEarlierWrap');
                    let fragment = document.createDocumentFragment();
                    let tempDiv = document.createElement('div');
                    let prependHtml = '';
                    let lastDate = null;

                    for (const mid of keys) {
                        const m = data.messages[mid];
                        if (!m) continue;
                        const dStr = Utils.formatDateDivider(m.timestamp);
                        if (dStr !== lastDate) {
                            prependHtml += `<div class="date-div"><span>${dStr}</span></div>`;
                            lastDate = dStr;
                        }
                        prependHtml += this.buildMessageHTML(mid, m);
                    }

                    tempDiv.innerHTML = prependHtml;
                    while (tempDiv.firstChild) {
                        fragment.appendChild(tempDiv.firstChild);
                    }
                    if (wrap && wrap.nextSibling) {
                        wrap.parentNode.insertBefore(fragment, wrap.nextSibling);
                    } else if (wrap) {
                        wrap.parentNode.appendChild(fragment);
                    }

                    for (const mid of keys) {
                        const m = data.messages[mid];
                        if (m.contentType === 'audio' && !m.status?.unsent && !m.status?.deletedByMod) {
                            AudioManager.bindPlayer(mid);
                        }
                        if (ScrollManager.observer) {
                            const el = document.getElementById(`msg-${mid}`);
                            if (el) ScrollManager.observer.observe(el);
                        }
                    }

                    feed.scrollTop = feed.scrollHeight - prevScrollHeight + prevScrollTop;
                }
                this.hasMoreMessages = Boolean(data.hasMore);
            } else {
                this.hasMoreMessages = false;
            }
        } catch(e) {
            console.error("Failed to load earlier messages:", e);
            UI.showToast("Failed to load earlier messages.", 'error');
        } finally {
            this.isLoadingEarlier = false;
            if (btnText) btnText.innerText = "Load Earlier Messages";
            this.checkScrollForEarlier();
        }
    },

    confirmHideDM: function() {
        UI.openModal('hideDMModal');
    },

    executeHideDM: async function() {
        UI.closeModal('hideDMModal');
        if (!State.activeChannelId || State.activeType !== 'dms') return;
        const cid = State.activeChannelId;
        try {
            await ApiClient.call('hideDM', { cid });
            if (!State.hiddenDms.includes(cid)) State.hiddenDms.push(cid);
        } catch(e) {}
        ChatManager.close();
        SidebarManager.render();
        UI.showToast("Conversation hidden from sidebar.", 'info');
    },

    showUnauthorized: function() {
        UI.hide('emptyState');
        UI.hide('feedWrap');
        UI.hide('composerWrap');
        UI.hide('sysBotNotice');
        UI.hide('pinnedBanner');
        UI.hide('dmBannedState');
        UI.show('chatHeader');
        document.getElementById('activeChatName').innerText = "Unauthorized";
        document.getElementById('activeChatStatus').innerText = "Access Restricted";
        UI.hide('btnVoiceChat');
        UI.hide('btnHideDM');
        UI.hide('btnGroupSettings');
        UI.hide('btnLeaveGroup');
        const unauthEl = document.getElementById('unauthorizedState');
        if (unauthEl) unauthEl.style.display = 'flex';
    },

    closeToSidebar: function() {
        this.close();
        if (window.innerWidth <= 768) {
            SidebarManager.showMobile();
        }
    },

    renderInitialMessages: function(messages) {
        const log = document.getElementById('chatLog');
        if (!log) return;
        this.resetChatLog();
        const keys = Object.keys(messages || {}).sort((a,b) => {
            const na = Number(a), nb = Number(b);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b);
        });
        keys.forEach(mid => {
            const m = messages[mid];
            if (m) this.renderMessageNode(mid, m);
        });
        ScrollManager.scrollToBottom(false);
        this.checkScrollForEarlier();
    },

    open: function(cid) {
        try {
            if (State.activeChannelId === cid && document.getElementById('dmBannedState').style.display !== 'flex') { 
                if(window.innerWidth <= 768) SidebarManager.hideMobile(); 
                return; 
            }
            this.close();

            State.activeChannelId = cid;
            State.activeChannelToken = Date.now() + Math.random();
            const c = State.channels[cid];
            if (!c) {
                this.showUnauthorized();
                return;
            }

            State.activeType = c._type;
            State.currentRole = c.members[State.user.uid]?.role || 'member';

            // Unhide the direct message in the database if reopened
            if (c._type === 'dms' && State.hiddenDms.includes(cid)) {
                State.hiddenDms = State.hiddenDms.filter(id => id !== cid);
                ApiClient.call('unhideDM', { cid });
            }

            const unauthEl = document.getElementById('unauthorizedState');
            if (unauthEl) unauthEl.style.display = 'none';

            UI.hide('emptyState');
            UI.show('chatHeader');
            if (window.innerWidth <= 768) SidebarManager.hideMobile();

            // Native Target DM Ban Evaluation Override
            if (c._type === 'dms') {
                const otherUid = Object.keys(c.members).find(id => id !== State.user.uid);
                const otherAcc = State.accountsCache[otherUid] || {};

                if (otherAcc.account_status === 'banned') {
                    UI.hide('feedWrap'); UI.hide('composerWrap'); UI.hide('sysBotNotice'); UI.hide('pinnedBanner');
                    UI.show('dmBannedState');
                    document.getElementById('dmBannedName').innerText = otherAcc.displayName || otherAcc.username || otherUid;

                    if (State.dmBanTimer) clearInterval(State.dmBanTimer);
                    const timerEl = document.getElementById('dmBannedTimer');
                    
                    if (!otherAcc.ban_expires || otherAcc.ban_expires <= 0) {
                        timerEl.innerText = "Permanent";
                    } else {
                        const updateTargetTimer = () => {
                            const diff = otherAcc.ban_expires - Date.now();
                            if (diff <= 0) {
                                timerEl.innerText = "Expired (Refreshing...)";
                                clearInterval(State.dmBanTimer);
                                setTimeout(() => PollingManager.syncGlobal(), 1000);
                                return;
                            }
                            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                            const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                            const m = Math.floor((diff / 1000 / 60) % 60);
                            const s = Math.floor((diff / 1000) % 60);
                            
                            let str = [];
                            if (d > 0) str.push(`${d}d`);
                            if (h > 0) str.push(`${h}h`);
                            str.push(`${m}m`);
                            str.push(`${s}s`);
                            timerEl.innerText = str.join(' ');
                        };
                        updateTargetTimer();
                        State.dmBanTimer = setInterval(updateTargetTimer, 1000);
                    }
                    
                    this.updateHeader();
                    SidebarManager.render();
                    return;
                } else {
                    UI.hide('dmBannedState');
                    if (State.dmBanTimer) clearInterval(State.dmBanTimer);
                    UI.show('feedWrap');

                    if (otherUid === BOT_UID) {
                        UI.hide('composerWrap'); UI.show('sysBotNotice');
                    } else {
                        UI.show('composerWrap'); UI.hide('sysBotNotice');
                    }
                    UI.hide('btnLeaveGroup');
                }
                Router.setHash('dm', cid);
            } else {
                UI.hide('dmBannedState');
                if (State.dmBanTimer) clearInterval(State.dmBanTimer);
                UI.show('feedWrap');
                UI.show('composerWrap'); UI.hide('sysBotNotice'); UI.show('btnLeaveGroup');
                Router.setHash('gc', cid);
            }

            const draft = localStorage.getItem('draft_' + cid) || '';
            document.getElementById('msgInput').innerText = draft;
            const cc = document.getElementById('charCounter');
            cc.innerText = `${draft.length}/100`;
            cc.className = draft.length === 100 ? 'danger' : (draft.length >= 80 ? 'warn' : '');

            this.updateHeader();
            SidebarManager.render();

            // Conversation Caching: Instant restore from cache if available
            const cached = State.conversationCache[cid];
            if (cached && cached.messages && Object.keys(cached.messages).length > 0) {
                c.messages = { ...cached.messages };
                const spinner = document.getElementById('chatLoadingSpinner');
                if (spinner) spinner.style.display = 'none';
                this.renderInitialMessages(c.messages);
                this.oldestMessageId = cached.oldestId;
                this.hasMoreMessages = cached.hasMore;
                this.checkScrollForEarlier();
            } else {
                this.resetChatLog();
                const spinner = document.getElementById('chatLoadingSpinner');
                if (spinner) spinner.style.display = 'flex';
            }

            clearInterval(State.msgInterval);
            const freshCache = State.conversationCache[cid];
            const cacheIsFresh = freshCache && Date.now() - (freshCache.updatedAt || 0) < 60000;
            State.activeMessageLoad = cacheIsFresh ? Promise.resolve(true) : PollingManager.syncMessages();
            State.msgInterval = setInterval(PollingManager.syncMessages, cacheIsFresh ? 5000 : 2500);
        } catch (e) {
            console.error("[BSMS Web] Failed to open chat:", e);
            UI.showToast("Failed to open chat due to a data error.", 'error');
        }
    },

    close: function() {
        if (!State.activeChannelId) return;

        ApiClient.call('typing', { cid: State.activeChannelId, type: State.activeType, isTyping: false });
        clearInterval(State.msgInterval);
        if (State.dmBanTimer) clearInterval(State.dmBanTimer);

        State.activeChannelId = null;
        State.activeChannelToken = null;
        State.activeType = null;
        ComposerManager.cancelReply();
        ComposerManager.cancelEdit();
        AudioManager.cancelRecording();
        ContextMenu.close();

        UI.show('emptyState');
        UI.hide('chatHeader');
        UI.hide('composerWrap');
        UI.hide('sysBotNotice');
        UI.hide('pinnedBanner');
        UI.hide('dmBannedState');
        UI.hide('btnHideDM');
        UI.hide('btnLeaveGroup');
        const reqBanner = document.getElementById('joinRequestsBanner');
        if (reqBanner) reqBanner.style.display = 'none';
        const unauthEl = document.getElementById('unauthorizedState');
        if (unauthEl) unauthEl.style.display = 'none';
        this.resetChatLog();
        Router.clearHash();
        SidebarManager.render();

        const mv = document.getElementById('mainView');
        mv.style.removeProperty('--chat-bg'); mv.style.removeProperty('--chat-fg');
        mv.style.removeProperty('--chat-accent'); mv.style.removeProperty('--chat-wp'); mv.style.removeProperty('--chat-wp-dim');
    },

    loadAttachment: async function(msgId) {
        UI.showToast("File and image attachments are disabled in chat.", "error");
        return;
        const c = State.channels[State.activeChannelId];
        if (!c || !c.messages || !c.messages[msgId]) return;
        const m = c.messages[msgId];
        const preview = document.getElementById(`att-preview-${msgId}`);
        const header = document.getElementById(`att-header-${msgId}`);
        if (!preview) return;

        const btn = header?.querySelector('button');
        if (btn) { btn.disabled = true; btn.innerText = "Loading..."; }

        try {
            if (!m.content) {
                const res = await ApiClient.call('getAttachment', {
                    cid: State.activeChannelId,
                    type: State.activeType,
                    msgId
                });
                if (res && res.content) {
                    m.content = res.content;
                    m.attachmentMimeType = res.attachmentMimeType || m.attachmentMimeType || null;
                    m.attachmentName = res.attachmentName || m.attachmentName || null;
                }
            }

            const isImageAttachment = Boolean(m.attachmentMimeType && m.attachmentMimeType.startsWith('image/')) ||
                (typeof m.content === 'string' && m.content.startsWith('data:image')) ||
                m.contentType === 'image';

            if (typeof m.content === 'string' && isImageAttachment) {
                preview.innerHTML = `<img src="${Utils.escapeHTML(m.content)}" onclick="ImageViewer.open(this.src)" title="Click to view fullscreen" style="max-width:100%; border-radius:10px; display:block; cursor:pointer;">`;
                const image = preview.querySelector('img');
                if (image) image.addEventListener('error', () => {
                    m.content = null;
                    preview.innerHTML = '<div style="font-size:0.85rem;color:#ef4444;">Image could not be loaded. Check the connection and try again.</div>';
                    if (btn) { btn.style.display = 'inline-flex'; btn.disabled = false; btn.innerText = 'Retry'; }
                }, { once: true });
            } else {
                preview.innerHTML = `<div style="font-size:0.85rem; color:var(--fg2); word-break:break-all;">Attachment loaded. <a href="${Utils.escapeHTML(m.content)}" download="${Utils.escapeHTML(m.attachmentName || 'download')}" style="color:var(--accent); text-decoration:underline;">Download File</a></div>`;
            }

            preview.style.display = 'block';
            requestAnimationFrame(() => { preview.style.opacity = '1'; });
            if (btn) btn.style.display = 'none';
        } catch(e) {
            UI.showToast("Failed to load attachment.", 'error');
            if (btn) { btn.disabled = false; btn.innerText = "Load"; }
        }
    },

    updateHeader: function() {
        if (!State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        const nEl = document.getElementById('activeChatName');
        const sEl = document.getElementById('activeChatStatus');
        const mv = document.getElementById('mainView');

        if(c._type === 'gcs' && c.config?.theme) {
            mv.style.setProperty('--chat-fg', c.config.theme.text || 'var(--fg)');
            mv.style.setProperty('--chat-accent', c.config.theme.accent || 'var(--accent)');
            if(c.config.theme.background) {
                if(c.config.theme.background.startsWith('data:') || c.config.theme.background.startsWith('/api/media?')) {
                    mv.style.setProperty('--chat-wp', `url(${Utils.escapeHTML(c.config.theme.background)})`);
                    mv.style.setProperty('--chat-wp-dim', '0.55'); mv.style.setProperty('--chat-bg', 'transparent');
                } else {
                    mv.style.setProperty('--chat-bg', c.config.theme.background);
                    mv.style.removeProperty('--chat-wp'); mv.style.removeProperty('--chat-wp-dim');
                }
            }
        } else {
            mv.style.removeProperty('--chat-fg'); mv.style.removeProperty('--chat-accent');
            mv.style.removeProperty('--chat-bg'); mv.style.removeProperty('--chat-wp'); mv.style.removeProperty('--chat-wp-dim');
        }

        const avWrap = document.getElementById('activeChatAvatarWrap');
        const avEl = document.getElementById('activeChatAvatar');

        if (c._type === 'dms') {
            const otherUid = Object.keys(c.members).find(id => id !== State.user.uid);
            if (avWrap && avEl) {
                avWrap.style.display = 'flex';
                if (otherUid === BOT_UID) {
                    avEl.innerHTML = `<img src="${BOT_PFP}">`;
                    avWrap.removeAttribute('data-uid');
                } else if (otherUid) {
                    const acc = State.accountsCache[otherUid] || {};
                    const avHtml = acc.avatar ? `<img src="${Utils.escapeHTML(acc.avatar)}">` : (acc.displayName || otherUid).charAt(0).toUpperCase();
                    avEl.innerHTML = avHtml;
                    avWrap.setAttribute('data-uid', otherUid);
                }
            }
            if (otherUid === BOT_UID) {
                nEl.innerHTML = `BSMS Web ${Utils.getBadgesHTML(BOT_UID)}`;
                sEl.innerText = "System Account";
            } else {
                const acc = State.accountsCache[otherUid] || { displayName: otherUid };
                const nColor = Utils.nameColor(otherUid);
                const colorStyle = nColor ? `style="color:${nColor}; font-weight:bold;"` : '';
                nEl.innerHTML = `<span ${colorStyle}>${Utils.escapeHTML(acc.displayName || otherUid)}</span> ${Utils.getBadgesHTML(otherUid)}`;
                
                if (acc.account_status === 'banned') {
                    sEl.innerText = "Account Banned";
                    sEl.style.color = "#ef4444";
                } else {
                    const isOnline = State.usersCache[otherUid]?.status === 'online' && (Date.now() - (State.usersCache[otherUid]?.lastSeen || 0) < 25000);
                    if (isOnline) {
                        sEl.innerText = "Online";
                        sEl.style.color = "#22c55e";
                    } else {
                        sEl.innerText = Utils.formatLastSeen(State.usersCache[otherUid]?.lastSeen);
                        sEl.style.color = "var(--fg2)";
                    }
                }
            }
            UI.show('btnHideDM');
            UI.hide('btnLeaveGroup');
            UI.show('btnGroupSettings');
            document.getElementById('activeChatInfo').classList.remove('clickable');
            document.getElementById('activeChatInfo').onclick = null;
        } else {
            if (avWrap && avEl) {
                avWrap.style.display = 'flex';
                avWrap.removeAttribute('data-uid');
                if (c.config?.icon) {
                    avEl.innerHTML = `<img src="${Utils.escapeHTML(c.config.icon)}">`;
                } else {
                    avEl.innerHTML = (c.name || "G").charAt(0).toUpperCase();
                }
            }
            nEl.innerText = c.name || "Group";
            let onlineCount = 0;
            const validMemberIds = Object.keys(c.members).filter(mId => State.accountsCache[mId]?.account_status !== 'banned');
            for(let mId of validMemberIds) { if(State.usersCache[mId]?.status === 'online') onlineCount++; }
            sEl.innerText = `${validMemberIds.length} members - ${onlineCount} online`;
            sEl.style.color = "var(--fg2)";
            UI.hide('btnHideDM');
            UI.show('btnLeaveGroup');
            UI.show('btnGroupSettings');
            document.getElementById('activeChatInfo').classList.add('clickable');
            document.getElementById('activeChatInfo').onclick = () => GroupManager.openMembersList();
        }

        // Join requests banner in conversation container for group owner
        const reqBanner = document.getElementById('joinRequestsBanner');
        if (reqBanner) {
            if (c._type === 'gcs' && State.currentRole === 'owner' && c.joinRequests && Object.keys(c.joinRequests).length > 0) {
                const reqCount = Object.keys(c.joinRequests).length;
                reqBanner.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <svg class="ic" style="width:20px; height:20px; fill:var(--accent); flex-shrink:0;"><use href="#ico-crown"></use></svg>
                        <span><strong>${reqCount} new join request${reqCount > 1 ? 's' : ''}</strong> pending for this group.</span>
                    </div>
                    <button class="btn sec" style="width:auto; padding:5px 14px; font-size:0.9rem; margin:0;" onclick="GroupManager.openJoinRequestsPopup()">View Requests</button>
                `;
                reqBanner.style.display = 'flex';
            } else {
                reqBanner.style.display = 'none';
            }
        }


        const pb = document.getElementById('pinnedBanner');
        let pinnedFound = false;
        if(c.messages) {
            for(let mid in c.messages) {
                if(c.messages[mid].status?.pinned) {
                    const m = c.messages[mid];
                    pb.style.display = 'flex';
                    pb.dataset.msgid = mid;
                    document.getElementById('pinnedText').innerText = m.contentType === 'audio' ? "Voice message" : (m.contentType === 'file' ? "Attachment" : (m.status.deletedByMod ? "Deleted message" : (m.status.unsent ? "Unsent message" : (m.contentType === 'poll' ? m.content.pollQuestion : m.content))));
                    pinnedFound = true;
                    if (State.currentRole === 'owner' || State.currentRole === 'moderator') UI.show('btnUnpinBtn');
                    else UI.hide('btnUnpinBtn');
                    break;
                }
            }
        }
        if(!pinnedFound) pb.style.display = 'none';
    },

    updateReadReceipts: function() {
        if (!State.activeChannelId) return;
        document.querySelectorAll('.msg-status').forEach(el => {
            if (el.innerText !== 'Sending...') el.innerText = "";
        });
        const myEls = document.querySelectorAll('.msg-row.mine');
        if (myEls.length === 0) return;

        const lastEl = myEls[myEls.length - 1];
        const mId = lastEl.id.replace('msg-', '');

        const c = State.channels[State.activeChannelId];
        if (c && c.messages && c.messages[mId]) {
            const m = c.messages[mId];
            if (m.status?.temp) return; 
            
            const stat = document.getElementById(`stat-${mId}`);
            if (!stat) return;

            const readCount = m.readReceipts ? Object.values(m.readReceipts).filter(v => v === true).length : 1;
            if (readCount > 1) {
                if (c._type === 'dms') stat.innerText = "Read";
                else stat.innerText = `Read by ${readCount - 1} users`;
            } else {
                stat.innerText = "Delivered";
            }
        }
    },

    mergeMessages: function(newMsgs, targetCid) {
        if (targetCid && targetCid !== State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        if(!c) return;
        if(!c.messages) c.messages = {};
        
        let needsScroll = false;
        let lastSender = null;

        for (let mid in newMsgs) {
            const m = newMsgs[mid];
            if (!m) continue;

            const existingEl = document.getElementById(`msg-${mid}`);

            if (existingEl) {
                const old = c.messages[mid];
                // Preserve already-loaded attachment URLs when polling intentionally omits their content.
                if (old?.content && !m.content && m.hasContent) m.content = old.content;
                const oldVisual = old ? { ...old, readReceipts: undefined } : null;
                const newVisual = { ...m, readReceipts: undefined };
                if (JSON.stringify(oldVisual) !== JSON.stringify(newVisual)) {
                    c.messages[mid] = m;
                    existingEl.outerHTML = this.buildMessageHTML(mid, m);
                    if (m.contentType === 'audio' && !m.status?.unsent && !m.status?.deletedByMod) AudioManager.bindPlayer(mid);
                    if(ScrollManager.observer) ScrollManager.observer.observe(document.getElementById(`msg-${mid}`));
                } else {
                    c.messages[mid] = { ...old, ...m, content: old?.content || m.content };
                }
            } else {
                let foundTemp = null;
                for (let tempKey in c.messages) {
                    if (tempKey.startsWith('temp-') && c.messages[tempKey].content === m.content && c.messages[tempKey].senderUid === m.senderUid) {
                        foundTemp = tempKey;
                        break;
                    }
                }

                if (foundTemp) {
                    c.messages[mid] = m;
                    delete c.messages[foundTemp];
                    const tempEl = document.getElementById(`msg-${foundTemp}`);
                    if (tempEl) {
                        tempEl.id = `msg-${mid}`;
                        tempEl.classList.remove('sending');
                        tempEl.outerHTML = this.buildMessageHTML(mid, m);
                        if (m.contentType === 'audio' && !m.status?.unsent && !m.status?.deletedByMod) AudioManager.bindPlayer(mid);
                        if(ScrollManager.observer) ScrollManager.observer.observe(document.getElementById(`msg-${mid}`));
                    }
                } else {
                    c.messages[mid] = m;
                    this.renderMessageNode(mid, m);
                    needsScroll = true;
                    lastSender = m.senderUid;
                    if (m.contentType === 'audio' && !m.status?.unsent && !m.status?.deletedByMod) AudioManager.bindPlayer(mid);
                    if(ScrollManager.observer) ScrollManager.observer.observe(document.getElementById(`msg-${mid}`));
                    if (m.senderUid !== State.user.uid && Date.now() - m.timestamp < 5000) AudioFX.receive();
                }
            }
        }
        
        if (needsScroll) ScrollManager.onNewMessage(lastSender === State.user.uid);
        this.updateReadReceipts();
        this.updateHeader();

        // Mark incoming messages in view as read
        if (document.visibilityState === 'visible' && !State.isScrolledUp && State.activeChannelId) {
            const keys = Object.keys(c.messages || {});
            if (keys.length > 0) {
                const lastMid = keys[keys.length - 1];
                const lastM = c.messages[lastMid];
                if (lastM && lastM.senderUid !== State.user.uid && (!lastM.readReceipts || lastM.readReceipts[State.user.uid] !== true)) {
                    ApiClient.call('readReceipt', { cid: State.activeChannelId, type: State.activeType, msgId: lastMid });
                    lastM.readReceipts = lastM.readReceipts || {};
                    lastM.readReceipts[State.user.uid] = true;
                    ChatManager.updateReadReceipts();
                }
            }
        }
    },

    renderMessageNode: function(msgId, m) {
        const log = document.getElementById('chatLog');
        const dStr = Utils.formatDateDivider(m.timestamp);
        if (dStr !== State.lastRenderedDate) {
            const div = document.createElement('div');
            div.className = 'date-div'; div.innerHTML = `<span>${dStr}</span>`;
            log.appendChild(div);
            State.lastRenderedDate = dStr;
        }
        log.insertAdjacentHTML('beforeend', this.buildMessageHTML(msgId, m));
        if (window.LinkPreviewManager) LinkPreviewManager.loadAllPending();
    },

    buildMessageHTML: function(msgId, m) {
        const isMine = m.senderUid === State.user.uid;
        const isSysBot = m.senderUid === BOT_UID;
        const c = State.channels[State.activeChannelId];
        const isGroup = c._type === 'gcs';

        let cls = isMine ? 'mine' : 'theirs';
        if (isSysBot) cls += ' system-bot';
        if (m.status?.deletedByMod) cls += ' deleted';
        if (m.status?.temp) cls += ' sending';

        let pfpElement = '';
        if (!isMine) {
            if (isSysBot) {
                pfpElement = `<div class="msg-pfp-trigger" title="BSMS Web" style="margin-bottom:4px;">
                    <div class="c-av" style="width:34px;height:34px;"><div class="c-av-inner"><img src="${BOT_PFP}"></div></div>
                </div>`;
            } else {
                const sAcc = State.accountsCache[m.senderUid] || {};
                const sDisp = Utils.displayName(m.senderUid, c);
                const sAvHtml = sAcc.avatar ? `<img src="${Utils.escapeHTML(sAcc.avatar)}">` : sDisp.charAt(0).toUpperCase();
                pfpElement = `<div class="msg-pfp-trigger user-pfp-trigger" data-uid="${m.senderUid}" title="Click or hover to view profile" style="margin-bottom:4px;">
                    <div class="c-av" style="width:34px;height:34px;font-size:0.95rem;">
                        <div class="c-av-inner">${sAvHtml}</div>
                    </div>
                </div>`;
            }
        }

        let html = `<div class="msg-row ${cls}" id="msg-${msgId}">`;
        if (!isMine) html += `<div class="msg-theirs-container">${pfpElement}<div class="msg-theirs-body" style="flex:1; overflow:hidden;">`;

        if (!isSysBot) {
            const disp = Utils.displayName(m.senderUid, c);
            const nColor = Utils.nameColor(m.senderUid) || m.senderColor;
            const colorStyle = nColor ? `style="color:${nColor}; font-weight:bold;"` : '';
            if (!isMine) {
                html += `<div class="msg-author user-pfp-trigger" data-uid="${m.senderUid}" ${colorStyle} title="Click or hover to view profile" onclick="SearchManager.startDM('${m.senderUid}')">${Utils.escapeHTML(disp)}</div>`;
            } else {
                html += `<div class="msg-author my-msg-author" data-uid="${m.senderUid}" style="align-self:flex-end; text-align:right; margin:0 12px 4px; ${nColor ? `color:${nColor}; font-weight:bold;` : ''}" title="You">${Utils.escapeHTML(disp)}</div>`;
            }
        }
        if (isSysBot) html += `<div class="msg-author">BSMS Web</div>`;

        let content = '';
        const isBannedSender = m.senderBanned || State.accountsCache[m.senderUid]?.account_status === 'banned';
        if (isBannedSender) {
            content = `<div class="sys-msg" style="color:#ef4444; margin:0; font-style:italic;">[This user was banned]</div>`;
            html += `<div class="msg-bubble-wrap">${content}</div>`;
        } else if (m.status?.deletedByMod) {
            content = `<div class="sys-msg" style="color:#ef4444; margin:0;">[This message was deleted by a moderator]</div>`;
            html += `<div class="msg-bubble-wrap">${content}</div>`;
        } else if (m.status?.unsent) {
            const disp = Utils.displayName(m.senderUid, c);
            content = `<div class="sys-msg" style="margin:0;">${Utils.escapeHTML(disp)} unsent a message</div>`;
            html += `<div class="msg-bubble-wrap">${content}</div>`;
        } else {
            if (m.status?.repliedTo && m.status.repliedTo !== false) {
                const repMsg = c.messages[m.status.repliedTo];
                if(repMsg) {
                    const repDisp = Utils.displayName(repMsg.senderUid, c);
                    const repColor = Utils.nameColor(repMsg.senderUid) || repMsg.senderColor;
                    const repColorStyle = repColor ? `style="color:${repColor}; font-weight:bold;"` : '';
                    let repSnippet = repMsg.status?.unsent ? "Unsent message" : (repMsg.status?.deletedByMod ? "Deleted message" : (repMsg.contentType === 'text' ? repMsg.content : (repMsg.contentType === 'poll' ? repMsg.content.pollQuestion : (repMsg.contentType === 'audio' ? 'Voice message' : 'Attachment'))));
                    content += `<div class="quote-box" onclick="ScrollManager.scrollToMessage('${m.status.repliedTo}')">
                        <strong ${repColorStyle}>${Utils.escapeHTML(repDisp)}</strong>
                        ${Utils.escapeHTML(repSnippet)}
                    </div>`;
                }
            }

            if (m.contentType === 'audio') {
                content += `
                <div class="audio-player">
                    <button class="ap-btn" id="ap-btn-${msgId}"><svg class="ic"><use href="#ico-play"></use></svg></button>
                    <div class="ap-track"><div class="ap-progress" id="ap-prog-${msgId}"></div></div>
                    <div class="ap-time" id="ap-time-${msgId}">0:00</div>
                    <audio id="ap-src-${msgId}" src="${Utils.escapeHTML(m.content)}"></audio>
                </div>`;
            } else if (m.contentType === 'file' || m.contentType === 'image') {
                content += `
                <div class="attachment-item" id="att-wrap-${msgId}" style="background:rgba(0,0,0,0.18); border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-top:4px; max-width:320px;">
                    <div style="display:flex; align-items:center; gap:8px; color:var(--fg2); font-size:0.9rem;">
                        <svg class="ic" style="width:18px; height:18px; flex-shrink:0;"><use href="#ico-file"></use></svg>
                        <span>File and image attachments are disabled. This attachment is unavailable.</span>
                    </div>
                </div>`;
            } else if (m.contentType === 'invite') {
                let inv = m.content;
                if (typeof inv === 'string') {
                    try { inv = JSON.parse(inv); } catch(e) { inv = { groupName: m.content }; }
                }
                const gCid = inv.groupCid || '';
                const gName = inv.groupName || 'Group Chat';
                const gCode = inv.joinCode || '';
                const isMember = Boolean(State.channels[gCid]);
                const count = isMember ? Object.keys(State.channels[gCid].members).length : (inv.memberCount || 1);
                const avHtml = inv.groupIcon ? `<img src="${Utils.escapeHTML(inv.groupIcon)}">` : gName.charAt(0).toUpperCase();

                content += `
                <div class="invite-card">
                    <div class="invite-card-top">
                        <div class="invite-card-icon">${avHtml}</div>
                        <div class="invite-card-info">
                            <div class="invite-card-name" title="${Utils.escapeHTML(gName)}">${Utils.escapeHTML(gName)}</div>
                            <div class="invite-card-members">${count} member${count === 1 ? '' : 's'}</div>
                        </div>
                    </div>
                    ${isMember ? `
                        <button class="btn sec invite-card-btn" onclick="ChatManager.open('${gCid}')">Open Group</button>
                    ` : `
                        <button class="btn invite-card-btn" onclick="GroupManager.joinByInviteCard('${Utils.escapeHTML(gCode)}', '${gCid}')">Join Group</button>
                    `}
                </div>`;
            } else if (m.contentType === 'poll') {
                content += `<div style="font-weight:bold; margin-bottom:10px;">${Utils.escapeHTML(m.content.pollQuestion)}</div>`;
                let totalVotes = m.content.pollVotes ? Object.keys(m.content.pollVotes).length : 0;

                for(let optKey in m.content.pollOptions) {
                    let optVotes = 0; let iVoted = false;
                    if(m.content.pollVotes) {
                        for(let u in m.content.pollVotes) {
                            if(m.content.pollVotes[u] === optKey) {
                                optVotes++;
                                if(u === State.user.uid) iVoted = true;
                            }
                        }
                    }
                    const pct = totalVotes > 0 ? Math.round((optVotes / totalVotes) * 100) : 0;
                    content += `
                    <div class="poll-opt" style="border-color:${iVoted ? 'var(--chat-accent, var(--accent))' : 'transparent'};" onclick="ComposerManager.vote('${msgId}', '${optKey}')">
                        <div class="bar" style="width:${pct}%;"></div>
                        <div class="content"><span>${Utils.escapeHTML(m.content.pollOptions[optKey])}</span><span>${pct}%</span></div>
                    </div>`;
                }
            } else {
                const urls = Utils.extractUrls(m.content);
                const textWithLinks = Utils.linkifyText(m.content);
                content += `<div class="msg-text">${textWithLinks}</div>`;
                if (urls.length > 0) {
                    content += `<div class="link-preview-container" id="lp-${msgId}" data-url="${Utils.escapeHTML(urls[0])}"></div>`;
                }
            }

            const timeStr = Utils.formatTime(m.timestamp);
            const editStr = m.status?.edited ? `(Edited) ` : '';

            html += `<div class="msg-bubble-wrap">
                <div class="msg-bubble">${content}<div class="msg-meta">${editStr}${timeStr}</div></div>`;
            if (!isSysBot) html += `<div class="msg-ctx-trigger" onclick="ContextMenu.open(event, '${msgId}')"><svg class="ic"><use href="#ico-dots"></use></svg></div>`;

            if(m.reactions) {
                let rxCounts = {}; let selfReactions = {};
                for(let u in m.reactions) {
                    let e = m.reactions[u];
                    rxCounts[e] = (rxCounts[e] || 0) + 1;
                    if(u === State.user.uid) selfReactions[e] = true;
                }
                html += `<div class="rx-rack">`;
                for(let e in rxCounts) {
                    let rcls = selfReactions[e] ? 'rx-badge self' : 'rx-badge';
                    html += `<div class="${rcls}" onclick="ContextMenu.react('${e}', '${msgId}')">${e} <span class="rx-count">${rxCounts[e]>1?rxCounts[e]:''}</span></div>`;
                }
                html += `</div>`;
            }

            html += `</div>`;
        }

        if (isMine) html += `<div class="msg-status" id="stat-${msgId}"></div>`;
        if (!isMine) html += `</div></div>`;
        html += `</div>`;
        return html;
    },

    renderTyping: function(members) {
        const ind = document.getElementById('typingIndicator');
        if (!members) { ind.innerText = ""; return; }

        let active = [];
        const c = State.channels[State.activeChannelId];
        for (let uid in members) {
            if (uid !== State.user.uid && members[uid].isTyping) {
                active.push(Utils.displayName(uid, c));
            }
        }

        if (active.length === 0) ind.innerText = "";
        else if (active.length === 1) ind.innerText = `${active[0]} is typing...`;
        else if (active.length === 2) ind.innerText = `${active[0]} and ${active[1]} are typing...`;
        else if (active.length === 3) ind.innerText = `${active[0]}, ${active[1]}, and ${active[2]} are typing...`;
        else ind.innerText = "Several people are typing...";
    }
};

const LinkPreviewManager = {
    cache: {},

    loadForMessage: async function(container) {
        if (!container || container.dataset.loaded) return;
        container.dataset.loaded = "true";
        const url = container.dataset.url;
        if (!url) return;

        if (this.cache[url]) {
            this.renderCard(container, this.cache[url]);
            return;
        }

        container.innerHTML = `
            <div class="link-card-shimmer">
                <div class="shimmer-line line-site"></div>
                <div class="shimmer-line line-title"></div>
                <div class="shimmer-line line-desc"></div>
            </div>`;

        try {
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
            if (res.ok) {
                const data = await res.json();
                this.cache[url] = data;
                this.renderCard(container, data);
            } else {
                container.remove();
            }
        } catch (e) {
            console.error("[BSMS Web :: LinkPreview] Error loading preview:", e);
            container.remove();
        }
    },

    renderCard: function(container, data) {
        if (!data || !data.title) {
            container.remove();
            return;
        }

        const safeUrl = Utils.escapeHTML(data.url || '#');
        const safeTitle = Utils.escapeHTML(data.title || '');
        const safeDesc = Utils.escapeHTML(data.description || '');
        let safeSite = Utils.escapeHTML(data.siteName || '');
        if (!safeSite) {
            try { safeSite = new URL(data.url).hostname; } catch(e) { safeSite = 'Website'; }
        }
        const hasImage = Boolean(data.image);

        let imgHtml = '';
        if (hasImage) {
            imgHtml = `<div class="lp-img-wrap"><img src="${Utils.escapeHTML(data.image)}" alt="Preview" loading="lazy" onerror="this.parentElement.remove()"></div>`;
        }

        container.innerHTML = `
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-preview-card ${hasImage ? 'has-img' : ''}">
                ${imgHtml}
                <div class="lp-content">
                    <div class="lp-site">
                        <svg class="ic lp-site-ic" viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                        <span>${safeSite}</span>
                    </div>
                    <div class="lp-title">${safeTitle}</div>
                    ${safeDesc ? `<div class="lp-desc">${safeDesc}</div>` : ''}
                </div>
            </a>`;
        if (window.ScrollManager) ScrollManager.scrollToBottom(false);
    },

    loadAllPending: function() {
        document.querySelectorAll('.link-preview-container:not([data-loaded])').forEach(el => {
            this.loadForMessage(el);
        });
    }
};

const ProfileHoverManager = {
    activeUid: null,
    hideTimer: null,
    isHoveringPopup: false,
    isLocked: false,

    init: function() {
        const popup = document.getElementById('pfpHoverPopup');
        if (!popup) return;

        popup.addEventListener('mouseenter', () => {
            this.isHoveringPopup = true;
            clearTimeout(this.hideTimer);
        });

        popup.addEventListener('mouseleave', () => {
            this.isHoveringPopup = false;
            this.scheduleHide(150);
        });

        const btn = document.getElementById('phpViewProfileBtn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.activeUid) {
                    const acc = State.accountsCache[this.activeUid] || {};
                    const username = acc.username || this.activeUid;
                    window.location.href = `/users#${encodeURIComponent(username)}`;
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!popup.contains(e.target) && !e.target.closest('.user-pfp-trigger')) {
                this.hide();
            }
        });

        document.addEventListener('mouseover', (e) => {
            const trigger = e.target.closest('.user-pfp-trigger');
            if (trigger && trigger.dataset.uid && trigger.dataset.uid !== BOT_UID) {
                clearTimeout(this.hideTimer);
                this.show(trigger.dataset.uid, e.clientX, e.clientY);
            }
        });

        document.addEventListener('mousemove', (e) => {
            const trigger = e.target.closest('.user-pfp-trigger');
            if (trigger && trigger.dataset.uid && trigger.dataset.uid !== BOT_UID) {
                if (!this.isLocked) {
                    this.updatePosition(e.clientX, e.clientY);
                }
            }
        });

        document.addEventListener('mouseout', (e) => {
            const trigger = e.target.closest('.user-pfp-trigger');
            if (trigger && !this.isLocked) {
                this.scheduleHide(250);
            }
        });

        document.addEventListener('click', (e) => {
            const trigger = e.target.closest('.user-pfp-trigger');
            if (trigger && trigger.dataset.uid && trigger.dataset.uid !== BOT_UID) {
                e.stopPropagation();
                this.isLocked = true;
                this.show(trigger.dataset.uid, e.clientX, e.clientY);
            } else if (!e.target.closest('#pfpHoverPopup')) {
                this.isLocked = false;
            }
        });
    },

    show: function(uid, mouseX, mouseY) {
        if (!uid || uid === BOT_UID) return;
        this.activeUid = uid;
        const popup = document.getElementById('pfpHoverPopup');
        if (!popup) return;

        const acc = State.accountsCache[uid] || {};
        const dName = acc.displayName || acc.username || uid;
        const uName = acc.username || uid;
        const avHtml = acc.avatar ? `<img src="${Utils.escapeHTML(acc.avatar)}">` : dName.charAt(0).toUpperCase();

        const avEl = document.getElementById('phpAvatar');
        const nameEl = document.getElementById('phpName');
        const uEl = document.getElementById('phpUsername');

        const nColor = Utils.nameColor(uid);
        const colorStyle = nColor ? `style="color:${nColor}; font-weight:bold;"` : '';
        if (avEl) avEl.innerHTML = avHtml;
        if (nameEl) nameEl.innerHTML = `<span ${colorStyle}>${Utils.escapeHTML(dName)}</span> ${Utils.getBadgesHTML(uid)}`;
        if (uEl) uEl.textContent = `@${uName}`;

        popup.style.display = 'block';
        this.updatePosition(mouseX, mouseY);
    },

    updatePosition: function(mouseX, mouseY) {
        const popup = document.getElementById('pfpHoverPopup');
        if (!popup || popup.style.display === 'none') return;

        const popW = 250;
        const popH = popup.offsetHeight || 130;
        let left = mouseX + 14;
        let top = mouseY + 14;

        if (left + popW > window.innerWidth - 12) {
            left = mouseX - popW - 14;
        }
        if (top + popH > window.innerHeight - 12) {
            top = mouseY - popH - 14;
        }
        if (left < 10) left = 10;
        if (top < 10) top = 10;

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    },

    scheduleHide: function(delay = 200) {
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => {
            if (!this.isHoveringPopup && !this.isLocked) {
                this.hide();
            }
        }, delay);
    },

    hide: function() {
        this.isLocked = false;
        const popup = document.getElementById('pfpHoverPopup');
        if (popup) popup.style.display = 'none';
        this.activeUid = null;
    }
};

const AuthManager = {
    init: async function() {
        UI.setLoad(5, "Verifying local session");
        Router.consumeInitialHash();
        
        try {
            const prefsStr = localStorage.getItem('bsms_rooms_prefs');
            if(prefsStr) {
                const prefs = JSON.parse(prefsStr);
                if(prefs.mode === 'light' || (prefs.mode === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
                    document.body.classList.add('light-mode');
                }
            }
        } catch(e) {}

        const sessionStr = localStorage.getItem('bsms_auth_session');
        if (!sessionStr) { AuthManager.reject(); return; }

        try {
            const sess = JSON.parse(sessionStr);
            if (!sess.loggedIn || (!sess.username && !sess.uid)) { AuthManager.reject(); return; }

            const sid = (localStorage.getItem('session_id') || sess.sessionId || "").trim();
            if (!sid) { AuthManager.reject(); return; }
            if (!localStorage.getItem('session_id')) localStorage.setItem('session_id', sid);

            State.user = { 
                uid: sess.uid || sess.username, 
                username: sess.username, 
                displayName: sess.displayName,
                nameColor: sess.nameColor || sess.chatColor || null,
                chatColor: sess.nameColor || sess.chatColor || null
            };

            UI.setLoad(40, "Connecting to Server");
            const statusRes = await ApiClient.call('status', { status: 'online' });
            if (!statusRes) return;
            
            document.getElementById('loginModal').classList.remove('show');
            UI.setLoad(70, "Downloading Conversations");

            await PollingManager.start();
            SearchManager.init();
            ScrollManager.init();
            ContextMenu.init();
            Router.init();
            ProfileHoverManager.init();

            UI.setLoad(90, "Opening conversation");
            await Router.resolvePendingRoute();
            if (State.activeChannelId) {
                let loaded = await (State.activeMessageLoad || PollingManager.syncMessages());
                while (!loaded) {
                    UI.setLoad(95, "Waiting for chat data");
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    loaded = await PollingManager.syncMessages();
                }
            }
            UI.setLoad(100, "Ready");
            if (window.innerWidth <= 768) {
                if (State.activeChannelId) {
                    document.getElementById('sidebar').classList.add('hidden');
                } else {
                    document.getElementById('sidebar').classList.remove('hidden');
                }
            } else {
                document.getElementById('sidebar').classList.remove('hidden');
            }

            const inp = document.getElementById('msgInput');
            if (inp) {
                inp.addEventListener('input', () => {
                    let txt = inp.innerText;
                    if(txt.length > 100) { inp.innerText = txt.substring(0, 100); Utils.setCaretToEnd(inp); txt = inp.innerText; }
                    const cc = document.getElementById('charCounter');
                    cc.innerText = `${txt.length}/100`;
                    cc.className = txt.length === 100 ? 'danger' : (txt.length >= 80 ? 'warn' : '');

                    if(State.activeChannelId) localStorage.setItem('draft_' + State.activeChannelId, txt);

                    if(State.activeChannelId && State.activeType) {
                        clearTimeout(State.typingTimeout);
                        if (!State.isTypingEmitted) {
                            ApiClient.call('typing', { cid: State.activeChannelId, type: State.activeType, isTyping: true });
                            State.isTypingEmitted = true;
                        }
                        State.typingTimeout = setTimeout(() => {
                            if(State.activeChannelId) ApiClient.call('typing', { cid: State.activeChannelId, type: State.activeType, isTyping: false });
                            State.isTypingEmitted = false;
                        }, 2000);
                    }
                });
                inp.addEventListener('keydown', e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ComposerManager.send(); } });
            }

            document.addEventListener("visibilitychange", () => {
                if (document.visibilityState === 'visible') ApiClient.call('status', { status: 'online' });
                else ApiClient.call('status', { status: 'offline' });
            });

            const handleDisconnect = () => {
                const sid = localStorage.getItem('session_id') || "";
                if (!sid) return;
                fetch(`/api/chat?action=status`, {
                    method: 'POST', keepalive: true,
                    headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
                    body: JSON.stringify({ status: 'offline' })
                });
                if (State.activeChannelId) {
                    fetch(`/api/chat?action=typing`, {
                        method: 'POST', keepalive: true,
                        headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
                        body: JSON.stringify({ cid: State.activeChannelId, type: State.activeType, isTyping: false })
                    });
                }
            };
            window.addEventListener('beforeunload', handleDisconnect);
            window.addEventListener('pagehide', handleDisconnect);

        } catch (err) {
            console.error("[BSMS Web :: Auth]", err);
            AuthManager.reject();
        }
    },
    reject: function() {
        PollingManager.stop();
        if (State.syncInterval) clearInterval(State.syncInterval);
        if (State.msgInterval) clearInterval(State.msgInterval);
        UI.setLoad(100, "Ready");
        document.getElementById('loginModal').classList.add('show');
    },
    quickDemoLogin: async function() {
        UI.setLoad(20, "Creating demo account");
        try {
            const randId = Math.floor(1000 + Math.random() * 9000);
            const username = `Student_${randId}`;
            const password = `Student_${randId}_Pass!`;
            
            // Register new demo user
            const regRes = await fetch('/api/auth?action=register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });
            const regData = await regRes.json();
            if (!regRes.ok || regData.error) throw new Error(regData.error || 'Registration failed');

            const sid = regData.sessionId;
            const uid = regData.uid;

            // Set default name color to Red (#ef4444)
            await fetch('/api/auth?action=updateProfile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': sid
                },
                body: JSON.stringify({
                    displayName: username,
                    nameColor: '#ef4444',
                    chatColor: '#ef4444'
                })
            });

            const sessionObj = {
                loggedIn: true,
                sessionId: sid,
                uid: uid,
                username: username,
                displayName: username,
                nameColor: '#ef4444',
                chatColor: '#ef4444'
            };

            localStorage.setItem('session_id', sid);
            localStorage.setItem('bsms_auth_session', JSON.stringify(sessionObj));
            localStorage.setItem('bsms_session', JSON.stringify(sessionObj));

            document.getElementById('loginModal').classList.remove('show');
            await AuthManager.init();
            UI.showToast(`Logged in as ${username} with Red name color!`, 'success');
        } catch (err) {
            console.error('Quick login error:', err);
            UI.showToast(err.message || 'Quick login failed', 'error');
        }
    }
};

const ComposerManager = {
    attachFile: function(e) {
        if (e?.target) e.target.value = '';
        State.attachmentData = null;
        State.attachmentName = null;
        UI.hide('attachmentPreview');
        UI.showToast("Sending files and images in chat is disabled.", "error");
        return;
        const f = e.target.files[0];
        if(!f) return;
        if(f.size > 25*1024*1024) { UI.showToast("File exceeds 25MB maximum limit.", 'error'); return; }

        const r = new FileReader();
        r.onload = () => {
            State.attachmentData = r.result;
            State.attachmentName = f.name;
            UI.show('attachmentPreview');
            document.getElementById('attName').innerText = f.name;
            if(f.type.startsWith('image/')) {
                document.getElementById('attThmb').style.backgroundImage = `url(${State.attachmentData})`;
                document.getElementById('attThmb').innerHTML = '';
            } else {
                document.getElementById('attThmb').style.backgroundImage = 'none';
                document.getElementById('attThmb').innerHTML = `<svg class="ic" style="width:100%;height:100%;fill:#fff;"><use href="#ico-file"></use></svg>`;
            }
        };
        r.readAsDataURL(f);
    },
    clearAttachment: function() {
        State.attachmentData = null; State.attachmentName = null;
        document.getElementById('fileUploadInput').value = '';
        UI.hide('attachmentPreview');
    },

    send: async function() {
        if (!State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];

        if (c._type === 'dms' && State.isCooldown) { UI.showToast("Please wait before sending another message.", 'error'); return; }

        const inp = document.getElementById('msgInput');
        const txt = inp.innerText.trim().substring(0,100);
        if (State.attachmentData) {
            UI.showToast("Sending files and images in chat is disabled.", "error");
            this.clearAttachment();
            return;
        }
        if (!txt) return;

        const btn = document.getElementById('btnSend');

        if (State.editContext) {
            try {
                btn.disabled = true;
                await ApiClient.call('action', { action: 'edit', cid: c._id, type: c._type, msgId: State.editContext, content: txt });
                this.cancelEdit();
                PollingManager.syncMessages();
            } catch(e) { UI.showToast(e.message || "Failed to edit message.", 'error'); }
            finally { btn.disabled = false; inp.focus(); }
            return;
        }

        if(c._type === 'dms') {
            State.isCooldown = true; btn.classList.add('greyed');
            setTimeout(() => { State.isCooldown = false; btn.classList.remove('greyed'); }, 5000);
        }

        const tempId = 'temp-' + Date.now();
        const tempMsg = {
            senderUid: State.user.uid,
            timestamp: Date.now(),
            content: State.attachmentData || txt,
            contentType: State.attachmentData ? 'file' : 'text',
            attachmentName: State.attachmentName,
            status: { temp: true, repliedTo: State.replyContext || false }
        };

        c.messages[tempId] = tempMsg;
        ChatManager.renderMessageNode(tempId, tempMsg);
        document.getElementById(`stat-${tempId}`).innerText = "Sending...";
        ScrollManager.scrollToBottom(true);
        AudioFX.send();
        
        inp.innerText = "";
        const rplCtx = State.replyContext;
        this.cancelReply();
        this.clearAttachment();
        document.getElementById('charCounter').innerText = "0/100";
        document.getElementById('charCounter').className = "";
        localStorage.removeItem('draft_' + c._id);
        ApiClient.call('typing', { cid: c._id, type: c._type, isTyping: false });

        btn.disabled = true;
        try {
            const res = await ApiClient.call('sendMessage', {
                cid: c._id, type: c._type,
                content: tempMsg.content,
                contentType: tempMsg.contentType,
                attachmentName: tempMsg.attachmentName,
                repliedTo: rplCtx
            });
            
            const realId = res.messageId;
            delete tempMsg.status.temp;
            c.messages[realId] = tempMsg;
            delete c.messages[tempId];

            const el = document.getElementById(`msg-${tempId}`);
            if (el) {
                el.id = `msg-${realId}`;
                el.classList.remove('sending');
                const statEl = document.getElementById(`stat-${tempId}`);
                if (statEl) {
                    statEl.id = `stat-${realId}`;
                    statEl.innerText = "Sent";
                }
            }
        } catch(e) { 
            UI.showToast(e.message || "Failed to send message.", 'error'); 
            const el = document.getElementById(`msg-${tempId}`);
            if(el) el.remove();
            delete c.messages[tempId];
            if(c._type === 'dms') { State.isCooldown = false; btn.classList.remove('greyed'); }
        }
        btn.disabled = false; inp.focus();
    },

    addPollOption: function() {
        document.getElementById('pollOptionsContainer').insertAdjacentHTML('beforeend', `<input type="text" class="input-field" placeholder="Option" style="margin:0;" maxlength="60">`);
    },

    sendPoll: async function() {
        if(!State.activeChannelId) return;
        const q = document.getElementById('pollQuestion').value.trim();
        const opts = Array.from(document.querySelectorAll('#pollOptionsContainer input')).map(i=>i.value.trim()).filter(v=>v);
        if(!q || opts.length < 2) { UI.showToast("Poll requires a question and at least 2 options.", 'error'); return; }

        const c = State.channels[State.activeChannelId];
        let pollOpts = {};
        opts.forEach((o, i) => pollOpts['option' + (i+1)] = o);

        try {
            await ApiClient.call('sendMessage', {
                cid: c._id, type: c._type,
                contentType: 'poll',
                content: { pollQuestion: q, pollOptions: pollOpts, pollVotes: {} }
            });
            AudioFX.send();
            UI.closeModal('pollModal');
            document.getElementById('pollQuestion').value = '';
            document.getElementById('pollOptionsContainer').innerHTML = `<input type="text" class="input-field" placeholder="Option 1" style="margin:0;" maxlength="60"><input type="text" class="input-field" placeholder="Option 2" style="margin:0;" maxlength="60">`;
            PollingManager.syncMessages();
        } catch(e) { UI.showToast(e.message || "Failed to send poll.", 'error'); }
    },

    vote: async function(msgId, optKey) {
        if (msgId.startsWith('temp-')) return;
        const c = State.channels[State.activeChannelId];
        try {
            await ApiClient.call('action', { action: 'votePoll', cid: c._id, type: c._type, msgId: msgId, optKey: optKey });
            AudioFX.react();
            PollingManager.syncMessages();
        } catch(e) {}
    },

    cancelReply: function() { State.replyContext = null; UI.hide('activeReplyBar'); },
    cancelEdit: function() {
        State.editContext = null;
        document.getElementById('msgInput').innerText = localStorage.getItem('draft_' + State.activeChannelId) || "";
    }
};

const AudioManager = {
    recorder: null, chunks: [], activeAudio: null, timer: null, st: 0,
    startRecording: function() {
        if (!State.activeChannelId) return;
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            this.chunks = [];
            this.recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            UI.hide('msgInput'); UI.hide('btnMic'); UI.hide('btnSend'); UI.hide('btnPoll');
            UI.show('recUI');
            AudioFX.startRec();

            this.st = Date.now();
            this.timer = setInterval(() => {
                let el = Math.floor((Date.now() - this.st) / 1000);
                if (el >= 60) this.finishRecording();
                else document.getElementById('recTimer').innerText = Utils.formatDuration(el);
            }, 1000);

            this.recorder.ondataavailable = e => this.chunks.push(e.data);
            this.recorder.start();
        }).catch(e => { UI.showToast("Microphone access denied.", 'error'); });
    },

    finishRecording: function() {
        if (this.recorder && this.recorder.state === 'recording') {
            this.recorder.onstop = () => {
                this.recorder.stream.getTracks().forEach(t => t.stop());
                clearInterval(this.timer);

                const blob = new Blob(this.chunks, { type: 'audio/webm' });
                this.chunks = [];

                if (blob.size > 0) {
                    AudioFX.stopRec();
                    UI.hide('recUI'); UI.show('previewUI');
                    const url = URL.createObjectURL(blob);
                    document.getElementById('prev-audio').src = url;
                    document.getElementById('prev-audio').ontimeupdate = (e) => {
                        const prog = document.querySelector('#previewUI .ap-progress');
                        const a = e.target;
                        if(a.duration) prog.style.width = (a.currentTime / a.duration) * 100 + "%";
                    };
                    document.getElementById('prev-audio').onended = () => {
                        document.getElementById('prev-play-btn').innerHTML = `<svg class="ic"><use href="#ico-play"></use></svg>`;
                        document.querySelector('#previewUI .ap-progress').style.width = "0%";
                    };
                } else { this.cancelRecording(); }
            };
            this.recorder.stop();
        }
    },

    togglePreviewPlay: function() {
        const a = document.getElementById('prev-audio');
        const btn = document.getElementById('prev-play-btn');
        if(a.paused) { a.play(); btn.innerHTML = `<svg class="ic"><use href="#ico-pause"></use></svg>`; } 
        else { a.pause(); btn.innerHTML = `<svg class="ic"><use href="#ico-play"></use></svg>`; }
    },

    sendPreview: function() {
        const a = document.getElementById('prev-audio');
        fetch(a.src).then(r => r.blob()).then(blob => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onloadend = async () => {
                const c = State.channels[State.activeChannelId];
                try {
                    await ApiClient.call('sendMessage', {
                        cid: c._id, type: c._type, contentType: 'audio', content: reader.result, repliedTo: State.replyContext || false
                    });
                    AudioFX.send(); this.cancelRecording(); ComposerManager.cancelReply();
                    PollingManager.syncMessages();
                } catch(e) { UI.showToast(e.message || "Failed to send voice message.", 'error'); }
            };
        });
    },

    cancelRecording: function() {
        if (this.recorder && this.recorder.state === 'recording') {
            this.recorder.onstop = () => this.recorder.stream.getTracks().forEach(t => t.stop());
            this.recorder.stop();
        }
        clearInterval(this.timer);
        this.recorder = null; this.chunks = [];
        const a = document.getElementById('prev-audio');
        if(a) { a.pause(); a.src = ""; }

        UI.show('msgInput'); UI.show('btnMic'); UI.show('btnSend'); UI.show('btnPoll');
        UI.hide('recUI'); UI.hide('previewUI');
    },

    bindPlayer: function(msgId) {
        const btn = document.getElementById(`ap-btn-${msgId}`);
        const aud = document.getElementById(`ap-src-${msgId}`);
        const prog = document.getElementById(`ap-prog-${msgId}`);
        const timeEl = document.getElementById(`ap-time-${msgId}`);

        if (!btn || !aud) return;

        btn.onclick = () => {
            if (this.activeAudio && this.activeAudio !== aud) {
                this.activeAudio.pause(); this.activeAudio.currentTime = 0;
                const prevId = this.activeAudio.id.replace('ap-src-', '');
                const prevBtn = document.getElementById(`ap-btn-${prevId}`);
                if(prevBtn) prevBtn.innerHTML = `<svg class="ic"><use href="#ico-play"></use></svg>`;
            }
            if (aud.paused) { aud.play(); btn.innerHTML = `<svg class="ic"><use href="#ico-pause"></use></svg>`; this.activeAudio = aud; } 
            else { aud.pause(); btn.innerHTML = `<svg class="ic"><use href="#ico-play"></use></svg>`; }
        };

        aud.ontimeupdate = () => {
            let dur = aud.duration && aud.duration !== Infinity ? aud.duration : 1;
            prog.style.width = (aud.currentTime / dur) * 100 + "%";
            if(timeEl) timeEl.innerText = Utils.formatDuration(aud.currentTime);
        };
        aud.onended = () => { btn.innerHTML = `<svg class="ic"><use href="#ico-play"></use></svg>`; prog.style.width = "0%"; if(timeEl) timeEl.innerText = "0:00"; };
    }
};

const ContextMenu = {
    targetId: null,
    init: function() {
        document.addEventListener('click', e => { if (!e.target.closest('#ctxMenu') && !e.target.closest('.msg-ctx-trigger')) this.close(); });
    },
    open: function(e, msgId) {
        if (msgId.startsWith('temp-')) return; 

        this.targetId = msgId;
        const menu = document.getElementById('ctxMenu');
        const c = State.channels[State.activeChannelId];
        const m = c.messages[msgId];
        if (!m) return;
        
        const isMine = m.senderUid === State.user.uid;
        const isMod = c._type === 'gcs' && (State.currentRole === 'owner' || State.currentRole === 'moderator');

        document.getElementById('ctxBtnEdit').style.display = (isMine && m.contentType === 'text') ? 'flex' : 'none';
        document.getElementById('ctxBtnUnsend').style.display = isMine ? 'flex' : 'none';
        document.getElementById('ctxBtnCopy').style.display = m.contentType === 'text' ? 'flex' : 'none';
        document.getElementById('ctxBtnMod').style.display = (isMod && !isMine) ? 'flex' : 'none';
        document.getElementById('ctxBtnPin').style.display = isMod ? 'flex' : 'none';
        document.getElementById('ctxPinText').innerText = c.messages[msgId]?.status?.pinned ? 'Unpin' : 'Pin';

        if(isMine || (isMod && !isMine)) document.getElementById('ctxDivDanger').style.display = 'block';
        else document.getElementById('ctxDivDanger').style.display = 'none';

        menu.classList.add('show');
        menu.style.top = '-9999px'; menu.style.left = '-9999px';

        const rect = e.currentTarget.getBoundingClientRect();
        
        requestAnimationFrame(() => {
            let y = rect.top - (menu.offsetHeight / 2) + (rect.height / 2);
            let x = rect.left;

            if (isMine) x -= (menu.offsetWidth + 10);
            else x += rect.width + 10;

            if (y < 10) y = 10;
            if (y + menu.offsetHeight > window.innerHeight) y = window.innerHeight - menu.offsetHeight - 10;
            if (x < 10) x = 10;
            if (x + menu.offsetWidth > window.innerWidth) x = window.innerWidth - menu.offsetWidth - 10;

            menu.style.top = y + 'px'; menu.style.left = x + 'px';
        });
    },
    close: function() { document.getElementById('ctxMenu').classList.remove('show'); this.targetId = null; },
    react: async function(emoji, explicitTarget = null) {
        const mId = explicitTarget || this.targetId;
        if (!mId || !State.activeChannelId || mId.startsWith('temp-')) return;
        const c = State.channels[State.activeChannelId];
        try {
            await ApiClient.call('action', { action: 'react', cid: c._id, type: c._type, msgId: mId, emoji: emoji });
            AudioFX.react(); PollingManager.syncMessages();
        } catch(e) {}
        this.close();
    },
    reply: function() {
        if (!this.targetId || !State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        const m = c.messages[this.targetId];
        State.replyContext = this.targetId;
        document.getElementById('rplName').innerText = Utils.displayName(m.senderUid, c);
        document.getElementById('rplText').innerText = m.contentType === 'audio' ? 'Voice message' : (m.contentType === 'file' ? 'Attachment' : (m.contentType === 'poll' ? 'Poll' : m.content));
        UI.show('activeReplyBar'); document.getElementById('msgInput').focus();
        this.close();
    },
    edit: function() {
        if (!this.targetId || !State.activeChannelId) return;
        State.editContext = this.targetId;
        const c = State.channels[State.activeChannelId];
        document.getElementById('msgInput').innerText = c.messages[this.targetId].content;
        Utils.setCaretToEnd(document.getElementById('msgInput'));
        document.getElementById('msgInput').focus();
        this.close();
    },
    unsend: async function() {
        if (!this.targetId || !State.activeChannelId) return;
        const id = this.targetId; const c = State.channels[State.activeChannelId];
        try {
            await ApiClient.call('action', { action: 'unsend', cid: c._id, type: c._type, msgId: id });
            PollingManager.syncMessages();
        } catch(e) { UI.showToast(e.message || "Failed to unsend.", 'error'); }
        this.close();
    },
    moderate: async function() {
        if (!this.targetId || !State.activeChannelId) return;
        const id = this.targetId; const c = State.channels[State.activeChannelId];
        if(c._type !== 'gcs') return;
        try {
            await ApiClient.call('action', { action: 'moderate', cid: c._id, type: c._type, msgId: id });
            PollingManager.syncMessages();
        } catch(e) { UI.showToast(e.message || "Failed to delete.", 'error'); }
        this.close();
    },
    copy: function() {
        if (!this.targetId || !State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        const m = c.messages[this.targetId];
        if(m.contentType === 'text' && m.content) { navigator.clipboard.writeText(m.content); UI.showToast("Message copied!", 'success'); }
        this.close();
    },
    pin: async function() {
        if (!this.targetId || !State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        try {
            await ApiClient.call('action', { action: 'pin', cid: c._id, type: c._type, msgId: this.targetId });
            PollingManager.syncMessages();
        } catch(e) { UI.showToast(e.message || "Failed to pin.", 'error'); }
        this.close();
    },
    unpin: async function(e) {
        e.stopPropagation();
        const pb = document.getElementById('pinnedBanner');
        if(pb.dataset.msgid && State.activeChannelId) {
            const c = State.channels[State.activeChannelId];
            try {
                await ApiClient.call('action', { action: 'pin', cid: c._id, type: c._type, msgId: pb.dataset.msgid });
                PollingManager.syncMessages();
            } catch(e) {}
        }
    }
};

const GroupManager = {
    create: async function() {
        const name = document.getElementById('ngName').value.trim();
        const jc = document.getElementById('ngCustomCode').value.trim();
        if (!name) { UI.showToast("Group name is required.", 'error'); return; }
        const btn = document.getElementById('btnCreateGroup'); btn.disabled = true;

        const file = document.getElementById('ngIcon').files[0];
        const reqApp = document.getElementById('ngRequireApproval').checked;

        const finalize = async (iconBase64) => {
            try {
                const res = await ApiClient.call('createGroup', { name, joinCode: jc, requireApproval: reqApp, icon: iconBase64 });
                UI.closeModal('newGroupModal');
                document.getElementById('ngName').value = ""; document.getElementById('ngIcon').value = ""; document.getElementById('ngCustomCode').value = "";
                document.getElementById('gcCodeDisplay').innerText = res.joinCode || jc; 
                UI.openModal('groupCreatedModal');
                await PollingManager.syncGlobal(); ChatManager.open(res.cid);
            } catch (e) { UI.showToast(e.message || "Failed to create group.", 'error'); }
            finally { btn.disabled = false; }
        };

        if (file) {
            if(file.size > 25*1024*1024) { UI.showToast("File exceeds 25MB.", 'error'); btn.disabled=false; return; }
            const reader = new FileReader(); reader.readAsDataURL(file);
            reader.onloadend = () => finalize(reader.result);
        } else finalize(null);
    },

    joinWithCode: async function() {
        const code = document.getElementById('jcInput').value.trim();
        if(code.length < 3) { UI.showToast("Invalid code.", 'error'); return; }
        try {
            const res = await ApiClient.call('joinGroup', { code });
            UI.closeModal('joinCodeModal');
            if (res.requested) UI.showToast("Request sent. Pending admin approval.", 'success');
            else if (res.cid) { await PollingManager.syncGlobal(); ChatManager.open(res.cid); }
        } catch(e) { UI.showToast(e.message || "Failed to join group.", 'error'); }
    },

    requestJoinById: async function(gcId) {
        try {
            const gc = await ApiClient.call('getGroupInfo', { cid: gcId });
            if(gc.isMember) { UI.closeModal('joinOverlay'); ChatManager.open(gcId); return; }

            document.getElementById('joinTitle').innerText = gc.name;
            document.getElementById('joinDesc').innerText = "You have been invited to join this group.";
            const av = document.getElementById('joinAvatar');
            if(gc.icon) av.innerHTML = `<img src="${Utils.escapeHTML(gc.icon)}">`;
            else av.innerText = (gc.name || '?').charAt(0).toUpperCase();

            document.getElementById('btnJoinConfirm').onclick = () => this.confirmJoin(gcId, gc.requireApproval);
            UI.openModal('joinOverlay');
        } catch(e) { UI.showToast(e.message || "Failed to load group.", 'error'); Router.clearHash(); }
    },

    confirmJoin: async function(gcId, requireApproval) {
        try {
            await ApiClient.call('groupAction', { gAction: requireApproval ? 'requestJoin' : 'directJoin', cid: gcId });
            UI.closeModal('joinOverlay'); Router.clearHash();
            if(requireApproval) UI.showToast("Request sent. Pending admin approval.", 'success');
            else { await PollingManager.syncGlobal(); ChatManager.open(gcId); }
        } catch(e) { UI.showToast(e.message || "Failed to join group.", 'error'); }
    },

    sendInvite: async function(targetUid) {
        UI.showToast("Invite sent!", 'success');
        document.getElementById('inviteSearchResults').innerHTML = ''; document.getElementById('inviteSearchInput').value = '';
        const c = State.channels[State.activeChannelId];
        if(!c) return;
        try {
            const res = await ApiClient.call('startDM', { targetUid });
            if (res.cid) {
                const invitePayload = {
                    type: 'invite',
                    groupCid: State.activeChannelId,
                    groupName: c.name,
                    groupIcon: c.config?.icon || null,
                    memberCount: Object.keys(c.members).length,
                    joinCode: c.config?.joinCode || ''
                };
                await ApiClient.call('sendMessage', {
                    cid: res.cid,
                    type: 'dms',
                    content: invitePayload,
                    contentType: 'invite'
                });
                await PollingManager.syncGlobal();
            }
        } catch(e) {
            console.error("Failed to send invite:", e);
        }
    },

    joinByInviteCard: async function(joinCode, groupCid) {
        try {
            if (joinCode) {
                const res = await ApiClient.call('joinGroup', { code: joinCode });
                if (res.requested) {
                    UI.showToast("Join request sent. Pending admin approval.", 'success');
                } else if (res.cid) {
                    UI.showToast("Joined group!", 'success');
                    await PollingManager.syncGlobal();
                    ChatManager.open(res.cid);
                }
            } else if (groupCid) {
                await GroupManager.requestJoinById(groupCid);
            }
        } catch(e) {
            UI.showToast(e.message || "Failed to join group.", 'error');
        }
    },

    openJoinRequestsPopup: function() {
        const c = State.channels[State.activeChannelId];
        if (!c || !c.joinRequests || State.currentRole !== 'owner') return;
        const list = document.getElementById('joinRequestsList');
        if (!list) return;

        let html = '';
        for (let uId in c.joinRequests) {
            const u = c.joinRequests[uId];
            const acc = State.accountsCache[uId] || {};
            const dName = acc.displayName || u.displayName || u.username || uId;
            const avHtml = acc.avatar ? `<img src="${Utils.escapeHTML(acc.avatar)}">` : dName.charAt(0).toUpperCase();

            html += `
            <div class="member-item" id="req-item-${uId}" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--section-bg); border-radius:10px; border:1px solid var(--border);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="c-av" style="width:36px; height:36px; font-size:1rem;">
                        <div class="c-av-inner">${avHtml}</div>
                    </div>
                    <div>
                        <div style="font-weight:bold; color:var(--fg);">${Utils.escapeHTML(dName)}</div>
                        <div style="font-size:0.8rem; color:var(--fg2);">@${Utils.escapeHTML(u.username || uId)}</div>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn sec" style="width:auto; padding:5px 12px; font-size:0.85rem;" onclick="GroupManager.handleOwnerJoinDecision('${uId}', false)">Decline</button>
                    <button class="btn" style="width:auto; padding:5px 12px; font-size:0.85rem;" onclick="GroupManager.handleOwnerJoinDecision('${uId}', true)">Accept</button>
                </div>
            </div>`;
        }
        list.innerHTML = html || `<div style="text-align:center; color:var(--fg2); padding:20px;">No pending join requests.</div>`;
        UI.openModal('joinRequestsModal');
    },

    handleOwnerJoinDecision: async function(targetUid, isApproved) {
        const cid = State.activeChannelId;
        try {
            await ApiClient.call('groupAction', { gAction: 'approveJoin', cid, targetUid, value: isApproved });
            const c = State.channels[cid];
            if (c && c.joinRequests) {
                delete c.joinRequests[targetUid];
            }
            const itemEl = document.getElementById(`req-item-${targetUid}`);
            if (itemEl) itemEl.remove();

            const remaining = c && c.joinRequests ? Object.keys(c.joinRequests).length : 0;
            if (remaining === 0) {
                UI.closeModal('joinRequestsModal');
                const reqBanner = document.getElementById('joinRequestsBanner');
                if (reqBanner) reqBanner.style.display = 'none';
            } else {
                ChatManager.updateHeader();
            }
            UI.showToast(isApproved ? "Join request accepted!" : "Join request declined.", 'success');
            await PollingManager.syncGlobal();
        } catch(e) {
            UI.showToast("Failed to process join request.", 'error');
        }
    },

    openMembersList: function() {
        if (!State.activeChannelId) return;
        const c = State.channels[State.activeChannelId];
        if (c._type !== 'gcs') return;
        const list = document.getElementById('mlList'); let html = '';

        if(c.config?.allowCustomNicknames !== false) {
            UI.show('myNicknameSection'); document.getElementById('myNicknameInput').value = c.members[State.user.uid]?.nickname || '';
        } else UI.hide('myNicknameSection');

        for (let mId in c.members) {
            let u = State.accountsCache[mId] || { displayName: mId };
            if (u.account_status === 'banned') continue;
            let role = c.members[mId].role || 'member';
            let nick = c.members[mId].nickname;
            let uName = Utils.username(mId);
            let disp = nick ? `${nick} (@${uName})` : `${u.displayName || uName} (@${uName})`;

            let act = '';
            if (State.currentRole === 'owner' && mId !== State.user.uid) {
                act = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <select onchange="GroupManager.setRole('${mId}', this.value)" style="background:var(--input-bg); border:1px solid var(--border); padding:4px; border-radius:8px; font-size:0.9rem;">
                        <option value="member" ${role==='member'?'selected':''}>Member</option>
                        <option value="moderator" ${role==='moderator'?'selected':''}>Moderator</option>
                        <option value="transfer">Transfer Owner</option>
                    </select>
                    <button class="btn warn" style="width:auto; padding:4px 8px; font-size:0.9rem;" onclick="GroupManager.kick('${mId}')">Kick</button>
                </div>`;
            } else if (State.currentRole === 'moderator' && role === 'member') {
                act = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="role-badge">${role}</span>
                    <button class="btn warn" style="width:auto; padding:4px 8px; font-size:0.9rem;" onclick="GroupManager.kick('${mId}')">Kick</button>
                </div>`;
            } else { act = `<span class="role-badge">${role}</span>`; }

            let mColor = Utils.nameColor(mId);
            let mColorStyle = mColor ? `style="color:${mColor}; font-weight:bold;"` : '';

            html += `
            <div class="member-item">
                <div class="member-info">
                    <div class="c-av" style="width:40px; height:40px; font-size:1.1rem; cursor:default;">
                        <div class="c-av-inner">${u.avatar ? `<img src="${Utils.escapeHTML(u.avatar)}">` : mId.charAt(0).toUpperCase()}</div>
                    </div>
                    <div style="line-height:1.2;">
                        <div style="font-weight:bold; color:var(--fg); display:flex; align-items:center;">
                            <span ${mColorStyle}>${Utils.escapeHTML(disp)}</span> ${Utils.getBadgesHTML(mId)}
                        </div>
                    </div>
                </div>
                ${act}
            </div>`;
        }
        list.innerHTML = html;
        if(State.currentRole === 'owner' || State.currentRole === 'moderator') UI.show('btnInviteMembers'); else UI.hide('btnInviteMembers');
        UI.openModal('membersListModal');
    },

    setRole: function(uid, role) {
        if(role === 'transfer') {
            UI.showConfirm(`Are you sure you want to transfer ownership to ${uid}?`, [{ text: "Cancel", sec: true }, { text: "Transfer", danger: true, cb: async () => {
                await ApiClient.call('groupAction', { gAction: 'setRole', cid: State.activeChannelId, targetUid: uid, value: 'transfer' });
                UI.closeModal('membersListModal'); PollingManager.syncGlobal();
            }}]);
        } else {
            ApiClient.call('groupAction', { gAction: 'setRole', cid: State.activeChannelId, targetUid: uid, value: role }).then(()=>PollingManager.syncGlobal());
        }
    },

    saveNickname: async function() {
        const v = document.getElementById('myNicknameInput').value.trim();
        try {
            await ApiClient.call('groupAction', { gAction: 'saveNickname', cid: State.activeChannelId, value: v });
            UI.showToast("Nickname saved", 'success'); PollingManager.syncGlobal();
        } catch(e) { UI.showToast(e.message || "Failed to save nickname.", 'error'); }
    },

    updateConfig: async function(key, val) {
        if(State.activeChannelId && State.currentRole === 'owner') {
            try { await ApiClient.call('groupAction', { gAction: 'updateConfig', cid: State.activeChannelId, configKey: key, value: val }); PollingManager.syncGlobal(); } catch(e) {}
        }
    },

    updateIcon: function(e) {
        if (!State.activeChannelId || State.currentRole !== 'owner') return;
        const file = e.target.files[0]; if(!file) return;
        if(file.size > 25*1024*1024) { UI.showToast("File exceeds 25MB.", 'error'); return; }
        const r = new FileReader(); r.readAsDataURL(file);
        r.onloadend = async () => {
            try {
                await ApiClient.call('groupAction', { gAction: 'updateIcon', cid: State.activeChannelId, value: r.result });
                UI.showToast("Group picture updated", 'success'); await PollingManager.syncGlobal(); UI.openSettings();
            } catch(err) { UI.showToast(err.message || "Failed to upload image.", 'error'); }
        };
    },

    regenerateCode: async function() {
        if(State.currentRole !== 'owner') return;
        try {
            const res = await ApiClient.call('groupAction', { gAction: 'updateCode', cid: State.activeChannelId, value: null });
            document.getElementById('gsCodeDisplayText').innerText = res.newCode; UI.showToast("Code regenerated", 'success'); PollingManager.syncGlobal();
        } catch(e) { UI.showToast(e.message || "Failed to regenerate.", 'error'); }
    },

    setCustomCode: async function() {
        if(State.currentRole !== 'owner') return;
        const v = document.getElementById('gsCustomCodeInput').value.trim();
        if(!v) { UI.showToast("Enter a join code first.", 'error'); return; }
        try {
            await ApiClient.call('groupAction', { gAction: 'updateCode', cid: State.activeChannelId, value: v });
            document.getElementById('gsCodeDisplayText').innerText = v; document.getElementById('gsCustomCodeInput').value = '';
            UI.showToast("Join code updated", 'success'); PollingManager.syncGlobal();
        } catch(e) { UI.showToast(e.message || "Failed to update code.", 'error'); }
    },

    setThemeMode: function(mode) {
        document.getElementById('themeModeColorBtn').classList.toggle('active', mode === 'color');
        document.getElementById('themeModeImageBtn').classList.toggle('active', mode === 'image');
        document.getElementById('themeColorWrap').style.display = mode === 'color' ? 'flex' : 'none';
        document.getElementById('themeImageWrap').style.display = mode === 'image' ? 'block' : 'none';
        document.getElementById('gsIconWrap').dataset.themeMode = mode;
    },

    saveTheme: function() {
        if (!State.activeChannelId || State.currentRole !== 'owner') return;
        const fg = document.getElementById('gsThemeFg').value; const ac = document.getElementById('gsThemeAccent').value;
        const bgC = document.getElementById('gsThemeBgColor').value; const file = document.getElementById('gsThemeWpFile').files[0];
        const mode = document.getElementById('gsIconWrap').dataset.themeMode || 'color';

        const apply = async (bg) => {
            try {
                await ApiClient.call('groupAction', { gAction: 'saveTheme', cid: State.activeChannelId, value: { text: fg, accent: ac, background: bg } });
                UI.showToast("Theme saved.", 'success'); PollingManager.syncGlobal();
            } catch(e) { UI.showToast(e.message || "Failed to apply theme.", 'error'); }
        };
        if(mode === 'image' && file) {
            if(file.size > 25*1024*1024) { UI.showToast("File exceeds 25MB limit.", 'error'); return; }
            const r = new FileReader(); r.onload = () => apply(r.result); r.readAsDataURL(file);
        } else if(mode === 'image') {
            const c = State.channels[State.activeChannelId];
            apply(c.config?.theme?.background && c.config.theme.background.startsWith('data:') ? c.config.theme.background : null);
        } else apply(bgC);
    },

    renderRequests: function() {
        const reqList = document.getElementById('gsRequestsList'); const c = State.channels[State.activeChannelId];
        if(!c || !c.joinRequests || State.currentRole !== 'owner') { UI.hide('gsRequestsSection'); return; }

        let html = '';
        for(let uId in c.joinRequests) {
            let u = c.joinRequests[uId];
            html += `
            <div class="member-item" style="border-color:var(--accent);">
                <div class="member-info"><div style="font-weight:bold; color:var(--fg);">@${Utils.escapeHTML(u.username)}</div></div>
                <div style="display:flex; gap:8px;">
                    <button class="btn sec" style="width:auto; padding:4px 8px; font-size:0.9rem;" onclick="GroupManager.approveJoin('${uId}', false)">Deny</button>
                    <button class="btn" style="width:auto; padding:4px 8px; font-size:0.9rem;" onclick="GroupManager.approveJoin('${uId}', true)">Approve</button>
                </div>
            </div>`;
        }
        if(html) { reqList.innerHTML = html; UI.show('gsRequestsSection'); } else { UI.hide('gsRequestsSection'); }
    },

    approveJoin: async function(targetUid, isApproved) {
        if (!State.activeChannelId) return;
        try {
            await ApiClient.call('groupAction', { gAction: 'approveJoin', cid: State.activeChannelId, targetUid: targetUid, value: isApproved });
            await PollingManager.syncGlobal(); if (State.currentRole === 'owner') UI.openSettings();
        } catch(e) { UI.showToast("Failed to process request.", 'error'); }
    },

    rename: async function() {
        const v = document.getElementById('gsRenameInput').value.trim();
        if (v && State.activeChannelId) {
            try { await ApiClient.call('groupAction', { gAction: 'rename', cid: State.activeChannelId, value: v }); UI.showToast("Group renamed", 'success'); PollingManager.syncGlobal(); }
            catch(e) { UI.showToast(e.message || "Failed to rename group.", 'error'); }
        }
    },

    kick: function(id) {
        UI.showConfirm("Remove this user from the group?", [{ text: "Cancel", sec: true }, { text: "Kick", danger: true, cb: async () => {
            try {
                await ApiClient.call('groupAction', { gAction: 'kick', cid: State.activeChannelId, targetUid: id });
                await PollingManager.syncGlobal();
                if(document.getElementById('membersListModal').classList.contains('show')) this.openMembersList();
            } catch(e) { UI.showToast(e.message || "Failed to kick.", 'error'); }
        }}]);
    },

    leaveGroup: function() {
        if(State.currentRole === 'owner') {
            UI.showConfirm("You are the owner. If you leave, the group will be permanently deleted unless you transfer ownership first.", [
                { text: "Cancel", sec: true }, { text: "Transfer Owner", cb: () => GroupManager.openMembersList() },
                { text: "Leave & Delete Group", danger: true, cb: async () => {
                    try { await ApiClient.call('leaveGroup', { cid: State.activeChannelId }); await PollingManager.syncGlobal(); ChatManager.close(); } catch(e) { UI.showToast("Failed to delete group.", 'error'); }
                }}
            ], "Leave Group");
        } else {
            UI.showConfirm("Are you sure you want to leave this group?", [
                { text: "Cancel", sec: true },
                { text: "Leave Group", danger: true, cb: async () => {
                    try { await ApiClient.call('leaveGroup', { cid: State.activeChannelId }); await PollingManager.syncGlobal(); ChatManager.close(); } catch(e) { UI.showToast("Failed to leave group.", 'error'); }
                }}
            ]);
        }
    }
};

const NameColorManager = {
    selectedColor: '#ef4444',
    
    openModal: function() {
        const myUid = State.user?.uid;
        let currentColor = Utils.nameColor(myUid) || '#ef4444';
        this.selectedColor = currentColor;
        
        const previewAuthor = document.getElementById('nameColorPreviewAuthor');
        const picker = document.getElementById('chatNameColorPicker');
        const hexInput = document.getElementById('chatNameColorHex');
        
        if (previewAuthor) {
            previewAuthor.textContent = State.user?.displayName || State.user?.username || 'You';
            previewAuthor.style.color = currentColor;
        }
        if (picker) picker.value = currentColor.startsWith('#') && currentColor.length === 7 ? currentColor : '#ef4444';
        if (hexInput) hexInput.value = currentColor.toUpperCase();
        
        this.updateActiveSwatch(currentColor);
        UI.openModal('nameColorModal');
    },

    selectColor: function(hex) {
        this.selectedColor = hex;
        const previewAuthor = document.getElementById('nameColorPreviewAuthor');
        const picker = document.getElementById('chatNameColorPicker');
        const hexInput = document.getElementById('chatNameColorHex');

        if (previewAuthor) previewAuthor.style.color = hex;
        if (picker && hex.startsWith('#') && hex.length === 7) picker.value = hex;
        if (hexInput) hexInput.value = hex.toUpperCase();

        this.updateActiveSwatch(hex);
    },

    onPickerInput: function(hex) {
        this.selectedColor = hex;
        const previewAuthor = document.getElementById('nameColorPreviewAuthor');
        const hexInput = document.getElementById('chatNameColorHex');

        if (previewAuthor) previewAuthor.style.color = hex;
        if (hexInput) hexInput.value = hex.toUpperCase();
        this.updateActiveSwatch(hex);
    },

    onHexInput: function(val) {
        let hex = val.trim();
        if (!hex.startsWith('#') && /^[0-9a-fA-F]{3,8}$/.test(hex)) hex = '#' + hex;
        this.selectedColor = hex;
        
        const previewAuthor = document.getElementById('nameColorPreviewAuthor');
        const picker = document.getElementById('chatNameColorPicker');
        if (previewAuthor) previewAuthor.style.color = hex;
        if (picker && /^#[0-9a-fA-F]{6}$/i.test(hex)) picker.value = hex;
        this.updateActiveSwatch(hex);
    },

    resetColor: function() {
        this.selectColor('#ef4444');
    },

    updateActiveSwatch: function(color) {
        const swatches = document.querySelectorAll('#nameColorModal .color-swatch');
        const norm = (color || '').toLowerCase();
        swatches.forEach(sw => {
            const bg = (sw.getAttribute('onclick') || '').toLowerCase();
            if (bg.includes(norm)) {
                sw.classList.add('active');
            } else {
                sw.classList.remove('active');
            }
        });
    },

    saveColor: async function() {
        const btn = document.getElementById('saveNameColorBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving...';
        }
        
        try {
            const color = this.selectedColor.trim();
            const sid = localStorage.getItem('session_id') || '';
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': sid
                },
                body: JSON.stringify({
                    action: 'updateProfile',
                    nameColor: color,
                    chatColor: color
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to update name color');
            }

            // Update local state
            if (State.user) {
                State.user.nameColor = color;
                State.user.chatColor = color;
            }
            if (State.user?.uid && State.accountsCache[State.user.uid]) {
                State.accountsCache[State.user.uid].nameColor = color;
                State.accountsCache[State.user.uid].chatColor = color;
            }

            // Update localStorage auth sessions
            try {
                const s = JSON.parse(localStorage.getItem('bsms_auth_session') || '{}');
                s.nameColor = color;
                s.chatColor = color;
                localStorage.setItem('bsms_auth_session', JSON.stringify(s));
            } catch(e) {}

            try {
                const s2 = JSON.parse(localStorage.getItem('bsms_session') || '{}');
                s2.nameColor = color;
                s2.chatColor = color;
                localStorage.setItem('bsms_session', JSON.stringify(s2));
            } catch(e) {}

            this.updateSidebarUser();
            if (window.SidebarManager && typeof SidebarManager.render === 'function') {
                SidebarManager.render();
            }
            if (State.activeChannelId && State.channels[State.activeChannelId]) {
                const activeCh = State.channels[State.activeChannelId];
                if (activeCh.messages && typeof ChatManager.renderInitialMessages === 'function') {
                    ChatManager.renderInitialMessages(activeCh.messages);
                }
            }
            if (State.user && State.user.uid) {
                document.querySelectorAll(`.my-msg-author, .msg-author[data-uid="${State.user.uid}"]`).forEach(el => {
                    el.style.color = color;
                    el.style.fontWeight = 'bold';
                });
            }

            UI.closeModal('nameColorModal');
            UI.showToast('Name color updated!', 'success');
        } catch (err) {
            console.error('Error saving name color:', err);
            UI.showToast(err.message || 'Could not save color', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Save Color';
            }
        }
    },

    updateSidebarUser: function() {
        const myUid = State.user?.uid;
        if (!myUid) return;
        const acc = State.accountsCache[myUid] || {};
        const dName = acc.displayName || State.user.displayName || State.user.username || 'You';
        const uColor = Utils.nameColor(myUid) || '#ef4444';
        
        const nameEl = document.getElementById('sbUserDisplayName');
        if (nameEl) {
            nameEl.textContent = dName;
            nameEl.style.color = uColor;
        }
        const colorDot = document.getElementById('sbUserColorDot');
        if (colorDot) {
            colorDot.style.background = uColor;
        }
        const avEl = document.getElementById('sbUserAvatar');
        if (avEl) {
            if (acc.avatar) {
                avEl.innerHTML = `<img src="${Utils.escapeHTML(acc.avatar)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            } else {
                avEl.textContent = dName.charAt(0).toUpperCase();
            }
        }
    }
};

window.onload = () => AuthManager.init();
