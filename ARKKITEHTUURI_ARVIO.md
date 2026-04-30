# Piilosana – arkkitehtuuriarvio ja siirtymäsuunnitelma

## Lyhyesti: missä mennään nyt

Piilosana on käytännössä klassinen "yksi tiedosto -monoliitti" molemmilta puolin:

- **Backend** (`index.js`, 1 823 riviä): REST-rajapinta, Socket.IO, peli­logiikka, autentikaatio, sähköposti ja tietokanta yhdessä tiedostossa.
- **Frontend** (`client/src/App.jsx`, 5 902 riviä): kaikki pelimuodot, valikot, tulostaulukot, asetukset ja arena samassa komponentissa.
- **Tietokanta**: `sql.js` eli SQLite Node-prosessin sisällä. Koko tietokanta on muistissa, ja jokainen kirjoitus serialisoi sen levylle (`/data/piilosana.db`).
- **Reaaliaikainen tila** (Socket.IO-huoneet, arena, käynnissä olevat pelit): muistissa olevia `Map`-rakenteita. Häviävät kun prosessi käynnistyy uudelleen.
- **Deploy**: Railway havaitsee Noden ja ajaa `npm start`. Ei Dockerfileä, ei CI:tä, ei testejä.
- **Päivitys­ilmoitus**: `APP_VERSION = Date.now().toString(36)` startissa, asiakas pollaa `/api/version` ja näyttää bannerin – mutta uudelleen­latauksen tekee käyttäjä itse.

Tämä on toimiva yhden hengen projekti, mutta jokainen deploy katkaisee käynnissä olevat pelit ja arenan – ja iso `App.jsx` tekee jokaisesta muutoksesta jännittävän.

## Päädiagnoosi: yksi pullonkaula yhdistää molemmat ongelmat

Sama asia tekee koodista vaikeasti ylläpidettävää **ja** estää nollakatko­deployn:

> Pelitila ja tietokanta elävät Node-prosessin muistissa.

Kun yhdellä prosessilla on koko sovellus (UI:n serveri, REST, Socket.IO, peli­logiikka, DB), siitä ei voi ajaa kahta rinnakkain – tilakopiot eroaisivat heti. Siksi Railwayn rolling-deploy ei ole mahdollinen, vaan vanha prosessi tapetaan ja uusi nostetaan tilalle. Tästä syntyy katko ja siksi ihmiset tippuvat arenasta.

Mikä tahansa siirtymä, joka ei kosketa tähän, on kosmeettinen. Mikä tahansa siirtymä, joka koskettaa tähän, parantaa myös ylläpidettävyyttä, koska pakottaa eriyttämään.

## Miten projekti kannattaisi jakaa osiin

Jos tästä lähtisi tekemään uusiksi tyhjältä pöydältä, jako menisi karkeasti näin – mutta käytännössä siirtymä tehdään vaiheittain alla olevassa polussa.

**Backend, looginen jako (samaan repoon, eri tiedostoihin):**

1. `server/http/` – Express-reitit ohuina kontrollereina, yksi tiedosto per aluetta (auth, leaderboard, game, user, public-game).
2. `server/realtime/` – Socket.IO-event-handlerit eriytettynä huone­tyypeittäin (arena, custom rooms, classic, battle).
3. `server/game/` – puhdas peli­logiikka: ruudukon generointi, sanan validointi, pisteytys. Ei tunne HTTP:tä eikä socketteja. Tämä on se osa, joka pitäisi pystyä testaamaan ilman serveriä ja jakamaan myös frontille.
4. `server/db/` – tietokanta-ajurit ja kyselyt. Tähän tehdään myös vaihto sql.js → ulkoinen DB.
5. `server/auth/` – middleware, token, Google OAuth, sähköpostit (Resend).
6. `shared/` – peli­logiikka, joka pyörii samanlaisena selaimessa ja palvelimella (esim. päiväpelin determinist­inen seedaus).

**Frontend, looginen jako:**

1. `client/src/features/{daily,classic,battle,arena,leaderboard,profile,settings}/` – yksi kansio per pelimuoto/näkymä, omat komponentit ja paikallinen tila.
2. `client/src/game/` – `shared/`-pelilogiikka tuotuna, custom-hookit (`useGrid`, `useWordTrace`, `useScoring`).
3. `client/src/api/` – ohut HTTP- ja Socket.IO-asiakas, jotta komponentit eivät puhu suoraan `fetch`-kutsuilla.
4. `client/src/i18n/` – kielet yhdessä paikassa (nyt `defs_fi.js` + sirpaleisia `if (lang === ...)` koko koodissa).
5. `client/src/App.jsx` – pelkkä reititys ja layout, ei pelilogiikkaa.

Tämä jako on tavoite, ei vaatimus. Sinne ei mennä yhdellä commitilla.

## Vaiheittainen siirtymäsuunnitelma

Järjestys on valittu niin, että jokainen vaihe tuottaa konkreettisen hyödyn ja aikaisemmat vaiheet helpottavat seuraavia. Mitään ei tarvitse tehdä kerralla.

### Vaihe 0 – Turvaverkot (1–2 iltaa)

Ennen kuin koskee mihinkään rakenteeseen, asennetaan ne asiat, joita ilman refaktorointi on uhkapeliä:

- **Vitest** frontille, **node:test** tai **Vitest** backille. Aloita peli­logiikan testeistä (ruudukon generointi, sanan validointi, pisteytys) – se on puhdas funktio­logiikka ja tuottaa eniten varmuutta vähimmällä työllä.
- **GitHub Actions** -workflow, joka ajaa `npm test` ja `npm run build` jokaiselle PR:lle. Railway voi jatkossa kuunnella vain `main`-haaraa, jolloin epäonnistunut build ei pääse tuotantoon.
- **`.env.example`** -tiedosto repoon. Nyt kukaan (mukaan lukien tuleva sinä) ei tiedä mitä env-muuttujia tarvitaan.
- **README.md** projektin juureen: miten ajetaan paikallisesti, miten deployaa, mitkä ovat env-muuttujat.

Tästä saa ensimmäisen "ei tarvitse pelätä deployta" -hyödyn.

### Vaihe 1 – Backend tiedostoiksi (ei käyttäytymis­muutosta) (1 viikonloppu)

`index.js` paloitellaan moduuleiksi, mutta logiikka säilyy identtisenä. Käytännössä:

- Reitti­ryhmät omiin tiedostoihinsa (`server/routes/auth.js` jne.) ja `index.js` vain `app.use()`:lla niihin.
- Socket.IO-handlerit eriytetty samalla tavalla (`server/sockets/arena.js` jne.).
- Pelilogiikka ja DB-funktiot omiin moduuleihinsa.

Tärkeintä: **älä optimoi mitään**, älä vaihda kirjastoja. Tämä vaihe on pelkkää tekstiä, ja sen jälkeen muutokset on huomattavasti helpompi tehdä turvallisesti.

### Vaihe 2 – Frontti pilkkominen (vaiheittain)

`App.jsx` 5 902 rivissä tarkoittaa, että jokainen muutos lukee ja parsii koko tiedoston. Ei tehdä kerralla – aloita yhdestä alueesta:

1. **Settings + Profile** ulos omiksi komponenteiksi (helpoin, vähän tilaa).
2. **Leaderboard / Hall of Fame** omiksi komponenteiksi.
3. **Arena** ulos – tämä on erityisen hyödyllistä, koska arena-koodi on erityisen kytkeytynyttä ja sen yksinään testaaminen on arvokasta.
4. **Pelimuodot** (classic, battle, daily) yksi kerrallaan.

Joka kerralla `App.jsx` ohenee. Jos käytät Reactin Suspense + lazy loadia, frontin alku­latautuminen myös nopeutuu.

### Vaihe 3 – sql.js → Postgres (kriittinen vaihe nollakatkolle)

Tämä on se yksittäinen muutos, joka avaa nollakatko­deployn. Railwaylla on Postgres add-on, joten infra-puolella tämä on triviaalia.

- **DB-ajuri**: `pg` (kevyt) tai **Drizzle ORM** / **Prisma** (mukavampi). Suosittelisin Drizzleä – kevyempi kuin Prisma, tyypitetty, ei generointi­vaihetta.
- **Migraatiot**: `drizzle-kit` tai pelkät SQL-tiedostot. Aloita yksinkertaisesti.
- **Migrointi nykyisestä DB:stä**: kirjoita kertaluonteinen skripti, joka lukee `piilosana.db`:n sql.js:llä ja kirjoittaa Postgresiin.
- **Connection pool** (`pg.Pool`), ei yhtä yhteyttä per pyyntö.

Tämän jälkeen tieto­kanta ei katoa restartissa, useita Node-prosesseja voi pyöriä rinnakkain ja transaktiot toimivat oikeasti.

### Vaihe 4 – Reaaliaikatila Redikseen

Socket.IO:n in-memory `Map`it (`rooms`, `playerRooms`) ovat toinen este nollakatkolle. Ratkaisu:

- **Redis** (Railwayn add-on) ja **`@socket.io/redis-adapter`** – Socket.IO osaa jakaa eventit prosessien välillä.
- Aktiivisten huoneiden ja arena-pelien tila Rediksen hashiin tai serialisoituna avaimeen, ei prosessin muistiin.
- Lyhyet TTL:t aktiivisille peleille, jotta orpot huoneet siivoutuvat itse.

Tämä on se vaihe, joka oikeasti mahdollistaa että kaksi versiota palvelimesta voi pyöriä rinnakkain.

### Vaihe 5 – Graceful shutdown ja rolling deploy

Nyt kaikki palaset ovat paikoillaan. Lisätään:

- **SIGTERM-käsittelijä**: kun Railway ilmoittaa "olen tappamassa sinut 30 sekunnin päästä", server lopettaa uusien yhteyksien hyväksymisen, lähettää socketeille `server_draining`-eventin (asiakas voi siirtyä toiselle palvelimelle automaattisesti tai pyytää käyttäjää odottamaan), ja sulkee yhteydet siististi.
- **`/health` ja `/ready`** -reitit. Health = "prosessi elää", ready = "DB-yhteys auki, valmis vastaanottamaan liikennettä". Railwayn health check osoitetaan `/ready`:yyn.
- **Kaksi rinnakkaista instanssia** Railwayssa (replicas: 2). Päivityksessä toinen vaihdetaan ensin, kun se on valmis, toinen.

### Vaihe 6 – Frontti­päivitys ilman riitaa

Tämä on usein unohdettu osa "nollakatkosta": vaikka palvelin vaihtuu siististi, käyttäjän selaimessa pyörivä vanha JS-bundle kutsuu uutta APIa.

- **API-versiointi**: `/api/v1/...` – tai vähintään header `X-Api-Version`. Älä riko vanhaa rajapintaa kahteen viikkoon deployn jälkeen.
- **Service workerin uudelleen­käynnistys**: kun `/api/version` muuttuu, kysy käyttäjältä "uusi versio saatavilla, päivitä?" – mutta vasta kun käyttäjä ei ole kesken pelin. Banneri ei riitä.
- **Skeema­muutokset additiivisina**: lisää kenttiä, älä poista. Poistot tehdään vasta seuraavassa deploy-syklissä, kun mikään asiakas ei enää lue niitä.

## Mitä tekisin ensin

Jos sinulla on yksi viikonloppu: **vaihe 0** kokonaan, plus pelilogiikan eristäminen omaan tiedostoon ja yksikkö­testit sille. Tämä antaa heti tunteen "voin muuttaa koodia ilman pelkoa".

Jos sinulla on yksi kuukausi muutaman illan kerrallaan: lisäksi **vaihe 1** (backend tiedostoiksi) ja **vaihe 3** (Postgres). Sen jälkeen olet jo tilanteessa, jossa data ei katoa eikä restart tunnu pelottavalta.

Vaiheet 4–6 ovat sen jälkeen "kun haluan oikeasti nollakatko-deployt". Ne ovat oikeasti hyödyllisiä vasta kun käyttäjä­määrä kasvaa siihen pisteeseen, että pelin keskeyttäminen 30 sekunniksi on iso asia. Jos peli pyörii pääosin yksin­pelaajilla ja arena on hiljaisempi, vaiheet 0–3 voivat riittää pitkäksi aikaa.

## Asiat, jotka eivät ole arkkitehtuuria mutta auttavat ylläpitoa

- **Sentry** (tai jokin muu virhe­seuranta) – ilmainen hobby-tier riittää. Näet tuotannon virheet ilman että käyttäjien pitää ilmoittaa.
- **Strukturoitu loggaus** (`pino`) – nyt `console.log` riittää, mutta JSON-lokit ovat etsittäviä.
- **Riippuvuus­päivitykset**: `npm outdated` kerran kuussa, varsinkin Express, Socket.IO, React. Pieniä päivityksiä ei kannata kasata.
- **Backupit**: kun siirryt Postgresiin, Railwayn backup-mahdollisuudet ovat olemassa, mutta varmista että tiedät miten palautat sen. Sql.js:n kanssa nykyisin ainoa "backup" on `/data`-volyymin replikointi.
