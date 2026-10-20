
<div align="center">
  <img src="img/icon.png" alt="BSMS Web Logo" width="125" height="125">

  <h1>BSMS Web</h1>

  <p><strong>A web platform for communication, gaming, and account management.</strong></p>

  <p>A centralized digital experience featuring messaging, user accounts, interactive games, and useful web tools.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
  [![Express](https://img.shields.io/badge/Express-5.x-black?logo=express)](https://expressjs.com/)
  [![Firebase](https://img.shields.io/badge/Database-Firebase%20RTDB-FFCA28?logo=firebase)](https://firebase.google.com/)
  [![Vercel](https://img.shields.io/badge/Hosting-Vercel-black?logo=vercel)](https://vercel.com/)

  [Website](https://bsms-web.vercel.app) · [Report a Bug](https://github.com/BSMS-Web-App/web/issues) · [View Releases](https://github.com/BSMS-Web-App/web/releases)
</div>

---

## About

**BSMS Web** is a full-stack web application that brings communication, account management, gaming, and other interactive features together in one platform.

The project combines an HTML, CSS, and JavaScript frontend with a Node.js backend and Firebase Realtime Database. It is hosted on Vercel and maintained as an open-source project.

## Features

- **User Accounts** — Account registration, authentication, and profile management.
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
| Firebase Realtime Database | Persistent application data |
| Firebase Admin SDK | Server-side Firebase integration |
| Glin Profanity | Profanity detection and moderation |
| Vercel | Hosting and deployment |

The frontend does not require a separate client-side build step in the current project configuration.

## Getting Started

### Prerequisites

Before running BSMS Web locally, install:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) and npm
- A Firebase project with Realtime Database enabled and appropriate server-side credentials

Use a Node.js version supported by the project's dependencies and deployment environment.

### 1. Clone the repository

```bash
git clone https://github.com/BSMS-Web-App/web.git
cd BSMS-Web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file from the example:

```bash
cp .env.example .env
```

Open `.env` and replace the placeholder values with the appropriate configuration for your Firebase project.

| Variable | Description |
| --- | --- |
| `PORT` | Local Express server port; defaults to `3000`. |
| `FIREBASE_PROJECT_ID` | Firebase project ID. |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email. |
| `FIREBASE_PRIVATE_KEY` | Private key used for server-side Firebase authentication. |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL. |

Make sure `.env` is excluded from version control. Never commit real credentials, private keys, or service account files.

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The `npm start` command is also available to start the Express server.

## Project Structure

The repository contains the frontend, backend, API handlers, and supporting assets.

```text
BSMS-Web/
├── admin/                 # Administrative interface
├── api/                   # Backend API handlers
├── img/                   # Images and visual assets
├── js/                    # Shared JavaScript files
├── index.html             # Main landing page
├── accounts.html          # Account interface
├── chat.html              # Messaging interface
├── countdown.html         # Countdown page
├── g.html                 # Games interface
├── users.html             # User profiles
├── server.js              # Express server
├── package.json           # Dependencies and npm scripts
├── vercel.json            # Vercel routing configuration
├── .env.example           # Example environment configuration
├── SECURITY.md            # Security reporting policy
├── CHANGELOG.md           # Project changelog
└── LICENSE                # MIT license
```

*This is a simplified overview, not an exhaustive inventory of every repository file.*

## Backend and API

The backend uses Express for local development and supports deployment through Vercel's serverless infrastructure.

The API provides account management, messaging, moderation, game save synchronization, link previews, and administrative functionality.

| Endpoint | Purpose |
| --- | --- |
| `/api/auth` | Account authentication and related account operations |
| `/api/admin` | Administrative operations and moderation |
| `/api/chat` | Messaging operations |
| `/api/games/saves` | Cloud game save retrieval and synchronization |
| `/api/link-preview` | Link preview generation and metadata retrieval |
| `/api/bug-report` | Bug report submission |
| `/api/export-data` | User data export |
| `/api/profanity-filter` | Profanity analysis and moderation |

Request methods, parameters, and authentication requirements depend on each endpoint's implementation. Refer to the corresponding handler files for details.

## Deployment

BSMS Web uses Vercel for hosting and supports local development through Express.

To deploy the project:

1. Import the repository into [Vercel](https://vercel.com/).
2. Configure the required environment variables in the Vercel project settings.
3. Confirm that Firebase credentials and database access are configured correctly.
4. Deploy the intended production branch.
5. Verify the application, API endpoints, and database connectivity after deployment.

Keep production credentials in Vercel's environment variable settings rather than committing them to the repository.

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

BSMS Web is distributed under the [MIT License](LICENSE).

---

<div align="center">
  <p>Crafted with precision by <strong>Jellyfish Jelly</strong> & contributors.</p>
  <p>Copyright © 2026 Jellyfish Jelly. All rights reserved.</p>
</div>
