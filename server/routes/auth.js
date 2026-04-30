// Auth-reitit — rekisteröinti, kirjautuminen, salasanan nollaus & vaihto,
// Google Sign-In. Riippuu user-helpeistä db.js:stä jotta tukee sekä sql.js:ää
// että Postgresia ilman raakoja kyselyitä.
//
// Wire up:
//   attachAuthRoutes(app, {
//     resend,                 // optional Resend-instanssi (tai null)
//     googleClient,           // optional OAuth2Client (tai null)
//     googleClientId,         // optional string
//     resendFrom,             // 'from'-osoite, fallback hard-coded
//   });

import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";

import {
  getUserByNickname,
  getUserByEmail,
  getUserById,
  getUserByGoogleId,
  createUser,
  updateUserPassword,
  linkGoogleId,
} from "../db.js";

const DEFAULT_FROM = "Piilosana <onboarding@resend.dev>";

function parseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    email: user.email,
    settings: parseJson(user.settings),
    achievements: parseJson(user.achievements),
  };
}

export function attachAuthRoutes(app, ctx = {}) {
  const { resend = null, googleClient = null, googleClientId = null } = ctx;
  const fromAddr = ctx.resendFrom || process.env.RESEND_FROM || DEFAULT_FROM;

  // Rate limiter — sama 20 pyyntöä / 15 min / IP kuin ennen
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: "Liian monta yritystä. Odota hetki." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api/login", authLimiter);
  app.use("/api/register", authLimiter);
  app.use("/api/forgot-password", authLimiter);

  // Rekisteröi uusi käyttäjä
  app.post("/api/register", async (req, res) => {
    try {
      const { nickname, password, email, email2 } = req.body;
      if (!nickname || !password) return res.status(400).json({ error: "Nimimerkki ja salasana vaaditaan" });
      if (nickname.length > 12) return res.status(400).json({ error: "Nimimerkki max 12 merkkiä" });
      if (password.length < 4) return res.status(400).json({ error: "Salasana min 4 merkkiä" });
      if (email && email.length > 0 && email !== email2) {
        return res.status(400).json({ error: "Sähköpostit eivät täsmää" });
      }

      const upperNick = nickname.toUpperCase();
      const existing = await getUserByNickname(upperNick);
      if (existing) return res.status(409).json({ error: "Nimimerkki on jo käytössä" });

      const password_hash = await bcrypt.hash(password, 10);
      const safeEmail = email && email.trim().length > 0 ? email.trim().toLowerCase() : null;

      const userId = await createUser({
        nickname: upperNick,
        password_hash,
        email: safeEmail,
      });

      // Tervetuloa-viesti jos sähköposti annettu ja Resend käytössä
      if (safeEmail && resend) {
        try {
          await resend.emails.send({
            from: fromAddr,
            to: safeEmail,
            subject: "Piilosana — tunnuksesi",
            html: `
              <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
                <h2 style="color:#ffcc00;">Tervetuloa Piilosanaan!</h2>
                <p>Nimimerkkisi: <strong>${upperNick}</strong></p>
                <p>Tilisi on luotu onnistuneesti. Pelaa osoitteessa piilosana.up.railway.app</p>
                <p style="color:#556;margin-top:20px;font-size:12px;">Jos unohdat salasanasi, voit nollata sen pelin kirjautumissivulta.</p>
              </div>
            `,
          });
          console.log(`Welcome email sent to ${safeEmail} for user ${upperNick}`);
        } catch (emailErr) {
          console.error("Failed to send email:", emailErr);
          // Älä epäonnistu rekisteröintiä jos meili epäonnistuu
        }
      }

      res.json({ ok: true, user: { id: userId, nickname: upperNick, email: safeEmail } });
    } catch (err) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Rekisteröinti epäonnistui" });
    }
  });

  // Kirjaudu sisään
  app.post("/api/login", async (req, res) => {
    try {
      const { nickname, password } = req.body;
      if (!nickname || !password) return res.status(400).json({ error: "Nimimerkki ja salasana vaaditaan" });

      const user = await getUserByNickname(nickname.toUpperCase());
      if (!user) return res.status(401).json({ error: "Väärä nimimerkki tai salasana" });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: "Väärä nimimerkki tai salasana" });

      res.json({ ok: true, user: publicUser(user) });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Kirjautuminen epäonnistui" });
    }
  });

  // Salasanan unohtaminen — generoi uusi ja lähetä sähköpostiin
  app.post("/api/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Sähköposti vaaditaan" });

      const user = await getUserByEmail(email.trim().toLowerCase());
      if (!user) {
        // Älä paljasta onko email rekisteröity
        return res.json({ ok: true, message: "Jos sähköposti löytyy, uusi salasana lähetetään." });
      }

      if (!resend) {
        return res.status(500).json({ error: "Sähköpostipalvelu ei ole käytössä" });
      }

      // Generoi satunnainen salasana (8 merkkiä)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
      let newPassword = "";
      for (let i = 0; i < 8; i++) newPassword += chars[Math.floor(Math.random() * chars.length)];

      const password_hash = await bcrypt.hash(newPassword, 10);
      await updateUserPassword(user.id, password_hash);

      await resend.emails.send({
        from: fromAddr,
        to: user.email,
        subject: "Piilosana — uusi salasana",
        html: `
          <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
            <h2 style="color:#ffcc00;">Uusi salasana</h2>
            <p>Nimimerkkisi: <strong>${user.nickname}</strong></p>
            <p>Uusi salasanasi: <strong>${newPassword}</strong></p>
            <p style="color:#556;margin-top:20px;font-size:12px;">Kirjaudu osoitteessa piilosana.app</p>
          </div>
        `,
      });

      console.log(`Password reset email sent to ${user.email} for user ${user.nickname}`);
      res.json({ ok: true, message: "Uusi salasana lähetetty sähköpostiin!" });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ error: "Salasanan nollaus epäonnistui" });
    }
  });

  // Vaihda salasana (vaatii nykyisen)
  app.post("/api/change-password", async (req, res) => {
    try {
      const { nickname, currentPassword, newPassword } = req.body;
      if (!nickname || !currentPassword || !newPassword) return res.status(400).json({ error: "Kaikki kentät vaaditaan" });
      if (newPassword.length < 4) return res.status(400).json({ error: "Uusi salasana min 4 merkkiä" });

      const user = await getUserByNickname(nickname.toUpperCase());
      if (!user) return res.status(401).json({ error: "Käyttäjää ei löydy" });

      const match = await bcrypt.compare(currentPassword, user.password_hash);
      if (!match) return res.status(401).json({ error: "Nykyinen salasana on väärin" });

      const newHash = await bcrypt.hash(newPassword, 10);
      await updateUserPassword(user.id, newHash);

      // Vahvistus sähköpostiin jos käytettävissä
      if (user.email && resend) {
        try {
          await resend.emails.send({
            from: fromAddr,
            to: user.email,
            subject: "Piilosana — salasana vaihdettu",
            html: `
              <div style="font-family:monospace;background:#0a0a1a;color:#00ff88;padding:30px;border-radius:8px;">
                <h2 style="color:#ffcc00;">Salasana vaihdettu</h2>
                <p>Nimimerkkisi: <strong>${user.nickname}</strong></p>
                <p>Salasanasi on vaihdettu onnistuneesti.</p>
                <p style="color:#ff4444;margin-top:10px;font-size:12px;">Jos et vaihtanut salasanaasi, ota yhteyttä ylläpitoon.</p>
              </div>
            `,
          });
        } catch (emailErr) {
          console.error("Failed to send password change email:", emailErr);
        }
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("Change password error:", err);
      res.status(500).json({ error: "Salasanan vaihto epäonnistui" });
    }
  });

  // Google Sign-In
  app.post("/api/google-login", async (req, res) => {
    try {
      if (!googleClient) return res.status(500).json({ error: "Google-kirjautuminen ei ole käytössä" });
      const { credential } = req.body;
      if (!credential) return res.status(400).json({ error: "Token puuttuu" });

      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: googleClientId,
      });
      const payload = ticket.getPayload();
      const googleId = payload.sub;
      const email = payload.email;
      const name = payload.name || (payload.email ? payload.email.split("@")[0] : "PELAAJA");

      // 1) Onko käyttäjä jo google_id:llä?
      const byGoogle = await getUserByGoogleId(googleId);
      if (byGoogle) {
        return res.json({ ok: true, user: publicUser(byGoogle), isNew: false });
      }

      // 2) Onko käyttäjä samalla emailillä? Linkitä Google-tunnus
      if (email) {
        const byEmail = await getUserByEmail(email.toLowerCase());
        if (byEmail) {
          await linkGoogleId(byEmail.id, googleId);
          const updated = await getUserById(byEmail.id);
          return res.json({ ok: true, user: publicUser(updated), isNew: false });
        }
      }

      // 3) Luo uusi käyttäjä Googlella
      const baseNick = (name || "PELAAJA").toUpperCase().replace(/[^A-ZÄÖÅ0-9]/g, "").slice(0, 12) || "PELAAJA";
      let finalNick = baseNick;
      let counter = 1;
      // Varmista uniikki nimimerkki
      // (Pieni race-condition mahdollisuus mutta käytännössä ei ongelma)
      while (await getUserByNickname(finalNick)) {
        finalNick = baseNick.slice(0, 9) + counter;
        counter++;
        if (counter > 999) break; // safety net
      }

      const dummyHash = await bcrypt.hash(Math.random().toString(36), 10);
      const newId = await createUser({
        nickname: finalNick,
        password_hash: dummyHash,
        email: email ? email.toLowerCase() : null,
        google_id: googleId,
      });

      res.json({ ok: true, user: { id: newId, nickname: finalNick, email: email ? email.toLowerCase() : null }, isNew: true });
    } catch (err) {
      console.error("Google login error:", err);
      res.status(500).json({ error: "Google-kirjautuminen epäonnistui" });
    }
  });
}
