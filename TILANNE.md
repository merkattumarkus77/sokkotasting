# Projektin tila

Päivitetty: 2026-08-20

## Valmis

- **Vaihe 0** (koodipuoli): Next.js + TypeScript + Tailwind alustettu, night mode -teema,
  `src/lib/firebase.ts` Firebase-yhteyttä varten. Build/lint/typecheck vihreitä.
- **Vaihe 1**: Datamalli (`src/lib/types.ts`: config/events/participants/scores),
  etusivu Järjestä/Osallistu-valinnalla, salasanatarkistuksen perusteet (`src/lib/config.ts`).
- **Vaihe 2**: Järjestäjän tapahtuman luontilomake ja Round Robin -parsinta.
  - `src/lib/roundRobin.ts`: arpoo jokaiselle osallistujalle erikseen kaikki tuoteparit
    satunnaisessa järjestyksessä + satunnaisella A/B-jaolla, ja tarkistaa (`validateRounds`)
    että jokainen teoreettinen pari löytyy tarkalleen kerran — jos ei, arpoo uudelleen
    (`generateParticipantRounds`, enintään 50 yritystä). **Algoritmi on ajettu ja varmennettu**
    erillisellä testiskriptillä 1400 arvonnalla tuotemäärillä 2–10 (ks. commit-historia) —
    validointi läpäisi kaikki, A/B-jako tasapainossa. Puhdasta logiikkaa, ei riipu Firebasesta.
  - `src/lib/events.ts`: `createEvent()` kirjoittaa event- ja participant-dokumentit yhdellä
    Firestore-batchilla ja päivittää `config.activeEventId`. `getActiveEvent()` hakee nykyisen
    aktiivisen tapahtuman.
  - `/jarjesta`-sivu (`OrganizerCreateEvent`-komponentti): salasana → varoitus jos edellinen
    tasting on yhä aktiivinen (ei pakota jatkamaan, vaatii vahvistuksen) → lomake (nimi,
    kategoria, osallistujat/tuotteet dynaamisina listoina, annoskoko+yksikkö, arvausoptio) →
    live "Suunnittelutyökalu" (paria/osallistuja, tuotetarve) → tallennus → yhteenveto.
  - **Varmennettu livenä käyttäjän toimesta** (2026-08-20): käyttäjä loi oikean testitastingin
    sokkotasting.vercel.app:ssa, ja tarkistin Firestoresta admin-skriptillä että `events`- ja
    `participants`-dokumentit syntyivät odotetusti (event: 2 tuotetta, 2 osallistujaa,
    pairsPerParticipant=1; molemmilla osallistujilla 1 validi uniikki kierros, `status: active`,
    `sessionToken` tyhjä). Koko Vaihe 2 -polku toimii siis päästä päähän tuotannossa.
- Ylläpitoskripti `scripts/set-password.mjs` salasanan asettamiseen/vaihtoon Firestoreen
  (`npm run set-password <salasana>`), ks. skriptin alkukommentti käyttöohjeesta.
- Määrittely.md päivitetty versioon 2.2: lukittu yhden aktiivisen tastingin malli
  (ks. kohta 3.0) ja salasanan hallinta ylläpitoskriptillä (ks. kohta 2).
- **Infra on nyt live**: Firebase-projekti `sokkotasting` luotu, Firestore käytössä,
  `.env.local` täytetty oikeilla asetuksilla (ei committoitu, gitignoressa),
  `serviceAccountKey.json` paikallaan projektin juuressa (gitignoressa). Yhteinen salasana
  asetettu `config/app`-dokumenttiin skriptillä ja **varmennettu oikeaa Firestorea vasten**
  samalla client-SDK-kutsulla jota sovellus itse käyttää — toimi.
- **Sovellus on julkaistu ja toimii livenä**: **https://sokkotasting.vercel.app/**
  - GitHub: `https://github.com/merkattumarkus77/sokkotasting.git`. Aktiivinen/tuotantohaara
    on **`main`** (ei `master` — repo alkoi `master`-nimisenä, nimettiin myöhemmin uudelleen).
    `origin/master` on jäänyt GitHubiin vanhana, käyttämättömänä haarana; voi poistaa myöhemmin,
    ei kiirettä.
  - Vercel-projektin **Domains → Branch Tracking** osoittaa nyt `main`-haaraan.
  - **Next.js on 15.5.23**, ei 16 (ks. commit "Vaihda Next.js 16.3.1 -> 15.5.23"). `create-next-app`
    asensi alun perin version 16.3.1 (silloinen uusin), joka aiheutti 404:n Vercelissä epäiltynä
    syynä sen alfa-vaiheinen Build Adapters -rajapinta; downgrade tehtiin varotoimena eikä sitä
    ole erikseen kumottu tai vahvistettu tarpeettomaksi.
  - **Todellinen 404:n syy löytyi lopulta muualta**: Vercel-projektin
    **Settings → Build and Output Settings → Framework Preset** oli jäänyt arvoon **"Other"**
    (oletti, ettei projektia tunnistettu Next.js-sovellukseksi tuontivaiheessa), jolloin Vercel ei
    kytkenyt Next.js-reititystä vaikka `next build` onnistui joka kerta täysin normaalisti. Korjattu
    vaihtamalla arvoksi "Next.js" + Redeploy. **Muista tämä jos joskus tehdään toinen Vercel-projekti
    samalle tai toiselle repolle** — tarkista Framework Preset heti tuonnin jälkeen.
  - Eslint-asetus vaihdettu Next 16:n flat configista (`eslint.config.mjs`) Next 15:n
    legacy-muotoon (`.eslintrc.json` + `next lint`), koska `eslint-config-next` ei 15.5:ssä
    julkaise flat-config-yhteensopivaa moduulia.
- **Vaihe 3**: Osallistujan kirjautuminen ja "Odottaa maistiaisia" -tilanäkymä.
  - `src/lib/participants.ts`: `findParticipantByName()` hakee osallistujan Firestore-kyselyllä
    (`eventId` + `name`). `loginParticipant()` tarkistaa salasanan, hakee aktiivisen tapahtuman,
    etsii osallistujan nimellä ja arpoo uuden `sessionToken`:in (`crypto.randomUUID()`), joka
    kirjoitetaan `participants`-dokumenttiin — tämä mitätöi automaattisesti minkä tahansa
    aiemman istunnon samalla nimellä. `subscribeToParticipant()` kuuntelee osallistujadokumenttia
    reaaliajassa (`onSnapshot`).
  - `src/lib/session.ts`: istunnon (`eventId`, `participantId`, `participantName`,
    `sessionToken`) säilytys `localStorage`issa (`saveSession`/`loadSession`/`clearSession`).
  - `src/components/ParticipantSession.tsx` (korvaa poistetun `PasswordCheck.tsx`:n
    `/osallistu`-sivulla): tilakone `restoring → login → active`. Sivun avautuessa yrittää
    palauttaa istunnon `localStorage`ista ja tarkistaa, että aktiivinen tapahtuma ja
    sessiotoken täsmäävät; jos ei, näyttää kirjautumislomakkeen (nimi + yhteinen salasana).
    Onnistuneen kirjautumisen jälkeen `onSnapshot`-kuuntelija päivittää näkymän reaaliajassa:
    "Odottaa maistiaisia" (kierros ei vielä tarjoiltu), "Näytteet tarjoiltu" (tarjoiltu, odottaa
    Vaihe 4:n arviointilomaketta), tai valmistumisilmoitus kun `currentRoundIndex` on ohittanut
    viimeisen kierroksen. Jos toinen laite kirjautuu samalla nimellä, `sessionToken` vaihtuu
    Firestoressa, kuuntelija havaitsee eron ja kirjaa tämän istunnon ulos automaattisesti
    viestillä. "Kirjaudu ulos" -nappi tyhjentää istunnon manuaalisesti.
  - **Varmennettu Playwrightilla kahdella selainkontekstilla** tuotanto-Firestorea vasten
    (osallistujat Matti/Teppo, tasting "Testi"): (1) kirjautuminen näyttää oikean
    "Odottaa maistiaisia" -tilan ja kierrosnumeron, (2) sivun uudelleenlataus palauttaa
    istunnon suoraan tilanäkymään ilman kirjautumislomaketta, (3) toiselta "laitteelta"
    (toinen selainkonteksti) samalla nimellä kirjautuminen kirjaa ensimmäisen istunnon
    ulos automaattisesti reaaliajassa oikealla viestillä. Ei konsolivirheitä kummassakaan
    kontekstissa. `npm run lint`, `tsc --noEmit` ja `npm run build` vihreitä.
- **Vaihe 4**: Arviointikierros — järjestäjän tarjoilun kuittaus ja osallistujan arviointilomake.
  - `src/lib/scores.ts`: `submitScore()` tallentaa `scores`-dokumentin ja merkitsee osallistujan
    nykyisen kierroksen `completed: true` sekä kasvattaa `currentRoundIndex`:iä yhdellä
    Firestore-batchilla. Arvauskentät (`guessAIndex`/`guessBIndex`) jätetään kokonaan pois
    dokumentista kun arvaus ei ole päällä (Firestore hylkää `undefined`-arvot). `getGuessCounts()`
    laskee osallistujan omasta `scores`-historiasta, kuinka monta kertaa kutakin tuotetta on jo
    arvattu — näytetään pienellä luvulla arvausalasvedon vaihtoehdoissa.
  - `src/lib/participants.ts` laajennettu: `subscribeToEventParticipants()` (kaikki tapahtuman
    osallistujat reaaliajassa, järjestäjän dashboardia varten) ja `markCurrentRoundServed()`
    (kuittaa nykyisen kierroksen tarjoilluksi — lukee/kirjoittaa koko `rounds`-taulukon, koska
    Firestore ei tue yksittäisen taulukkoalkion osittaista päivitystä kenttäpolulla).
  - `src/components/OrganizerDashboard.tsx` + `/jarjesta/dashboard`-sivu: salasana → reaaliaikainen
    lista tapahtuman osallistujista tiloineen ("Odottaa maistiaisia" / "Maistamassa" / "Odottaa
    seuraavaa kierrosta" / "Valmis"), kullekin näkyy seuraavan tarjoiltavan parin **oikeat**
    tuotenimet ("Tarjoile A = X, B = Y") ja "Kuittaa tarjoiltu" -nappi kun kierrosta ei ole vielä
    tarjoiltu. Linkitetty tapahtuman luonnin onnistumisnäkymästä ja `/jarjesta`-sivulta.
  - `src/components/EvaluationForm.tsx`: renderöityy `ParticipantSession`in sisällä heti kun
    nykyinen kierros on tarjoiltu muttei vielä valmis. Liukusäädin (0–50) tuotteen A pisteille,
    B lasketaan automaattisesti (50 − A); muistiinpanokenttä; jos `guessingEnabled`, kaksi
    alasvetovalikkoa **oikeilla** tuotenimillä (A- ja B-arvaus), estää saman tuotteen valinnan
    molempiin. "Hyväksy" kutsuu `submitScore()`:ia, minkä jälkeen `ParticipantSession`in
    reaaliaikainen kuuntelija vaihtaa näkymän automaattisesti takaisin odotustilaan tai
    valmistumisilmoitukseen — ei erillistä uudelleenohjauslogiikkaa tarvita.
  - **Varmennettu Playwrightilla** tuotanto-Firestorea vasten kahdella selainkontekstilla
    (järjestäjän dashboard + osallistuja Matti, tasting "Testi"): koko sykli tarjoile → kuittaa →
    osallistujan näkymä vaihtuu reaaliajassa arviointilomakkeeksi → liukusäädin, muistiinpanot ja
    arvaukset täytetään → duplikaattiarvauksen validointi (sama tuote molempiin) torjuu
    lähetyksen oikealla virheviestillä eikä kirjoita mitään Firestoreen → korjattu lähetys
    tallentaa `scores`-dokumentin oikeilla arvoilla (pointsA=35, pointsB=15, summa 50, oikeat
    `guessAIndex`/`guessBIndex`, muistiinpano) ja `participants`-dokumentti päivittyy
    (`completed: true`, `currentRoundIndex` kasvaa) → sekä osallistujan että järjestäjän näkymä
    näyttävät reaaliajassa "Valmis"/"Kaikki kierrokset suoritettu" ilman sivun päivitystä. Ei
    konsolivirheitä. Testidata palautettu ajon jälkeen alkuperäiseen, koskemattomaan tilaan
    (Matti: `served`/`completed` false, `currentRoundIndex` 0, tyhjä `sessionToken`, testi-`score`
    poistettu) jotta käyttäjän oma käsin testaus alkaa puhtaalta pöydältä. `npm run lint`,
    `tsc --noEmit` ja `npm run build` vihreitä.

## Seuraava askel

**Käyttäjätestaus** (sovittu tehtäväksi ennen Vaihe 5:tä): käyttäjä testaa Vaihe 3–4:n koko
polun itse livenä sokkotasting.vercel.app:ssa — kirjautuminen osallistujana, järjestäjän
dashboard toiselta laitteelta/välilehdeltä, tarjoilun kuittaus, arviointilomakkeen täyttö
liukusäätimellä ja arvauksilla, "Hyväksy". Testitasting "Testi" (Claude vs ChatGPT,
osallistujat Matti/Teppo) on tuotannossa valmiina ja puhtaassa tilassa tätä varten.

Sen jälkeen **Vaihe 5**: Tulokset, tilastot ja vienti — ranking-%-laskenta (Määrittely.md 3.3:n
kaava), osallistujan ja järjestäjän tulosnäkymät oikeilla tuotenimillä, all-time-tilastot
kategorian mukaan, Markdown/tekstivienti. Ks. projektisuunnitelman "Vaihe 5".

## Muuta huomioitavaa jatkoa varten

- App tukee vain yhtä aktiivista tastingia kerrallaan (`config.activeEventId`), ks. Määrittely.md 3.0.
- A/B-järjestys parin sisällä arvotaan 50/50 (ks. Määrittely.md 3.2).
- Ranking-% -kaava dokumentoitu Määrittely.md kohdassa 3.3 — ei vielä toteutettu, tulee Vaihe 5:ssä.
- Osallistujan istuntotoken tallennetaan `localStorage`issa avaimella `sokkotasting_session`
  (ks. `src/lib/session.ts`).
- Firestore Security Rules (Määrittely.md kohta 4) ei ole vielä kirjoitettu. Kirjoituspolkuja
  asiakkaalta ilman palvelinpuolen valvontaa on nyt neljä: tapahtuman luonti (Vaihe 2),
  `sessionToken`:in päivitys (Vaihe 3), sekä tarjoilun kuittaus ja pisteiden tallennus
  (Vaihe 4) — hyväksytty riski kevyen tietoturvamallin mukaisesti, mutta säännöt kannattaa
  kirjoittaa viimeistään ennen Vaihe 5:n julkista tulosnäkymää.
- Tuotanto-Firestoressa on juuri nyt aktiivisena käyttäjän testitasting "Testi" (Claude vs
  ChatGPT, osallistujat Matti/Teppo), tila puhdas (ei tarjoiltu, ei pisteitä) käyttäjätestausta
  varten. Kun oikea ensimmäinen tasting luodaan, `/jarjesta` näyttää siitä varoituksen (ks.
  Vaihe 2 -kuvaus yllä) — se on odotettu käytös, ei virhe.
