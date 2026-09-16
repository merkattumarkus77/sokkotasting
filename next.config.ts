import type { NextConfig } from "next";

// e2e/global-setup.ts + playwright.config.ts build a throwaway production
// server pointed at the Firestore emulator (dev mode's on-demand route
// compilation was flaky under Playwright's concurrent multi-context load —
// see docs/TESTIRAPORTTI.md). E2E_DIST_DIR keeps that build in its own
// directory so it never clobbers the real `npm run build` output used by
// the CLAUDE.md phase-gate check.
const nextConfig: NextConfig = {
  ...(process.env.E2E_DIST_DIR ? { distDir: process.env.E2E_DIST_DIR } : {}),
};

export default nextConfig;
