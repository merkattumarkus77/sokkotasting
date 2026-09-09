"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import EvaluationForm, { type GuessOption } from "@/components/EvaluationForm";
import { subscribeToParticipant } from "@/lib/clientRealtime";
import type { TastingDoc } from "@/lib/types";

type View = "restoring" | "login" | "active";
type SanitizedTasting = Omit<TastingDoc, "items">;

interface ParticipantSession {
  role: "participant";
  eventId: string;
  participantId: string;
  sessionId: string;
}

const PHASE_LABELS: Record<string, string> = {
  SEEDING: "alkusarja käynnissä",
  PLAYOFF: "pudotuspelit käynnissä",
  DONE: "pudotuspelit käynnissä",
};

interface MyRoundResponse {
  status: "not_started" | "waiting_service" | "serving" | "done";
  roundId?: string;
  roundIndex?: number;
  totalRounds: number | null;
  completedRounds?: number;
  phase?: string;
  hasGuessing?: boolean;
  guessOptions?: GuessOption[];
}

function TastingCard({ tasting }: { tasting: SanitizedTasting }) {
  const [myRound, setMyRound] = useState<MyRoundResponse | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    if (tasting.status !== "in_progress") return;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/tastings/${tasting.id}/my-round`);
      if (!res.ok || cancelled) return;
      setMyRound((await res.json()) as MyRoundResponse);
    }

    poll();
    const id = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tasting.id, tasting.status]);

  useEffect(() => {
    if (myRound?.status !== "not_started" || ensuring) return;
    setEnsuring(true);
    fetch(`/api/tastings/${tasting.id}/ensure-rounds`, { method: "POST" })
      .then(() => fetch(`/api/tastings/${tasting.id}/my-round`))
      .then((res) => res.json())
      .then(setMyRound)
      .finally(() => setEnsuring(false));
  }, [myRound?.status, tasting.id, ensuring]);

  function handleSubmitted() {
    fetch(`/api/tastings/${tasting.id}/my-round`)
      .then((res) => res.json())
      .then(setMyRound);
  }

  let body: ReactNode;

  if (tasting.status === "pending") {
    body = <p className="text-sm text-muted">Odottaa käynnistystä</p>;
  } else if (tasting.status === "completed") {
    body = <p className="text-sm text-success">Tulokset valmiina</p>;
  } else if (!myRound || myRound.status === "not_started") {
    body = <p className="text-sm text-muted">Ladataan...</p>;
  } else if (myRound.status === "waiting_service") {
    body = (
      <p className="text-sm text-muted">
        Odottaa tarjoilua (
        {myRound.totalRounds != null
          ? `${myRound.completedRounds}/${myRound.totalRounds}`
          : `${PHASE_LABELS[myRound.phase ?? ""] ?? "käynnissä"}`}
        )
      </p>
    );
  } else if (myRound.status === "serving") {
    body = (
      <EvaluationForm
        tastingId={tasting.id}
        roundId={myRound.roundId!}
        roundIndex={myRound.roundIndex!}
        totalRounds={myRound.totalRounds}
        logic={tasting.logic}
        phase={myRound.phase}
        hasGuessing={Boolean(tasting.hasGuessing)}
        guessOptions={myRound.guessOptions ?? []}
        onSubmitted={handleSubmitted}
      />
    );
  } else {
    body = (
      <p className="text-sm text-success">
        {myRound.totalRounds != null
          ? `Kaikki ${myRound.totalRounds} kierrosta suoritettu.`
          : "Valmis! Kaikki kierrokset suoritettu."}
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="mb-2 font-medium">{tasting.name}</p>
      {body}
    </div>
  );
}

export default function ParticipantSession() {
  const [view, setView] = useState<View>("restoring");
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [participantName, setParticipantName] = useState("");
  const [info, setInfo] = useState("");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [tastings, setTastings] = useState<SanitizedTasting[]>([]);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.session?.role === "participant") {
          setSession(data.session);
          setView("active");
        } else {
          setView("login");
        }
      })
      .catch(() => setView("login"));
  }, []);

  useEffect(() => {
    if (!session) return;
    return subscribeToParticipant(session.eventId, session.participantId, (participant) => {
      if (!participant) return;
      setParticipantName(participant.name);
      if (participant.activeSessionId !== session.sessionId) {
        setInfo("Kirjauduit sisään toisella laitteella, joten tämä istunto suljettiin.");
        setSession(null);
        setView("login");
      }
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function poll() {
      const res = await fetch("/api/tastings");
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setTastings(data.tastings);
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "participant", nickname: name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Kirjautuminen epäonnistui.");
        return;
      }
      setInfo("");
      const me = await fetch("/api/me").then((r) => r.json());
      setSession(me.session);
      setView("active");
    } catch {
      setLoginError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setSession(null);
    setName("");
    setPassword("");
    setInfo("");
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

  if (!session) return null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="text-center">
        <p className="text-sm text-muted">Kirjautunut nimellä</p>
        <p className="text-lg font-medium">{participantName}</p>
      </div>

      {tastings.length === 0 && (
        <p className="text-center text-sm text-muted">Ei vielä tastingeja tässä tapahtumassa.</p>
      )}

      <div className="flex flex-col gap-4">
        {tastings.map((tasting) => (
          <TastingCard key={tasting.id} tasting={tasting} />
        ))}
      </div>

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
