import { normalizeName } from "@/lib/normalize";
import type { CategoryStat } from "@/lib/types";

export interface CategoryStatUpdate {
  itemName: string;
  tastedPoints: number;
  tastedPairs: number;
}

/**
 * SPEC 13: merges one tasting's group results into a category's cumulative
 * all-time stats. Products merge by normalized name (trim+lowercase) — SPEC
 * 13's own example: "Atria " and "atria" are the same product. Pure and
 * called from inside completeTasting()'s transaction (lib/tastings.ts).
 */
export function mergeCategoryStats(
  existingStats: readonly CategoryStat[],
  updates: readonly CategoryStatUpdate[],
  participantCount: number
): CategoryStat[] {
  const byKey = new Map(existingStats.map((stat) => [normalizeName(stat.itemName), { ...stat }]));

  for (const update of updates) {
    const key = normalizeName(update.itemName);
    const totalPointsAdd = update.tastedPoints;
    const totalPossibleAdd = update.tastedPairs * 50;
    const existing = byKey.get(key);

    if (existing) {
      existing.totalPoints += totalPointsAdd;
      existing.totalPossiblePoints += totalPossibleAdd;
      existing.eventCount += 1;
      existing.participantCount += participantCount;
      existing.normalizedPercentage =
        existing.totalPossiblePoints > 0
          ? (existing.totalPoints / existing.totalPossiblePoints) * 100
          : 0;
    } else {
      byKey.set(key, {
        itemName: update.itemName,
        totalPoints: totalPointsAdd,
        totalPossiblePoints: totalPossibleAdd,
        normalizedPercentage: totalPossibleAdd > 0 ? (totalPointsAdd / totalPossibleAdd) * 100 : 0,
        eventCount: 1,
        participantCount,
      });
    }
  }

  return [...byKey.values()];
}

/** SPEC 13: knownItems on unioni, ei duplikaatteja (normalisoidulla nimellä). */
export function mergeKnownItems(existing: readonly string[], newNames: readonly string[]): string[] {
  const seen = new Set(existing.map(normalizeName));
  const result = [...existing];
  for (const name of newNames) {
    const key = normalizeName(name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}
