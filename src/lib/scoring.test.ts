import { describe, expect, it } from "vitest";
import { computeGroupRanking, computeItemPercentage } from "@/lib/scoring";

describe("computeItemPercentage", () => {
  it("computes the normalized percentage with known values", () => {
    // 3 pairs tasted, total 90 points out of a possible 150 -> 60%
    expect(computeItemPercentage(90, 3)).toBeCloseTo(60);
    expect(computeItemPercentage(75, 3)).toBeCloseTo(50); // neutral
  });

  it("never divides by zero — returns null instead", () => {
    expect(computeItemPercentage(0, 0)).toBeNull();
  });

  it("keeps full precision (rounding is a display concern)", () => {
    expect(computeItemPercentage(100, 3)).toBeCloseTo(66.6666, 3);
  });
});

describe("computeGroupRanking", () => {
  it("sorts by percentage descending", () => {
    const ranking = computeGroupRanking([
      { itemId: "a", itemName: "Atria", tastedPoints: 50, tastedPairs: 2, wonPairs: 1 }, // 50%
      { itemId: "b", itemName: "Snellman", tastedPoints: 80, tastedPairs: 2, wonPairs: 2 }, // 80%
    ]);
    expect(ranking.map((r) => r.itemId)).toEqual(["b", "a"]);
  });

  it("breaks percentage ties with wonPairs descending", () => {
    const ranking = computeGroupRanking([
      { itemId: "a", itemName: "A", tastedPoints: 50, tastedPairs: 2, wonPairs: 0 },
      { itemId: "b", itemName: "B", tastedPoints: 50, tastedPairs: 2, wonPairs: 1 },
    ]);
    expect(ranking.map((r) => r.itemId)).toEqual(["b", "a"]);
  });

  it("breaks remaining ties with the item name alphabetically", () => {
    const ranking = computeGroupRanking([
      { itemId: "z", itemName: "Öljy", tastedPoints: 50, tastedPairs: 2, wonPairs: 1 },
      { itemId: "a", itemName: "Atria", tastedPoints: 50, tastedPairs: 2, wonPairs: 1 },
    ]);
    expect(ranking.map((r) => r.itemId)).toEqual(["a", "z"]);
  });

  it("sorts untasted items (null percentage) last", () => {
    const ranking = computeGroupRanking([
      { itemId: "untasted", itemName: "Ei maisteltu", tastedPoints: 0, tastedPairs: 0, wonPairs: 0 },
      { itemId: "tasted", itemName: "Maisteltu", tastedPoints: 10, tastedPairs: 1, wonPairs: 0 },
    ]);
    expect(ranking.map((r) => r.itemId)).toEqual(["tasted", "untasted"]);
    expect(ranking[1]!.percentage).toBeNull();
  });

  it("is fully deterministic given the same input", () => {
    const input = [
      { itemId: "a", itemName: "A", tastedPoints: 40, tastedPairs: 2, wonPairs: 1 },
      { itemId: "b", itemName: "B", tastedPoints: 60, tastedPairs: 2, wonPairs: 1 },
      { itemId: "c", itemName: "C", tastedPoints: 40, tastedPairs: 2, wonPairs: 1 },
    ];
    const first = computeGroupRanking(input).map((r) => r.itemId);
    const second = computeGroupRanking(input).map((r) => r.itemId);
    expect(first).toEqual(second);
  });
});
