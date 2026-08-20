"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getGuessCounts, submitScore } from "@/lib/scores";
import type { Participant, Round, TastingEvent } from "@/lib/types";

interface EvaluationFormProps {
  participant: Participant;
  event: TastingEvent;
  round: Round;
}

export default function EvaluationForm({ participant, event, round }: EvaluationFormProps) {
  const [pointsA, setPointsA] = useState(25);
  const [notes, setNotes] = useState("");
  const [guessAIndex, setGuessAIndex] = useState<number | "">("");
  const [guessBIndex, setGuessBIndex] = useState<number | "">("");
  const [guessCounts, setGuessCounts] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPointsA(25);
    setNotes("");
    setGuessAIndex("");
    setGuessBIndex("");
    setError("");
  }, [round.index]);

  useEffect(() => {
    let cancelled = false;
    if (event.guessingEnabled) {
      getGuessCounts(participant.id, event.productNames.length).then((counts) => {
        if (!cancelled) setGuessCounts(counts);
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participant.id, round.index]);

  const pointsB = 50 - pointsA;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (event.guessingEnabled) {
      if (guessAIndex === "" || guessBIndex === "") {
        setError("Valitse arvaus molemmille tuotteille.");
        return;
      }
      if (guessAIndex === guessBIndex) {
        setError("Et voi arvata samaa tuotetta molemmille.");
        return;
      }
    }
    setSubmitting(true);
    setError("");
    try {
      await submitScore(participant, round, {
        pointsA,
        notes: notes.trim(),
        guessAIndex: event.guessingEnabled ? (guessAIndex as number) : undefined,
        guessBIndex: event.guessingEnabled ? (guessBIndex as number) : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tallennus epäonnistui.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5 text-left">
      <div className="text-center">
        <p className="text-xl font-semibold">Kierros {round.index + 1}/{participant.rounds.length}</p>
        <p className="text-sm text-muted">Jaa 50 pistettä tuotteiden A ja B kesken.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm">
          <span>
            Tuote A: <strong>{pointsA}</strong>
          </span>
          <span>
            Tuote B: <strong>{pointsB}</strong>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          value={pointsA}
          onChange={(e) => setPointsA(Number(e.target.value))}
          className="w-full accent-accent"
          aria-label="Tuote A:n pisteet"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Muistiinpanot (vapaaehtoinen)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {event.guessingEnabled && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm font-medium">Arvaa tuotteet</p>
          <label className="flex flex-col gap-1 text-sm">
            Tuote A on mielestäni
            <select
              value={guessAIndex}
              onChange={(e) =>
                setGuessAIndex(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            >
              <option value="">Valitse...</option>
              {event.productNames.map((productName, i) => (
                <option key={i} value={i}>
                  {productName}
                  {guessCounts[i] ? ` (arvattu ${guessCounts[i]} kertaa)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Tuote B on mielestäni
            <select
              value={guessBIndex}
              onChange={(e) =>
                setGuessBIndex(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            >
              <option value="">Valitse...</option>
              {event.productNames.map((productName, i) => (
                <option key={i} value={i}>
                  {productName}
                  {guessCounts[i] ? ` (arvattu ${guessCounts[i]} kertaa)` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Tallennetaan..." : "Hyväksy"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
