/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

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

export function legalAcceptanceRequired(account = {}) {
    const accepted = account.legalAcceptance || {};
    // Content-hash versions are issued by the unified updates service. The page-level
    // gate enforces their current value; this synchronous legacy helper cannot query RTDB.
    const dynamicTerms = typeof accepted.terms?.version === 'string' && accepted.terms.version.startsWith('v-');
    const dynamicPrivacy = typeof accepted.privacy?.version === 'string' && accepted.privacy.version.startsWith('v-');
    if (dynamicTerms && dynamicPrivacy) return false;
    return getLegalPolicyStatus(account).needsAcceptance;
}
