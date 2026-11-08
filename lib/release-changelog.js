/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

// Existing accounts receive this release as their first in-app update.
// Keep this aligned with the latest release available when the popup launches.
export const UPDATE_POPUP_ROLLOUT_VERSION = 'v6.10.0';

export function normalizeReleaseVersion(value) {
    const match = String(value || '').trim().match(/^v?(\\d+)\\.(\\d+)\\.(\\d+)$/);
    return match ? `v${match[1]}.${match[2]}.${match[3]}` : null;
}

export function compareReleaseVersions(left, right) {
    const a = normalizeReleaseVersion(left);
    const b = normalizeReleaseVersion(right);
    if (!a || !b) return 0;

    const av = a.slice(1).split('.').map(Number);
    const bv = b.slice(1).split('.').map(Number);

    for (let index = 0; index < 3; index += 1) {
        if (av[index] !== bv[index]) return av[index] > bv[index] ? 1 : -1;
    }
    return 0;
}

export function parseReleaseChangelog(markdown = readFileSync(CHANGELOG_PATH, 'utf8')) {
    const headings = [...markdown.matchAll(/^##\\s+(v?\\d+\\.\\d+\\.\\d+)\\s*$/gm)];

    return headings.map((heading, index) => {
        const start = heading.index + heading[0].length;
        const end = headings[index + 1]?.index ?? markdown.length;
        const section = markdown.slice(start, end);
        const items = section
            .split(/\\r?\\n/)
            .filter(line => /^\\s*-\\s+/.test(line))
            .map(line => line.replace(/^\\s*-\\s+/, '').trim())
            .filter(Boolean);
        const link = section.match(/\\[View the full changelog for this release\\]\\((https:\\/\\/github\\.com\\/BSMS-Web-App\\/web\\/releases\\/tag\\/[^)]+)\\)/);

        return {
            version: normalizeReleaseVersion(heading[1]),
            items,
            detailsUrl: link ? link[1] : null
        };
    }).filter(release => release.version);
}

export function getLatestReleaseVersion() {
    return parseReleaseChangelog()[0]?.version || 'v0.0.0';
}

export function getLegacyAccountSeenThrough(releases = parseReleaseChangelog()) {
    const rolloutIndex = releases.findIndex(release => release.version === UPDATE_POPUP_ROLLOUT_VERSION);
    if (rolloutIndex < 0) return releases.at(-1)?.version || 'v0.0.0';
    return releases[rolloutIndex + 1]?.version || 'v0.0.0';
}
