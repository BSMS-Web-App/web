/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: AGPL-3.0-only
 */
(() => {
    'use strict';
    const SOURCE_URL = 'https://raw.githubusercontent.com/BSMS-Web-App/web/main/CHANGELOG.md';
    const container = document.getElementById('changelogReleases');
    const status = document.getElementById('changelogStatus');

    function parseReleases(markdown) {
        const releases = [];
        let current = null;
        for (const line of String(markdown || '').split(/\r?\n/)) {
            const heading = line.match(/^##\s+(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/);
            if (heading) {
                current = { version: heading[1], topics: [], url: '' };
                releases.push(current);
                continue;
            }
            if (!current) continue;
            const topic = line.match(/^\s*-\s+(.+?)\s*$/);
            if (topic) current.topics.push(topic[1]);
            const link = line.match(/\[View the full changelog for this release\]\((https?:\/\/[^)]+)\)/i);
            if (link) current.url = link[1];
        }
        return releases;
    }

    function render(releases) {
        container.replaceChildren();
        for (const release of releases) {
            const article = document.createElement('article');
            article.className = 'changelog-release';
            const header = document.createElement('header');
            header.className = 'release-header';
            const heading = document.createElement('h2');
            heading.textContent = release.version;
            header.appendChild(heading);
            const list = document.createElement('ul');
            for (const topic of release.topics) {
                const item = document.createElement('li');
                item.textContent = topic;
                list.appendChild(item);
            }
            article.append(header, list);
            if (release.url) {
                const link = document.createElement('a');
                link.className = 'release-link';
                link.href = release.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.textContent = 'View the full changelog for this release';
                article.appendChild(link);
            }
            container.appendChild(article);
        }
    }

    async function load() {
        try {
            const response = await fetch(SOURCE_URL, { cache: 'no-store' });
            if (!response.ok) throw new Error('GitHub returned HTTP ' + response.status + '.');
            const releases = parseReleases(await response.text());
            if (!releases.length) throw new Error('No release entries were found in CHANGELOG.md.');
            render(releases);
            status.textContent = 'Showing ' + releases.length + ' stable releases.';
        } catch (error) {
            status.textContent = 'The changelog could not be loaded right now. Please try again later.';
            status.classList.add('error');
            console.error('[BSMS Web :: Changelog] Load failed:', error);
        }
    }
    load();
})();
