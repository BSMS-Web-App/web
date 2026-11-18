/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const UI = {
    showToast: (msg, type = 'info') => {
        const t = document.getElementById('toastContainer');
        t.className = type === 'error' ? 'error' : (type === 'success' ? 'success' : '');
        document.getElementById('toastText').innerText = msg;
        t.classList.add('show');
        clearTimeout(UI.toastTimeout);
        UI.toastTimeout = setTimeout(() => t.classList.remove('show'), 4000);
    },
    hideToast: () => document.getElementById('toastContainer').classList.remove('show'),
    openModal: id => document.getElementById(id).classList.add('show'),
    closeModal: id => document.getElementById(id).classList.remove('show'),

    showVerifiedModal: (name) => { document.getElementById('vmUserDisplay').innerText = name; UI.openModal('verifiedModal'); },
    showAdminModal: (name) => { document.getElementById('amUserDisplay').innerText = name; UI.openModal('adminModal'); },
    showModModal: (name) => { document.getElementById('mmUserDisplay').innerText = name; UI.openModal('modModal'); },
    showDevModal: (name) => { document.getElementById('dmUserDisplay').innerText = name; UI.openModal('devModal'); },
    showOwnerModal: (name) => { document.getElementById('omUserDisplay').innerText = name; UI.openModal('ownerModal'); },
    showNetanyahuModal: (name) => { document.getElementById('nbmUserDisplay').innerText = name; UI.openModal('netanyahuBadgeModal'); },
    showDavidModal: (name) => { document.getElementById('dbmUserDisplay').innerText = name; UI.openModal('davidBadgeModal'); },
    showGothamModal: (name) => { document.getElementById('gbmUserDisplay').innerText = name; UI.openModal('gothamBadgeModal'); },
    showPirateModal: (name) => { document.getElementById('pbmUserDisplay').innerText = name; UI.openModal('pirateBadgeModal'); },
    showTomModal: (name) => { document.getElementById('tbmUserDisplay').innerText = name; UI.openModal('tomBadgeModal'); }
};

const DirectoryApp = {
    users: [],
    myUid: null,
    activeFilter: 'all',
    searchQuery: '',
    currentUserObj: null,
    usersLoaded: false,
    pendingProfile: null,

    init: async function() {
        this.renderCurrentSession();
        window.addEventListener('hashchange', () => this.handleHashRoute());
        window.addEventListener('popstate', () => this.handleHashRoute());
        await this.fetchUsers();
    },

    getSessionId: function() {
        const direct = localStorage.getItem('session_id');
        if (direct) return direct;
        for (const key of ['bsms_auth_session', 'bsms_session']) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && (parsed.sessionId || parsed.sid)) {
                        return parsed.sessionId || parsed.sid;
                    }
                }
            } catch(e) {}
        }
        return '';
    },

    findUserByUid: function(uid) {
        if (!uid) return null;
        if (this.currentUserObj && this.currentUserObj.uid === uid) return this.currentUserObj;
        return this.users.find(x => x.uid === uid) || null;
    },

    openByUid: function(uid) {
        const u = this.findUserByUid(uid);
        if (u && u.username) Router.setHash(u.username);
    },

    openBadgeModal: function(ev, type, uid) {
        if (ev) ev.stopPropagation();
        const u = this.findUserByUid(uid);
        const name = (u && (u.displayName || u.username)) || 'User';
        if (type === 'verified') UI.showVerifiedModal(name);
        else if (type === 'owner') UI.showOwnerModal(name);
        else if (type === 'admin') UI.showAdminModal(name);
        else if (type === 'mod') UI.showModModal(name);
        else if (type === 'dev') UI.showDevModal(name);
        else if (type === 'netanyahu') UI.showNetanyahuModal(name);
        else if (type === 'david') UI.showDavidModal(name);
        else if (type === 'gotham') UI.showGothamModal(name);
        else if (type === 'pirate') UI.showPirateModal(name);
        else if (type === 'tom') UI.showTomModal(name);
    },

    buildAvatarHTML: function(u, eager = false) {
        const initial = ((u.displayName || u.username || '?').charAt(0)).toUpperCase();
        if (!u.avatar) return this.escapeHTML(initial);
        const loadingAttrs = eager ? 'loading="eager" decoding="async" fetchpriority="high"' : 'loading="lazy" decoding="async"';
        return `<img src="${this.escapeHTML(u.avatar)}" alt="${this.escapeHTML(u.displayName || u.username)}" ${loadingAttrs} data-initial="${this.escapeHTML(initial)}" onerror="const p=this.parentElement;if(p){p.textContent=this.dataset.initial||'?';}">`;
    },

    renderCurrentSession: function() {
        try {
            const sessStr = localStorage.getItem('bsms_auth_session') || localStorage.getItem('bsms_session');
            if (sessStr) {
                const sess = JSON.parse(sessStr);
                const pfpEl = document.getElementById('headerAvatar');
                if (pfpEl) {
                    const initial = ((sess.displayName || sess.username || '?').charAt(0)).toUpperCase();
                    if (sess.avatar) {
                        pfpEl.innerHTML = `<img src="${this.escapeHTML(sess.avatar)}" style="width:100%;height:100%;object-fit:cover;" data-initial="${this.escapeHTML(initial)}" onerror="const p=this.parentElement;if(p){p.className='fallback-initial';p.textContent=this.dataset.initial||'?';}">`;
                        pfpEl.className = '';
                    } else {
                        pfpEl.innerText = initial;
                        pfpEl.className = 'fallback-initial';
                    }
                    const sessColor = (sess.nameColor || sess.chatColor || '').trim();
                    if (sessColor) {
                        pfpEl.style.borderColor = sessColor;
                        pfpEl.style.boxShadow = `0 0 10px ${sessColor}44`;
                    }
                }
            }
        } catch(e) {}
    },

    fetchUsers: async function() {
        try {
            const sid = this.getSessionId();
            const res = await fetch('/api/auth?action=getPublicUsers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load users");

            this.users = Array.isArray(data.users) ? data.users : [];
            this.myUid = data.myUid || null;
            this.currentUserObj = null;
            
            if (this.myUid) {
                const myIdx = this.users.findIndex(u => u.uid === this.myUid);
                if (myIdx > -1) {
                    this.currentUserObj = this.users.splice(myIdx, 1)[0];
                    const myColor = (this.currentUserObj.nameColor || this.currentUserObj.chatColor || '').trim();
                    if (myColor) {
                        const pfpEl = document.getElementById('headerAvatar');
                        if (pfpEl) {
                            pfpEl.style.borderColor = myColor;
                            pfpEl.style.boxShadow = `0 0 10px ${myColor}44`;
                        }
                    }
                }
            }

            this.usersLoaded = true;
            this.updateCounts();
            this.renderMyCard();
            this.renderUsers();
            
            if (this.pendingProfile) {
                const target = this.pendingProfile;
                this.pendingProfile = null;
                this.openProfileFullScreen(target);
            } else {
                this.handleHashRoute();
            }

        } catch (err) {
            this.usersLoaded = true;
            document.getElementById('usersGrid').innerHTML = `
                <div class="state-container" style="grid-column: 1 / -1; color:#ef4444;">
                    <p>Failed to load directory. Please verify your connection.</p>
                    <button class="btn sec" style="width:auto; margin: 16px auto 0;" onclick="DirectoryApp.fetchUsers()">Try Again</button>
                </div>
            `;
        }
    },

    updateCounts: function() {
        const allAccounts = this.currentUserObj ? [this.currentUserObj, ...this.users] : this.users;
        const visibleAll = allAccounts.filter(u => !u.hiddenFromDirectory);
        const visibleOthers = this.users.filter(u => !u.hiddenFromDirectory);
        document.getElementById('count-all').innerText = visibleAll.length;
        document.getElementById('count-team').innerText = visibleAll.filter(u => u.role === 'owner' || u.role === 'admin' || u.role === 'mod' || u.isDeveloper).length;
        document.getElementById('count-following').innerText = visibleOthers.filter(u => u.isFollowing).length;
    },

    setFilter: function(filter, btnEl) {
        this.activeFilter = filter;
        document.querySelectorAll('.pill').forEach(el => el.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        this.renderUsers();
    },

    onSearch: function(val) {
        this.searchQuery = (val || '').toLowerCase().trim().replace(/^@/, '');
        this.renderUsers();
    },

    getFilteredUsers: function() {
        const showWideCard = Boolean(this.currentUserObj && !this.searchQuery && this.activeFilter === 'all');
        const pool = (!showWideCard && this.currentUserObj) ? [this.currentUserObj, ...this.users] : this.users;
        let list = pool.filter(u => {
            if (u.hiddenFromDirectory) return false;
            
            if (this.activeFilter === 'following' && !u.isFollowing) return false;
            if (this.activeFilter === 'team' && !(u.role === 'owner' || u.role === 'admin' || u.role === 'mod' || u.isDeveloper)) return false;
            if (this.activeFilter === 'verified' && !u.verified) return false;

            if (this.searchQuery) {
                const matchStr = `${u.displayName} ${u.username} ${u.bio || ''}`.toLowerCase();
                if (!matchStr.includes(this.searchQuery)) return false;
            }
            return true;
        });

        list.sort((a, b) => {
            const nameA = (a.displayName || a.username || '').toLowerCase();
            const nameB = (b.displayName || b.username || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        return list;
    },

    getBadgesHTML: function(u) {
        let b = '';
        const uidAttr = this.escapeHTML(u.uid);
        if (u.verified) {
            b += `<svg class="ic verified-icon" title="Verified" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'verified',this.dataset.uid)"><use href="#ico-verified"></use></svg>`;
        }
        if (u.role === 'owner') {
            b += `<span class="owner-badge" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'owner',this.dataset.uid)">Owner</span>`;
        } else if (u.role === 'admin') {
            b += `<span class="admin-badge" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'admin',this.dataset.uid)">Admin</span>`;
        } else if (u.role === 'mod') {
            b += `<span class="mod-badge" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'mod',this.dataset.uid)">Mod</span>`;
        }
        if (u.isDeveloper) {
            b += `<div class="dev-badge" title="Developer" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'dev',this.dataset.uid)"><svg class="ic"><use href="#ico-hammer"></use></svg></div>`;
        }
        let localBadges = {};
        if (this.myUid && u.uid === this.myUid) {
            try { localBadges = JSON.parse(localStorage.getItem('bsms_chess_badges_v1') || '{}') || {}; } catch(e) {}
        }
        const badges = { ...localBadges, ...(u.chessBadges || {}) };
        if (badges.netanyahu) {
            b += `<span class="boss-badge-netanyahu" title="Defeated Benjamin Netanyahu (10,000 ELO)" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'netanyahu',this.dataset.uid)"><img src="/img/bots/netanyahu.png" alt="" style="width:13px;height:13px;object-fit:contain;"> Netanyahu Slayer</span>`;
        }
        if (badges.david_martinez) {
            b += `<span class="boss-badge-david" title="Defeated David Martinez (3,000 ELO)" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'david',this.dataset.uid)"><img src="/img/bots/david_martinez.jpg" alt="" style="width:13px;height:13px;object-fit:cover;border-radius:3px;"> Sandevistan</span>`;
        }
        if (badges.super_gothamchess) {
            b += `<span class="boss-badge-gotham" title="Defeated Super Gothamchess (2,850 ELO)" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'gotham',this.dataset.uid)"><img src="/img/bots/super_gothamchess.jpg" alt="" style="width:13px;height:13px;object-fit:cover;border-radius:3px;"> Gotham Conqueror</span>`;
        }
        if (badges.pirate_token) {
            b += `<span class="boss-badge-pirate" title="Defeated The Pirate Token (3,600 ELO)" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'pirate',this.dataset.uid)"><img src="/img/bots/pirate_token.png" alt="" style="width:13px;height:13px;object-fit:contain;"> Fate Breaker</span>`;
        }
        if (badges.tom_pearl) {
            b += `<span class="boss-badge-tom" title="Defeated Tom Pearl (2,000 ELO)" data-uid="${uidAttr}" onclick="DirectoryApp.openBadgeModal(event,'tom',this.dataset.uid)"><img src="/img/bots/tom_pearl.jpg" alt="" style="width:13px;height:13px;object-fit:cover;border-radius:3px;"> Nutella Nemesis</span>`;
        }
        return b;
    },

    renderUserCard: function(u, isWide = false) {
        const avatarHtml = this.buildAvatarHTML(u, false);
        const badgesHtml = this.getBadgesHTML(u);
        const wideClass = isWide ? 'wide' : '';
        const tagLine = isWide ? `<span style="font-size:0.9rem; color:var(--accent); font-weight:bold; margin-bottom:4px; display:block;">Your Profile</span>` : '';
        const nameColor = (u.nameColor || u.chatColor || '').trim();
        const nameColorStyle = nameColor ? `style="color:${this.escapeHTML(nameColor)} !important; font-weight:bold;"` : '';
        const avBorderStyle = nameColor ? `style="border-color:${this.escapeHTML(nameColor)}; box-shadow:0 0 10px ${this.escapeHTML(nameColor)}33;"` : '';
        const colorDot = nameColor ? `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${this.escapeHTML(nameColor)}; box-shadow:0 0 6px ${this.escapeHTML(nameColor)}; flex-shrink:0;" title="Color: ${this.escapeHTML(nameColor)}"></span>` : '';

        return `
        <div class="user-card ${wideClass}" data-uid="${this.escapeHTML(u.uid)}" onclick="DirectoryApp.openByUid(this.dataset.uid)">
            <div class="c-av" ${avBorderStyle}>${avatarHtml}</div>
            <div class="u-info">
                ${tagLine}
                <div class="u-name-row">
                    <span class="u-name" ${nameColorStyle}>${this.escapeHTML(u.displayName)}</span>
                    ${colorDot}
                    ${badgesHtml}
                </div>
                <div class="u-username">@${this.escapeHTML(u.username)}</div>
            </div>
        </div>
        `;
    },

    renderMyCard: function() {
        const c = document.getElementById('myProfileContainer');
        if (this.currentUserObj && !this.searchQuery && this.activeFilter === 'all') {
            c.innerHTML = this.renderUserCard(this.currentUserObj, true);
        } else {
            c.innerHTML = '';
        }
    },

    renderUsers: function() {
        this.renderMyCard();
        const grid = document.getElementById('usersGrid');
        const list = this.getFilteredUsers();

        if (list.length === 0) {
            if (!this.searchQuery && this.activeFilter === 'all' && this.currentUserObj) {
                grid.innerHTML = `
                    <div class="state-container" style="grid-column: 1 / -1;">
                        <p style="font-size:1.3rem; color:var(--fg); margin-bottom:8px;">You're the first active member listed</p>
                        <p>As more BSMS Web members register, their profiles will appear here.</p>
                    </div>
                `;
                return;
            }
            if (!this.searchQuery && this.activeFilter === 'all' && this.users.length === 0 && !this.currentUserObj) {
                grid.innerHTML = `
                    <div class="state-container" style="grid-column: 1 / -1;">
                        <p style="font-size:1.4rem; color:var(--fg); margin-bottom:8px;">No registered users yet</p>
                        <p>Create an account to claim your profile and show up in the directory.</p>
                        <button class="btn" style="width:auto; margin: 16px auto 0; padding: 10px 22px;" onclick="location.href='/accounts'">Create Account / Sign In</button>
                    </div>
                `;
                return;
            }
            grid.innerHTML = `
                <div class="state-container" style="grid-column: 1 / -1;">
                    <p style="font-size:1.4rem; color:var(--fg); margin-bottom:8px;">No users found</p>
                    <p>Try broadening your search or changing the filter.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = list.map(u => this.renderUserCard(u)).join('');
    },

    renderMarkdown: function(str) {
        if (!str) return '';
        let out = this.escapeHTML(str);
        out = out.replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>');
        out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        out = out.replace(/__(.*?)__/g, '<u>$1</u>');
        out = out.replace(/(^|[^*])\*(?!\*)(.*?)\*(?!\*)/g, '$1<em>$2</em>');
        out = out.replace(/(^|[^_])_(?!_)(.*?)(?<!_)_/g, '$1<em>$2</em>');
        return out;
    },

    handleHashRoute: function() {
        const hash = window.location.hash;
        if (!hash || hash.length < 2 || hash === '#' || hash === '#/') {
            this.closeProfile(false);
            return;
        }
        let clean = hash;
        try {
            clean = decodeURIComponent(hash);
        } catch(e) {}
        clean = clean.replace(/^#+/, '').replace(/^\/+/, '').trim();
        clean = clean.replace(/^\[/, '').replace(/\]$/, '').trim();
        clean = clean.replace(/^\/+/, '').replace(/\/+$/, '').trim();
        clean = clean.replace(/^@/, '').trim();

        if (clean) {
            this.openProfileFullScreen(clean);
        } else {
            this.closeProfile(false);
        }
    },

    openProfileFullScreen: function(username) {
        const cleanName = username.trim().toLowerCase().replace(/^@/, '');
        
        // If users haven't loaded yet, show loading card and queue
        if (!this.usersLoaded) {
            this.pendingProfile = cleanName;
            document.getElementById('profileView').classList.add('show');
            document.getElementById('appShell').style.display = 'none';
            document.getElementById('controls-btn').style.display = 'none';
            document.getElementById('pvAvatar').innerHTML = '<div class="spinner-anim" style="width:36px;height:36px;border-width:3px;margin:auto;"></div>';
            document.getElementById('pvNameRow').innerHTML = '<span class="pv-name">Loading Profile...</span>';
            document.getElementById('pvUsername').innerText = '@' + cleanName;
            return;
        }

        let u = this.users.find(x => (x.username && x.username.toLowerCase() === cleanName) || x.uid === cleanName || (x.displayName && x.displayName.toLowerCase() === cleanName));
        if (!u && this.currentUserObj && ((this.currentUserObj.username && this.currentUserObj.username.toLowerCase() === cleanName) || this.currentUserObj.uid === cleanName || (this.currentUserObj.displayName && this.currentUserObj.displayName.toLowerCase() === cleanName))) {
            u = this.currentUserObj;
        }

        if (!u) {
            UI.showToast("User not found.", "error");
            this.closeProfile(true);
            return;
        }

        const isMe = this.myUid && this.myUid === u.uid;
        
        const pvColor = (u.nameColor || u.chatColor || '').trim();
        const pvColorStyle = pvColor ? `style="color:${this.escapeHTML(pvColor)} !important; font-weight:bold;"` : '';
        const pvColorBadge = pvColor ? `<span style="display:inline-flex; align-items:center; gap:5px; background:${this.escapeHTML(pvColor)}1a; color:${this.escapeHTML(pvColor)}; border:1px solid ${this.escapeHTML(pvColor)}55; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:bold; font-family:var(--font-mono); vertical-align:middle; text-transform:uppercase;"><span style="width:7px; height:7px; border-radius:50%; background:${this.escapeHTML(pvColor)};"></span>${this.escapeHTML(pvColor)}</span>` : '';

        const pvAvEl = document.getElementById('pvAvatar');
        if (pvAvEl) {
            pvAvEl.innerHTML = this.buildAvatarHTML(u, true);
            if (pvColor) {
                pvAvEl.style.borderColor = pvColor;
                pvAvEl.style.boxShadow = `0 0 16px ${pvColor}44`;
            } else {
                pvAvEl.style.borderColor = 'var(--border)';
                pvAvEl.style.boxShadow = 'none';
            }
        }
        document.getElementById('pvNameRow').innerHTML = `<span class="pv-name" ${pvColorStyle}>${this.escapeHTML(u.displayName)}</span> ${pvColorBadge} ${this.getBadgesHTML(u)}`;
        document.getElementById('pvUsername').innerText = `@${u.username}`;
        document.getElementById('pvCountFollowers').innerText = u.followersCount || 0;
        document.getElementById('pvCountFollowing').innerText = u.followingCount || 0;
        document.getElementById('pvBioText').innerHTML = u.bio ? this.renderMarkdown(u.bio) : '<span style="color:var(--fg2); font-style:italic;">This user hasn\'t written a biography yet.</span>';

        document.getElementById('btnShareProfile').onclick = () => {
            const url = window.location.origin + '/users/#/' + encodeURIComponent(u.username);
            if (navigator.share) {
                navigator.share({ title: 'BSMS Web User: @' + u.username, url: url }).catch(()=>{});
            } else {
                navigator.clipboard.writeText(url);
                UI.showToast('Link copied to clipboard!', 'success');
            }
        };

        const actionsDiv = document.getElementById('pvActions');
        if (isMe) {
            actionsDiv.innerHTML = `<button class="btn sec" onclick="location.href='/accounts'" style="width:100%;">Edit Profile</button>`;
        } else {
            const followText = u.isFollowing ? 'Unfollow' : 'Follow';
            const followIcon = u.isFollowing ? 'ico-user-check' : 'ico-user-plus';
            const followBtnCls = u.isFollowing ? 'btn sec' : 'btn primary';
            actionsDiv.innerHTML = `
                <button class="${followBtnCls}" id="pvFollowBtn" onclick="DirectoryApp.toggleFollow('${u.uid}')" style="flex:1;">
                    <svg class="ic" style="width:18px;height:18px;"><use href="#${followIcon}"></use></svg> ${followText}
                </button>
                <button class="btn sec" onclick="DirectoryApp.startDM('${u.uid}')" style="flex:1;">
                    <svg class="ic" style="width:18px;height:18px;"><use href="#ico-msg"></use></svg> Message
                </button>
            `;
        }

        this.renderRelationList('pvFollowersList', u.followersList || [], "No followers yet.");
        this.renderRelationList('pvFollowingList', u.followingList || [], "Not following anyone yet.");

        document.querySelector('.pv-tab[onclick*="bio"]').click();

        document.getElementById('appShell').style.display = 'none';
        document.getElementById('controls-btn').style.display = 'none';
        document.getElementById('profileView').classList.add('show');
        
        try {
            const cleanHash = '#/' + encodeURIComponent(u.username);
            if (window.location.hash !== cleanHash) {
                history.replaceState(null, '', cleanHash);
            }
        } catch(e) {}
        window.scrollTo(0,0);
    },

    closeProfile: function(updateHistory = true) {
        this.pendingProfile = null;
        document.getElementById('profileView').classList.remove('show');
        document.getElementById('appShell').style.display = 'flex';
        document.getElementById('controls-btn').style.display = 'flex';
        if (updateHistory) {
            try {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            } catch (e) {
                window.location.hash = '';
            }
        }
    },

    switchTab: function(tabName, btnEl) {
        document.querySelectorAll('.pv-tab').forEach(el => el.classList.remove('active'));
        btnEl.classList.add('active');
        document.querySelectorAll('.pv-pane').forEach(el => el.classList.remove('active'));
        document.getElementById('pane-' + tabName).classList.add('active');
    },

    renderRelationList: function(containerId, uidArray, emptyMsg) {
        const c = document.getElementById(containerId);
        if (!uidArray || !Array.isArray(uidArray) || uidArray.length === 0) {
            c.innerHTML = `<div style="text-align:center; padding:30px; color:var(--fg2);">${emptyMsg}</div>`;
            return;
        }

        let html = '';
        uidArray.forEach(mId => {
            const u = this.findUserByUid(mId);
            if (!u) return;

            const avatarHtml = this.buildAvatarHTML(u, false);
            const uColor = (u.nameColor || u.chatColor || '').trim();
            const uColorStyle = uColor ? `style="color:${this.escapeHTML(uColor)} !important; font-weight:bold;"` : 'style="color:var(--fg); font-weight:bold;"';
            const uAvStyle = uColor ? `style="border-color:${this.escapeHTML(uColor)};"` : '';
            const uDot = uColor ? `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${this.escapeHTML(uColor)}; box-shadow:0 0 4px ${this.escapeHTML(uColor)}; flex-shrink:0;"></span>` : '';

            html += `
            <div class="user-list-item" data-uid="${this.escapeHTML(u.uid)}" onclick="DirectoryApp.openByUid(this.dataset.uid)">
                <div class="c-av uli-av" ${uAvStyle}>${avatarHtml}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span ${uColorStyle}>${this.escapeHTML(u.displayName)}</span>
                        ${uDot}
                        ${this.getBadgesHTML(u)}
                    </div>
                    <div style="font-size:0.9rem; color:var(--fg2); font-family:var(--font-mono);">@${this.escapeHTML(u.username)}</div>
                </div>
            </div>`;
        });
        c.innerHTML = html || `<div style="text-align:center; padding:30px; color:var(--fg2);">${emptyMsg}</div>`;
    },

    toggleFollow: async function(targetUid) {
        const u = this.findUserByUid(targetUid);
        if (!u) return;

        const sid = this.getSessionId();
        if (!sid) {
            UI.showToast("Please log in to follow users.", "error");
            location.href = '/accounts';
            return;
        }

        const isFollowing = u.isFollowing;
        const action = isFollowing ? 'unfollow' : 'follow';
        const btn = document.getElementById(`pvFollowBtn`);
        if (btn) btn.disabled = true;

        try {
            const res = await fetch(`/api/auth?action=${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
                body: JSON.stringify({ targetUid })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Action failed");

            u.isFollowing = !isFollowing;
            u.followersCount = Math.max(0, (u.followersCount || 0) + (isFollowing ? -1 : 1));
            
            if (Array.isArray(u.followersList) && this.myUid) {
                if (u.isFollowing && !u.followersList.includes(this.myUid)) u.followersList.push(this.myUid);
                else if (!u.isFollowing) u.followersList = u.followersList.filter(id => id !== this.myUid);
            }
            if (this.currentUserObj && Array.isArray(this.currentUserObj.followingList)) {
                if (u.isFollowing && !this.currentUserObj.followingList.includes(targetUid)) {
                    this.currentUserObj.followingList.push(targetUid);
                    this.currentUserObj.followingCount = (this.currentUserObj.followingCount || 0) + 1;
                } else if (!u.isFollowing) {
                    this.currentUserObj.followingList = this.currentUserObj.followingList.filter(id => id !== targetUid);
                    this.currentUserObj.followingCount = Math.max(0, (this.currentUserObj.followingCount || 1) - 1);
                }
            }
            
            this.updateCounts();
            if (this.activeFilter === 'following') this.renderUsers();
            
            if (btn) {
                const followText = u.isFollowing ? 'Unfollow' : 'Follow';
                const followIcon = u.isFollowing ? 'ico-user-check' : 'ico-user-plus';
                btn.className = u.isFollowing ? 'btn sec' : 'btn primary';
                btn.innerHTML = `<svg class="ic" style="width:18px;height:18px;"><use href="#${followIcon}"></use></svg> ${followText}`;
            }
            document.getElementById('pvCountFollowers').innerText = u.followersCount;
            this.renderRelationList('pvFollowersList', u.followersList || [], "No followers yet.");

            UI.showToast(u.isFollowing ? `You are now following ${u.displayName}` : `Unfollowed ${u.displayName}`, "success");
        } catch (err) {
            UI.showToast(err.message || "Failed to update follow status", "error");
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    startDM: async function(targetUid) {
        let isAuth = false;
        try {
            const sessStr = localStorage.getItem('bsms_auth_session') || localStorage.getItem('bsms_session');
            if (sessStr) {
                const sess = JSON.parse(sessStr);
                if (sess.loggedIn && (sess.uid || sess.username)) isAuth = true;
            }
        } catch(e) {}

        const sid = this.getSessionId();
        if (!isAuth && !sid) {
            UI.showToast("Please log in to message users.", "error");
            setTimeout(() => { location.href = '/accounts'; }, 900);
            return;
        }
        UI.showToast("Opening conversation...", "info");
        try {
            const res = await fetch('/api/chat?action=startDM', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid },
                body: JSON.stringify({ targetUid })
            });
            const data = await res.json();
            if (data && data.cid) {
                location.href = `/chat#dm/${encodeURIComponent(data.cid)}`;
                return;
            }
        } catch(e) {}
        location.href = `/chat#user/${encodeURIComponent(targetUid)}`;
    },

    escapeHTML: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

const Router = {
    setHash: function(username) {
        const clean = encodeURIComponent(String(username).trim().replace(/^@/, ''));
        window.location.hash = '#/' + clean;
    },
    clearHash: function() {
        DirectoryApp.closeProfile(true);
    }
};

window.addEventListener('DOMContentLoaded', () => DirectoryApp.init());
