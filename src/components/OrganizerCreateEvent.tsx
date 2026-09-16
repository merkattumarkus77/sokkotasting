"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import AdminLoginGate from "@/components/AdminLoginGate";
import NameListInput from "@/components/NameListInput";
import { subscribeToActiveEvent } from "@/lib/clientRealtime";
import {
  MAX_TASTINGS_PER_EVENT,
  ROUND_ROBIN_MAX_ITEMS,
  ROUND_ROBIN_MIN_ITEMS,
  SEEDING_ROUNDS_DEFAULT,
  SEEDING_ROUNDS_MAX,
  SEEDING_ROUNDS_MIN,
  SWISS_MAX_ITEMS,
  SWISS_MIN_ITEMS,
} from "@/lib/limits";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import { bracketSize } from "@/lib/swissBracket";
import type { EventDoc, PortionUnit, TastingDoc, TastingLogic } from "@/lib/types";

async function fetchTastings(): Promise<TastingDoc[]> {
  const res = await fetch("/api/tastings");
  if (!res.ok) return [];
  const data = await res.json();
  return data.tastings as TastingDoc[];
}

function OrganizerCreateEventInner() {
  const [activeEvent, setActiveEvent] = useState<EventDoc | null>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);
  const [tastings, setTastings] = useState<TastingDoc[]>([]);

  const [eventName, setEventName] = useState("");
  const [category, setCategory] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [eventError, setEventError] = useState("");
  const [creatingEvent, setCreatingEvent] = useState(false);

  const [logic, setLogic] = useState<TastingLogic>("ROUND_ROBIN");
  const [tastingName, setTastingName] = useState("");
  const [productNames, setProductNames] = useState(["", "", ""]);
  const [portionAmount, setPortionAmount] = useState(30);
  const [portionUnit, setPortionUnit] = useState<PortionUnit>("ml");
  const [guessingEnabled, setGuessingEnabled] = useState(true);
  const [hasBronzeMatch, setHasBronzeMatch] = useState(false);
  const [seedingRounds, setSeedingRounds] = useState(SEEDING_ROUNDS_DEFAULT);
  const [timeLimitMinutesInput, setTimeLimitMinutesInput] = useState("");
  const [tastingError, setTastingError] = useState("");
  const [creatingTasting, setCreatingTasting] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

  const minItems = logic === "ROUND_ROBIN" ? ROUND_ROBIN_MIN_ITEMS : SWISS_MIN_ITEMS;
  const maxItems = logic === "ROUND_ROBIN" ? ROUND_ROBIN_MAX_ITEMS : SWISS_MAX_ITEMS;

  function handleLogicChange(next: TastingLogic) {
    setLogic(next);
    const target = next === "ROUND_ROBIN" ? ROUND_ROBIN_MIN_ITEMS : SWISS_MIN_ITEMS;
    setProductNames((current) =>
      current.length >= target ? current : [...current, ...Array(target - current.length).fill("")]
    );
  }

  useEffect(() => {
    const unsubscribe = subscribeToActiveEvent((event) => {
      setActiveEvent(event);
      setLoadingEvent(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeEvent) {
      setTastings([]);
      return;
    }
    fetchTastings().then(setTastings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent?.id]);

  async function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    setEventError("");
    if (!eventName.trim() || !category.trim()) {
      setEventError("Anna tapahtumalle nimi ja kategoria.");
      return;
    }
    setCreatingEvent(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: eventName.trim(),
          category: category.trim(),
          ...(activeEvent && overrideConfirmed
            ? { archivePreviousEventId: activeEvent.id }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEventError(
          data.error === "ACTIVE_EVENT_EXISTS"
            ? "Käynnissä on jo tapahtuma. Vahvista alla, jos haluat korvata sen."
            : (data.error ?? "Tapahtuman luonti epäonnistui.")
        );
        return;
      }
      setEventName("");
      setCategory("");
      setOverrideConfirmed(false);
    } catch {
      setEventError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setCreatingEvent(false);
    }
  }

  const trimmedProducts = productNames.map((n) => n.trim()).filter(Boolean);
  const itemCount = trimmedProducts.length;

  // SPEC 10: Round Robin's pairs-per-participant is exact. Swiss's is not
  // known in advance (depends on how many seeding rounds actually run), so
  // only the deterministic playoff portion (N-1 matches, +1 for bronze) is
  // shown, with the seeding stage called out as variable rather than guessed.
  const roundRobinPairs =
    logic === "ROUND_ROBIN" && itemCount >= ROUND_ROBIN_MIN_ITEMS
      ? pairsPerParticipantCount(itemCount)
      : 0;
  const swissBracketMatches =
    logic === "SWISS_TOURNAMENT" && itemCount >= SWISS_MIN_ITEMS
      ? itemCount - 1 + (hasBronzeMatch ? 1 : 0)
      : 0;
  const swissSize = itemCount >= SWISS_MIN_ITEMS ? bracketSize(itemCount) : 0;

  // SPEC 10: kokonaiskesto = pareja per osallistuja × kierrosaika, varoita jos > 3h.
  // Swississä alkusarjan pituus ei ole tiedossa etukäteen — käytetään
  // maksimia (seedingRounds+4 kierrosta täydellä floor(N/2) parimäärällä)
  // samasta syystä kuin raaka-ainelaskennassa: parempi varoittaa liikaa
  // kuin liian vähän.
  const swissMaxSeedingPairs =
    logic === "SWISS_TOURNAMENT" && itemCount >= SWISS_MIN_ITEMS
      ? (seedingRounds + 4) * Math.floor(itemCount / 2)
      : 0;
  const totalPairsEstimate =
    logic === "ROUND_ROBIN" ? roundRobinPairs : swissBracketMatches + swissMaxSeedingPairs;
  const timeLimitMinutesNum = Number(timeLimitMinutesInput) || 0;
  const estimatedDurationMinutes = totalPairsEstimate * timeLimitMinutesNum;
  const showDurationWarning = timeLimitMinutesNum > 0 && estimatedDurationMinutes > 180;

  async function handleCreateTasting(event: FormEvent) {
    event.preventDefault();
    setTastingError("");
    if (!tastingName.trim()) {
      setTastingError("Anna tastingille nimi.");
      return;
    }
    if (itemCount < minItems || itemCount > maxItems) {
      setTastingError(`Tuotteita on oltava ${minItems}–${maxItems}.`);
      return;
    }
    if (new Set(trimmedProducts).size !== trimmedProducts.length) {
      setTastingError("Tuotteiden nimet eivät voi toistua.");
      return;
    }
    setCreatingTasting(true);
    try {
      const res = await fetch("/api/tastings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tastingName.trim(),
          logic,
          itemNames: trimmedProducts,
          portionAmount,
          portionUnit,
          hasGuessing: guessingEnabled,
          hasBronzeMatch: logic === "SWISS_TOURNAMENT" ? hasBronzeMatch : false,
          timeLimitMinutes: timeLimitMinutesNum > 0 ? timeLimitMinutesNum : null,
          seedingRounds: logic === "SWISS_TOURNAMENT" ? seedingRounds : SEEDING_ROUNDS_DEFAULT,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTastingError(data.error ?? "Tastingin luonti epäonnistui.");
        return;
      }
      setTastingName("");
      setProductNames(Array(minItems).fill(""));
      setTimeLimitMinutesInput("");
      setTastings(await fetchTastings());
    } catch {
      setTastingError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setCreatingTasting(false);
    }
  }

  async function handleStart(tastingId: string) {
    setStartingId(tastingId);
    try {
      await fetch(`/api/tastings/${tastingId}/start`, { method: "POST" });
      setTastings(await fetchTastings());
    } finally {
      setStartingId(null);
    }
  }

  if (loadingEvent) return <p className="text-sm text-muted">Ladataan...</p>;

  return (
    <div className="flex w-full max-w-md flex-col gap-8 text-left">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <p className="font-medium">Tapahtuma</p>
        {activeEvent ? (
          <p className="text-sm text-muted">
            Käynnissä: <strong>{activeEvent.name}</strong> ({activeEvent.category})
          </p>
        ) : (
          <p className="text-sm text-muted">Ei aktiivista tapahtumaa.</p>
        )}

        <form onSubmit={handleCreateEvent} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {activeEvent ? "Uuden tapahtuman nimi" : "Tapahtuman nimi"}
            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Kategoria
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="esim. grillimakkarat"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            />
          </label>
          {activeEvent && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overrideConfirmed}
                onChange={(e) => setOverrideConfirmed(e.target.checked)}
              />
              Ymmärrän, korvaa käynnissä oleva tapahtuma
            </label>
          )}
          <button
            type="submit"
            disabled={creatingEvent || (Boolean(activeEvent) && !overrideConfirmed)}
            className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {creatingEvent ? "Luodaan..." : activeEvent ? "Korvaa tapahtuma" : "Luo tapahtuma"}
          </button>
          {eventError && <p className="text-sm text-danger">{eventError}</p>}
        </form>
      </section>

      {activeEvent && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
          <p className="font-medium">
            Tastingit ({tastings.length}/{MAX_TASTINGS_PER_EVENT})
          </p>
          <ul className="flex flex-col gap-2">
            {tastings.map((tasting) => (
              <li
                key={tasting.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{tasting.name}</p>
                  <p className="text-muted">
                    {tasting.items.length} tuotetta · {tasting.status}
                  </p>
                </div>
                {tasting.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleStart(tasting.id)}
                    disabled={startingId === tasting.id}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {startingId === tasting.id ? "Käynnistetään..." : "Käynnistä"}
                  </button>
                )}
              </li>
            ))}
          </ul>

          {tastings.length < MAX_TASTINGS_PER_EVENT && (
            <form
              onSubmit={handleCreateTasting}
              className="flex flex-col gap-4 border-t border-border pt-4"
            >
              <p className="font-medium">Uusi tasting</p>
              <label className="flex flex-col gap-1 text-sm">
                Tastingin nimi
                <input
                  type="text"
                  value={tastingName}
                  onChange={(e) => setTastingName(e.target.value)}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                />
              </label>

              <div className="flex gap-2">
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="logic"
                    checked={logic === "ROUND_ROBIN"}
                    onChange={() => handleLogicChange("ROUND_ROBIN")}
                  />
                  Round Robin
                </label>
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="logic"
                    checked={logic === "SWISS_TOURNAMENT"}
                    onChange={() => handleLogicChange("SWISS_TOURNAMENT")}
                  />
                  Sveitsiläinen turnaus
                </label>
              </div>

              <NameListInput
                label={`Maisteltavat tuotteet (${minItems}–${maxItems})`}
                values={productNames}
                onChange={setProductNames}
                placeholder="Tuote"
                minItems={minItems}
              />

              {logic === "SWISS_TOURNAMENT" && itemCount === SWISS_MAX_ITEMS && (
                <p className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
                  64 tuotetta tarkoittaa jopa 127 maistelua per osallistuja — käytännössä
                  mahdotonta yhdessä tilaisuudessa. Harkitse pienempää tuotemäärää.
                </p>
              )}

              <div className="flex gap-3">
                <label className="flex flex-1 flex-col gap-1 text-sm">
                  Kerta-annoksen koko
                  <input
                    type="number"
                    min={1}
                    value={portionAmount}
                    onChange={(e) => setPortionAmount(Number(e.target.value))}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                  />
                </label>
                <label className="flex w-24 flex-col gap-1 text-sm">
                  Yksikkö
                  <select
                    value={portionUnit}
                    onChange={(e) => setPortionUnit(e.target.value as PortionUnit)}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                  >
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                Kierrosaika minuutteina (valinnainen — tyhjä = ei ajastinta)
                <input
                  type="number"
                  min={1}
                  value={timeLimitMinutesInput}
                  onChange={(e) => setTimeLimitMinutesInput(e.target.value)}
                  className="w-24 rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={guessingEnabled}
                  onChange={(e) => setGuessingEnabled(e.target.checked)}
                />
                Arvausominaisuus päällä
              </label>

              {logic === "SWISS_TOURNAMENT" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hasBronzeMatch}
                      onChange={(e) => setHasBronzeMatch(e.target.checked)}
                    />
                    Pronssiottelu päällä
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Alkusarjan vähimmäiskierrokset ({SEEDING_ROUNDS_MIN}–{SEEDING_ROUNDS_MAX})
                    <input
                      type="number"
                      min={SEEDING_ROUNDS_MIN}
                      max={SEEDING_ROUNDS_MAX}
                      value={seedingRounds}
                      onChange={(e) => setSeedingRounds(Number(e.target.value))}
                      className="w-24 rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
                    />
                  </label>
                </>
              )}

              <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-muted">
                {logic === "ROUND_ROBIN" ? (
                  <>Paria per osallistuja: {roundRobinPairs || "–"}</>
                ) : (
                  <>
                    <p>
                      Pudotuspeliotteluja per osallistuja:{" "}
                      {itemCount >= SWISS_MIN_ITEMS ? swissBracketMatches : "–"} (kaaviokoko{" "}
                      {swissSize || "–"})
                    </p>
                    <p className="mt-1">
                      Lisäksi alkusarja, jonka pituus vaihtelee osallistujan arvioiden mukaan —
                      ei tarkkaa lukua etukäteen.
                    </p>
                  </>
                )}
                {timeLimitMinutesNum > 0 && (
                  <p className="mt-1">
                    Arvioitu kokonaiskesto: ~{estimatedDurationMinutes} min
                    {logic === "SWISS_TOURNAMENT" ? " (maksimiarvio)" : ""}
                  </p>
                )}
              </div>

              {showDurationWarning && (
                <p className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-danger">
                  Kokonaiskesto ylittää 3 tuntia (~{estimatedDurationMinutes} min). Harkitse
                  lyhyempää kierrosaikaa tai pienempää tuotemäärää.
                </p>
              )}

              <button
                type="submit"
                disabled={creatingTasting}
                className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
              >
                {creatingTasting ? "Luodaan..." : "Luo tasting"}
              </button>
              {tastingError && <p className="text-sm text-danger">{tastingError}</p>}
            </form>
          )}
        </section>
      )}

      <Link
        href="/jarjesta/dashboard"
        className="self-start text-sm text-muted underline underline-offset-4"
      >
        Siirry hallintapaneeliin
      </Link>
    </div>
  );
}

export default function OrganizerCreateEvent() {
  return (
    <AdminLoginGate>
      <OrganizerCreateEventInner />
    </AdminLoginGate>
  );
}
