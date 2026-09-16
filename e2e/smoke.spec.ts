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

// SPEC 15.4 smoke test: admin creates an event and a Round Robin tasting,
// two participants log in and play every round, admin publishes, and both
// participants see the results. Run for real against the Firestore
// emulator + a live Next.js dev server (npm run e2e) — not just written.
test("admin creates a Round Robin tasting, two participants play it, results are published", async ({
  browser,
}) => {
  const adminPage = await (await browser.newContext()).newPage();
  const participant1 = await (await browser.newContext()).newPage();
  const participant2 = await (await browser.newContext()).newPage();

  const tastingName = `Savutesti ${Date.now()}`;

  await loginAdmin(adminPage);
  await createEvent(adminPage, `Savutapahtuma ${Date.now()}`, "Testikategoria");
  await createTasting(adminPage, {
    name: tastingName,
    logic: "ROUND_ROBIN",
    items: ["Tuote A", "Tuote B", "Tuote C", "Tuote D"],
  });
  await startTasting(adminPage, tastingName);

  await loginParticipant(participant1, "Savutestaaja 1");
  await loginParticipant(participant2, "Savutestaaja 2");

  await goToDashboard(adminPage, tastingName);
  await playTastingToCompletion(adminPage, [participant1, participant2], tastingName);

  await expect(isTastingFinished(participant1, tastingName)).toBeVisible();
  await expect(isTastingFinished(participant2, tastingName)).toBeVisible();

  await publishTasting(adminPage);

  for (const participant of [participant1, participant2]) {
    const card = tastingCard(participant, tastingName);
    await expect(resultsHeading(card, "Ryhmän tulokset")).toBeVisible({ timeout: 15000 });
    await expect(resultsHeading(card, "Omat pisteet")).toBeVisible();
  }
});
