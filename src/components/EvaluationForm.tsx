"use client";

import { useEffect, useState, type FormEvent } from "react";
import { NOTES_MAX_LENGTH } from "@/lib/limits";
import type { TastingLogic } from "@/lib/types";

export interface GuessOption {
  id: string;
  name: string;
  guessedCount: number;
}

const PHASE_LABELS: Record<string, string> = {
  SEEDING: "alkusarja",
  PLAYOFF: "pudotuspelit",
  DONE: "pudotuspelit",
};

interface EvaluationFormProps {
  tastingId: string;
  roundId: string;
  roundIndex: number;
  totalRounds: number | null;
  logic: TastingLogic;
  phase?: string;
  hasGuessing: boolean;
  guessOptions: GuessOption[];
  onSubmitted: () => void;
}

export default function EvaluationForm({
  tastingId,
  roundId,
  roundIndex,
  totalRounds,
  logic,
  phase,
  hasGuessing,
  guessOptions,
  onSubmitted,
}: EvaluationFormProps) {
  const isSwiss = logic === "SWISS_TOURNAMENT";
  const [pointsA, setPointsA] = useState(isSwiss ? 30 : 25);
  const [notes, setNotes] = useState("");
  const [guessAId, setGuessAId] = useState("");
  const [guessBId, setGuessBId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPointsA(isSwiss ? 30 : 25);
    setNotes("");
    setGuessAId("");
    setGuessBId("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  const pointsB = 50 - pointsA;

  function handlePointsChange(value: number) {
    // SPEC 6.2: the slider must never rest on 25 (a tie) in Swiss — nudge
    // it forward rather than let it land there.
    setPointsA(isSwiss && value === 25 ? 26 : value);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (hasGuessing && guessAId && guessBId && guessAId === guessBId) {
      setError("Et voi arvata samaa tuotetta molemmille.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/tastings/${tastingId}/rounds/${roundId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreA: pointsA,
          notes: notes.trim(),
          guessAId: hasGuessing && guessAId ? guessAId : null,
          guessBId: hasGuessing && guessBId ? guessBId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Tallennus epäonnistui.");
        return;
      }
      onSubmitted();
    } catch {
      setError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5 text-left">
      <div className="text-center">
        <p className="text-xl font-semibold">
          Kierros {roundIndex + 1}
          {totalRounds != null
            ? `/${totalRounds}`
            : phase
              ? ` (${PHASE_LABELS[phase] ?? phase.toLowerCase()})`
              : ""}
        </p>
        <p className="text-sm text-muted">
          {isSwiss
            ? "Jaa 50 pistettä tuotteiden A ja B kesken. Tasapeli ei ole sallittu."
            : "Jaa 50 pistettä tuotteiden A ja B kesken."}
        </p>
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
          onChange={(e) => handlePointsChange(Number(e.target.value))}
          className="w-full accent-accent"
          aria-label="Tuote A:n pisteet"
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Muistiinpanot (vapaaehtoinen)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          className="rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {hasGuessing && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
          <p className="text-sm font-medium">Arvaa tuotteet</p>
          <label className="flex flex-col gap-1 text-sm">
            Tuote A on mielestäni
            <select
              value={guessAId}
              onChange={(e) => setGuessAId(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            >
              <option value="">Valitse...</option>
              {guessOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.guessedCount ? ` (arvattu ${option.guessedCount} kertaa)` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Tuote B on mielestäni
            <select
              value={guessBId}
              onChange={(e) => setGuessBId(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 outline-none focus:border-accent"
            >
              <option value="">Valitse...</option>
              {guessOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.guessedCount ? ` (arvattu ${option.guessedCount} kertaa)` : ""}
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
