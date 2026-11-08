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
3. Direct inbound network access to the configured WebRTC media ports. Cloudflare Tunnel supports the HTTPS/WebSocket signaling endpoint, but it does not carry the direct UDP media traffic used by WebRTC.
4. A trusted TLS certificate and a reachable TURN hostname before enabling TURN/TLS.

## Cloudflare and router routing

Create a Cloudflare Tunnel public-hostname route for `voice.bsms-web.com` to `http://localhost:7880`. WebSockets must be enabled for the zone. Keep the LiveKit API port behind this HTTPS/WSS route; do not expose TCP 7880 directly.

On the router, forward these ports to the Mac's reserved LAN IP:

- UDP 50000–50100 — primary WebRTC audio media.
- TCP 7881 — WebRTC-over-TCP fallback.
- UDP 3478 — only if embedded TURN/UDP is enabled later.

The Cloudflare Tunnel route handles signaling, not the media ports. If the router or internet provider cannot deliver inbound UDP to the Mac, calls may connect inconsistently or fail. The Mac's local firewall must also allow the published LiveKit ports.

## Beta readiness check

The chat UI asks the Mac API to verify that the LiveKit server responds to an authenticated API request. The voice button stays disabled if the environment variables are missing or the LiveKit endpoint cannot be reached. This confirms signaling/API reachability only; it does not prove that router forwarding or UDP media works. A real call between two accounts is still required for that final test.

## Initial setup

1. Copy `.env.example` to `.env`.
2. Generate unique credentials locally (for example, use `openssl rand -hex 32` for each value) and put them in `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Keep `.env` private and never commit it.
3. Keep `LIVEKIT_TURN_ENABLED=false` for the first connectivity test. TURN/TLS needs a separate network design and must not be enabled from this template without that work.
4. Start the service from this directory with `docker compose up -d`.
5. Confirm the LiveKit server is healthy with `docker compose logs --tail=100 livekit`.

## Deploying the BSMS Web code to the Mac

The API handler is part of the BSMS Web repository, not this Docker container. Update the same repository checkout that runs the Mac-hosted Express API to branch `dev2`, then run `npm install` in that checkout so `livekit-server-sdk` is installed. Add these values to that checkout's existing root `.env`:

- `LIVEKIT_URL=wss://voice.bsms-web.com`
- `LIVEKIT_API_KEY` — the same key used by the LiveKit container.
- `LIVEKIT_API_SECRET` — the same secret used by the LiveKit container.

If `APP_ALLOWED_ORIGINS` is explicitly set in that root `.env`, make sure it includes `https://bsms-web-dev2.vercel.app` while testing. Preserve any other existing allowed origins. Restart the Mac-hosted Express API after updating its code and environment.

The website files must also be deployed to the dev2 preview. Do not merge this beta into `main` just to test it.

The compose file publishes:
- TCP 7880 for LiveKit HTTP/WebSocket signaling (keep the origin private behind the configured HTTPS/WSS proxy).
- TCP 7881 for WebRTC-over-TCP fallback.
- UDP 50000-50100 for WebRTC media.
- UDP 3478 and TCP 5349 for embedded TURN when enabled.

The exact public port-forwarding and DNS configuration must match the network and Cloudflare setup on the Mac. Do not expose the LiveKit API port directly without HTTPS/WSS termination and appropriate access controls.

## TURN/TLS

When the certificate files exist at `certs/fullchain.pem` and `certs/privkey.pem`, TURN can be evaluated as a separate follow-up. **Do not enable the current TURN/TLS setting as-is for a public beta:** LiveKit documents that when no layer-4 load balancer is in front, its advertised TURN/TLS port must be 443. The current Compose template uses 5349 and the Mac already uses HTTPS services, so a deliberate port-443 routing design is needed first. Do not route TURN through an ordinary HTTP reverse proxy.

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
