import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Participant, Round, Score } from "@/lib/types";

export interface SubmitScoreInput {
  pointsA: number;
  notes: string;
  guessAIndex?: number;
  guessBIndex?: number;
}

/**
 * Tallentaa pisteet scores-kokoelmaan, merkitsee osallistujan nykyisen kierroksen
 * valmiiksi ja siirtää currentRoundIndexin seuraavaan — yhdellä batchilla.
 */
export async function submitScore(
  participant: Participant,
  round: Round,
  input: SubmitScoreInput
): Promise<void> {
  const scoreRef = doc(collection(db, "scores"));
  const score: Omit<Score, "id"> = {
    eventId: participant.eventId,
    participantId: participant.id,
    roundIndex: round.index,
    productAIndex: round.productAIndex,
    productBIndex: round.productBIndex,
    pointsA: input.pointsA,
    pointsB: 50 - input.pointsA,
    notes: input.notes,
    submittedAt: Date.now(),
    // Firestore hylkää undefined-arvot: kentät jätetään kokonaan pois kun arvausta ei ole.
    ...(input.guessAIndex !== undefined ? { guessAIndex: input.guessAIndex } : {}),
    ...(input.guessBIndex !== undefined ? { guessBIndex: input.guessBIndex } : {}),
  };

  const updatedRounds = participant.rounds.map((r) =>
    r.index === round.index ? { ...r, completed: true } : r
  );

  const batch = writeBatch(db);
  batch.set(scoreRef, score);
  batch.update(doc(db, "participants", participant.id), {
    rounds: updatedRounds,
    currentRoundIndex: participant.currentRoundIndex + 1,
  });
  await batch.commit();
}

/** Laskee kuinka monta kertaa kutakin tuotetta on jo arvattu tämän osallistujan omassa historiassa. */
export async function getGuessCounts(
  participantId: string,
  productCount: number
): Promise<number[]> {
  const counts = new Array(productCount).fill(0);
  const q = query(collection(db, "scores"), where("participantId", "==", participantId));
  const snapshot = await getDocs(q);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as Score;
    if (typeof data.guessAIndex === "number") counts[data.guessAIndex]++;
    if (typeof data.guessBIndex === "number") counts[data.guessBIndex]++;
  }
  return counts;
}
