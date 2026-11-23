/* Server statis lokal untuk uji SIPAJAGA: node tools/serve.js [port] */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const port = Number(process.argv[2]) || 8080;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon"
};
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.join(root, url === "/" ? "index.html" : url);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (e, buf) => {
      if (e) { res.writeHead(404, { "Content-Type": "text/plain" }).end("404"); return; }
      res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(buf);
    });
  });
}).listen(port, () => console.log("SIPAJAGA: http://localhost:" + port));
