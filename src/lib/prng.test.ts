import { describe, expect, it } from "vitest";
import { createRng } from "@/lib/prng";

describe("createRng", () => {
  it("returns values in [0, 1)", () => {
    const random = createRng("seed");
    for (let i = 0; i < 100; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = createRng("sama");
    const b = createRng("sama");
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("differs for different seeds", () => {
    const a = createRng("a");
    const b = createRng("b");
    expect(a()).not.toBe(b());
  });
});
