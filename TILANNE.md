# Projektin tila

Päivitetty: 2026-08-20

## Valmis

- **Vaihe 0** (koodipuoli): Next.js + TypeScript + Tailwind alustettu, night mode -teema,
  `src/lib/firebase.ts` Firebase-yhteyttä varten. Build/lint/typecheck vihreitä.
- **Vaihe 1**: Datamalli (`src/lib/types.ts`: config/events/participants/scores),
  etusivu Järjestä/Osallistu-valinnalla, salasanatarkistuksen perusteet (`src/lib/config.ts`,
  `PasswordCheck`-komponentti testisivuilla `/jarjesta` ja `/osallistu`).
- Ylläpitoskripti `scripts/set-password.mjs` salasanan asettamiseen/vaihtoon Firestoreen
  (`npm run set-password <salasana>`), ks. skriptin alkukommentti käyttöohjeesta.
- Git-repo alustettu paikallisesti (`git init`), kaksi commitia tehty. **Ei vielä pushattu
  GitHubiin** — remotea ei ole vielä lisätty.
- Määrittely.md päivitetty versioon 2.2: lukittu yhden aktiivisen tastingin malli
  (ks. kohta 3.0) ja salasanan hallinta ylläpitoskriptillä (ks. kohta 2).

## Odottaa käyttäjää (ei voi tehdä puolestasi)

1. **Firebase-projekti + Firestore**: luo projekti [Firebase-konsolissa](https://console.firebase.google.com),
   lisää Web-sovellus, luo Firestore-tietokanta, täytä `.env.local` (pohja: `.env.local.example`).
2. **Palvelutilin avain**: Project settings → Service accounts → Generate new private key,
   tallenna `serviceAccountKey.json` projektin juureen (gitignoressa, ei committoida).
   Aja tämän jälkeen `npm run set-password <salasana>` kerran, jotta config/app-dokumentti syntyy.
3. **GitHub-repo**: luo tyhjä repo, anna osoite → lisätään remote ja pushataan.
4. **Vercel**: yhdistä GitHub-repo, lisää samat Firebase-env-muuttujat Vercelin
   Project Settings → Environment Variables -kohtaan.

## Seuraava askel

**Vaihe 2**: Järjestäjän tapahtuman luontilomake + Round Robin -parsinta-algoritmi
(arvonta jokaiselle osallistujalle erikseen + tarkistusmekanismi, joka arpoo uudelleen jos
jokin pari puuttuu/toistuu) + tallennus Firestoreen. Ks. Määrittely.md kohdat 3.1–3.2 ja
projektisuunnitelman "Vaihe 2".

## Muuta huomioitavaa jatkoa varten

- App tukee vain yhtä aktiivista tastingia kerrallaan (`config.activeEventId`), ks. Määrittely.md 3.0.
- A/B-järjestys parin sisällä arvotaan 50/50 (ks. Määrittely.md 3.2).
- Ranking-% -kaava dokumentoitu Määrittely.md kohdassa 3.3.
