// Admin script: sets the app's config/appConfig document in Firestore
// (admin username + admin password hash + shared event password hash).
// Runs locally, never deployed to Vercel.
//
// Usage:
//   1. Download a service account key from the Firebase console:
//      Project settings -> Service accounts -> Generate new private key.
//   2. Save it as serviceAccountKey.json in the project root
//      (the file is gitignored, do not commit it).
//   3. Run: node scripts/set-password.mjs <admin-username> <admin-password> <event-password>
//      (or: FIREBASE_SERVICE_ACCOUNT_PATH=path/key.json node scripts/set-password.mjs ...)
//
// Against the local emulator instead, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
// first — no service account key is needed in that case.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const [adminUsername, adminPassword, eventPassword] = process.argv.slice(2);

if (!adminUsername || !adminPassword || !eventPassword) {
  console.error(
    "Käyttö: node scripts/set-password.mjs <admin-tunnus> <admin-salasana> <tapahtumasalasana>"
  );
  process.exit(1);
}

// Must match EMULATOR_PROJECT_ID in src/lib/limits.ts — a plain .mjs script
// can't import that .ts file, so the constant is duplicated here.
const EMULATOR_PROJECT_ID = "sokkotasting-emulator";

function loadApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: EMULATOR_PROJECT_ID });
  }

  const serviceAccountPath = resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "serviceAccountKey.json"
  );

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
  } catch {
    console.error(
      `Palvelutilin avainta ei löytynyt polusta: ${serviceAccountPath}\n` +
        "Lataa se Firebase-konsolista (Project settings -> Service accounts) tai " +
        "aseta FIREBASE_SERVICE_ACCOUNT_PATH-ympäristömuuttuja, tai aseta " +
        "FIRESTORE_EMULATOR_HOST jos tarkoitus on ajaa emulaattoria vasten."
    );
    process.exit(1);
  }

  return initializeApp({ credential: cert(serviceAccount) });
}

const app = loadApp();
const db = getFirestore(app);

const adminPasswordHash = await bcrypt.hash(adminPassword, 12);
const eventPasswordHash = await bcrypt.hash(eventPassword, 12);

await db.collection("config").doc("appConfig").set(
  {
    adminUsername,
    adminPasswordHash,
    eventPasswordHash,
    updatedAt: Date.now(),
  },
  { merge: true }
);

console.log("Tunnukset päivitetty onnistuneesti.");
process.exit(0);
