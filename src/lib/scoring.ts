// SPEC 7: pure scoring/ranking math, no Firebase dependency.

/**
 * Normalized percentage for one item. Returns null (display "—") when the
 * item was never actually tasted — SPEC 7 explicitly forbids dividing by
 * zero here rather than treating an untasted item as 0%.
 */
export function computeItemPercentage(tastedPoints: number, tastedPairs: number): number | null {
  if (tastedPairs === 0) return null;
  return (tastedPoints / (tastedPairs * 50)) * 100;
}

export interface GroupRankingInput {
  itemId: string;
  itemName: string;
  tastedPoints: number;
  tastedPairs: number;
  wonPairs: number;
}

export interface GroupRankingEntry extends GroupRankingInput {
  percentage: number | null;
}

/**
 * SPEC 7: ryhmärankingin järjestys on aina deterministinen — prosentti ->
 * voitettujen parien määrä -> nimi aakkosjärjestyksessä. Items that were
 * never tasted (percentage null) sort last.
 */
export function computeGroupRanking(items: readonly GroupRankingInput[]): GroupRankingEntry[] {
  const withPercentage: GroupRankingEntry[] = items.map((item) => ({
    ...item,
    percentage: computeItemPercentage(item.tastedPoints, item.tastedPairs),
  }));

  return withPercentage.sort((a, b) => {
    if (a.percentage === null && b.percentage === null) return a.itemName.localeCompare(b.itemName, "fi");
    if (a.percentage === null) return 1;
    if (b.percentage === null) return -1;
    if (a.percentage !== b.percentage) return b.percentage - a.percentage;
    if (a.wonPairs !== b.wonPairs) return b.wonPairs - a.wonPairs;
    return a.itemName.localeCompare(b.itemName, "fi");
  });
}
