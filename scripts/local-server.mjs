// Serveur local pour essayer le site complet sans compte Netlify :
//   npm run local   ->  http://localhost:8888
// Il sert dist/ avec les mêmes en-têtes de sécurité que netlify.toml, et reproduit les routes /api
// avec un stockage en mémoire (tout disparaît à l'arrêt). Mot de passe admin local : "jpe-local-test".
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { adminGate, listAll, listPublic, moderate, recordVisit, submit, visitStats } from "../netlify/lib/reviews-core.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 8888);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "jpe-local-test";
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2",
  ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".png": "image/png",
  ".ics": "text/calendar; charset=utf-8", ".txt": "text/plain; charset=utf-8",
};

// Les en-têtes du bloc "/*" de netlify.toml, pour tester la politique de sécurité en local.
const SECURITY = (() => {
  const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
  const block = toml.split("[[headers]]").find((part) => /for\s*=\s*"\/\*"/.test(part)) ?? "";
  return Object.fromEntries(
    [...block.matchAll(/^\s*([A-Za-z-]+)\s*=\s*"(.*)"\s*$/gm)]
      .filter(([, name]) => !["for", "Strict-Transport-Security"].includes(name))
      .map(([, name, value]) => [name, value.replace("; upgrade-insecure-requests", "")]),
  );
})();

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
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...SECURITY });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const ip = req.socket.remoteAddress;

  if (url.pathname === "/api/reviews") {
    if (req.method === "GET") return send(res, 200, await listPublic(store));
    if (!(req.headers["content-type"] ?? "").includes("application/json")) return send(res, 415, { ok: false });
    const result = await submit(store, await readBody(req), { ip });
    return send(res, result.status, result.body);
  }

  if (url.pathname === "/api/hit") {
    await recordVisit(store, { src: String((await readBody(req))?.src ?? ""), ip });
    return send(res, 204);
  }

  if (url.pathname === "/api/admin/reviews") {
    const given = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const gate = await adminGate(store, { given, expected: ADMIN_TOKEN, ip });
    if (!gate.ok) return send(res, gate.status, { ok: false, message: gate.message });
    if (req.method === "GET") return send(res, 200, { ...(await listAll(store)), visits: await visitStats(store) });
    const result = await moderate(store, (await readBody(req)) ?? {});
    return send(res, result.status, result.body);
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  else if (!extname(path)) path += "/index.html";
  try {
    const file = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", ...SECURITY });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Page introuvable");
  }
}).listen(PORT, () => console.log(`JPE TSI 2026 : http://localhost:${PORT}  (admin : /admin, mot de passe "${ADMIN_TOKEN}")`));
