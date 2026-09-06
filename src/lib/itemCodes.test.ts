import { describe, expect, it } from "vitest";
import { assignItemCodes } from "@/lib/itemCodes";

describe("assignItemCodes", () => {
  it("assigns T1, T2, ... in entry order", () => {
    const items = assignItemCodes(["Atria", "Snellman", "HK"], () => crypto.randomUUID());
    expect(items.map((i) => i.code)).toEqual(["T1", "T2", "T3"]);
    expect(items.map((i) => i.name)).toEqual(["Atria", "Snellman", "HK"]);
  });

  it("gives every item a unique id", () => {
    const items = assignItemCodes(["A", "B", "C"], () => crypto.randomUUID());
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
  });
});
