/*
 * BSMS Web Cloud Reader — Cloudflare Worker
 * Destination fetches execute on Cloudflare, never on Vercel or the Mac.
 * The Mac API is used only to validate the existing BSMS account session.
 */
const ORIGINS = new Set([
  "https://dev1.bsms-web.com",
  "https://bsms-web-dev1.vercel.app"
]);
const HOSTS = [
  "wikipedia.org", "britannica.com", "developer.mozilla.org",
  "support.apple.com", "apple.com", "github.com", "w3.org",
  "nasa.gov", "noaa.gov", "weather.gov", "khanacademy.org",
  "pbs.org", "loc.gov", "si.edu"
];
const TTL = 600;
const MAX = 2 * 1024 * 1024;
const enc = new TextEncoder();

function reply(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers
    }
  });
}

function cors(req) {
  const origin = req.headers.get("Origin");
  if (!origin) return {};
  if (!ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-ID, X-UID",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
}

function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
}
function un64(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const b = atob(s + "=".repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function key(secret) {
  return crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
}
async function signToken(uid, sid, secret) {
  const payload = b64(enc.encode(JSON.stringify({
    uid, sid, exp: Math.floor(Date.now() / 1000) + TTL
  })));
  const signature = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(payload));
  return payload + "." + b64(new Uint8Array(signature));
}
async function readToken(token, secret) {
  try {
    if (!token || token.length > 2048 || !secret) return null;
    const [payload, signature, ...rest] = token.split(".");
    if (!payload || !signature || rest.length) return null;
    const valid = await crypto.subtle.verify(
      "HMAC", await key(secret), un64(signature), enc.encode(payload)
    );
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(un64(payload)));
    return data.exp >= Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

/*
 * This is the only Mac request made by Reader. It reads the account record
 * for authentication; destination HTML/images are fetched separately below
 * by the Worker runtime and are never relayed through the Mac.
 */
async function dbGet(env, path) {
  const base = (env.BSMS_WEB_API_URL || "").replace(/\\/+$/, "");
  if (!base || !env.BSMS_WEB_API_KEY) throw Error("Account verification is not configured");
  const response = await fetch(
    base + "/v1/db?path=" + encodeURIComponent(path),
    {
      headers: {
        Authorization: "Bearer " + env.BSMS_WEB_API_KEY,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) throw Error("Account verification service unavailable");
  const data = await response.json();
  return data.value ?? null;
}

async function accountValid(env, uid, sid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof sid !== "string" || sid.length < 16 || sid.length > 300) return false;

  const account = await dbGet(env, "/accounts/" + uid);
  const hasSession = Boolean(
    account &&
    (
      (account.sessions && Object.prototype.hasOwnProperty.call(account.sessions, sid)) ||
      account.creator_session_id === sid
    )
  );

  return Boolean(
    hasSession &&
    account.account_status !== "banned" &&
    account.account_status !== "deleted" &&
    account.legalAcceptance?.terms?.version === "1.0.1" &&
    account.legalAcceptance?.privacy?.version === "1.0.2"
  );
}

function targetUrl(value, base) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username || url.password ||
      (url.port && url.port !== "443") ||
      url.hostname.endsWith(".local") ||
      url.hostname.includes("%")
    ) return null;

    const host = url.hostname.toLowerCase().replace(/\\.$/, "");
    if (!HOSTS.some(domain => host === domain || host.endsWith("." + domain))) return null;
    url.hostname = host;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

async function readLimited(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("Reader response exceeded size limit").catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

class Strip {
  element(element) { element.remove(); }
}

class Clean {
  constructor(base, token) {
    this.base = base;
    this.token = token;
  }
  element(element) {
    for (const attribute of [
      "style", "srcset", "srcdoc", "action", "formaction", "autofocus",
      "contenteditable", "onload", "onerror", "onclick", "onmouseover",
      "target", "download"
    ]) element.removeAttribute(attribute);

    for (const attribute of ["href", "src"]) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      const url = targetUrl(raw, this.base);
      if (!url) {
        element.removeAttribute(attribute);
        continue;
      }
      element.setAttribute(
        attribute,
        "/page?url=" + encodeURIComponent(url.href) + "&token=" + encodeURIComponent(this.token)
      );
    }

    if (element.tagName.toLowerCase() === "a") {
      element.setAttribute("rel", "noreferrer noopener");
    }
  }
}

async function fetchPage(req, env, url, token) {
  const identity = await readToken(token, env.READER_SIGNING_SECRET);
  if (!identity || !await accountValid(env, identity.uid, identity.sid)) {
    return reply({ error: "Your reader session expired. Sign in again." }, 401);
  }

  const destination = targetUrl(url);
  if (!destination) {
    return reply({ error: "Only supported HTTPS websites are available." }, 400);
  }

  // This fetch runs inside Cloudflare. The destination receives Cloudflare
  // egress, not the visitor's home IP and not the Mac's public IP.
  const upstream = await fetch(destination.href, {
    redirect: "manual",
    headers: {
      "User-Agent": "BSMS-Web-Reader/1.0",
      "Accept": "text/html,image/avif,image/webp,image/png,image/jpeg,image/gif,text/plain;q=0.8"
    },
    signal: AbortSignal.timeout(12000)
  });

  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    const location = upstream.headers.get("Location");
    const next = location && targetUrl(location, destination);
    if (!next) return reply({ error: "Redirect outside supported sites blocked." }, 403);
    const redirectUrl = new URL(req.url);
    redirectUrl.searchParams.set("url", next.href);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  if (!upstream.ok) return reply({ error: "Destination could not be loaded." }, 502);

  const type = (upstream.headers.get("Content-Type") || "").toLowerCase();
  const contentLength = Number(upstream.headers.get("Content-Length") || 0);
  if (contentLength > MAX) return reply({ error: "Page exceeds reader size limit." }, 413);

  // Enforce the limit even when the destination omits Content-Length or
  // streams the response in chunks.
  const bytes = await readLimited(upstream.body, MAX);
  if (bytes === null) return reply({ error: "Page exceeds reader size limit." }, 413);

  if (type.startsWith("image/")) {
    if (!/^image\\/(png|jpeg|gif|webp|avif)/.test(type)) {
      return reply({ error: "Image type unsupported." }, 415);
    }
    return new Response(bytes, {
      headers: {
        "Content-Type": type.split(";")[0],
        "Cache-Control": "private, max-age=60",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  if (type.includes("text/html")) {
    const transformed = new HTMLRewriter()
      .on(
        "script,style,iframe,frame,object,embed,form,input,button,textarea,select,base,link,meta,noscript,template,svg,math",
        new Strip()
      )
      .on("*", new Clean(destination, token))
      .transform(new Response(bytes, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }));

    const headers = new Headers(transformed.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
    );
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, no-store");
    headers.delete("Content-Length");
    return new Response(transformed.body, { headers });
  }

  if (type.startsWith("text/plain")) {
    return new Response(
      "<!doctype html><meta charset=utf-8><pre style='white-space:pre-wrap'>" +
        esc(new TextDecoder().decode(bytes)) +
        "</pre>",
      {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store"
        }
      }
    );
  }

  return reply({ error: "This content type is not supported." }, 415);
}

export default {
  async fetch(request, env) {
    const corsHeaders = cors(request);
    if (corsHeaders === null) return reply({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return reply({
          service: "BSMS Web Cloud Reader",
          status: "ok",
          egress: "cloudflare"
        }, 200, corsHeaders);
      }

      if (url.pathname === "/session" && request.method === "POST") {
        const uid = request.headers.get("X-UID") || "";
        const sid = request.headers.get("X-Session-ID") || "";
        if (!await accountValid(env, uid, sid)) {
          return reply({
            error: "Sign in and accept the current policies to use Reader."
          }, 401, corsHeaders);
        }
        return reply({
          token: await signToken(uid, sid, env.READER_SIGNING_SECRET),
          expiresIn: TTL * 1000
        }, 200, corsHeaders);
      }

      if (url.pathname === "/page" && request.method === "GET") {
        const response = await fetchPage(
          request,
          env,
          url.searchParams.get("url"),
          url.searchParams.get("token")
        );
        const headers = new Headers(response.headers);
        for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }

      return reply({ error: "Not found." }, 404, corsHeaders);
    } catch (error) {
      console.error("[BSMS Reader]", error);
      return reply({ error: "Reader service temporarily unavailable." }, 503, corsHeaders);
    }
  }
};
