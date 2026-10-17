<div align="center">
  <img src="img/icon.png" alt="BSMS Web Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);">
  <h1>BSMS Web</h1>
  <p><strong>A Next-Generation, Full-Stack Real-Time Communication, Gaming Hub & Account Ecosystem</strong></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Node Version](https://img.shields.io/badge/Node.js-18%2B%20%7C%2020%2B-339933?logo=node.js)](https://nodejs.org)
  [![Express](https://img.shields.io/badge/Backend-Express%205.x-black?logo=express)](https://expressjs.com)
  
  [![Database](https://img.shields.io/badge/Database-Firebase%20RTDB-FFCA28?logo=firebase)](https://firebase.google.com)
  [![Hosting](https://img.shields.io/badge/Hosting-Vercel-000000?logo=vercel)](https://vercel.com)
  [![Profanity Shield](https://img.shields.io/badge/Moderation-Glin--Profanity-red)](https://www.glincker.com/tools/glin-profanity)
</div>

---

> [!NOTE]
> **BSMS Web** is an all-in-one web platform engineered for real-time peer-to-peer messaging, persistent game cloud saves, fine-grained device & account management, and community moderation. It operates on an Express server and serverless Vercel infrastructure.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Frontend Engineering](#frontend-engineering)
- [Backend & Serverless API](#backend--serverless-api)
- [Game Saves Cloud Sync Protocol](#game-saves-cloud-sync-protocol)
- [Firebase Data Architecture](#firebase-data-architecture)
- [Real-Time Messaging Engine](#real-time-messaging-engine)
- [Analytics & Telemetry](#analytics--telemetry)
- [Vercel Deployment & Rewrites](#vercel-deployment--rewrites)
- [Dependencies & Tooling](#dependencies--tooling)
- [Environment Configuration](#local-environment-configuration)
- [Local Development Setup](#local-development-setup)

---

## System Architecture

The BSMS Web architecture decouples client interfaces from persistent storage using a resilient multi-tier pipeline:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT TIER (Browser)                           │
│  index.html │ accounts.html │ chat.html │ g.html │ users.html │ admin/index │
└──────┬──────────────────────┬────────────────────────┬──────────────────────┘
       │                      │                        │
       │ REST / JSON (Fetch)  │ OpenGraph Scraper API  │ Cloud Game Saves Sync
       ▼                      ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVER / BACKEND ROUTING                           │
│                    Node.js Express Server (server.js)                       │
│                        or Vercel Serverless (/api/*)                        │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Firebase Admin SDK
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PERSISTENT DATA STORE (Firebase)                     │
│               Firebase Realtime Database (Accounts, Chat, Saves, Bans)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Engineering

The frontend is constructed using pure modern **HTML5**, **CSS3 (Custom Properties / Flexbox / Grid)**, and **ES2022+ Vanilla JavaScript**. It requires zero client bundlers, ensuring instant page startup, ultra-low memory overhead, and smooth 60fps animations.

### Key Capabilities

- **State Managers**: Encapsulated state modules (`AuthManager`, `ChatManager`, `SidebarManager`, `ProfileHoverManager`, `LinkPreviewManager`, `GroupManager`).
- **Web Audio API Synthesis**: Custom procedural sound synthesizer (`AudioFX`) generating realistic incoming/outgoing message chimes and haptic sounds without external sound asset dependencies.
- **Micro-Themes**: Native theme engine supporting Dark, Light, System, and custom accent tints (`--accent`, `--chat-accent`, `--bg`, `--fg`).
- **Responsive Viewport Support**: Dual-mode layouts transitioning seamlessly from multi-pane desktop layouts to mobile drawer slide-outs (`window.innerWidth <= 768px`).

### Hash Routing Specification

To maintain clean URLs while preserving deep-linking capabilities across single-page modules, BSMS uses specialized client-side hash routes:

| Route Pattern | Target Module | Description |
| :--- | :--- | :--- |
| `/#login` / `/#signup` | `accounts.html` | Opens authentication modal in login or signup mode |
| `/#dm/:cid` | `chat.html` | Opens direct message conversation `:cid` |
| `/#gc/:cid` | `chat.html` | Opens group chat conversation `:cid` |
| `/#user/:username` | `chat.html` | Resolves username, starts/unhides DM, and navigates into chat |
| `/#join/:code` | `chat.html` | Triggers group join confirmation overlay with invite preview |
| `/#:username` | `users.html` | Automatically opens full-screen user profile modal |

---

## Backend & Serverless API

The backend is built around a unified serverless design compatible with both local Express (`server.js`) and Vercel Serverless Functions (`/api/*`):

| Endpoint | Methods | File Handler | Purpose |
| :--- | :---: | :--- | :--- |
| `/api/auth` | `GET`, `POST` | `api/auth.js` | User login, signup, session verification, ban audits, profile updates |
| `/api/chat` | `GET`, `POST` | `api/chat.js` | Realtime chat polling, channel creation, message dispatch, moderation |
| `/api/games/saves` | `GET`, `PUT`, `POST` | `api/games.js` | Cloud game save retrieval and raw JSON serialization persistence |
| `/api/link-preview`| `GET`, `POST` | `api/link-preview.js` | Safe SSR open graph and metadata scraper with timeout protection |
| `/api/admin` | `GET`, `POST` | `api/admin.js` | Administrative registry, device banning, status escalation |
| `/api/bug-report` | `POST` | `api/bug-report.js` | Community bug reporting and diagnostic collection |
| `/api/export-data` | `GET` | `api/export-data.js` | GDPR-compliant user data export archive generator |
| `/api/profanity-filter` | `POST` | `api/profanity-filter.js` | Real-time vulgarity and profanity analysis |

---

## Game Saves Cloud Sync Protocol

The games ecosystem (`/g` or `g.html`) features automated bi-directional cloud synchronization against Firebase:

```
[ Game Runtime / Canvas ] 
          │
          ▼ LocalStorage mutation (setItem hook)
[ Debounce Timer (1000ms) ]
          │
          ▼ PUT /api/games/saves
[ Node/Vercel Backend ] ──► Encodes Raw JSON String ──► Firebase /accounts/{uid}/game_saves_raw
                                                     └──► Sanitized Keys  ──► /accounts/{uid}/game_saves
```

### Persistence Guarantees
- **Character Preservation**: Games often save keys containing dots (`level.1`), slashes (`item/slot`), and dollar signs (`$score`). Because Firebase Realtime Database forbids these characters in key names, saves are stringified into a pure JSON raw dump at `/accounts/{uid}/game_saves_raw`.
- **Sanitized Mirroring**: A sanitized copy replacing forbidden characters with underscores is saved to `/accounts/{uid}/game_saves` for administrative readability.
- **Failover Session Resolution**: The endpoint accepts session identifiers via `X-Session-ID`, `X-UID`, or query parameters (`?sessionId=...&uid=...`), checking active sessions, creator devices, and user keys.

---

## Firebase Data Architecture

BSMS Web structures its Realtime Database in high-performance, indexed subtrees:

```json
{
  "accounts": {
    "UID_USER_123": {
      "username": "example",
      "displayName": "Example User",
      "email": "example+bsmswebapp@gmail.com",
      "avatar": "data:image/jpeg;base64...",
      "role": "admin",
      "verified": true,
      "account_status": "active",
      "sessions": {
        "SESS_ABC_789": { "createdAt": 1729188000, "deviceId": "DEV_FINGERPRINT" }
      },
      "game_saves_raw": "{\"game_save_v1\":{\"highScore\":12500}}"
    }
  },
  "chat": {
    "conversations": {
      "dms": {
        "DM_UID1_UID2": {
          "members": { "UID_1": { "role": "member" }, "UID_2": { "role": "member" } },
          "messages": {
            "MSG_001": {
              "senderUid": "UID_1",
              "content": "Check out https://github.com",
              "timestamp": 1729188050
            }
          }
        }
      },
      "gcs": {
        "GC_COMMUNITY_ROOM": {
          "name": "Example Group",
          "members": { ... },
          "config": { "allowCustomNicknames": true }
        }
      }
    }
  },
  "bans": {
    "devices": {
      "DEV_FINGERPRINT": { "reason": "TOS violation", "expires": 1731780000 }
    }
  }
}
```

---

## Real-Time Messaging Engine

The messaging core provides a seamless social chat experience with built-in moderation:

- **Empty Conversation Filtering**: Empty conversations (conversations without messages) are automatically filtered out from the conversations sidebar to eliminate clutter.
- **Direct Messaging (DMs)**: Instant 1-on-1 private messaging with online status dots, unread badges, and read receipts.
- **Group Chats (GCS)**: Multi-member chat rooms with roles (`owner`, `admin`, `member`), invite codes, custom nicknames, group avatars, and transferrable ownership.
- **Rich Message Types**:
  - Voice messages (in-browser recording and playback with custom audio scrubber)
  - File and image attachments
  - Interactive polls with real-time percentage graphs
  - Reply quotation boxes with jump-to-message navigation
  - Message reactions (quick emoji picker with reaction counts)
- **Moderation Tools**: Delete message by moderator, unsend message, ban user, and profanity filtering.

---

## Analytics & Telemetry

BSMS Web incorporates privacy-focused **Google Analytics 4** telemetry using declarative data attributes:

```html
<!-- Example of Telemetry Hook in HTML -->
<button class="btn" data-ga="chat_send_message">Send</button>
<button class="nav-btn" data-ga="sidebar_tab_click">Tab</button>
```

| Event Category | Action Identifier | Trigger Condition |
| :--- | :--- | :--- |
| **Authentication** | `auth_login_success` | User completes sign-in flow |
| **Authentication** | `auth_signup_success` | New account created |
| **Chat** | `chat_start_dm` | New direct message initiated |
| **Chat** | `chat_join_group` | User joins group via invite card |
| **Games** | `game_cloud_save_sync` | Save file successfully synchronized |
| **Admin** | `admin_ban_device` | Device hash flagged in ban registry |

---

## Vercel Deployment & Rewrites

When hosted on Vercel, `vercel.json` provides edge redirects, serverless route bindings, and clean URLs:

```json
{
  "cleanUrls": true,
  "redirects": [
    { "source": "/account", "destination": "/accounts", "permanent": true },
    { "source": "/c", "destination": "/chat", "permanent": true },
    { "source": "/games", "destination": "/g", "permanent": true },
    { "source": "/rooms", "destination": "/chat", "permanent": true }
  ]
}
```

- **Clean URLs**: Requests for `/chat`, `/accounts`, `/g`, and `/users` resolve directly to their corresponding `.html` files without file extensions in the address bar.
- **Redirects**: Legacy paths (`/c`, `/games`, `/account`) permanently redirect to modern standardized routes.

---

## Dependencies & Tooling

| Package | Version | Purpose |
| :--- | :--- | :--- |
| [`express`](https://www.npmjs.com/package/express) | `^5.3.0` | Node.js HTTP web application server with routing and static serving |
| [`firebase-admin`](https://www.npmjs.com/package/firebase-admin) | `^13.10.0` | Google Cloud Firebase Admin SDK for Realtime Database authorization |
| [`glin-profanity`](https://www.npmjs.com/package/glin-profanity) | `^1.0.2` | High-accuracy multilingual profanity and vulgarity detection engine |

---

## Local Environment Configuration

Create a `.env` file in the project root with the following variables:

```ini
# Port Configuration
PORT=3000

# Firebase Service Account Credentials
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgk...YOUR_KEY...\n-----END PRIVATE KEY-----\n"
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

> [!WARNING]
> Keep `FIREBASE_PRIVATE_KEY` strictly confidential. Never commit raw credentials to version control.

---

## Local Development Setup

Follow these simple steps to run BSMS Web locally:

```bash
# 1. Clone the repository
git clone https://github.com/jellyfishjelly/bsms-web.git
cd bsms-web

# 2. Install production dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Launch development server on http://localhost:3000
npm run dev
```

### Useful Shortcuts
- <kbd>Esc</kbd> — Dismiss open dialogs, image viewers, and back to main view.
- <kbd>Ctrl</kbd> + <kbd>Enter</kbd> — Dispatch message in chat composer.

---

<div align="center">
  <p>Crafted with precision by <strong>Jellyfish Jelly</strong> & contributors.</p>
  <p>Copyright © 2026 Jellyfish Jelly. All rights reserved.</p>
</div>
