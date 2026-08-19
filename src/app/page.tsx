import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">Sokkotasting</h1>
        <p className="text-muted">Sokkona maistellaan, tulokset laskee sovellus.</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/jarjesta"
          className="rounded-xl bg-accent px-6 py-4 text-lg font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Järjestä
        </Link>
        <Link
          href="/osallistu"
          className="rounded-xl border border-border bg-surface px-6 py-4 text-lg font-medium transition-colors hover:bg-surface-raised"
        >
          Osallistu
        </Link>
      </div>
    </main>
  );
}
