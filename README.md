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

  [Website](https://bsms-web.com) · [Report a Bug](https://bsms-web.com/support?type=bug) · [View Releases](https://github.com/BSMS-Web-App/web/releases)
</div>

---

## About

**BSMS Web** is a full-stack web application that brings communication, account management, gaming, and other interactive features together in one platform.

The production website is available at [bsms-web.com](https://bsms-web.com). Vercel serves the website frontend. The Node.js and Express application API runs as a separate service, while persistent application data and uploaded media are hosted by services on a Mac mini. The application API accesses the private database API through authenticated server-to-server requests routed over Cloudflare Tunnel.

## Features

- **Accounts** — Account registration, authentication, sessions, and profile management.
- **Chat** — Direct messages, group conversations, presence, media attachments, and voice calling.
- **Voice Chat (Beta)** — Direct-message and group audio calls powered by self-hosted LiveKit and WebRTC.
- **Games** — Browser-based games and cloud save synchronization.
- **Countdowns and Events** — Countdown pages and event-related content.
- **Administrative Tools** — Account administration, announcements, and moderation tools.
- **Content Moderation** — Text checks using Glin Profanity and, when configured, OpenAI's Moderation API.
- **Community Reporting and Support** — Bug reports, feature requests, and support conversations.
- **Privacy Information** — Dedicated privacy and legal-information pages.
- **Responsive Interface** — A web experience designed for desktop and mobile browsers.

## Documentation

| Document | Description |
| --- | --- |
| [Contributing Guide](CONTRIBUTING.md) | Branching rules, development workflow, and pull-request expectations. |
| [Changelog](CHANGELOG.md) | A chronological record of notable updates, improvements, and changes to BSMS Web. |
| [Security Policy](SECURITY.md) | Instructions for reporting security vulnerabilities responsibly. |
| [Mac Database and Media API](mac-api/README.md) | Database API architecture, access model, persistence, and operations. |
| [Voice Infrastructure](mac-api/voice/README.md) | LiveKit setup, network requirements, environment variables, and voice-call testing. |
| [License](LICENSE) | The license governing the project's source code. |
| [GitHub Releases](https://github.com/BSMS-Web-App/web/releases) | Published releases and their detailed release notes. |
| [Issues](https://github.com/BSMS-Web-App/web/issues) | Report bugs, request features, and track known issues. |
| [Pull Requests](https://github.com/BSMS-Web-App/web/pulls) | Review proposed changes and contribute improvements. |

## Technology Stack

| Technology | Purpose |
| --- | --- |
| HTML, CSS, JavaScript | Browser frontend, page structure, styling, and client-side interactions |
| Node.js | JavaScript runtime for the application API and supporting services |
| Express 5 | Application API routing, middleware, and static page serving |
| LiveKit Server SDK | Server-side creation of LiveKit access tokens and room management |
| LiveKit Client SDK | Browser-side connection to voice rooms; loaded from jsDelivr |
| LiveKit Server | Self-hosted real-time media server, deployed with Docker Compose |
| WebRTC | Real-time audio transport between voice-call participants |
| Mac-hosted JSON database API | Persistent application data, atomic updates, snapshots, and journaled writes |
| Cloudflare Tunnel | Connectivity between public hostnames and private Mac-hosted services |
| Cloudflare | DNS and tunnel infrastructure |
| Vercel | Website frontend hosting and deployment |
| Glin Profanity | Local profanity detection, including obfuscated text and multilingual checks |
| OpenAI Moderation API | Optional server-side text moderation using the `omni-moderation-latest` model |

The repository's root `package.json` includes Express, Glin Profanity, Express Rate Limit, ipaddr.js, dotenv, and the LiveKit Server SDK. The Mac database API has its own package manifest. The browser voice client is loaded separately from jsDelivr rather than bundled into the root package.

## Production Architecture

- **Website:** Vercel deploys and serves the production frontend at `https://bsms-web.com`.
- **Application API:** Node.js and Express handle authentication, chat, moderation, voice-call orchestration, reports, announcements, and other API routes. The browser API origin is configured in `js/api-origin.js`.
- **Database API:** The Mac mini hosts the persistent JSON database API on `127.0.0.1:4901`. Its public API hostname is `https://api.bsms-web.com`, routed through Cloudflare Tunnel.
- **Media:** The Mac mini stores uploaded media. Public media is served through `https://media.bsms-web.com`; browser uploads use a short-lived signed upload-ticket flow.
- **Persistence:** Database changes are stored in a JSON snapshot and a JSON Lines write-ahead journal. Media files are stored separately on persistent local storage.
- **Voice:** The Express API authenticates participants and issues short-lived, room-scoped LiveKit tokens. The self-hosted LiveKit server handles WebRTC audio. The signaling/WebSocket endpoint is routed through the voice hostname; WebRTC media ports require direct network reachability and do not travel through an ordinary Cloudflare Tunnel HTTP route.
- **Secrets:** Database, OpenAI, and LiveKit credentials belong only in server-side environment variables or private service configuration. Never put API keys in browser JavaScript, public Vercel variables, documentation, or committed files.
- **Availability:** The Mac-hosted database, media, application API, and LiveKit services must remain online for the features that depend on them. Maintain verified backups of the database snapshot, journal, and media directory.

The database API is bound to loopback and is reached through the configured tunnel. Do not expose its local port directly to the public internet.

## Content Moderation

Text moderation is centralized in `api/moderation.js` and is called by the chat, announcement, report, support, and profanity-filter API handlers.

The moderation pipeline combines two providers:

1. **Glin Profanity** runs locally in the application API. Its configuration enables multilingual checks, Unicode normalization, leetspeak detection, severity information, and result caching.
2. **OpenAI Moderation** is an optional external provider. When `OPENAI_API_KEY` is present in the application API's private environment, the server sends text to `https://api.openai.com/v1/moderations` using the `omni-moderation-latest` model.

A submission is blocked when either available provider flags it. If one provider is unavailable, the other provider's result is used. If neither provider can run, the moderation function rejects the content rather than allowing unchecked text. OpenAI moderation is not active unless the server-side API key is configured.

**Privacy and scope:** When OpenAI moderation is enabled, the text submitted for moderation is transmitted from the server to OpenAI's Moderation API. Do not place the OpenAI key in frontend code or expose it to the browser. The current moderation pipeline checks text fields; it does not inspect the contents of uploaded images, audio, video, or other attachments.

The moderation model and provider behavior may change over time. Keep the configured API key private, monitor provider availability, and test moderation changes before deploying them.

## Voice Chat

Voice calling is currently labeled beta. Direct-message calls use an incoming-call flow: the caller waits while the recipient answers, and the call becomes active only after acceptance. Group-call behavior is managed by the same voice API but uses the group conversation's membership.

The voice API checks authenticated sessions and conversation membership before issuing room access. LiveKit handles audio transport; the application API handles call invitations, call state, participant authorization, and room-token issuance.

The LiveKit readiness check verifies that the server API can be reached. It does **not** prove that the router, firewall, or UDP media path is working. Test calls with at least two accounts and across different network types before treating voice calling as fully reliable. See the [Voice Infrastructure Guide](mac-api/voice/README.md) for setup and network requirements.

## Domains and Routes

- Production website: `https://bsms-web.com`
- Chat page: `https://bsms-web.com/chat`
- Chat aliases: `/c` and `/rooms` redirect to `/chat`.
- Database API: `https://api.bsms-web.com`
- Media: `https://media.bsms-web.com`

Chat is a route on the main website, not a separate `chat.bsms-web.com` subdomain. The repository's redirects and application routes use URL paths. DNS records and domain assignments are managed in the hosting and DNS provider dashboards.

## Environment Configuration

The repository includes example environment files to document configuration names. They are templates only; replace placeholder values locally and keep real environment files out of Git.

Common server-side settings include:

- `BSMS_WEB_API_URL` and `BSMS_WEB_API_KEY` — connection to the private Mac database API.
- `OPENAI_API_KEY` — optional OpenAI moderation provider key.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` — application API connection to the LiveKit service.
- `APP_ALLOWED_ORIGINS` — allowlisted browser origins for the application API.

Keep production, development, and preview credentials separate. Never expose private keys through frontend variables or browser requests. See the service-specific documentation for the full configuration and operational requirements.

## Development and Contributions

Development branches and preview deployments are used to test changes before they are merged into the production branch. Collaborators should work only on their assigned development branch. Preview deployments may use separate frontend or application API hostnames; those are development infrastructure, not production website addresses.

Before contributing:

1. Review existing issues and pull requests to avoid duplicating work.
2. Explain the proposed change and its purpose.
3. Keep changes focused and avoid unrelated modifications.
4. Test affected functionality before submitting a pull request.
5. Never include credentials, private user information, database exports, or other secrets.

For security vulnerabilities, follow the instructions in [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Security

BSMS Web handles accounts, conversations, and other user-related data. Keep credentials server-side, restrict access to internal APIs, maintain verified backups, and report potential vulnerabilities privately using the process described in [SECURITY.md](SECURITY.md).

## License

BSMS Web is distributed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).

---

<div align="center">
  <p>Crafted with precision by <strong>Jellyfish Jelly</strong> & contributors.</p>
  <p>Copyright © 2026 Jellyfish Jelly. All rights reserved.</p>
</div>
