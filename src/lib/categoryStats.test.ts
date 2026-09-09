import { describe, expect, it } from "vitest";
import { mergeCategoryStats, mergeKnownItems } from "@/lib/categoryStats";

describe("mergeCategoryStats", () => {
  it("creates a new entry for a first-seen item", () => {
    const result = mergeCategoryStats([], [{ itemName: "Atria", tastedPoints: 90, tastedPairs: 3 }], 4);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      itemName: "Atria",
      totalPoints: 90,
      totalPossiblePoints: 150,
      eventCount: 1,
      participantCount: 4,
    });
    expect(result[0]!.normalizedPercentage).toBeCloseTo(60);
  });

  it("accumulates into an existing entry matched by normalized name", () => {
    const existing = [
      {
        itemName: "atria",
        totalPoints: 90,
        totalPossiblePoints: 150,
        normalizedPercentage: 60,
        eventCount: 1,
        participantCount: 4,
      },
    ];
    const result = mergeCategoryStats(
      existing,
      [{ itemName: "Atria ", tastedPoints: 30, tastedPairs: 1 }],
      2
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.totalPoints).toBe(120);
    expect(result[0]!.totalPossiblePoints).toBe(200);
    expect(result[0]!.eventCount).toBe(2);
    expect(result[0]!.participantCount).toBe(6);
    expect(result[0]!.normalizedPercentage).toBeCloseTo(60);
  });

  it("never divides by zero when an item had no tasted pairs", () => {
    const result = mergeCategoryStats([], [{ itemName: "Uusi", tastedPoints: 0, tastedPairs: 0 }], 4);
    expect(result[0]!.normalizedPercentage).toBe(0);
  });
});

describe("mergeKnownItems", () => {
  it("adds new items and skips duplicates by normalized name", () => {
    const result = mergeKnownItems(["Atria"], ["atria", "Snellman"]);
    expect(result).toEqual(["Atria", "Snellman"]);
  });
});
