// SPEC 15.3: runs a full tasting against the Firestore emulator with random
// evaluations and prints the outcome, catching stalls or impossible
// pairings without needing the UI.
//
// Usage:
//   firebase emulators:start --only firestore   (in one terminal)
//   npm run simulate -- --logic=SWISS_TOURNAMENT --items=15 --participants=8
//   npm run simulate -- --logic=ROUND_ROBIN --items=6 --participants=4
//
// Refuses to run unless FIRESTORE_EMULATOR_HOST is set — this must never
// touch production Firestore (CLAUDE.md).
//
// Run via `npm run simulate`, not `tsx scripts/simulate.ts` directly: the
// npm script points tsx at tsconfig.scripts.json, which aliases the
// "server-only" package (imported by lib/rounds.ts etc.) to a no-op stub.
// The real "server-only" package throws unconditionally outside Next's own
// webpack build (see src/lib/testStubs/serverOnly.ts for the same issue
// with Vitest) — tsconfig.json itself is untouched, so the actual `next
// build` still gets the real guard.

import { adminDb } from "../src/lib/firebaseAdmin";
import { assignItemCodes } from "../src/lib/itemCodes";
import {
  getCurrentRound,
  getParticipantState,
  markRoundServed,
  ensureRounds,
  submitRound,
} from "../src/lib/rounds";
import type { ParticipantDoc, PortionUnit, TastingDoc, TastingLogic } from "../src/lib/types";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST puuttuu. Käynnistä emulaattori ensin " +
      "(firebase emulators:start --only firestore) ja aseta muuttuja, tai käytä " +
      "npm run test:emulator -tyylistä käärettä. Tätä skriptiä EI SAA ajaa tuotanto-Firestorea vasten."
  );
  process.exit(1);
}

interface Args {
  logic: TastingLogic;
  items: number;
  participants: number;
  seedingRounds: number;
  hasBronzeMatch: boolean;
}

function parseArgs(): Args {
  const raw = new Map(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, "").split("=");
      return [key!, value ?? "true"];
    })
  );

  const logic = (raw.get("logic") ?? "ROUND_ROBIN") as TastingLogic;
  if (logic !== "ROUND_ROBIN" && logic !== "SWISS_TOURNAMENT") {
    throw new Error(`Tuntematon logic: ${logic}`);
  }

  return {
    logic,
    items: Number(raw.get("items") ?? 8),
    participants: Number(raw.get("participants") ?? 4),
    seedingRounds: Number(raw.get("seedingRounds") ?? 2),
    hasBronzeMatch: raw.get("hasBronzeMatch") === "true",
  };
}

function randomScore(logic: TastingLogic): number {
  if (logic === "SWISS_TOURNAMENT") {
    // Ties are forbidden in Swiss — never return exactly 25.
    let score = Math.floor(Math.random() * 51);
    if (score === 25) score = Math.random() < 0.5 ? 24 : 26;
    return score;
  }
  return Math.floor(Math.random() * 51);
}

const MAX_ROUNDS_PER_PARTICIPANT = 300; // safety cap to detect a stuck loop instead of hanging forever

async function runParticipant(
  eventId: string,
  tasting: TastingDoc,
  participant: ParticipantDoc
): Promise<{ name: string; roundsPlayed: number; stuck: boolean; finalPhase: string }> {
  await ensureRounds(eventId, tasting, participant);

  let roundsPlayed = 0;
  let stuck = false;

  while (roundsPlayed < MAX_ROUNDS_PER_PARTICIPANT) {
    const round = await getCurrentRound(eventId, tasting.id, participant.id);
    if (!round) break;

    await markRoundServed(eventId, tasting.id, participant.id, round.id);
    await submitRound(
      eventId,
      tasting,
      participant,
      { scoreA: randomScore(tasting.logic), notes: "" },
      round.id
    );
    roundsPlayed++;
  }

  if (roundsPlayed >= MAX_ROUNDS_PER_PARTICIPANT) stuck = true;

  const state = await getParticipantState(eventId, tasting.id, participant.id);
  return {
    name: participant.name,
    roundsPlayed,
    stuck,
    finalPhase: state?.phase ?? "unknown",
  };
}

async function main() {
  const args = parseArgs();
  console.log(
    `Simuloidaan: logic=${args.logic} items=${args.items} participants=${args.participants}` +
      (args.logic === "SWISS_TOURNAMENT" ? ` seedingRounds=${args.seedingRounds} bronze=${args.hasBronzeMatch}` : "")
  );

  const eventId = crypto.randomUUID();
  const tastingId = crypto.randomUUID();

  const itemNames = Array.from({ length: args.items }, (_, i) => `Tuote ${i + 1}`);
  const tasting: TastingDoc = {
    id: tastingId,
    eventId,
    name: "Simulaatio",
    logic: args.logic,
    items: assignItemCodes(itemNames, () => crypto.randomUUID()),
    portionSize: "30 ml",
    portionAmount: 30,
    portionUnit: "ml" as PortionUnit,
    hasGuessing: false,
    hasBronzeMatch: args.hasBronzeMatch,
    timeLimitMinutes: null,
    seedingRounds: args.seedingRounds,
    status: "in_progress",
    statsCommitted: false,
    createdAt: Date.now(),
  };
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("tastings")
    .doc(tastingId)
    .set(tasting);

  const participants: ParticipantDoc[] = Array.from({ length: args.participants }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Osallistuja ${i + 1}`,
    nameKey: `osallistuja ${i + 1}`,
    activeSessionId: "",
    excludedTastingIds: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  }));
  for (const participant of participants) {
    await adminDb
      .collection("events")
      .doc(eventId)
      .collection("participants")
      .doc(participant.id)
      .set(participant);
  }

  const results = [];
  for (const participant of participants) {
    results.push(await runParticipant(eventId, tasting, participant));
  }

  console.log("");
  for (const result of results) {
    const flag = result.stuck ? " JUMISSA" : "";
    console.log(
      `  ${result.name}: ${result.roundsPlayed} kierrosta, tila=${result.finalPhase}${flag}`
    );
  }

  const anyStuck = results.some((r) => r.stuck);
  const allDone = results.every((r) => r.finalPhase === "DONE");
  console.log("");
  if (anyStuck) {
    console.error(`FAIL: jokin osallistuja jumissa (${MAX_ROUNDS_PER_PARTICIPANT} kierroksen katto ylitetty).`);
    process.exit(1);
  }
  if (!allDone) {
    console.error("FAIL: kaikki osallistujat eivät päässeet tilaan DONE.");
    process.exit(1);
  }
  console.log("OK: kaikki osallistujat suorittivat tastingin loppuun ilman jumeja.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Simulaatio epäonnistui:", error);
  process.exit(1);
});
