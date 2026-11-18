/*
 * BSMS Web Cloud Reader — Cloudflare Worker
 * Destination fetches execute on Cloudflare, never on Vercel or the Mac.
 * The Mac API is used only to validate the existing BSMS account session.
 */
const ORIGINS = new Set([
  "https://bsms-web.com",
  "https://www.bsms-web.com",
  "https://bsms-web.vercel.app",
  // Keep the active development frontend available for testing.
  "https://dev1.bsms-web.com",
  "https://bsms-web-dev1.vercel.app"
]);
const FRAME_ANCESTORS = [...ORIGINS].join(" ");
// Destination hosts are intentionally unrestricted. URL validation below
// permits public HTTPS destinations while rejecting local/private targets.
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
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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
async function accountValid(env, uid, sid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof sid !== "string" || sid.length < 16 || sid.length > 300) return false;

  const base = (env.BSMS_WEB_API_URL || "").replace(/\/+$/, "");
  if (!base || !env.BSMS_WEB_API_KEY) throw Error("Account verification is not configured");

  // Use the Mac API's narrow session-validation endpoint. Do not retrieve
  // the full account record or its private fields into the Worker.
  const response = await fetch(
    base + "/v1/auth/session?sessionId=" + encodeURIComponent(sid),
    {
      headers: {
        Authorization: "Bearer " + env.BSMS_WEB_API_KEY,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8000)
    }
  );
  if (!response.ok) throw Error("Account verification service unavailable");

  const result = await response.json();
  return Boolean(
    result.authenticated === true &&
    result.uid === uid &&
    result.account &&
    result.account.account_status !== "banned" &&
    result.account.account_status !== "deleted"
  );
}

function parseIPv4(host) {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part))) return null;
  if (parts.some(part => Number(part) > 255)) return null;
  return parts.reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function inRange(value, network, prefix, bits) {
  const shift = BigInt(bits - prefix);
  const mask = ((1n << BigInt(bits)) - 1n) ^ ((1n << shift) - 1n);
  return (value & mask) === (network & mask);
}

function isPublicIPv4(host) {
  const value = parseIPv4(host);
  if (value === null) return false;
  const blocked = [
    [0x00000000n, 8], [0x0a000000n, 8], [0x64400000n, 10],
    [0x7f000000n, 8], [0xa9fe0000n, 16], [0xac100000n, 12],
    [0xc0000000n, 24], [0xc0000200n, 24], [0xc01fc400n, 24], [0xc034c100n, 24], [0xc0586300n, 24], [0xc0af3000n, 24],
    [0xc0a80000n, 16], [0xc6120000n, 15], [0xc6336400n, 24],
    [0xcb007100n, 24], [0xe0000000n, 4], [0xf0000000n, 4]
  ];
  return !blocked.some(([network, prefix]) => inRange(value, network, prefix, 32));
}

function parseIPv6(host) {
  let value = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (value.includes(".")) {
    const splitAt = value.lastIndexOf(":");
    const ipv4 = parseIPv4(value.slice(splitAt + 1));
    if (splitAt < 0 || ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    value = value.slice(0, splitAt + 1) + high + ":" + low;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  if (halves.length === 2 && left.length + right.length >= 8) return null;
  const parts = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  if (parts.length !== 8 || parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((result, part) => (result << 16n) | BigInt(parseInt(part, 16)), 0n);
}

function isPublicIPv6(host) {
  const value = parseIPv6(host);
  if (value === null) return false;
  // Only globally-routable 2000::/3 addresses are accepted. This excludes
  // unspecified, loopback, mapped, unique-local, link-local and multicast.
  if (!inRange(value, 0x20000000000000000000000000000000n, 3, 128)) return false;
  // Also reject documentation and special protocol-assignment ranges.
  if (
    inRange(value, 0x20010db8000000000000000000000000n, 32, 128) ||
    inRange(value, 0x20010000000000000000000000000000n, 23, 128) ||
    inRange(value, 0x20020000000000000000000000000000n, 16, 128)
  ) return false;
  return true;
}

export function targetUrl(value, base) {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username || url.password ||
      (url.port && url.port !== "443") ||
      url.hostname.includes("%")
    ) return null;

    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      !host || (!host.includes(".") && !host.startsWith("[")) ||
      ["localhost", "localhost.localdomain", "local", "internal", "test", "invalid", "example"].includes(host) ||
      [".localhost", ".local", ".internal", ".home.arpa", ".test", ".invalid", ".example", ".lan", ".intranet"]
        .some(suffix => host.endsWith(suffix))
    ) return null;

    if (host.startsWith("[") && host.endsWith("]")) {
      if (!isPublicIPv6(host)) return null;
    } else if (/^[0-9.]+$/.test(host)) {
      if (!isPublicIPv4(host)) return null;
    }

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
    return reply({ error: "Enter a public HTTPS website. Private and local network addresses are blocked." }, 400);
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
    if (!next) return reply({ error: "Redirect to a private or unsupported destination blocked." }, 403);
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
    if (!["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(type.split(";")[0].trim())) {
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
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox allow-same-origin; base-uri 'none'; form-action 'none'; frame-ancestors " + FRAME_ANCESTORS
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

[executed on device: Mac-mini.local (55da0f6d-7960-443a-8b64-06def1776d0b)]