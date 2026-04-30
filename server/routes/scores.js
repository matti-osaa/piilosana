// Scores-reitit — Hall of Fame ja päivän tuloslista (REST).
//
// Riippuu vain db.js:n queryista ja words.js:n LANGS-tiedosta.
// Wire up index.js:ssä:  attachScoresRoutes(app);

import {
  getAllHallOfFame,
  getHallOfFame,
  getDailyLeaderboard,
  submitDailyScore,
  submitScore,
} from "../db.js";
import { LANGS } from "../words.js";

export function attachScoresRoutes(app) {
  // Hall of Fame: kaikki kategoriat
  app.get("/api/hall-of-fame", async (req, res) => {
    const lang = req.query.lang || "fi";
    res.json(await getAllHallOfFame(lang));
  });

  // Hall of Fame: yksi kategoria
  app.get("/api/hall-of-fame/:gameMode/:gameTime", async (req, res) => {
    const { gameMode, gameTime } = req.params;
    const lang = req.query.lang || "fi";
    res.json(await getHallOfFame(gameMode, Number(gameTime), lang));
  });

  // Päivän tuloslista: jonkun päivän tulokset
  app.get("/api/daily-scores/:dateStr", async (req, res) => {
    const { dateStr } = req.params;
    const lang = req.query.lang || "fi";
    res.json(await getDailyLeaderboard(dateStr, lang));
  });

  // Päivän tuloslista: lähetä tulos
  app.post("/api/daily-scores", async (req, res) => {
    const { nickname, score, wordsFound, wordsTotal, dateStr, lang } = req.body;
    if (!nickname || nickname.length > 12) {
      return res.status(400).json({ error: "Virheellinen nimimerkki" });
    }
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: "Virheellinen päivämäärä" });
    }
    const safeLang = LANGS[lang] ? lang : "fi";
    const ok = await submitDailyScore({ nickname, score, wordsFound, wordsTotal, dateStr, lang: safeLang });
    if (!ok) return res.status(400).json({ error: "Tulosta ei voitu tallentaa" });
    const top = await getDailyLeaderboard(dateStr, safeLang);
    res.json({ ok: true, top });
  });

  // Hall of Fame: lähetä tulos (yksinpeli)
  app.post("/api/hall-of-fame", async (req, res) => {
    const { nickname, score, wordsFound, wordsTotal, gameMode, gameTime, lang } = req.body;
    if (!nickname || nickname.length > 12) {
      return res.status(400).json({ error: "Virheellinen nimimerkki" });
    }
    const safeLang = LANGS[lang] ? lang : "fi";
    const id = await submitScore({
      nickname, score, wordsFound, wordsTotal,
      gameMode, gameTime, isMulti: false, lang: safeLang,
    });
    if (!id) return res.status(400).json({ error: "Tulosta ei voitu tallentaa" });
    const top = await getHallOfFame(gameMode, gameTime, safeLang);
    res.json({ id, top });
  });
}
