// Static-reitit — palvelimen perusinfra: root, health, ready, privacy ja
// SPA-catch-all. Health/ready ovat erillisiä:
//   /health  = liveness (vastaa aina kun prosessi pyörii)
//   /ready   = readiness (503 kun draining-tilassa)
//
// Wire up:
//   attachStaticRoutes(app, {
//     distDir,                  // absoluuttinen polku Vite buildiin
//     getRoomsCount,            // () => number, näytetään /healthissa
//     isShuttingDown,           // () => boolean, /ready palauttaa 503 jos true
//   });
//
// HUOM: SPA catch-all (app.get('*')) täytyy rekisteröidä VIIMEISENÄ kaikkien
// muiden reittien jälkeen, muuten se nappaa myös API-pyynnöt. Tästä syystä
// catch-all on omana funktionaan attachSpaCatchAll, jota kutsutaan erikseen.

import { join } from "node:path";

export function attachStaticRoutes(app, ctx) {
  const { getRoomsCount, isShuttingDown } = ctx;

  // Root — sanity-check että API on pystyssä
  app.get("/", (req, res) => {
    res.json({ status: "ok", message: "Piilosana multiplayer server" });
  });

  // Liveness — Railway erottaa tämän avulla kuolleen prosessin
  app.get("/health", (req, res) => {
    res.json({ status: "ok", rooms: getRoomsCount() });
  });

  // Readiness — 503 kun palvelin on sammumassa (load balancer ohjaa muualle)
  app.get("/ready", (req, res) => {
    if (isShuttingDown()) {
      res.status(503).json({ status: "draining" });
    } else {
      res.json({ status: "ready" });
    }
  });

  // Tietosuojaseloste — staattinen HTML
  app.get("/privacy", (req, res) => {
    res.send(privacyHtml());
  });
}

// SPA-catch-all: kaikki muut polut tarjoilevat client/dist/index.html:n.
// MUST be called AFTER all other routes.
export function attachSpaCatchAll(app, distDir) {
  app.get("*", (req, res) => {
    res.sendFile(join(distDir, "index.html"));
  });
}

function privacyHtml() {
  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Piilosana — Tietosuojaseloste / Privacy Policy</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0a0a1a;color:#88ccaa;font-family:'Courier New',monospace;padding:24px;max-width:700px;margin:0 auto;line-height:1.8;}
h1{color:#00ff88;font-size:20px;margin-bottom:24px;border-bottom:2px solid #334;padding-bottom:12px;}
h2{color:#ffcc00;font-size:16px;margin:24px 0 8px;}
p{margin-bottom:12px;font-size:14px;}
a{color:#00ff88;}
.lang{color:#556;font-size:12px;margin-bottom:24px;display:block;}
</style>
</head>
<body>
<h1>Piilosana — Tietosuojaseloste</h1>
<span class="lang"><a href="#fi">Suomeksi</a> | <a href="#en">In English</a></span>

<div id="fi">
<h2>1. Rekisterinpitäjä</h2>
<p>Matti Kuokkanen (yksityishenkilö)<br/>Sähköposti: info@piilosana.com</p>

<h2>2. Mitä tietoja keräämme</h2>
<p>Piilosana kerää vain tietoja, jotka ovat välttämättömiä pelin toiminnalle:</p>
<p><strong>Rekisteröityneet käyttäjät:</strong> nimimerkki, sähköpostiosoite (vapaaehtoinen) ja salasanan tiiviste (hash). Emme tallenna salasanaa selkokielisenä.</p>
<p><strong>Google-kirjautuminen:</strong> Google jakaa meille vain nimesi ja sähköpostisi. Emme saa pääsyä Google-tilillesi, salasanaasi tai muihin tietoihisi.</p>
<p><strong>Pelitiedot:</strong> pistetilastot, saavutukset ja ennätykset.</p>
<p><strong>Tekniset tiedot:</strong> IP-osoite palvelimen lokitiedostoissa (normaali palvelintoiminta).</p>

<h2>3. Mihin tietoja käytetään</h2>
<p>Tietoja käytetään ainoastaan pelin toimintaan: kirjautumiseen, tulosten tallentamiseen ja ennätystaulukon ylläpitoon. Emme myy tai jaa tietojasi kolmansille osapuolille.</p>

<h2>4. Tietojen säilytys</h2>
<p>Tiedot säilytetään palvelimella niin kauan kuin tili on aktiivinen. Voit pyytää tilisi ja tietojesi poistamista lähettämällä sähköpostia osoitteeseen info@piilosana.com.</p>

<h2>5. Evästeet</h2>
<p>Piilosana käyttää selaimen paikallista tallennustilaa (localStorage) asetusten ja kirjautumistietojen muistamiseen. Emme käytä seurantaevästeitä.</p>

<h2>6. Muutokset</h2>
<p>Tätä selostetta voidaan päivittää. Viimeksi päivitetty: huhtikuu 2026.</p>
</div>

<hr style="border-color:#334;margin:32px 0;"/>

<div id="en">
<h2>Privacy Policy (English)</h2>

<h2>1. Data Controller</h2>
<p>Matti Kuokkanen (private individual)<br/>Email: info@piilosana.com</p>

<h2>2. What Data We Collect</h2>
<p>Piilosana only collects data necessary for the game to function:</p>
<p><strong>Registered users:</strong> nickname, email address (optional), and a password hash. We never store your password in plain text.</p>
<p><strong>Google Sign-In:</strong> Google only shares your name and email with us. We do not gain access to your Google account, password, or other data.</p>
<p><strong>Game data:</strong> score statistics, achievements, and records.</p>
<p><strong>Technical data:</strong> IP address in server logs (standard server operation).</p>

<h2>3. How We Use Data</h2>
<p>Data is used solely for game functionality: authentication, saving results, and maintaining leaderboards. We do not sell or share your data with third parties.</p>

<h2>4. Data Retention</h2>
<p>Data is stored on the server as long as the account is active. You can request deletion of your account and data by emailing info@piilosana.com.</p>

<h2>5. Cookies</h2>
<p>Piilosana uses browser local storage (localStorage) to remember settings and login. We do not use tracking cookies.</p>

<h2>6. Changes</h2>
<p>This policy may be updated. Last updated: April 2026.</p>
</div>

<p style="margin-top:32px;"><a href="/">← Takaisin peliin / Back to game</a></p>
</body>
</html>`;
}
