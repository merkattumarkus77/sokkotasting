# Sokkotasting

Sokkotasting-sovellus: järjestäjä luo tapahtuman ja rinnakkaisia maisteluja (Round Robin tai
Sveitsiläinen turnauskaavio), osallistujat arvioivat tuoteparit sokkona liukusäätimellä, sovellus
laskee normalisoidut tulokset ja tilastot. Sitova määrittely: [`docs/SPEC.md`](docs/SPEC.md).
Pysyvät kehitysohjeet: [`CLAUDE.md`](CLAUDE.md).

**Stack:** Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · Firestore (Spark-taso) ·
Vitest · Playwright.

## Kehitys

```bash
firebase emulators:start --only firestore   # yksi terminaali, jätä auki
npm run seed:config -- <admin-tunnus> <admin-salasana> <tapahtumasalasana>   # kertaalleen
npm run dev                                  # toinen terminaali, http://localhost:3000
```

Aseta `.env.local` (kopioi `.env.local.example`) ja `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true`
paikallista kehitystä varten — sovellus ei koskaan saa kirjoittaa tuotanto-Firestoreen
kehityksen tai testien aikana.

## Komennot

```bash
npm run dev             # kehityspalvelin
npm run build            # tuotantokäännös
npm run typecheck        # tsc --noEmit
npm run lint              # ESLint
npm run test               # Vitest, yksikkötestit
npm run test:emulator      # Vitest integraatiotestit Firestore-emulaattoria vasten
npm run simulate            # täysi tasting-simulaatio ilman käyttöliittymää (ks. SPEC 15.3)
npm run simulate:scenario   # laajennettu monitasting-skenaario (useampi rinnakkainen tasting, RR+Swiss)
npm run e2e                  # Playwright-selaintestit emulaattoria + tuotantokäännöstä vasten
npm run seed:config          # asettaa admin-tunnuksen ja tapahtumasalasanan
```

## Testaus

Testauskerrokset ja mitä kukin kattaa: ks. [`docs/TESTIRAPORTTI.md`](docs/TESTIRAPORTTI.md).
Manuaalinen hyväksymistestaus: [`docs/TESTIKASIKIRJA.md`](docs/TESTIKASIKIRJA.md).

## Muut dokumentit

- [`docs/SPEC.md`](docs/SPEC.md) — sitova määrittely.
- [`docs/PLAN.md`](docs/PLAN.md) — vaiheistettu migraatiosuunnitelma.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — mitä on tehty missäkin vaiheessa.
- [`docs/GAP.md`](docs/GAP.md) — SPEC vs. aiempi toteutus -analyysi (historiallinen).
- [`docs/CUTOVER.md`](docs/CUTOVER.md) — tuotantoon siirron ohjeet (ei suoritettu).

## Julkaisu

Tuotantoon siirto ei ole automaattista eikä tämän repon minkään skriptin ajama — ks.
[`docs/CUTOVER.md`](docs/CUTOVER.md) ja `CLAUDE.md`:n "Älä koskaan `git push`, `firebase deploy`
tai `vercel deploy`" -sääntö. Julkaisu on aina käyttäjän oma, erillinen päätös.
