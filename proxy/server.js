import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(currentDirectory, "client");
const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";
const SITE_ORIGIN = new URL("https://bsms-web.com");
const ALLOWED_HOSTS = new Set(["bsms-web.com", "www.bsms-web.com"]);
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
const RATE_LIMIT_MS = 15000;
const lastCheckByClient = new Map();

const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

function isPublicIpv4(address) {
  if (isIP(address) !== 4) return false;
  const octets = address.split(".").map(Number);
  const [a, b, c] = octets;

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 0 || b === 168)) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  if (a === 255) return false;
  return true;
}

function isPublicIpv6(address) {
  if (isIP(address) !== 6) return false;
  const value = address.toLowerCase();

  // Only accept global-unicast space. This excludes loopback, link-local,
  // unique-local, multicast, IPv4-mapped, and most special-purpose ranges.
  const firstHextet = Number.parseInt(value.split(":")[0] || "0", 16);
  if (firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
  if (value.startsWith("2001:db8:") || value.startsWith("2001:2:") ||
      value.startsWith("2001:10:") || value.startsWith("2002:")) return false;
  return true;
}

async function assertAllowedDestination(url) {
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname) ||
      url.port || url.username || url.password) {
    throw new Error("Destination is not permitted.");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => {
    return isIP(address) === 4
      ? !isPublicIpv4(address)
      : !isPublicIpv6(address);
  })) {
    throw new Error("Destination did not resolve exclusively to public addresses.");
  }
}

function validateSitePath(value) {
  if (typeof value !== "string" || value.length > 1024 ||
      !value.startsWith("/") || value.startsWith("//") ||
      value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error("Enter a path on bsms-web.com, such as / or /accounts.");
  }

  const target = new URL(value, SITE_ORIGIN);
  if (target.origin !== SITE_ORIGIN.origin || target.hash) {
    throw new Error("Only paths on bsms-web.com are supported.");
  }
  return target;
}

async function readLimitedBody(response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("The destination response exceeded the size limit.");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

async function requestOwnedSite(startUrl) {
  let target = startUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertAllowedDestination(target);

    const upstream = await fetch(target, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html",
        "user-agent": "BSMS-Web-Proxy-Preview/0.1"
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      await upstream.body?.cancel();

      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("The destination redirected too many times.");
      }

      const nextTarget = new URL(location, target);
      if (nextTarget.origin !== SITE_ORIGIN.origin) {
        throw new Error("Cross-site redirects are not permitted in this test.");
      }
      target = nextTarget;
      continue;
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) {
      await upstream.body?.cancel();
      throw new Error("The destination did not return an HTML page.");
    }

    const body = await readLimitedBody(upstream);
    const html = body.toString("utf8");
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch
      ? titleMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 160)
      : "No page title found";

    return {
      statusCode: upstream.status,
      title,
      contentType: contentType.split(";")[0],
      bytesReceived: body.byteLength,
      finalPath: target.pathname
    };
  }

  throw new Error("The destination could not be reached.");
}

function isRateLimited(request) {
  const clientKey = request.socket.remoteAddress || "unknown";
  const now = Date.now();

  for (const [key, timestamp] of lastCheckByClient) {
    if (now - timestamp > RATE_LIMIT_MS * 4) lastCheckByClient.delete(key);
  }

  const previousCheck = lastCheckByClient.get(clientKey) || 0;
  if (now - previousCheck < RATE_LIMIT_MS) return true;
  lastCheckByClient.set(clientKey, now);
  return false;
}

const server = createServer(async (request, response) => {
  let requestPath;
  try {
    requestPath = new URL(request.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(response, 400, { error: "Invalid request path." });
    return;
  }

  if (request.method === "GET" && requestPath === "/health") {
    sendJson(response, 200, {
      service: "bsms-web-proxy",
      status: "ok",
      stage: "owned-site-request-test"
    });
    return;
  }

  if (request.method === "GET" &&
      (requestPath === "/api/egress-check" || requestPath === "/api/site-check")) {
    if (isRateLimited(request)) {
      sendJson(response, 429, { error: "Please wait a few seconds before testing again." });
      return;
    }

    try {
      if (requestPath === "/api/egress-check") {
        const upstream = await fetch("https://api.ipify.org?format=json", {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        if (!upstream.ok) throw new Error("Outbound IP provider returned an error.");
        const data = await upstream.json();
        if (typeof data.ip !== "string" || data.ip.length > 64) {
          throw new Error("Unexpected outbound IP response.");
        }

        sendJson(response, 200, {
          status: "ok",
          outboundIp: data.ip,
          note: "This is the public IP used by this server for the test request."
        });
        return;
      }

      const incomingUrl = new URL(request.url || "/", "http://localhost");
      const target = validateSitePath(incomingUrl.searchParams.get("path") || "/");
      const result = await requestOwnedSite(target);

      sendJson(response, 200, {
        status: "ok",
        destination: SITE_ORIGIN.hostname,
        ...result,
        note: "The server fetched this page. The page content is not executed or forwarded to your browser."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The request failed.";
      const status = message.includes("Enter a path") ||
        message.includes("Only paths") ||
        message.includes("Destination is not permitted") ? 400 : 502;
      sendJson(response, status, { error: message });
    }
    return;
  }

  const publicFile = publicFiles.get(requestPath);
  if (request.method === "GET" && publicFile) {
    const [fileName, contentType] = publicFile;
    const filePath = path.join(clientDirectory, fileName);

    try {
      const fileInfo = statSync(filePath);
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": fileInfo.size,
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff"
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Unable to load the interface.");
    }
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, host, () => {
  console.log(`BSMS Web Proxy preview listening on http://${host}:${port}`);
});
