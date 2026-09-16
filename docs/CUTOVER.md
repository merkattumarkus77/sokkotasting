# CUTOVER.md — tuotantoon siirto v1 → v2

> **Tätä dokumenttia EI ole suoritettu.** Se on kirjoitettu Vaihe H:ssa CLAUDE.md:n ja
> `docs/PLAN.md`:n vaatimuksen mukaisesti ("kirjoitetaan mutta ei suoriteta"). Jokainen alla oleva
> komento koskee joko oikeaa tuotanto-Firestorea tai `main`-haaraa — kumpaakaan ei saa koskea ilman
> käyttäjän erillistä, tämän istunnon ulkopuolista päätöstä ja läsnäoloa. Älä aja näitä komentoja
> automaattisesti missään tulevassa istunnossa ilman eksplisiittistä käyttäjän pyyntöä juuri
> silloin.

## Ennakkoehdot

- [ ] `docs/TESTIKASIKIRJA.md` käyty läpi ja kaikki kohdat kunnossa.
- [ ] `npm run typecheck && npm run lint && npm run test && npm run test:emulator && npm run build`
      kaikki vihreää `v2`-haaran viimeisimmällä committilla.
- [ ] `npm run e2e` vihreä.
- [ ] Käyttäjä on itse päättänyt, että tuotantoon siirto tehdään nyt (ei tämän istunnon oma päätös).
- [ ] Varmuuskopio nykyisestä tuotanto-Firestoresta otettu (Firebase-konsoli → Firestore →
      "Export" — tallenna Cloud Storage -ämpäriin ennen mitään poistoa).

## Tuotantoympäristön nykytila (2026-09, TILANNE.md:n mukaan)

- Firebase-projekti: `sokkotasting`.
- Julkaisuosoite: `https://sokkotasting.vercel.app/`.
- GitHub-repo: `merkattumarkus77/sokkotasting.git`, tuotantohaara `main` (Vercel Branch Tracking
  osoittaa tähän).
- Vanha (v1) tietomalli tuotanto-Firestoressa: taulukkomuotoiset `events`-dokumentit (yksi
  aktiivinen kerrallaan), `participants`-kokoelma jossa `rounds`-taulukko upotettuna,
  `scores`-kokoelma, `config/app`-dokumentti (yhteinen salasana). Näitä EI voi käyttää v2:n
  Route Handlereiden kanssa — tietomallit ovat yhteensopimattomat (SPEC 3 vs. vanha malli).

## Vaihe 1 — Vanhojen kokoelmien tyhjennys

**Ei suoriteta.** Kun käyttäjä on valmis:

1. Vahvista Firebase-konsolista (Firestore Data-välilehti) tarkalleen mitkä kokoelmat ovat
   olemassa juuri sillä hetkellä tuotannossa: `events`, `participants`, `scores`, `config`.
2. Poista `events`, `participants` ja `scores` kokonaan (Firebase-konsolin kokoelman poisto tai
   `firebase firestore:delete --recursive events participants scores --project sokkotasting`).
   **Älä poista `config`** — sen sisältö korvataan seuraavassa vaiheessa, ei poisteta tyhjäksi
   väliin (muuten sivusto olisi rikki siihen asti).
3. Vahvista Firestore-konsolista, että vain `config`-kokoelma on jäljellä (tyhjänä tai vanhalla
   sisällöllä, korvataan heti seuraavaksi).

## Vaihe 2 — `seed:config`-ajo tuotantoon

**Ei suoriteta.** Vaatii `serviceAccountKey.json`:n projektin juuressa (ladataan Firebase-konsolin
Project settings → Service accounts → Generate new private key — tiedosto on jo gitignoressa).

```bash
node scripts/set-password.mjs <admin-tunnus> <admin-salasana> <tapahtumasalasana>
```

Huomaa:
- Ei `FIRESTORE_EMULATOR_HOST`-muuttujaa asetettuna → skripti kirjoittaa oikeasti tuotanto-Firestoreen
  palvelutilin avaimella (skripti kertoo tämän itse suorittaessaan).
- `<admin-tunnus>` ja `<admin-salasana>` ovat UUDET v2:n `AdminLoginGate`-kirjautumistiedot — eivät
  sama asia kuin v1:n pelkkä yhteinen salasana.
- `<tapahtumasalasana>` on osallistujien käyttämä yhteinen salasana (`ParticipantSession`),
  vastaa v1:n ainoaa salasanaa.
- Molemmat tallentuvat bcrypt-tiivisteinä `config/appConfig`-dokumenttiin — ei koskaan
  selväkielisenä.
- Valitse molemmat salasanat vasta tässä vaiheessa, älä etukäteen — kirjaa ne turvalliseen
  salasananhallintaan, ei mihinkään repossa olevaan tiedostoon.

## Vaihe 3 — `firestore.rules` käyttöönotto

**Ei suoriteta.** Tämän hetkinen tuotanto-Firestore ei todennäköisesti käytä lainkaan
sääntötiedostoa version historian mukaan (v1 ei sitä maininnut) — varmista tämä Firebase-konsolin
Firestore → Rules-välilehdeltä ennen deployta, ettei ole jotain käsin tehtyä sääntöä joka pitäisi
säilyttää.

```bash
firebase deploy --only firestore:rules --project sokkotasting
```

Tämä ottaa käyttöön `firestore.rules`-tiedoston tässä repossa (SPEC 2.2:n mukainen: `/config`
täysin estetty, `/events` ja sen `/participants` luku sallittu selaimelle, kaikki muu — erityisesti
`/events/**/tastings/**` — täysin estetty selaimelta, ks. tiedoston omat kommentit). Aja tämä VASTA
Vaiheen 1 jälkeen (vanha data poistettu) — vanha data ei muutenkaan olisi v2-yhteensopivaa, mutta
turha sekaannus vältetään järjestyksellä.

## Vaihe 4 — `v2` → `main`

**Ei suoriteta.**

```bash
git checkout main
git pull origin main
git merge v2 --no-ff -m "Merge v2: SPEC.md-mukainen uudelleenkirjoitus"
git push origin main
```

Vercel on kytketty seuraamaan `main`-haaraa (Branch Tracking) → push laukaisee automaattisen
tuotantodeployn. Varmista ennen pushia:

- [ ] `.env.local`-vastineet on asetettu Vercelin Project Settings → Environment Variables
      -osiossa: kaikki `NEXT_PUBLIC_FIREBASE_*`-muuttujat, `SESSION_SECRET` (**uusi**, pitkä
      satunnainen arvo — älä käytä paikallisen `.env.local`in arvoa tuotannossa),
      `NEXT_PUBLIC_USE_FIRESTORE_EMULATOR` joko poistettu tai `false`.
- [ ] `serviceAccountKey.json` EI ole Vercelissä tiedostona — Vercel käyttää sen sijaan
      `FIREBASE_SERVICE_ACCOUNT_PATH`-muuttujaa tai vastaavaa ympäristömuuttujapohjaista
      tunnistautumista (tarkista `lib/firebaseAdmin.ts`:n `loadAdminApp()`-logiikka: se lukee
      tiedoston polusta, joten Vercel-ympäristössä tarvitaan joko tiedoston sisällön
      injektointi build-ajaksi tai `firebase-admin`in muu tunnistautumistapa — **tämä on
      päätettävä ennen pushia, ei sen jälkeen**, koska nykyinen `firebaseAdmin.ts` on
      kirjoitettu paikallista tiedostopolkua silmällä pitäen eikä Verceliä varten testattu).

## Vaihe 5 — Julkaisun jälkeinen tarkistus

- [ ] Avaa tuotanto-osoite, kirjaudu järjestäjänä uusilla tunnuksilla.
- [ ] Luo testitapahtuma, käy `docs/TESTIKASIKIRJA.md`:n keskeisimmät kohdat läpi tuotannossa.
- [ ] Poista testitapahtuma/-data kun vahvistettu toimivaksi (Firestore-konsolista, ei automaatiolla).
- [ ] Tiedota käyttäjiä uusista kirjautumistavoista jos entisiä osallistujia palaa käyttämään
      sovellusta (v1:n vanha yhteinen salasana ei enää toimi, ks. Vaihe 2).

## Perääntyminen (jos jokin menee pieleen)

Vercel säilyttää aiemmat deploymentit — palaa edelliseen onnistuneeseen deploymenttiin Vercelin
konsolista ("Promote to Production" aiemmalle buildille). Firestore-data ei kuitenkaan palaudu
automaattisesti — tästä syystä Ennakkoehtojen varmuuskopio ennen mitään poistoa on pakollinen, ei
valinnainen.
