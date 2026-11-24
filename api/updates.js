/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { createHash } from 'node:crypto';
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

const POLICY_KEYS = ['terms', 'privacy'];
const DEFAULT_POLICIES = { terms: '', privacy: '' };

async function getPolicyBundle() {
    const snapshot = await db.ref('/updates/policies').once('value');
    const stored = snapshot.val() || {};
    const policies = {};
    const versions = {};
    for (const key of POLICY_KEYS) {
        const content = typeof stored[key]?.content === 'string' ? stored[key].content : '';
        const version = typeof stored[key]?.version === 'string' ? stored[key].version : LEGAL_POLICY_VERSIONS[key];
        policies[key] = { content, version };
        versions[key] = version;
    }
    return { policies, versions };
}

function policyStatus(account, versions) {
    return getLegalPolicyStatus(account, versions);
}

async function getReleases() {
    const snapshot = await db.ref('/updates/releases').once('value');
    return Object.entries(snapshot.val() || {})
        .filter(([, release]) => release && typeof release === 'object')
        .map(([id, release]) => ({ ...release, id }))
        .sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0));
}

function unseenReleases(releases, account, uid) {
    const seen = new Set(Array.isArray(account.updatesSeen) ? account.updatesSeen : []);
    const start = releaseStart(account);
    return releases.filter(release =>
        release.active !== false &&
        Number(release.publishedAt || 0) >= start &&
        Number(release.startsAt || release.publishedAt || 0) <= Date.now() &&
        release.publishedBy !== uid &&
        !seen.has(release.id + ':' + (Number(release.revision) || 1)) && ((Number(release.revision) || 1) > 1 || !seen.has(release.id))
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

async function requireOwner(user, res, versions) {
    if (user.account.role !== 'owner') {
        res.status(403).json({ error: 'Only the BSMS Web owner can manage website releases.' });
        return false;
    }
    if (policyStatus(user.account, versions).needsAcceptance) {
        res.status(428).json({
            error: 'Review and accept the current legal policies before managing releases.',
            code: 'LEGAL_ACCEPTANCE_REQUIRED'
        });
        return false;
    }
    return true;
}

async function acceptPolicies(user, payload, res, versions) {
    const status = policyStatus(user.account, versions);
    const termsAccepted = payload.termsAccepted === true;
    const privacyAccepted = payload.privacyAccepted === true;

    if (!payload.versions ||
        payload.versions.terms !== versions.terms ||
        payload.versions.privacy !== versions.privacy) {
        return res.status(409).json({
            error: 'The legal documents changed while you were reviewing them. Please reload and review the current versions.',
            code: 'LEGAL_VERSION_CHANGED',
            versions,
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
    for (const key of POLICY_KEYS) {
        if (!status.policies[key].required) continue;
        updates[key] = { version: versions[key], acceptedAt: now };
        acceptedPolicies.push(key);
    }
    if (!acceptedPolicies.length) {
        return res.status(200).json({ success: true, needsAcceptance: false, acceptedPolicies: [] });
    }

    await db.ref('/accounts/' + user.uid + '/legalAcceptance').update(updates);
    const savedSnapshot = await db.ref('/accounts/' + user.uid).once('value');
    if (policyStatus(savedSnapshot.val() || {}, versions).needsAcceptance) {
        throw new Error('Your acknowledgments could not be verified after saving. Please try again.');
    }

    try {
        const history = db.ref('/accounts/' + user.uid + '/legalAcceptanceHistory').push();
        await history.set({
            policies: acceptedPolicies,
            versions: Object.fromEntries(acceptedPolicies.map(key => [key, versions[key]])),
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
        .filter(release => release.active !== false && Number(release.startsAt || release.publishedAt || 0) <= Date.now() && Number(release.publishedAt || 0) >= start)
        .map(release => release.id + ':' + (Number(release.revision) || 1)));
    const ids = [...new Set(payload.ids
        .filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}:\d{1,8}$/.test(id))
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

    const policyChanges = payload.policies && typeof payload.policies === 'object' ? payload.policies : {};
    const policyUpdates = {};
    for (const key of POLICY_KEYS) {
        if (policyChanges[key] === undefined) continue;
        if (typeof policyChanges[key] !== 'string' || policyChanges[key].length > 50000) {
            return res.status(400).json({ error: 'Each legal document must be 50,000 characters or fewer.' });
        }
        const content = policyChanges[key].trim();
        const oldSnapshot = await db.ref('/updates/policies/' + key).once('value');
        const old = oldSnapshot.val() || {};
        if (content !== String(old.content || '')) {
            const version = 'v-' + createHash('sha256').update(content).digest('hex').slice(0, 16);
            policyUpdates[key] = { content, version, updatedAt: Date.now(), updatedBy: user.uid };
        }
    }
    if (Object.keys(policyUpdates).length) await db.ref('/updates/policies').update(policyUpdates);

    const ref = db.ref('/updates/releases').push();
    const publishedAt = Date.now();
    const parseDate = value => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const [year, month, day] = value.split('-').map(Number);
        const offset = Number.isFinite(Number(payload.timezoneOffset)) ? Math.max(-840, Math.min(840, Number(payload.timezoneOffset))) : 0;
        const timestamp = Date.UTC(year, month - 1, day) + offset * 60000;
        return Number.isFinite(timestamp) ? timestamp : null;
    };
    const startsAt = parseDate(payload.startsOn) ?? publishedAt;
    const releaseDate = parseDate(payload.releaseDate) ?? publishedAt;
    const release = {
        version,
        content: payload.content.trim(),
        detailsUrl,
        publishedAt,
        startsAt,
        releaseDate,
        revision: 1,
        publishedBy: user.uid,
        publishedByName: String(user.account.displayName || user.account.username || 'BSMS Web owner'),
        active: true
    };
    await ref.set(release);

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

        const policyBundle = await getPolicyBundle();
        const legal = policyStatus(user.account, policyBundle.versions);
        if (req.method === 'GET') {
            const releases = await getReleases();
            return res.status(200).json({
                success: true,
                releases: unseenReleases(releases, user.account, user.uid),
                latestReleaseVersion: releases.find(release => release.active !== false)?.version || null,
                legal: {
                    versions: policyBundle.versions,
                    policies: legal.policies,
                    documents: policyBundle.policies,
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
                versions: policyBundle.versions,
                policies: legal.policies,
                documents: policyBundle.policies,
                needsAcceptance: legal.needsAcceptance
            });
        }
        if (action === 'accept') return await acceptPolicies(user, payload, res, policyBundle.versions);
        if (action === 'mark-viewed') {
            return await markViewed(user, payload, res, await getReleases());
        }
        if (action === 'admin-list') {
            if (!await requireOwner(user, res, policyBundle.versions)) return;
            return res.status(200).json({
                success: true,
                releases: await getReleases(),
                documents: policyBundle.policies,
                callerRole: user.account.role
            });
        }
        if (action === 'publish') {
            if (!await requireOwner(user, res, policyBundle.versions)) return;
            return await publishRelease(user, payload, res, await getReleases());
        }
        if (action === 'edit') {
            if (!await requireOwner(user, res, policyBundle.versions)) return;
            const id = typeof payload.id === 'string' ? payload.id : '';
            if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ error: 'Invalid release ID.' });
            const ref = db.ref('/updates/releases/' + id);
            const snap = await ref.once('value');
            const existing = snap.val();
            if (!existing) return res.status(404).json({ error: 'That release no longer exists.' });
            if (typeof payload.version !== 'string' || !/^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(payload.version.trim()) || typeof payload.content !== 'string' || !payload.content.trim() || payload.content.length > 30000) return res.status(400).json({ error: 'Enter a valid version and release details.' });
            const detailsUrl = validateDetailsUrl(payload.detailsUrl);
            if (detailsUrl === null) return res.status(400).json({ error: 'Use a valid GitHub release URL, or leave the field empty.' });
            const parseDate = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null; const [year, month, day] = value.split('-').map(Number); const offset = Number.isFinite(Number(payload.timezoneOffset)) ? Math.max(-840, Math.min(840, Number(payload.timezoneOffset))) : 0; return Date.UTC(year, month - 1, day) + offset * 60000; };
            const startsAt = parseDate(payload.startsOn);
            const releaseDate = parseDate(payload.releaseDate);
            const policyChanges = payload.policies && typeof payload.policies === 'object' ? payload.policies : {};
            const policyUpdates = {};
            for (const key of POLICY_KEYS) {
                if (policyChanges[key] === undefined) continue;
                if (typeof policyChanges[key] !== 'string' || policyChanges[key].length > 50000) return res.status(400).json({ error: 'Each legal document must be 50,000 characters or fewer.' });
                const policyContent = policyChanges[key].trim();
                const oldPolicySnapshot = await db.ref('/updates/policies/' + key).once('value');
                const oldPolicy = oldPolicySnapshot.val() || {};
                if (policyContent !== String(oldPolicy.content || '')) {
                    const policyVersion = 'v-' + createHash('sha256').update(policyContent).digest('hex').slice(0, 16);
                    policyUpdates[key] = { content: policyContent, version: policyVersion, updatedAt: Date.now(), updatedBy: user.uid };
                }
            }
            if (Object.keys(policyUpdates).length) await db.ref('/updates/policies').update(policyUpdates);
            const updated = { ...existing, version: payload.version.trim(), content: payload.content.trim(), detailsUrl, startsAt: startsAt ?? existing.startsAt ?? existing.publishedAt, releaseDate: releaseDate ?? existing.releaseDate ?? existing.publishedAt, revision: (Number(existing.revision) || 1) + 1, editedAt: Date.now(), editedBy: user.uid };
            await ref.set(updated);
            return res.status(200).json({ success: true, release: { ...updated, id } });
        }
        if (action === 'delete') {
            if (!await requireOwner(user, res, policyBundle.versions)) return;
            const id = typeof payload.id === 'string' ? payload.id : '';
            if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ error: 'Invalid release ID.' });
            const ref = db.ref('/updates/releases/' + id);
            const snap = await ref.once('value');
            if (!snap.exists()) return res.status(404).json({ error: 'That release no longer exists.' });
            await ref.remove();
            return res.status(200).json({ success: true, deletedId: id });
        }
        return res.status(400).json({ error: 'Unknown updates action.' });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Request failed:', error?.message || error);
        return res.status(503).json({
            error: 'The updates service is temporarily unavailable. Please try again.'
        });
    }
}
