import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "sokkotasting-emulator",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Testit ja paikallinen kehitys ajetaan emulaattoria vasten, ei koskaan
// tuotanto-Firestorea vasten (CLAUDE.md). __FIRESTORE_EMULATOR_CONNECTED on
// moduulitason lippu, joka estää useamman connectFirestoreEmulator-kutsun
// samalle Firestore-instanssille (Next.js Fast Refresh lataa moduulin uudelleen).
declare global {
  // eslint-disable-next-line no-var
  var __FIRESTORE_EMULATOR_CONNECTED: boolean | undefined;
}

if (
  process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === "true" &&
  !globalThis.__FIRESTORE_EMULATOR_CONNECTED
) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__FIRESTORE_EMULATOR_CONNECTED = true;
}
