import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.mts: these tests need a running Firestore
// emulator (npm run test:emulator wraps this with `firebase emulators:exec`,
// which sets FIRESTORE_EMULATOR_HOST automatically). Never run against
// production Firestore (CLAUDE.md).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "src/lib/testStubs/serverOnly.ts"),
    },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 20000,
  },
});
