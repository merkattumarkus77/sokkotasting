import type { Round } from "@/lib/types";

const MAX_GENERATION_ATTEMPTS = 50;

/** Kaikki tuoteparit (i < j) tuotemäärästä riippuen, esim. 4 tuotetta -> 6 paria. */
export function pairsPerParticipantCount(productCount: number): number {
  return (productCount * (productCount - 1)) / 2;
}

function allTheoreticalPairs(productCount: number): [number, number][] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < productCount; i++) {
    for (let j = i + 1; j < productCount; j++) {
      pairs.push([i, j]);
    }
  }
  return pairs;
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Tarkistaa, että jokainen teoreettinen pari löytyy tarkalleen kerran
 * arvotusta kierroslistasta (järjestyksellä A/B ei ole väliä tarkistuksessa).
 */
export function validateRounds(rounds: Round[], productCount: number): boolean {
  const expected = allTheoreticalPairs(productCount);
  if (rounds.length !== expected.length) return false;

  const seen = new Set<string>();
  for (const round of rounds) {
    if (round.productAIndex === round.productBIndex) return false;
    const key = [round.productAIndex, round.productBIndex].sort((a, b) => a - b).join("-");
    if (seen.has(key)) return false;
    seen.add(key);
  }

  return expected.every(([a, b]) => seen.has(`${a}-${b}`));
}

/**
 * Arpoo yhdelle osallistujalle kaikki mahdolliset tuoteparit satunnaisessa
 * järjestyksessä, satunnaisella A/B-jaolla parin sisällä. Tarkistaa tuloksen
 * ja arpoo uudelleen, jos jokin pari puuttuisi tai toistuisi.
 */
export function generateParticipantRounds(productCount: number): Round[] {
  if (productCount < 2) {
    throw new Error("Tuotteita on oltava vähintään kaksi Round Robin -parsintaa varten.");
  }

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const orderedPairs = shuffle(allTheoreticalPairs(productCount));
    const rounds: Round[] = orderedPairs.map(([i, j], index) => {
      const swap = Math.random() < 0.5;
      return {
        index,
        productAIndex: swap ? j : i,
        productBIndex: swap ? i : j,
        served: false,
        completed: false,
      };
    });

    if (validateRounds(rounds, productCount)) {
      return rounds;
    }
  }

  throw new Error(
    "Round Robin -parsinta epäonnistui tarkistuksessa toistuvasti. Yritä uudelleen."
  );
}

/** Arpoo kierrokset erikseen jokaiselle osallistujalle (estää vertaispaineen). */
export function generateRoundsForParticipants(
  participantNames: string[],
  productCount: number
): Map<string, Round[]> {
  const result = new Map<string, Round[]>();
  for (const name of participantNames) {
    result.set(name, generateParticipantRounds(productCount));
  }
  return result;
}
