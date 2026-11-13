// GET  /api/reviews  -> avis approuvés + moyenne
// POST /api/reviews  -> envoie un avis (mis en attente de validation)
import { getStore } from "@netlify/blobs";
import { listPublic, submit } from "../lib/reviews-core.mjs";

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export default async (req, context) => {
  const store = getStore({ name: "reviews", consistency: "strong" });

  if (req.method === "GET") {
    return json(await listPublic(store), 200, { "cache-control": "public, max-age=30" });
  }

  if (req.method === "POST") {
    // Seul le JSON est accepté : un formulaire posté depuis un autre site ne peut pas l'envoyer.
    if (!(req.headers.get("content-type") || "").includes("application/json"))
      return json({ ok: false, message: "Format non accepté." }, 415);

    let body;
    try {
      const raw = await req.text();
      if (raw.length > 5000) return json({ ok: false, message: "Message trop long." }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, message: "Requête illisible." }, 400);
    }
    const result = await submit(store, body, { ip: context?.ip });
    return json(result.body, result.status);
  }

  return json({ ok: false, message: "Méthode non autorisée." }, 405, { allow: "GET, POST" });
};

export const config = { path: "/api/reviews" };
