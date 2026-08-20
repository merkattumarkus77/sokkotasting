import Link from "next/link";
import OrganizerDashboard from "@/components/OrganizerDashboard";

export default function OrganizerDashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Hallintapaneeli</h1>
        <p className="text-muted">Tarjoilulista ja kuittaukset</p>
      </div>
      <OrganizerDashboard />
      <Link href="/jarjesta" className="text-sm text-muted underline underline-offset-4">
        Takaisin
      </Link>
    </main>
  );
}
