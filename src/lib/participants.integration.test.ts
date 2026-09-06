import { describe, expect, it } from "vitest";
import { loginParticipant } from "@/lib/participants";

// SPEC 15.2: "toinen kirjautuminen samalla nimimerkillä mitätöi ensimmäisen
// sessiotokenin" — same participant document, fresh activeSessionId.
describe("loginParticipant duplicate login", () => {
  it("reuses the same participant but issues a new sessionId each time", async () => {
    const eventId = crypto.randomUUID();

    const first = await loginParticipant(eventId, "Matti");
    const second = await loginParticipant(eventId, "Matti");

    expect(second.participant.id).toBe(first.participant.id);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.participant.activeSessionId).toBe(second.sessionId);
  });

  it("normalizes the nickname for uniqueness (trim + lowercase)", async () => {
    const eventId = crypto.randomUUID();

    const first = await loginParticipant(eventId, "Matti");
    const second = await loginParticipant(eventId, "  matti  ");

    expect(second.participant.id).toBe(first.participant.id);
  });
});
