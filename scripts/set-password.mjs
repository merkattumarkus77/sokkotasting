// Ylläpitoskripti: asettaa/vaihtaa sovelluksen yhteisen salasanan Firestoren
// config/app-dokumenttiin. Ajetaan paikallisesti, ei julkaista Verceliin.
//
// Käyttö:
//   1. Lataa palvelutilin avain Firebase-konsolista:
//      Project settings -> Service accounts -> Generate new private key.
//   2. Tallenna tiedosto esim. nimellä serviceAccountKey.json projektin juureen
//      (tiedosto on .gitignoressa, älä committaa sitä).
//   3. Aja: node scripts/set-password.mjs <uusi-salasana>
//      (tai: FIREBASE_SERVICE_ACCOUNT_PATH=polku/avain.json node scripts/set-password.mjs <salasana>)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const newPassword = process.argv[2];

if (!newPassword) {
  console.error("Käyttö: node scripts/set-password.mjs <uusi-salasana>");
  process.exit(1);
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
      "aseta FIREBASE_SERVICE_ACCOUNT_PATH-ympäristömuuttuja."
  );
  process.exit(1);
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

await db.collection("config").doc("app").set({ password: newPassword }, { merge: true });

console.log("Salasana päivitetty onnistuneesti.");
process.exit(0);
