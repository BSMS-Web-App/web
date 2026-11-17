# BSMS Web Cloud Reader

Standalone Cloudflare Worker named `bsms-web-reader`, served at `https://reader.bsms-web.com`. Destination page fetches execute from Cloudflare, not Vercel or the Mac.

The existing Mac API at `https://api.bsms-web.com` is contacted only to validate the BSMS account session through `/v1/auth/session`. It does not fetch, proxy, or relay destination content. The API key and reader signing key are stored as Cloudflare Worker secrets and must never be committed.

## Deploy
1. Install Wrangler and authenticate to the intended Cloudflare account.
2. Set `BSMS_WEB_API_KEY` from the Mac API environment using Wrangler secrets.
3. Set `READER_SIGNING_SECRET` to a new random secret of at least 32 characters.
4. Confirm `BSMS_WEB_API_URL` is `https://api.bsms-web.com`.
5. Deploy with `npx wrangler deploy` from this directory. The custom domain is configured in `wrangler.toml`.
6. Keep production and development frontend origins explicitly listed in `ORIGINS` in `src/index.js` as needed.

## Limits
Restricted read-only reader, not a general-purpose CONNECT proxy or full Safari/Chromium browser. Only allowlisted HTTPS domains, HTML, images, and text are supported. Scripts, forms, sign-in, downloads, WebSockets, arbitrary ports, and embedded apps are not supported.
