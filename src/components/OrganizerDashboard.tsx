"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkPassword } from "@/lib/config";
import { getActiveEvent } from "@/lib/events";
import { markCurrentRoundServed, subscribeToEventParticipants } from "@/lib/participants";
import type { Participant, TastingEvent } from "@/lib/types";

type View = "password" | "loading" | "empty" | "dashboard";

function statusFor(participant: Participant): string {
  const total = participant.rounds.length;
  if (participant.currentRoundIndex >= total) return "Valmis";
  const round = participant.rounds[participant.currentRoundIndex]!;
  if (!round.served) {
    return participant.currentRoundIndex === 0 ? "Odottaa maistiaisia" : "Odottaa seuraavaa kierrosta";
  }
  return round.completed ? "Odottaa seuraavaa kierrosta" : "Maistamassa";
}

export default function OrganizerDashboard() {
  const [view, setView] = useState<View>("password");

  const [password, setPassword] = useState("");
  const [passwordChecking, setPasswordChecking] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const [event, setEvent] = useState<TastingEvent | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [servingId, setServingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordChecking(true);
    setPasswordError("");
    try {
      const valid = await checkPassword(password);
      if (!valid) {
        setPasswordError("Väärä salasana.");
        return;
      }
      setView("loading");
      const activeEvent = await getActiveEvent();
      if (!activeEvent) {
        setView("empty");
        return;
      }
      setEvent(activeEvent);
      unsubscribeRef.current = subscribeToEventParticipants(activeEvent.id, setParticipants);
      setView("dashboard");
    } catch {
      setPasswordError("Yhteys tietokantaan epäonnistui.");
      setView("password");
    } finally {
      setPasswordChecking(false);
    }
  }

  async function handleServe(participant: Participant) {
    setServingId(participant.id);
    setActionError("");
    try {
      await markCurrentRoundServed(participant);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Kuittaus epäonnistui.");
    } finally {
      setServingId(null);
    }
  }

  if (view === "password") {
    return (
      <form onSubmit={handlePasswordSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm">
          Yhteinen salasana
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            autoComplete="current-password"
          />
        </label>
        <button
          type="submit"
          disabled={passwordChecking || password.length === 0}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {passwordChecking ? "Tarkistetaan..." : "Jatka"}
        </button>
        {passwordError && <p className="text-sm text-danger">{passwordError}</p>}
      </form>
    );
  }

  if (view === "loading") {
    return <p className="text-sm text-muted">Ladataan...</p>;
  }

  if (view === "empty" || !event) {
    return <p className="text-sm text-muted">Aktiivista tastingia ei löytynyt.</p>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-left">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-medium">{event.name}</p>
        <p className="text-sm text-muted">
          {event.category} · {participants.length} osallistujaa
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {participants.map((participant) => {
          const total = participant.rounds.length;
          const status = statusFor(participant);
          const round =
            participant.currentRoundIndex < total
              ? participant.rounds[participant.currentRoundIndex]
              : null;

          return (
            <div key={participant.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{participant.name}</p>
                <span className="text-sm text-muted">{status}</span>
              </div>
              {round ? (
                <p className="mt-1 text-sm text-muted">
                  Kierros {round.index + 1}/{total} — Tarjoile A ={" "}
                  {event.productNames[round.productAIndex]}, B ={" "}
                  {event.productNames[round.productBIndex]}
                </p>
              ) : (
                <p className="mt-1 text-sm text-success">Kaikki {total} kierrosta suoritettu.</p>
              )}
              {round && !round.served && (
                <button
                  type="button"
                  onClick={() => handleServe(participant)}
                  disabled={servingId === participant.id}
                  className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                >
                  {servingId === participant.id ? "Kuitataan..." : "Kuittaa tarjoiltu"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {actionError && <p className="text-sm text-danger">{actionError}</p>}
    </div>
  );
}
