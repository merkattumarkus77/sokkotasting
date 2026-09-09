// SPEC 12: Markdown/plain-text export, copyable straight into WhatsApp
// without cleanup. Pure string building, no DOM/Firebase dependency —
// clipboard/file-download wiring lives in the UI layer.

export function formatPercentage(percentage: number | null): string {
  return percentage === null ? "—" : `${percentage.toFixed(1)} %`;
}

export interface ExportRankingRow {
  itemName: string;
  percentage: number | null;
}

export interface ExportGuessingRow {
  name: string;
  correctGuesses: number;
  attemptedGuesses: number;
}

export interface ExportParticipantScores {
  name: string;
  ownScores: ExportRankingRow[];
}

export interface ExportNote {
  participantName: string;
  itemNames: [string, string];
  notes: string;
}

function rankingTable(rows: readonly ExportRankingRow[]): string {
  const lines = ["| Tuote | Tulos |", "| --- | --- |"];
  for (const row of rows) {
    lines.push(`| ${row.itemName} | ${formatPercentage(row.percentage)} |`);
  }
  return lines.join("\n");
}

function guessingTable(rows: readonly ExportGuessingRow[]): string {
  const lines = ["| Osallistuja | Oikein | Arvattu | Osumatarkkuus |", "| --- | --- | --- | --- |"];
  for (const row of rows) {
    const accuracy =
      row.attemptedGuesses === 0 ? "—" : `${((row.correctGuesses / row.attemptedGuesses) * 100).toFixed(0)} %`;
    lines.push(`| ${row.name} | ${row.correctGuesses} | ${row.attemptedGuesses} | ${accuracy} |`);
  }
  return lines.join("\n");
}

export interface OrganizerExportData {
  eventName: string;
  tastingName: string;
  groupRanking: ExportRankingRow[];
  participants: ExportParticipantScores[];
  notes: ExportNote[];
  guessingRanking: ExportGuessingRow[] | null;
}

/** SPEC 12: järjestäjän vienti sisältää kaiken — oikeat nimet, ryhmäranking, osallistujakohtaiset pisteet, muistiinpanot, arvauskisa. */
export function buildOrganizerMarkdown(data: OrganizerExportData): string {
  const sections: string[] = [
    `# ${data.tastingName}`,
    `_${data.eventName}_`,
    "",
    "## Ryhmän tulokset",
    "",
    rankingTable(data.groupRanking),
  ];

  if (data.participants.length > 0) {
    sections.push("", "## Osallistujakohtaiset tulokset");
    for (const participant of data.participants) {
      sections.push("", `### ${participant.name}`, "", rankingTable(participant.ownScores));
    }
  }

  if (data.notes.length > 0) {
    sections.push("", "## Muistiinpanot", "");
    for (const note of data.notes) {
      if (!note.notes.trim()) continue;
      sections.push(
        `- **${note.participantName}** (${note.itemNames[0]} vs ${note.itemNames[1]}): ${note.notes.trim()}`
      );
    }
  }

  if (data.guessingRanking && data.guessingRanking.length > 0) {
    sections.push("", "## Arvauskisa", "", guessingTable(data.guessingRanking));
  }

  return sections.join("\n");
}

export interface ParticipantExportData {
  eventName: string;
  tastingName: string;
  participantName: string;
  includeOwnScores: boolean;
  includeOwnNotes: boolean;
  includeGroupResults: boolean;
  ownScores: ExportRankingRow[];
  ownNotes: ExportNote[];
  groupRanking: ExportRankingRow[];
}

/** SPEC 12: osallistujan vienti — valintaruudut omat pisteet / omat muistiinpanot / ryhmän tulokset. */
export function buildParticipantMarkdown(data: ParticipantExportData): string {
  const sections: string[] = [`# ${data.tastingName}`, `_${data.eventName} — ${data.participantName}_`];

  if (data.includeOwnScores) {
    sections.push("", "## Omat pisteet", "", rankingTable(data.ownScores));
  }

  if (data.includeOwnNotes && data.ownNotes.length > 0) {
    sections.push("", "## Omat muistiinpanot", "");
    for (const note of data.ownNotes) {
      if (!note.notes.trim()) continue;
      sections.push(`- ${note.itemNames[0]} vs ${note.itemNames[1]}: ${note.notes.trim()}`);
    }
  }

  if (data.includeGroupResults) {
    sections.push("", "## Ryhmän tulokset", "", rankingTable(data.groupRanking));
  }

  return sections.join("\n");
}
