import { createServer } from "node:http";

const port = Number(process.env.PORT || 8788);
const host = process.env.HOST || "127.0.0.1";

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(JSON.stringify({
      service: "bsms-web-proxy",
      status: "ok",
      stage: "foundation"
    }));
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
  console.log(`BSMS Web Proxy foundation listening on http://${host}:${port}`);
});
