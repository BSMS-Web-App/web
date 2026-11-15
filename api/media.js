/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Backward-compatible redirect for legacy media proxy URLs.
 */

import { mediaUrl } from '../lib/media-url.js';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const mediaId = String(req.query?.id || '');

    if (!/^[a-f0-9]{64}$/i.test(mediaId)) {
        return res.status(400).json({ error: 'Invalid media ID.' });
    }

    const destination = mediaUrl('/api/media?id=' + mediaId.toLowerCase());

    if (!destination) {
        return res.status(503).json({ error: 'Media service signing is not configured.' });
    }

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Location', destination);
    return res.status(302).end();
}
