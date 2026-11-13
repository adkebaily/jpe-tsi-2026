import test from "node:test";
import assert from "node:assert/strict";
import {
  adminGate, isAdmin, listAll, listPublic, moderate, recordVisit, submit, visitStats,
  MAX_LOGIN_FAILS, MAX_PER_DAY, MAX_VISITS_PER_DAY,
} from "../netlify/lib/reviews-core.mjs";

// Faux store en mémoire, avec la même interface que Netlify Blobs.
function fakeStore() {
  const data = new Map();
  return {
    async get(key) { return data.has(key) ? JSON.parse(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, JSON.stringify(value)); },
    async delete(key) { data.delete(key); },
    async list({ prefix = "" } = {}) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}

const valid = { rating: 5, comment: "Des échanges utiles avec les étudiants.", name: "Camille Durand", role: "pro" };

test("un avis envoyé reste invisible tant qu'il n'est pas approuvé", async () => {
  const store = fakeStore();
  assert.equal((await submit(store, valid, { ip: "1.1.1.1" })).status, 201);
  assert.equal((await listPublic(store)).reviews.length, 0);

  const [pending] = (await listAll(store)).reviews;
  assert.equal(pending.status, "pending");

  assert.equal((await moderate(store, { id: pending.id, action: "approve" })).status, 200);
  const pub = await listPublic(store);
  assert.equal(pub.reviews.length, 1);
  assert.deepEqual(pub.stats, { count: 1, avg: 5 });
  assert.equal(pub.reviews[0].status, undefined, "le statut ne sort pas dans la vue publique");
});

test("la moyenne est arrondie à une décimale", async () => {
  const store = fakeStore();
  for (const rating of [5, 4, 4]) await submit(store, { ...valid, rating }, { ip: `ip-${rating}-${Math.random()}` });
  for (const r of (await listAll(store)).reviews) await moderate(store, { id: r.id, action: "approve" });
  assert.deepEqual((await listPublic(store)).stats, { count: 3, avg: 4.3 });
});

test("une note et un commentaire suffisent : nom et profil sont facultatifs", async () => {
  const store = fakeStore();
  assert.equal((await submit(store, { rating: 4, comment: "Très bien organisé." }, { ip: "x" })).status, 201);
  const [r] = (await listAll(store)).reviews;
  assert.equal(r.name, "");
  assert.equal(r.role, "");
});

test("refuser ou supprimer retire l'avis de la page", async () => {
  const store = fakeStore();
  await submit(store, valid, { ip: "1.1.1.1" });
  const [r] = (await listAll(store)).reviews;
  await moderate(store, { id: r.id, action: "approve" });
  await moderate(store, { id: r.id, action: "reject" });
  assert.equal((await listPublic(store)).reviews.length, 0);
  await moderate(store, { id: r.id, action: "delete" });
  assert.equal((await listAll(store)).reviews.length, 0);
});

test("sans note ou sans commentaire, l'avis est refusé", async () => {
  const store = fakeStore();
  const res = await submit(store, { rating: 9, comment: "ok", role: "hacker" }, { ip: "x" });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(res.body.errors).sort(), ["comment", "rating"]);
  assert.equal((await listAll(store)).reviews.length, 0);
});

test("le champ piège ne stocke rien", async () => {
  const store = fakeStore();
  assert.equal((await submit(store, { ...valid, website: "http://spam" }, { ip: "x" })).status, 201);
  assert.equal((await listAll(store)).reviews.length, 0);
});

test("limite d'envois par jour et par adresse (large : toute la salle partage le Wi-Fi)", async () => {
  const store = fakeStore();
  for (let i = 0; i < MAX_PER_DAY; i++) assert.equal((await submit(store, valid, { ip: "2.2.2.2" })).status, 201);
  assert.equal((await submit(store, valid, { ip: "2.2.2.2" })).status, 429);
  assert.equal((await submit(store, valid, { ip: "3.3.3.3" })).status, 201);
  assert.ok(MAX_PER_DAY >= 100, "une promotion entière doit pouvoir donner son avis depuis le même réseau");
});

test("le texte est nettoyé et tronqué", async () => {
  const store = fakeStore();
  await submit(store, { ...valid, name: "  Camille\n\tDurand  ", comment: "x".repeat(2000) }, { ip: "x" });
  const [r] = (await listAll(store)).reviews;
  assert.equal(r.name, "Camille Durand");
  assert.equal(r.comment.length, 600);
});

test("mot de passe admin", () => {
  assert.equal(isAdmin("secret", "secret"), true);
  assert.equal(isAdmin("secreT", "secret"), false);
  assert.equal(isAdmin("", "secret"), false);
  assert.equal(isAdmin("secret", undefined), false);
});

test("identifiant ou action invalides", async () => {
  const store = fakeStore();
  assert.equal((await moderate(store, { id: "../public/approved", action: "delete" })).status, 400);
  assert.equal((await moderate(store, { id: "abcdef-12345678", action: "approve" })).status, 404);
});

test("admin : mot de passe absent, trop court, faux, puis bon", async () => {
  const store = fakeStore();
  const good = "un-mot-de-passe-long";
  assert.equal((await adminGate(store, { given: "x", expected: undefined, ip: "a" })).status, 503);
  assert.equal((await adminGate(store, { given: "court", expected: "court", ip: "a" })).status, 503);
  assert.equal((await adminGate(store, { given: "faux", expected: good, ip: "a" })).status, 401);
  assert.equal((await adminGate(store, { given: good, expected: good, ip: "a" })).ok, true);
});

test("admin : une adresse est bloquée après trop d'essais ratés, pas les autres", async () => {
  const store = fakeStore();
  const good = "un-mot-de-passe-long";
  for (let i = 0; i < MAX_LOGIN_FAILS; i++)
    assert.equal((await adminGate(store, { given: `essai-${i}`, expected: good, ip: "attaquant" })).status, 401);
  // Même avec le bon mot de passe, cette adresse reste bloquée pour l'heure en cours.
  assert.equal((await adminGate(store, { given: good, expected: good, ip: "attaquant" })).status, 429);
  assert.equal((await adminGate(store, { given: good, expected: good, ip: "equipe" })).ok, true);
});

test("visites : comptées par jour et par canal, canal inconnu rangé dans autre", async () => {
  const store = fakeStore();
  const day1 = Date.parse("2026-11-19T10:00:00Z");
  const day2 = Date.parse("2026-11-20T10:00:00Z");
  await recordVisit(store, { src: "qr", ip: "a", now: day2 });
  await recordVisit(store, { src: "qr", ip: "b", now: day2 });
  await recordVisit(store, { src: "linkedin", ip: "c", now: day1 });
  await recordVisit(store, { src: "<script>", ip: "d", now: day1 });
  assert.deepEqual(await visitStats(store), {
    total: 4,
    bySource: { qr: 2, linkedin: 1, autre: 1 },
    byDay: { "2026-11-20": 2, "2026-11-19": 2 },
  });
});

test("visites : plafond par adresse et par jour", async () => {
  const store = fakeStore();
  for (let i = 0; i < MAX_VISITS_PER_DAY + 10; i++) await recordVisit(store, { src: "qr", ip: "robot" });
  assert.equal((await visitStats(store)).total, MAX_VISITS_PER_DAY);
});

test("aucune adresse IP n'est stockée en clair", async () => {
  const store = fakeStore();
  await submit(store, valid, { ip: "203.0.113.77" });
  await recordVisit(store, { src: "qr", ip: "203.0.113.77" });
  await adminGate(store, { given: "faux", expected: "un-mot-de-passe-long", ip: "203.0.113.77" });
  const { blobs } = await store.list();
  assert.ok(blobs.length >= 5);
  for (const { key } of blobs) {
    assert.ok(!key.includes("203.0.113.77"), key);
    assert.ok(!JSON.stringify(await store.get(key)).includes("203.0.113.77"), key);
  }
});
