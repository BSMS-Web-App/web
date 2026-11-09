import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDirectory = path.join(currentDirectory, "client");
const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";

const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);

const server = createServer((request, response) => {
  const requestPath = new URL(request.url || "/", "http://localhost").pathname;

  if (request.method === "GET" && requestPath === "/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(JSON.stringify({
      service: "bsms-web-proxy",
      status: "ok",
      stage: "interface-preview"
    }));
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

  response.writeHead(404, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify({
    error: "Not found",
    message: "The proxy gateway has not been implemented yet."
  }));
});

server.listen(port, host, () => {
  console.log(`BSMS Web Proxy preview listening on http://${host}:${port}`);
});
