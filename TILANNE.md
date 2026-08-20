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

## Seuraava askel

**Vaihe 3**: Osallistujan kirjautuminen ja näkymä — nimi+salasana-kirjautumislomake,
sessiotokenin luonti/tallennus (localStorage + Firestore `activeSessionId`, tuplakirjautumisen
esto), sekä "Odottaa maistiaisia" -tilanäkymä joka kuuntelee reaaliajassa järjestäjän
kuittausta. Ks. Määrittely.md kohdat 2 ja 3.4, sekä projektisuunnitelman "Vaihe 3". Osallistujan
tulee löytää oma `participants`-dokumenttinsa nimen perusteella aktiivisesta tapahtumasta
(`config.activeEventId`), ja resilienssivaatimuksen mukaan uudelleenkirjautuessa palata
täsmälleen `currentRoundIndex`-kierrokseen.

## Muuta huomioitavaa jatkoa varten

- App tukee vain yhtä aktiivista tastingia kerrallaan (`config.activeEventId`), ks. Määrittely.md 3.0.
- A/B-järjestys parin sisällä arvotaan 50/50 (ks. Määrittely.md 3.2).
- Ranking-% -kaava dokumentoitu Määrittely.md kohdassa 3.3.
- `Participant.sessionToken` on toistaiseksi aina tyhjä merkkijono (`""`) — Vaihe 3 ottaa sen
  käyttöön kirjautumisen yhteydessä.
- Firestore Security Rules (Määrittely.md kohta 4) ei ole vielä kirjoitettu — tehdään kun
  osallistujan/järjestäjän kirjoitusoikeuksien tarkka rajaus on selvillä (viimeistään Vaihe 3–4).
- Tuotanto-Firestoressa on juuri nyt aktiivisena käyttäjän testitasting "Testi" (Claude vs
  ChatGPT, osallistujat Matti/Teppo). Kun oikea ensimmäinen tasting luodaan, `/jarjesta` näyttää
  siitä varoituksen (ks. Vaihe 2 -kuvaus yllä) — se on odotettu käytös, ei virhe. Testidatan voi
  jättää roikkumaan tai poistaa Firebase-konsolista, ei kiirettä.
