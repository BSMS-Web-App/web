/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import crypto from 'node:crypto';

const BSMS_WEB_API_URL = (process.env.BSMS_WEB_API_URL || '').replace(/\/+$/, '');
const BSMS_WEB_API_KEY = process.env.BSMS_WEB_API_KEY || '';

if (!BSMS_WEB_API_URL || BSMS_WEB_API_KEY.length < 32) {
    throw new Error('[BSMS Web :: DB] BSMS_WEB_API_URL and a 32+ character BSMS_WEB_API_KEY are required. No local or Firebase fallback is available.');
}

async function macRequest(method, route, body) {
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

export const db = { ref: (pathStr) => makeRemoteRef(pathStr) };

// Compatibility shim for existing handlers that use Firebase's server timestamp marker.
// The Mac API resolves { ".sv": "timestamp" } before persisting it.
export const admin = {
    database: {
        ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } }
    }
};

console.log('[BSMS Web :: DB] Using the required Mac-hosted JSON database API.');
