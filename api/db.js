/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BSMS_WEB_API_URL = (process.env.BSMS_WEB_API_URL || '').replace(/\/+$/, '');
const BSMS_WEB_API_KEY = process.env.BSMS_WEB_API_KEY || '';

const HAS_REMOTE_MAC_API = Boolean(BSMS_WEB_API_URL && BSMS_WEB_API_KEY.length >= 32);

// Local JSON database fallback when BSMS_WEB_API_URL / BSMS_WEB_API_KEY are not configured
const LOCAL_DB_FILE = path.join(os.tmpdir(), 'bsms_web_local_db.json');

function loadLocalDb() {
    try {
        if (fs.existsSync(LOCAL_DB_FILE)) {
            const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
    } catch {
        // ignore read error
    }
    return {
        accounts: {},
        announcements: {},
        banned_devices: {},
        chat: { users: {}, conversations: { dms: {}, gcs: {} } },
        config: { versions: {} },
        chess: { members: {} }
    };
}

let localDbStore = loadLocalDb();

function saveLocalDb() {
    try {
        fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localDbStore), 'utf8');
    } catch {
        // ignore write error in read-only environments
    }
}

function cloneValue(val) {
    return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
}

function parseDbPath(input) {
    const parts = String(input || '').split('/').filter(Boolean);
    if (parts.some((p) => p === '.' || p === '..' || p === '__proto__' || p === 'prototype' || p === 'constructor')) {
        throw new Error('Invalid database path.');
    }
    return parts;
}

function readLocalAt(root, parts) {
    let curr = root;
    for (const part of parts) {
        if (curr === null || curr === undefined || typeof curr !== 'object') return null;
        curr = curr[part];
    }
    return curr === undefined ? null : cloneValue(curr);
}

function writeLocalAt(root, parts, value) {
    if (parts.length === 0) return value === null || value === undefined ? {} : cloneValue(value);
    let curr = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!curr[key] || typeof curr[key] !== 'object' || Array.isArray(curr[key])) {
            curr[key] = {};
        }
        curr = curr[key];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) {
        delete curr[last];
    } else {
        curr[last] = cloneValue(value);
    }
    return root;
}

function resolveLocalServerValues(value) {
    if (value && typeof value === 'object') {
        if (!Array.isArray(value) && value['.sv'] === 'timestamp') return Date.now();
        const copy = Array.isArray(value) ? [] : {};
        for (const [k, v] of Object.entries(value)) {
            copy[k] = resolveLocalServerValues(v);
        }
        return copy;
    }
    return value;
}

function equalJson(a, b) {
    return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

function publicAccountView(uid, account) {
    const avatar = account?.account_status === 'banned' ? null : account?.avatar;
    return {
        username: account?.username || uid,
        displayName: account?.displayName || account?.username || uid,
        avatar: avatar && typeof avatar === 'object' && avatar.type === 'media' && avatar.mediaId
            ? '/api/media?id=' + encodeURIComponent(avatar.mediaId)
            : (avatar || ''),
        account_status: account?.account_status || 'active',
        ban_expires: account?.ban_expires || null,
        role: account?.role || null,
        verified: Boolean(account?.verified),
        isDeveloper: Boolean(account?.isDeveloper),
        nameColor: account?.nameColor || account?.chatColor || null,
        chatColor: account?.nameColor || account?.chatColor || null
    };
}

function localMacRequest(method, route, body) {
    const urlObj = new URL(route, 'http://localhost');
    const pathname = urlObj.pathname;

    if (method === 'GET' && pathname === '/v1/db') {
        const p = urlObj.searchParams.get('path') || '/';
        return { value: readLocalAt(localDbStore, parseDbPath(p)) };
    }

    if (method === 'GET' && pathname === '/v1/db/query') {
        const p = urlObj.searchParams.get('path') || '/';
        const childPath = urlObj.searchParams.get('child') || '';
        const expected = JSON.parse(urlObj.searchParams.get('equalTo') ?? 'null');
        const source = readLocalAt(localDbStore, parseDbPath(p)) || {};
        const filtered = {};
        for (const [k, item] of Object.entries(source)) {
            const actual = readLocalAt(item, parseDbPath(childPath));
            if (equalJson(actual, expected)) filtered[k] = item;
        }
        return { value: Object.keys(filtered).length ? filtered : null };
    }

    if (method === 'PUT' && pathname === '/v1/db') {
        const parts = parseDbPath(body?.path || '');
        const resolved = resolveLocalServerValues(body?.value);
        writeLocalAt(localDbStore, parts, resolved);
        saveLocalDb();
        return { success: true };
    }

    if (method === 'PATCH' && pathname === '/v1/db') {
        const parts = parseDbPath(body?.path || '');
        const updates = resolveLocalServerValues(body?.updates || {});
        const current = readLocalAt(localDbStore, parts);
        const target = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
        for (const [relPath, val] of Object.entries(updates)) {
            writeLocalAt(target, parseDbPath(relPath), val);
        }
        writeLocalAt(localDbStore, parts, target);
        saveLocalDb();
        return { success: true };
    }

    if (method === 'DELETE' && pathname === '/v1/db') {
        const p = urlObj.searchParams.get('path') || '';
        writeLocalAt(localDbStore, parseDbPath(p), null);
        saveLocalDb();
        return { success: true };
    }

    if (method === 'POST' && pathname === '/v1/db/compare-and-set') {
        const parts = parseDbPath(body?.path || '');
        const expected = body?.expected ?? null;
        const resolved = resolveLocalServerValues(body?.value);
        const current = readLocalAt(localDbStore, parts);
        if (!equalJson(current, expected)) {
            return { committed: false, value: current };
        }
        writeLocalAt(localDbStore, parts, resolved);
        saveLocalDb();
        return { committed: true, value: resolved ?? null };
    }

    if (method === 'GET' && pathname === '/v1/auth/session') {
        const sessionId = urlObj.searchParams.get('sessionId') || '';
        const accounts = localDbStore.accounts || {};
        for (const [uid, account] of Object.entries(accounts)) {
            if (account?.sessions && Object.prototype.hasOwnProperty.call(account.sessions, sessionId)) {
                const { password, sessions, ...safeAccount } = account;
                return { uid, account: safeAccount };
            }
        }
        return { uid: null, account: null };
    }

    if (method === 'GET' && pathname === '/v1/chat/sync') {
        const uid = urlObj.searchParams.get('uid') || '';
        const allAccounts = localDbStore.accounts || {};
        const rawUsers = localDbStore.chat?.users || {};
        const allConvos = localDbStore.chat?.conversations || {};
        const now = Date.now();
        const users = {};
        for (const [uId, u] of Object.entries(rawUsers)) {
            users[uId] = {
                ...u,
                status: u?.status === 'online' && u.lastSeen && now - u.lastSeen < 25000 ? 'online' : 'offline'
            };
        }
        const accounts = {};
        for (const [accId, acc] of Object.entries(allAccounts)) {
            if (acc?.account_status !== 'deleted') accounts[accId] = publicAccountView(accId, acc);
        }
        const channels = {};
        for (const type of ['dms', 'gcs']) {
            for (const [cid, channel] of Object.entries(allConvos[type] || {})) {
                if (!channel?.members || !channel.members[uid]) continue;
                const msgs = channel.messages || {};
                const keys = Object.keys(msgs).sort();
                const lastId = keys.length ? keys[keys.length - 1] : null;
                const last = lastId ? msgs[lastId] : null;
                channels[cid] = {
                    name: channel.name || '',
                    _type: type,
                    _id: cid,
                    config: channel.config || {},
                    members: channel.members || {},
                    messageCount: keys.length,
                    lastMessage: last ? {
                        id: lastId,
                        senderUid: last.senderUid || null,
                        timestamp: last.timestamp || 0,
                        contentType: last.contentType || 'text',
                        content: String(last.content || '').slice(0, 180),
                        status: { unsent: Boolean(last.status?.unsent), deletedByMod: Boolean(last.status?.deletedByMod) },
                        readReceipts: last.readReceipts || {}
                    } : null,
                    lastMessageId: lastId
                };
            }
        }
        return { users, accounts, channels };
    }

    if (method === 'GET' && pathname === '/v1/chat/messages') {
        const uid = urlObj.searchParams.get('uid') || '';
        const cid = urlObj.searchParams.get('cid') || '';
        const type = urlObj.searchParams.get('type') || '';
        const channel = localDbStore.chat?.conversations?.[type]?.[cid];
        if (!channel?.members?.[uid]) {
            return { error: 'Not a member of this channel.', unauthorized: true };
        }
        const allAccounts = localDbStore.accounts || {};
        const accounts = {};
        for (const [accId, acc] of Object.entries(allAccounts)) {
            accounts[accId] = publicAccountView(accId, acc);
        }
        return {
            messages: channel.messages || {},
            members: channel.members || {},
            accounts,
            hasMore: false,
            oldestId: null
        };
    }

    return {};
}

async function macRequest(method, route, body) {
    if (!HAS_REMOTE_MAC_API) {
        return localMacRequest(method, route, body);
    }

    let response;
    try {
        response = await fetch(BSMS_WEB_API_URL + route, {
            method,
            headers: {
                'Authorization': 'Bearer ' + BSMS_WEB_API_KEY,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(15000)
        });
    } catch (error) {
        throw new Error('[BSMS Web :: DB] Mac database API is unavailable: ' + error.message);
    }

    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
        throw new Error('[BSMS Web :: DB] Mac API returned HTTP ' + response.status + ': ' + (data.error || 'Request failed.'));
    }
    return data;
}

function makeSnapshot(value) {
    const copy = value === undefined ? null : JSON.parse(JSON.stringify(value));
    return {
        val: () => copy,
        exists: () => copy !== null && copy !== undefined
    };
}

function makeRemoteRef(pathStr) {
    const cleanPath = '/' + String(pathStr || '').split('/').filter(Boolean).join('/');
    return {
        once: async (eventType = 'value') => {
            if (eventType !== 'value') throw new Error('Mac DB adapter only supports once("value").');
            const result = await macRequest('GET', '/v1/db?path=' + encodeURIComponent(cleanPath));
            return makeSnapshot(result.value);
        },
        set: async (value) => {
            await macRequest('PUT', '/v1/db', { path: cleanPath, value });
        },
        update: async (updates) => {
            await macRequest('PATCH', '/v1/db', { path: cleanPath, updates });
        },
        remove: async () => {
            await macRequest('DELETE', '/v1/db?path=' + encodeURIComponent(cleanPath));
        },
        push: () => {
            const key = '-N' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex');
            return {
                key,
                set: async (value) => {
                    await macRequest('PUT', '/v1/db', { path: cleanPath + '/' + key, value });
                }
            };
        },
        transaction: async (updateFn) => {
            for (let attempt = 0; attempt < 50; attempt += 1) {
                const currentSnapshot = await makeRemoteRef(cleanPath).once('value');
                const current = currentSnapshot.val();

                const expected = current === undefined ? null : JSON.parse(JSON.stringify(current));
                const workingCopy = current === undefined ? null : JSON.parse(JSON.stringify(current));
                const next = updateFn(workingCopy);

                const result = await macRequest('POST', '/v1/db/compare-and-set', {
                    path: cleanPath,
                    expected,
                    value: next
                });
                if (result.committed) {
                    return { committed: true, snapshot: makeSnapshot(result.value) };
                }
            }
            throw new Error('Mac DB transaction could not commit after repeated concurrent updates.');
        },
        orderByChild: (childPath) => ({
            equalTo: (expectedValue) => ({
                once: async (eventType = 'value') => {
                    if (eventType !== 'value') throw new Error('Mac DB adapter only supports once("value").');
                    const query = new URLSearchParams({
                        path: cleanPath,
                        child: String(childPath),
                        equalTo: JSON.stringify(expectedValue)
                    });
                    const result = await macRequest('GET', '/v1/db/query?' + query.toString());
                    return makeSnapshot(result.value);
                }
            })
        })
    };
}

export const requestMacApi = (method, route, body) => macRequest(method, route, body);

export const db = { ref: (pathStr) => makeRemoteRef(pathStr) };

export const admin = {
    database: {
        ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } }
    }
};

console.log(HAS_REMOTE_MAC_API
    ? '[BSMS Web :: DB] Using the required Mac-hosted JSON database API.'
    : '[BSMS Web :: DB] Using local JSON database store (set BSMS_WEB_API_URL & BSMS_WEB_API_KEY for Mac API).'
);
