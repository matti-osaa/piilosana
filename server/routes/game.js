// Game-aiheiset reitit — version, public-game, arena-count, sananvalidointi.
//
// Osa toimivuudesta riippuu in-process tilasta (publicGames Map) joka on
// edelleen index.js:n hallussa. Annetaan se ctx-objektin kautta että
// reittejä ei tarvitse vielä siirtää kerralla.
//
// Wire up:
//   attachGameRoutes(app, {
//     appVersion: APP_VERSION,
//     googleClientId: GOOGLE_CLIENT_ID,
//     getPublicGame,
//     publicGames,
//     findLongWordsOnGrid,
//   });

import { FULL_WORDS_BUF, hasWordInBuf, getLang } from "../words.js";

export function attachGameRoutes(app, ctx) {
  const { appVersion, googleClientId, getPublicGame, publicGames, findLongWordsOnGrid } = ctx;

  // Etsi pitkät sanat (11+ kirjainta) annetulta hex-gridiltä — solo modea varten
  app.post("/api/find-long-words", (req, res) => {
    const { grid, hex } = req.body;
    if (!grid || !Array.isArray(grid) || !FULL_WORDS_BUF) {
      return res.json({ words: [] });
    }
    try {
      const longWords = findLongWordsOnGrid(grid, FULL_WORDS_BUF, !!hex);
      return res.json({ words: [...longWords] });
    } catch (e) {
      return res.json({ words: [] });
    }
  });

  // Validoi yksi sana sanastolla
  app.post("/api/validate-word", (req, res) => {
    const { word } = req.body;
    if (!word || typeof word !== "string" || word.length < 3 || word.length > 30) {
      return res.json({ valid: false });
    }
    const w = word.toLowerCase().trim();
    if (w.length <= 10) {
      const lang = getLang("fi");
      return res.json({ valid: lang.words.has(w) });
    }
    return res.json({ valid: hasWordInBuf(FULL_WORDS_BUF, w) });
  });

  // App-versio — clientit pollaavat tätä havaitakseen deployt
  app.get("/api/version", (req, res) => {
    res.json({ version: appVersion });
  });

  // Public arenan tila (per kieli)
  app.get("/api/public-game", (req, res) => {
    const lang = req.query.lang === "en" ? "en" : "fi";
    const pg = getPublicGame(lang);
    res.json({
      state: pg.state,
      playerCount: pg.players.size,
      timeLeft: pg.timeLeft,
      roundNumber: pg.roundNumber,
    });
  });

  // Google OAuth client ID frontti­käyttöä varten
  app.get("/api/google-client-id", (req, res) => {
    res.json({ clientId: googleClientId || null });
  });

  // Arenassa olevien pelaajien yhteismäärä (alkuvalikon näyttöä varten)
  app.get("/api/arena-count", (req, res) => {
    let total = 0;
    for (const lang of Object.keys(publicGames)) {
      total += publicGames[lang].players.size;
    }
    res.json({ count: total });
  });
}
