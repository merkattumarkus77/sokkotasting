import { expect, test } from "@playwright/test";
import {
  createEvent,
  createTasting,
  goToDashboard,
  isTastingFinished,
  loginAdmin,
  loginParticipant,
  playTastingToCompletion,
  publishTasting,
  resultsHeading,
  startTasting,
  tastingCard,
} from "./helpers";

// The user's explicit ask for Vaihe H: confirm — through a real browser, not
// just the backend scenario script (scripts/simulate-scenario.ts) — that a
// participant can see and play two parallel tastings under the same event
// where one uses Round Robin and the other uses the Swiss tournament
// bracket, and that publishing one doesn't disturb the other.
test("a participant plays a Round Robin and a Swiss tasting running in parallel under one event", async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage();
  const participant1 = await (await browser.newContext()).newPage();
  const participant2 = await (await browser.newContext()).newPage();

  const rrName = `RR-rinnakkain ${Date.now()}`;
  const swissName = `Swiss-rinnakkain ${Date.now()}`;

  await loginAdmin(adminPage);
  await createEvent(adminPage, `Rinnakkaistapahtuma ${Date.now()}`, "Testikategoria");
  await createTasting(adminPage, {
    name: rrName,
    logic: "ROUND_ROBIN",
    items: ["Olut 1", "Olut 2", "Olut 3"],
  });
  await createTasting(adminPage, {
    name: swissName,
    logic: "SWISS_TOURNAMENT",
    items: ["Viini 1", "Viini 2", "Viini 3", "Viini 4", "Viini 5", "Viini 6", "Viini 7", "Viini 8"],
  });
  await startTasting(adminPage, rrName);
  await startTasting(adminPage, swissName);

  await loginParticipant(participant1, "Rinnakkaistestaaja 1");
  await loginParticipant(participant2, "Rinnakkaistestaaja 2");

  // Both tasting cards must be visible at once — this is the part the
  // headless backend scenario script cannot check.
  await expect(tastingCard(participant1, rrName)).toBeVisible();
  await expect(tastingCard(participant1, swissName)).toBeVisible();

  await goToDashboard(adminPage, rrName);
  await playTastingToCompletion(adminPage, [participant1, participant2], rrName);
  await expect(isTastingFinished(participant1, rrName)).toBeVisible();

  // The Swiss tasting must still be independently playable while the RR one
  // has finished but not yet been published.
  await expect(tastingCard(participant1, swissName).getByRole("button", { name: "Hyväksy" }).or(
    tastingCard(participant1, swissName).getByText(/Odottaa tarjoilua|Ladataan/)
  )).toBeVisible();

  await goToDashboard(adminPage, swissName);
  // An 8-item Swiss tasting legitimately needs ~29-30 sequential pairwise
  // rounds per participant — see docs/TESTIRAPORTTI.md — so this needs a
  // much larger pass budget than the 3-round Round Robin tasting above.
  // The two participants don't always finish in lockstep (seeding pairing
  // depends on each one's own scores), so budget well past the 29-30 the
  // faster one needs.
  await playTastingToCompletion(adminPage, [participant1, participant2], swissName, 400);
  await expect(isTastingFinished(participant1, swissName)).toBeVisible();
  await expect(isTastingFinished(participant2, swissName)).toBeVisible();

  // Publish RR while Swiss is finished-but-unpublished: RR must show
  // results, Swiss must remain in its own "all rounds done, not published"
  // state — publishing one tasting must not leak into the other.
  await goToDashboard(adminPage, rrName);
  await publishTasting(adminPage);

  await expect(resultsHeading(tastingCard(participant1, rrName), "Ryhmän tulokset")).toBeVisible({
    timeout: 15000,
  });
  await expect(isTastingFinished(participant1, swissName)).toBeVisible();
  await expect(
    resultsHeading(tastingCard(participant1, swissName), "Ryhmän tulokset")
  ).not.toBeVisible();

  await goToDashboard(adminPage, swissName);
  await publishTasting(adminPage);
  await expect(resultsHeading(tastingCard(participant2, swissName), "Ryhmän tulokset")).toBeVisible({
    timeout: 15000,
  });
});
