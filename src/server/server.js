import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

// Project's public folder for static files
const publicDirectory = path.resolve(currentDirectory, "../../public");

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");

  if (requestUrl.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Method Not Allowed");
    return;
  }

  const requestedPath =
    requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

  const filePath = path.resolve(publicDirectory, `.${requestedPath}`);

  if (
    filePath !== publicDirectory &&
    !filePath.startsWith(publicDirectory + path.sep)
  ) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const extension = path.extname(filePath);

    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
    };

    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });

    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  }
});

const port = Number(process.env.PORT) || 3000;

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});