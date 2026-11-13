import { defineConfig } from "astro/config";

// Site statique : Netlify sert dist/ et exécute netlify/functions/ à part.
export default defineConfig({
  output: "static",
  build: { inlineStylesheets: "always" },
});
