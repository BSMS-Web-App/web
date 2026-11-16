/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * Shared CORS handling for Vercel serverless API routes.
 * Keep browser origins explicit; never use wildcard CORS.
 */

const ALLOWED_ORIGINS = new Set([
    'https://bsms-web.com',
    'https://www.bsms-web.com',
    'https://bsms-web.vercel.app',
    'https://bsms-web-dev2.vercel.app',
    'https://dev1.bsms-web.com',
    'https://dev2.bsms-web.com',
    'https://bsms-web-beta.vercel.app',
    'https://bsms-web-development.vercel.app',
    'https://bsms-web-dev3.vercel.app',
    'http://localhost:3000'
]);

/**
 * Applies CORS headers and ends valid preflight requests.
 * Returns false when the response has already been completed.
 */
export function handleApiCors(req, res) {
    const origin = req.headers?.origin;

    if (!origin) return true;

    res.setHeader('Vary', 'Origin');

    if (!ALLOWED_ORIGINS.has(origin)) {
        res.status(403).json({ error: 'Origin is not allowed.' });
        return false;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-ID, X-Device-ID, X-UID, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return false;
    }

    return true;
}
