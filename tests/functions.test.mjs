// Teste les deux fonctions Netlify telles qu'elles tourneront en production :
// vrai client @netlify/blobs, branché sur le serveur Blobs local fourni par la bibliothèque.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";

let server, directory, reviews, admin, hit;
const url = (path) => `https://jpe.example${path}`;
const post = (path, body, headers = {}) =>
  new Request(url(path), { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const TOKEN = "secret-de-test-long";
const auth = { authorization: `Bearer ${TOKEN}` };
const valid = { rating: 5, comment: "Des échanges utiles avec les étudiants.", name: "Camille Durand", role: "pro" };

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "jpe-blobs-"));
  server = new BlobsServer({ directory, token: "local-token" });
  const { port } = await server.start();
  const context = { edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}`, siteID: "site-test", token: "local-token" };
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify(context)).toString("base64");
  process.env.ADMIN_TOKEN = TOKEN;
  reviews = (await import("../netlify/functions/reviews.mjs")).default;
  admin = (await import("../netlify/functions/admin-reviews.mjs")).default;
  hit = (await import("../netlify/functions/hit.mjs")).default;
});

after(async () => {
  await server.stop();
  await rm(directory, { recursive: true, force: true });
});

test("parcours complet : envoi, validation, publication", async () => {
  let res = await reviews(new Request(url("/api/reviews")), { ip: "1.2.3.4" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { reviews: [], stats: { count: 0, avg: null } });

  res = await reviews(post("/api/reviews", valid), { ip: "1.2.3.4" });
  assert.equal(res.status, 201);

  res = await reviews(post("/api/reviews", { comment: "sans note" }), { ip: "1.2.3.4" });
  assert.equal(res.status, 400);

  res = await reviews(new Request(url("/api/reviews"), { method: "POST", body: "pas du json", headers: { "content-type": "application/json" } }), { ip: "1.2.3.4" });
  assert.equal(res.status, 400);

  // Un formulaire posté depuis un autre site (sans JSON) est refusé.
  res = await reviews(new Request(url("/api/reviews"), { method: "POST", body: "rating=5&comment=spam+spam", headers: { "content-type": "application/x-www-form-urlencoded" } }), { ip: "1.2.3.4" });
  assert.equal(res.status, 415);

  assert.equal((await admin(new Request(url("/api/admin/reviews")), { ip: "5.5.5.5" })).status, 401);
  assert.equal((await admin(new Request(url("/api/admin/reviews"), { headers: { authorization: "Bearer faux" } }), { ip: "5.5.5.5" })).status, 401);

  res = await admin(new Request(url("/api/admin/reviews"), { headers: auth }), { ip: "7.7.7.7" });
  assert.equal(res.status, 200);
  const all = (await res.json()).reviews;
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "pending");

  res = await admin(post("/api/admin/reviews", { id: all[0].id, action: "approve" }, auth), { ip: "7.7.7.7" });
  assert.equal(res.status, 200);

  res = await reviews(new Request(url("/api/reviews")), { ip: "9.9.9.9" });
  const pub = await res.json();
  assert.equal(pub.reviews.length, 1);
  assert.equal(pub.reviews[0].name, "Camille Durand");
  assert.deepEqual(pub.stats, { count: 1, avg: 5 });

  res = await admin(post("/api/admin/reviews", { id: all[0].id, action: "delete" }, auth), { ip: "7.7.7.7" });
  assert.equal(res.status, 200);
  assert.equal((await (await reviews(new Request(url("/api/reviews")), {})).json()).reviews.length, 0);
});

test("sans ADMIN_TOKEN configuré, l'admin est fermé", async () => {
  const saved = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  assert.equal((await admin(new Request(url("/api/admin/reviews"), { headers: auth }), { ip: "7.7.7.7" })).status, 503);
  process.env.ADMIN_TOKEN = saved;
});

test("méthode non prévue", async () => {
  assert.equal((await reviews(new Request(url("/api/reviews"), { method: "DELETE" }), {})).status, 405);
});

test("compteur de visites : /api/hit puis lecture côté admin", async () => {
  assert.equal((await hit(post("/api/hit", { src: "qr" }), { ip: "8.8.8.1" })).status, 204);
  assert.equal((await hit(post("/api/hit", { src: "linkedin" }), { ip: "8.8.8.2" })).status, 204);
  assert.equal((await hit(new Request(url("/api/hit"), { method: "POST", body: "n'importe quoi" }), { ip: "8.8.8.3" })).status, 204);
  assert.equal((await hit(new Request(url("/api/hit")), { ip: "8.8.8.4" })).status, 405);

  const res = await admin(new Request(url("/api/admin/reviews"), { headers: auth }), { ip: "7.7.7.7" });
  const { visits } = await res.json();
  assert.equal(visits.total, 3);
  assert.deepEqual(visits.bySource, { qr: 1, linkedin: 1, autre: 1 });
});
