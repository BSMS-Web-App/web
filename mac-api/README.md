# BSMS Web Mac Database API

This service runs on the always-on Mac mini and provides the private JSON database plus direct media upload and download endpoints. The application API runs as a separate Express process and calls this service over loopback.

## Service layout

The dev2 setup uses three local ports:

| Service | Port | Purpose |
| --- | ---: | --- |
| Production database API | 4901 | Existing production database; leave unchanged |
| dev2 database API | 4902 | Isolated dev2 JSON database and media |
| dev2 application API | 4903 | Express handlers used by the dev2 website |

Only the application API and dev2 media hostname should be exposed through Cloudflare Tunnel:

- `app-api-dev2.bsms-web.com` → `http://127.0.0.1:4903`
- `media-dev2.bsms-web.com` → `http://127.0.0.1:4902`

Do not expose the database API's `/v1/db` routes without authentication. The database API must remain bound to loopback. The existing production service and its hostnames must not be changed as part of the dev2 migration.

## Browser-direct media endpoints

These endpoints are intentionally accessible through the configured public media hostname and do not require the service API key:

- `OPTIONS /v1/media-upload-ticket` and `POST /v1/media-upload-ticket` — browser sends its `X-Session-ID` plus upload metadata. The Mac validates the session, legal-policy acceptance, profile-image limits or chat-channel membership, then returns a short-lived signed upload URL. CORS is restricted to configured BSMS Web origins.
- `OPTIONS /v1/media-upload/:mediaId` and `PUT /v1/media-upload/:mediaId` — browser uploads the raw file directly to the Mac using the one-use signed capability.
- `GET /v1/media-public/:mediaId` and `HEAD /v1/media-public/:mediaId` — serves media directly from the Mac after validating its expiring HMAC URL.

The dev2 database service must use `BSMS_WEB_PUBLIC_MEDIA_URL=https://media-dev2.bsms-web.com`. Its media directory must be separate from production so dev2 uploads cannot overwrite production media.

## Internal database endpoints

These endpoints require `Authorization: Bearer <BSMS_WEB_API_KEY>`:

- `GET /health` — authenticated service health.
- `GET /v1/auth/session?sessionId=...` — resolve a session against the database.
- `GET /v1/db?path=/accounts/example` — read a slash-delimited database path.
- `PUT /v1/db` — set a path; JSON body `{"path":"/path","value":{}}`. A null value deletes the path.
- `PATCH /v1/db` — update relative child paths.
- `POST /v1/db/compare-and-set` — atomic compare-and-set used for transaction retries.
- `DELETE /v1/db?path=/path` — delete a path; deleting the database root is forbidden.
- `GET /v1/media/:mediaId` and `HEAD /v1/media/:mediaId` — authenticated internal media lookup.

The dev2 application API uses `BSMS_WEB_API_URL=http://127.0.0.1:4902` and the same private key configured on the dev2 database service. The key is server-side only and must never be placed in frontend JavaScript or Vercel client environment variables.

## Persistence model

The service keeps a JSON snapshot plus a JSON Lines write-ahead journal. Mutations are serialized, journaled, and synced before they are acknowledged. A snapshot is compacted periodically. This avoids rewriting the full database for every chat message.

Use separate absolute paths for the dev2 database file and media directory, for example:

- `$HOME/BSMS-Web/dev2-data/db.json`
- `$HOME/BSMS-Web/dev2-media/`

Keep both directories on persistent local storage and include them in a backup plan. Do not point dev2 at the production database file or production media directory.

## Environment

Required:

- `BSMS_WEB_API_KEY`: long random secret (at least 32 characters); use the same dev2-only key in the dev2 database and application API environments.
- `BSMS_WEB_DATA_FILE`: absolute path to the dev2 JSON snapshot.

Optional:

- `BSMS_WEB_API_HOST`: defaults to `127.0.0.1`.
- `BSMS_WEB_API_PORT`: use `4902` for the dev2 database service.
- `BSMS_WEB_API_BODY_LIMIT`: defaults to `25mb`.
- `BSMS_WEB_COMPACT_EVERY`: defaults to `1000` journaled mutations.
- `BSMS_WEB_MEDIA_DIR`: absolute path to the dev2 media directory.
- `BSMS_WEB_PUBLIC_MEDIA_URL`: use `https://media-dev2.bsms-web.com` for dev2.

The application API process also needs `APP_HOST=127.0.0.1`, `APP_PORT=4903`, `APP_ALLOWED_ORIGINS=https://bsms-web-dev2.vercel.app`, `BSMS_WEB_API_URL=http://127.0.0.1:4902`, `BSMS_WEB_API_KEY`, and `BSMS_WEB_PUBLIC_MEDIA_URL`.

## Deployment status

The dev2 frontend is configured to be static-only on Vercel. Browser requests for `/api/*`, `/games/saves`, and `/raw/*` are routed by `js/api-origin.js` to `https://app-api-dev2.bsms-web.com`. Vercel does not need database credentials and does not execute the application API.

The dev2 backend and database require the Mac processes and Cloudflare Tunnel hostnames above to be configured before the dev2 website's API functionality can work. Production remains on its existing infrastructure until a separate migration is reviewed and approved.

Do not commit real API keys, database contents, private `.env` files, or user data.
