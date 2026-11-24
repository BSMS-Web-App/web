/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
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
        if (tabId === 'announcements') this.loadAnnouncements();
        if (tabId === 'updates') this.loadUpdates();
        if (tabId === 'reports') this.loadReports();
        if (tabId === 'support') this.loadSupportConversations();
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
            const error = new Error(data.error || res.statusText || 'Admin API request failed.');
            if (res.status === 428 && data.code === 'LEGAL_ACCEPTANCE_REQUIRED') {
                error.code = data.code;
                throw error;
            }
            alert("Admin API Error: " + (data.error || res.statusText));
            throw error;
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
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading accounts from database...</td></tr>';
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
            const navUpdates = document.getElementById('nav-btn-updates');
            const selectAllBox = document.getElementById('bulk-select-all');

            if (navUpdates) navUpdates.style.display = this.callerRole === 'owner' ? 'block' : 'none';

            // Strictly: Only OWNER can access raw DB inspector!
            if (this.callerRole === 'owner') {
                if (navDb) navDb.style.display = 'block';
            } else {
                if (navDb) navDb.style.display = 'none';
            }

            // Strictly: Only OWNER can bulk ban people!
            if (selectAllBox) {
                selectAllBox.style.display = this.callerRole === 'owner' ? 'inline-block' : 'none';
            }
            if (bulkBtn && this.callerRole !== 'owner') {
                bulkBtn.style.display = 'none';
            }

            if (this.callerRole === 'mod') {
                if (modBanner) modBanner.classList.add('show');
            } else {
                if (modBanner) modBanner.classList.remove('show');
            }

            this.selectedUids.clear();
            this.updateBulkCount();
            this.renderUsers();
            this.renderBannedDevices();
        } catch (e) {
            if (e.code === 'LEGAL_ACCEPTANCE_REQUIRED') {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--fg2)">Accept the required legal updates to continue using the Admin Console.</td></tr>';
                return;
            }
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

            // Strictly: Only OWNER can select accounts for bulk banning!
            const canSelect = isOwner && uid !== this.callerUid && acc.role !== 'owner';
            const isChecked = this.selectedUids.has(uid);

            const creatorDisp = acc.creator_session_id ? `${acc.creator_session_id.substring(0, 10)}...` : (acc.sessions ? `${Object.keys(acc.sessions)[0]?.substring(0, 10)}...` : 'N/A');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="text-align:center;">
                    <input type="checkbox" ${canSelect ? '' : 'disabled style="display:' + (isOwner ? 'inline-block' : 'none') + ';" title="Only the owner can bulk ban accounts"'} 
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
        if (this.callerRole !== 'owner') return;
        if (isChecked) {
            this.selectedUids.add(uid);
        } else {
            this.selectedUids.delete(uid);
        }
        this.updateBulkCount();
    },

    toggleSelectAll: function(isChecked) {
        if (this.callerRole !== 'owner') return;
        for (const [uid, acc] of Object.entries(this.usersCache)) {
            const status = acc.account_status || 'active';
            if (this.statusFilter !== 'all' && status !== this.statusFilter) continue;
            if (uid === this.callerUid || acc.role === 'owner') continue;

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
            // Strictly: Only OWNER can bulk ban!
            if (count > 0 && this.callerRole === 'owner') {
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

        // Strictly: Only owners can make other people admin! Admins cannot make other people admin
        const adminOpt = document.getElementById('em-role-admin-opt');
        if (adminOpt) {
            if (!isOwner) {
                if (acc.role !== 'admin') {
                    adminOpt.style.display = 'none';
                    adminOpt.disabled = true;
                } else {
                    adminOpt.style.display = 'block';
                    adminOpt.disabled = false;
                }
            } else {
                adminOpt.style.display = 'block';
                adminOpt.disabled = false;
            }
        }

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

        // Strictly: Only owners can make other people admin! Admins cannot make other people admin
        if (!isOwner && roleVal === 'admin' && targetAcc.role !== 'admin') {
            alert("Only the Server Owner can promote users to Administrator.");
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
    },

    announcementsCache: [],

    loadAnnouncements: async function() {
        const list = document.getElementById('announcements-list');
        if (!list) return;
        list.innerHTML = '<div style="text-align:center; color:var(--fg2); padding:30px;">Loading announcements...</div>';

        // Update permissions for create card
        const roleBadge = document.getElementById('ann-role-badge');
        const submitBtn = document.getElementById('ann-submit-btn');
        const annBanner = document.getElementById('ann-staff-banner');
        if (roleBadge) {
            roleBadge.innerText = (this.callerRole || 'staff').toUpperCase();
            roleBadge.className = `badge ${this.callerRole === 'owner' ? 'owner' : (this.callerRole === 'admin' ? 'admin' : 'mod')}`;
        }

        if (this.callerRole === 'mod') {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerText = "Moderators: Read-Only";
                submitBtn.classList.add('sec');
            }
            if (annBanner) {
                annBanner.innerHTML = "⚠️ <strong>Moderator View (Read-Only):</strong> You can view announcements, but creating and deleting announcements requires Administrator or Owner privileges.";
                annBanner.classList.add('show');
            }
        } else {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Publish Announcement";
                submitBtn.classList.remove('sec');
            }
            if (annBanner) {
                annBanner.innerHTML = "📢 <strong>Staff Notice:</strong> Published announcements are displayed on the homepage above countdowns for all users.";
                annBanner.classList.add('show');
            }
        }

        try {
            const res = await fetch('/api/announcements');
            const data = await res.json();
            this.announcementsCache = data.announcements || [];
            this.renderAnnouncements();
        } catch (e) {
            list.innerHTML = `<div style="color:var(--danger); text-align:center; padding:20px;">Failed to load announcements: ${e.message}</div>`;
        }
    },

    renderAnnouncements: function() {
        const list = document.getElementById('announcements-list');
        if (!list) return;

        if (this.announcementsCache.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:var(--fg2); padding:30px; background:var(--panel); border:1px solid var(--border); border-radius:14px;">No announcements created yet. Use the form above to publish your first announcement.</div>';
            return;
        }

        const isStaffAuth = this.callerRole === 'owner' || this.callerRole === 'admin';

        list.innerHTML = this.announcementsCache.map(a => {
            const timeStr = a.createdAt ? new Date(a.createdAt).toLocaleString() : 'Unknown date';
            const parsedContent = this.parseMarkdown(a.content || '');
            const pfpHtml = a.authorAvatar ? `<img src="${a.authorAvatar}" style="width:100%; height:100%; object-fit:cover;">` : (a.authorDisplayName || a.authorUsername || 'A').charAt(0).toUpperCase();

            return `
            <div style="background:var(--panel); border:1px solid var(--border); border-radius:16px; padding:20px; display:flex; flex-direction:column; gap:12px; position:relative;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
                    <div>
                        <h3 style="font-family:var(--font-brand); font-size:24px; margin:0 0 6px; color:var(--fg);">${this.escapeHTML(a.title || 'Untitled Announcement')}</h3>
                        <div style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--fg2);">
                            <div style="width:26px; height:26px; border-radius:50%; border:1.5px solid var(--red); overflow:hidden; display:flex; align-items:center; justify-content:center; background:var(--panel-alt); font-weight:bold;">
                                ${pfpHtml}
                            </div>
                            <strong style="color:var(--fg);">${this.escapeHTML(a.authorDisplayName || a.authorUsername || 'Staff')}</strong>
                            <span class="badge ${a.authorRole || 'admin'}">${(a.authorRole || 'staff').toUpperCase()}</span>
                            <span>•</span>
                            <span>${timeStr}</span>
                        </div>
                    </div>
                    ${isStaffAuth ? `<button class="btn warn sm" onclick="Admin.deleteAnnouncement('${a.id}')">Delete</button>` : ''}
                </div>
                <div style="background:var(--panel-alt); border-radius:10px; padding:14px; color:var(--fg); font-size:13px; line-height:1.6; border-left:3px solid var(--red);">
                    ${parsedContent}
                </div>
            </div>
            `;
        }).join('');
    },

    insertMarkdown: function(startTag, endTag, defaultText) {
        const textarea = document.getElementById('ann-content');
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const val = textarea.value;

        const selectedText = val.substring(start, end) || defaultText;
        const replacement = startTag + selectedText + endTag;

        textarea.value = val.substring(0, start) + replacement + val.substring(end);
        textarea.focus();
        textarea.selectionStart = start + startTag.length;
        textarea.selectionEnd = start + startTag.length + selectedText.length;

        this.updateAnnouncementPreview();
    },

    updateAnnouncementPreview: function() {
        const preview = document.getElementById('ann-preview');
        const content = document.getElementById('ann-content')?.value || '';
        const title = document.getElementById('ann-title')?.value || '';

        if (!preview) return;

        if (!content.trim() && !title.trim()) {
            preview.innerHTML = '<span style="color:var(--fg2); font-style:italic;">Live preview will appear here as you type...</span>';
            return;
        }

        let html = '';
        if (title.trim()) {
            html += `<h2 style="font-family:var(--font-brand); font-size:24px; margin:0 0 10px; color:var(--fg);">${this.escapeHTML(title)}</h2>`;
        }
        html += this.parseMarkdown(content);
        preview.innerHTML = html;
    },

    publishAnnouncement: async function() {
        if (this.callerRole === 'mod') {
            alert("Moderators have read-only access. Only Administrators and Owners can publish announcements.");
            return;
        }

        const title = document.getElementById('ann-title')?.value.trim();
        const content = document.getElementById('ann-content')?.value.trim();

        if (!title) {
            alert("Please enter an announcement title.");
            return;
        }
        if (!content) {
            alert("Please write the announcement content.");
            return;
        }

        const sid = localStorage.getItem('session_id') || "";
        const submitBtn = document.getElementById('ann-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerText = "Publishing...";
        }

        try {
            const res = await fetch('/api/announcements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': sid
                },
                body: JSON.stringify({ action: 'create', title, content })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to publish announcement");
            }

            // Clear inputs
            document.getElementById('ann-title').value = '';
            document.getElementById('ann-content').value = '';
            this.updateAnnouncementPreview();

            alert("Announcement published successfully! It will now appear on the homepage.");
            this.loadAnnouncements();
        } catch (e) {
            alert("Error publishing announcement: " + e.message);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = "Publish Announcement";
            }
        }
    },

    deleteAnnouncement: async function(id) {
        if (this.callerRole === 'mod') {
            alert("Moderators cannot delete announcements.");
            return;
        }
        if (!confirm("Are you sure you want to delete this announcement? This cannot be undone.")) {
            return;
        }

        const sid = localStorage.getItem('session_id') || "";
        try {
            const res = await fetch('/api/announcements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-ID': sid
                },
                body: JSON.stringify({ action: 'delete', id })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to delete announcement");
            }

            this.loadAnnouncements();
        } catch (e) {
            alert("Error deleting announcement: " + e.message);
        }
    },


    reportsCache: [],
    reportFilter: 'all',

    setReportFilter: function(type, btnEl) {
        this.reportFilter = type;
        document.querySelectorAll('#reports-filter-row .status-filter-btn').forEach(button => button.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        this.renderReports();
    },

    loadReports: async function() {
        const list = document.getElementById('reports-list');
        if (!list) return;
        list.textContent = 'Loading reports...';
        try {
            const data = await this.apiCall('getReports');
            this.reportsCache = Array.isArray(data.reports) ? data.reports : [];
            const notice = document.getElementById('reports-staff-notice');
            if (notice) {
                notice.style.display = data.callerRole === 'mod' ? 'block' : 'none';
                notice.textContent = data.callerRole === 'mod' ? 'Moderator view is read-only. Administrators and the owner can update report status, notes, or remove submissions.' : '';
            }
            this.renderReports();
        } catch (error) {
            list.textContent = 'Unable to load reports. Check your staff permissions and database connection.';
        }
    },

    renderReports: function() {
        const list = document.getElementById('reports-list');
        if (!list) return;
        const query = (document.getElementById('report-search')?.value || '').trim().toLowerCase();
        const statusFilter = document.getElementById('report-status-filter')?.value || 'all';
        const canManage = this.callerRole === 'owner' || this.callerRole === 'admin';
        const statuses = [
            ['open', 'Open'], ['under_review', 'Under review'], ['planned', 'Planned'],
            ['in_progress', 'In progress'], ['resolved', 'Resolved'], ['declined', 'Declined'], ['duplicate', 'Duplicate']
        ];
        const filtered = this.reportsCache.filter(report => {
            if (this.reportFilter !== 'all' && report.type !== this.reportFilter) return false;
            if (statusFilter !== 'all' && (report.status || 'open') !== statusFilter) return false;
            const haystack = [report.title, report.description, report.category, report.reporterUsername, report.reporterDisplayName, report.page].join(' ').toLowerCase();
            return !query || haystack.includes(query);
        });
        list.replaceChildren();
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = 'No submissions match these filters.';
            empty.style.cssText = 'text-align:center;color:var(--fg2);padding:30px;background:var(--panel);border:1px solid var(--border);border-radius:14px;';
            list.appendChild(empty);
            return;
        }
        filtered.forEach(report => {
            const card = document.createElement('article');
            card.style.cssText = 'background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:clamp(16px,3vw,22px);display:flex;flex-direction:column;gap:12px;';
            const type = document.createElement('div');
            type.textContent = report.type === 'feature' ? 'FEATURE REQUEST' : 'BUG REPORT';
            type.style.cssText = 'font-size:11px;font-weight:800;letter-spacing:.06em;color:' + (report.type === 'feature' ? 'var(--accent,#a78bfa)' : 'var(--red)') + ';';
            const title = document.createElement('h2');
            title.textContent = report.title || 'Untitled submission';
            title.style.cssText = 'font-family:var(--font-brand);font-size:24px;margin:0;overflow-wrap:anywhere;';
            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:12px;color:var(--fg2);line-height:1.7;overflow-wrap:anywhere;';
            meta.textContent = 'Category: ' + (report.category || 'other') + ' · Submitted by ' + (report.reporterDisplayName || report.reporterUsername || 'Unknown user') + ' (@' + (report.reporterUsername || 'unknown') + ') · ' + (report.createdAt ? new Date(Number(report.createdAt)).toLocaleString() : 'Unknown date') + ' · Reference: ' + (report.id || '');
            const description = document.createElement('div');
            description.textContent = report.description || '';
            description.style.cssText = 'line-height:1.65;overflow-wrap:anywhere;white-space:pre-wrap;';
            card.append(type, title, meta, description);
            if (report.page) {
                const page = document.createElement('div');
                page.textContent = 'Page: ' + report.page;
                page.style.cssText = 'font-size:13px;color:var(--fg2);';
                card.appendChild(page);
            }
            if (report.steps) {
                const steps = document.createElement('div');
                steps.style.cssText = 'background:var(--panel-alt);padding:12px 14px;border-radius:10px;border-left:3px solid var(--red);white-space:pre-wrap;overflow-wrap:anywhere;';
                const label = document.createElement('strong');
                label.textContent = 'Steps / example';
                const body = document.createElement('div');
                body.textContent = report.steps;
                body.style.marginTop = '6px';
                steps.append(label, body);
                card.appendChild(steps);
            }
            const controls = document.createElement('div');
            controls.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr);gap:10px;border-top:1px solid var(--border);padding-top:14px;';
            const statusLabel = document.createElement('label');
            statusLabel.textContent = 'Status';
            statusLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:var(--fg2);font-size:12px;font-weight:700;';
            const select = document.createElement('select');
            select.id = 'report-status-' + report.id;
            statuses.forEach(([value, label]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                option.selected = (report.status || 'open') === value;
                select.appendChild(option);
            });
            select.disabled = !canManage;
            statusLabel.appendChild(select);
            const notesLabel = document.createElement('label');
            notesLabel.textContent = 'Private admin notes';
            notesLabel.style.cssText = 'display:flex;flex-direction:column;gap:6px;color:var(--fg2);font-size:12px;font-weight:700;';
            const notes = document.createElement('textarea');
            notes.id = 'report-notes-' + report.id;
            notes.rows = 3;
            notes.maxLength = 2000;
            notes.value = report.adminNotes || '';
            notes.placeholder = 'Internal notes; not visible to the submitter';
            notes.readOnly = !canManage;
            notesLabel.appendChild(notes);
            controls.append(statusLabel, notesLabel);
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;';
            if (canManage) {
                const save = document.createElement('button');
                save.className = 'btn';
                save.textContent = 'Save changes';
                save.addEventListener('click', () => this.saveReport(report.id));
                const remove = document.createElement('button');
                remove.className = 'btn warn sm';
                remove.textContent = 'Delete';
                remove.addEventListener('click', () => this.removeReport(report.id));
                actions.append(save, remove);
            } else {
                actions.textContent = 'Read-only';
                actions.style.color = 'var(--fg2)';
            }
            controls.appendChild(actions);
            card.appendChild(controls);
            list.appendChild(card);
        });
    },

    saveReport: async function(reportId) {
        if (this.callerRole !== 'owner' && this.callerRole !== 'admin') return;
        const status = document.getElementById('report-status-' + reportId)?.value;
        const adminNotes = document.getElementById('report-notes-' + reportId)?.value || '';
        try {
            await this.apiCall('updateReport', { reportId, status, adminNotes });
            await this.loadReports();
        } catch (error) {}
    },

    removeReport: async function(reportId) {
        if (this.callerRole !== 'owner' && this.callerRole !== 'admin') return;
        if (!confirm('Permanently delete this submission? This cannot be undone.')) return;
        try {
            await this.apiCall('deleteReport', { reportId });
            await this.loadReports();
        } catch (error) {}
    },


    supportConversationsCache: [],
    activeSupportConversationId: null,
    activeSupportConversation: null,

    loadSupportConversations: async function() {
        const list = document.getElementById('support-conversation-list');
        if (!list) return;
        list.textContent = 'Loading conversations...';
        try {
            const data = await this.apiCall('getSupportConversations');
            this.supportConversationsCache = Array.isArray(data.conversations) ? data.conversations : [];
            this.callerRole = data.callerRole || this.callerRole;
            document.getElementById('supportInboxCount').textContent = String(this.supportConversationsCache.length);
            const notice = document.getElementById('support-staff-notice');
            notice.style.display = this.callerRole === 'mod' ? 'block' : 'none';
            notice.textContent = this.callerRole === 'mod' ? 'Moderator access is read-only. Administrators and the owner can reply to visitors.' : '';
            this.renderSupportConversationList();
        } catch (_) { list.textContent = 'Unable to load support conversations.'; }
    },

    renderSupportConversationList: function() {
        const list = document.getElementById('support-conversation-list');
        list.replaceChildren();
        if (!this.supportConversationsCache.length) {
            const empty = document.createElement('div');
            empty.className = 'support-admin-empty';
            empty.textContent = 'No general support conversations yet.';
            list.appendChild(empty);
            return;
        }
        this.supportConversationsCache.forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'support-admin-conversation' + (item.id === this.activeSupportConversationId ? ' active' : '');
            const title = document.createElement('strong');
            title.textContent = item.subject || 'General support';
            const meta = document.createElement('span');
            meta.textContent = (item.status === 'closed' ? 'Closed' : 'Open') + ' · ' + (item.messageCount || 0) + ' messages';
            const latest = document.createElement('small');
            latest.textContent = (item.lastMessageBy === 'visitor' ? 'Visitor replied' : 'Admin replied') + ' · ' + (item.lastMessageAt ? new Date(Number(item.lastMessageAt)).toLocaleString() : 'No date');
            button.append(title, meta, latest);
            button.addEventListener('click', () => this.openSupportConversation(item.id));
            list.appendChild(button);
        });
    },

    openSupportConversation: async function(conversationId) {
        try {
            const data = await this.apiCall('getSupportConversation', { conversationId });
            this.activeSupportConversationId = conversationId;
            this.renderSupportConversation(data.conversation);
            this.renderSupportConversationList();
        } catch (_) {}
    },

    renderSupportConversation: function(conversation) {
        document.getElementById('support-admin-empty').hidden = true;
        document.getElementById('support-admin-thread-view').hidden = false;
        document.getElementById('support-admin-subject').textContent = conversation.subject || 'General support';
        document.getElementById('support-admin-meta').textContent = 'Reference: ' + conversation.id + ' · Started ' + (conversation.createdAt ? new Date(Number(conversation.createdAt)).toLocaleString() : 'unknown');
        const messages = document.getElementById('support-admin-messages');
        messages.replaceChildren();
        (conversation.messages || []).forEach(item => {
            const article = document.createElement('article');
            article.className = 'support-admin-message ' + (item.sender === 'admin' ? 'from-admin' : 'from-visitor');
            const head = document.createElement('div');
            head.className = 'support-admin-message-head';
            const sender = document.createElement('strong');
            sender.textContent = item.sender === 'admin' ? (item.senderName || 'BSMS Web Admin') : 'Visitor';
            const time = document.createElement('time');
            time.textContent = item.createdAt ? new Date(Number(item.createdAt)).toLocaleString() : '';
            head.append(sender, time);
            const body = document.createElement('p');
            body.textContent = item.body || '';
            article.append(head, body);
            messages.appendChild(article);
        });
        messages.scrollTop = messages.scrollHeight;
        this.activeSupportConversation = conversation;
        const closed = conversation.status === 'closed';
        const canReply = this.callerRole === 'owner' || this.callerRole === 'admin';
        document.getElementById('support-admin-reply').disabled = closed || !canReply;
        document.getElementById('support-admin-send').disabled = closed || !canReply;
        document.getElementById('support-admin-reply').placeholder = canReply ? (closed ? 'This conversation is closed.' : 'Reply as BSMS Web admin...') : 'Moderator access is read-only.';
        const statusButton = document.getElementById('support-admin-status');
        statusButton.textContent = closed ? 'Reopen conversation' : 'Close conversation';
        statusButton.disabled = !canReply;
        statusButton.onclick = () => this.setSupportConversationStatus(conversation.id, closed ? 'open' : 'closed');
    },

    sendSupportReply: async function(event) {
        event.preventDefault();
        if (!this.activeSupportConversationId || (this.callerRole !== 'owner' && this.callerRole !== 'admin')) return;
        const input = document.getElementById('support-admin-reply');
        const status = document.getElementById('support-admin-reply-status');
        const button = document.getElementById('support-admin-send');
        const message = input.value.trim();
        if (!message) return;
        button.disabled = true;
        status.textContent = 'Sending...';
        try {
            await this.apiCall('replySupportConversation', { conversationId: this.activeSupportConversationId, message });
            input.value = '';
            const data = await this.apiCall('getSupportConversation', { conversationId: this.activeSupportConversationId });
            this.renderSupportConversation(data.conversation);
            await this.loadSupportConversations();
            status.textContent = '';
        } catch (error) { status.textContent = error.message || 'Unable to send reply.'; }
        finally { button.disabled = false; }
    },

    setSupportConversationStatus: async function(conversationId, status) {
        try {
            await this.apiCall('setSupportConversationStatus', { conversationId, status });
            const data = await this.apiCall('getSupportConversation', { conversationId });
            this.renderSupportConversation(data.conversation);
            await this.loadSupportConversations();
        } catch (_) {}
    },

    loadUpdates: async function(forcePolicyReload = false) {
        const list = document.getElementById('updates-list');
        const status = document.getElementById('update-publish-status');
        if (this.callerRole !== 'owner') {
            if (list) list.textContent = 'Only the platform owner can manage website releases.';
            return;
        }
        const policyValuesAtStart = Object.fromEntries(['terms', 'privacy'].map(key => [
            key, document.getElementById('update-' + key)?.value || ''
        ]));
        const hasPolicyDrafts = ['terms', 'privacy'].some(key => {
            const field = document.getElementById('update-' + key);
            return field?.dataset.originalContent !== undefined &&
                field.value.trim() !== field.dataset.originalContent.trim();
        });
        if (forcePolicyReload && hasPolicyDrafts &&
            !window.confirm('Discard your unsaved Terms or Privacy edits and reload the latest published policy text?')) return;
        if (list) list.textContent = 'Loading published releases...';
        try {
            const response = await fetch('/api/updates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('session_id') || '' },
                body: JSON.stringify({ action: 'admin-list' }),
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || 'Could not load website releases.');
                error.status = response.status;
                error.data = data;
                throw error;
            }
            if (list) {
                list.replaceChildren();
                const releases = Array.isArray(data.releases) ? data.releases : [];
                if (data.documents) {
                    for (const key of ['terms', 'privacy']) {
                        const field = document.getElementById('update-' + key);
                        if (!field) continue;
                        let currentContent = data.documents[key]?.content || '';
                        if (!currentContent) {
                            try {
                                const page = await fetch(key === 'terms' ? '/terms?embed=1' : '/privacy?embed=1', { cache: 'no-store' });
                                if (page.ok) {
                                    const html = await page.text();
                                    const parsed = new DOMParser().parseFromString(html, 'text/html');
                                    const main = parsed.querySelector('main');
                                    if (main) {
                                        main.querySelectorAll('script,style,button,nav,form').forEach(node => node.remove());
                                        const toMarkdown = node => {
                                            if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
                                            if (node.nodeType !== Node.ELEMENT_NODE) return '';
                                            const tag = node.tagName.toLowerCase();
                                            const inner = Array.from(node.childNodes).map(toMarkdown).join('');
                                            if (/^h[1-6]$/.test(tag)) return '#'.repeat(Number(tag[1])) + ' ' + inner.trim() + '\n\n';
                                            if (tag === 'p' || tag === 'div' || tag === 'section') return inner.trim() + '\n\n';
                                            if (tag === 'strong' || tag === 'b') return '**' + inner + '**';
                                            if (tag === 'em' || tag === 'i') return '*' + inner + '*';
                                            if (tag === 'a') return '[' + inner.trim() + '](' + (node.getAttribute('href') || '') + ')';
                                            if (tag === 'br') return '\n';
                                            if (tag === 'li') return '- ' + inner.trim() + '\n';
                                            if (tag === 'ul' || tag === 'ol') return inner + '\n';
                                            if (tag === 'blockquote') return inner.trim().split('\n').map(line => '> ' + line).join('\n') + '\n\n';
                                            return inner;
                                        };
                                        currentContent = toMarkdown(main).replace(/\n{3,}/g, '\n\n').trim();
                                    }
                                }
                            } catch (_) {}
                        }
                        const originalContent = field.dataset.originalContent;
                        const editedWhileLoading = originalContent === undefined &&
                            field.value !== policyValuesAtStart[key];
                        const hasUnsavedChanges = !forcePolicyReload && (
                            editedWhileLoading || (originalContent !== undefined &&
                                field.value.trim() !== originalContent.trim())
                        );
                        const currentVersion = data.documents?.[key]?.version || (key === 'terms' ? '1.0.1' : '1.0.2');
                        if (!hasUnsavedChanges) {
                            field.value = currentContent;
                            field.dataset.originalContent = currentContent;
                            field.dataset.originalVersion = currentVersion;
                        } else if (editedWhileLoading) {
                            field.dataset.originalContent = currentContent;
                            field.dataset.originalVersion = currentVersion;
                        }
                    }
                }
                if (!releases.length) list.textContent = 'No website releases have been published yet.';
                releases.forEach(release => {
                    const card = document.createElement('article');
                    card.style.cssText = 'padding:16px;border:1px solid var(--border);border-radius:14px;background:var(--panel);';
                    const heading = document.createElement('div');
                    heading.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;';
                    const version = document.createElement('strong');
                    version.textContent = release.version || 'Website update';
                    version.style.cssText = 'font-family:var(--font-brand);font-size:19px;color:var(--fg);';
                    const date = document.createElement('span');
                    date.textContent = Number(release.publishedAt) ? new Date(Number(release.publishedAt)).toLocaleString() : '';
                    date.style.cssText = 'font-size:12px;color:var(--fg2);';
                    heading.append(version, date);
                    const body = document.createElement('div');
                    body.style.cssText = 'margin-top:9px;color:var(--fg2);line-height:1.6;';
                    body.innerHTML = this.parseMarkdown(release.content || '');
                    card.append(heading, body);
                    if (release.detailsUrl) {
                        const link = document.createElement('a');
                        link.href = release.detailsUrl;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        link.textContent = 'View full release notes on GitHub';
                        link.style.cssText = 'display:inline-block;margin-top:10px;color:var(--red);font-weight:700;';
                        card.appendChild(link);
                    }
                    const controls = document.createElement('div');
                    controls.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--border);';
                    const edit = document.createElement('button');
                    edit.type = 'button'; edit.className = 'btn sec sm'; edit.textContent = 'Edit';
                    edit.addEventListener('click', () => this.editUpdate(release));
                    const remove = document.createElement('button');
                    remove.type = 'button'; remove.className = 'btn warn sm'; remove.textContent = 'Delete';
                    remove.addEventListener('click', () => this.deleteUpdate(release.id));
                    controls.append(edit, remove);
                    card.appendChild(controls);
                    list.appendChild(card);
                });
            }
            if (status && status.textContent === 'Loading releases...') status.textContent = '';
        } catch (error) {
            if (list) list.textContent = error.message;
            if (status) status.textContent = error.message;
            if (error.status === 428) window.BSMSUpdates?.check?.();
        }
    },


    editUpdate: function(release) {
        const card = document.getElementById('update-create-card');
        if (!card || !release?.id) return;
        const currentEditId = card.dataset.editingId || '';
        const hasReleaseDraft = ['update-version', 'update-details-url', 'update-content', 'update-starts-on', 'update-release-date']
            .some(id => Boolean(document.getElementById(id)?.value));
        if (hasReleaseDraft && currentEditId !== release.id &&
            !window.confirm('Discard the unsaved release draft and load this release instead?')) return;
        card.dataset.editingId = release.id;
        document.getElementById('update-editor-heading').textContent = 'Edit Website Release';
        document.getElementById('update-version').value = release.version || '';
        document.getElementById('update-details-url').value = release.detailsUrl || '';
        document.getElementById('update-content').value = release.content || '';
        const toDate = value => { if (!(Number(value) > 0)) return ''; const date = new Date(Number(value)); return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); };
        document.getElementById('update-starts-on').value = toDate(release.startsAt || release.publishedAt);
        document.getElementById('update-release-date').value = toDate(release.releaseDate || release.publishedAt);
        document.getElementById('update-publish-btn').textContent = 'Save Release Changes';
        document.getElementById('update-cancel-edit-btn').style.display = '';
        this.updateReleasePreview();
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    cancelUpdateEdit: function() {
        const card = document.getElementById('update-create-card');
        if (card) delete card.dataset.editingId;
        ['update-version', 'update-details-url', 'update-content', 'update-starts-on', 'update-release-date'].forEach(id => { const field = document.getElementById(id); if (field) field.value = ''; });
        document.getElementById('update-editor-heading').textContent = 'Create a Website Release';
        document.getElementById('update-publish-btn').textContent = 'Publish Website Update';
        document.getElementById('update-cancel-edit-btn').style.display = 'none';
        this.updateReleasePreview();
    },

    deleteUpdate: async function(id) {
        if (this.callerRole !== 'owner' || !id) return;
        const status = document.getElementById('update-publish-status');
        if (!window.confirm('Delete this release? It will no longer appear in the updates popup for any account.')) return;
        try {
            const response = await fetch('/api/updates', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('session_id') || '' }, body: JSON.stringify({ action: 'delete', id }), cache: 'no-store' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || 'The release could not be deleted.');
                error.status = response.status;
                error.data = data;
                throw error;
            }
            if (document.getElementById('update-create-card')?.dataset.editingId === id) this.cancelUpdateEdit();
            if (status) status.textContent = 'Release deleted. It will no longer be shown to users.';
            await this.loadUpdates();
        } catch (error) { if (status) status.textContent = error.message; if (error.status === 428) window.BSMSUpdates?.check?.(); }
    },

    updateReleasePreview: function() {
        const preview = document.getElementById('update-preview');
        const content = document.getElementById('update-content')?.value || '';
        if (!preview) return;
        preview.innerHTML = content.trim()
            ? this.parseMarkdown(content)
            : '<span style="color:var(--fg2);font-style:italic;">Your release preview will appear here.</span>';
    },

    insertUpdateMarkdown: function(before, after, placeholder) {
        const textarea = document.getElementById('update-content');
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.slice(start, end) || placeholder;
        textarea.setRangeText(before + selected + after, start, end, 'select');
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    },

    publishUpdate: async function() {
        const version = document.getElementById('update-version')?.value.trim() || '';
        const content = document.getElementById('update-content')?.value.trim() || '';
        const detailsUrl = document.getElementById('update-details-url')?.value.trim() || '';
        const button = document.getElementById('update-publish-btn');
        const status = document.getElementById('update-publish-status');
        if (this.callerRole !== 'owner') {
            if (status) status.textContent = 'Only the platform owner can publish website updates.';
            return;
        }
        if (!version || !content) {
            if (status) status.textContent = 'Enter a version number and release details before publishing.';
            return;
        }
        const uninitializedPolicyDraft = ['terms', 'privacy'].some(key => {
            const field = document.getElementById('update-' + key);
            return field && field.dataset.originalContent === undefined && field.value.trim();
        });
        if (uninitializedPolicyDraft) {
            if (status) status.textContent = 'Refresh the release editor before publishing policy changes so the current document version can be checked.';
            return;
        }
        if (button) { button.disabled = true; button.textContent = 'Publishing...'; }
        if (status) status.textContent = 'Publishing release...';
        try {
            const response = await fetch('/api/updates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Session-ID': localStorage.getItem('session_id') || '' },
                body: JSON.stringify((() => {
                    const changedPolicies = ['terms', 'privacy'].filter(key => {
                        const field = document.getElementById('update-' + key);
                        return field && field.dataset.originalContent !== undefined &&
                            field.value.trim() !== field.dataset.originalContent.trim();
                    });
                    const editingId = document.getElementById('update-create-card')?.dataset.editingId || '';
                    const startsOn = document.getElementById('update-starts-on')?.value || '';
                    const releaseDate = document.getElementById('update-release-date')?.value || '';
                    const offsetForDate = value => {
                        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
                        return match
                            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTimezoneOffset()
                            : new Date().getTimezoneOffset();
                    };
                    return {
                        action: editingId ? 'edit' : 'publish',
                        id: editingId || undefined,
                        version,
                        content,
                        detailsUrl,
                        startsOn,
                        releaseDate,
                        timezoneOffset: new Date().getTimezoneOffset(),
                        timezoneOffsets: { startsOn: offsetForDate(startsOn), releaseDate: offsetForDate(releaseDate) },
                        policies: Object.fromEntries(changedPolicies.map(key => [key, document.getElementById('update-' + key).value])),
                        policyVersions: Object.fromEntries(changedPolicies.map(key => [key, document.getElementById('update-' + key).dataset.originalVersion || (key === 'terms' ? '1.0.1' : '1.0.2')]))
                    };
                })()),
                cache: 'no-store'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(data.error || 'The release could not be published.');
                error.status = response.status;
                error.data = data;
                throw error;
            }
            document.getElementById('update-create-card').dataset.editingId = '';
            document.getElementById('update-version').value = '';
            document.getElementById('update-details-url').value = '';
            document.getElementById('update-starts-on').value = '';
            document.getElementById('update-release-date').value = '';
            document.getElementById('update-editor-heading').textContent = 'Create a Website Release';
            document.getElementById('update-publish-btn').textContent = 'Publish Website Update';
            document.getElementById('update-cancel-edit-btn').style.display = 'none';
            document.getElementById('update-content').value = '';
            ['terms', 'privacy'].forEach(key => {
                const field = document.getElementById('update-' + key);
                if (field) {
                    delete field.dataset.edited;
                    delete field.dataset.originalContent;
                    delete field.dataset.originalVersion;
                }
            });
            this.updateReleasePreview();
            const policyNames = (data.changedPolicies || []).map(key => key === 'terms' ? 'Terms of Service' : 'Privacy Policy');
            if (status) {
                status.textContent = policyNames.length
                    ? 'Version ' + data.release.version + ' was saved, and ' + policyNames.join(' and ') + ' were updated. Users must review the new policy version(s).'
                    : (data.changed === false ? 'Release saved; no release fields changed.' : 'Version ' + data.release.version + ' was published successfully.');
            }
            // Publishing new legal text also changes the owner's required
            // acknowledgment; check immediately instead of waiting for focus.
            window.BSMSUpdates?.check?.();
            await this.loadUpdates();
        } catch (error) {
            if (status) status.textContent = error.message;
            if (error.status === 428) window.BSMSUpdates?.check?.();
        } finally {
            const editing = Boolean(document.getElementById('update-create-card')?.dataset.editingId);
            if (button) {
                button.disabled = false;
                button.textContent = editing ? 'Save Release Changes' : 'Publish Website Update';
            }
        }
    },

    escapeHTML: function(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    parseMarkdown: function(text) {
        if (!text) return '';
        const inline = value => this.escapeHTML(value)
            .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gi, '<u>$1</u>')
            .replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>')
            .replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/_([^_]+)_/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--red);text-decoration:underline;">$1</a>');

        const lines = String(text).replace(/\r/g, '').split('\n');
        const output = [];
        let paragraph = [];
        let listType = '';

        const flushParagraph = () => {
            if (!paragraph.length) return;
            output.push('<p style="margin:7px 0;">' + paragraph.map(inline).join('<br>') + '</p>');
            paragraph = [];
        };
        const closeList = () => {
            if (!listType) return;
            output.push('</' + listType + '>');
            listType = '';
        };

        for (const line of lines) {
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
            const quote = line.match(/^\s*>\s?(.+)$/);

            if (!line.trim()) {
                flushParagraph();
                closeList();
                continue;
            }
            if (heading) {
                flushParagraph();
                closeList();
                const level = heading[1].length;
                const sizes = { 1: 24, 2: 20, 3: 17 };
                output.push('<h' + level + ' style="font-family:var(--font-brand);font-size:' + sizes[level] + 'px;margin:12px 0 7px;color:var(--fg);">' + inline(heading[2]) + '</h' + level + '>');
                continue;
            }
            if (unordered || ordered) {
                flushParagraph();
                const nextType = unordered ? 'ul' : 'ol';
                if (listType !== nextType) {
                    closeList();
                    listType = nextType;
                    output.push('<' + listType + ' style="padding-left:22px;margin:8px 0;">');
                }
                output.push('<li>' + inline((unordered || ordered)[1]) + '</li>');
                continue;
            }
            if (quote) {
                flushParagraph();
                closeList();
                output.push('<blockquote style="margin:9px 0;padding:7px 12px;border-left:3px solid var(--red);color:var(--fg2);">' + inline(quote[1]) + '</blockquote>');
                continue;
            }
            closeList();
            paragraph.push(line);
        }
        flushParagraph();
        closeList();
        return output.join('');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    Admin.loadUsers();
    document.getElementById('support-admin-reply-form')?.addEventListener('submit', event => Admin.sendSupportReply(event));
    window.addEventListener('bsms:legal-accepted', () => {
        Admin.loadUsers();
        if (document.getElementById('updates-panel')?.classList.contains('active')) Admin.loadUpdates();
    });
});
