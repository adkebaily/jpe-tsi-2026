// POST /api/hit {src}  -> compte une visite, sans cookie ni donnée personnelle.
import { getStore } from "@netlify/blobs";
import { recordVisit } from "../lib/reviews-core.mjs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });

  let src = "";
  try {
    const raw = await req.text();
    if (raw.length <= 200) src = String(JSON.parse(raw)?.src ?? "");
  } catch {
    /* corps absent ou illisible : la visite est comptée sans canal */
  }

  const store = getStore({ name: "reviews", consistency: "strong" });
  await recordVisit(store, { src, ip: context?.ip });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/hit" };
