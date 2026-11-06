# BSMS Web Voice Infrastructure

This directory contains the self-hosted LiveKit media server configuration for BSMS Web voice chat.

## Architecture

- The BSMS Web API authenticates users with their existing BSMS sessions and issues short-lived LiveKit room tokens.
- LiveKit runs separately from the existing Mac database API and the BSMS Web Express application server.
- LiveKit handles WebRTC signaling and forwards audio between participants in direct-message and group-chat rooms.
- LiveKit includes an embedded TURN service. A separate coturn process is not required for the planned setup.

The voice feature remains unavailable until the LiveKit service and its API environment variables are configured. No database migration is required; transient call invitations and room state are stored under the existing `/voice` database key.

## What the Mac needs

1. Docker Desktop installed and running.
2. A DNS name for the LiveKit WebSocket endpoint, planned as `voice.bsms-web.com`.
3. Direct inbound network access to the configured WebRTC media ports. Cloudflare Tunnel can proxy the HTTPS/WebSocket signaling endpoint, but it does not proxy the UDP media port range.
4. A trusted TLS certificate and a reachable TURN hostname before enabling TURN/TLS.

## Initial setup

1. Copy `.env.example` to `.env`.
2. Replace `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` with unique random values. Keep `.env` private and never commit it.
3. Keep `LIVEKIT_TURN_ENABLED=false` for the first local connectivity test. TURN/TLS is enabled only after its certificate files and public network routing are ready.
4. Start the service from this directory with `docker compose up -d`.
5. Confirm the LiveKit server is healthy with `docker compose logs --tail=100 livekit`.

The compose file publishes:
- TCP 7880 for LiveKit HTTP/WebSocket signaling (keep the origin private behind the configured HTTPS/WSS proxy).
- TCP 7881 for WebRTC-over-TCP fallback.
- UDP 50000-50100 for WebRTC media.
- UDP 3478 and TCP 5349 for embedded TURN when enabled.

The exact public port-forwarding and DNS configuration must match the network and Cloudflare setup on the Mac. Do not expose the LiveKit API port directly without HTTPS/WSS termination and appropriate access controls.

## TURN/TLS

When the certificate files exist at `certs/fullchain.pem` and `certs/privkey.pem`, set `LIVEKIT_TURN_ENABLED=true` and set `LIVEKIT_TURN_DOMAIN` to a DNS-only hostname that resolves to the home public IP. Forward TCP 5349 and UDP 3478 to the Mac. TURN/TLS on 5349 improves compatibility with networks that block direct UDP, but it is not guaranteed to work on networks that only allow outbound TLS on TCP 443.

For a network that blocks 5349, a later network design may place TURN/TLS on 443. That requires a dedicated listener/IP or a layer-4 TLS routing design; it must not be improvised by sending TURN traffic through an ordinary HTTP reverse proxy.

## BSMS Web environment variables

Set these in the root `.env` used by the Mac-hosted BSMS Web application API (`server.js`, normally port 4903). The existing `/js/api-origin.js` routes `/api/voice` requests through `https://dev-api.bsms-web.com`, so these values do not belong in Vercel environment settings.

- `LIVEKIT_URL=wss://voice.bsms-web.com`
- `LIVEKIT_API_KEY` — the same key configured in this LiveKit service.
- `LIVEKIT_API_SECRET` — the matching secret configured in this LiveKit service.

The API secret must only exist on the Mac application server and in the private LiveKit `.env` file. It is never sent to the browser. The browser receives a short-lived, room-scoped participant token after the Mac API verifies the user's session and conversation membership.

The Docker Compose `.env` in this directory configures LiveKit itself. The root application `.env` must contain the same `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` values, plus `LIVEKIT_URL`, so the API can issue tokens.

## Important notes

- The Mac must remain powered on and connected for self-hosted calls to work.
- Group calls use the Mac's upload bandwidth because LiveKit forwards participant audio.
- UDP media ports must be reachable directly; an HTTP reverse proxy or Cloudflare Tunnel cannot carry them.
- TURN is a fallback, not a guarantee that every school or managed network will permit calls.
- Do not use the development API key/secret shown in LiveKit's local quick-start mode for a public deployment.
- Test with at least two accounts and on both the home network and a restrictive network before enabling the beta for everyone.
