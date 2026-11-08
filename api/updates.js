/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db, requestMacApi } from './db.js';
import { LEGAL_POLICY_VERSIONS, getLegalPolicyStatus } from './legal-policy.js';
import {
    compareReleaseVersions,
    getLegacyAccountSeenThrough,
    parseReleaseChangelog
} from '../lib/release-changelog.js';

async function getAuthenticatedUser(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 300) return null;

    const session = await requestMacApi(
        'GET',
        '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId)
    );

    if (!session?.uid) return null;

    const accountSnapshot = await db.ref('/accounts/' + session.uid).once('value');
    const account = accountSnapshot.val();
    if (!account || account.account_status === 'deleted') return null;

    return { uid: session.uid, account };
}

async function ensureUpdateTracking(user, releases) {
    if (user.account.updatesSeenThrough) return user.account.updatesSeenThrough;

    // One-time migration for accounts that existed before this feature.
    // Their first in-app update is the rollout release; older releases are not
    // dumped into the popup as a historical backlog.
    const baseline = getLegacyAccountSeenThrough(releases);
    await db.ref('/accounts/' + user.uid + '/updatesSeenThrough').set(baseline);
    user.account.updatesSeenThrough = baseline;
    return baseline;
}

function getUnseenReleases(releases, account, seenThrough) {
    const explicitlySeen = new Set(
        Array.isArray(account.updatesSeen) ? account.updatesSeen : []
    );

    return releases.filter(release =>
        compareReleaseVersions(release.version, seenThrough) > 0 &&
        !explicitlySeen.has(release.version)
    );
}

export default async function handler(req, res) {
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

        const releases = parseReleaseChangelog();
        const seenThrough = await ensureUpdateTracking(user, releases);

        if (req.method === 'GET') {
            const unseenReleases = getUnseenReleases(releases, user.account, seenThrough);
            const legal = getLegalPolicyStatus(user.account);

            return res.status(200).json({
                success: true,
                releases: unseenReleases,
                latestReleaseVersion: releases[0]?.version || null,
                legal: {
                    versions: LEGAL_POLICY_VERSIONS,
                    policies: legal.policies,
                    needsAcceptance: legal.needsAcceptance
                }
            });
        }

        const payload = typeof req.body === 'string'
            ? JSON.parse(req.body || '{}')
            : (req.body || {});
        const action = req.query.action || payload.action;

        if (action !== 'mark-viewed') {
            return res.status(400).json({ error: 'Unknown updates action.' });
        }

        if (!Array.isArray(payload.versions) || payload.versions.length < 1 || payload.versions.length > 50) {
            return res.status(400).json({ error: 'Provide one or more release versions to mark as viewed.' });
        }

        const allowedVersions = new Set(releases.map(release => release.version));
        const versions = [...new Set(payload.versions
            .map(version => typeof version === 'string' ? version.trim() : '')
            .filter(version =>
                allowedVersions.has(version) &&
                compareReleaseVersions(version, seenThrough) > 0
            ))];

        if (!versions.length) {
            return res.status(400).json({ error: 'No valid unseen release versions were supplied.' });
        }

        const seenRef = db.ref('/accounts/' + user.uid + '/updatesSeen');
        const transaction = await seenRef.transaction(current => {
            const seen = new Set(Array.isArray(current) ? current : []);
            versions.forEach(version => seen.add(version));
            return [...seen];
        });

        if (!transaction?.committed) {
            throw new Error('The viewed updates could not be saved.');
        }

        return res.status(200).json({
            success: true,
            viewedVersions: versions
        });
    } catch (error) {
        console.error('[BSMS Web :: Updates] Request failed:', error?.message || error);
        return res.status(503).json({ error: 'Updates are temporarily unavailable. Please try again.' });
    }
}
