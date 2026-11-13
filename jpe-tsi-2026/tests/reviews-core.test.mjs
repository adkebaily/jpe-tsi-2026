import test from "node:test";
import assert from "node:assert/strict";
import { isAdmin, listAll, listPublic, moderate, submit, MAX_PER_DAY } from "../netlify/lib/reviews-core.mjs";

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

test("limite d'envois par jour et par appareil", async () => {
  const store = fakeStore();
  for (let i = 0; i < MAX_PER_DAY; i++) assert.equal((await submit(store, valid, { ip: "2.2.2.2" })).status, 201);
  assert.equal((await submit(store, valid, { ip: "2.2.2.2" })).status, 429);
  assert.equal((await submit(store, valid, { ip: "3.3.3.3" })).status, 201);
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
