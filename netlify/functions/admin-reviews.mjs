// Réservé à l'équipe. Demande l'en-tête "Authorization: Bearer <ADMIN_TOKEN>".
// GET  /api/admin/reviews                      -> tous les avis + les visites
// POST /api/admin/reviews {id, action}         -> action = approve | reject | delete
import { getStore } from "@netlify/blobs";
import { adminGate, listAll, moderate, visitStats } from "../lib/reviews-core.mjs";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req, context) => {
  const store = getStore({ name: "reviews", consistency: "strong" });

  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const gate = await adminGate(store, { given, expected: process.env.ADMIN_TOKEN, ip: context?.ip });
  if (!gate.ok) return json({ ok: false, message: gate.message }, gate.status);

  if (req.method === "GET") return json({ ...(await listAll(store)), visits: await visitStats(store) });

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
