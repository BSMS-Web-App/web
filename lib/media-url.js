/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';

const PUBLIC_MEDIA_ORIGIN = (process.env.BSMS_WEB_PUBLIC_MEDIA_URL || 'https://media.bsms-web.com').replace(/\\/+$/, '');

function signedPublicMediaUrl(mediaId) {
    const apiKey = process.env.BSMS_WEB_API_KEY || '';
    if (apiKey.length < 32) return null;

    const now = Math.floor(Date.now() / 1000);
    const expires = Math.floor(now / 21600) * 21600 + 21600;
    const signature = crypto.createHmac('sha256', apiKey)
        .update(mediaId + '.' + expires)
        .digest('hex');

    return PUBLIC_MEDIA_ORIGIN + '/v1/media-public/' + mediaId
        + '?expires=' + expires + '&signature=' + signature;
}

export function mediaUrl(value) {
    // Legacy data URLs are migrated by the Mac API. Never include their bytes
    // in an application API response.
    if (typeof value === 'string' && value.startsWith('data:')) return null;

    // Older account records store the media ID as a Vercel proxy URL. The old
    // proxy only redirected to the Mac, so convert it to a direct signed URL.
    if (typeof value === 'string') {
        const legacyMatch = /(?:^|\/)api\/media\?id=([a-f0-9]{64})(?:&|$)/i.exec(value);
        if (legacyMatch) return signedPublicMediaUrl(legacyMatch[1].toLowerCase());
        return value;
    }

    if (!value || typeof value !== 'object' || value.type !== 'media' ||
        !/^[a-f0-9]{64}$/.test(value.mediaId || '')) {
        return value;
    }

    return signedPublicMediaUrl(value.mediaId);
}
