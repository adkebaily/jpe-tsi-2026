// Serveur local pour essayer le site complet sans compte Netlify :
//   npm run local   ->  http://localhost:8888
// Il sert dist/ et reproduit les deux routes /api avec un stockage en mémoire
// (les avis disparaissent à l'arrêt). Mot de passe admin local : "test".
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { isAdmin, listAll, listPublic, moderate, submit } from "../netlify/lib/reviews-core.mjs";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const PORT = Number(process.env.PORT ?? 8888);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "test";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2",
  ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".png": "image/png",
  ".ics": "text/calendar; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

const data = new Map();
const store = {
  async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
  async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
  async delete(key) { data.delete(key); },
  async list({ prefix = "" } = {}) {
    return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
  },
};

const readBody = async (req) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw); } catch { return null; }
};
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/reviews") {
    if (req.method === "GET") return send(res, 200, await listPublic(store));
    const result = await submit(store, await readBody(req), { ip: req.socket.remoteAddress });
    return send(res, result.status, result.body);
  }

  if (url.pathname === "/api/admin/reviews") {
    const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!isAdmin(given, ADMIN_TOKEN)) return send(res, 401, { ok: false, message: "Mot de passe incorrect." });
    if (req.method === "GET") return send(res, 200, await listAll(store));
    const result = await moderate(store, (await readBody(req)) ?? {});
    return send(res, result.status, result.body);
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  else if (!extname(path)) path += "/index.html";
  try {
    const file = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Page introuvable");
  }
}).listen(PORT, () => console.log(`JPE TSI 2026 : http://localhost:${PORT}  (admin : /admin, mot de passe "${ADMIN_TOKEN}")`));
