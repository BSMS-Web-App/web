/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db, requestMacApi } from './db.js';
import { handleApiCors } from '../lib/api-cors.js';
import { moderateContent } from './moderation.js';
import { legalAcceptanceRequired } from './legal-policy.js';
import { mediaUrl } from '../lib/media-url.js';

export const config = { maxDuration: 60 };

const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;

/*
 * Keep dev7 preview announcement data separate from production.
 * Authentication still uses the shared BSMS Web account/session records.
 */
const IS_DEV7_PREVIEW = process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === 'dev7';
const ANNOUNCEMENTS_PATH = IS_DEV7_PREVIEW ? '/dev7/announcements' : '/announcements';
const POLL_VOTES_PATH = IS_DEV7_PREVIEW ? '/dev7/announcementPollVotes' : '/announcementPollVotes';

function validKey(value) {
    return typeof value === 'string' && value.length > 0 && ![...value].some(char => '.#$[]/'.includes(char));
}

async function getUserBySession(sessionId) {
    if (!sessionId || !db) return null;

    // Resolve sessions through the Mac API's in-memory session index.
    // Reading the entire /accounts tree here caused large responses and Vercel timeouts.
    const sessionResult = await requestMacApi(
        'GET',
        '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId)
    );
    if (!sessionResult?.uid) return null;

    // Fetch only the matched account because announcements need staff profile,
    // legal-acceptance, and device-session fields for authorization and attribution.
    const accountSnap = await db.ref('/accounts/' + sessionResult.uid).once('value');
    const account = accountSnap.val();
    if (!account) return null;

    const session = account.sessions?.[sessionId];
    if (!session && account.creator_session_id !== sessionId) return null;
    if (account.account_status === 'deleted' || account.account_status === 'banned') return null;

    const deviceId = session?.deviceId || '';
    if (deviceId) {
        const deviceSnap = await db.ref('/banned_devices/' + deviceId).once('value');
        const deviceBan = deviceSnap.val();
        if (deviceBan) {
            if (deviceBan.ban_expires && Date.now() > Number(deviceBan.ban_expires)) {
                await db.ref('/banned_devices/' + deviceId).remove();
            } else {
                return null;
            }
        }
    }

    return { uid: sessionResult.uid, account };
}

async function verifyStaff(sessionId) {
    const user = await getUserBySession(sessionId);
    if (!user || !['owner', 'admin'].includes(user.account.role)) return null;
    return user;
}

function normalizePollForResponse(poll, votes, userUid) {
    if (!poll || typeof poll !== 'object') return null;

    const optionEntries = Object.entries(poll.options || {});
    const counts = Object.fromEntries(optionEntries.map(([id]) => [id, 0]));
    let totalVotes = 0;
    let userOptionIds = [];

    for (const [uid, record] of Object.entries(votes || {})) {
        const selected = Array.isArray(record?.optionIds) ? [...new Set(record.optionIds)] : [];
        if (!selected.length) continue;
        totalVotes += 1;

        for (const optionId of selected) {
            if (Object.prototype.hasOwnProperty.call(counts, optionId)) {
                counts[optionId] += 1;
            }
        }

        if (uid === userUid) {
            userOptionIds = selected.filter(id => Object.prototype.hasOwnProperty.call(counts, id));
        }
    }

    const options = optionEntries.map(([id, option]) => ({
        id,
        text: String(option?.text || ''),
        votes: counts[id] || 0,
        percentage: totalVotes ? Math.round(((counts[id] || 0) / totalVotes) * 100) : 0
    }));

    return {
        question: String(poll.question || ''),
        votingType: poll.votingType === 'multiple' ? 'multiple' : 'single',
        options,
        totalVotes,
        userOptionIds
    };
}

function normalizePollInput(input) {
    if (!input || typeof input !== 'object') return { error: 'Invalid poll configuration.' };

    const question = typeof input.question === 'string' ? input.question.trim() : '';
    const votingType = input.votingType === 'multiple' ? 'multiple' : 'single';
    const rawOptions = Array.isArray(input.options) ? input.options : [];

    if (!question || question.length > 200) {
        return { error: 'Poll question is required and must be 200 characters or fewer.' };
    }
    if (rawOptions.length < MIN_POLL_OPTIONS || rawOptions.length > MAX_POLL_OPTIONS) {
        return { error: `Polls must have between ${MIN_POLL_OPTIONS} and ${MAX_POLL_OPTIONS} options.` };
    }

    const options = {};
    for (const rawOption of rawOptions) {
        const text = typeof rawOption === 'string' ? rawOption.trim() : '';
        if (!text || text.length > 120) {
            return { error: 'Every poll option must contain 1–120 characters.' };
        }
        const optionId = db.ref(ANNOUNCEMENTS_PATH).push().key;
        options[optionId] = { text };
    }

    return { poll: { question, votingType, options } };
}

async function moderatePoll(poll) {
    const questionResult = await moderateContent(poll.question);
    if (questionResult.flagged) {
        return { error: `Poll question was blocked by moderation: ${questionResult.reason}` };
    }

    for (const option of Object.values(poll.options)) {
        const result = await moderateContent(option.text);
        if (result.flagged) {
            return { error: `Poll option was blocked by moderation: ${result.reason}` };
        }
    }

    return null;
}

export default async function handler(req, res) {
    if (!handleApiCors(req, res)) return;
    if (!db) return res.status(503).json({ error: 'Database unavailable.' });

    if (req.method === 'GET') {
        try {
            const [announcementsSnap, user] = await Promise.all([
                db.ref(ANNOUNCEMENTS_PATH).once('value'),
                getUserBySession(req.headers['x-session-id'] || req.query.sessionId)
            ]);

            const data = announcementsSnap.val() || {};
            const announcements = await Promise.all(Object.entries(data).map(async ([id, item]) => {
                const announcement = { ...item, id };
                if (item?.poll) {
                    const votesSnap = await db.ref(`${POLL_VOTES_PATH}/${id}`).once('value');
                    announcement.poll = normalizePollForResponse(item.poll, votesSnap.val() || {}, user?.uid || null);
                } else {
                    delete announcement.poll;
                }
                announcement.authorAvatar = mediaUrl(item.authorAvatar);
                return announcement;
            }));

            announcements.sort((a, b) => (b.createdAt || b.timestamp || 0) - (a.createdAt || a.timestamp || 0));
            const recent = announcements.length ? announcements[0] : null;

            return res.status(200).json({ success: true, announcements, recent });
        } catch (err) {
            console.error('[BSMS Web :: Announcements] Error fetching announcements:', err);
            return res.status(500).json({ error: 'Failed to retrieve announcements.' });
        }
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    let payload;
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
        return res.status(400).json({ error: 'Invalid request body.' });
    }

    const sessionId = req.headers['x-session-id'] || req.query.sessionId;
    const action = req.query.action || payload.action;

    // Voting is available to any active, authenticated account; staff permissions are not required.
    if (action === 'vote') {
        const user = await getUserBySession(sessionId);
        if (!user) return res.status(401).json({ error: 'Please sign in with an active account to vote.' });
        if (legalAcceptanceRequired(user.account)) {
            return res.status(428).json({ error: 'Please review and accept the updated legal policies before voting.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });
        }

        const announcementId = payload.announcementId || payload.id;
        if (!validKey(announcementId)) return res.status(400).json({ error: 'Invalid announcement.' });

        const announcementSnap = await db.ref(`${ANNOUNCEMENTS_PATH}/${announcementId}`).once('value');
        const announcement = announcementSnap.val();
        if (!announcement) return res.status(404).json({ error: 'Announcement not found.' });
        if (!announcement.poll) return res.status(400).json({ error: 'This announcement does not have a poll.' });

        const rawSelection = Array.isArray(payload.optionIds) ? payload.optionIds : [];
        const optionIds = [...new Set(rawSelection.filter(id => typeof id === 'string'))];
        const votingType = announcement.poll.votingType === 'multiple' ? 'multiple' : 'single';
        const options = announcement.poll.options || {};
        const validOptions = new Set(Object.keys(options));

        if (!optionIds.length) return res.status(400).json({ error: 'Select at least one option.' });
        if (votingType === 'single' && optionIds.length !== 1) {
            return res.status(400).json({ error: 'This poll allows only one selection.' });
        }
        if (optionIds.length > Object.keys(options).length || optionIds.some(id => !validOptions.has(id))) {
            return res.status(400).json({ error: 'One or more selected options are invalid.' });
        }

        try {
            await db.ref(`${POLL_VOTES_PATH}/${announcementId}/${user.uid}`).transaction(current => ({
                optionIds,
                updatedAt: Date.now()
            }));

            const votesSnap = await db.ref(`${POLL_VOTES_PATH}/${announcementId}`).once('value');
            const poll = normalizePollForResponse(announcement.poll, votesSnap.val() || {}, user.uid);
            return res.status(200).json({ success: true, poll });
        } catch (err) {
            console.error('[BSMS Web :: Announcements] Error recording poll vote:', err);
            return res.status(500).json({ error: 'Unable to record your vote. Please try again.' });
        }
    }

    const staff = await verifyStaff(sessionId);
    if (!staff) {
        return res.status(403).json({ error: 'Unauthorized: Administrator or Owner privileges required.' });
    }
    if (legalAcceptanceRequired(staff.account)) {
        return res.status(428).json({ error: 'Legal policy acceptance is required.', code: 'LEGAL_ACCEPTANCE_REQUIRED' });
    }

    if (action === 'create' || !action) {
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        const content = typeof payload.content === 'string' ? payload.content.trim() : '';

        if (!title) return res.status(400).json({ error: 'Announcement title is required.' });
        if (!content) return res.status(400).json({ error: 'Announcement content is required.' });

        const titleModeration = await moderateContent(title);
        if (titleModeration.flagged) {
            return res.status(400).json({
                error: `Announcement title was blocked by moderation: ${titleModeration.reason}`,
                moderation: { flagged: true, reasons: titleModeration.reasons, categories: titleModeration.categories || [], sources: titleModeration.sources || [] }
            });
        }

        const contentModeration = await moderateContent(content);
        if (contentModeration.flagged) {
            return res.status(400).json({
                error: `Announcement content was blocked by moderation: ${contentModeration.reason}`,
                moderation: { flagged: true, reasons: contentModeration.reasons, categories: contentModeration.categories || [], sources: contentModeration.sources || [] }
            });
        }

        let poll = null;
        if (payload.poll) {
            const normalized = normalizePollInput(payload.poll);
            if (normalized.error) return res.status(400).json({ error: normalized.error });
            poll = normalized.poll;
            const pollModeration = await moderatePoll(poll);
            if (pollModeration) return res.status(400).json(pollModeration);
        }

        const newRef = db.ref(ANNOUNCEMENTS_PATH).push();
        const id = newRef.key;
        const now = Date.now();
        const announcement = {
            id,
            title,
            content,
            ...(poll ? { poll } : {}),
            authorUid: staff.uid,
            authorUsername: staff.account.username || staff.uid,
            authorDisplayName: staff.account.displayName || staff.account.username || staff.uid,
            authorAvatar: staff.account.avatar || '',
            authorRole: staff.account.role || 'admin',
            createdAt: now,
            timestamp: now
        };

        console.info('[BSMS Web :: Announcements] Persisting announcement:', JSON.stringify({
            announcementBytes: Buffer.byteLength(JSON.stringify(announcement)),
            titleLength: title.length,
            contentLength: content.length,
            pollOptionCount: poll ? Object.keys(poll.options).length : 0
        }));
        try {
            await newRef.set(announcement);
        } catch (error) {
            console.error('[BSMS Web :: Announcements] Announcement database write failed:', error);
            return res.status(502).json({
                error: 'The announcement could not be saved to the database. Please try again shortly.'
            });
        }
        return res.status(200).json({
            success: true,
            announcement: { ...announcement, ...(poll ? { poll: { ...poll, totalVotes: 0, userOptionIds: [], options: Object.entries(poll.options).map(([optionId, option]) => ({ id: optionId, text: option.text, votes: 0, percentage: 0 })) } } : {}), authorAvatar: mediaUrl(announcement.authorAvatar) }
        });
    }

    if (action === 'delete') {
        const id = payload.id || payload.announcementId;
        if (!validKey(id)) return res.status(400).json({ error: 'Missing or invalid announcement id to delete.' });

        await Promise.all([
            db.ref(`${ANNOUNCEMENTS_PATH}/${id}`).remove(),
            db.ref(`${POLL_VOTES_PATH}/${id}`).remove()
        ]);
        return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(400).json({ error: 'Unknown action.' });
}
