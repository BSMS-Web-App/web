/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */

import crypto from 'node:crypto';
import { db } from './db.js';
import { moderateContent } from './moderation.js';

const REPORTS_PATH = '/reports';
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 5000;
const MAX_STEPS = 2500;
const SUBMISSION_COOLDOWN_MS = 60 * 1000;

async function getUserBySession(sessionId) {
    if (!sessionId || !db) return null;
    const snapshot = await db.ref('/accounts').once('value');
    const accounts = snapshot.val() || {};
    for (const [uid, account] of Object.entries(accounts)) {
        if (account?.sessions?.[sessionId] && account.account_status !== 'banned') {
            return { uid, account };
        }
    }
    return null;
}

function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

async function moderateSubmission(values) {
    const combined = [values.title, values.description, values.steps].filter(Boolean).join('\n\n');
    const result = await moderateContent(combined);
    if (result.flagged) {
        return {
            flagged: true,
            reason: result.reason || 'This submission could not be accepted by the content filter.'
        };
    }
    return { flagged: false };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    if (!db) return res.status(500).json({ error: 'The database is unavailable.' });

    const user = await getUserBySession(req.headers['x-session-id']);
    if (!user) return res.status(401).json({ error: 'Please sign in to submit a report or feature request.' });

    const payload = req.body || {};
    const type = payload.type === 'feature' ? 'feature' : payload.type === 'bug' ? 'bug' : '';
    const title = cleanText(payload.title, MAX_TITLE);
    const category = cleanText(payload.category, 40);
    const description = cleanText(payload.description, MAX_DESCRIPTION);
    const page = cleanText(payload.page, 200);
    const steps = cleanText(payload.steps, MAX_STEPS);

    const allowedCategories = new Set(['accounts', 'chat', 'games', 'events', 'ui', 'performance', 'security', 'other']);
    if (!type) return res.status(400).json({ error: 'Choose either a bug report or a feature request.' });
    if (title.length < 4) return res.status(400).json({ error: 'The title must contain at least 4 characters.' });
    if (!allowedCategories.has(category)) return res.status(400).json({ error: 'Choose a valid category.' });
    if (description.length < 10) return res.status(400).json({ error: 'The description must contain at least 10 characters.' });
    if (payload.title?.length > MAX_TITLE || payload.description?.length > MAX_DESCRIPTION || payload.steps?.length > MAX_STEPS) {
        return res.status(400).json({ error: 'One or more fields exceed the allowed length.' });
    }
    if (page && !/^\/?[a-zA-Z0-9/_-]{1,180}$/.test(page)) {
        return res.status(400).json({ error: 'Enter a valid BSMS Web page path.' });
    }

    try {
        const existingSnapshot = await db.ref(REPORTS_PATH).once('value');
        const existingReports = existingSnapshot.val() || {};
        const now = Date.now();
        const recent = Object.values(existingReports).some(report =>
            report && report.reporterUid === user.uid && Number(report.createdAt || 0) > now - SUBMISSION_COOLDOWN_MS
        );
        if (recent) return res.status(429).json({ error: 'Please wait a minute before submitting another report.' });

        const moderation = await moderateSubmission({ title, description, steps });
        if (moderation.flagged) return res.status(400).json({ error: moderation.reason });

        const reportRef = db.ref(REPORTS_PATH).push();
        const reportId = reportRef.key;
        await reportRef.set({
            id: reportId,
            type,
            title,
            category,
            description,
            page: type === 'bug' ? page : '',
            steps,
            status: 'open',
            adminNotes: '',
            reporterUid: user.uid,
            reporterUsername: String(user.account.username || 'unknown').slice(0, 40),
            reporterDisplayName: String(user.account.displayName || user.account.username || 'Unknown user').slice(0, 80),
            createdAt: now,
            updatedAt: now
        });

        return res.status(201).json({ success: true, reportId });
    } catch (error) {
        console.error('[BSMS Web :: Reports] Submission failed:', error?.message || error);
        return res.status(500).json({ error: 'The report could not be saved right now. Please try again later.' });
    }
}
