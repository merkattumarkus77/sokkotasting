import Link from "next/link";
import ParticipantSession from "@/components/ParticipantSession";

export default function OsallistuPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Osallistu</h1>
        <p className="text-muted">Kirjaudu nimelläsi ja yhteisellä salasanalla.</p>
      </div>
      <ParticipantSession />
      <Link href="/" className="text-sm text-muted underline underline-offset-4">
        Takaisin etusivulle
      </Link>
    </main>
  );
}
