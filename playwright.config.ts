import { defineConfig, devices } from "@playwright/test";

// SPEC 15.4. Run via `npm run e2e`, which wraps this whole invocation in
// `firebase emulators:exec` — never against production Firestore
// (CLAUDE.md). The webServer below builds a throwaway production server
// (not `next dev`) pointed at the Firestore emulator: dev mode's on-demand
// per-route compilation proved flaky under three concurrent browser
// contexts hammering many not-yet-compiled routes at once (occasional
// "Expected clientReferenceManifest to be defined" crashes — see
// docs/TESTIRAPORTTI.md). NEXT_PUBLIC_* vars are inlined at build time, so
// the emulator flag has to be set for the build step too, not just start.
export default defineConfig({
  testDir: "./e2e",
  // multi-tasting.spec.ts plays a Round Robin and then an 8-item Swiss
  // tasting to completion in sequence. The Swiss tasting alone legitimately
  // needs ~29-30 sequential rounds per participant (docs/TESTIRAPORTTI.md),
  // each gated by the app's own 3-4s poll intervals — generous on purpose.
  timeout: 420000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx next build && npx next start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      ...process.env,
      NEXT_PUBLIC_USE_FIRESTORE_EMULATOR: "true",
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
      E2E_DIST_DIR: ".next-e2e",
    } as Record<string, string>,
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
