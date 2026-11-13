// Logique des avis, indépendante de Netlify : elle reçoit un "store" (Netlify Blobs
// en production, un faux store en mémoire dans les tests).
//
// Clés utilisées dans le store :
//   review/<id>        un avis complet, avec son statut (pending | approved | rejected)
//   public/approved    la liste des avis approuvés, prête à être servie à la page
//   rate/<jour>/<ip>   compteur d'envois par jour et par adresse (adresse hachée)

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const ROLES = ["pro", "m2", "m1", "autre"];
export const MAX_PER_DAY = 5;
export const MAX_REVIEWS = 1000;

const LIMITS = { name: 60, commentMin: 5, commentMax: 600 };

const clean = (value, max) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// Un avis = une note sur 5 et un commentaire. Le nom et le profil sont facultatifs.
export function validate(body) {
  const errors = {};
  const n = Number(body?.rating);
  const rating = Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
  const comment = clean(body?.comment, LIMITS.commentMax);
  const name = clean(body?.name, LIMITS.name);
  const role = ROLES.includes(body?.role) ? body.role : "";

  if (!rating) errors.rating = "Choisissez une note de 1 à 5 étoiles.";
  if (comment.length < LIMITS.commentMin) errors.comment = "Écrivez quelques mots.";

  return { ok: Object.keys(errors).length === 0, errors, value: { rating, comment, name, role } };
}

const hashIp = (ip) => createHash("sha256").update(String(ip || "inconnu")).digest("hex").slice(0, 24);
const today = (now) => new Date(now).toISOString().slice(0, 10);

const publicView = ({ id, name, role, rating, comment, createdAt }) => ({
  id, name, role, rating, comment, createdAt,
});

async function readAll(store) {
  const { blobs } = await store.list({ prefix: "review/" });
  const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function stats(reviews) {
  const avg = reviews.length
    ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
    : null;
  return { count: reviews.length, avg };
}

async function rebuildPublic(store) {
  const approved = (await readAll(store)).filter((r) => r.status === "approved").map(publicView);
  const payload = { reviews: approved, stats: stats(approved) };
  await store.setJSON("public/approved", payload);
  return payload;
}

/** Avis approuvés, pour la page publique. */
export async function listPublic(store) {
  return (await store.get("public/approved", { type: "json" })) ?? { reviews: [], stats: stats([]) };
}

/** Enregistre un avis en attente de validation. */
export async function submit(store, body, { ip, now = Date.now() } = {}) {
  // Champ piège : invisible pour une personne, rempli par les robots. On répond "ok" sans rien stocker.
  if (clean(body?.website, 200)) return { status: 201, body: { ok: true } };

  const { ok, errors, value } = validate(body);
  if (!ok) return { status: 400, body: { ok: false, errors } };

  const rateKey = `rate/${today(now)}/${hashIp(ip)}`;
  const sent = Number((await store.get(rateKey, { type: "json" }))?.count ?? 0);
  if (sent >= MAX_PER_DAY)
    return { status: 429, body: { ok: false, message: "Trop d'avis envoyés aujourd'hui depuis cet appareil." } };

  const { blobs } = await store.list({ prefix: "review/" });
  if (blobs.length >= MAX_REVIEWS)
    return { status: 503, body: { ok: false, message: "Le formulaire est fermé." } };

  const id = `${new Date(now).getTime().toString(36)}-${randomUUID().slice(0, 8)}`;
  const review = { id, ...value, status: "pending", createdAt: new Date(now).toISOString() };
  await store.setJSON(`review/${id}`, review);
  await store.setJSON(rateKey, { count: sent + 1 });
  return { status: 201, body: { ok: true } };
}

/** Vérifie le mot de passe admin sans fuite de temps de comparaison. */
export function isAdmin(given, expected) {
  if (!expected || !given) return false;
  const a = createHash("sha256").update(String(given)).digest();
  const b = createHash("sha256").update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

/** Tous les avis, tous statuts confondus, pour la page d'administration. */
export async function listAll(store) {
  return { reviews: await readAll(store) };
}

/** Approuve, refuse ou supprime un avis, puis reconstruit la liste publique. */
export async function moderate(store, { id, action }) {
  const key = `review/${String(id ?? "")}`;
  if (!/^review\/[a-z0-9-]{6,40}$/.test(key)) return { status: 400, body: { ok: false, message: "Identifiant invalide." } };

  const review = await store.get(key, { type: "json" });
  if (!review) return { status: 404, body: { ok: false, message: "Avis introuvable." } };

  if (action === "delete") {
    await store.delete(key);
  } else if (action === "approve" || action === "reject") {
    await store.setJSON(key, { ...review, status: action === "approve" ? "approved" : "rejected" });
  } else {
    return { status: 400, body: { ok: false, message: "Action inconnue." } };
  }

  await rebuildPublic(store);
  return { status: 200, body: { ok: true } };
}
