# BSMS Web Proxy

A separate, browser-based proxy service for BSMS Web.

## Project status

**Foundation stage — not a working proxy yet.**

The initial goal is to build a browser interface that routes supported website requests through a proxy service. A destination website should see the proxy service's outbound IP for requests routed through it, rather than the visitor's public IP. The proxy service itself can still receive the visitor's IP.

## Development principles

- Keep the proxy isolated under `proxy/`; do not change the existing BSMS Web application runtime.
- Keep deployment portable so the service can move between providers without rewriting its core.
- Prefer free tiers and avoid sending dynamic application traffic through Vercel.
- Keep the initial beta simple to deploy and operate.
- Do not promise anonymity. Explain what the proxy operator and destination websites can see.
- Do not collect browsing history unless a feature genuinely requires it.

## Initial infrastructure direction

The current recommendation is a **Cloudflare-first delivery layer with a separate proxy compute service**:

- **Static frontend:** Cloudflare Pages or Workers Static Assets. Static asset requests are free and unlimited under the documented Workers static-assets model.
- **DNS / TLS / edge routing:** Cloudflare.
- **Database:** Cloudflare D1 for small structured application data, if the existing BSMS data model can be migrated cleanly.
- **File storage:** Cloudflare R2 for suitable media and uploads; standard R2 egress has no bandwidth charge.
- **Proxy compute:** benchmark a small Node.js service separately. Render Free is easy to try but sleeps after 15 minutes of inactivity, has ephemeral local storage, and is explicitly intended for testing/hobby use rather than production. A small always-on VM may be a later option, but is more work to configure and maintain.

Cloudflare Workers Free is attractive for small APIs, but its documented limits (including 10 ms CPU per request, 50 subrequests per invocation, and six simultaneous outgoing connections) make it a poor assumption for a full browser-proxy engine without a compatibility prototype. We should benchmark before committing.

## Local development

Requirements: Node.js 22 or newer.

```sh
cd proxy
npm install
npm run dev
```

The starter server exposes only a health endpoint at `/health`. It does not fetch arbitrary URLs and is not an open proxy.

## Planned structure

```
proxy/
  client/       Browser interface
  server/       Proxy gateway and session services
  config/       Runtime configuration
  tests/        Security and compatibility tests
  package.json  Independent runtime definition
  server.js     Development server entry point
```

## Next milestones

1. Compare and select hosting for static assets, APIs, data, files, and proxy compute.
2. Prototype the browser-proxy transport and verify compatibility with ordinary websites.
3. Implement URL validation, safe outbound networking, request limits, and session isolation.
4. Build the browser shell and navigation experience.
5. Test redirects, scripts, stylesheets, images, cookies, and WebSockets.
6. Deploy to `proxy.bsms-web.com` only after the hosting and operating limits are understood.
