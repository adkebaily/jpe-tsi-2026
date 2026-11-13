// Logique des avis, indépendante de Netlify : elle reçoit un "store" (Netlify Blobs
// en production, un faux store en mémoire dans les tests).
//
// Clés utilisées dans le store :
//   review/<id>        un avis complet, avec son statut (pending | approved | rejected)
//   public/approved    la liste des avis approuvés, prête à être servie à la page
//   rate/<jour>/<ip>   compteur d'avis envoyés par jour et par adresse
//   visit/<jour>/<canal>/<id>   une visite de la page (aucune donnée sur le visiteur)
//   vrate/<jour>/<ip>  compteur de visites par jour et par adresse
//   lock/<heure>/<ip>  essais ratés du mot de passe admin
//
// Les adresses IP ne sont jamais stockées : seulement une empreinte, qui change chaque jour.

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const ROLES = ["pro", "m2", "m1", "autre"];
// Les plafonds par adresse sont larges exprès : le jour J, toute la salle passe par le Wi-Fi
// du campus et partage donc la même adresse publique. Ils arrêtent un robot, pas un amphithéâtre.
export const MAX_PER_DAY = 150;
export const MAX_REVIEWS = 1000;
export const MAX_VISITS_PER_DAY = 3000;
export const MAX_LOGIN_FAILS = 20;
export const MIN_TOKEN_LENGTH = 12;
export const SOURCES = ["qr", "linkedin", "email", "whatsapp", "affiche", "direct"];

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

const today = (now) => new Date(now).toISOString().slice(0, 10);
// Empreinte de l'adresse, mélangée à la date : impossible de suivre quelqu'un d'un jour à l'autre.
const hashIp = (ip, now) =>
  createHash("sha256").update(`${today(now)}|${String(ip || "inconnu")}`).digest("hex").slice(0, 24);

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

  const rateKey = `rate/${today(now)}/${hashIp(ip, now)}`;
  const sent = Number((await store.get(rateKey, { type: "json" }))?.count ?? 0);
  if (sent >= MAX_PER_DAY)
    return { status: 429, body: { ok: false, message: "Trop d'avis envoyés aujourd'hui depuis ce réseau." } };

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

/**
 * Contrôle d'accès de l'administration.
 * Refuse un mot de passe trop court côté serveur, et bloque une adresse après trop d'essais ratés.
 */
export async function adminGate(store, { given, expected, ip, now = Date.now() }) {
  if (!expected)
    return { ok: false, status: 503, message: "ADMIN_TOKEN n'est pas configuré sur Netlify." };
  if (String(expected).length < MIN_TOKEN_LENGTH)
    return { ok: false, status: 503, message: `ADMIN_TOKEN est trop court : ${MIN_TOKEN_LENGTH} caractères minimum.` };

  const hour = new Date(now).toISOString().slice(0, 13);
  const lockKey = `lock/${hour}/${hashIp(ip, now)}`;
  const fails = Number((await store.get(lockKey, { type: "json" }))?.count ?? 0);
  if (fails >= MAX_LOGIN_FAILS)
    return { ok: false, status: 429, message: "Trop d'essais depuis ce réseau. Réessayez dans une heure, ou passez en 4G." };

  if (!isAdmin(given, expected)) {
    await store.setJSON(lockKey, { count: fails + 1 });
    return { ok: false, status: 401, message: "Mot de passe incorrect." };
  }
  return { ok: true };
}

/** Compte une visite. `src` est le canal d'arrivée (?src=linkedin, ?src=qr…). */
export async function recordVisit(store, { src, ip, now = Date.now() } = {}) {
  const source = SOURCES.includes(src) ? src : "autre";
  const day = today(now);
  const rateKey = `vrate/${day}/${hashIp(ip, now)}`;
  const seen = Number((await store.get(rateKey, { type: "json" }))?.count ?? 0);
  if (seen >= MAX_VISITS_PER_DAY) return { status: 204 };
  await store.setJSON(`visit/${day}/${source}/${randomUUID().slice(0, 12)}`, 1);
  await store.setJSON(rateKey, { count: seen + 1 });
  return { status: 204 };
}

/** Visites par jour et par canal, pour la page d'administration. */
export async function visitStats(store) {
  const { blobs } = await store.list({ prefix: "visit/" });
  const result = { total: 0, bySource: {}, byDay: {} };
  for (const { key } of blobs) {
    const [, day, source] = key.split("/");
    result.total += 1;
    result.bySource[source] = (result.bySource[source] ?? 0) + 1;
    result.byDay[day] = (result.byDay[day] ?? 0) + 1;
  }
  return result;
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
