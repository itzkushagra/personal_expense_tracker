import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The database tests start an in-memory Postgres and run every migration.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
