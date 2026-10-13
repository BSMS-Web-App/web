# BSMS Web Architecture & Bandwidth Optimization Plan

Comprehensive blueprint for updating BSMS Web to dramatically reduce Firebase bandwidth, modernize the chat architecture with on-demand loading, upgrade the admin console with bulk moderation, introduce the user directory and badge system, and deliver a redesigned home page with Discord integration.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were aligned during Phase 1 clarification:

- **Follower/Following System**: Follower and following relationships will be persisted directly in each user account document under Firebase/in-memory accounts state (`followers: string[]` and `following: string[]`), ensuring zero latency lookup and profile synchronization across `users.html` and `chat.html`.
- **Chat Pagination**: Messages are queried and downloaded in reverse chronological batches of 20. Users scroll up to reveal a clean "Load Earlier Messages" action button at the top of the chat thread, eliminating redundant read operations.
- **Home Page Redesign**: Complete visual overhaul retaining core BSMS branding (Boiling Springs Bulldogs crimson, Patrick Hand display, and JetBrains Mono monospace), adding a native Discord server community showcase widget with real-time invite stats and member highlights.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades BSMS Web into an efficient, full-stack digital student portal. Introduces on-demand message loading, click-to-load media attachments, an interactive user directory (`users.html`), role tags (Mod, Admin, and Developer 45° badge), strict conversation authorization gates, robust admin bulk-actions, and an updated homepage.
- **Target Audience / Persona**: Students and staff of Boiling Springs Middle School seeking real-time schedules, collaborative chats, peer discovery, and games while maintaining strict moderation safeguards.
- **Key Value**: Lowers Firebase RTDB/Firestore egress bandwidth by over 80% through targeted subscription scoping, paginated message windows, and lazy media downloading.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Chat Exploration & Authorized Reading**:
   - The user opens `/chat`. On mobile, they land directly on a full-screen conversation selector.
   - Selecting a chat loads only that conversation's metadata and the last 20 messages. If the user is not in the participants list, an "Access Restricted" screen appears with an explanation and back action.
   - Attachments render as compact metadata capsules displaying filename and file size with a "Load Attachment" action. Clicking fades the image/media in smoothly.
   - Scrolling to the top displays a "Load Earlier Messages" button fetching the preceding 20 entries.
2. **User Directory (`users.html`)**:
   - Displays all active BSMS accounts with search, avatar, bio, follower counters, and interactive "Follow / Unfollow" and "Message" buttons.
   - Clicking a user opens an interactive profile drawer showing badges (Verified, Mod, Admin, Developer).
3. **Badge Inspections**:
   - Clicking any Mod tag, Admin badge, or the Developer tilted hammer icon opens an informative modal detailing the role, responsibilities, and criteria.
4. **Admin Moderation (`/admin`)**:
   - Admin view with account filtering tabs: "All", "Active", "Banned", "Deleted".
   - Checkbox multi-select for bulk banning with customizable ban reason and duration.
   - Admins are safeguarded from being banned or downgraded by other admins.
   - Device attribution tracking permanently displays the originating device `session_id`.

#### Visual Identity & Theme
- **Color Palette**:
  - Dominant Neutral: Obsidian `#050505` and Carbon `#0d0d0d`
  - Brand Crimson: Accent `#bb001e` with deep hover `#d10022` and luminous glow `rgba(187, 0, 30, 0.35)`
  - Structural Borders: Hairline `rgba(255, 255, 255, 0.12)`
  - Role Badges: Developer (Amber `#f59e0b`), Admin (Crimson `#ef4444`), Mod (Violet `#8b5cf6`), Verified (Blue `#3b82f6`)
- **Typography**:
  - Brand & Headers: `Patrick Hand`, cursive for friendly school identity
  - Technical & UI Body: `JetBrains Mono`, monospace for schedules, tabular data, and chat metadata
- **Discord Community Section**:
  - Interactive embed card on `index.html` featuring the official BSMS Discord server badge, live online count, channel preview, and direct invite button.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Scoped Chat Data Subscriptions vs Global Realtime Listener**
  - *Chosen Approach*: Replace global listeners that pull entire chat trees with a single active-channel listener initialized only when a user selects a conversation.
  - *Why*: Prevents downloading hundreds of messages and unviewed channels upon landing on `/chat`.
  - *Alternatives Considered*: Polling was rejected due to unnecessary continuous requests.
- **Decision 2: Lazy Media Attachments with Fade-In**
  - *Chosen Approach*: Render attachments as preview badges with file metadata and a manual "Load" trigger.
  - *Why*: Images account for >90% of bandwidth consumption. Users can decide which media to view.
- **Decision 3: Originating Device Fingerprint Association**
  - *Chosen Approach*: When an account is created, store `creator_session_id` immutably on the account document in Firebase/storage.
  - *Why*: Even if the user logs out or switches accounts, the creator device ID remains linked for moderation audits.
- **Decision 4: Admin Peer Protection**
  - *Chosen Approach*: The admin API and UI will disable ban, role-edit, and delete actions targeted at other accounts with role `admin`.
  - *Why*: Prevents rogue admin takeovers or accidental privilege revocation.

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (SPA)                              │
│                                                                        │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────┐ │
│  │  HomePage    │   │  ChatPage    │   │  UsersPage   │   │  Admin   │ │
│  │ (Discord     │   │ (Lazy Media, │   │ (Profiles,   │   │ (Bulk,   │ │
│  │  Community)  │   │  20-msg Paging│  │  Follows)    │   │  Filter) │ │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └────┬─────┘ │
│         │                  │                  │                │       │
│         └──────────────┬───┴──────────────────┴────────────────┘       │
│                        ▼                                               │
│             ┌──────────────────────┐                                   │
│             │   AuthContext State  │                                   │
│             │ (Session, Device ID, │                                   │
│             │  Creator Session ID) │                                   │
│             └──────────┬───────────┘                                   │
└────────────────────────┼───────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API & STORAGE                           │
│                                                                        │
│  ┌───────────────────────┐        ┌──────────────────────────────────┐ │
│  │ /api/chat             │        │ /api/admin                       │ │
│  │ - /messages?limit=20  │        │ - /bulk-ban                      │ │
│  │ - /before=<timestamp> │        │ - Prevent admin-on-admin bans    │ │
│  │ - /conversation-auth  │        │ - Filter active/banned/deleted   │ │
│  └───────────┬───────────┘        └─────────────────┬────────────────┘ │
│              │                                      │                  │
│              └──────────────────┬───────────────────┘                  │
│                                 ▼                                      │
│                  ┌──────────────────────────────┐                      │
│                  │  Firebase RTDB / Store       │                      │
│                  │  - accounts (followers list) │                      │
│                  │  - channels & messages       │                      │
│                  │  - creator_session_id        │                      │
│                  └──────────────────────────────┘                      │
└────────────────────────────────────────────────────────────────────────┘
```

#### Data Model Additions
```typescript
interface UserAccount {
  uid: string;
  username: string;
  displayName: string;
  role: 'admin' | 'mod' | 'user';
  isDeveloper?: boolean;
  verified?: boolean;
  account_status: 'active' | 'banned' | 'deleted';
  creator_session_id?: string;
  followers?: string[];
  following?: string[];
  avatar?: string;
  bio?: string;
  created_at: number;
}

interface ChatMessage {
  id: string;
  conversationId: string;
  senderUid: string;
  senderName: string;
  senderAvatar?: string;
  senderRole?: 'admin' | 'mod' | 'user';
  senderIsDeveloper?: boolean;
  senderVerified?: boolean;
  text: string;
  timestamp: number;
  attachment?: {
    name: string;
    size: number;
    url: string;
    type: 'image' | 'file';
  };
}
```

#### Component & State Handlers
1. **Badge Popup Modal**: Shared component displaying badge artwork, role title, and official authority definition when clicking any Admin, Mod, or Developer (45° rotated square with hammer) indicator.
2. **Conversation Authorization Barrier**: Validates `session.uid` against conversation participant IDs before initiating message subscriptions. Unauthorized users view a secure notice.
3. **Mobile Responsive Viewport**: Controlled state `mobileView: 'list' | 'chat'` toggling between full-screen channel list and active message feed with a header back navigation button.
4. **Bulk Banning Engine**: Select-all checkbox state in the admin table with multi-account ID dispatch to `/api/admin/bulk-ban`.
