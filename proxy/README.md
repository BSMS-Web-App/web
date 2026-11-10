# BSMS Web Proxy

A separate, privacy-focused browser proxy project. It is independent from the main BSMS Web application, which remains hosted on Vercel.

## Project status

**Foundation + controlled BSMS-owned website request test.**

The interface and Node.js service are in place. The first server-side test makes one fixed outbound request to an IP-check endpoint and reports the public IP used by the proxy server. It only fetches paths on the fixed `https://bsms-web.com` origin and returns limited metadata; it does not return or execute the remote HTML.

The intended privacy property is that a destination contacted by the proxy server sees the server's outbound IP for that request, rather than the visitor's direct public IP. The proxy service itself can still receive the visitor's IP. This is not a VPN or an anonymity guarantee.

## Development principles

- Keep all proxy code isolated under `proxy/`; do not change the existing BSMS Web runtime or production deployment.
- Keep deployment portable and prefer low-cost hosting.
- Do not collect browsing history or retain visitor IP addresses in application logs.
- Do not offer unrestricted open-proxy behavior.
- Use explicit, documented destination policies and protect server-side requests against private-network and metadata targets.
- Be clear about what the visitor, proxy operator, and destination service can see.

## Current endpoints

- `GET /` — browser interface.
- `GET /health` — service health.
- `GET /api/egress-check` — checks the server's outbound IP using a fixed upstream URL.
- `GET /api/site-check?path=/` — fetches a path on the fixed BSMS-owned site and returns page metadata only.

The site-check endpoint accepts a path only, checks DNS results, blocks private and special-use IP ranges, revalidates same-origin redirects, forwards no visitor cookies or authorization headers, applies a timeout and response-size cap, and returns metadata only. These are prototype safeguards, not a complete production security review.

## Local development

Requirements: Node.js 22 or newer.

```sh
cd proxy
npm install
npm run dev
```

Open `http://127.0.0.1:8788`. Enter a URL on `https://bsms-web.com` and press **Continue** to test the server-side request.

## Planned structure

```
proxy/
  client/       Browser interface
  server/       API, outbound policy, and session services
  config/       Runtime configuration
  tests/        Automated tests
  package.json  Independent runtime definition
  server.js     Service entry point
```

## Next milestones

1. Verify the outbound IP check locally and on a low-cost test host.
2. Decide the exact privacy use case and supported destinations before implementing website requests.
3. Design destination allowlists, DNS/IP validation, redirect revalidation, timeouts, response-size limits, and abuse controls.
4. Prototype supported website content handling without exposing an unrestricted relay.
5. Test privacy behavior, browser compatibility, and deployment costs before beta release.

## Hosting boundary

The main BSMS Web app stays on Vercel. The proxy is a separate service and must not be added to the main app's Vercel runtime by accident.
