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

The dev2 deployment uses Vercel for static frontend hosting. Its browser sends application API requests directly to an Express API running on the always-on Mac mini through Cloudflare Tunnel. That application API connects over loopback to the production JSON database API. Dev2 therefore uses production database records and production media; it is not an isolated data environment.

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
| Express | Application API and routing |
| Mac-hosted JSON database API | Persistent application data, snapshots, and journaled writes |
| Cloudflare Tunnel | Public HTTPS connectivity to the Mac-hosted application and media APIs |
| Glin Profanity | Profanity detection and moderation |
| Vercel | Static frontend hosting and deployment |

## Hosting and API Architecture

- Vercel serves the static website. The dev2 deployment does not use Vercel Functions as its application API or database layer.
- The dev2 browser configuration is in `js/api-origin.js`. It sends `/api/*`, `/games/saves`, and `/raw/*` requests to `https://dev-api.bsms-web.com`.
- The dev2 Express application API runs on the Mac mini at `127.0.0.1:4903`, exposed through Cloudflare Tunnel as `dev-api.bsms-web.com`.
- The dev2 application API connects to the production database API at `http://127.0.0.1:4901` using the production API key stored only in the dev2 server's local `.env`. Never put this key in frontend code, a public environment variable, or the repository.
- Dev2 media requests use `https://media.bsms-web.com`, the production media hostname. Dev2 uploads therefore use production media storage.
- The production database API and media service run on the Mac at port `4901`. Their public hostnames are `api.bsms-web.com` and `media.bsms-web.com`, respectively.
- A separate dev2 database/media service remains configured on port `4902` and hostname `dev-media.bsms-web.com`. It is an isolated local service, not the active database or media destination for the current dev2 website.
- Keep the database API bound to loopback. Cloudflare Tunnel should expose only the intended application and media endpoints, not the private database port.
- Changes made through dev2 can affect production accounts, records, and media immediately. Treat dev2 database writes and uploads as production operations.
- The root `.env.example` documents the dev2 application API environment. `mac-api/.env.example` documents the optional isolated dev2 database/media service. Never commit real `.env` files, API keys, database exports, or user data.

## Domains and Routes

BSMS Web chat is a page on the main website, not a separate chat subdomain.

- Main website: `https://bsms-web.com`
- Chat page: `https://bsms-web.com/chat`
- Chat path aliases: `/c` and `/rooms` redirect to `/chat`.
- Dev2 website: `https://bsms-web-dev2.vercel.app`
- Dev2 application API: `https://dev-api.bsms-web.com`
- Production media: `https://media.bsms-web.com`

The repository's application routing uses URL paths. A path such as `/chat` is not a subdomain such as `chat.bsms-web.com`. DNS and hosting-dashboard domain assignments are managed outside this repository.

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
