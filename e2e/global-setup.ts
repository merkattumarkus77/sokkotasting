import bcrypt from "bcryptjs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME, E2E_EVENT_PASSWORD } from "./credentials";

const EMULATOR_PROJECT_ID = "sokkotasting-emulator";

// Seeds config/appConfig in the Firestore emulator before any spec runs, the
// same way scripts/set-password.mjs does for manual dev use. Refuses to run
// against anything but the emulator (CLAUDE.md: never touch production
// Firestore) — npm run e2e wraps this whole Playwright invocation in
// `firebase emulators:exec`, which sets FIRESTORE_EMULATOR_HOST.
export default async function globalSetup() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is not set. Run e2e tests only via `npm run e2e`, " +
        "which wraps Playwright in `firebase emulators:exec` — never against production Firestore."
    );
  }

  const app = getApps().length ? getApps()[0]! : initializeApp({ projectId: EMULATOR_PROJECT_ID });
  const db = getFirestore(app);

  const adminPasswordHash = await bcrypt.hash(E2E_ADMIN_PASSWORD, 12);
  const eventPasswordHash = await bcrypt.hash(E2E_EVENT_PASSWORD, 12);

  await db.collection("config").doc("appConfig").set({
    adminUsername: E2E_ADMIN_USERNAME,
    adminPasswordHash,
    eventPasswordHash,
    updatedAt: Date.now(),
  });
}
