# BSMS Web Production Database and Media API

The Mac mini hosts BSMS Web's persistent production JSON database API and media service. The database API is a private backend service: application servers connect to it using a server-side API key, while browser media operations use the signed upload and public-media endpoints.

## Production service

| Setting | Production value |
| --- | --- |
| Local bind address | `127.0.0.1` |
| Local port | `4901` |
| Database API hostname | `api.bsms-web.com` |
| Public media hostname | `media.bsms-web.com` |
| Database snapshot | Configured by `BSMS_WEB_DATA_FILE` |
| Media directory | Configured by `BSMS_WEB_MEDIA_DIR` |

Cloudflare Tunnel routes the public API and media hostnames to the local service. Keep the service bound to loopback. Do not expose port 4901 directly to the public internet.

## Request and access model

Most database and internal media endpoints require:

`Authorization: Bearer <BSMS_WEB_API_KEY>`

The API key is for trusted server-side application code only. Never include it in frontend JavaScript, browser requests, public Vercel environment variables, source control, or documentation.

### Browser-direct media endpoints

These endpoints are intentionally accessible through the configured public media hostname and do not require the database API key:

- `OPTIONS /v1/media-upload-ticket` and `POST /v1/media-upload-ticket` — the browser sends its `X-Session-ID` plus upload metadata. The Mac validates the session, legal-policy acceptance, profile-image limits or chat-channel membership, then returns a short-lived signed upload URL. CORS is restricted to configured BSMS Web origins.
- `OPTIONS /v1/media-upload/:mediaId` and `PUT /v1/media-upload/:mediaId` — the browser uploads the raw file directly to the Mac using the one-use signed capability.
- `GET /v1/media-public/:mediaId` and `HEAD /v1/media-public/:mediaId` — serves media directly from the Mac after validating its expiring HMAC URL.

The browser does not send the database API key to these endpoints. Upload authorization is handled by the short-lived signed upload flow.

### Internal database endpoints

These endpoints require the bearer API key:

- `GET /health` — authenticated service health.
- `GET /v1/auth/session?sessionId=...` — resolve a session against the database, when enabled by the service implementation.
- `GET /v1/db?path=/accounts/example` — read a slash-delimited database path.
- `PUT /v1/db` — set a path; a null value deletes the path.
- `PATCH /v1/db` — update relative child paths.
- `POST /v1/db/compare-and-set` — atomic compare-and-set used for transaction retries.
- `DELETE /v1/db?path=/path` — delete a path; deleting the database root is forbidden.
- `GET /v1/media/:mediaId` and `HEAD /v1/media/:mediaId` — authenticated internal media lookup.

## Persistence model

The service keeps a JSON snapshot plus a JSON Lines write-ahead journal. Mutations are serialized, journaled, and synced before they are acknowledged. A snapshot is compacted periodically. This avoids rewriting the full database for every chat message.

The snapshot, journal, and media directory must remain on persistent local storage and be included in a tested backup plan. A snapshot-only copy may not include the latest committed changes if the journal contains newer mutations.

## Environment

Required:

- `BSMS_WEB_API_KEY`: long random secret (at least 32 characters).
- `BSMS_WEB_DATA_FILE`: absolute path to the persistent JSON snapshot.

Optional:

- `BSMS_WEB_API_HOST`: defaults to `127.0.0.1`.
- `BSMS_WEB_API_PORT`: defaults to `4901`.
- `BSMS_WEB_MEDIA_DIR`: absolute path to persistent media storage.
- `BSMS_WEB_PUBLIC_MEDIA_URL`: public media origin; production uses `https://media.bsms-web.com`.
- `BSMS_WEB_API_BODY_LIMIT`: defaults to `25mb`.
- `BSMS_WEB_COMPACT_EVERY`: defaults to `1000` journaled mutations.

The application API's `BSMS_WEB_API_URL` must point to this service from trusted server-side code. Keep its API key in the same server-side environment. Never expose either setting to browser code.

## Operations and security

- Keep the database API bound to `127.0.0.1`.
- Route public traffic through the configured Cloudflare Tunnel hostnames.
- Restrict CORS to the intended BSMS Web website origins.
- Keep the API key private and rotate it if it is exposed.
- Back up the live database state, snapshot, journal, and media directory.
- Verify backups before relying on them for recovery.
- Do not use production data for destructive tests.

## Development

Development and preview environments may use separate application API processes and isolated database/media directories. Keep their credentials and data paths separate from production unless a deliberate shared-production-data test is intended. Never document or commit real credentials, private `.env` files, database contents, or user data.
