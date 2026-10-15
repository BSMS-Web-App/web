/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

const Admin = {
    usersCache: {},
    bannedDevicesCache: {},
    activeTargetUid: null,
    currentAvatarValue: "",
    callerRole: 'user',
    callerUid: null,
    statusFilter: 'all',
    selectedUids: new Set(),

    switchTab: function(tabId, btnEl) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById(`${tabId}-panel`);
        if (panel) panel.classList.add('active');
        if (btnEl) btnEl.classList.add('active');
        
        if (tabId === 'users' || tabId === 'devices') this.loadUsers();
        if (tabId === 'db') this.loadDB();
    },

    apiCall: async function(action, payload = {}) {
        const sid = localStorage.getItem('session_id') || "";
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-ID': sid
            },
            body: JSON.stringify({ action, ...payload })
        });
        
        // If the user isn't staff (admin or mod), inject 401.html
        if (res.status === 401 || res.status === 403) {
            try {
                const unauthorizedPage = await fetch('/401.html');
                const htmlText = await unauthorizedPage.text();
                document.open();
                document.write(htmlText);
                document.close();
            } catch (e) {
                document.body.innerHTML = '<h1 style="color:#ef4444;text-align:center;margin-top:100px;font-family:sans-serif;">401 Unauthorized</h1>';
            }
            return new Promise(() => {});
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert("Admin API Error: " + (data.error || res.statusText));
            throw new Error(data.error);
        }
        return data;
    },

    tsToDateTimeLocal: function(ts) {
        if (!ts || isNaN(ts)) return "";
        const d = new Date(Number(ts));
        if (isNaN(d.getTime())) return "";
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
    },

    dateTimeLocalToTs: function(val) {
        if (!val) return null;
        const ts = new Date(val).getTime();
        return isNaN(ts) ? null : ts;
    },

    formatPasswordDisplay: function(rawPass) {
        if (!rawPass) return "(None)";
        if (/^[a-f0-9]{64}$/i.test(rawPass)) {
            return `[SHA-256] ${rawPass}`;
        }
        try {
            return `${atob(rawPass)} (Base64)`;
        } catch (e) {
            return rawPass;
        }
    },

    buildPfpHTML: function(acc, large = false) {
        const initial = ((acc.displayName || acc.username || '?').charAt(0)).toUpperCase();
        if (acc.avatar && acc.avatar.trim() !== '') {
            return `<img src="${acc.avatar}" alt="PFP">`;
        }
        return initial;
    },

    setStatusFilter: function(status, btnEl) {
        this.statusFilter = status;
        document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        this.renderUsers();
    },

    loadUsers: async function() {
        const tbody = document.querySelector('#users-table tbody');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Syncing with Firebase...</td></tr>';
        try {
            const data = await this.apiCall('getUsers');
            this.usersCache = data.accounts || {};
            this.bannedDevicesCache = data.banned_devices || {};
            this.callerRole = data.callerRole || 'user';
            this.callerRole = data.callerRole || 'user';
            this.callerUid = data.callerUid || null;

            // Apply role-based restrictions
            const modBanner = document.getElementById('mod-banner');
            const bulkBtn = document.getElementById('bulk-ban-btn');
            const navDb = document.getElementById('nav-btn-db');

            // Strictly: Only OWNER can access raw DB inspector!
            if (this.callerRole === 'owner') {
                if (navDb) navDb.style.display = 'block';
            } else {
                if (navDb) navDb.style.display = 'none';
            }

            if (this.callerRole === 'mod') {
                if (modBanner) modBanner.classList.add('show');
                if (bulkBtn) bulkBtn.style.display = 'none';
            } else {
                if (modBanner) modBanner.classList.remove('show');
            }

            this.selectedUids.clear();
            this.updateBulkCount();
            this.renderUsers();
            this.renderBannedDevices();
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="8" style="color:var(--danger)">Failed to load accounts. Ensure your account has staff privileges.</td></tr>';
        }
    },

    renderUsers: function() {
        const tbody = document.querySelector('#users-table tbody');
        const query = (document.getElementById('user-search')?.value || '').toLowerCase();
        tbody.innerHTML = '';

        const isMod = this.callerRole === 'mod';
        const isOwner = this.callerRole === 'owner';

        for (const [uid, acc] of Object.entries(this.usersCache)) {
            const status = acc.account_status || 'active';

            // Filter by status tab
            if (this.statusFilter !== 'all' && status !== this.statusFilter) {
                continue;
            }

            const matchStr = `${uid} ${acc.username || ''} ${acc.displayName || ''} ${acc.email || ''}`.toLowerCase();
            if (query && !matchStr.includes(query)) continue;

            let expiryText = '';
            if (status === 'banned') {
                expiryText = acc.ban_expires
                    ? `<div style="font-size:11px; color:var(--warn); margin-top:4px;">Until: ${new Date(acc.ban_expires).toLocaleString()}</div>`
                    : `<div style="font-size:11px; color:var(--danger); margin-top:4px;">Permanent</div>`;
            }

            const badges = [];
            if (acc.role === 'owner') badges.push(`<span class="badge owner">Owner</span>`);
            else if (acc.role === 'admin') badges.push(`<span class="badge admin">Admin</span>`);
            else if (acc.role === 'mod') badges.push(`<span class="badge mod">Mod</span>`);
            if (acc.isDeveloper) badges.push(`<span class="badge dev">Dev</span>`);
            if (acc.verified) badges.push(`<span class="badge verified">✓ Verified</span>`);

            const isTargetAdminOrOwner = acc.role === 'admin' || acc.role === 'owner';
            const canSelect = !isMod && (isOwner ? uid !== this.callerUid : !isTargetAdminOrOwner);
            const isChecked = this.selectedUids.has(uid);

            const creatorDisp = acc.creator_session_id ? `${acc.creator_session_id.substring(0, 10)}...` : (acc.sessions ? `${Object.keys(acc.sessions)[0]?.substring(0, 10)}...` : 'N/A');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;">
                    <input type="checkbox" ${canSelect ? '' : 'disabled title="Protected staff accounts cannot be bulk banned"'} 
                           ${isChecked ? 'checked' : ''} 
                           onchange="Admin.toggleSelect('${uid}', this.checked)">
                </td>
                <td><div class="pfp-cell">${this.buildPfpHTML(acc)}</div></td>
                <td style="color:var(--fg2); font-size:11px;">${uid}</td>
                <td>
                    <strong style="color:var(--fg);">${acc.username || 'N/A'}</strong>
                    <div style="color:var(--fg2); font-size:11px;">${acc.displayName || ''}</div>
                </td>
                <td>${badges.join(' ') || '<span style="color:var(--fg2)">User</span>'}</td>
                <td>
                    <span class="badge ${status}">${status}</span>
                    ${expiryText}
                </td>
                <td style="font-size:11px; color:var(--fg2);">${creatorDisp}</td>
                <td><button class="btn sm ${isMod ? 'sec' : ''}" onclick="Admin.openEditModal('${uid}')">${isMod ? 'View Details' : 'Manage'}</button></td>
            `;
            tbody.appendChild(tr);
        }

        if (tbody.children.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--fg2); padding:20px;">No accounts found matching filter.</td></tr>`;
        }
    },

    toggleSelect: function(uid, isChecked) {
        if (isChecked) {
            this.selectedUids.add(uid);
        } else {
            this.selectedUids.delete(uid);
        }
        this.updateBulkCount();
    },

    toggleSelectAll: function(isChecked) {
        for (const [uid, acc] of Object.entries(this.usersCache)) {
            const status = acc.account_status || 'active';
            if (this.statusFilter !== 'all' && status !== this.statusFilter) continue;
            if (acc.role === 'admin') continue; // Admins cannot be bulk banned

            if (isChecked) this.selectedUids.add(uid);
            else this.selectedUids.delete(uid);
        }
        this.updateBulkCount();
        this.renderUsers();
    },

    updateBulkCount: function() {
        const count = this.selectedUids.size;
        const btn = document.getElementById('bulk-ban-btn');
        const countSpan = document.getElementById('bulk-count');
        if (countSpan) countSpan.innerText = count;

        if (btn) {
            if (count > 0 && this.callerRole !== 'mod') {
                btn.style.display = 'inline-flex';
            } else {
                btn.style.display = 'none';
            }
        }
    },

    openBulkBanModal: function() {
        if (this.selectedUids.size === 0) return;
        document.getElementById('bb-count').innerText = this.selectedUids.size;
        document.getElementById('bulk-ban-modal').classList.add('show');
    },

    closeBulkBanModal: function() {
        document.getElementById('bulk-ban-modal').classList.remove('show');
    },

    submitBulkBan: async function() {
        if (this.selectedUids.size === 0) return;
        const reason = document.getElementById('bb-reason').value.trim() || 'Bulk banned by administration.';
        const dtVal = document.getElementById('bb-expires-dt').value;
        const ban_expires = this.dateTimeLocalToTs(dtVal);

        const targetUids = Array.from(this.selectedUids);

        try {
            await this.apiCall('bulkBan', { targetUids, reason, ban_expires });
            alert(`Successfully banned ${targetUids.length} accounts.`);
            this.closeBulkBanModal();
            this.selectedUids.clear();
            this.loadUsers();
        } catch (e) {
            alert("Bulk ban failed: " + e.message);
        }
    },

    renderBannedDevices: function() {
        const tbody = document.querySelector('#devices-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const isMod = this.callerRole === 'mod';
        const entries = Object.entries(this.bannedDevicesCache);
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="color:var(--fg2); text-align:center;">No banned devices recorded.</td></tr>';
            return;
        }

        for (const [devId, info] of entries) {
            const exp = info.ban_expires ? new Date(info.ban_expires).toLocaleString() : 'Permanent';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${devId}</strong></td>
                <td>${info.reason || '---'}</td>
                <td style="color:var(--warn);">${exp}</td>
                <td>${isMod ? '<span style="color:var(--fg2);">Read-Only</span>' : `<button class="btn sec sm" onclick="Admin.unbanDevice('${devId}')">Unban Device</button>`}</td>
            `;
            tbody.appendChild(tr);
        }
    },

    openEditModal: function(uid) {
        this.activeTargetUid = uid;
        const acc = this.usersCache[uid];
        this.currentAvatarValue = acc.avatar || "";

        const isMod = this.callerRole === 'mod';
        const isOwner = this.callerRole === 'owner';
        const isTargetOwner = acc.role === 'owner';
        const isTargetAdmin = acc.role === 'admin';
        const isSelf = uid === this.callerUid;

        document.getElementById('em-uid').innerText = uid;
        document.getElementById('em-pfp-preview').innerHTML = this.buildPfpHTML(acc, true);
        document.getElementById('em-header-name').innerText = `${acc.displayName || acc.username} (@${acc.username})`;
        document.getElementById('em-created').innerText = `Created: ${acc.createdAt ? new Date(acc.createdAt).toLocaleString() : 'Unknown'}`;
        
        // Creator session attribution
        const creatorInfoEl = document.getElementById('em-creator-info');
        if (creatorInfoEl) {
            creatorInfoEl.innerText = acc.creator_session_id || (acc.sessions ? Object.keys(acc.sessions)[0] || 'N/A' : 'N/A');
        }

        document.getElementById('em-username').value = acc.username || '';
        document.getElementById('em-displayname').value = acc.displayName || '';
        document.getElementById('em-email').value = acc.email || '';
        document.getElementById('em-bio').value = acc.bio || '';
        document.getElementById('em-role').value = acc.role || '';
        document.getElementById('em-verified').checked = Boolean(acc.verified);
        document.getElementById('em-developer').checked = Boolean(acc.isDeveloper);

        // Single-owner role option: only visible to current owner
        const ownerOpt = document.getElementById('em-role-owner-opt');
        if (ownerOpt) ownerOpt.style.display = isOwner ? 'block' : 'none';

        document.getElementById('em-password-view').value = this.formatPasswordDisplay(acc.password);
        document.getElementById('em-new-password').value = '';

        const statusSelect = document.getElementById('em-status');
        statusSelect.value = acc.account_status || 'active';
        document.getElementById('em-banreason').value = acc.ban_reason || '';
        document.getElementById('em-banexpires-dt').value = this.tsToDateTimeLocal(acc.ban_expires);

        // Admin & Owner protection notice
        const protectNotice = document.getElementById('em-admin-protect-notice');
        const bannedOption = statusSelect.querySelector('option[value="banned"]');
        const saveBtn = document.getElementById('em-save-btn');

        if (isTargetOwner && !isOwner) {
            // Non-owners cannot touch the owner
            if (protectNotice) {
                protectNotice.style.display = 'block';
                protectNotice.innerText = '⚠️ Protected Account: Only the Server Owner can modify the owner account.';
            }
            if (bannedOption) bannedOption.disabled = true;
            document.getElementById('em-role').disabled = true;
            if (saveBtn) saveBtn.style.display = 'none';
        } else if (isTargetAdmin && !isSelf && !isOwner) {
            // Admins cannot ban or demote other admins
            if (protectNotice) {
                protectNotice.style.display = 'block';
                protectNotice.innerText = '⚠️ Protected Account: Administrators cannot ban or demote other administrators.';
            }
            if (bannedOption) bannedOption.disabled = true;
            document.getElementById('em-role').disabled = true;
            if (saveBtn) saveBtn.style.display = 'inline-flex';
        } else {
            if (protectNotice) protectNotice.style.display = 'none';
            if (bannedOption) bannedOption.disabled = false;
            document.getElementById('em-role').disabled = isMod;
            if (saveBtn) saveBtn.style.display = isMod ? 'none' : 'inline-flex';
        }

        // Mod read-only controls
        const modNotice = document.getElementById('em-mod-notice');
        if (isMod) {
            if (modNotice) modNotice.style.display = 'block';
            if (saveBtn) saveBtn.style.display = 'none';
            ['em-username', 'em-displayname', 'em-email', 'em-bio', 'em-role', 'em-new-password', 'em-status', 'em-banreason', 'em-banexpires-dt'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.disabled = true;
            });
            document.getElementById('em-verified').disabled = true;
            document.getElementById('em-developer').disabled = true;
        } else {
            if (modNotice) modNotice.style.display = 'none';
            ['em-username', 'em-displayname', 'em-email', 'em-bio', 'em-new-password', 'em-status', 'em-banreason', 'em-banexpires-dt'].forEach(id => {
                const el = document.getElementById(id);
                if (el && !((isTargetOwner && !isOwner) || (isTargetAdmin && !isSelf && !isOwner && id === 'em-role'))) {
                    el.disabled = false;
                }
            });
            document.getElementById('em-verified').disabled = false;
            document.getElementById('em-developer').disabled = false;
        }

        // Render Sessions & Device IDs
        const sessBody = document.querySelector('#em-sessions-table tbody');
        sessBody.innerHTML = '';
        if (acc.sessions && Object.keys(acc.sessions).length > 0) {
            for (const [sid, sData] of Object.entries(acc.sessions)) {
                const devId = sData.deviceId || sid;
                const lastAct = sData.lastActive ? new Date(sData.lastActive).toLocaleString() : 'Unknown';
                const isDevBanned = Boolean(this.bannedDevicesCache[devId]);

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div><strong>Device:</strong> ${devId}</div>
                        <div style="font-size:11px; color:var(--fg2);">Session: ${sid}</div>
                    </td>
                    <td>${lastAct}</td>
                    <td style="display:flex; gap:6px;">
                        ${isMod ? '<span style="color:var(--fg2);">Read-Only</span>' : `
                        <button class="btn warn sm" onclick="Admin.banDeviceFromModal('${devId}')">
                            ${isDevBanned ? 'Update Device Ban' : 'Ban Device'}
                        </button>
                        <button class="btn sec sm" onclick="Admin.revokeSession('${uid}', '${sid}')">Revoke</button>
                        `}
                    </td>
                `;
                sessBody.appendChild(tr);
            }
        } else {
            sessBody.innerHTML = '<tr><td colspan="3" style="color:var(--fg2);">No active sessions linked to this account.</td></tr>';
        }

        document.getElementById('edit-modal').classList.add('show');
    },

    closeModal: function() {
        document.getElementById('edit-modal').classList.remove('show');
    },

    clearAvatar: function() {
        if (this.callerRole === 'mod') return;
        this.currentAvatarValue = "";
        const acc = { ...this.usersCache[this.activeTargetUid], avatar: "" };
        document.getElementById('em-pfp-preview').innerHTML = this.buildPfpHTML(acc, true);
    },

    saveUser: async function() {
        if (this.callerRole === 'mod') {
            alert("Moderators have read-only access.");
            return;
        }

        const uid = this.activeTargetUid;
        if (!uid) return;

        const targetAcc = this.usersCache[uid] || {};
        const isOwner = this.callerRole === 'owner';
        const isTargetOwner = targetAcc.role === 'owner';
        const isTargetAdmin = targetAcc.role === 'admin';
        const isSelf = uid === this.callerUid;

        const status = document.getElementById('em-status').value;
        const roleVal = document.getElementById('em-role').value;

        // Owner protection check
        if (isTargetOwner && !isOwner) {
            alert("Admins cannot modify the server owner.");
            return;
        }

        // Admin protection check: Admins cannot ban other admins
        if (isTargetAdmin && !isSelf && !isOwner && status === 'banned') {
            alert("Admins cannot ban other administrators.");
            return;
        }

        // Admin protection check: Admins cannot promote anyone to owner
        if (!isOwner && roleVal === 'owner') {
            alert("Only the Server Owner can transfer ownership.");
            return;
        }

        const dtVal = document.getElementById('em-banexpires-dt').value;
        const expiresTs = status === 'banned' ? this.dateTimeLocalToTs(dtVal) : null;
        const reasonVal = status === 'banned' ? (document.getElementById('em-banreason').value.trim() || 'This account has been banned.') : null;

        const updates = {
            username: document.getElementById('em-username').value.trim(),
            displayName: document.getElementById('em-displayname').value.trim(),
            email: document.getElementById('em-email').value.trim(),
            bio: document.getElementById('em-bio').value.trim(),
            avatar: this.currentAvatarValue,
            role: roleVal ? roleVal : null,
            verified: document.getElementById('em-verified').checked,
            isDeveloper: document.getElementById('em-developer').checked,
            account_status: status,
            ban_reason: reasonVal,
            ban_expires: expiresTs
        };

        const newPassword = document.getElementById('em-new-password').value;

        await this.apiCall('updateUser', { targetUid: uid, updates, newPassword });
        this.closeModal();
        this.loadUsers();
    },

    banDeviceFromModal: async function(deviceId) {
        if (this.callerRole === 'mod') return;
        const defaultReason = document.getElementById('em-banreason').value.trim() || 'This device has been banned from the ecosystem.';
        const reason = prompt(`Ban Device ID: ${deviceId}\nEnter ban reason:`, defaultReason);
        if (reason === null) return;

        const dtVal = document.getElementById('em-banexpires-dt').value;
        const ban_expires = this.dateTimeLocalToTs(dtVal);

        await this.apiCall('banDevice', { deviceId, reason, ban_expires });
        alert(`Device ${deviceId} added to /banned_devices.`);
        this.loadUsers();
    },

    unbanDevice: async function(deviceId) {
        if (this.callerRole === 'mod') return;
        if (!confirm(`Remove ban for device ${deviceId}?`)) return;
        await this.apiCall('unbanDevice', { deviceId });
        this.loadUsers();
    },

    revokeSession: async function(uid, sid) {
        if (this.callerRole === 'mod') return;
        if (!confirm(`Revoke session ${sid}?`)) return;
        await this.apiCall('revokeSession', { targetUid: uid, targetSessionId: sid });
        await this.loadUsers();
        this.openEditModal(uid);
    },

    loadDB: async function() {
        if (this.callerRole === 'mod') return;
        const treeEl = document.getElementById('db-tree');
        treeEl.innerHTML = 'Fetching database snapshot...';
        try {
            const data = await this.apiCall('getDB');
            treeEl.innerHTML = '';
            treeEl.appendChild(this.buildDBTreeNode('/', data));
        } catch (e) {
            treeEl.innerHTML = `<span style="color:var(--danger)">Failed to fetch database: ${e.message}</span>`;
        }
    },

    buildDBTreeNode: function(path, val) {
        const wrap = document.createElement('div');
        wrap.className = 'tree-node';

        if (typeof val === 'object' && val !== null) {
            const header = document.createElement('div');
            header.innerHTML = `<span class="tree-key">▼ ${path.split('/').pop() || 'root'}</span> <span style="color:var(--fg2);font-size:11px;">(${Array.isArray(val) ? 'Array' : 'Object'}: ${Object.keys(val).length} keys)</span>`;
            
            const childrenContainer = document.createElement('div');
            header.querySelector('.tree-key').onclick = () => {
                const isHidden = childrenContainer.style.display === 'none';
                childrenContainer.style.display = isHidden ? 'block' : 'none';
                header.querySelector('.tree-key').innerText = (isHidden ? '▼ ' : '▶ ') + (path.split('/').pop() || 'root');
            };

            wrap.appendChild(header);

            for (const [k, v] of Object.entries(val)) {
                const subPath = path === '/' ? `/${k}` : `${path}/${k}`;
                childrenContainer.appendChild(this.buildDBTreeNode(subPath, v));
            }
            wrap.appendChild(childrenContainer);
        } else {
            const type = typeof val;
            let displayVal = JSON.stringify(val);
            wrap.innerHTML = `
                <span class="tree-key">${path.split('/').pop()}</span>: 
                <span class="tree-val ${type}">${displayVal}</span>
                <span class="tree-act" onclick="Admin.editDBNode('${path}', ${JSON.stringify(val)})">Edit</span>
            `;
        }
        return wrap;
    },

    editDBNode: async function(path, currentVal) {
        if (this.callerRole === 'mod') return;
        const input = prompt(`Update Database Path: ${path}\nCurrent Value: ${JSON.stringify(currentVal)}\nEnter new JSON-compatible value:`, JSON.stringify(currentVal));
        if (input === null) return;
        let parsed;
        try {
            parsed = JSON.parse(input);
        } catch (e) {
            parsed = input;
        }
        await this.apiCall('updateDBNode', { path, value: parsed });
        this.loadDB();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    Admin.loadUsers();
});
