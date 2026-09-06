import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Palvelinpuolen (Route Handler, skripti) Firestore-yhteys. Kun
// FIRESTORE_EMULATOR_HOST on asetettu, admin-SDK ohjautuu automaattisesti
// paikalliseen emulaattoriin eikä palvelutilin avainta tarvita. Muuten
// yhteys tuotanto-Firestoreen palvelutilin avaimella (ei koskaan
// selainbundleen — tätä moduulia ei saa importoida "use client"-tiedostoista).

function loadAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "sokkotasting-emulator",
    });
  }

  const serviceAccountPath = resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "serviceAccountKey.json"
  );
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
  return initializeApp({ credential: cert(serviceAccount) });
}

const adminApp = loadAdminApp();

export const adminDb: Firestore = getFirestore(adminApp);
