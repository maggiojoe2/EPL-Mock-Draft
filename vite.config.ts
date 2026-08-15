import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/EPL-Mock-Draft/",
  plugins: [react()],
  test: {
    environment: "node",
  },
});
