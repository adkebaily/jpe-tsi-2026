import { defineConfig } from "astro/config";

// Site statique : Netlify sert dist/ et exécute netlify/functions/ à part.
// Pendant un build Netlify, URL contient l'adresse publique du site ;
// elle sert aux liens absolus (adresse canonique, image d'aperçu).
export default defineConfig({
  site: process.env.URL || "http://localhost:8888",
  output: "static",
  build: { inlineStylesheets: "always" },
  // Aucun script ni police intégré dans le HTML : la politique de sécurité n'autorise que les fichiers du site.
  vite: { build: { assetsInlineLimit: 0 } },
});
