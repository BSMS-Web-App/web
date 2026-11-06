# BSMS Web Mac Database API

The Mac mini hosts the persistent JSON database API and media service. The Express application API is a separate process. The current dev2 application API connects to the production database API over loopback, so dev2 is not an isolated data environment.

## Service layout

| Service | Local address | Public hostname | Purpose |
| --- | --- | --- | --- |
| Production database and media API | `127.0.0.1:4901` | `api.bsms-web.com` and `media.bsms-web.com` | Production database operations and production media |
| Dev2 application API | `127.0.0.1:4903` | `dev-api.bsms-web.com` | Express application handlers used by the dev2 website |
| Optional isolated dev2 database/media API | `127.0.0.1:4902` | `dev-media.bsms-web.com` | Separate dev2 data and media; retained as an isolated service, but not the active data target for the current dev2 website |

Cloudflare Tunnel routes the public hostnames to the corresponding loopback services. Keep the database API bound to loopback; do not expose port 4901 or 4902 directly to the public internet.

## Current dev2 data flow

1. Vercel serves the static dev2 frontend at `https://bsms-web-dev2.vercel.app`.
2. The browser sends application API requests to `https://dev-api.bsms-web.com`.
3. The dev2 Express application API runs locally on port `4903`.
4. The dev2 application API sends database requests to `http://127.0.0.1:4901` using the production API key from its local `.env`.
5. The browser uses `https://media.bsms-web.com` for production media reads and uploads.

The production API key must remain server-side in the Mac-hosted dev2 application API environment. Never place it in `js/api-origin.js`, frontend JavaScript, public Vercel environment variables, or committed files.

**Production impact:** Database writes made through dev2 affect the production database. Media uploads made through dev2 are stored in production media. Do not use dev2 for destructive testing or test uploads unless those changes are intended for production.

## Optional isolated dev2 database

The service on port `4902` remains available for isolated development or recovery testing. Its database and media paths must remain separate from production. The current dev2 website does not use this service for its database connection or media origin.

The isolated service should use its own API key, data file, and media directory. Do not configure the dev2 application API to use port `4902` unless intentionally switching dev2 back to isolated data and media.

## Browser-direct media endpoints

These endpoints are intentionally accessible through the configured public media hostname and do not require the service API key:

- `OPTIONS /v1/media-upload-ticket` and `POST /v1/media-upload-ticket` — the browser sends its `X-Session-ID` plus upload metadata. The Mac validates the session, legal-policy acceptance, profile-image limits or chat-channel membership, then returns a short-lived signed upload URL. CORS is restricted to configured BSMS Web origins.
- `OPTIONS /v1/media-upload/:mediaId` and `PUT /v1/media-upload/:mediaId` — the browser uploads the raw file directly to the Mac using the one-use signed capability.
- `GET /v1/media-public/:mediaId` and `HEAD /v1/media-public/:mediaId` — serves media directly from the Mac after validating its expiring HMAC URL.

The browser does not send the database API key to these endpoints. Upload authorization is handled by the short-lived signed upload flow.

## Internal database endpoints

These endpoints require `Authorization: Bearer <BSMS_WEB_API_KEY>`:

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

The production service uses the production data file and production media directory. The isolated dev2 service, when used, must use separate absolute paths. Keep the files on persistent local storage and include the database snapshot, journal, and media in a tested backup plan.

## Environment

### Dev2 application API

The dev2 application API environment includes:

- `APP_HOST=127.0.0.1`
- `APP_PORT=4903`
- `APP_ALLOWED_ORIGINS=https://bsms-web-dev2.vercel.app` (additional local development origins may be included when needed)
- `BSMS_WEB_API_URL=http://127.0.0.1:4901`
- `BSMS_WEB_API_KEY`: the production database API key, stored only in the local server-side environment
- `BSMS_WEB_PUBLIC_MEDIA_URL=https://media.bsms-web.com`

Do not copy the real key into documentation or commit it to the repository.

### Production database API

The production database API uses:

- `BSMS_WEB_API_HOST=127.0.0.1`
- `BSMS_WEB_API_PORT=4901`
- `BSMS_WEB_API_KEY`: private production API key
- `BSMS_WEB_DATA_FILE`: production JSON snapshot path
- `BSMS_WEB_MEDIA_DIR`: production media directory
- `BSMS_WEB_PUBLIC_MEDIA_URL=https://media.bsms-web.com` (default public media origin)

### Optional isolated dev2 database API

The isolated dev2 database API uses port `4902`, its own API key, a separate database file, a separate media directory, and `https://dev-media.bsms-web.com` as its public media hostname.

Do not commit real API keys, database contents, private `.env` files, or user data.
