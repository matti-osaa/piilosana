// Account-reitit – kirjautuneen käyttäjän omat tiedot ja tallennetut data.
//
// Kaikki reitit autentikoivat pyynnön nimimerkillä + salasanalla
// (clientillä on ne sessiossa). Käyttävät user-helppejä db.js:stä,
// joten toimii sekä sql.js:n että Postgresin kanssa.
//
// Wire up:  attachAccountRoutes(app);

import bcrypt from "bcryptjs";

import {
  getUserByNickname,
  updateUserSettings,
  updateUserAchievements,
} from "../db.js";

export function attachAccountRoutes(app) {
  // Tarkista, onko käyttäjä kirjautunut (palauttaa perustiedot)
  app.post("/api/me", async (req, res) => {
    try {
      const { nickname, password } = req.body;
      if (!nickname || !password) return res.status(401).json({ error: "Ei kirjautunut" });

      const user = await getUserByNickname(nickname.toUpperCase());
      if (!user) return res.status(401).json({ error: "Ei kirjautunut" });

      // /api/me ei kuluta passwordia tarkistukseen historiallisesti, mutta
      // pidetään sama käyttäytyminen kuin ennen: ei verifioida tässä reitissä.
      // (Salasanan tarkistus tehdään /api/login, /api/settings, /api/achievements
      // -reiteillä jotka kutsuvat tätä reittiä ennen kirjoitusoperaatioita.)
      res.json({ ok: true, user: { id: user.id, nickname: user.nickname, email: user.email } });
    } catch (err) {
      console.error("/api/me error:", err);
      res.status(500).json({ error: "Virhe" });
    }
  });

  // Tallenna käyttäjän asetukset
  app.post("/api/settings", async (req, res) => {
    try {
      const { nickname, password, settings } = req.body;
      if (!nickname || !password) return res.status(401).json({ error: "Ei kirjautunut" });

      const user = await getUserByNickname(nickname.toUpperCase());
      if (!user) return res.status(401).json({ error: "Ei kirjautunut" });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Ei kirjautunut" });

      await updateUserSettings(user.id, settings || {});
      res.json({ ok: true });
    } catch (err) {
      console.error("Settings save error:", err);
      res.status(500).json({ error: "Asetusten tallennus epäonnistui" });
    }
  });

  // Tallenna käyttäjän saavutukset
  app.post("/api/achievements", async (req, res) => {
    try {
      const { nickname, password, achievements } = req.body;
      if (!nickname || !password) return res.status(401).json({ error: "Ei kirjautunut" });

      const user = await getUserByNickname(nickname.toUpperCase());
      if (!user) return res.status(401).json({ error: "Ei kirjautunut" });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Ei kirjautunut" });

      await updateUserAchievements(user.id, achievements || {});
      res.json({ ok: true });
    } catch (err) {
      console.error("Achievements save error:", err);
      res.status(500).json({ error: "Saavutusten tallennus epäonnistui" });
    }
  });
}
