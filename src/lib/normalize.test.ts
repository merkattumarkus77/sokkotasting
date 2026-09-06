import { describe, expect, it } from "vitest";
import { normalizeName, slugify } from "@/lib/normalize";

describe("normalizeName", () => {
  it("trims and lowercases", () => {
    expect(normalizeName("  Atria ")).toBe("atria");
    expect(normalizeName("Atria")).toBe(normalizeName("atria"));
  });
});

describe("slugify", () => {
  it("produces a URL-safe, accent-free slug", () => {
    expect(slugify("Grillimakkarat")).toBe("grillimakkarat");
    expect(slugify("Äidin pullat")).toBe("aidin-pullat");
    expect(slugify("  Olut & Siideri  ")).toBe("olut-siideri");
  });
});
