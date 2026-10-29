/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const API_URL = (process.env.BSMS_WEB_API_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.BSMS_WEB_API_KEY || '';

export default async function handler(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const mediaId = String(req.query.id || '');
    if (!/^[a-f0-9]{64}$/.test(mediaId)) {
        return res.status(400).json({ error: 'Invalid media ID.' });
    }
    if (!API_URL || API_KEY.length < 32) {
        return res.status(503).json({ error: 'Media service is not configured.' });
    }

    try {
        const upstream = await fetch(API_URL + '/v1/media/' + encodeURIComponent(mediaId), {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + API_KEY },
            signal: AbortSignal.timeout(20000)
        });

        if (!upstream.ok) {
            return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Media could not be retrieved.' });
        }

        const mimeType = upstream.headers.get('content-type') || 'application/octet-stream';
        if (!/^(image\/(jpeg|png|gif|webp)|audio\/webm|video\/quicktime)$/.test(mimeType)) {
            return res.status(502).json({ error: 'Unsupported media type.' });
        }

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const length = upstream.headers.get('content-length');
        if (length) res.setHeader('Content-Length', length);
        if (req.method === 'HEAD') return res.status(200).end();

        const data = Buffer.from(await upstream.arrayBuffer());
        return res.status(200).send(data);
    } catch (error) {
        console.error('[BSMS Web :: Media] Proxy failed:', error.message);
        return res.status(502).json({ error: 'Media service is unavailable.' });
    }
}
