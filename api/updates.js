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

function releaseActivityAt(release) {
    const editedAt = Number(release?.editedAt);
    if (Number.isFinite(editedAt) && editedAt > 0) return editedAt;
    const publishedAt = Number(release?.publishedAt);
    return Number.isFinite(publishedAt) && publishedAt > 0 ? publishedAt : 0;
}

function releaseRevision(release) {
    const revision = Number(release?.revision);
    return Number.isSafeInteger(revision) && revision >= 1 && revision <= 1000000000 ? revision : 1;
}

const POLICY_KEYS = ['terms', 'privacy'];

async function getPolicyBundle() {
    const snapshot = await db.ref('/updates/policies').once('value');
    const stored = snapshot.val() || {};
    const policies = {};
    const versions = {};
    for (const key of POLICY_KEYS) {
        const content = typeof stored[key]?.content === 'string' ? stored[key].content : '';
        const version = typeof stored[key]?.version === 'string' && stored[key].version ? stored[key].version : LEGAL_POLICY_VERSIONS[key];
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
        .sort((a, b) => releaseActivityAt(b) - releaseActivityAt(a));
}

function seenUpdateIds(value) {
    if (Array.isArray(value)) return value.filter(item => typeof item === 'string');
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, item]) =>
        typeof item === 'string' ? [item] : item === true ? [key] : []
    );
}

function unseenReleases(releases, account, uid) {
    const seen = new Set(seenUpdateIds(account.updatesSeen));
    const start = releaseStart(account);
    return releases.filter(release =>
        release.active !== false &&
        releaseActivityAt(release) >= start &&
        Number(release.startsAt || release.publishedAt || 0) <= Date.now() &&
        release.publishedBy !== uid &&
        !seen.has(release.id + ':' + releaseRevision(release)) && (releaseRevision(release) > 1 || !seen.has(release.id))
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
        const parts = url.pathname.split('/').filter(Boolean);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
            url.username || url.password || url.port || url.search || url.hash ||
            parts.length !== 5 || parts[0] !== 'BSMS-Web-App' ||
            parts[1] !== 'web' || parts[2] !== 'releases' ||
            parts[3] !== 'tag' || !parts[4]) return null;
        return url.toString();
    } catch { return null; }
}

function validReleaseVersion(value) {
    return typeof value === 'string' &&
        /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value.trim());
}

function normalizeReleaseVersion(value) {
    return String(value || '').trim().replace(/^v/, '');
}

function releaseTimezoneOffset(payload, field) {
    const offsets = payload.timezoneOffsets && typeof payload.timezoneOffsets === 'object' && !Array.isArray(payload.timezoneOffsets)
        ? payload.timezoneOffsets : {};
    return offsets[field] ?? payload.timezoneOffset;
}

function parseReleaseDate(value, timezoneOffset) {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1) return null;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const offset = Number.isInteger(Number(timezoneOffset))
        ? Math.max(-840, Math.min(840, Number(timezoneOffset))) : 0;
    return date.getTime() + offset * 60000;
}

function apiError(message, status = 400, code) {
    const error = new Error(message);
    error.status = status;
    if (code) error.code = code;
    return error;
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

function getPolicyPayload(payload) {
    const changes = payload.policies === undefined ? {} : payload.policies;
    const versions = payload.policyVersions === undefined ? {} : payload.policyVersions;
    if (!changes || typeof changes !== 'object' || Array.isArray(changes) ||
        !versions || typeof versions !== 'object' || Array.isArray(versions) ||
        Object.keys(changes).some(key => !POLICY_KEYS.includes(key)) ||
        Object.keys(versions).some(key => !POLICY_KEYS.includes(key)) ||
        Object.values(versions).some(value => typeof value !== 'string' || !value || value.length > 100)) {
        throw apiError('The legal document update data is invalid.');
    }
    return { changes, versions };
}

async function buildPolicyUpdates(user, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
        throw apiError('Provide the legal documents to publish.');
    }

    const updates = {};
    const expectedVersions = {};
    for (const key of POLICY_KEYS) {
        if (changes[key] === undefined) continue;
        if (typeof changes[key] !== 'string' || changes[key].length > 50000) {
            throw apiError('Each legal document must be 50,000 characters or fewer.');
        }

        const content = changes[key].trim();
        if (!content) throw apiError('The Terms of Service and Privacy Policy cannot be empty.');

        const oldSnapshot = await db.ref('/updates/policies/' + key).once('value');
        const old = oldSnapshot.val() || {};
        const oldVersion = typeof old.version === 'string' && old.version ? old.version : LEGAL_POLICY_VERSIONS[key];
        if (content !== String(old.content || '')) {
            expectedVersions[key] = oldVersion;
            updates[key] = {
                content,
                version: 'v-' + createHash('sha256').update(content).digest('hex'),
                updatedAt: Date.now(),
                updatedBy: user.uid
            };
        }
    }
    return { updates, expectedVersions };
}

async function commitUpdateMutation({ releaseId, release, policyUpdates = {}, expectedPolicyVersions = {}, expectedReleaseRevision, allowCreate = false }) {
    const transaction = await db.ref('/updates').transaction(current => {
        const root = current && typeof current === 'object' && !Array.isArray(current) ? { ...current } : {};
        const storedReleases = root.releases && typeof root.releases === 'object' && !Array.isArray(root.releases)
            ? { ...root.releases } : {};
        const storedPolicies = root.policies && typeof root.policies === 'object' && !Array.isArray(root.policies)
            ? { ...root.policies } : {};

        if (releaseId) {
            const existing = storedReleases[releaseId];
            if (allowCreate && existing) throw apiError('That release ID is already in use. Please try again.', 409, 'RELEASE_ID_CONFLICT');
            if (!allowCreate && !existing) throw apiError('That release no longer exists.', 404, 'RELEASE_NOT_FOUND');
            if (!allowCreate && releaseRevision(existing) !== Number(expectedReleaseRevision || 1)) {
                throw apiError('This release changed after you opened it. Refresh the release list and try again.', 409, 'RELEASE_CHANGED');
            }

            if (release) {
                const duplicate = Object.entries(storedReleases).some(([id, item]) =>
                    id !== releaseId && normalizeReleaseVersion(item?.version) === normalizeReleaseVersion(release.version));
                if (duplicate) throw apiError('Another release already uses that version number.', 409, 'DUPLICATE_RELEASE_VERSION');
                storedReleases[releaseId] = release;
            } else {
                delete storedReleases[releaseId];
            }
        }

        for (const key of Object.keys(policyUpdates)) {
            const currentVersion = typeof storedPolicies[key]?.version === 'string' && storedPolicies[key].version
                ? storedPolicies[key].version : LEGAL_POLICY_VERSIONS[key];
            if (expectedPolicyVersions[key] && expectedPolicyVersions[key] !== currentVersion) {
                throw apiError('The ' + (key === 'terms' ? 'Terms of Service' : 'Privacy Policy') +
                    ' changed in another session. Refresh the editor and review the latest text before publishing.',
                    409, 'POLICY_CHANGED');
            }
        }

        root.releases = storedReleases;
        if (Object.keys(policyUpdates).length) root.policies = { ...storedPolicies, ...policyUpdates };
        return root;
    });
    if (!transaction?.committed) throw new Error('The update could not be saved because the database changed repeatedly. Please try again.');
}

async function acceptPolicies(user, payload, res, requestedVersions) {
    const latestBundle = await getPolicyBundle();
    const versions = latestBundle.versions;
    const status = policyStatus(user.account, versions);
    const termsAccepted = payload.termsAccepted === true;
    const privacyAccepted = payload.privacyAccepted === true;

    if (!requestedVersions ||
        requestedVersions.terms !== versions.terms ||
        requestedVersions.privacy !== versions.privacy ||
        !payload.versions ||
        payload.versions.terms !== versions.terms ||
        payload.versions.privacy !== versions.privacy) {
        return res.status(409).json({
            error: 'The legal documents changed while you were reviewing them. Please reload and review the current versions.',
            code: 'LEGAL_VERSION_CHANGED',
            versions,
            policies: status.policies,
            documents: latestBundle.policies,
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
    const [savedSnapshot, afterSaveBundle] = await Promise.all([
        db.ref('/accounts/' + user.uid).once('value'),
        getPolicyBundle()
    ]);
    const savedAccount = savedSnapshot.val() || {};
    const afterSaveStatus = policyStatus(savedAccount, afterSaveBundle.versions);
    if (afterSaveStatus.needsAcceptance) {
        return res.status(409).json({
            error: 'A legal document changed while your acknowledgments were being saved. Please review the latest versions.',
            code: 'LEGAL_VERSION_CHANGED',
            versions: afterSaveBundle.versions,
            policies: afterSaveStatus.policies,
            documents: afterSaveBundle.policies,
            needsAcceptance: true
        });
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
function parseViewedReleaseId(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        const id = value.id;
        const revision = Number(value.revision);
        if (typeof id !== 'string' || !/^[A-Za-z0-9_:-]{1,100}$/.test(id) ||
            !Number.isSafeInteger(revision) || revision < 1 || revision > 1000000000) return null;
        return { id, revision };
    }
    if (typeof value !== 'string') return null;
    const separator = value.lastIndexOf(':');
    if (separator < 1) return null;
    const id = value.slice(0, separator);
    const revisionText = value.slice(separator + 1);
    if (!/^[A-Za-z0-9_:-]{1,100}$/.test(id) || !/^\d{1,10}$/.test(revisionText)) return null;
    const revision = Number(revisionText);
    return Number.isSafeInteger(revision) && revision >= 1 && revision <= 1000000000
        ? { id, revision }
        : null;
}

async function markViewed(user, payload, res, releases) {
    if (!Array.isArray(payload.ids) || payload.ids.length < 1 || payload.ids.length > 100) {
        return res.status(400).json({ error: 'Provide one or more update IDs to mark as viewed.' });
    }

    const requested = payload.ids.map(parseViewedReleaseId);
    if (requested.some(item => !item)) {
        return res.status(400).json({ error: 'One or more update IDs are invalid.' });
    }

    const start = releaseStart(user.account);
    const now = Date.now();
    const visible = new Map(releases
        .filter(release => release.active !== false &&
            release.publishedBy !== user.uid &&
            releaseActivityAt(release) >= start &&
            Number(release.startsAt || release.publishedAt || 0) <= now)
        .map(release => [release.id, releaseRevision(release)]));

    const unique = [...new Map(requested.map(item => [item.id, item])).values()];
    const changed = unique.some(item => visible.get(item.id) !== item.revision);
    if (changed) {
        return res.status(409).json({
            error: 'The release list changed while this popup was open. The latest updates have been reloaded.',
            code: 'UPDATES_CHANGED'
        });
    }

    // This operation is deliberately idempotent: a retry after a lost response
    // must succeed even when these exact revisions were already recorded.
    const viewedIds = unique.map(item => item.id + ':' + item.revision);
    const ref = db.ref('/accounts/' + user.uid + '/updatesSeen');
    const transaction = await ref.transaction(current => {
        const seen = new Set(seenUpdateIds(current));
        viewedIds.forEach(id => seen.add(id));
        return [...seen];
    });
    if (!transaction?.committed) throw new Error('The viewed updates could not be saved.');
    return res.status(200).json({ success: true, viewedIds });
}
async function publishRelease(user, payload, res, releases) {
    if (!validReleaseVersion(payload.version) || payload.version.trim().length > 40) {
        return res.status(400).json({ error: 'Enter a valid release version, such as v6.14.0.' });
    }
    const version = payload.version.trim();
    if (releases.some(release => normalizeReleaseVersion(release.version) === normalizeReleaseVersion(version))) {
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
        return res.status(400).json({ error: 'Use a valid GitHub release URL for BSMS-Web-App/web, or leave the field empty.' });
    }

    const startsAtValue = parseReleaseDate(payload.startsOn, releaseTimezoneOffset(payload, 'startsOn'));
    const releaseDateValue = parseReleaseDate(payload.releaseDate, releaseTimezoneOffset(payload, 'releaseDate'));
    if (startsAtValue === null || releaseDateValue === null) {
        return res.status(400).json({ error: 'Enter valid calendar dates for the release schedule.' });
    }

    const { changes: policyChanges, versions: suppliedPolicyVersions } = getPolicyPayload(payload);
    const { updates: policyUpdates, expectedVersions } = await buildPolicyUpdates(user, policyChanges);
    const expectedPolicyVersions = { ...expectedVersions, ...suppliedPolicyVersions };
    const releaseId = db.ref('/updates/releases').push().key;
    const publishedAt = Date.now();
    const release = {
        version,
        content: payload.content.trim(),
        detailsUrl,
        publishedAt,
        startsAt: startsAtValue ?? publishedAt,
        releaseDate: releaseDateValue ?? publishedAt,
        revision: 1,
        publishedBy: user.uid,
        publishedByName: String(user.account.displayName || user.account.username || 'BSMS Web owner'),
        active: true
    };

    await commitUpdateMutation({
        releaseId,
        release,
        policyUpdates,
        expectedPolicyVersions,
        allowCreate: true
    });
    return res.status(201).json({ success: true, release: { ...release, id: releaseId }, changedPolicies: Object.keys(policyUpdates) });
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
                latestReleaseVersion: [...releases].filter(release => release.active !== false)
                    .sort((a, b) => Number(b.publishedAt || 0) - Number(a.publishedAt || 0))[0]?.version || null,
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
            if (!validReleaseVersion(payload.version) || payload.version.trim().length > 40 || typeof payload.content !== 'string' ||
                !payload.content.trim() || payload.content.length > 30000) {
                return res.status(400).json({ error: 'Enter a valid version and release details.' });
            }
            const detailsUrl = payload.detailsUrl == null || payload.detailsUrl === existing.detailsUrl
                ? (existing.detailsUrl || '')
                : validateDetailsUrl(payload.detailsUrl);
            if (detailsUrl === null) {
                return res.status(400).json({ error: 'Use a valid GitHub release URL, or leave the field empty.' });
            }

            const startsAtValue = parseReleaseDate(payload.startsOn, releaseTimezoneOffset(payload, 'startsOn'));
            const releaseDateValue = parseReleaseDate(payload.releaseDate, releaseTimezoneOffset(payload, 'releaseDate'));
            if (startsAtValue === null || releaseDateValue === null) {
                return res.status(400).json({ error: 'Enter valid calendar dates for the release schedule.' });
            }

            const { changes: policyChanges, versions: suppliedPolicyVersions } = getPolicyPayload(payload);
            const { updates: policyUpdates, expectedVersions } = await buildPolicyUpdates(user, policyChanges);
            const expectedPolicyVersions = { ...expectedVersions, ...suppliedPolicyVersions };
            const updated = {
                ...existing,
                version: payload.version.trim(),
                content: payload.content.trim(),
                detailsUrl,
                startsAt: startsAtValue ?? existing.startsAt ?? existing.publishedAt,
                releaseDate: releaseDateValue ?? existing.releaseDate ?? existing.publishedAt
            };
            const releaseChanged = updated.version !== existing.version ||
                updated.content !== existing.content || updated.detailsUrl !== (existing.detailsUrl || '') ||
                updated.startsAt !== (existing.startsAt ?? existing.publishedAt) ||
                updated.releaseDate !== (existing.releaseDate ?? existing.publishedAt);
            if (releaseChanged && releaseRevision(existing) >= 1000000000) {
                return res.status(409).json({ error: 'This release has reached its revision limit and cannot be changed further.' });
            }
            if (releaseChanged) {
                updated.revision = (releaseRevision(existing)) + 1;
                updated.editedAt = Date.now();
                updated.editedBy = user.uid;
            }

            await commitUpdateMutation({
                releaseId: id,
                release: updated,
                policyUpdates,
                expectedPolicyVersions,
                expectedReleaseRevision: releaseRevision(existing)
            });
            return res.status(200).json({ success: true, release: { ...updated, id }, changed: releaseChanged, changedPolicies: Object.keys(policyUpdates) });
        }
        if (action === 'delete') {
            if (!await requireOwner(user, res, policyBundle.versions)) return;
            const id = typeof payload.id === 'string' ? payload.id : '';
            if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return res.status(400).json({ error: 'Invalid release ID.' });
            const ref = db.ref('/updates/releases/' + id);
            const snap = await ref.once('value');
            const existing = snap.val();
            if (!existing) return res.status(404).json({ error: 'That release no longer exists.' });
            await commitUpdateMutation({
                releaseId: id,
                release: null,
                expectedReleaseRevision: releaseRevision(existing)
            });
            return res.status(200).json({ success: true, deletedId: id });
        }
        return res.status(400).json({ error: 'Unknown updates action.' });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Request failed:', error?.message || error);
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500
            ? error.status
            : 503;
        return res.status(status).json({
            error: status === 503
                ? 'The updates service is temporarily unavailable. Please try again.'
                : error.message
        });
    }
}
