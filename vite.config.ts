import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // PR preview builds (see .github/workflows/pr-preview.yml) deploy to their
  // own Cloudflare Pages domain root, not a subpath, so they set this to "/".
  // Main's GitHub Pages deploy leaves it unset and gets the project subpath.
  base: process.env.PAGES_BASE_PATH ?? "/EPL-Mock-Draft/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
