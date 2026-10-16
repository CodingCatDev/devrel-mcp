import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://devrel.codingcat.dev",
  output: "static",
  outDir: "./dist",
  build: {
    format: "directory",
  },
});
