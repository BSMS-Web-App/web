/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';
import { requestMacApi } from './db.js';

const MEDIA_UPLOAD_ORIGIN = 'https://media.bsms-web.com';
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    try {
        const sessionId = String(req.headers['x-session-id'] || req.query.sessionId || '');
        if (!sessionId || sessionId.length > 300) {
            return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
        }

        const sessionQuery = new URLSearchParams({ sessionId });
        const session = await requestMacApi('GET', '/v1/auth/session?' + sessionQuery.toString());
        if (!session?.authenticated || !session.uid) {
            return res.status(401).json({ error: 'Your session is invalid. Please sign in again.' });
        }

        const mimeType = String(req.body?.mimeType || '').toLowerCase();
        const size = Number(req.body?.size);
        if (!AVATAR_TYPES.has(mimeType) || !Number.isSafeInteger(size) || size < 1 || size > MAX_AVATAR_BYTES) {
            return res.status(400).json({ error: 'Choose a supported image no larger than 5 MB.' });
        }

        const apiKey = process.env.BSMS_WEB_API_KEY || '';
        if (apiKey.length < 32) {
            return res.status(503).json({ error: 'Media uploads are not configured.' });
        }

        const mediaId = crypto.randomBytes(32).toString('hex');
        const expires = String(Math.floor(Date.now() / 1000) + 600);
        const signedPayload = [mediaId, expires, session.uid, 'profile', 'profile', mimeType, String(size)].join('.');
        const signature = crypto.createHmac('sha256', apiKey).update(signedPayload).digest('hex');
        const query = new URLSearchParams({
            expires,
            uid: session.uid,
            cid: 'profile',
            channelType: 'profile',
            mime: mimeType,
            size: String(size),
            signature
        });

        return res.status(200).json({
            mediaId,
            mimeType,
            uploadUrl: MEDIA_UPLOAD_ORIGIN + '/v1/media-upload/' + mediaId + '?' + query.toString()
        });
    } catch (error) {
        console.error('[BSMS Web :: Media Upload] Authorization failed:', error.message);
        return res.status(503).json({ error: 'The media service is temporarily unavailable.' });
    }
}
