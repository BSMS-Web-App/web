/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { db } from './db.js';

export const LEGAL_POLICY_VERSIONS = Object.freeze({
    terms: '1.0.1',
    privacy: '1.0.2'
});

export function getLegalPolicyStatus(account = {}, versions = LEGAL_POLICY_VERSIONS) {
    const accepted = account.legalAcceptance || {};
    const policies = {};

    for (const key of Object.keys(versions)) {
        const currentVersion = versions[key];
        const record = accepted[key] || {};
        const acceptedVersion = typeof record.version === 'string' ? record.version : null;
        const required = acceptedVersion !== currentVersion;

        policies[key] = {
            version: currentVersion,
            acceptedVersion,
            acceptedAt: record.acceptedAt || null,
            required,
            updated: Boolean(acceptedVersion && acceptedVersion !== currentVersion),
            firstAcknowledgment: !acceptedVersion
        };
    }

    return {
        policies,
        needsAcceptance: Object.values(policies).some(policy => policy.required)
    };
}

export async function getCurrentLegalPolicyVersions() {
    const snapshot = await db.ref('/updates/policies').once('value');
    const stored = snapshot.val() || {};
    return {
        terms: typeof stored.terms?.version === 'string' && stored.terms.version
            ? stored.terms.version : LEGAL_POLICY_VERSIONS.terms,
        privacy: typeof stored.privacy?.version === 'string' && stored.privacy.version
            ? stored.privacy.version : LEGAL_POLICY_VERSIONS.privacy
    };
}

export async function legalAcceptanceRequired(account = {}) {
    try {
        const versions = await getCurrentLegalPolicyVersions();
        return getLegalPolicyStatus(account, versions).needsAcceptance;
    } catch (error) {
        console.error('[BSMS Web :: Legal] Could not load current policy versions:', error?.message || error);
        // Fail closed if the current policy versions cannot be verified.
        return true;
    }
}
