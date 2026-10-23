import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for plain TypeScript helpers only (no React rendering, no network).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
