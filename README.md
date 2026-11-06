<div align="center">
  <img src="img/icon.png" alt="BSMS Web Logo" width="125" height="125">

  <h1>BSMS Web</h1>

  <p><strong>A web platform for communication, gaming, and account management.</strong></p>

  <p>A centralized digital experience featuring messaging, user accounts, interactive games, and useful web tools.</p>

  [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
  [![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
  [![Express](https://img.shields.io/badge/Express-5.x-black?logo=express)](https://expressjs.com/)
  [![Database](https://img.shields.io/badge/Database-Self--Hosted-6A5ACD)](https://bsms-web.com)
  [![Hosting](https://img.shields.io/badge/Hosting-Vercel-black?logo=vercel)](https://vercel.com/)

  [Website](https://bsms-web.com) · [Report a Bug](https://github.com/BSMS-Web-App/web/issues) · [View Releases](https://github.com/BSMS-Web-App/web/releases)
</div>

---

## About

**BSMS Web** is a full-stack web application that brings communication, account management, gaming, and other interactive features together in one platform.

The production website is available at [bsms-web.com](https://bsms-web.com). Its frontend is deployed through Vercel, while application services use Node.js and Express. Persistent application data is stored by the Mac-hosted JSON database API and accessed through authenticated server-to-server requests over Cloudflare Tunnel. Media is served from the Mac-hosted media service.

## Features

- **Accounts** — Account registration, authentication, and profile management.
- **Chat** — Direct messages, group conversations, and interactive messaging features.
- **Games** — Browser-based games and cloud save synchronization.
- **Countdowns** — A dedicated countdown page.
- **Administrative Tools** — Account and moderation management.
- **Community Reporting** — Tools for submitting bug reports and feedback.
- **Privacy Information** — A dedicated page explaining privacy-related information.
- **Responsive Interface** — A web experience designed for desktop and mobile browsers.

## Documentation

| Document | Description |
| --- | --- |
| [Changelog](CHANGELOG.md) | A chronological record of notable updates, improvements, and changes to BSMS Web. |
| [Security Policy](SECURITY.md) | Instructions for reporting security vulnerabilities responsibly. |
| [License](LICENSE) | The license governing the project's source code. |
| [GitHub Releases](https://github.com/BSMS-Web-App/web/releases) | Published releases and their detailed release notes. |
| [Issues](https://github.com/BSMS-Web-App/web/issues) | Report bugs, request features, and track known issues. |
| [Pull Requests](https://github.com/BSMS-Web-App/web/pulls) | Review proposed changes and contribute improvements. |

## Technology Stack

| Technology | Purpose |
| --- | --- |
| HTML, CSS, JavaScript | Frontend and user interface |
| Node.js | JavaScript runtime |
| Express | Application API and routing |
| Mac-hosted JSON database API | Persistent application data, snapshots, and journaled writes |
| Cloudflare Tunnel | Secure connectivity to Mac-hosted application services |
| Cloudflare | Public DNS and tunnel connectivity |
| Vercel | Frontend hosting and deployment |
| Glin Profanity | Profanity detection and moderation |

## Production Architecture

- **Website:** Vercel deploys and serves the production frontend at `https://bsms-web.com`.
- **Application API:** Node.js and Express handle application API routes. The browser API origin is configured in `js/api-origin.js`; production deployments must use the production application API hostname.
- **Database API:** The Mac mini hosts the persistent JSON database API on `127.0.0.1:4901`. Its public API hostname is `https://api.bsms-web.com`, routed through Cloudflare Tunnel.
- **Media:** The Mac mini stores uploaded media. Public media is served through `https://media.bsms-web.com`; browser uploads use the signed upload-ticket flow.
- **Persistence:** Database changes are stored in a JSON snapshot and write-ahead journal. Media files are stored separately on persistent local storage.
- **Secrets:** Database API credentials belong only in server-side environment variables. Never put API keys in browser JavaScript, public Vercel variables, documentation, or committed files.
- **Availability:** The Mac-hosted database and media services must remain online for features that depend on them. Maintain verified backups of the database snapshot, journal, and media directory.

The database API is bound to loopback and is reached through the configured tunnel. Do not expose its local port directly to the public internet.

## Domains and Routes

- Production website: `https://bsms-web.com`
- Chat page: `https://bsms-web.com/chat`
- Chat aliases: `/c` and `/rooms` redirect to `/chat`.
- Database API: `https://api.bsms-web.com`
- Media: `https://media.bsms-web.com`

Chat is a route on the main website, not a separate `chat.bsms-web.com` subdomain. The repository's redirects and application routes use URL paths. DNS records and domain assignments are managed in the hosting and DNS provider dashboards.

## Development and Contributions

Development branches and preview deployments are used to test changes before they are merged into the production branch. A preview deployment may use separate frontend or application API hostnames, but those are development infrastructure and are not production website addresses.

Before contributing:

1. Review existing issues and pull requests to avoid duplicating work.
2. Explain the proposed change and its purpose.
3. Keep changes focused and avoid unrelated modifications.
4. Test affected functionality before submitting a pull request.
5. Never include credentials, private user information, database exports, or other secrets.

For security vulnerabilities, follow the instructions in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Security

BSMS Web handles accounts, conversations, and other user-related data. Keep credentials server-side, restrict access to internal APIs, and report potential vulnerabilities privately using the process described in [SECURITY.md](SECURITY.md).

## License

BSMS Web is distributed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

---

<div align="center">
  <p>Crafted with precision by <strong>Jellyfish Jelly</strong> & contributors.</p>
  <p>Copyright © 2026 Jellyfish Jelly. All rights reserved.</p>
</div>
