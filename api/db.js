/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const BSMS_WEB_API_URL = (process.env.BSMS_WEB_API_URL || '').replace(/\/+$/, '');
const BSMS_WEB_API_KEY = process.env.BSMS_WEB_API_KEY || '';
const HAS_REMOTE_MAC_API = Boolean(BSMS_WEB_API_URL && BSMS_WEB_API_KEY.length >= 32);
const LOCAL_DB_FILE = '/tmp/bsms-web-local-db.json';

let localDb = null;

function defaultLocalDb() {
    return {
        accounts: {},
        announcements: {},
        banned_devices: {},
        chat: { users: {}, conversations: { dms: {}, gcs: {} } },
        config: { versions: {} },
        reports: {},
        support_conversations: {}
    };
}

function getLocalDb() {
    if (localDb) return localDb;
    try {
        if (fs.existsSync(LOCAL_DB_FILE)) {
            const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf8');
            if (raw) {
                localDb = JSON.parse(raw);
                return localDb;
            }
        }
    } catch {}
    localDb = defaultLocalDb();
    return localDb;
}

function saveLocalDb() {
    try {
        fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(localDb), 'utf8');
    } catch {}
}

function resolveServerMarkers(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === 'object') {
        if (!Array.isArray(val) && val['.sv'] === 'timestamp') {
            return Date.now();
        }
        if (Array.isArray(val)) return val.map(resolveServerMarkers);
        const out = {};
        for (const [k, v] of Object.entries(val)) {
            if (v !== undefined) out[k] = resolveServerMarkers(v);
        }
        return out;
    }
    return val;
}

function splitPath(cleanPath) {
    return String(cleanPath || '').split('/').filter(Boolean);
}

function getAtPath(root, cleanPath) {
    const parts = splitPath(cleanPath);
    let cur = root;
    for (const part of parts) {
        if (cur === null || cur === undefined || typeof cur !== 'object') return null;
        cur = cur[part];
    }
    return cur === undefined ? null : cur;
}

function setAtPath(root, cleanPath, value) {
    const resolved = resolveServerMarkers(value);
    const parts = splitPath(cleanPath);
    if (parts.length === 0) {
        localDb = resolved && typeof resolved === 'object' ? resolved : defaultLocalDb();
        saveLocalDb();
        return;
    }
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
        cur = cur[key];
    }
    const last = parts[parts.length - 1];
    if (resolved === null || resolved === undefined) {
        delete cur[last];
    } else {
        cur[last] = resolved;
    }
    saveLocalDb();
}

function updateAtPath(root, cleanPath, updates) {
    if (!updates || typeof updates !== 'object') return;
    for (const [relKey, relVal] of Object.entries(updates)) {
        const targetPath = cleanPath === '/' ? '/' + relKey : cleanPath + '/' + relKey;
        setAtPath(root, targetPath, relVal);
    }
}

function handleLocalRequest(method, route, body) {
    const root = getLocalDb();
    const urlObj = new URL('http://local' + route);
    const pathname = urlObj.pathname;

    if (pathname === '/v1/db') {
        if (method === 'GET') {
            const p = urlObj.searchParams.get('path') || '/';
            return { value: getAtPath(root, p) };
        }
        if (method === 'PUT') {
            setAtPath(root, body?.path || '/', body?.value);
            return { ok: true };
        }
        if (method === 'PATCH') {
            updateAtPath(root, body?.path || '/', body?.updates);
            return { ok: true };
        }
        if (method === 'DELETE') {
            const p = urlObj.searchParams.get('path') || '/';
            setAtPath(root, p, null);
            return { ok: true };
        }
    }

    if (pathname === '/v1/db/compare-and-set' && method === 'POST') {
        const p = body?.path || '/';
        const current = getAtPath(root, p);
        const curJson = JSON.stringify(current === undefined ? null : current);
        const expJson = JSON.stringify(body?.expected === undefined ? null : body?.expected);
        if (curJson !== expJson) {
            return { committed: false, value: current };
        }
        setAtPath(root, p, body?.value);
        return { committed: true, value: getAtPath(root, p) };
    }

    if (pathname === '/v1/db/query' && method === 'GET') {
        const p = urlObj.searchParams.get('path') || '/';
        const child = urlObj.searchParams.get('child') || '';
        const equalToRaw = urlObj.searchParams.get('equalTo');
        let expected;
        try { expected = JSON.parse(equalToRaw); } catch { expected = equalToRaw; }
        const parentObj = getAtPath(root, p);
        if (!parentObj || typeof parentObj !== 'object') return { value: null };
        const matched = {};
        for (const [k, item] of Object.entries(parentObj)) {
            if (item && typeof item === 'object' && item[child] === expected) {
                matched[k] = item;
            }
        }
        return { value: Object.keys(matched).length ? matched : null };
    }

    if (pathname === '/v1/auth/session' && method === 'GET') {
        const sessionId = urlObj.searchParams.get('sessionId') || '';
        const accounts = root.accounts || {};
        for (const [uid, acc] of Object.entries(accounts)) {
            if (
                acc &&
                acc.account_status !== 'deleted' &&
                ((acc.sessions && Object.prototype.hasOwnProperty.call(acc.sessions, sessionId)) ||
                    acc.creator_session_id === sessionId)
            ) {
                return { uid, account: acc };
            }
        }
        return { uid: null };
    }

    if (pathname === '/v1/chat/sync' && method === 'GET') {
        const uid = urlObj.searchParams.get('uid') || '';
        const now = Date.now();
        const rawUsers = root.chat?.users || {};
        const users = {};
        for (const [userId, user] of Object.entries(rawUsers)) {
            users[userId] = {
                ...user,
                status: user?.status === 'online' && user.lastSeen && now - user.lastSeen < 25000 ? 'online' : 'offline'
            };
        }
        const accounts = {};
        for (const [accountId, acc] of Object.entries(root.accounts || {})) {
            if (acc?.account_status === 'deleted') continue;
            const { password: _, sessions: __, ...safeAcc } = acc;
            accounts[accountId] = safeAcc;
        }
        const dms = {};
        for (const [cid, ch] of Object.entries(root.chat?.conversations?.dms || {})) {
            if (ch?.members?.[uid]) dms[cid] = ch;
        }
        const gcs = {};
        for (const [cid, ch] of Object.entries(root.chat?.conversations?.gcs || {})) {
            if (ch?.members?.[uid] || cid === 'gc-general') gcs[cid] = ch;
        }
        return { users, accounts, channels: { dms, gcs } };
    }

    if (pathname === '/v1/chat/messages' && method === 'GET') {
        const uid = urlObj.searchParams.get('uid') || '';
        const cid = urlObj.searchParams.get('cid') || '';
        const type = urlObj.searchParams.get('type') || '';
        const limit = Number.parseInt(urlObj.searchParams.get('limit') || '20', 10) || 20;
        const channel = root.chat?.conversations?.[type]?.[cid];
        if (!channel?.members?.[uid]) {
            return { error: 'Not a member of this channel.', unauthorized: true };
        }
        const entries = Object.entries(channel.messages || {});
        const slice = entries.slice(-limit);
        return {
            messages: Object.fromEntries(slice),
            hasMore: entries.length > limit,
            members: channel.members || {}
        };
    }

    return {};
}

async function macRequest(method, route, body) {
    if (!HAS_REMOTE_MAC_API) {
        return handleLocalRequest(method, route, body);
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

                // The Firebase-style updater commonly mutates its argument in place.
                // Keep an untouched copy for compare-and-set; otherwise expected
                // accidentally becomes the new value and every transaction conflicts.
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

// Compatibility shim for handlers that use the database server-timestamp marker.
// The Mac API resolves { ".sv": "timestamp" } before persisting it.
export const admin = {
    database: {
        ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } }
    }
};

if (HAS_REMOTE_MAC_API) {
    console.log('[BSMS Web :: DB] Using the required Mac-hosted JSON database API.');
} else {
    console.log('[BSMS Web :: DB] BSMS_WEB_API_URL/KEY not configured; using local JSON preview database.');
}
