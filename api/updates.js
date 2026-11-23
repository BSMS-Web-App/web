/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { db, requestMacApi } from './db.js';
import { LEGAL_POLICY_VERSIONS, getLegalPolicyStatus } from './legal-policy.js';
import { handleApiCors } from '../lib/api-cors.js';

async function getAuthenticatedUser(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 300) return null;
    const session = await requestMacApi('GET', '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId));
    if (!session?.uid) return null;
    const snapshot = await db.ref('/accounts/' + session.uid).once('value');
    const account = snapshot.val();
    if (!account || account.account_status === 'deleted') return null;
    return { uid: session.uid, account };
}

function releaseStart(account) {
    const createdAt = Number(account?.createdAt);
    return Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0;
}

async function getReleases() {
    const snapshot = await db.ref('/updates/releases').once('value');
    return Object.entries(snapshot.val() || {})
        .filter(([, release]) => release && typeof release === 'object')
        .map(([id, release]) => ({ ...release, id }))
        .sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0));
}

function unseenReleases(releases, account) {
    const seen = new Set(Array.isArray(account.updatesSeen) ? account.updatesSeen : []);
    const start = releaseStart(account);
    return releases.filter(release =>
        release.active !== false &&
        Number(release.publishedAt || 0) >= start &&
        !seen.has(release.id)
    );
}

function parsePayload(req) {
    if (typeof req.body !== 'string') return req.body && typeof req.body === 'object' ? req.body : {};
    try { return JSON.parse(req.body || '{}'); } catch { return null; }
}

function validateDetailsUrl(value) {
    if (value === '' || value === null || value === undefined) return '';
    if (typeof value !== 'string' || value.length > 500) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
            !url.pathname.startsWith('/BSMS-Web-App/web/releases/tag/') ||
            url.pathname.split('/').filter(Boolean).length < 5) return null;
        return url.toString();
    } catch { return null; }
}

async function requireOwner(user, res) {
    if (user.account.role !== 'owner') {
        res.status(403).json({ error: 'Only the BSMS Web owner can manage website releases.' });
        return false;
    }
    if (getLegalPolicyStatus(user.account).needsAcceptance) {
        res.status(428).json({
            error: 'Review and accept the current legal policies before managing releases.',
            code: 'LEGAL_ACCEPTANCE_REQUIRED'
        });
        return false;
    }
    return true;
}

async function acceptPolicies(user, payload, res) {
    const status = getLegalPolicyStatus(user.account);
    const termsAccepted = payload.termsAccepted === true;
    const privacyAccepted = payload.privacyAccepted === true;

    if (!payload.versions ||
        payload.versions.terms !== LEGAL_POLICY_VERSIONS.terms ||
        payload.versions.privacy !== LEGAL_POLICY_VERSIONS.privacy) {
        return res.status(409).json({
            error: 'The legal documents changed while you were reviewing them. Please reload and review the current versions.',
            code: 'LEGAL_VERSION_CHANGED',
            versions: LEGAL_POLICY_VERSIONS,
            policies: status.policies,
            needsAcceptance: status.needsAcceptance
        });
    }
    if (status.policies.terms.required && !termsAccepted) {
        return res.status(400).json({ error: 'You must agree to the current Terms of Service.' });
    }
    if (status.policies.privacy.required && !privacyAccepted) {
        return res.status(400).json({ error: 'You must acknowledge the current Privacy Policy.' });
    }

    const now = Date.now();
    const updates = {};
    const acceptedPolicies = [];
    for (const key of Object.keys(LEGAL_POLICY_VERSIONS)) {
        if (!status.policies[key].required) continue;
        updates[key] = { version: LEGAL_POLICY_VERSIONS[key], acceptedAt: now };
        acceptedPolicies.push(key);
    }
    if (!acceptedPolicies.length) {
        return res.status(200).json({ success: true, needsAcceptance: false, acceptedPolicies: [] });
    }

    await db.ref('/accounts/' + user.uid + '/legalAcceptance').update(updates);
    const savedSnapshot = await db.ref('/accounts/' + user.uid).once('value');
    if (getLegalPolicyStatus(savedSnapshot.val() || {}).needsAcceptance) {
        throw new Error('Your acknowledgments could not be verified after saving. Please try again.');
    }

    try {
        const history = db.ref('/accounts/' + user.uid + '/legalAcceptanceHistory').push();
        await history.set({
            policies: acceptedPolicies,
            versions: Object.fromEntries(acceptedPolicies.map(key => [key, LEGAL_POLICY_VERSIONS[key]])),
            acceptedAt: now
        });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Legal acceptance history could not be recorded:', error?.message || error);
    }

    return res.status(200).json({
        success: true,
        needsAcceptance: false,
        acceptedPolicies,
        acceptedAt: now
    });
}

async function markViewed(user, payload, res, releases) {
    if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 100) {
        return res.status(400).json({ error: 'Provide one or more update IDs to mark as viewed.' });
    }
    const start = releaseStart(user.account);
    const allowed = new Set(releases
        .filter(release => release.active !== false && Number(release.publishedAt || 0) >= start)
        .map(release => release.id));
    const ids = [...new Set(payload.ids
        .filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id))
        .filter(id => allowed.has(id)))];
    if (!ids.length) return res.status(400).json({ error: 'No valid unseen update IDs were supplied.' });

    const ref = db.ref('/accounts/' + user.uid + '/updatesSeen');
    const transaction = await ref.transaction(current => {
        const seen = new Set(Array.isArray(current) ? current : []);
        ids.forEach(id => seen.add(id));
        return [...seen];
    });
    if (!transaction?.committed) throw new Error('The viewed updates could not be saved.');
    return res.status(200).json({ success: true, viewedIds: ids });
}

async function publishRelease(user, payload, res, releases) {
    if (typeof payload.version !== 'string' ||
        !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(payload.version.trim())) {
        return res.status(400).json({ error: 'Enter a valid release version, such as v6.14.0.' });
    }
    const version = payload.version.trim();
    if (releases.some(release => release.version === version)) {
        return res.status(409).json({ error: 'That release version has already been published.' });
    }
    if (typeof payload.content !== 'string' || !payload.content.trim()) {
        return res.status(400).json({ error: 'Write the update details before publishing.' });
    }
    if (payload.content.length > 30000) {
        return res.status(400).json({ error: 'Update details must be 30,000 characters or fewer.' });
    }
    const detailsUrl = validateDetailsUrl(payload.detailsUrl);
    if (detailsUrl === null) {
        return res.status(400).json({
            error: 'Use a valid GitHub release URL for BSMS-Web-App/web, or leave the field empty.'
        });
    }

    const ref = db.ref('/updates/releases').push();
    const publishedAt = Date.now();
    const release = {
        version,
        content: payload.content.trim(),
        detailsUrl,
        publishedAt,
        publishedBy: user.uid,
        publishedByName: String(user.account.displayName || user.account.username || 'BSMS Web owner'),
        active: true
    };
    await ref.set(release);

    // The publisher has already authored the release; do not show it as unread to them.
    await db.ref('/accounts/' + user.uid + '/updatesSeen').transaction(current => {
        const seen = new Set(Array.isArray(current) ? current : []);
        seen.add(ref.key);
        return [...seen];
    });

    return res.status(201).json({ success: true, release: { ...release, id: ref.key } });
}

export default async function handler(req, res) {
    if (!handleApiCors(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!db) return res.status(503).json({ error: 'The database is unavailable.' });

    try {
        const user = await getAuthenticatedUser(req.headers['x-session-id']);
        if (!user) return res.status(401).json({ error: 'Sign in is required.' });
        if (user.account.account_status === 'banned') {
            return res.status(403).json({ error: 'This account is banned.', account_status: 'banned' });
        }

        const legal = getLegalPolicyStatus(user.account);
        if (req.method === 'GET') {
            const releases = await getReleases();
            return res.status(200).json({
                success: true,
                releases: unseenReleases(releases, user.account),
                latestReleaseVersion: releases.find(release => release.active !== false)?.version || null,
                legal: {
                    versions: LEGAL_POLICY_VERSIONS,
                    policies: legal.policies,
                    needsAcceptance: legal.needsAcceptance
                }
            });
        }

        const payload = parsePayload(req);
        if (payload === null) return res.status(400).json({ error: 'The request body contains invalid JSON.' });
        const action = req.query?.action || payload.action;

        if (action === 'status') {
            return res.status(200).json({
                success: true,
                versions: LEGAL_POLICY_VERSIONS,
                policies: legal.policies,
                needsAcceptance: legal.needsAcceptance
            });
        }
        if (action === 'accept') return await acceptPolicies(user, payload, res);
        if (action === 'mark-viewed') {
            return await markViewed(user, payload, res, await getReleases());
        }
        if (action === 'admin-list') {
            if (!await requireOwner(user, res)) return;
            return res.status(200).json({
                success: true,
                releases: await getReleases(),
                callerRole: user.account.role
            });
        }
        if (action === 'publish') {
            if (!await requireOwner(user, res)) return;
            return await publishRelease(user, payload, res, await getReleases());
        }
        return res.status(400).json({ error: 'Unknown updates action.' });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Request failed:', error?.message || error);
        return res.status(503).json({
            error: 'The updates service is temporarily unavailable. Please try again.'
        });
    }
}
