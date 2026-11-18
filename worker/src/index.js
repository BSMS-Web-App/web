/*
 * BSMS Web Cloud Browser — Cloudflare Worker
 * Destination requests run on Cloudflare, never on Vercel or the Mac.
 */
const ORIGINS = new Set([
  "https://bsms-web.com",
  "https://www.bsms-web.com",
  "https://bsms-web.vercel.app",
  "https://dev1.bsms-web.com",
  "https://bsms-web-dev1.vercel.app"
]);
const FRAME_ANCESTORS = [...ORIGINS].join(" ");
const TTL = 600;
const MAX = 25 * 1024 * 1024;
const MAX_FORM = 10 * 1024 * 1024;
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

async function accountValid(env, uid, sid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
      typeof sid !== "string" || sid.length < 16 || sid.length > 300) return false;
  const base = (env.BSMS_WEB_API_URL || "").replace(/\/+$/, "");
  if (!base || !env.BSMS_WEB_API_KEY) throw Error("Account verification is not configured");
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
    [0xc0000000n, 24], [0xc0000200n, 24], [0xc01fc400n, 24], [0xc034c100n, 24],
    [0xc0586300n, 24], [0xc0af3000n, 24], [0xc0a80000n, 16],
    [0xc6120000n, 15], [0xc6336400n, 24], [0xcb007100n, 24],
    [0xe0000000n, 4], [0xf0000000n, 4]
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
  if (!inRange(value, 0x20000000000000000000000000000000n, 3, 128)) return false;
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

function proxyUrl(value, token) {
  return "/page?url=" + encodeURIComponent(value) + "&token=" + encodeURIComponent(token);
}
function rewriteCss(css, base, token) {
  const rewrite = raw => {
    const value = String(raw || "").trim();
    if (!value || value.startsWith("#") || /^(data:|blob:)/i.test(value)) return value;
    const target = targetUrl(value, base);
    return target ? proxyUrl(target.href, token) : "about:blank";
  };
  let output = css.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi,
    (_match, doubleQuoted, singleQuoted, bare) =>
      'url("' + rewrite(doubleQuoted ?? singleQuoted ?? bare) + '")'
  );
  output = output.replace(
    /@import\s+(?:"([^"]+)"|'([^']+)')/gi,
    (_match, doubleQuoted, singleQuoted) =>
      '@import url("' + rewrite(doubleQuoted ?? singleQuoted) + '")'
  );
  return output;
}
function rewriteSrcset(value, base, token) {
  return String(value).split(/,(?=\s*(?:https?:|\/\/|\/|\.\/|\.\.\/|data:))/i).map(part => {
    const match = part.trim().match(/^(\S+)(\s+.*)?$/);
    if (!match) return part;
    const raw = match[1];
    if (/^data:/i.test(raw)) return part.trim();
    const target = targetUrl(raw, base);
    return (target ? proxyUrl(target.href, token) : "about:blank") + (match[2] || "");
  }).join(", ");
}

class Strip {
  element(element) { element.remove(); }
}
class MetaClean {
  element(element) {
    const equiv = (element.getAttribute("http-equiv") || "").toLowerCase();
    if (equiv === "refresh" || equiv === "content-security-policy") element.remove();
  }
}
class Clean {
  constructor(base, token) {
    this.base = base;
    this.token = token;
  }
  element(element) {
    for (const attribute of ["srcdoc", "integrity", "crossorigin", "autofocus"]) {
      element.removeAttribute(attribute);
    }
    const tag = element.tagName.toLowerCase();
    for (const attribute of ["href", "src", "action", "formaction", "poster", "data"]) {
      const raw = element.getAttribute(attribute);
      if (!raw) continue;
      if (
        raw.startsWith("#") ||
        /^(mailto:|tel:|data:|blob:)/i.test(raw)
      ) continue;
      const target = targetUrl(raw, this.base);
      if (!target) {
        element.removeAttribute(attribute);
        continue;
      }
      element.setAttribute(attribute, proxyUrl(target.href, this.token));
    }
    const srcset = element.getAttribute("srcset");
    if (srcset) element.setAttribute("srcset", rewriteSrcset(srcset, this.base, this.token));
    const style = element.getAttribute("style");
    if (style) element.setAttribute("style", rewriteCss(style, this.base, this.token));
    if (tag === "a") element.setAttribute("rel", "noreferrer noopener");
  }
}
class StyleText {
  constructor(base, token) { this.base = base; this.token = token; }
  text(text) {
    text.replace(rewriteCss(text.text, this.base, this.token), false);
  }
}
class Bootstrap {
  constructor(base, token, proxyOrigin) {
    this.base = base;
    this.token = token;
    this.proxyOrigin = proxyOrigin;
  }
  element(element) {
    const base = JSON.stringify(this.base).replace(/</g, "\\u003c");
    const token = JSON.stringify(this.token);
    const proxy = JSON.stringify(this.proxyOrigin);
    const script = `(function(){
      "use strict";
      var BASE=${base}, TOKEN=${token}, PROXY=${proxy};
      function toProxy(input){
        var raw = input instanceof Request ? input.url : String(input);
        if (/^(#|mailto:|tel:|data:|blob:)/i.test(raw)) return raw;
        var proxyCandidate;
        try { proxyCandidate = new URL(raw, PROXY); } catch (_) { return raw; }
        if (proxyCandidate.origin === PROXY && proxyCandidate.pathname === "/page" && proxyCandidate.searchParams.has("url")) return proxyCandidate.href;
        var target;
        try { target = new URL(raw, BASE); } catch (_) { return raw; }
        if (target.protocol === "data:" || target.protocol === "blob:") return raw;
        if (target.origin === PROXY) target = new URL(target.pathname + target.search + target.hash, BASE);
        if (target.protocol !== "https:") return raw;
        var endpoint = new URL("/page", PROXY);
        endpoint.searchParams.set("url", target.href);
        endpoint.searchParams.set("token", TOKEN);
        return endpoint.href;
      }
      var NativeRequest = window.Request;
      var nativeFetch = window.fetch.bind(window);
      window.fetch = function(input, init) {
        if (input instanceof NativeRequest) return nativeFetch(new NativeRequest(toProxy(input), input), init);
        return nativeFetch(toProxy(input), init);
      };
      function ReaderRequest(input, init) {
        return new NativeRequest(toProxy(input), init);
      }
      ReaderRequest.prototype = NativeRequest.prototype;
      Object.setPrototypeOf(ReaderRequest, NativeRequest);
      window.Request = ReaderRequest;
      var nativeOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url) {
        var args = Array.prototype.slice.call(arguments);
        args[1] = toProxy(url);
        return nativeOpen.apply(this, args);
      };
      function destinationFromProxy(value) {
        try {
          var parsed = new URL(value, PROXY);
          var nested = parsed.searchParams.get("url");
          return parsed.origin === PROXY && parsed.pathname === "/page" && nested ? nested : value;
        } catch (_) { return value; }
      }
      function reportLocation(mode) {
        window.parent.postMessage({
          type: "bsms-browser-location",
          url: destinationFromProxy(window.location.href),
          mode: mode || "push"
        }, "*");
      }
      var nativePushState = history.pushState.bind(history);
      var nativeReplaceState = history.replaceState.bind(history);
      history.pushState = function(state, title, url) {
        if (url == null) return nativePushState(state, title);
        var proxied = toProxy(url);
        var result = nativePushState(state, title, proxied);
        reportLocation("push");
        return result;
      };
      history.replaceState = function(state, title, url) {
        if (url == null) return nativeReplaceState(state, title);
        var proxied = toProxy(url);
        var result = nativeReplaceState(state, title, proxied);
        reportLocation("replace");
        return result;
      };
      window.addEventListener("popstate", function() { reportLocation("replace"); });
      window.addEventListener("hashchange", function() { reportLocation("replace"); });
      reportLocation("replace");
    })();`;
    element.prepend("<script>" + script + "</script>", { html: true });
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
        await reader.cancel("Browser response exceeded size limit").catch(() => {});
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

async function cors(req, url, env) {
  const origin = req.headers.get("Origin");
  if (!origin) return {};
  if (origin === "null" && url.pathname === "/page") {
    const identity = await readToken(url.searchParams.get("token"), env.READER_SIGNING_SECRET);
    if (!identity) return null;
    const requested = (req.headers.get("Access-Control-Request-Headers") || "")
      .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
    const allowed = requested.filter(name =>
      ["content-type", "authorization", "x-requested-with"].includes(name) || name.startsWith("x-")
    );
    if (allowed.length !== requested.length) return null;
    return {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": allowed.join(", ") || "Content-Type, Authorization, X-Requested-With",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    };
  }
  if (!ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-ID, X-UID",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  };
}

async function fetchPage(req, env, url, token) {
  const identity = await readToken(token, env.READER_SIGNING_SECRET);
  if (!identity || !await accountValid(env, identity.uid, identity.sid)) {
    return reply({ error: "Your Browser session expired. Sign in again." }, 401);
  }
  const method = req.method.toUpperCase();
  if (!["GET", "HEAD", "POST"].includes(method)) {
    return reply({ error: "This request method is not supported by Reader." }, 405);
  }
  const destination = targetUrl(url);
  if (!destination) {
    return reply({ error: "Enter a public HTTPS website. Private and local network addresses are blocked." }, 400);
  }

  let body;
  const requestHeaders = new Headers({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
    "Accept": req.headers.get("Accept") || "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": req.headers.get("Accept-Language") || "en-US,en;q=0.9"
  });
  const contentType = req.headers.get("Content-Type");
  if (contentType) requestHeaders.set("Content-Type", contentType);
  for (const [name, value] of req.headers) {
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower.startsWith("x-")) requestHeaders.set(name, value);
  }
  requestHeaders.set("Origin", destination.origin);
  requestHeaders.set("Referer", destination.href);
  if (method === "POST") {
    if (!contentType || !/^(application\/x-www-form-urlencoded|multipart\/form-data|text\/plain|application\/json)(;|$)/i.test(contentType)) {
      return reply({ error: "This form or request content type is not supported." }, 415);
    }
    body = await req.arrayBuffer();
    if (body.byteLength > MAX_FORM) return reply({ error: "Form submission exceeds the 10 MB limit." }, 413);
    requestHeaders.set("Content-Type", contentType);
  }

  let upstream;
  try {
    upstream = await fetch(destination.href, {
      method,
      headers: requestHeaders,
      body: method === "POST" ? body : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(20000)
    });
  } catch (error) {
    console.warn("[BSMS Reader upstream fetch failed]", destination.hostname, error?.name || "Error", error?.message || "Unknown error");
    return reply({
      error: "The destination could not be reached.",
      destination: destination.hostname,
      reason: error?.name || "Network error"
    }, 502);
  }

  if ([301, 302, 303, 307, 308].includes(upstream.status)) {
    const location = upstream.headers.get("Location");
    const next = location && targetUrl(location, destination);
    if (!next) return reply({ error: "Redirect to a private or unsupported destination blocked." }, 403);
    const redirectUrl = new URL(req.url);
    redirectUrl.searchParams.set("url", next.href);
    return Response.redirect(redirectUrl.toString(), upstream.status);
  }

  if (upstream.status >= 400) {
    console.warn("[BSMS Reader upstream response]", destination.hostname, upstream.status, upstream.headers.get("Content-Type") || "unknown");
  }

  const type = (upstream.headers.get("Content-Type") || "application/octet-stream").toLowerCase();
  const contentLength = Number(upstream.headers.get("Content-Length") || 0);
  if (contentLength > MAX) return reply({ error: "The destination response exceeds Browser's 25 MB limit." }, 413);

  const bytes = method === "HEAD" ? new Uint8Array() : await readLimited(upstream.body, MAX);
  if (bytes === null) return reply({ error: "The destination response exceeds Browser's 25 MB limit." }, 413);

  const responseHeaders = new Headers({
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store"
  });
  const upstreamDisposition = upstream.headers.get("Content-Disposition");
  if (upstreamDisposition) responseHeaders.set("Content-Disposition", upstreamDisposition);
  const upstreamType = upstream.headers.get("Content-Type");
  if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
  const status = upstream.status;

  if (type.includes("text/html") || type.includes("application/xhtml+xml")) {
    const proxyOrigin = new URL(req.url).origin;
    const transformed = new HTMLRewriter()
      .on("base,object,embed", new Strip())
      .on("meta", new MetaClean())
      .on("style", new StyleText(destination, token))
      .on("head", new Bootstrap(destination.href, token, proxyOrigin))
      .on("*", new Clean(destination, token))
      .transform(new Response(bytes, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      }));
    const headers = new Headers(transformed.headers);
    headers.set(
      "Content-Security-Policy",
      "default-src " + proxyOrigin + " data: blob:; " +
      "script-src " + proxyOrigin + " 'unsafe-inline' 'unsafe-eval' blob: https://www.gstatic.com https://www.google.com https://www.recaptcha.net; " +
      "style-src " + proxyOrigin + " 'unsafe-inline'; " +
      "img-src " + proxyOrigin + " data: blob:; " +
      "font-src " + proxyOrigin + " data: blob:; " +
      "media-src " + proxyOrigin + " blob:; " +
      "connect-src " + proxyOrigin + " https://www.google.com https://www.recaptcha.net https://www.gstatic.com; " +
      "frame-src " + proxyOrigin + " https://www.google.com https://www.recaptcha.net; " +
      "form-action " + proxyOrigin + "; " +
      "worker-src blob:; object-src 'none'; base-uri 'none'; " +
      "sandbox allow-scripts allow-forms allow-downloads allow-popups; " +
      "frame-ancestors " + FRAME_ANCESTORS
    );
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cache-Control", "private, no-store");
    headers.delete("Content-Length");
    return new Response(transformed.body, { status, headers });
  }

  if (type.includes("text/css")) {
    const css = rewriteCss(new TextDecoder().decode(bytes), destination, token);
    responseHeaders.set("Content-Type", "text/css; charset=utf-8");
    return new Response(css, { status, headers: responseHeaders });
  }

  if (type.startsWith("text/plain")) {
    responseHeaders.set("Content-Type", "text/html; charset=utf-8");
    responseHeaders.set("Content-Security-Policy", "default-src 'none'; sandbox");
    return new Response(
      "<!doctype html><meta charset=utf-8><pre style='white-space:pre-wrap'>" +
        esc(new TextDecoder().decode(bytes)) + "</pre>",
      { status, headers: responseHeaders }
    );
  }

  if (type.startsWith("image/") &&
      !["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml"].includes(type.split(";")[0].trim())) {
    return reply({ error: "This image format is not supported.", contentType: type }, 415);
  }

  if (type.startsWith("image/svg+xml")) {
    responseHeaders.set("Content-Security-Policy", "default-src 'none'; sandbox");
  }
  if (!responseHeaders.has("Content-Type")) {
    responseHeaders.set("Content-Type", "application/octet-stream");
  }
  return new Response(method === "HEAD" ? null : bytes, { status, headers: responseHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = await cors(request, url, env);
    if (corsHeaders === null) return reply({ error: "Origin not allowed." }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return reply({
          service: "BSMS Web Cloud Browser",
          status: "ok",
          egress: "cloudflare"
        }, 200, corsHeaders);
      }
      if (url.pathname === "/session" && request.method === "POST") {
        const uid = request.headers.get("X-UID") || "";
        const sid = request.headers.get("X-Session-ID") || "";
        if (!await accountValid(env, uid, sid)) {
          return reply({ error: "Sign in and accept the current policies to use Reader." }, 401, corsHeaders);
        }
        return reply({
          token: await signToken(uid, sid, env.READER_SIGNING_SECRET),
          expiresIn: TTL * 1000
        }, 200, corsHeaders);
      }
      if (url.pathname === "/page" && ["GET", "HEAD", "POST"].includes(request.method)) {
        const destinationUrl = url.searchParams.get("url");
        if (!destinationUrl) return reply({ error: "A destination URL is required." }, 400, corsHeaders);
        let destination;
        try {
          destination = new URL(destinationUrl);
        } catch {
          return reply({ error: "The destination URL is invalid." }, 400, corsHeaders);
        }
        for (const [name, value] of url.searchParams) {
          if (name !== "url" && name !== "token") destination.searchParams.append(name, value);
        }
        const response = await fetchPage(
          request,
          env,
          destination.href,
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
      console.error("[BSMS Reader]", error?.name || "Error", error?.message || error);
      return reply({
        error: "Browser service temporarily unavailable.",
        reason: error?.name || "Internal error"
      }, 503, corsHeaders);
    }
  }
};
