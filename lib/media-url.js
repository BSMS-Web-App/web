/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import crypto from 'node:crypto';

const PUBLIC_MEDIA_ORIGIN = 'https://media.bsms-web.com';

export function mediaUrl(value) {
    if (!value || typeof value !== 'object' || value.type !== 'media' ||
        !/^[a-f0-9]{64}$/.test(value.mediaId || '')) {
        return value;
    }

    const apiKey = process.env.BSMS_WEB_API_KEY || '';
    if (apiKey.length < 32) return null;

    const now = Math.floor(Date.now() / 1000);
    const expires = Math.floor(now / 21600) * 21600 + 21600;
    const signature = crypto.createHmac('sha256', apiKey)
        .update(value.mediaId + '.' + expires)
        .digest('hex');

    return PUBLIC_MEDIA_ORIGIN + '/v1/media-public/' + value.mediaId
        + '?expires=' + expires + '&signature=' + signature;
}
