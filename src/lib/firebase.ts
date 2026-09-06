import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { EMULATOR_PROJECT_ID } from "@/lib/limits";

const useEmulator = process.env.NEXT_PUBLIC_USE_FIRESTORE_EMULATOR === "true";

// When using the emulator, the project id is fixed (see EMULATOR_PROJECT_ID)
// regardless of NEXT_PUBLIC_FIREBASE_PROJECT_ID, so it always matches what
// scripts/set-password.mjs and lib/firebaseAdmin.ts use.
const firebaseConfig: FirebaseOptions = useEmulator
  ? { projectId: EMULATOR_PROJECT_ID }
  : {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

const app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);

export const db = getFirestore(app);

// Local dev and tests run against the emulator, never against production
// Firestore (CLAUDE.md). __FIRESTORE_EMULATOR_CONNECTED is a module-level
// flag preventing a second connectFirestoreEmulator call on the same
// Firestore instance (Next.js Fast Refresh re-runs this module).
declare global {
  // eslint-disable-next-line no-var
  var __FIRESTORE_EMULATOR_CONNECTED: boolean | undefined;
}

if (useEmulator && !globalThis.__FIRESTORE_EMULATOR_CONNECTED) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  globalThis.__FIRESTORE_EMULATOR_CONNECTED = true;
}
