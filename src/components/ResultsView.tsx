"use client";

import { useState } from "react";
import { copyToClipboard, downloadMarkdownFile, slugFilename } from "@/lib/clientExport";
import {
  buildOrganizerMarkdown,
  buildParticipantMarkdown,
  formatPercentage,
  type ExportNote,
} from "@/lib/exportMarkdown";

interface RankingRow {
  itemId?: string;
  itemName: string;
  percentage: number | null;
}

interface GuessingRow {
  participantId?: string;
  name: string;
  correctGuesses: number;
  attemptedGuesses: number;
}

interface NoteRow {
  participantId: string;
  participantName?: string;
  itemAName: string;
  itemBName: string;
  notes: string;
}

export interface AdminResultsData {
  role: "admin";
  tastingName: string;
  eventName: string;
  groupRanking: RankingRow[];
  participantScores: { participantId: string; name: string; scores: RankingRow[] }[];
  notes: NoteRow[];
  guessingRanking: GuessingRow[];
  eventGuessingRanking: GuessingRow[];
}

export interface ParticipantResultsData {
  role: "participant";
  tastingName: string;
  eventName: string;
  groupRanking: RankingRow[];
  ownScores: RankingRow[];
  ownNotes: NoteRow[];
  guessingRanking: GuessingRow[];
  eventGuessingRanking: GuessingRow[];
  guessingEndMessage: string | null;
  ownParticipantId: string;
}

function RankingTable({ rows }: { rows: RankingRow[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.itemId ?? i} className="border-b border-border last:border-0">
            <td className="py-1 pr-2">{row.itemName}</td>
            <td className="py-1 text-right text-muted">{formatPercentage(row.percentage)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GuessingTable({ rows, ownId }: { rows: GuessingRow[]; ownId?: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted">
          <th className="pb-1 font-normal">Osallistuja</th>
          <th className="pb-1 text-right font-normal">Oikein</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={row.participantId ?? i}
            className={`border-b border-border last:border-0 ${row.participantId === ownId ? "font-semibold text-accent" : ""}`}
          >
            <td className="py-1 pr-2">{row.name}</td>
            <td className="py-1 text-right">
              {row.correctGuesses}/{row.attemptedGuesses}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ResultsView({ data }: { data: AdminResultsData | ParticipantResultsData }) {
  const [copyStatus, setCopyStatus] = useState("");
  const [includeOwnScores, setIncludeOwnScores] = useState(true);
  const [includeOwnNotes, setIncludeOwnNotes] = useState(true);
  const [includeGroupResults, setIncludeGroupResults] = useState(true);

  function buildMarkdown(): string {
    if (data.role === "admin") {
      return buildOrganizerMarkdown({
        eventName: data.eventName,
        tastingName: data.tastingName,
        groupRanking: data.groupRanking,
        participants: data.participantScores.map((p) => ({ name: p.name, ownScores: p.scores })),
        notes: data.notes.map(
          (n): ExportNote => ({
            participantName: n.participantName ?? "?",
            itemNames: [n.itemAName, n.itemBName],
            notes: n.notes,
          })
        ),
        guessingRanking: data.guessingRanking.length > 0 ? data.guessingRanking : null,
      });
    }
    return buildParticipantMarkdown({
      eventName: data.eventName,
      tastingName: data.tastingName,
      participantName: "Minä",
      includeOwnScores,
      includeOwnNotes,
      includeGroupResults,
      ownScores: data.ownScores,
      ownNotes: data.ownNotes.map(
        (n): ExportNote => ({
          participantName: "",
          itemNames: [n.itemAName, n.itemBName],
          notes: n.notes,
        })
      ),
      groupRanking: data.groupRanking,
    });
  }

  async function handleCopy() {
    const ok = await copyToClipboard(buildMarkdown());
    setCopyStatus(ok ? "Kopioitu leikepöydälle." : "Kopiointi epäonnistui.");
  }

  function handleDownload() {
    downloadMarkdownFile(`${slugFilename(data.tastingName)}.md`, buildMarkdown());
  }

  return (
    <div className="flex flex-col gap-5 text-left">
      <div>
        <p className="mb-1 text-sm font-medium">Ryhmän tulokset</p>
        <RankingTable rows={data.groupRanking} />
      </div>

      {data.role === "admin" && (
        <>
          {data.participantScores.map((participant) => (
            <div key={participant.participantId}>
              <p className="mb-1 text-sm font-medium">{participant.name}</p>
              <RankingTable rows={participant.scores} />
            </div>
          ))}
          {data.notes.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Muistiinpanot</p>
              <ul className="flex flex-col gap-1 text-sm text-muted">
                {data.notes
                  .filter((n) => n.notes.trim())
                  .map((n, i) => (
                    <li key={i}>
                      <strong className="text-foreground">{n.participantName}</strong> (
                      {n.itemAName} vs {n.itemBName}): {n.notes}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}

      {data.role === "participant" && (
        <>
          <div>
            <p className="mb-1 text-sm font-medium">Omat pisteet</p>
            <RankingTable rows={data.ownScores} />
          </div>
          {data.ownNotes.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-medium">Omat muistiinpanot</p>
              <ul className="flex flex-col gap-1 text-sm text-muted">
                {data.ownNotes
                  .filter((n) => n.notes.trim())
                  .map((n, i) => (
                    <li key={i}>
                      {n.itemAName} vs {n.itemBName}: {n.notes}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </>
      )}

      {data.guessingRanking.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Arvauskisa</p>
          <GuessingTable
            rows={data.guessingRanking}
            ownId={data.role === "participant" ? data.ownParticipantId : undefined}
          />
          {data.role === "participant" && data.guessingEndMessage && (
            <p className="mt-2 text-sm text-success">{data.guessingEndMessage}</p>
          )}
        </div>
      )}

      {data.eventGuessingRanking.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Arvauskisa — koko tapahtuma</p>
          <GuessingTable
            rows={data.eventGuessingRanking}
            ownId={data.role === "participant" ? data.ownParticipantId : undefined}
          />
        </div>
      )}

      {data.role === "participant" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3 text-sm">
          <p className="font-medium">Vientiin sisällytettävät osiot</p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeOwnScores}
              onChange={(e) => setIncludeOwnScores(e.target.checked)}
            />
            Omat pisteet
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeOwnNotes}
              onChange={(e) => setIncludeOwnNotes(e.target.checked)}
            />
            Omat muistiinpanot
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeGroupResults}
              onChange={(e) => setIncludeGroupResults(e.target.checked)}
            />
            Ryhmän tulokset
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
        >
          Kopioi leikepöydälle
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
        >
          Lataa .md-tiedostona
        </button>
        {copyStatus && <span className="self-center text-sm text-muted">{copyStatus}</span>}
      </div>
    </div>
  );
}
