# Piilosana

Suomenkielinen sanapuzzle-peli, joka pyörii osoitteessa
[piilosana.com](https://piilosana.com). Sisältää päivän haasteen,
moninpelin (oma huone tai jatkuva arena), harjoittelu­tilan ja
saavutukset.

## Tech stack

- **Backend**: Node.js, Express, Socket.IO, sql.js (in-process SQLite)
- **Frontend**: React 18, Vite
- **Deploy**: Railway.app
- **PWA + TWA** (Google Play Trusted Web Activity)

Suomalainen sanavarasto on poikkeuksellisen laaja: ~100 000 perussanaa
ja ~232 000 taivutusmuotoa.

## Paikallinen kehitys

```bash
# Riippuvuudet
npm install
cd client && npm install && cd ..

# Kaksi terminaalia:
# Terminaali 1 — palvelin
node --watch index.js

# Terminaali 2 — frontti
cd client && npm run dev
```

Frontti pyörii [http://localhost:5173](http://localhost:5173) ja
puhuu palvelimelle joka kuuntelee oletuksena portissa 3001.

## Testit

Pelin ydin­logiikka (gridin generointi, sanan validointi, pisteytys,
hex-naapurit, trie) on eriytetty `server/game/`-moduuleihin ja testattu
Vitestillä.

```bash
npm test           # ajaa kaikki testit kerran
npm run test:watch # ajaa testit watch-tilassa kehityksen aikana
```

## Build

```bash
npm run build      # rakentaa clientin `dist/`-kansioon
```

Tuotannossa Express tarjoilee `dist/`:n staattisina tiedostoina ja samalla
hoitaa REST-API:n ja Socket.IO:n.

## Ympäristömuuttujat

Katso [`.env.example`](.env.example) — sisältää kaikki tarvittavat
muuttujat dokumentoituina. Tuotannossa nämä asetetaan Railwayn
project variables -näkymässä.

## Repon rakenne

```
piilosana/
├── index.js              # Pääpalvelin (Express + Socket.IO)
├── server/game/          # Eristetty pelilogiikka + testit
│   ├── score.js          # Pisteytys
│   ├── grid.js           # Ruudukon generointi
│   ├── trie.js           # Sanaston nopea hakurakenne
│   ├── hex.js            # Hex-naapurit
│   └── validate.js       # Sanan etsintä ja polun tarkistus
├── client/               # React + Vite frontti
│   ├── src/
│   │   ├── App.jsx       # Pääkomponentti
│   │   ├── components/   # Eriytetyt UI-komponentit
│   │   ├── hooks/        # React-hookit (esim. useDailyPercentile)
│   │   └── menuColors.js # Alkuvalikon väripaletti
│   └── public/
├── words*.js             # Per-kielen sanalistat
├── words_fi_full.txt.gz  # Suomen täysi sanalista (~24 MB pakattuna)
└── ARKKITEHTUURI_ARVIO.md # Arkkitehtuurin tila ja siirtymäpolku
```

Lisää arkkitehtuurin nykytilasta ja tulevaisuuden suunnitelmista:
[`ARKKITEHTUURI_ARVIO.md`](ARKKITEHTUURI_ARVIO.md).

## Deploy

Pushaa `main`-haaraan. Railway havaitsee muutoksen ja deployaa
automaattisesti. Build-skripti `npm run build` ajetaan ennen
`npm start`:ia.

## Tietokanta

Sovellus tukee kahta tietokanta-ajuria:

- **sql.js (oletus)**: in-process SQLite, koko DB muistissa, levylle
  serialisoituna `/data/piilosana.db`-tiedostoon. Toimii kun
  `DATABASE_URL` on tyhjä. Häviää usein restartissa jos volume puuttuu.

- **Postgres**: kun `DATABASE_URL` on asetettu, käyttää `pg`-poolia.
  Kestää restartit ja mahdollistaa nollakatkodeplyt rinnakkaisten
  prosessien kanssa.

### Migraatio sql.js → Postgres

1. Lisää Railwayssa Postgres add-on, kopioi sen `DATABASE_URL`
2. Aseta sama URL paikallisesti (`export DATABASE_URL=...`)
3. Aja kerran: `npm run migrate:postgres` — siirtää nykyisen
   `piilosana.db`:n tiedot Postgresiin
4. Aseta `DATABASE_URL` Railwayn Variables-välilehdelle, redeploy
5. Sovellus käyttää nyt Postgresiä; sql.js fallback jää käyttöön
   jos URL poistuu

Migraatioskripti on idempotent `daily_scores`:n osalta (käyttää
`ON CONFLICT DO NOTHING`), mutta `hall_of_fame` ja `users` voivat
duplikoitua jos ajat kahdesti. Tyhjennä kohdetaulu tarvittaessa.

## Lisenssi

© Matti Kuokkanen 2026
