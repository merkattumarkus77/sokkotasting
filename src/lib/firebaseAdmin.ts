import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { EMULATOR_PROJECT_ID } from "@/lib/limits";

// Palvelinpuolen (Route Handler, skripti) Firestore-yhteys. Kun
// FIRESTORE_EMULATOR_HOST on asetettu, admin-SDK ohjautuu automaattisesti
// paikalliseen emulaattoriin eikä palvelutilin avainta tarvita. Muuten
// yhteys tuotanto-Firestoreen palvelutilin avaimella (ei koskaan
// selainbundleen — tätä moduulia ei saa importoida "use client"-tiedostoista).
//
// Kaksi tapaa antaa palvelutilin avain, koska Vercelissä ei ole pysyvää
// tiedostojärjestelmää johon serviceAccountKey.json voisi jättää:
// - FIREBASE_SERVICE_ACCOUNT_JSON (base64-koodattu avaimen JSON-sisältö) —
//   Vercelin ympäristömuuttuja, ks. docs/CUTOVER.md Vaihe 4.
// - Muuten tiedostopolusta (FIREBASE_SERVICE_ACCOUNT_PATH tai oletuksena
//   serviceAccountKey.json) — paikallinen kehitys ja skriptit.

function loadAdminApp(): App {
  if (getApps().length) return getApps()[0]!;

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: EMULATOR_PROJECT_ID });
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, "base64").toString(
      "utf-8"
    );
    const serviceAccount = JSON.parse(decoded);
    return initializeApp({ credential: cert(serviceAccount) });
  }

  const serviceAccountPath = resolve(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "serviceAccountKey.json"
  );
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf-8"));
  return initializeApp({ credential: cert(serviceAccount) });
}

const adminApp = loadAdminApp();

export const adminDb: Firestore = getFirestore(adminApp);
