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

The project combines an HTML, CSS, and JavaScript frontend with a Node.js backend. Vercel serves the static website, while the application API and persistent JSON database run on an always-on Mac mini. Browser API requests travel directly to the Mac through Cloudflare Tunnel rather than passing through Vercel Functions.

## Features

- **Accounts** — Account registration, authentication, and profile management.
- **Chat** — Direct messages, group conversations, and interactive messaging features.
- **Games** — Browser-based games and cloud save synchronization.
- **Countdowns** — A dedicated countdown page.
- **Administrative Tools** — Account and moderation management.
- **Community Reporting** — Tools for submitting bug reports and feedback.
- **Privacy Information** — A dedicated page explaining privacy-related information.
- **Responsive Interface** — A web experience designed for desktop and mobile browsers.

*Feature availability may vary between production, development, and preview deployments.*

## Documentation

Use the following resources to learn more about BSMS Web, its history, and how to contribute.

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
| Node.js | JavaScript runtime for the backend |
| Express | HTTP server and application routing |
| Mac-hosted JSON database API | Persistent application data, snapshots, and journaled writes |
| Cloudflare Tunnel | Direct browser-to-Mac application API and media connectivity |
| Glin Profanity | Profanity detection and moderation |
| Vercel | Hosting and deployment |

## Hosting and API Architecture

- Vercel is configured to build and serve only the static HTML, CSS, JavaScript, and image assets. The deployment does not build Vercel Functions.
- The browser rewrites `/api/*`, `/games/saves`, and `/raw/*` requests to the branch-specific Mac application API hostname using `js/api-origin.js`.
- The Express application API runs on the Mac mini and uses the existing handlers in `api/`. It connects to the private Mac database API through `BSMS_WEB_API_URL` and `BSMS_WEB_API_KEY`.
- The database API listens on loopback only. Cloudflare Tunnel exposes the application API and signed media endpoints without exposing the database API key to browser code.
- Keep development and production database files, media directories, API keys, and service ports separate. Keep the Mac online and maintain tested backups.
- The root `.env.example` documents the dev2 application API settings. `mac-api/.env.example` documents database-service settings. Never commit real `.env` files, API keys, or database exports.
- The dev2 browser API hostname is `https://app-api-dev2.bsms-web.com`; its media hostname is `https://media-dev2.bsms-web.com`. Production remains unchanged until a separate production migration is approved.

## Contributing

Contributions, bug reports, and suggestions are welcome.

Before contributing:

1. Review existing issues and pull requests to avoid duplicating work.
2. Explain the proposed change and its purpose.
3. Keep changes focused and avoid unrelated modifications.
4. Test affected functionality before submitting a pull request.
5. Never include credentials, private user information, or other secrets in a contribution.

For security vulnerabilities, follow the instructions in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Security

Security matters because BSMS Web handles accounts, conversations, and other user-related data.

If you discover a potential vulnerability, **report it privately** using the process described in [SECURITY.md](SECURITY.md). Do not publish sensitive vulnerability details, private keys, or active credentials in public issues or pull requests.

## License

BSMS Web is distributed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

---

<div align="center">
  <p>Crafted with precision by <strong>Jellyfish Jelly</strong> & contributors.</p>
  <p>Copyright © 2026 Jellyfish Jelly. All rights reserved.</p>
</div>
