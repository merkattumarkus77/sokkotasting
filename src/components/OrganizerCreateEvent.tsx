"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import AdminLoginGate from "@/components/AdminLoginGate";
import NameListInput from "@/components/NameListInput";
import { subscribeToActiveEvent } from "@/lib/clientRealtime";
import { MAX_TASTINGS_PER_EVENT, ROUND_ROBIN_MAX_ITEMS, ROUND_ROBIN_MIN_ITEMS } from "@/lib/limits";
import { pairsPerParticipantCount } from "@/lib/roundRobin";
import type { EventDoc, PortionUnit, TastingDoc } from "@/lib/types";

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

  const [tastingName, setTastingName] = useState("");
  const [productNames, setProductNames] = useState(["", "", ""]);
  const [portionAmount, setPortionAmount] = useState(30);
  const [portionUnit, setPortionUnit] = useState<PortionUnit>("ml");
  const [guessingEnabled, setGuessingEnabled] = useState(true);
  const [tastingError, setTastingError] = useState("");
  const [creatingTasting, setCreatingTasting] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);

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
  const pairsPerParticipant =
    trimmedProducts.length >= ROUND_ROBIN_MIN_ITEMS
      ? pairsPerParticipantCount(trimmedProducts.length)
      : 0;

  async function handleCreateTasting(event: FormEvent) {
    event.preventDefault();
    setTastingError("");
    if (!tastingName.trim()) {
      setTastingError("Anna tastingille nimi.");
      return;
    }
    if (
      trimmedProducts.length < ROUND_ROBIN_MIN_ITEMS ||
      trimmedProducts.length > ROUND_ROBIN_MAX_ITEMS
    ) {
      setTastingError(`Tuotteita on oltava ${ROUND_ROBIN_MIN_ITEMS}–${ROUND_ROBIN_MAX_ITEMS}.`);
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
          logic: "ROUND_ROBIN",
          itemNames: trimmedProducts,
          portionAmount,
          portionUnit,
          hasGuessing: guessingEnabled,
          hasBronzeMatch: false,
          timeLimitMinutes: null,
          seedingRounds: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTastingError(data.error ?? "Tastingin luonti epäonnistui.");
        return;
      }
      setTastingName("");
      setProductNames(["", "", ""]);
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

              <NameListInput
                label={`Maisteltavat tuotteet (${ROUND_ROBIN_MIN_ITEMS}–${ROUND_ROBIN_MAX_ITEMS})`}
                values={productNames}
                onChange={setProductNames}
                placeholder="Tuote"
                minItems={ROUND_ROBIN_MIN_ITEMS}
              />

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

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={guessingEnabled}
                  onChange={(e) => setGuessingEnabled(e.target.checked)}
                />
                Arvausominaisuus päällä
              </label>

              <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-muted">
                Paria per osallistuja: {pairsPerParticipant || "–"}
              </div>

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
