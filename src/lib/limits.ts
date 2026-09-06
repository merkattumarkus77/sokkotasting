// Shared numeric limits (SPEC decisions, 2026-09-06). No Firebase or
// server-only dependency, so both client components and server lib/ modules
// can import this without pulling admin-SDK code into the browser bundle.

export const MAX_TASTINGS_PER_EVENT = 5;
export const MAX_PARTICIPANTS_PER_EVENT = 20;
export const NOTES_MAX_LENGTH = 500;
export const SEEDING_ROUNDS_MIN = 2;
export const SEEDING_ROUNDS_MAX = 4;
export const SEEDING_ROUNDS_DEFAULT = 2;
export const ROUND_ROBIN_MIN_ITEMS = 3;
export const ROUND_ROBIN_MAX_ITEMS = 12;

// Fixed project id used whenever talking to the local Firestore emulator
// (client, admin SDK, and scripts/set-password.mjs). Deliberately ignores
// NEXT_PUBLIC_FIREBASE_PROJECT_ID in that case — otherwise a seed script run
// with plain `node` (no .env.local auto-loading) and the Next dev server
// (which does load .env.local) would silently write to two different
// emulator namespaces sharing the real project's id. scripts/set-password.mjs
// hardcodes this same string since it cannot import a .ts file — keep them in sync.
export const EMULATOR_PROJECT_ID = "sokkotasting-emulator";
