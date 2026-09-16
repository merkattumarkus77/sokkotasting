// Vaihe H expanded scenario test (user request, 2026-09-09): multiple
// parallel tastings in one event, mixed ROUND_ROBIN + SWISS_TOURNAMENT,
// exclusions, interleaved concurrent play (not one-tasting-at-a-time),
// bulk "serve-all", shared category across tastings (all-time stats
// accumulation), publish, and a final archive with a pending/in_progress/
// completed tasting mix (SPEC 14).
//
// Refuses to run unless FIRESTORE_EMULATOR_HOST is set — never touches
// production Firestore (CLAUDE.md). Run via `npm run simulate:scenario`.

import { adminDb } from "../src/lib/firebaseAdmin";
import { archiveEvent, createEvent } from "../src/lib/events";
import { assignItemCodes } from "../src/lib/itemCodes";
import { loginParticipant } from "../src/lib/participants";
import { computeEventGuessingRanking, computeTastingResults } from "../src/lib/results";
import {
  ensureRounds,
  getCurrentRound,
  getParticipantState,
  markAllPendingServed,
  markRoundServed,
  submitRound,
} from "../src/lib/rounds";
import { completeTasting, createTasting, listTastings } from "../src/lib/tastings";
import type { ParticipantDoc, TastingDoc, TastingLogic } from "../src/lib/types";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    "FIRESTORE_EMULATOR_HOST puuttuu. Tätä skriptiä EI SAA ajaa tuotanto-Firestorea vasten. " +
      "Käytä npm run simulate:scenario, joka kääntää tämän firebase emulators:exec -kutsuun."
  );
  process.exit(1);
}

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  OK   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? " — " + detail : ""}`);
  }
}

function randomScore(logic: TastingLogic): number {
  if (logic === "SWISS_TOURNAMENT") {
    let s = Math.floor(Math.random() * 51);
    if (s === 25) s = Math.random() < 0.5 ? 24 : 26;
    return s;
  }
  return Math.floor(Math.random() * 51);
}

interface TastingSpec {
  name: string;
  logic: TastingLogic;
  itemNames: string[];
  hasGuessing: boolean;
  hasBronzeMatch: boolean;
}

async function main() {
  console.log("=== Skenaariotesti: useampi rinnakkainen tasting, sekoitettu logiikka ===\n");

  // Category lives on the EVENT (SPEC 3), not per-tasting — every tasting
  // under this one event contributes to the same categories/{slug} doc.
  // "Atria" is deliberately reused across two tastings to exercise SPEC 13's
  // normalized-name merge (eventCount should become 2 for it, not two rows).
  const eventId = await createEvent({ name: "Skenaario", category: "Makkarat" });
  console.log(`Tapahtuma luotu: ${eventId}`);

  const specs: TastingSpec[] = [
    {
      name: "RR-pieni",
      logic: "ROUND_ROBIN",
      itemNames: ["Atria", "Snellman", "HK", "Kylmänen"],
      hasGuessing: true,
      hasBronzeMatch: false,
    },
    {
      name: "Swiss-pieni",
      logic: "SWISS_TOURNAMENT",
      itemNames: Array.from({ length: 8 }, (_, i) => `Olut ${i + 1}`),
      hasGuessing: true,
      hasBronzeMatch: true,
    },
    {
      name: "RR-toinen-samaan-kategoriaan",
      logic: "ROUND_ROBIN",
      itemNames: ["Atria", "Kotimaista", "Puolanmaa"],
      hasGuessing: false,
      hasBronzeMatch: false,
    },
    {
      name: "Swiss-jaa-kesken",
      logic: "SWISS_TOURNAMENT",
      itemNames: Array.from({ length: 9 }, (_, i) => `Viini ${i + 1}`), // odd N, exercises byes
      hasGuessing: false,
      hasBronzeMatch: false,
    },
    {
      name: "Ei-koskaan-aloitettu",
      logic: "ROUND_ROBIN",
      itemNames: ["A", "B", "C"],
      hasGuessing: false,
      hasBronzeMatch: false,
    },
  ];

  const tastingIds: Record<string, string> = {};
  for (const spec of specs) {
    const id = await createTasting(eventId, {
      name: spec.name,
      logic: spec.logic,
      itemNames: spec.itemNames,
      portionAmount: 10,
      portionUnit: "ml",
      hasGuessing: spec.hasGuessing,
      hasBronzeMatch: spec.hasBronzeMatch,
      timeLimitMinutes: null,
      seedingRounds: 2,
    });
    tastingIds[spec.name] = id;
    console.log(`Tasting luotu: ${spec.name} (${spec.logic}, ${spec.itemNames.length} tuotetta) -> ${id}`);
  }

  const allTastings = await listTastings(eventId);
  check("Tastingeja luotiin täsmälleen 5 (MAX_TASTINGS_PER_EVENT)", allTastings.length === 5);

  // 6th tasting should be rejected.
  let rejected = false;
  try {
    await createTasting(eventId, {
      name: "Kuudes",
      logic: "ROUND_ROBIN",
      itemNames: ["A", "B", "C"],
      portionAmount: 10,
      portionUnit: "ml",
      hasGuessing: false,
      hasBronzeMatch: false,
      timeLimitMinutes: null,
      seedingRounds: 2,
    });
  } catch {
    rejected = true;
  }
  check("6. tastingin luonti hylätään (max 5)", rejected);

  // Start every tasting except "Ei-koskaan-aloitettu" and "Swiss-jaa-kesken"
  // (the latter is deliberately left in_progress but unfinished — tests
  // archiving a mixed pending/in_progress/completed set, SPEC 14).
  const toStart = specs.filter((s) => s.name !== "Ei-koskaan-aloitettu");
  const { startTasting } = await import("../src/lib/tastings");
  for (const spec of toStart) {
    await startTasting(eventId, tastingIds[spec.name]!);
  }
  console.log(`\nKäynnistetty ${toStart.length}/${specs.length} tastingia.\n`);

  // Participants: 7 total. Exclude participant "Osallistuja 7" from Swiss-pieni.
  const participantCount = 7;
  const participants: ParticipantDoc[] = [];
  for (let i = 1; i <= participantCount; i++) {
    const { participant } = await loginParticipant(eventId, `Osallistuja ${i}`);
    participants.push(participant);
  }
  console.log(`${participants.length} osallistujaa kirjautunut.\n`);

  const excludedParticipant = participants[6]!; // "Osallistuja 7"
  const excludedFromTastingId = tastingIds["Swiss-pieni"]!;
  await adminDb
    .collection("events")
    .doc(eventId)
    .collection("participants")
    .doc(excludedParticipant.id)
    .update({ excludedTastingIds: [excludedFromTastingId] });
  console.log(`${excludedParticipant.name} suljettu pois tastingista "Swiss-pieni".\n`);

  // Every tasting this participant should actually play, per participant.
  const playableTastingsByParticipant = new Map<string, TastingSpec[]>();
  for (const participant of participants) {
    const excluded =
      participant.id === excludedParticipant.id ? new Set([excludedFromTastingId]) : new Set<string>();
    playableTastingsByParticipant.set(
      participant.id,
      toStart.filter((s) => s.name !== "Swiss-jaa-kesken" && !excluded.has(tastingIds[s.name]!))
      // "Swiss-jaa-kesken" handled separately below (deliberately left unfinished)
    );
  }

  console.log("Pelataan kaikki lomitettuna (ei yksi tasting kerrallaan)...\n");

  // Interleaved play: keep looping over all (participant, tasting) pairs,
  // advancing each by one round per pass, until nobody has anything left.
  // Every few passes, call markAllPendingServed for each tasting instead of
  // per-participant serve — exercises the bulk endpoint under multi-tasting.
  let pass = 0;
  const maxPasses = 400;
  while (pass < maxPasses) {
    let anyProgress = false;
    pass++;

    for (const spec of toStart) {
      if (spec.name === "Swiss-jaa-kesken") continue; // left deliberately unfinished
      const tastingId = tastingIds[spec.name]!;
      const tasting = (await import("../src/lib/tastings")).getTasting;
      const tastingDoc = (await tasting(eventId, tastingId))!;

      if (pass % 3 === 0) {
        await markAllPendingServed(eventId, tastingId);
      }

      for (const participant of participants) {
        const playable = playableTastingsByParticipant.get(participant.id)!;
        if (!playable.some((s) => s.name === spec.name)) continue;

        await ensureRounds(eventId, tastingDoc, participant);
        const round = await getCurrentRound(eventId, tastingId, participant.id);
        if (!round) continue; // this participant is done with this tasting

        if (round.status === "WAITING_SERVICE") {
          await markRoundServed(eventId, tastingId, participant.id, round.id);
        }
        const served = await getCurrentRound(eventId, tastingId, participant.id);
        if (served && served.status === "SERVED") {
          await submitRound(
            eventId,
            tastingDoc,
            participant,
            { scoreA: randomScore(spec.logic), notes: `${participant.name} / ${spec.name}` },
            served.id
          );
          anyProgress = true;
        }
      }
    }

    if (!anyProgress) break;
  }
  check(`Lomitettu pelikierros päättyi ${maxPasses} kierroksen sisällä`, pass < maxPasses, `pass=${pass}`);

  // Verify every non-excluded participant actually finished every started
  // (non-deliberately-unfinished) tasting.
  for (const spec of toStart) {
    if (spec.name === "Swiss-jaa-kesken") continue;
    const tastingId = tastingIds[spec.name]!;
    for (const participant of participants) {
      const playable = playableTastingsByParticipant.get(participant.id)!;
      if (!playable.some((s) => s.name === spec.name)) continue;
      const state = await getParticipantState(eventId, tastingId, participant.id);
      const done = spec.logic === "ROUND_ROBIN" ? true : state?.phase === "DONE";
      const round = await getCurrentRound(eventId, tastingId, participant.id);
      check(
        `${participant.name} valmis "${spec.name}":ssa`,
        round === null && (spec.logic === "ROUND_ROBIN" || done),
        `phase=${state?.phase}`
      );
    }
  }

  // Excluded participant must never have gotten a participantState for the tasting they opted out of.
  const excludedState = await getParticipantState(eventId, excludedFromTastingId, excludedParticipant.id);
  check("Poissuljettu osallistuja ei saanut kierroksia poissuljetusta tastingista", excludedState === null);

  // Publish all finished tastings.
  console.log("\nJulkaistaan valmiit tastingit...\n");
  for (const spec of toStart) {
    if (spec.name === "Swiss-jaa-kesken") continue;
    await completeTasting(eventId, tastingIds[spec.name]!);
  }
  // Double-publish idempotency check on one of them.
  await completeTasting(eventId, tastingIds["RR-pieni"]!);

  const rrResults = await computeTastingResults(eventId, tastingIds["RR-pieni"]!);
  check("RR-pieni tulokset laskettavissa julkaisun jälkeen", rrResults !== null);
  check(
    "RR-pieni ryhmäranking sisältää kaikki 4 tuotetta",
    rrResults?.groupRanking.length === 4
  );

  const swissResults = await computeTastingResults(eventId, tastingIds["Swiss-pieni"]!);
  check(
    "Swiss-pieni ei sisällä poissuljettua osallistujaa pisteissä",
    !swissResults?.participantScores.some((p) => p.participantId === excludedParticipant.id)
  );

  // Category lives on the EVENT, not per-tasting (SPEC 3) — every published
  // tasting under this one event ("Skenaario", category "Makkarat")
  // contributes to the SAME categories/makkarat doc, including Swiss-pieni's
  // 8 beers. "Atria" is deliberately shared by two tastings and must merge
  // into one stat row with eventCount 2, not two separate rows.
  const makkaratDoc = await adminDb.collection("categories").doc("makkarat").get();
  const makkaratData = makkaratDoc.data();
  const atriaStat = makkaratData?.stats?.find((s: { itemName: string }) => s.itemName === "Atria");
  check("categories/makkarat on olemassa julkaisun jälkeen", makkaratDoc.exists);
  check(
    "Atria esiintyy kategoriassa vain kerran (nimien yhdistäminen toimii)",
    makkaratData?.stats?.filter((s: { itemName: string }) => s.itemName === "Atria").length === 1
  );
  check(
    "Atrian eventCount on 2 (esiintyi kahdessa tastingissa)",
    atriaStat?.eventCount === 2,
    `eventCount=${atriaStat?.eventCount}`
  );
  check(
    "categories/makkarat sisältää kaikkien kolmen julkaistun tastingin 14 uniikkia tuotetta",
    makkaratData?.knownItems?.length === 14,
    `knownItems.length=${makkaratData?.knownItems?.length}`
  );
  check(
    "Swiss-pienen tuotteet (esim. Olut 1) päätyivät samaan kategoriaan kuin RR-tastingit",
    makkaratData?.knownItems?.includes("Olut 1") ?? false
  );

  // Event-wide guessing ranking should combine RR-pieni (guessing on) and Swiss-pieni (guessing on).
  const eventGuessing = await computeEventGuessingRanking(eventId);
  check(
    "Tapahtuman yhteisranking arvauskisalle ei ole tyhjä",
    eventGuessing.length > 0,
    `entries=${eventGuessing.length}`
  );

  // Archive with a genuinely mixed set: "Ei-koskaan-aloitettu" (pending),
  // "Swiss-jaa-kesken" (in_progress, unfinished), rest completed.
  console.log("\nArkistoidaan tapahtuma sekamuotoisella tila-joukolla...\n");
  await archiveEvent(eventId);

  const afterArchive = await listTastings(eventId);
  const neverStarted = afterArchive.find((t) => t.name === "Ei-koskaan-aloitettu")!;
  check(
    "Aloittamaton tasting muuttui completed-tilaan ilman tilastoja arkistoinnissa",
    neverStarted.status === "completed" && neverStarted.statsCommitted === true
  );

  const unfinishedSwiss = afterArchive.find((t) => t.name === "Swiss-jaa-kesken")!;
  check(
    "Kesken jäänyt Swiss-tasting EI muutu completed-tilaan arkistoinnissa (SPEC 14 koskee vain pending)",
    unfinishedSwiss.status === "in_progress",
    `status=${unfinishedSwiss.status}`
  );

  // A participant's next call must now be rejected (session invalidation) —
  // simulate by checking the event doc directly rather than an HTTP call,
  // since this script talks to lib/ functions, not the Route Handler layer.
  const eventAfter = await adminDb.collection("events").doc(eventId).get();
  check("Tapahtuma on arkistoitu (status=archived)", eventAfter.data()?.status === "archived");

  console.log(`\n=== Yhteensä ${failures === 0 ? "KAIKKI OK" : `${failures} VIRHETTÄ`} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Skenaariotesti kaatui poikkeukseen:", error);
  process.exit(1);
});
