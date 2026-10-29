/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db } from './db.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const pageName = typeof req.query?.name === 'string' ? req.query.name.trim() : '';
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(pageName)) {
        return res.status(400).json({ error: 'Invalid page name.' });
    }

    try {
        const snapshot = await db.ref('/config/versions/' + pageName).once('value');
        const version = snapshot.val();
        if (version === null || version === undefined) {
            return res.status(404).json({ error: 'Version not found.' });
        }
        return res.status(200).json({ version: String(version) });
    } catch (error) {
        console.error('[BSMS Web :: Version] Database read failed:', error.message);
        return res.status(503).json({ error: 'Version information is unavailable.' });
    }
}
