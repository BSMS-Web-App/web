/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import { moderateContent } from './moderation.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const { text } = body;
        if (typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Text payload is required.' });
        }
        if (text.length > 10000) {
            return res.status(400).json({ error: 'Text is too long to validate.' });
        }

        const normalized = text
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/@/g, 'a')
            .replace(/\$/g, 's')
            .replace(/0/g, 'o');

        const validTextRegex = /^[\x20-\x7E\p{Emoji}\s]*$/u;
        if (!validTextRegex.test(normalized)) {
            return res.status(400).json({ error: 'Invalid characters or formatting detected.' });
        }

        const moderation = await moderateContent(text);
        if (moderation.flagged) {
            return res.status(400).json({
                success: false,
                clean: false,
                error: `Content was blocked by moderation: ${moderation.reason}`,
                moderation: {
                    flagged: true,
                    reasons: moderation.reasons,
                    categories: moderation.categories || [],
                    sources: moderation.sources || []
                }
            });
        }

        return res.status(200).json({ success: true, clean: true, moderation: { flagged: false, sources: moderation.sources || [] } });
    } catch (err) {
        console.error('[BSMS Web :: API] Text moderation failed.');
        return res.status(500).json({ error: 'Unable to validate text right now.' });
    }
}
