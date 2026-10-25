# BSMS Web Mac Database API

This service is intended to run on the always-on Mac mini. Vercel API routes will call it through Cloudflare Tunnel. Browser code must never receive the service API key.

## Current API

All endpoints require `Authorization: Bearer <BSMS_WEB_API_KEY>`.

- `GET /health` — authenticated service health.
- `GET /v1/db?path=/accounts/example` — read a Firebase-style path; response is `{"value": ...}`.
- `PUT /v1/db` — set a path; JSON body `{"path":"/path","value":{}}`. A null value deletes the path.
- `PATCH /v1/db` — update relative child paths; JSON body `{"path":"/path","updates":{"child":value}}`.
- `POST /v1/db/compare-and-set` — atomic compare-and-set used to implement transaction retries; JSON body `{"path":"/path","expected":oldValue,"value":newValue}`.
- `DELETE /v1/db?path=/path` — delete a path; deleting the database root is forbidden.

## Persistence model

The service keeps a JSON snapshot plus a JSON Lines write-ahead journal. Mutations are serialized, journaled, and synced before being acknowledged. A snapshot is compacted periodically. This avoids rewriting the full database for every chat message. The snapshot and journal must be stored on persistent local storage and included in a backup plan.

The service defaults to loopback-only binding on port `4901`. Do not bind it to `0.0.0.0` for public exposure. Cloudflare Tunnel should route the public hostname to `http://127.0.0.1:4901`. Keep the app, data, configuration, media, and logs inside `$HOME/BSMS-Web/`.

## Environment

Required:

- `BSMS_WEB_API_KEY`: long random secret (at least 32 characters).
- `BSMS_WEB_DATA_FILE`: absolute path to the persistent JSON snapshot.

Optional:

- `BSMS_WEB_API_HOST`: defaults to `127.0.0.1`.
- `BSMS_WEB_API_PORT`: defaults to `4901`.
- `BSMS_WEB_API_BODY_LIMIT`: defaults to `25mb`.
- `BSMS_WEB_COMPACT_EVERY`: defaults to `1000` journaled mutations.

Do not commit real API keys or database contents.

## Migration status

This service is not a production cutover yet. The shared Vercel database adapter now requires this API and has no Firebase or local JSON fallback. Before production, import and validate the existing data, extract media into a separate media directory, configure a launch service and Cloudflare Tunnel, set Preview-only Vercel environment variables, and complete persistence/authentication checks.
