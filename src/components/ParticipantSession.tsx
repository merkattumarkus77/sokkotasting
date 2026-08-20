"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import EvaluationForm from "@/components/EvaluationForm";
import { getActiveEvent } from "@/lib/events";
import { loginParticipant, subscribeToParticipant } from "@/lib/participants";
import { clearSession, loadSession, saveSession, type StoredSession } from "@/lib/session";
import type { Participant, TastingEvent } from "@/lib/types";

type View = "restoring" | "login" | "active";

export default function ParticipantSession() {
  const [view, setView] = useState<View>("restoring");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [event, setEvent] = useState<TastingEvent | null>(null);
  const [info, setInfo] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => unsubscribeRef.current?.();
  }, []);

  useEffect(() => {
    async function restore() {
      const stored = loadSession();
      if (!stored) {
        setView("login");
        return;
      }
      try {
        const activeEvent = await getActiveEvent();
        if (!activeEvent || activeEvent.id !== stored.eventId) {
          clearSession();
          setInfo("Edellinen tasting on päättynyt tai vaihtunut. Kirjaudu uudelleen.");
          setView("login");
          return;
        }
        setEvent(activeEvent);
        watchParticipant(stored);
      } catch {
        clearSession();
        setView("login");
      }
    }
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function watchParticipant(stored: StoredSession) {
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeToParticipant(stored.participantId, (p) => {
      if (!p) {
        unsubscribeRef.current?.();
        clearSession();
        setInfo("Osallistujatietoja ei löytynyt. Kirjaudu uudelleen.");
        setView("login");
        return;
      }
      if (p.sessionToken !== stored.sessionToken) {
        unsubscribeRef.current?.();
        clearSession();
        setInfo("Kirjauduit sisään toisella laitteella, joten tämä istunto suljettiin.");
        setView("login");
        return;
      }
      setParticipant(p);
      setView("active");
    });
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const result = await loginParticipant(name, password);
      const stored: StoredSession = {
        eventId: result.event.id,
        participantId: result.participant.id,
        participantName: result.participant.name,
        sessionToken: result.sessionToken,
      };
      saveSession(stored);
      setInfo("");
      setEvent(result.event);
      watchParticipant(stored);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Kirjautuminen epäonnistui.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    unsubscribeRef.current?.();
    clearSession();
    setParticipant(null);
    setEvent(null);
    setInfo("");
    setName("");
    setPassword("");
    setView("login");
  }

  if (view === "restoring") {
    return <p className="text-sm text-muted">Ladataan...</p>;
  }

  if (view === "login") {
    return (
      <form onSubmit={handleLogin} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-left text-sm">
          Nimi
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent"
            autoComplete="name"
          />
        </label>
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
          disabled={loggingIn || !name.trim() || password.length === 0}
          className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {loggingIn ? "Kirjaudutaan..." : "Kirjaudu"}
        </button>
        {info && <p className="text-sm text-muted">{info}</p>}
        {loginError && <p className="text-sm text-danger">{loginError}</p>}
      </form>
    );
  }

  if (!participant || !event) return null;

  const totalRounds = participant.rounds.length;
  const currentRound =
    participant.currentRoundIndex < totalRounds
      ? participant.rounds[participant.currentRoundIndex]
      : null;

  if (currentRound && currentRound.served && !currentRound.completed) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <EvaluationForm participant={participant} event={event} round={currentRound} />
        <button
          type="button"
          onClick={handleLogout}
          className="self-center text-sm text-muted underline underline-offset-4"
        >
          Kirjaudu ulos
        </button>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6 text-center">
      <div>
        <p className="text-sm text-muted">Kirjautunut nimellä</p>
        <p className="text-lg font-medium">{participant.name}</p>
      </div>

      {!currentRound && (
        <p className="text-success">
          Kaikki {totalRounds} kierrosta suoritettu. Kiitos osallistumisesta!
        </p>
      )}

      {currentRound && !currentRound.served && (
        <>
          <p className="text-xl font-semibold">
            {participant.currentRoundIndex === 0 ? "Odottaa maistiaisia" : "Odottaa seuraavaa kierrosta"}
          </p>
          <p className="text-sm text-muted">
            Kierros {currentRound.index + 1}/{totalRounds}. Odota, että järjestäjä tarjoilee
            seuraavat näytteet.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={handleLogout}
        className="text-sm text-muted underline underline-offset-4"
      >
        Kirjaudu ulos
      </button>
    </div>
  );
}
