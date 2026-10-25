# BSMS Web Mac Database API

This service is intended to run on the always-on Mac mini. Vercel API routes will call it through Cloudflare Tunnel. Browser code must never receive the service API key.

## Current API

All endpoints require `Authorization: Bearer <BSMS_WEB_API_KEY>`.

- `GET /health` — authenticated service health.
- `GET /v1/db?path=/accounts/example` — read a slash-delimited database path; response is `{"value": ...}`.
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

## Deployment status

The Vercel database adapter requires this API and has no alternate database fallback. The development preview can use the Mac API through Cloudflare Tunnel when `BSMS_WEB_API_URL` and `BSMS_WEB_API_KEY` are configured in Vercel Preview environment variables. Keep the website hosted on Vercel; only the database API and its persistent files run on the Mac. Configure and verify Production environment variables separately before switching the production deployment.