/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
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
    showOwnerModal: (name) => { document.getElementById('omUserDisplay').innerText = name; UI.openModal('ownerModal'); }
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

    renderCurrentSession: function() {
        try {
            const sessStr = localStorage.getItem('bsms_auth_session') || localStorage.getItem('bsms_session');
            if (sessStr) {
                const sess = JSON.parse(sessStr);
                const pfpEl = document.getElementById('headerAvatar');
                if (pfpEl) {
                    if (sess.avatar) {
                        pfpEl.innerHTML = `<img src="${this.escapeHTML(sess.avatar)}" style="width:100%;height:100%;object-fit:cover;">`;
                        pfpEl.className = '';
                    } else {
                        pfpEl.innerText = ((sess.displayName || sess.username || '?').charAt(0)).toUpperCase();
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
            const sid = localStorage.getItem('session_id') || "";
            const res = await fetch('/api/auth?action=getPublicUsers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': sid }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load users");

            this.users = data.users || [];
            this.myUid = data.myUid || null;
            
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
        const visible = this.users.filter(u => !u.hiddenFromDirectory);
        document.getElementById('count-all').innerText = visible.length;
        document.getElementById('count-team').innerText = visible.filter(u => u.role === 'owner' || u.role === 'admin' || u.role === 'mod' || u.isDeveloper).length;
        document.getElementById('count-following').innerText = visible.filter(u => u.isFollowing).length;
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
        let list = this.users.filter(u => {
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
        const safeName = this.escapeHTML(u.displayName);
        if (u.verified) {
            b += `<svg class="ic verified-icon" title="Verified" onclick="event.stopPropagation(); UI.showVerifiedModal('${safeName}')"><use href="#ico-verified"></use></svg>`;
        }
        if (u.role === 'owner') {
            b += `<span class="owner-badge" onclick="event.stopPropagation(); UI.showOwnerModal('${safeName}')">Owner</span>`;
        } else if (u.role === 'admin') {
            b += `<span class="admin-badge" onclick="event.stopPropagation(); UI.showAdminModal('${safeName}')">Admin</span>`;
        } else if (u.role === 'mod') {
            b += `<span class="mod-badge" onclick="event.stopPropagation(); UI.showModModal('${safeName}')">Mod</span>`;
        }
        if (u.isDeveloper) {
            b += `<div class="dev-badge" title="Developer" onclick="event.stopPropagation(); UI.showDevModal('${safeName}')"><svg class="ic"><use href="#ico-hammer"></use></svg></div>`;
        }
        return b;
    },

    renderUserCard: function(u, isWide = false) {
        const initial = ((u.displayName || u.username || '?').charAt(0)).toUpperCase();
        const avatarHtml = u.avatar ? `<img src="${this.escapeHTML(u.avatar)}">` : initial;
        const badgesHtml = this.getBadgesHTML(u);
        const wideClass = isWide ? 'wide' : '';
        const tagLine = isWide ? `<span style="font-size:0.9rem; color:var(--accent); font-weight:bold; margin-bottom:4px; display:block;">Your Profile</span>` : '';
        const nameColor = (u.nameColor || u.chatColor || '').trim();
        const nameColorStyle = nameColor ? `style="color:${this.escapeHTML(nameColor)} !important; font-weight:bold;"` : '';
        const avBorderStyle = nameColor ? `style="border-color:${this.escapeHTML(nameColor)}; box-shadow:0 0 10px ${this.escapeHTML(nameColor)}33;"` : '';
        const colorDot = nameColor ? `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${this.escapeHTML(nameColor)}; box-shadow:0 0 6px ${this.escapeHTML(nameColor)}; flex-shrink:0;" title="Color: ${this.escapeHTML(nameColor)}"></span>` : '';

        return `
        <div class="user-card ${wideClass}" onclick="Router.setHash('${u.username}')">
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
        let clean = decodeURIComponent(hash);
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
        
        const initial = ((u.displayName || u.username || '?').charAt(0)).toUpperCase();
        const pvColor = (u.nameColor || u.chatColor || '').trim();
        const pvColorStyle = pvColor ? `style="color:${this.escapeHTML(pvColor)} !important; font-weight:bold;"` : '';
        const pvColorBadge = pvColor ? `<span style="display:inline-flex; align-items:center; gap:5px; background:${this.escapeHTML(pvColor)}1a; color:${this.escapeHTML(pvColor)}; border:1px solid ${this.escapeHTML(pvColor)}55; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:bold; font-family:var(--font-mono); vertical-align:middle; text-transform:uppercase;"><span style="width:7px; height:7px; border-radius:50%; background:${this.escapeHTML(pvColor)};"></span>${this.escapeHTML(pvColor)}</span>` : '';

        const pvAvEl = document.getElementById('pvAvatar');
        if (pvAvEl) {
            pvAvEl.innerHTML = u.avatar ? `<img src="${this.escapeHTML(u.avatar)}">` : initial;
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
            let u = this.users.find(x => x.uid === mId);
            if (!u && this.currentUserObj && this.currentUserObj.uid === mId) u = this.currentUserObj;
            if (!u) return;

            const initial = ((u.displayName || u.username || '?').charAt(0)).toUpperCase();
            const avatarHtml = u.avatar ? `<img src="${this.escapeHTML(u.avatar)}">` : initial;
            const uColor = (u.nameColor || u.chatColor || '').trim();
            const uColorStyle = uColor ? `style="color:${this.escapeHTML(uColor)} !important; font-weight:bold;"` : 'style="color:var(--fg); font-weight:bold;"';
            const uAvStyle = uColor ? `style="border-color:${this.escapeHTML(uColor)};"` : '';
            const uDot = uColor ? `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${this.escapeHTML(uColor)}; box-shadow:0 0 4px ${this.escapeHTML(uColor)}; flex-shrink:0;"></span>` : '';

            html += `
            <div class="user-list-item" onclick="Router.setHash('${u.username}')">
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
        let u = this.users.find(x => x.uid === targetUid);
        if (!u && this.currentUserObj && this.currentUserObj.uid === targetUid) u = this.currentUserObj;
        if (!u) return;

        const sid = localStorage.getItem('session_id');
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
            u.followersCount += isFollowing ? -1 : 1;
            
            if (u.followersList) {
                if (u.isFollowing) u.followersList.push(this.myUid);
                else u.followersList = u.followersList.filter(id => id !== this.myUid);
            }
            
            this.updateCounts();
            
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
            const sessStr = localStorage.getItem('bsms_auth_session');
            if (sessStr) {
                const sess = JSON.parse(sessStr);
                if (sess.loggedIn && (sess.uid || sess.username)) isAuth = true;
            }
        } catch(e) {}

        if (!isAuth) {
            UI.showToast("Please log in to message users.", "error");
            setTimeout(() => { location.href = '/accounts'; }, 900);
            return;
        }

        const sid = localStorage.getItem('session_id') || "";
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
