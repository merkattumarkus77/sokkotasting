# PROGRESS.md — v2-migraation eteneminen

> Tämä tiedosto seuraa v2-migraation (ks. `docs/PLAN.md`) etenemistä vaihe kerrallaan.
> Repon juuressa oleva `TILANNE.md` kuvaa vanhan (pre-v2) toteutuksen historian eikä päivity enää —
> ks. sen sijaan `docs/GAP.md` nykytilan ja SPECin erosta.

## Vaihe A — Turvaverkko ✅

**Tehty:**

- Vitest asennettu ja `npm run test` ajaa sen (`vitest run`). `@types/node` nostettu `^20` →
  `^24` Vitest 5:n peer-dependency-vaatimuksen vuoksi (Node itsessään on jo v24.16.0 tällä koneella,
  joten tämä on vain tyyppimäärittelyjen linjausta ajonaikaiseen versioon, ei toiminnallinen muutos).
- `lib/prng.ts`: deterministinen mulberry32-PRNG (`createRng(seed)`), tarvitaan koska
  `lib/roundRobin.ts` käytti aiemmin suoraan `Math.random()`:ia eikä siksi ollut testattavissa
  eikä toistettavissa tallennetusta siemenestä (SPEC 6.1 vaatii: sama siemen → sama järjestys).
- `lib/roundRobin.ts`: `generateParticipantRounds`/`generateRoundsForParticipants` ottavat nyt
  pakollisen `seed`-parametrin. Algoritmi itsessään (kaikki parit, siemenkohtainen sekoitus,
  validointi + max 50 uusintayritystä) säilytetty muuttumattomana. `lib/events.ts` päivitetty
  kutsumaan uutta signatuuria (`() => crypto.randomUUID()` per osallistuja — säilyttää saman
  efektiivisen satunnaisuuden kuin ennen, koska siemen on silti tuore joka kutsulla).
  **Ei vielä** lisätty SPEC 6.1:n `3 ≤ N ≤ 12` -rajan pakotusta itse algoritmiin — se kuuluu
  tastingin luonnin validointikerrokseen (Vaihe C/D:n Zod-skeema + lomake), ei puhtaaseen
  parinmuodostusfunktioon. Kirjattu `docs/GAP.md`:hen.
- `src/lib/roundRobin.test.ts` + `src/lib/prng.test.ts`: SPEC 15.1:n Round Robin -testit
  (N=3…12 parimäärä ja pariykseys, ei itemA===itemB, sama/eri siemen → sama/eri järjestys) sekä
  `validateRounds`-negatiivitestit (puuttuva pari, tuplapari, itsepari). 40 testiä, kaikki vihreitä.
- `firebase.json`, `firestore.rules`, `firestore.indexes.json` (tyhjä) lisätty. Säännöt vastaavat
  SPEC 2.2:n taulukkoa (`/config` täysin estetty, `/events` ja `/categories` luku sallittu kirjoitus
  estetty, kaikki muu estetty) — **ei otettu käyttöön tuotannossa**, vain emulaattoria varten.
  Emulaattori käynnistyy onnistuneesti (`firebase-tools` asennettu devDependencyksi, testattu
  manuaalisesti `firebase emulators:start --only firestore`).
- `lib/firebaseAdmin.ts`: uusi, palvelinpuolen Firestore-yhteys admin SDK:lla. Tunnistaa
  `FIRESTORE_EMULATOR_HOST`-ympäristömuuttujan (emulaattori) ja käyttää muuten
  `serviceAccountKey.json`-tiedostoa (tuotanto). Ei vielä käytössä missään — perusta Vaihe C:n
  Route Handlereille.
- `lib/firebase.ts`: `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true` kytkee selaimen Firestore-SDK:n
  paikalliseen emulaattoriin (`connectFirestoreEmulator`). Dokumentoitu `.env.local.example`:ssa.
  Oletusarvo (muuttuja puuttuu/false) säilyttää nykyisen käytöksen tuotanto-Firestorea vasten,
  eli olemassa oleva `.env.local`-kehitysympäristö ei rikkoudu.
- Puuttuvat `package.json`-skriptit lisätty CLAUDE.md:n listan mukaisiksi: `typecheck` (toimiva),
  `test:emulator`/`simulate`/`seed:demo`/`e2e` (TODO-stubit, palauttavat virhekoodin kunnes
  vastaava vaihe C/D/E/H toteuttaa sisällön), `seed:config` (alias nykyiselle
  `set-password`-skriptille — bcrypt+kaksi tunnusta -laajennus tulee Vaiheessa C).
- `docs/SPEC.md` (uudelleennimetty `docs/02-SPEC.md`:stä käyttäjän vahvistuksella), `docs/GAP.md`,
  `docs/PLAN.md` kirjoitettu ennen Vaihe A:n aloitusta.

**Ei tehty / jätetty auki:**

- `3 ≤ N ≤ 12` -rajan pakotus Round Robinille — Vaihe D (lomake) / Vaihe C (Zod).
- `npm run test:emulator`, `npm run simulate`, `npm run seed:demo`, `npm run e2e` ovat TODO-stubeja,
  eivät vielä toteuta mitään.
- `SESSION_SECRET`-ympäristömuuttuja Vaihe C:n istuntoevästettä varten puuttuu vielä
  `.env.local.example`:sta — CLAUDE.md:n pysähdy-ehto, käsitellään Vaihe C:n alussa.
- SPEC 2.2:n lukutaulukon tulkinta `/tastings`- ja `/rounds`-poluille (reaaliaikaisuus vs.
  taulukon kirjaimellinen "vain /events ja /categories") — avoin, käsitellään Vaihe C:ssä.

**Tarkistettu:** `npm run typecheck` ✓, `npm run lint` ✓ (0 varoitusta/virhettä), `npm run test` ✓
(40/40), `npm run build` ✓. Selaimen tuotantobundlesta (`.next/static/chunks/*.js`) tarkistettu
grepillä ettei `firebase-admin`, `serviceAccountKey` tai `FIREBASE_SERVICE_ACCOUNT_PATH` esiinny —
ei löytynyt.

## Vaihe B + C + D — Tietomalli, palvelinkerros ja rinnakkaiset tastingit ✅

**Päätös ennen aloitusta (käyttäjä, 2026-09-06):** Vaiheet B, C ja D ajettiin yhtenä
committisarjana ilman erillistä build-vihreä-tarkistusta niiden välissä, koska tietomallin
vaihto rikkoo UI:n väistämättä ennen kuin se on johdotettu uudelleen. Täysi
`typecheck`/`lint`/`test`/`build`-vihreys vaadittiin ja saavutettiin vasta kokonaisuuden lopussa.

**Tehty — tietomalli ja palvelinkerros:**

- `lib/types.ts` kirjoitettu kokonaan uusiksi SPEC 3:n mukaan: `events/{id}/participants`,
  `events/{id}/tastings/{tid}` (+ `TastingItem{id,name,code}`), `tastings/{tid}/participantState`,
  `tastings/{tid}/rounds`, `CategoryDoc`. Vanhat `TastingEvent`/`Round`(taulukkoalkio)/`Score`-tyypit
  poistettu kokonaan.
- `lib/roundRobin.ts`: siirretty indeksipohjaisesta id-pohjaiseksi (`ItemPair{itemAId,itemBId}`),
  ydinalgoritmi (kaikki parit, siemenkohtainen sekoitus, validointi + 50 uusintayritystä)
  muuttumaton. Testit päivitetty vastaavasti (44 testiä, kaikki vihreitä).
- Uudet palvelinpuolen (`import "server-only"`) moduulit, kaikki `firebase-admin`-pohjaisia:
  `lib/config.ts` (bcrypt-vertailu admin/event-salasanoille), `lib/events.ts` (yksi aktiivinen
  tapahtuma kerrallaan, transaktiollinen `createEvent`/override-arkistointi), `lib/tastings.ts`
  (max 5 tastingia/tapahtuma, `TastingItem`-koodien generointi), `lib/participants.ts`
  (SPEC 4.2 -kirjautuminen: hae `nameKey`:llä, luo jos ei löydy, uusi `activeSessionId` joka
  kerta), `lib/rounds.ts` (`ensureRounds`/`markRoundServed`/`markAllPendingServed`/`submitRound`/
  `getGuessCounts`, kaikki transaktioissa, deterministinen `roundId = participantId_roundIndex`).
- `lib/sessionCookie.ts` + `lib/apiAuth.ts`: `jose`-allekirjoitettu HttpOnly-eväste
  (`SESSION_SECRET`, lisätty `.env.local.example`:iin käyttäjän hyväksynnällä), 24 h TTL,
  `role: 'admin' | 'participant'`. Admin-sessiolla ei ole `eventId`:tä (SPEC 4.1: pääsee sisään
  aina, myös ilman aktiivista tapahtumaa) — admin-reitit hakevat aktiivisen tapahtuman aina
  tuoreena `getActiveEvent()`:lla.
- `lib/apiSchemas.ts` (Zod) + `lib/apiResponse.ts` (virheluokkien kartoitus HTTP-vastauksiksi) +
  `lib/limits.ts` (jaetut vakiot: max 5 tastingia, max 20 osallistujaa, muistiinpano 500 merkkiä,
  `seedingRounds` 2–4, RR-tuotemäärä 3–12 — ei `server-only`-riippuvuutta, jotta myös
  asiakaskomponentit voivat importata samat rajat).
- Route Handlerit `src/app/api/**`: `auth/login`, `auth/logout`, `me`, `events`,
  `events/[eventId]/participants/[participantId]/tastings` (opt-out), `tastings` (GET/POST — GET
  palauttaa osallistujalle `items`-kentän ilman nimiä/koodeja, ks. alla), `tastings/[id]/start`,
  `tastings/[id]/serve`, `tastings/[id]/serve-all` (ei SPEC 2.4:n listalla mutta SPEC 5.2 vaatii
  sen selvästi), `tastings/[id]/ensure-rounds`, `tastings/[id]/rounds/[roundId]/submit`,
  `tastings/[id]/dashboard` (admin, oikeat nimet), `tastings/[id]/my-round` (osallistuja, ei
  koskaan nimiä/koodeja paitsi arvausvaihtoehtoina).

**Tietoturvalöydös kesken toteutuksen — luottamusrajan korjaus:**

Alkuperäinen päätös laajentaa selainluku koko `events/{id}/**`-alipuuhun (dashboardin/ajastimen
reaaliaikaisuutta varten) osoittautui vääräksi tarkemmalla analyysillä: `tastings`-dokumentti
sisältää `items[].name`:n (oikeat tuotenimet), ja koska Firestore-säännöt eivät voi erottaa
järjestäjän selainta osallistujan selaimesta (ei Firebase Authia, vain oma eväste jota säännöt
eivät näe), kuka tahansa devtoolsilla olisi voinut lukea tuotenimet suoraan. Sama ongelma koski
`rounds`-alikokoelmaa (`itemAId`/`itemBId` yhdistettynä `items`-listaan paljastaisi parituksen) ja
`participantState`-alikokoelmaa (`tastedPoints` on itemId-avaimin — se on tulos itsessään ennen
julkaisua). **Korjaus:** `firestore.rules` estää nyt koko `events/{id}/tastings/**`-polun
selainlukemisen kokonaan; vain `events/{id}` ja `events/{id}/participants/**` ovat edelleen
`onSnapshot`-luettavissa. Tasting/kierrostiedot kulkevat roolitietoisten Route Handlereiden kautta
(`GET /api/tastings`, `/dashboard`, `/my-round`), jotka joko pollaavat (asiakas, muutaman sekunnin
välein) tai haetaan uudelleen toiminnon jälkeen. Tämä on SPEC 2.2:n taulukon kirjaimellisesta
tulkinnasta poikkeamista laajempaan suuntaan lopulta kapeampi kuin ensimmäinen päätös — päädyttiin
siihen, että vain `/events` ja `/categories` (+ turvallinen `/participants`) ovat oikeasti
reaaliaikaisia, loput pollaavat.

**Tehty — käyttöliittymä:**

- `AdminLoginGate.tsx` (uusi): tarkistaa `GET /api/me`, näyttää tunnus+salasana-lomakkeen jos ei
  admin-sessiota, muuten renderöi lapset. Käytössä sekä `OrganizerCreateEvent`:ssa että
  `OrganizerDashboard`:ssa.
- `OrganizerCreateEvent.tsx`: kaksivaiheinen (tapahtuma → tastingit sen alla, enintään 5),
  override-vahvistus jos aktiivinen tapahtuma on jo olemassa, "Suunnittelutyökalu" (paria per
  osallistuja) säilytetty. Vain `ROUND_ROBIN` valittavissa (Swiss tulee Vaihe E:ssä).
- `OrganizerDashboard.tsx`: reaaliaikainen osallistujalista (`onSnapshot` events/participants),
  tastingin valinta (jos useampi), tarjoilulistan pollaus `GET .../dashboard`:sta (oikeat nimet),
  "Kuittaa tarjoiltu" + "Kuittaa kaikki odottavat", per-osallistuja poissulkemisvalinta per tasting.
- `ParticipantSession.tsx`: kirjautuminen `POST /api/auth/login`, istunto luetaan `GET /api/me`:stä
  (ei enää `localStorage`a — vanha `lib/session.ts` poistettu). Kortti per rinnakkainen tasting
  (`TastingCard`, sisäinen komponentti), jokainen pollaa omaa `GET .../my-round`:aan, kutsuu
  `ensure-rounds`:ia automaattisesti kun tila on `not_started`.
- `EvaluationForm.tsx`: liukusäädin ja arvausvalikot säilytetty, mutta toimii nyt `roundId`+POST
  `submit`-mallilla eikä koskaan näe `itemAId`/`itemBId`:tä — vain `guessOptions` (id+nimi+
  `guessedCount`, SPEC 8:n arvaushistorialaskuri säilytetty palvelinpuolella laskettuna).
- `clientRealtime.ts` (uusi): ainoat sallitut suorat selainluvut (`events`, `events/{id}/participants`).

**Vahvistettu emulaattoria vasten (manuaalisesti + automaattitestein):**

- Koko polku curl:lla: admin-kirjautuminen (oikea/väärä salasana), tapahtuman luonti, override
  kun aktiivinen tapahtuma on jo olemassa (vanha arkistoituu oikein), tastingin luonti (oikeat
  `T1`/`T2`/`T3`-koodit), max 5 tastingia -raja, tastingin käynnistys, osallistujan kirjautuminen,
  `ensure-rounds`, `my-round` (ei nimiä ennen tarjoilua), `serve`, `submit` (pisteet + arvaus +
  `guessedCount`-kasvatus), tuplasubmit → 409, seuraava kierros oikein.
- `firestore.rules` vahvistettu suoraan emulaattorin REST-rajapinnalla: `events`/`participants`
  luettavissa ilman autentikointia, `tastings`/`rounds`/`config` estetty, kirjoitus estetty
  kaikkialta.
- Automaattiset integraatiotestit lisätty (`src/lib/*.integration.test.ts`, ajetaan
  `npm run test:emulator`:lla joka käärii `firebase emulators:exec`:iin): `ensureRounds`
  idempotenssi, tuplasubmit → `RoundMismatchError`, tuplakirjautuminen samalla nimellä →
  uusi `sessionId` samaan osallistujadokumenttiin.

**Vakava läheltä piti -tilanne ja korjaus:** Vitestin oletuskonfiguraatio (`src/**/*.test.ts`)
täsmäsi vahingossa myös uusiin `*.integration.test.ts`-tiedostoihin. Kun näitä ajettiin suoraan
(`npm run test` ja kertaalleen `npx vitest run`) ilman `firebase emulators:exec`-kääretuä eli
ilman `FIRESTORE_EMULATOR_HOST`-muuttujaa, `lib/firebaseAdmin.ts` palasi **oikeaan
tuotanto-Firestoreen** (koneella on `serviceAccountKey.json`). Tämä loi 28 haamudokumenttia
(tastingeja/kierroksia/osallistujia satunnaisilla UUID-poluilla, joilla ei ollut ylätason
`events/{id}`-dokumenttia — eivät siis näkyneet normaalissa tapahtumalistauksessa eivätkä
koskeneet oikeaa "Testi"-tapahtumaa). Havaittu, kun testitiedostojen määrä näytti väärältä;
vahvistettu `collectionGroup`-hauilla käyttäjän luvalla, siivottu täysin (28/28 dokumenttia
poistettu, jäljelle jäi vain alkuperäinen "Testi"-tapahtuma ja sen kaksi osallistujaa
koskemattomana). **Korjaus:** `vitest.config.mts` sulkee nyt eksplisiittisesti pois
`src/**/*.integration.test.ts`, joten `npm run test` ei voi enää koskaan ajaa niitä — vain
`npm run test:emulator` voi. Tallennettu muistiin (`feedback_emulator_test_isolation`) tulevia
istuntoja varten.

**Ei tehty / jätetty auki (seuraaville vaiheille):**

- `SWISS_TOURNAMENT`-logiikka (Vaihe E) — `lib/rounds.ts`:n `ensureRounds` heittää
  `SwissNotImplementedError`:in, ja `CreateTastingSchema` hyväksyy toistaiseksi vain
  `logic: 'ROUND_ROBIN'`.
- Ajastin (Vaihe F): `timeLimitMinutes` tallennetaan tietomalliin mutta luontilomake ei vielä
  näytä kenttää, eikä UI:ssa ole ajastinta.
- Tulokset, arvauskisan ranking/loppuviestit, Markdown-vienti, all-time-tilastot, tapahtuman
  arkistointi + vahvistusmodaali (Vaihe G).
- `npm run simulate` ja `npm run seed:demo` ovat yhä TODO-stubeja.
- Playwright-savutesti (Vaihe H).
- `scripts/set-password.mjs` laajennettu SPEC 3:n mukaiseksi (`adminUsername`+kaksi bcrypt-
  tiivistettä), mutta ei vielä ajettu tuotanto-Firestorea vasten — käyttäjä päättää milloin
  tuotannon tunnukset vaihdetaan uuteen malliin (liittyy `docs/CUTOVER.md`:hen, Vaihe H).

**Tarkistettu:** `npm run typecheck` ✓, `npm run lint` ✓ (0 varoitusta/virhettä), `npm run test` ✓
(44/44, integraatiotestit pois suljettu), `npm run test:emulator` ✓ (4/4), `npm run build` ✓.
Tuotantobundlesta vahvistettu grepillä ettei `SESSION_SECRET`, `serviceAccountKey`,
`firebase-admin`, `adminPasswordHash` tai `eventPasswordHash` esiinny.

## Vaihe E — Sveitsiläinen turnauskaavio ✅

**Tehty — algoritmi (testit ensin, kuten CLAUDE.md ja SPEC 15.1 vaativat):**

- `lib/swiss.ts` (puhdas funktio, ei Firebase-riippuvuutta): SPEC 6.2 Vaihe A kokonaisuudessaan.
  `pairFirstSeedingRound` (kierros 1: sekoita, vierekkäiset parit, pariton → vapaa),
  `pairSecondSeedingRound` (kaksi koria cumulativePointsin mukaan, taittoparitus koreittain,
  vapaan saanut voittajakoriin), `pairSubsequentSeedingRound` (kierrokset 3+: ryhmittely
  identtisen pistesaldon mukaan, taittoparitus ryhmän sisällä), yhteinen `pairGroups`-moottori
  jota molemmat käyttävät (leftover kannetaan seuraavaan, lähimpään pistesaldoryhmään, kuten
  SPEC edellyttää). `foldMatchAvoidingMet`: ahne pariutus joka ei koskaan toista `metPairs`-parin,
  jättää loput ratkaisematta jos sidosryhmä on käyty läpi (rule 4) — ei kaadu, ei jää jumiin.
  `resolveSeedOrder`: katkaisusäännön tie-break-ketju (keskinäinen kohtaaminen → tastedPoints →
  `rngSeed`-deterministinen arvonta), aina täysi permutaatio. `computeNextSeedingStep`: dispatcher
  joka valitsee kierroksen 1/2/3+ ja signaloi `needsCutoff`:in kun `maxSeedingRounds` ylittyy —
  **kriittinen testi**: identtisillä arvioilla simuloitu koko alkusarja N=8/9/16:lla päättyy
  aina äärellisessä ajassa (SPEC 15.1:n "tämä testi paljastaa ikuisen silmukan" -vaatimus).
- `lib/swissBracket.ts`: SPEC 6.2 Vaiheet B ja C. `seedPositions` (rekursiivinen
  tennissiemennys, todennettu SPEC:n omaa esimerkkiä vasten `[1,4,2,3]` ja `[1,8,4,5,2,7,3,6]`),
  `buildBracket` (kaaviokoko `2^ceil(log2(N))`, `B-N` vapaataipaletta parhaille sijoituksille,
  vain kierros 1 voi olla `isBye` — myöhemmät kierrokset odottavat aina oikeaa tulosta vaikka
  molemmat paikat täyttyisivät jo vapaista), `advanceBracket` (puhdas, palauttaa uuden kaavion;
  pronssiottelun paikat täyttyvät automaattisesti välierien häviäjistä), `computeFinalRanking`
  (sijat 1-2 finaalista, 3-4 pronssista tai välierähäviäjien cumulativePointsista, loput
  pudonneen kierroksen mukaan ryhmiteltynä). **Kriittinen testi**: sijoitukset 1 ja 2 eivät
  kohtaa ennen finaalia, todennettu simuloimalla koko kaavio kaikilla `N = 8…64`.
  141 Vitest-testiä yhteensä (`swiss.test.ts` + `swissBracket.test.ts`), kaikki vihreitä.

**Tehty — orkestrointi (`lib/rounds.ts`):**

- `ensureRounds` SWISS_TOURNAMENTille: luo vain alkusarjan kierroksen 1 (SPEC 5.1), soveltaa
  vapaan 25 pisteen hyvityksen heti jos N on pariton.
- `submitRound` ajaa koko tilakoneen yhdessä transaktiossa jokaisen lähetyksen yhteydessä
  (SPEC 5.1: "jokainen submit laukaisee seuraavan parituksen laskennan"): alkusarjan
  eteneminen → katkaisu ja `seedOrder`/kaavion rakennus → pudotuspelien eteneminen →
  `computeFinalRanking` ja `phase: 'DONE'` kun sekä finaali (ja pronssi, jos käytössä) on
  ratkaistu. Tasapeli (`scoreA === 25`) hylätään SWISS-tastingeissa palvelimella
  (`SwissTieForbiddenError`, HTTP 400) — SPEC 6.2:n "liukusäädin ei pysähdy 25:een" -vaatimus
  toteutuu palvelinpuolella (asiakas nudge’aa liukusäätimen pois 25:stä, mutta palvelin on
  se joka oikeasti estää sen, kuten SPEC vaatii).
- **Kaksi vakavaa bugia löytyi ja korjattiin simulointitestauksessa** (ks. alla) — molemmat
  olisivat aiheuttaneet jumiutumisen tuotannossa ilman `npm run simulate`-vaihetta:
  1. Kaavion eteneminen (`advanceBracket`) oli virheellisesti ehdollistettu sille, että
     seuraavaa kierrosta ei ollut vielä valmiiksi luotu — tämä tarkoitti, että jos
     osallistujalla oli jo useampi valmiiksi luotu ottelu jonossa (esim. kaikki neljä QF-ottelua
     kerralla), vain VIIMEISEN ottelun tulos päivittyi kaavioon; aiemmat päätökset katosivat.
     Korjaus: kaavion päivitys on nyt aina ehdoton jokaiselle pudotuspeli-lähetykselle; vain
     "luodaanko uusia otteluita" -päätös on ehdollinen.
  2. `matchId`-pohjainen "onko tämä ottelu jo luotu" -tarkistus ei suodattanut
     `participantId`:llä — koska jokaisella osallistujalla on SPEC 6.2:n mukaan oma
     itsenäinen kaavionsa mutta samat `matchId`-arvot (esim. "QF-1") toistuvat jokaisen
     osallistujan kaaviossa, kysely löysi TOISEN osallistujan jo luodun QF-1-ottelun ja
     jätti tämän osallistujan oman QF-1:n luomatta kokonaan. Korjaus: kysely suodattaa nyt
     sekä `participantId`:llä että `matchId`:llä.
  Molemmat löytyivät `npm run simulate`-ajoista (ensimmäinen N=8:lla, jossa yksi osallistuja
  jumiutui; toinen N=15:llä 8 osallistujalla, jossa kaikki paitsi ensimmäinen jumiutuivat) —
  ei kertaakaan pelkillä Vitest-yksikkötesteillä, koska ne testaavat `lib/swiss.ts`/
  `lib/swissBracket.ts`:n puhdasta logiikkaa erikseen, ei `lib/rounds.ts`:n Firestore-
  orkestrointia usealla osallistujalla. Tämä vahvistaa SPEC 15.3:n perustelun simulaatiolle.
- `my-round`- ja `dashboard`-reitit korjattu: `totalRounds` on `null` SWISS-tastingeille
  (SPEC 6.2: kierrosmäärä ei ole tiedossa etukäteen), "valmis"-tarkistus lukee
  `participantState.phase === 'DONE'` eikä RR:n `currentRoundIndex >= totalRounds`-kaavaa.
  `finalRanking`-kenttää EI palauteta `my-round`-vastauksessa vaikka osallistujan oma kaavio
  olisi valmis — SPEC 11.3 sanoo tulokset paljastetaan vasta kun koko tastingin `status` on
  `'completed'` (Vaihe G), ei heti kun yksittäisen osallistujan kaavio ratkeaa.

**Tehty — käyttöliittymä ja apuscriptit:**

- `OrganizerCreateEvent.tsx`: logiikkavalinta (Round Robin / Sveitsiläinen turnaus),
  tuotemäärän rajat vaihtuvat valinnan mukaan (8–64 Swissille), `seedingRounds`-kenttä (2–4,
  SPEC-päätös), pronssiottelu-valinta, N=64-varoitus punaisella (SPEC 6.2:n
  kokorajoitusvaroitus). Yhteenveto näyttää Swissille tarkan pudotuspeliottelumäärän
  (`N-1`, `+1` pronssilla) ja kaaviokoon, mutta EI keksi tarkkaa lukua alkusarjalle —
  se vaihtelee arvioiden mukaan eikä sille ole luotettavaa etukäteisarviota.
- `EvaluationForm.tsx`: liukusäädin ei koskaan lepää 25:ssä Swiss-tastingissa (nudge 26:een),
  otsikko näyttää joko `Kierros X/Y` (RR) tai `Kierros X (alkusarja/pudotuspelit)` (Swiss).
- `scripts/simulate.ts` (SPEC 15.3): ajaa täyden tastingin emulaattoria vasten satunnaisilla
  arvioilla, tulostaa per-osallistuja-yhteenvedon, palauttaa poikkeavan exit-koodin jos jokin
  jumiutuu (300 kierroksen turvakatto). Vaatii `FIRESTORE_EMULATOR_HOST`:in — kieltäytyy
  ajamasta ilman sitä, ei koskaan tuotanto-Firestorea vasten. Ajetaan `npm run simulate --
  --logic=... --items=N --participants=M`:llä. **Ajettu onnistuneesti jokaisella N = 8…20**
  (SPEC 15.3:n nimenomainen vaatimus ennen kuin turnauslogiikka saa ilmoittaa itsensä
  valmiiksi), lisäksi SPEC:n oma esimerkki `--items=15 --participants=8`.
  - Tekninen sivuhuomio: `tsconfig.scripts.json` (uusi) aliasoi `server-only`-paketin
    no-op-tynkään `tsx`:lle samasta syystä kuin Vitestille (ks. Vaihe A/B+C+D) — paketti
    kaatuu aina Next.js-buildin ulkopuolella. Ei vaikuta itse `next build`-turvaverkkoon.

**Tietoturva:** `firestore.rules` (Vaihe B+C+D:stä) esti jo koko `tastings/**`-polun
selainluvun — tämä suojasi automaattisesti myös uudet `bracket`/`seedOrder`/`finalRanking`-
kentät `participantState`-dokumentissa ilman lisätoimia, koska koko dokumentti oli jo
piilossa.

**Ei tehty / jätetty auki (seuraaville vaiheille):**

- Esilaskuri (SPEC 10) on toteutettu vain osana tastingin luontilomaketta (tarkka
  pudotuspeliottelumäärä + kaaviokoko), ei itsenäisenä näkymänä joka olisi käytettävissä
  ennen tapahtuman luontia. Alkusarjan min/tyypillinen/max-esiintymäarviot (SPEC 10:n taulukko)
  eivät ole toteutettu — niiden luotettava laskenta vaatisi joko simulaatiopohjaisen arvion tai
  huolellisen kombinatorisen analyysin, eikä kumpaakaan ollut perusteltua rakentaa tässä
  vaiheessa ydinalgoritmin rinnalla. Merkitty avoimeksi, ei TODO-koodikommenttina koodissa
  (koska mitään keskeneräistä toteutusta ei ole, vain puuttuva ominaisuus).
- Ajastin (Vaihe F): `timeLimitMinutes` ei vieläkään näy luontilomakkeella.
- Tulokset, arvauskisan ranking/loppuviestit, Markdown-vienti, all-time-tilastot, tapahtuman
  arkistointi (Vaihe G) — sisältäen sen, missä `finalRanking` oikeasti paljastetaan
  osallistujalle.
- `npm run seed:demo` on yhä TODO-stub.
- Playwright-savutesti (Vaihe H).

**Tarkistettu:** `npm run typecheck` ✓, `npm run lint` ✓, `npm run test` ✓ (141/141),
`npm run test:emulator` ✓ (4/4), `npm run build` ✓. `npm run simulate` ajettu onnistuneesti
`SWISS_TOURNAMENT`:lla jokaisella `N = 8…20` sekä SPEC:n omalla esimerkillä (N=15,
osallistujia=8). Koko HTTP-API todennettu curlilla emulaattoria vasten: Swiss-tastingin luonti,
käynnistys, `ensure-rounds`, tasapelin hylkäys (400), kelvollinen lähetys, järjestäjän
dashboard oikeilla nimillä ja `totalRounds: null`. Round Robin -polku todennettu regressiona
samalla ajolla (tasapeli 25–25 edelleen sallittu, eteneminen toimii). Tuotantobundlesta
vahvistettu ettei mikään palvelinpuolen salaisuus tai `firebase-admin` esiinny.
