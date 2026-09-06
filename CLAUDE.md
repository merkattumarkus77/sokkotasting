# CLAUDE.md — projektin pysyvät ohjeet

Nämä ohjeet ovat voimassa jokaisessa istunnossa. `docs/SPEC.md` on sitova määrittely.

## Projekti

Sokkotasting-sovellus: järjestäjä luo tapahtuman ja rinnakkaisia maisteluja, osallistujat arvioivat tuotepareja sokkona liukusäätimellä, sovellus laskee normalisoidut tulokset.

**Stack:** Next.js (App Router) · TypeScript strict · Tailwind · Firestore (Spark) · Vitest · Playwright · Vercel

## Kova reunaehto

Kaiken on toimittava **Firebase Spark -tasolla**. Ei Cloud Functionsia, ei Cloud Storagea, ei maksullisia palveluja. Jos jokin ratkaisu vaatisi Blaze-tason, se on väärä ratkaisu — kerro siitä äläkä toteuta.

## Kieli

- Käyttöliittymä, virheilmoitukset, vientitiedostot: **suomi**
- Koodi, muuttujat, kommentit, commit-viestit, testien nimet: **englanti**
- Keskustelu käyttäjän kanssa: **suomi**

## Arkkitehtuurisäännöt

1. **Kaikki Firestore-kirjoitukset kulkevat Next.js Route Handlerin ja `firebase-admin`in kautta.** Selain ei koskaan kirjoita Firestoreen. Firestore-säännöt estävät kirjoituksen kokonaan.
2. Selain lukee reaaliaikaisesti `onSnapshot`illa. Luku on sallittu `/events` ja `/categories` -poluista, `/config` ei koskaan.
3. Salaisuudet vain palvelinpuolella. Mitään `NEXT_PUBLIC_`-etuliitteetöntä muuttujaa ei saa päätyä selainbundleen. Tarkista tämä `npm run build`in jälkeen.
4. Aikaleimat palvelimelta (`FieldValue.serverTimestamp()`), ei koskaan selaimen kellosta.
5. Jokainen tilasiirtymä ja kierrosten luonti **transaktiossa**, idempotentisti. Kaksoisklikkaus ei saa rikkoa mitään.
6. Zod-validointi jokaisen Route Handlerin rungolle ja parametreille.
7. Puhtaat funktiot: paritusalgoritmit, pisteytys ja ranking ovat `lib/`-hakemistossa ilman Firebase-riippuvuuksia. Ne saavat syötteen ja palauttavat tuloksen. Näin ne ovat testattavissa ilman emulaattoria.

## Testaus

- **Ei käyttöliittymätestausta ennen viimeistä vaihetta.** Todentaminen tapahtuu Vitestillä ja emulaattoria vasten ajettavilla integraatiotesteillä.
- Algoritmit kirjoitetaan **testit ensin**. Ne ovat projektin riskikohta.
- `docs/SPEC.md` luku 15 listaa pakolliset testit. Se on vähimmäisvaatimus, ei kattava lista.
- Emulaattori: `firebase emulators:start --only firestore`. Testit ajetaan sitä vasten, ei koskaan tuotanto-Firestorea vasten.

## Komennot

```bash
npm run dev            # kehityspalvelin
npm run build          # tuotantokäännös — pitää mennä läpi ennen jokaista committia
npm run typecheck      # tsc --noEmit
npm run lint
npm run test           # Vitest
npm run test:emulator  # integraatiotestit emulaattoria vasten
npm run simulate       # täysi tasting-simulaatio ilman käyttöliittymää
npm run seed:config    # asettaa Master-tunnuksen ja tapahtumasalasanan
npm run seed:demo      # demodata emulaattoriin
npm run e2e            # Playwright, vasta viimeisessä vaiheessa
```

## Työtapa

- **Yksi vaihe kerrallaan.** Vaiheet ovat `docs/SPEC.md`-pohjaisessa suunnitelmassa. Älä aloita seuraavaa ennen kuin edellinen on valmis ja committoitu.
- Vaihe on valmis vasta kun: `typecheck` ✓, `lint` ✓, `test` ✓, `build` ✓.
- Committoi jokaisen vaiheen päätteeksi, Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`, `refactor:`).
- Päivitä `docs/PROGRESS.md` jokaisen vaiheen jälkeen: mitä tehtiin, mitä päätettiin, mikä jäi auki.
- Älä koskaan `git push`, `firebase deploy` tai `vercel deploy`. Julkaisu on käyttäjän päätös.

## Milloin pysähdyt kysymään

Pysähdy ja kysy. Väärä arvaus maksaa enemmän kuin kysymys.

- Määrittely on epäselvä tai ristiriitainen, tai kohta on merkitty `[KYSY]`
- Vaatisi Spark-tason ylittävän palvelun
- Vaatisi salaisuuden, jota ei ole `.env.example`-tiedostossa
- Vaatisi tuotanto-Firestoren muokkaamista
- Aiot poiketa `docs/SPEC.md`-määrittelystä
- Sama testi ei mene läpi kolmannellakaan korjausyrityksellä — kerro mitä yritit ja mitä havaitsit

Kysy useampi kysymys kerralla numeroituna listana, jotta käyttäjä voi vastata kaikkiin yhdellä viestillä.

## Mitä ei tehdä

- Ei ylimääräisiä ominaisuuksia. Jos sitä ei ole `docs/SPEC.md`-tiedostossa, sitä ei toteuteta.
- Ei kirjastoa, joka säästää kymmenen riviä. Riippuvuuksia lisätään vain kun ne ratkaisevat oikean ongelman.
- Ei `any`-tyyppiä. Ei `@ts-ignore`. Ei ohitettuja testejä.
- Ei placeholder-toteutuksia ilman että ne on merkitty `TODO`-kommentilla ja kirjattu `docs/PROGRESS.md`-tiedostoon.
- Ei `docs/SPEC.md`-tiedoston muokkaamista omin päin. Ehdota muutosta, älä tee sitä.