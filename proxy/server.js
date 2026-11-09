import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(currentDirectory, "client");
const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";
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

const server = createServer(async (request, response) => {
  const requestPath = new URL(request.url || "/", "http://localhost").pathname;

  if (request.method === "GET" && requestPath === "/health") {
    sendJson(response, 200, {
      service: "bsms-web-proxy",
      status: "ok",
      stage: "outbound-check"
    });
    return;
  }

  if (request.method === "GET" && requestPath === "/api/egress-check") {
    const clientKey = request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const previousCheck = lastCheckByClient.get(clientKey) || 0;

    if (now - previousCheck < 15000) {
      sendJson(response, 429, {
        error: "Please wait a few seconds before testing again."
      });
      return;
    }

    lastCheckByClient.set(clientKey, now);

    // This destination is fixed. The endpoint never accepts a caller-supplied URL.
    try {
      const upstream = await fetch("https://api.ipify.org?format=json", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(7000)
      });

      if (!upstream.ok) {
        throw new Error("Outbound IP provider returned an error.");
      }

      const data = await upstream.json();
      if (typeof data.ip !== "string" || data.ip.length > 64) {
        throw new Error("Unexpected outbound IP response.");
      }

      sendJson(response, 200, {
        status: "ok",
        outboundIp: data.ip,
        note: "This is the public IP used by this server for the test request."
      });
    } catch {
      sendJson(response, 502, {
        error: "The outbound connection test failed. Try again later."
      });
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

  sendJson(response, 404, {
    error: "Not found",
    message: "This route is not available."
  });
});

server.listen(port, host, () => {
  console.log(`BSMS Web Proxy preview listening on http://${host}:${port}`);
});
