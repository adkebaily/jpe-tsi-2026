// Réservé à l'équipe. Demande l'en-tête "Authorization: Bearer <ADMIN_TOKEN>".
// GET  /api/admin/reviews                      -> tous les avis
// POST /api/admin/reviews {id, action}         -> action = approve | reject | delete
import { getStore } from "@netlify/blobs";
import { isAdmin, listAll, moderate } from "../lib/reviews-core.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req) => {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return json({ ok: false, message: "ADMIN_TOKEN n'est pas configuré sur Netlify." }, 503);

  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!isAdmin(given, expected)) return json({ ok: false, message: "Mot de passe incorrect." }, 401);

  const store = getStore({ name: "reviews", consistency: "strong" });

  if (req.method === "GET") return json(await listAll(store));

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, message: "Requête illisible." }, 400);
    }
    const result = await moderate(store, body);
    return json(result.body, result.status);
  }

  return json({ ok: false, message: "Méthode non autorisée." }, 405);
};

export const config = { path: "/api/admin/reviews" };
