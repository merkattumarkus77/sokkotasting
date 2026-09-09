"use client";

import { useEffect, useState } from "react";
import AdminLoginGate from "@/components/AdminLoginGate";
import ResultsView, { type AdminResultsData } from "@/components/ResultsView";
import { subscribeToActiveEvent, subscribeToEventParticipants } from "@/lib/clientRealtime";
import type { EventDoc, ParticipantDoc, TastingDoc } from "@/lib/types";

type EntryStatus = "not_started" | "waiting_service" | "tasting" | "done";

interface DashboardEntry {
  participantId: string;
  name: string;
  status: EntryStatus;
  completedRounds: number;
  totalRounds: number | null;
  nextRound?: { roundId: string; itemAName: string; itemBName: string };
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  not_started: "Odottaa maistiaisia",
  waiting_service: "Odottaa tarjoilua",
  tasting: "Maistamassa",
  done: "Valmis",
};

async function fetchTastings(): Promise<TastingDoc[]> {
  const res = await fetch("/api/tastings");
  if (!res.ok) return [];
  const data = await res.json();
  return data.tastings as TastingDoc[];
}

function OrganizerDashboardInner() {
  const [activeEvent, setActiveEvent] = useState<EventDoc | null>(null);
  const [participants, setParticipants] = useState<ParticipantDoc[]>([]);
  const [tastings, setTastings] = useState<TastingDoc[]>([]);
  const [selectedTastingId, setSelectedTastingId] = useState<string | null>(null);
  const [entries, setEntries] = useState<DashboardEntry[]>([]);
  const [actionError, setActionError] = useState("");
  const [busyParticipantId, setBusyParticipantId] = useState<string | null>(null);

  const [results, setResults] = useState<AdminResultsData | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");

  const selectedTasting = tastings.find((t) => t.id === selectedTastingId) ?? null;

  useEffect(() => subscribeToActiveEvent(setActiveEvent), []);

  useEffect(() => {
    if (!activeEvent) {
      setParticipants([]);
      return;
    }
    return subscribeToEventParticipants(activeEvent.id, setParticipants);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!activeEvent) {
      setTastings([]);
      return;
    }
    let cancelled = false;
    fetchTastings().then((list) => {
      if (cancelled) return;
      setTastings(list);
      setSelectedTastingId((current) => current ?? list[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEvent?.id]);

  useEffect(() => {
    if (!selectedTastingId) return;
    let cancelled = false;

    async function poll() {
      const res = await fetch(`/api/tastings/${selectedTastingId}/dashboard`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      setEntries(data.entries);
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedTastingId]);

  async function handleServe(participantId: string, roundId: string) {
    if (!selectedTastingId) return;
    setBusyParticipantId(participantId);
    setActionError("");
    try {
      const res = await fetch(`/api/tastings/${selectedTastingId}/serve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId, roundId }),
      });
      const data = await res.json();
      if (!res.ok) setActionError(data.error ?? "Kuittaus epäonnistui.");
    } catch {
      setActionError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setBusyParticipantId(null);
    }
  }

  async function handleServeAll() {
    if (!selectedTastingId) return;
    setActionError("");
    try {
      const res = await fetch(`/api/tastings/${selectedTastingId}/serve-all`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) setActionError(data.error ?? "Kuittaus epäonnistui.");
    } catch {
      setActionError("Yhteys palvelimeen epäonnistui.");
    }
  }

  async function handleExclusionToggle(participantId: string, excluded: boolean) {
    if (!activeEvent || !selectedTastingId) return;
    await fetch(`/api/events/${activeEvent.id}/participants/${participantId}/tastings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tastingId: selectedTastingId, excluded }),
    });
  }

  async function fetchResults() {
    if (!selectedTastingId) return;
    const res = await fetch(`/api/tastings/${selectedTastingId}/results`);
    if (!res.ok) {
      setResults(null);
      return;
    }
    const data = await res.json();
    setResults({ role: "admin", ...data });
  }

  useEffect(() => {
    setResults(null);
    setConfirmPublish(false);
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTastingId]);

  async function handlePublish() {
    if (!selectedTastingId) return;
    setPublishing(true);
    setActionError("");
    try {
      const res = await fetch(`/api/tastings/${selectedTastingId}/complete`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error ?? "Julkaisu epäonnistui.");
        return;
      }
      setConfirmPublish(false);
      setTastings(await fetchTastings());
      await fetchResults();
    } catch {
      setActionError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    if (!activeEvent) return;
    setArchiving(true);
    setArchiveError("");
    try {
      const res = await fetch(`/api/events/${activeEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setArchiveError(data.error ?? "Sulkeminen epäonnistui.");
        return;
      }
      setConfirmArchive(false);
    } catch {
      setArchiveError("Yhteys palvelimeen epäonnistui.");
    } finally {
      setArchiving(false);
    }
  }

  if (!activeEvent) {
    return <p className="text-sm text-muted">Aktiivista tapahtumaa ei löytynyt.</p>;
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-left">
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-medium">{activeEvent.name}</p>
        <p className="text-sm text-muted">
          {activeEvent.category} · {participants.length} osallistujaa
        </p>
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          {confirmArchive ? (
            <>
              <p className="text-sm text-danger">
                Osallistujat eivät voi enää kirjautua eivätkä viedä tuloksiaan. Varmista, että
                kaikki ovat tallentaneet omat tuloksensa.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={archiving}
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {archiving ? "Suljetaan..." : "Vahvista sulkeminen"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArchive(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
                >
                  Peruuta
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="self-start rounded-lg border border-danger/50 px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
            >
              Sulje tapahtuma
            </button>
          )}
          {archiveError && <p className="text-sm text-danger">{archiveError}</p>}
        </div>
      </div>

      {tastings.length === 0 && (
        <p className="text-sm text-muted">Ei vielä tastingeja tässä tapahtumassa.</p>
      )}

      {tastings.length > 1 && (
        <select
          value={selectedTastingId ?? ""}
          onChange={(e) => setSelectedTastingId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          {tastings.map((tasting) => (
            <option key={tasting.id} value={tasting.id}>
              {tasting.name}
            </option>
          ))}
        </select>
      )}

      {selectedTastingId && entries.some((e) => e.status === "waiting_service") && (
        <button
          type="button"
          onClick={handleServeAll}
          className="self-start rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-raised"
        >
          Kuittaa kaikki odottavat
        </button>
      )}

      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const participant = participants.find((p) => p.id === entry.participantId);
          const excluded =
            participant?.excludedTastingIds.includes(selectedTastingId ?? "") ?? false;

          return (
            <div key={entry.participantId} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{entry.name}</p>
                <span className="text-sm text-muted">{STATUS_LABELS[entry.status]}</span>
              </div>

              {entry.nextRound ? (
                <p className="mt-1 text-sm text-muted">
                  Kierros {entry.completedRounds + 1}
                  {entry.totalRounds != null ? `/${entry.totalRounds}` : ""} — Tarjoile A ={" "}
                  {entry.nextRound.itemAName}, B = {entry.nextRound.itemBName}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  {entry.totalRounds != null
                    ? `${entry.completedRounds}/${entry.totalRounds} kierrosta`
                    : `${entry.completedRounds} kierrosta`}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {entry.nextRound && (
                  <button
                    type="button"
                    onClick={() => handleServe(entry.participantId, entry.nextRound!.roundId)}
                    disabled={busyParticipantId === entry.participantId}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
                  >
                    {busyParticipantId === entry.participantId ? "Kuitataan..." : "Kuittaa tarjoiltu"}
                  </button>
                )}
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={excluded}
                    onChange={(e) => handleExclusionToggle(entry.participantId, e.target.checked)}
                  />
                  Ei osallistu tähän tastingiin
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {actionError && <p className="text-sm text-danger">{actionError}</p>}

      {selectedTasting && selectedTasting.status !== "pending" && (
        <div className="rounded-lg border border-border bg-surface p-4">
          {selectedTasting.status === "in_progress" && (
            <div className="mb-4 flex flex-col gap-2 border-b border-border pb-4">
              {confirmPublish ? (
                <>
                  <p className="text-sm text-danger">
                    Tulokset paljastuvat osallistujille eikä tastingia voi enää muokata.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={publishing}
                      className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
                    >
                      {publishing ? "Julkaistaan..." : "Vahvista julkaisu"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPublish(false)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
                    >
                      Peruuta
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmPublish(true)}
                  className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
                >
                  Päätä tasting ja julkaise
                </button>
              )}
            </div>
          )}

          <p className="mb-2 text-sm font-medium">
            Tulokset{selectedTasting.status === "in_progress" ? " (ennakko)" : ""}
          </p>
          {results ? (
            <ResultsView data={results} />
          ) : (
            <p className="text-sm text-muted">Ladataan tuloksia...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function OrganizerDashboard() {
  return (
    <AdminLoginGate>
      <OrganizerDashboardInner />
    </AdminLoginGate>
  );
}
