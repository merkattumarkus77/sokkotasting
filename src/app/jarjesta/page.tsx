import Link from "next/link";
import OrganizerCreateEvent from "@/components/OrganizerCreateEvent";

export default function JarjestaPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Järjestäjä</h1>
        <p className="text-muted">Aloita uusi tasting</p>
      </div>
      <OrganizerCreateEvent />
      <Link href="/jarjesta/dashboard" className="text-sm text-muted underline underline-offset-4">
        Siirry hallintapaneeliin (käynnissä oleva tasting)
      </Link>
      <Link href="/" className="text-sm text-muted underline underline-offset-4">
        Takaisin etusivulle
      </Link>
    </main>
  );
}
