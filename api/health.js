/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { handleApiCors } from '../lib/api-cors.js';

export default function handler(req, res) {
    if (!handleApiCors(req, res)) return;

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD, OPTIONS');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json({ ok: true, service: 'bsms-web-api' });
}
