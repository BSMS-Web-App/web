# BSMS Web Cloud Reader (dev1)

Standalone Cloudflare Worker. Destination page fetches execute from Cloudflare, not Vercel or the Mac.

The existing Mac API is contacted only to validate the BSMS account session against /v1/db. It does not fetch, proxy, or relay destination content. Removing even this control-plane dependency requires migrating account/session verification to a cloud identity store.

## Deploy
1. Install Wrangler and authenticate to the intended Cloudflare account.
2. Set BSMS_WEB_API_KEY using Wrangler secrets.
3. Set READER_SIGNING_SECRET to a new random secret (at least 32 characters).
4. Confirm BSMS_WEB_API_URL points to the API base that serves /v1/db.
5. Deploy this Worker.
6. Set the deployed workers.dev URL in js/browser-config.js.
7. Ensure the frontend origin is listed in ORIGINS in src/index.js.

## Limits
Restricted read-only reader, not a general-purpose CONNECT proxy or full Safari/Chromium browser. Only allowlisted HTTPS domains, HTML, images, and text are supported. Scripts, forms, sign-in, downloads, WebSockets, arbitrary ports, and embedded apps are not supported.
