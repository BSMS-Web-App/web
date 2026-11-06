/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { db, requestMacApi } from './db.js';

const VERSION_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function getAuthenticatedUser(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 300) return null;
    const session = await requestMacApi('GET', '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId));
    if (!session?.uid) return null;
    const snapshot = await db.ref('/accounts/' + session.uid).once('value');
    const account = snapshot.val();
    if (!account || account.account_status === 'deleted') return null;
    return { uid: session.uid, account };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = req.query.action || payload.action;
    const version = payload.version;
    if (!['status', 'dismiss'].includes(action)) return res.status(400).json({ error: 'Unknown update action.' });
    if (typeof version !== 'string' || version.length > 40 || !VERSION_PATTERN.test(version)) {
        return res.status(400).json({ error: 'A valid release version is required.' });
    }

    try {
        const user = await getAuthenticatedUser(req.headers['x-session-id']);
        if (!user) return res.status(401).json({ error: 'Sign in is required.' });
        if (user.account.account_status === 'banned') {
            return res.status(403).json({ error: 'This account is unavailable.', account_status: 'banned' });
        }

        const dismissalPath = '/accounts/' + user.uid + '/updateDismissals/' + version;
        if (action === 'status') {
            const snapshot = await db.ref(dismissalPath).once('value');
            return res.status(200).json({ success: true, dismissed: Boolean(snapshot.val()), version });
        }

        const dismissedAt = Date.now();
        await db.ref(dismissalPath).set(dismissedAt);
        const confirmation = await db.ref(dismissalPath).once('value');
        if (!confirmation.val()) throw new Error('The release dismissal could not be verified after saving.');

        return res.status(200).json({ success: true, dismissed: true, version, dismissedAt: confirmation.val() });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Request failed:', error?.message || error);
        return res.status(503).json({ error: 'Release update preferences are temporarily unavailable.' });
    }
}
