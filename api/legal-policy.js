/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const LEGAL_POLICY_VERSIONS = Object.freeze({
    terms: '1.0.0',
    privacy: '1.0.0'
});

export function getLegalPolicyStatus(account = {}) {
    const accepted = account.legalAcceptance || {};
    const policies = {};

    for (const key of Object.keys(LEGAL_POLICY_VERSIONS)) {
        const currentVersion = LEGAL_POLICY_VERSIONS[key];
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
    return getLegalPolicyStatus(account).needsAcceptance;
}
