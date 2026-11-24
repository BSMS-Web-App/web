/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { db } from './db.js';
import { LEGAL_POLICY_VERSIONS } from './legal-policy.js';
import { handleApiCors } from '../lib/api-cors.js';

export default async function handler(req, res) {
    if (!handleApiCors(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!db) return res.status(503).json({ error: 'The database is unavailable.' });
    try {
        const snapshot = await db.ref('/updates/policies').once('value');
        const stored = snapshot.val() || {};
        const policies = {};
        for (const key of ['terms', 'privacy']) {
            policies[key] = {
                content: typeof stored[key]?.content === 'string' ? stored[key].content : '',
                version: typeof stored[key]?.version === 'string' && stored[key].version ? stored[key].version : LEGAL_POLICY_VERSIONS[key]
            };
        }
        return res.status(200).json({ success: true, policies });
    } catch (error) {
        console.error('[BSMS Web :: Policies] Request failed:', error?.message || error);
        return res.status(503).json({ error: 'The policy service is temporarily unavailable.' });
    }
}
