import { defineConfig } from "vite";

// base: "./" forces every built asset URL to be relative,
// so the dist/ folder drops straight into GitHub Pages / Cloudflare Pages.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets"
  }
});
