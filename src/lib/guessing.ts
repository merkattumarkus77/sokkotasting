// SPEC 8: arvauskisan ranking ja loppuviestit. Pure, no Firebase dependency.
// guessACorrect/guessBCorrect are computed and stored at submit time
// (lib/rounds.ts) — this module only ranks and messages, never recomputes
// correctness (SPEC 8: "älä laske sitä uudestaan tulosnäkymässä").

export interface GuessingTallyInput {
  participantId: string;
  name: string;
  correctGuesses: number;
  attemptedGuesses: number;
}

export interface GuessingRankingEntry extends GuessingTallyInput {
  accuracy: number | null; // null when attemptedGuesses === 0, never divide by zero
}

/** SPEC 8: oikeat arvaukset yhteensä -> osumatarkkuus -> nimi aakkosjärjestyksessä. */
export function computeGuessingRanking(
  entries: readonly GuessingTallyInput[]
): GuessingRankingEntry[] {
  const withAccuracy: GuessingRankingEntry[] = entries.map((entry) => ({
    ...entry,
    accuracy: entry.attemptedGuesses === 0 ? null : entry.correctGuesses / entry.attemptedGuesses,
  }));

  return withAccuracy.sort((a, b) => {
    if (a.correctGuesses !== b.correctGuesses) return b.correctGuesses - a.correctGuesses;
    const aAcc = a.accuracy ?? -1;
    const bAcc = b.accuracy ?? -1;
    if (aAcc !== bAcc) return bAcc - aAcc;
    return a.name.localeCompare(b.name, "fi");
  });
}

// SPEC 8: sävy on osa vaatimusta. Ei ivaa, ei "parempi onni ensi kerralla"
// -sävyä edes alle keskiarvon jääneille. Suomeksi, vakiotekstit.
const WINNER_MESSAGES = [
  "Voitit arvauskisan — makuaistisi ei petä!",
  "Paras nenä illassa: voitit arvauskisan onnittelut!",
];

const ABOVE_AVERAGE_MESSAGES = [
  "Tarkka arvaaja! Osumasi olivat keskiarvoa paremmat.",
  "Hyvä tarkkuus — arvasit keskimääräistä useamman oikein.",
];

const AVERAGE_OR_BELOW_MESSAGES = [
  "Kiitos osallistumisesta arvauskisaan — maku on joka tapauksessa makuasia.",
  "Arvaaminen sokkona on vaikeaa kaikille — kiva että olit mukana!",
];

function pick(messages: readonly string[], seedKey: string): string {
  let hash = 0;
  for (let i = 0; i < seedKey.length; i++) hash = (hash * 31 + seedKey.charCodeAt(i)) >>> 0;
  return messages[hash % messages.length]!;
}

/**
 * SPEC 8 loppuviesti: rank 0 (winner) gets the winner tone regardless of
 * the average; everyone else is compared to the average correct-guess count.
 */
export function pickGuessingEndMessage(
  entry: GuessingRankingEntry,
  rank: number,
  averageCorrect: number
): string {
  if (rank === 0 && entry.correctGuesses > 0) return pick(WINNER_MESSAGES, entry.participantId);
  if (entry.correctGuesses > averageCorrect) return pick(ABOVE_AVERAGE_MESSAGES, entry.participantId);
  return pick(AVERAGE_OR_BELOW_MESSAGES, entry.participantId);
}
