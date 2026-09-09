import { describe, expect, it } from "vitest";
import {
  buildOrganizerMarkdown,
  buildParticipantMarkdown,
  formatPercentage,
} from "@/lib/exportMarkdown";

describe("formatPercentage", () => {
  it("rounds to one decimal", () => {
    expect(formatPercentage(66.6666)).toBe("66.7 %");
  });

  it("shows an em dash instead of NaN for untasted items", () => {
    expect(formatPercentage(null)).toBe("—");
  });
});

describe("buildOrganizerMarkdown", () => {
  it("includes every requested section with real names", () => {
    const md = buildOrganizerMarkdown({
      eventName: "Kesäjuhlat",
      tastingName: "Makkaratasting",
      groupRanking: [{ itemName: "Atria", percentage: 60 }],
      participants: [{ name: "Matti", ownScores: [{ itemName: "Atria", percentage: 55 }] }],
      notes: [{ participantName: "Matti", itemNames: ["Atria", "Snellman"], notes: "Mausteinen" }],
      guessingRanking: [{ name: "Matti", correctGuesses: 2, attemptedGuesses: 2 }],
    });

    expect(md).toContain("Makkaratasting");
    expect(md).toContain("Ryhmän tulokset");
    expect(md).toContain("Osallistujakohtaiset tulokset");
    expect(md).toContain("Matti");
    expect(md).toContain("Muistiinpanot");
    expect(md).toContain("Mausteinen");
    expect(md).toContain("Arvauskisa");
  });

  it("omits empty notes and skips the guessing section when there is none", () => {
    const md = buildOrganizerMarkdown({
      eventName: "E",
      tastingName: "T",
      groupRanking: [{ itemName: "A", percentage: 50 }],
      participants: [],
      notes: [{ participantName: "Matti", itemNames: ["A", "B"], notes: "   " }],
      guessingRanking: null,
    });
    expect(md).not.toContain("Arvauskisa");
    // the blank note line itself should not appear as a bullet
    expect(md).not.toMatch(/- \*\*Matti\*\*/);
  });
});

describe("buildParticipantMarkdown", () => {
  it("respects the include flags", () => {
    const base = {
      eventName: "E",
      tastingName: "T",
      participantName: "Matti",
      ownScores: [{ itemName: "A", percentage: 50 }],
      ownNotes: [{ participantName: "Matti", itemNames: ["A", "B"] as [string, string], notes: "Hyvä" }],
      groupRanking: [{ itemName: "A", percentage: 55 }],
    };

    const onlyScores = buildParticipantMarkdown({
      ...base,
      includeOwnScores: true,
      includeOwnNotes: false,
      includeGroupResults: false,
    });
    expect(onlyScores).toContain("Omat pisteet");
    expect(onlyScores).not.toContain("Omat muistiinpanot");
    expect(onlyScores).not.toContain("Ryhmän tulokset");

    const everything = buildParticipantMarkdown({
      ...base,
      includeOwnScores: true,
      includeOwnNotes: true,
      includeGroupResults: true,
    });
    expect(everything).toContain("Omat pisteet");
    expect(everything).toContain("Omat muistiinpanot");
    expect(everything).toContain("Ryhmän tulokset");
  });
});
