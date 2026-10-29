/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db, requestMacApi } from './db.js';
import { LEGAL_POLICY_VERSIONS, getLegalPolicyStatus } from './legal-policy.js';

async function getAuthenticatedUser(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 300) return null;

    const result = await requestMacApi(
        'GET',
        '/v1/auth/session?sessionId=' + encodeURIComponent(sessionId)
    );

    if (!result?.uid) return null;

    // Always read the current account record from the same database used for
    // legal acceptance writes. Do not rely on an account snapshot returned by
    // the session service, which may be stale immediately after an update.
    const accountSnapshot = await db.ref('/accounts/' + result.uid).once('value');
    const account = accountSnapshot.val();
    if (!account || account.account_status === 'deleted') return null;

    return { uid: result.uid, account };
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    if (!db) return res.status(503).json({ error: 'The database is unavailable.' });

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = req.query.action || payload.action;
    const sessionId = req.headers['x-session-id'];

    try {
        const user = await getAuthenticatedUser(sessionId);
        if (!user) return res.status(401).json({ error: 'Sign in is required.' });

        if (user.account.account_status === 'banned') {
            return res.status(403).json({ error: 'This account is banned.', account_status: 'banned' });
        }

        if (action === 'status') {
            const status = getLegalPolicyStatus(user.account);
            return res.status(200).json({
                success: true,
                versions: LEGAL_POLICY_VERSIONS,
                policies: status.policies,
                needsAcceptance: status.needsAcceptance
            });
        }

        if (action === 'accept') {
            const status = getLegalPolicyStatus(user.account);
            const termsAccepted = payload.termsAccepted === true;
            const privacyAccepted = payload.privacyAccepted === true;

            if (!payload.versions ||
                payload.versions.terms !== LEGAL_POLICY_VERSIONS.terms ||
                payload.versions.privacy !== LEGAL_POLICY_VERSIONS.privacy
            ) {
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
                updates[key] = {
                    version: LEGAL_POLICY_VERSIONS[key],
                    acceptedAt: now
                };
                acceptedPolicies.push(key);
            }

            if (!acceptedPolicies.length) {
                return res.status(200).json({ success: true, needsAcceptance: false, acceptedPolicies: [] });
            }

            await db.ref('/accounts/' + user.uid + '/legalAcceptance').update(updates);

            // Confirm the versions were persisted before reporting success.
            const savedSnapshot = await db.ref('/accounts/' + user.uid).once('value');
            const savedAccount = savedSnapshot.val() || {};
            const savedStatus = getLegalPolicyStatus(savedAccount);
            if (savedStatus.needsAcceptance) {
                throw new Error('Your acknowledgments could not be verified after saving. Please try again.');
            }

            try {
                const historyRef = db.ref('/accounts/' + user.uid + '/legalAcceptanceHistory').push();
                await historyRef.set({
                    policies: acceptedPolicies,
                    versions: Object.fromEntries(acceptedPolicies.map(key => [key, LEGAL_POLICY_VERSIONS[key]])),
                    acceptedAt: now
                });
            } catch (historyError) {
                console.error('[BSMS Web :: Legal] Acceptance history could not be recorded:', historyError?.message || historyError);
            }

            return res.status(200).json({
                success: true,
                needsAcceptance: false,
                acceptedPolicies,
                acceptedAt: now
            });
        }

        return res.status(400).json({ error: 'Unknown legal action.' });
    } catch (error) {
        console.error('[BSMS Web :: Legal] Request failed:', error?.message || error);
        return res.status(503).json({ error: 'Legal policy status is temporarily unavailable. Please try again.' });
    }
}
