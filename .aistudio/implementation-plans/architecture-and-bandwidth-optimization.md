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





v2




# BSMS Web Architecture, Bandwidth Optimization & Backwards Compatibility Plan

Comprehensive blueprint for updating BSMS Web to dramatically reduce Firebase bandwidth, modernize the chat architecture with on-demand loading, upgrade the admin console with bulk moderation, introduce the user directory and badge system, and deliver a redesigned home page with Discord integration.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following revisions and specifications incorporate your latest feedback:

- **Mod Badge Appearance**: Styled identical to the Admin tag (`border`, rounded container, uppercase typography, glow effect), but styled in **yellow** (`border-amber-400/60 bg-amber-500/20 text-amber-300`) with text label `Mod`. Clicking the badge opens an informative role explanation modal.
- **Developer Badge Appearance**: A **square tilted 45°** (`rotate-45`) featuring a **neutral grey background** (`bg-zinc-700` / `bg-neutral-800` with subtle border), housing an upright hammer icon (`Hammer` counter-rotated `-rotate-45`). Clicking opens an informative popup detailing the Developer status.
- **Backwards Compatibility Strategy**:
  - **Zero Database Migration**: Chat messages remain stored under `/chat/conversations/{type}/{cid}/messages/{id}`. The data schema is unchanged, ensuring no existing conversation data is lost or corrupted.
  - **API Contract Compatibility**: `/api/chat?action=messages` continues returning `{ messages: { [id]: msgObj }, members: { ... } }`. When a client specifies pagination parameters (`limit: 20`, `beforeId: "..."`), the server returns the last 20 messages without downloading or serializing earlier messages. If called without pagination parameters, it serves the full set for legacy clients.
  - **Media Attachment Compatibility**: Old messages with standard URLs and `attachmentName` strings are parsed identically. Instead of auto-injecting `<img>` tags on mount, they render a lightweight file badge with a "Load" button that triggers the media element with a smooth fade-in.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades BSMS Web into an efficient digital student hub. Introduces on-demand message loading, click-to-load media attachments, an interactive user directory (`users.html`), role tags (Mod in yellow, Admin in crimson, Developer 45° grey hammer), strict conversation authorization gates, robust admin bulk-actions, and an updated homepage with Discord integration.
- **Target Audience / Persona**: Students and staff of Boiling Springs Middle School seeking real-time schedules, collaborative chats, peer discovery, and games while maintaining strict moderation safeguards.
- **Key Value**: Lowers Firebase RTDB/Firestore egress bandwidth by over 80% through targeted subscription scoping, paginated 20-message windows, and lazy media downloading while maintaining complete backwards compatibility.

---

### 2. User Experience & Visual Design

#### Key User Flows
1. **Chat Exploration & Authorized Reading**:
   - The user opens `/chat`. On mobile, they land directly on a full-screen conversation selector.
   - Selecting a chat loads only that conversation's metadata and the last 20 messages. A loading spinner displays in the conversation container while fetching.
   - If the user is not in the participants list, an "Access Restricted" screen appears with an explanation and back action.
   - Attachments render as compact metadata capsules displaying filename and file size with a "Load Attachment" action. Clicking fades the image/media in smoothly.
   - Scrolling to the top displays a "Load Earlier Messages" button fetching the preceding 20 entries.
   - Switching between conversations cleanly clears the active feed before loading the new channel, preventing old messages from lingering.
2. **User Directory (`users.html`)**:
   - Displays all active BSMS accounts with search, avatar, bio, follower counters, and interactive "Follow / Unfollow" and "Message" buttons.
   - Clicking a user opens an interactive profile modal showing badges (Verified, Mod, Admin, Developer).
3. **Badge Inspections & Popups**:
   - **Admin Tag**: Crimson badge. Clicking opens a popup explaining administrative authority.
   - **Mod Tag**: Yellow badge. Clicking opens a popup explaining channel & content moderation authority.
   - **Developer Badge**: 45° tilted grey square with upright hammer. Clicking opens a popup explaining software creation and systems development credentials.
   - **Verified Tag**: Blue badge. Clicking opens verification criteria modal.
4. **Admin Moderation (`/admin`)**:
   - Filter accounts by tabs: "All", "Active", "Banned", "Deleted".
   - Checkbox multi-select for bulk banning with customizable ban reason and duration.
   - Admins cannot ban other admins (action button disabled with tooltip explanation).
   - Device attribution tracking permanently displays the originating device `session_id`.

#### Visual Identity & Theme
- **Color Palette**:
  - Dominant Neutral: Obsidian `#050505` and Carbon `#0d0d0d`
  - Brand Crimson: Accent `#bb001e` with deep hover `#d10022` and luminous glow `rgba(187, 0, 30, 0.35)`
  - Structural Borders: Hairline `rgba(255, 255, 255, 0.12)`
  - Mod Yellow: `#eab308` (`bg-amber-500/20 text-amber-300 border-amber-500/50`)
  - Developer Grey: `#71717a` (`bg-zinc-800 text-zinc-200 border-zinc-600`)
- **Typography**:
  - Brand & Headers: `Patrick Hand`, cursive for friendly school identity
  - Technical & UI Body: `JetBrains Mono`, monospace for schedules, tabular data, and chat metadata
- **Discord Community Section**:
  - Interactive embed card on `index.html` featuring the official BSMS Discord server badge, live online count, channel preview, and direct invite button.

---

### 3. Key Product Decisions & Backwards Compatibility Architecture

#### Backwards Compatibility Deep Dive

```
Legacy Client Request             New Optimized Client Request
───────────────────────           ─────────────────────────────
POST /api/chat?action=messages     POST /api/chat?action=messages
{ cid: "123", type: "gcs" }        { cid: "123", type: "gcs", limit: 20, beforeId: "100040" }
          │                                      │
          ▼                                      ▼
┌──────────────────────────────────────────────────────────────┐
│                    API Handler Resolution                    │
│                                                              │
│  - Reads channel messages node                               │
│  - If 'limit' absent: returns all messages (legacy compat)   │
│  - If 'limit' present: queries/slices target 20-message key  │
│    window strictly between (beforeId - limit) and beforeId   │
│                                                              │
│  - Response Schema (Identical):                              │
│    {                                                         │
│      messages: { "100041": { ... }, "100042": { ... } },     │
│      members: { ... },                                       │
│      hasMore: true,                                          │
│      oldestId: "100041"                                      │
│    }                                                         │
└──────────────────────────────────────────────────────────────┘
```

1. **How Existing Messages Remain Compatible**:
   - Message IDs generated by the Firebase transaction (`lastMessageId` integer counter) are naturally sortable.
   - The query uses `orderByKey().limitToLast(20)` directly on Firebase RTDB, or filters key ranges `[keys.slice(-20)]`.
   - No transformations are applied to message payloads; reactions, polls, replies, and status flags function without schema changes.

2. **How Bandwidth Is Cut Without Breaking Legacy Behavior**:
   - The initial channel list sync (`action=sync`) only returns channel headers and the single latest message per channel (already implemented in `api/chat.js` line 133).
   - The client does not subscribe to or fetch message logs until a user explicitly clicks a conversation.
   - When clicked, only the 20 most recent messages are fetched. Earlier messages are only requested on user demand ("Load Earlier Messages").
   - Images and multimedia files are rendered as lightweight preview shells with a "Load" button, avoiding auto-fetching high-bandwidth binary assets.

3. **Originating Device Session ID Association**:
   - In `/api/auth` (and the account registration flow), upon account creation:
     `creator_session_id = req.headers['x-session-id'] || payload.sessionId || localStorage.getItem('session_id')`
   - This value is permanently saved to `/accounts/{uid}/creator_session_id`.
   - Logging out clears the current session from `/accounts/{uid}/sessions`, but `creator_session_id` remains immutable on the root account record.

4. **Admin Protection & Bulk Operations**:
   - In `/api/admin` action handlers (`ban`, `bulk-ban`, `delete`), if target user has `role === 'admin'`, the operation is rejected with `403 Forbidden: Cannot modify administrator account`.
   - The `/admin` UI greys out action checkboxes for admin users and disables destructive buttons.

---

### 4. Technical Architecture & Component Structure

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
│             ┌──────────────────────────────────┐                       │
│             │   RoleBadge & RoleModal System   │                       │
│             │ - Admin (Crimson)                │                       │
│             │ - Mod (Yellow)                   │                       │
│             │ - Developer (45° Grey Hammer)    │                       │
│             │ - Verified (Blue)                │                       │
│             └──────────────────┬───────────────┘                       │
│                                ▼                                       │
│             ┌──────────────────────────────────┐                       │
│             │   AuthContext State              │                       │
│             │ (Session, Device ID,             │                       │
│             │  Creator Session ID)             │                       │
│             └──────────────────┬───────────────┘                       │
└────────────────────────────────┼───────────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API & STORAGE                           │
│                                                                        │
│  ┌─────────────────────────┐      ┌──────────────────────────────────┐ │
│  │ /api/chat               │      │ /api/admin                       │ │
│  │ - /messages?limit=20    │      │ - /bulk-ban                      │ │
│  │ - /beforeId=<id>        │      │ - Prevent admin-on-admin bans    │ │
│  │ - /conversation-auth    │      │ - Filter active/banned/deleted   │ │
│  └─────────────┬───────────┘      └─────────────────┬────────────────┘ │
│                │                                    │                  │
│                └─────────────────┬──────────────────┘                  │
│                                  ▼                                     │
│                    ┌──────────────────────────────┐                    │
│                    │  Firebase RTDB / Store       │                    │
│                    │  - accounts (followers list) │                    │
│                    │  - channels & messages       │                    │
│                    │  - creator_session_id        │                    │
│                    └──────────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────────┘
```

#### Component & State Handlers
1. **`RoleBadge` Component**:
   - Supports `role: 'admin' | 'mod'`, `isDeveloper: boolean`, `verified: boolean`.
   - Mod badge: rendered with `bg-amber-500/20 border border-amber-500/50 text-amber-300 font-bold px-2 py-0.5 rounded text-xs cursor-pointer`.
   - Developer badge: rendered with a container `<div className="w-5 h-5 bg-zinc-700 border border-zinc-500 rotate-45 flex items-center justify-center cursor-pointer"><Hammer className="-rotate-45 w-3 h-3 text-zinc-100" /></div>`.
   - On click, triggers `RoleModal` displaying badge artwork, role title, and official responsibility description.
2. **Conversation Authorization Barrier**:
   - Validates `channel.members[session.uid]` before initiating message subscriptions.
   - Unauthorized users view a secure notice: "You are not authorized to view this conversation." with a button to return to conversation list.
3. **Old Message Clearing on Channel Switch**:
   - `useEffect` on `activeChannelId`: Immediately resets `messages` state to `[]` and sets `loading: true` before initiating the fetch.
4. **Mobile Responsive Viewport**:
   - On viewports `< 768px`: Shows conversation list full-screen when no conversation is selected (or when navigating to `/chat`).
   - Selecting a conversation toggles `mobileView: 'chat'` taking full screen, with a prominent header "Back" arrow button returning to `'list'`.
5. **Bulk Banning Engine in Admin**:
   - Checkbox multi-select in the user table with "Select All" header.
   - Top action bar appears when $\ge 1$ user selected: "Bulk Ban (N users)".
   - Admin accounts are automatically non-selectable and excluded.
