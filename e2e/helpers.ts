import { expect, type Locator, type Page } from "@playwright/test";
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME, E2E_EVENT_PASSWORD } from "./credentials";

export async function loginAdmin(page: Page) {
  await page.goto("/jarjesta");
  await page.getByLabel("Tunnus").fill(E2E_ADMIN_USERNAME);
  await page.getByLabel("Salasana").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Kirjaudu" }).click();
  await expect(page.getByLabel(/tapahtuman nimi/i)).toBeVisible();
}

// The event-name label and submit button both read differently ("Uuden
// tapahtuman nimi" / "Korvaa tapahtuma") when an active event from a
// previous test run is still open — the Firestore emulator persists across
// every spec in one `npm run e2e` invocation, so this branch is routinely hit.
export async function createEvent(page: Page, name: string, category: string) {
  await page.getByLabel(/tapahtuman nimi/i).fill(name);
  await page.getByLabel("Kategoria").fill(category);
  const overrideCheckbox = page.getByLabel("Ymmärrän, korvaa käynnissä oleva tapahtuma");
  if (await overrideCheckbox.isVisible().catch(() => false)) {
    await overrideCheckbox.check();
  }
  await page.getByRole("button", { name: /Luo tapahtuma|Korvaa tapahtuma/ }).click();
  await expect(page.getByText(new RegExp(`Käynnissä:.*${name}`))).toBeVisible();
}

async function fillProducts(page: Page, items: string[]) {
  const productInputs = page.locator('input[placeholder^="Tuote "]');
  while ((await productInputs.count()) < items.length) {
    await page.getByRole("button", { name: "+ Lisää" }).click();
  }
  for (let i = 0; i < items.length; i++) {
    await productInputs.nth(i).fill(items[i]!);
  }
}

interface CreateTastingOptions {
  name: string;
  logic?: "ROUND_ROBIN" | "SWISS_TOURNAMENT";
  items: string[];
  guessing?: boolean;
  hasBronzeMatch?: boolean;
}

export async function createTasting(page: Page, opts: CreateTastingOptions) {
  if (opts.logic === "SWISS_TOURNAMENT") {
    await page.getByLabel("Sveitsiläinen turnaus").check();
  } else {
    await page.getByLabel("Round Robin").check();
  }
  await page.getByLabel("Tastingin nimi").fill(opts.name);
  await fillProducts(page, opts.items);
  if (opts.guessing === false) {
    await page.getByLabel("Arvausominaisuus päällä").uncheck();
  }
  if (opts.logic === "SWISS_TOURNAMENT" && opts.hasBronzeMatch) {
    await page.getByLabel("Pronssiottelu päällä").check();
  }
  await page.getByRole("button", { name: "Luo tasting" }).click();
  await expect(page.locator("li", { hasText: opts.name })).toBeVisible();
}

export async function startTasting(page: Page, tastingName: string) {
  const row = page.locator("li", { hasText: tastingName });
  await row.getByRole("button", { name: "Käynnistä" }).click();
  await expect(row.getByText("in_progress")).toBeVisible();
}

export async function goToDashboard(page: Page, tastingName?: string) {
  await page.goto("/jarjesta/dashboard");
  await expect(page.getByRole("button", { name: "Sulje tapahtuma" })).toBeVisible();
  if (tastingName) {
    const select = page.locator("select");
    // The <select> only renders once the (separately-fetched) tastings list
    // has loaded, and only when there's more than one tasting — a plain
    // isVisible() snapshot check races that fetch and can silently no-op,
    // leaving whichever tasting was selected before as the active one.
    const appeared = await select
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      await select.selectOption({ label: tastingName });
      // selectOption resolves once the DOM value changes, but the entries
      // panel refetches asynchronously afterwards — give it a moment so
      // callers don't read entries for the previously-selected tasting.
      await page.waitForTimeout(1500);
    }
  }
}

export async function loginParticipant(page: Page, name: string) {
  await page.goto("/osallistu");
  await page.getByLabel("Nimi").fill(name);
  await page.getByLabel("Yhteinen salasana").fill(E2E_EVENT_PASSWORD);
  await page.getByRole("button", { name: "Kirjaudu" }).click();
  await expect(page.getByText("Kirjautunut nimellä")).toBeVisible();
}

export function tastingCard(page: Page, tastingName: string) {
  return page.locator("div.rounded-xl.border.border-border.bg-surface.p-5", {
    hasText: tastingName,
  });
}

// Submits the currently-served round in a participant's tasting card, if
// one is being served right now. Returns whether a submission happened.
export async function submitServedRoundIfAny(page: Page, tastingName: string): Promise<boolean> {
  const card = tastingCard(page, tastingName);
  const submitButton = card.getByRole("button", { name: "Hyväksy" });
  if (!(await submitButton.isVisible().catch(() => false))) return false;

  // Leaving the slider at its fixed default (always the same split, every
  // round) is unrealistic and, worse, produced a real finding: an 8-item
  // Swiss tasting needed 26+ seeding rounds instead of the usual ~5 when
  // both participants always submitted an identical score — see
  // docs/TESTIRAPORTTI.md. Vary it like a real participant would.
  const slider = card.locator('input[type="range"]');
  if (await slider.isVisible().catch(() => false)) {
    const value = 5 + Math.floor(Math.random() * 9) * 5; // 5,10,...,45 — never 25 (forbidden tie in Swiss)
    await slider
      .evaluate((el, v) => {
        const input = el as HTMLInputElement;
        input.value = String(v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, value === 25 ? 30 : value)
      .catch(() => {});
  }

  // The card re-renders on every 3s my-round poll, which can detach this
  // exact element between the visibility check and the click — and without
  // a short timeout, Playwright's actionability retry can spin on that for
  // a very long time instead of just failing fast. Treat a failed click as
  // "nothing submitted this pass" rather than a hard failure — the
  // caller's polling loop will simply try again with a fresh element.
  const clicked = await submitButton
    .click({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) return false;
  await expect(submitButton).not.toBeVisible({ timeout: 10000 });
  return true;
}

export function isTastingFinished(page: Page, tastingName: string) {
  return tastingCard(page, tastingName).getByText(/kierrosta suoritettu|Valmis!/);
}

// ResultsView repeats section-heading text ("Ryhmän tulokset", "Omat
// pisteet") as export-checkbox labels further down the same card, so a
// plain getByText hits a strict-mode violation (two matches). Scope to the
// heading <p>'s own classes to pick the section title, not the checkbox.
export function resultsHeading(card: Locator, label: string) {
  return card.locator("p.mb-1.text-sm.font-medium", { hasText: label });
}

// Admin-side: repeatedly bulk-serves whatever is waiting and lets every
// given participant page submit its served round, until the dashboard shows
// every participant as "Valmis" (done). Used instead of a fixed step count
// because Round Robin (fixed N) and Swiss (variable seeding length) finish
// in different numbers of rounds. Exits only on the explicit "everyone
// done" signal, never on "nothing happened this pass" — a round can
// legitimately not exist yet (participant hasn't called ensure-rounds) on
// an early pass, which must not be mistaken for the tasting being finished.
export async function playTastingToCompletion(
  adminPage: Page,
  participantPages: Page[],
  tastingName: string,
  maxPasses = 150
) {
  for (let pass = 0; pass < maxPasses; pass++) {
    // Real round-to-round latency is gated by the app's own poll intervals
    // (dashboard entries every 4s, participant my-round every 3s), not by
    // this loop — so keep this wait short and just re-check often instead
    // of adding extra delay on top. An 8-item Swiss tasting legitimately
    // needs ~29-30 sequential pairwise rounds per participant (up to 6
    // seeding batches of floor(N/2) pairs each, plus N-1 playoff matches —
    // see docs/TESTIRAPORTTI.md), so maxPasses is generous on purpose.
    await adminPage.waitForTimeout(300);

    const serveAllButton = adminPage.getByRole("button", { name: "Kuittaa kaikki odottavat" });
    if (await serveAllButton.isVisible().catch(() => false)) {
      // Same detach race as submitServedRoundIfAny: the dashboard's own
      // 4s entries poll can re-render this button out from under the
      // click. A short timeout keeps a stuck retry from eating the whole
      // test budget — ignore a failed click here, the next pass retries.
      await serveAllButton.click({ timeout: 5000 }).catch(() => {});
      await adminPage.waitForTimeout(200);
    }

    for (const participantPage of participantPages) {
      await submitServedRoundIfAny(participantPage, tastingName);
    }

    const doneCount = await adminPage.getByText("Valmis", { exact: true }).count();
    if (doneCount >= participantPages.length) return;
  }
  throw new Error(`playTastingToCompletion: "${tastingName}" did not finish within ${maxPasses} passes.`);
}

// Call goToDashboard(adminPage, tastingName) first so the right tasting is selected.
export async function publishTasting(adminPage: Page) {
  await adminPage.getByRole("button", { name: "Päätä tasting ja julkaise" }).click();
  await adminPage.getByRole("button", { name: "Vahvista julkaisu" }).click();
  await expect(adminPage.getByText("Tulokset", { exact: true })).toBeVisible({ timeout: 10000 });
}
