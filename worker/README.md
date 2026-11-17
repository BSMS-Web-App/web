# BSMS Web Cloud Reader (dev1)

The Reader is a standalone Cloudflare Worker. It fetches supported destination pages from Cloudflare's network. It does not send destination requests through Vercel or the Mac.

## IP privacy and request flow

- Destination websites receive the Worker request from Cloudflare egress. They do not receive the visitor's home IP or the Mac's public IP from this fetch path.
- The Worker contacts the Mac API only for BSMS account/session verification through the authenticated `/v1/db` endpoint.
- The Mac API does not fetch, proxy, or relay destination HTML, images, or text.
- Cloudflare necessarily receives requests to the Worker. This design does not make the visitor anonymous to Cloudflare or guarantee that a destination cannot identify a visitor through an account, URL parameters, or other information they provide.

## Deploy

1. Install Wrangler and authenticate to the Cloudflare account that owns the `bsms-web.com` zone.
2. Confirm `reader-dev1.bsms-web.com` is available as a Cloudflare Custom Domain. Cloudflare cannot create a Custom Domain on a hostname that already has a CNAME record.
3. Confirm `BSMS_WEB_API_URL` is `https://dev-api.bsms-web.com` and that it serves the authenticated `GET /v1/db?path=...` endpoint.
4. Set the `BSMS_WEB_API_KEY` Worker secret with Wrangler. Do not put it in frontend code or commit it.
5. Set `READER_SIGNING_SECRET` to a new random secret of at least 32 characters.
6. Run `npx wrangler deploy` from this directory. The Wrangler configuration attaches the Worker to `reader-dev1.bsms-web.com`.
7. Ensure the actual dev1 website origin is listed in `ORIGINS` in `src/index.js`.
8. Confirm `js/browser-config.js` points to `https://reader-dev1.bsms-web.com`.

The Worker is configured with `workers_dev = false`; the intended endpoint is the custom domain, not a `workers.dev` URL.

## Limits

This is a restricted, read-only reader, not a general-purpose CONNECT proxy or full Safari/Chromium browser. Only allowlisted HTTPS domains and HTML, images, and plain text are supported. Scripts, forms, sign-in flows, downloads, WebSockets, arbitrary ports, and embedded apps are not supported.
