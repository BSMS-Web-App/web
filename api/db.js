/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data/db.json');

// Remote Mac JSON API mode. Configure BSMS_API_URL and BSMS_API_KEY only in
// Vercel server-side environment variables; never expose either to browser code.
const BSMS_API_URL = (process.env.BSMS_API_URL || '').replace(/\/+$/, '');
const BSMS_API_KEY = process.env.BSMS_API_KEY || '';
let remoteDb = null;

if (BSMS_API_URL || BSMS_API_KEY) {
    if (!BSMS_API_URL || BSMS_API_KEY.length < 32) {
        throw new Error('[BSMS Web :: DB] BSMS_API_URL and a 32+ character BSMS_API_KEY are both required.');
    }

    async function macRequest(method, route, body) {
        const response = await fetch(BSMS_API_URL + route, {
            method,
            headers: {
                'Authorization': 'Bearer ' + BSMS_API_KEY,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            signal: AbortSignal.timeout(15000)
        });

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

    function readChild(value, childPath) {
        let current = value;
        for (const part of childPath.split('/').filter(Boolean)) {
            if (current === null || current === undefined || typeof current !== 'object') return undefined;
            current = current[part];
        }
        return current;
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
                // Compare-and-set keeps transaction updates atomic across concurrent requests.
                for (let attempt = 0; attempt < 50; attempt += 1) {
                    const currentSnapshot = await makeRemoteRef(cleanPath).once('value');
                    const current = currentSnapshot.val();
                    const next = updateFn(current);
                    const result = await macRequest('POST', '/v1/db/compare-and-set', {
                        path: cleanPath,
                        expected: current,
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
                        const snapshot = await makeRemoteRef(cleanPath).once(eventType);
                        const source = snapshot.val() || {};
                        const filtered = {};
                        for (const [key, item] of Object.entries(source)) {
                            if (readChild(item, childPath) === expectedValue) filtered[key] = item;
                        }
                        return makeSnapshot(Object.keys(filtered).length ? filtered : null);
                    }
                })
            })
        };
    }

    remoteDb = { ref: (pathStr) => makeRemoteRef(pathStr) };
    console.log('[BSMS Web :: DB] Using authenticated Mac JSON API.');
}

// Try Firebase Admin first
let adminInstance = null;
let realFirebaseDb = null;

if (!remoteDb && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID) {
    try {
        const adminMod = await import('firebase-admin');
        const admin = adminMod.default || adminMod;
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                }),
                databaseURL: process.env.FIREBASE_DATABASE_URL
            });
        }
        adminInstance = admin;
        realFirebaseDb = admin.database();
        console.log("[BSMS Web :: DB] Connected to Firebase Realtime Database.");
    } catch (err) {
        console.error("[BSMS Web :: DB] Firebase Init Error:", err.message);
    }
}

// Fallback Local In-Memory & File Store
class LocalStore {
    constructor() {
        this.data = {};
        this.load();
        this.ensureDefaults();
    }

    load() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                this.data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
            }
        } catch (e) {
            this.data = {};
        }
    }

    save() {
        try {
            const dir = path.dirname(DATA_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
        } catch (e) {
            // Memory only fallback
        }
    }

    ensureDefaults() {
        if (!this.data.accounts) this.data.accounts = {};
        if (!this.data.chat) this.data.chat = { users: {}, conversations: { dms: {}, gcs: {} } };
        if (!this.data.chat.conversations) this.data.chat.conversations = { dms: {}, gcs: {} };
        if (!this.data.chat.conversations.gcs) this.data.chat.conversations.gcs = {};
        if (!this.data.chat.conversations.dms) this.data.chat.conversations.dms = {};
        if (!this.data.banned_devices) this.data.banned_devices = {};

        // Seed a default public group chat if none exists
        if (Object.keys(this.data.chat.conversations.gcs).length === 0) {
            const gcId = 'gc-general';
            this.data.chat.conversations.gcs[gcId] = {
                name: 'BSMS General',
                _type: 'gcs',
                _id: gcId,
                config: {
                    joinCode: 'GENERAL',
                    allowCustomNicknames: true,
                    lastMessageId: 100000
                },
                members: {},
                messages: {}
            };
        }
        this.save();
    }

    get(pathStr) {
        const parts = pathStr.split('/').filter(Boolean);
        let curr = this.data;
        for (const p of parts) {
            if (curr === null || curr === undefined || typeof curr !== 'object') return null;
            curr = curr[p];
        }
        return curr !== undefined ? JSON.parse(JSON.stringify(curr)) : null;
    }

    set(pathStr, val) {
        const parts = pathStr.split('/').filter(Boolean);
        if (parts.length === 0) {
            this.data = val || {};
            this.save();
            return;
        }
        let curr = this.data;
        for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
            curr = curr[p];
        }
        const last = parts[parts.length - 1];
        if (val === null || val === undefined) {
            delete curr[last];
        } else {
            curr[last] = this.resolveValue(val);
        }
        this.save();
    }

    resolveValue(val) {
        if (val && typeof val === 'object') {
            if (val['.sv'] === 'timestamp') return Date.now();
            const copy = Array.isArray(val) ? [] : {};
            for (const k of Object.keys(val)) {
                copy[k] = this.resolveValue(val[k]);
            }
            return copy;
        }
        return val;
    }

    update(pathStr, updates) {
        const parts = pathStr.split('/').filter(Boolean);
        let curr = this.data;
        for (const p of parts) {
            if (!curr[p] || typeof curr[p] !== 'object') curr[p] = {};
            curr = curr[p];
        }
        for (const [k, v] of Object.entries(updates)) {
            const subParts = k.split('/').filter(Boolean);
            let target = curr;
            for (let i = 0; i < subParts.length - 1; i++) {
                if (!target[subParts[i]] || typeof target[subParts[i]] !== 'object') target[subParts[i]] = {};
                target = target[subParts[i]];
            }
            const lastK = subParts[subParts.length - 1];
            if (v === null || v === undefined) {
                delete target[lastK];
            } else {
                target[lastK] = this.resolveValue(v);
            }
        }
        this.save();
    }

    remove(pathStr) {
        this.set(pathStr, null);
    }
}

const localStore = new LocalStore();

function createLocalRef(pathStr) {
    return {
        once: async () => {
            const val = localStore.get(pathStr);
            return {
                val: () => val,
                exists: () => val !== null && val !== undefined
            };
        },
        set: async (val) => {
            localStore.set(pathStr, val);
        },
        update: async (updates) => {
            localStore.update(pathStr, updates);
        },
        remove: async () => {
            localStore.remove(pathStr);
        },
        push: () => {
            const key = '-N' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
            return {
                key,
                set: async (val) => localStore.set(pathStr + '/' + key, val)
            };
        },
        transaction: async (updateFn) => {
            const curr = localStore.get(pathStr);
            const next = updateFn(curr);
            localStore.set(pathStr, next);
            return {
                snapshot: {
                    val: () => next
                }
            };
        },
        orderByChild: (childPath) => {
            return {
                equalTo: (expectedVal) => {
                    return {
                        once: async () => {
                            const obj = localStore.get(pathStr) || {};
                            const filtered = {};
                            for (const [k, v] of Object.entries(obj)) {
                                if (v && typeof v === 'object') {
                                    const subKeys = childPath.split('/').filter(Boolean);
                                    let subVal = v;
                                    for (const sk of subKeys) {
                                        subVal = subVal ? subVal[sk] : undefined;
                                    }
                                    if (subVal === expectedVal) {
                                        filtered[k] = v;
                                    }
                                }
                            }
                            return {
                                val: () => Object.keys(filtered).length > 0 ? filtered : null,
                                exists: () => Object.keys(filtered).length > 0
                            };
                        }
                    };
                }
            };
        }
    };
}

const fallbackDb = {
    ref: (p) => createLocalRef(p)
};

const adminMock = {
    apps: [{}],
    database: () => remoteDb || realFirebaseDb || fallbackDb
};
adminMock.database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };

export const db = remoteDb || realFirebaseDb || fallbackDb;
export const admin = adminInstance || adminMock;
export default { db, admin };
