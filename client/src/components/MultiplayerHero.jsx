// MultiplayerHero — alkuvalikon iso "MONINPELI" -kortti.
//
// Visuaalinen komponentti: ei tunne sounds-/socket-/setMode-logiikkaa.
// Vanhempi (App.jsx) antaa onClick-callbackin, joka hoitaa siirtymisen
// public-moodiin.
//
// Props:
//   lang              "fi" | "sv" | "en"
//   S                 aktiivinen teema-objekti (käytetään S.font, S.panelRadius)
//   publicOnlineCount Online-pelaajien lukumäärä arenassa
//   onClick           Klikkauskäsittelijä — hoitaa siirtymän
//
// Käyttäytymissäännöt:
//   - LIVE-merkki ja "X pelaajaa nyt" näkyvät vain kun count > 1
//   - CTA-teksti vaihtuu: "ALOITA PELI" jos tyhjä, "LIITY PELIIN" jos pelaajia
//   - Ei valehdella: ei näytetä keksittyjä lukuja kun arena on tyhjä

import { menuColors } from "../menuColors.js";

const TEXTS = {
  fi: {
    aria: "Liity moninpeliin",
    title: "MONINPELI",
    desc: "Nopea sanahaaste — pelaa muita vastaan",
    players: "pelaajaa nyt",
    ctaJoin: "LIITY PELIIN ⚡",
    ctaStart: "ALOITA PELI ⚡",
  },
  sv: {
    aria: "Gå med i flerspelare",
    title: "FLERSPEL",
    desc: "Snabb ordutmaning — spela mot andra",
    players: "spelare nu",
    ctaJoin: "GÅ MED ⚡",
    ctaStart: "STARTA SPEL ⚡",
  },
  en: {
    aria: "Join multiplayer",
    title: "MULTIPLAYER",
    desc: "Quick word challenge — play against others",
    players: "players now",
    ctaJoin: "JOIN GAME ⚡",
    ctaStart: "START GAME ⚡",
  },
};

export function MultiplayerHero({ lang, S, publicOnlineCount, onClick }) {
  const txt = TEXTS[lang] || TEXTS.fi;
  const hasPlayers = publicOnlineCount > 1;

  return (
    <button
      aria-label={txt.aria}
      onClick={onClick}
      style={{
        fontFamily: S.font,
        width: "100%",
        minHeight: "170px",
        border: `2px solid ${menuColors.arenaBorder}`,
        borderRadius: S.panelRadius || "16px",
        padding: "22px 20px",
        marginBottom: "12px",
        cursor: "pointer",
        textAlign: "left",
        position: "relative",
        overflow: "hidden",
        color: menuColors.arenaText,
        background: menuColors.arenaBg,
        boxShadow: menuColors.softShadow,
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 14px 32px rgba(57,45,28,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = menuColors.softShadow;
      }}
    >
      {/* Lämmin highlight oikealla */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 80% 45%, rgba(255,220,150,0.32), transparent 42%)",
          pointerEvents: "none",
        }}
      />

      {/* Minimalistinen geometrinen koriste — sisäkkäiset ympyrät oikeassa alanurkassa */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "-30px",
          bottom: "-30px",
          width: "160px",
          height: "160px",
          border: "2px solid rgba(255,255,255,0.10)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "10px",
          bottom: "10px",
          width: "80px",
          height: "80px",
          border: "2px solid rgba(255,255,255,0.16)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: "40px",
          bottom: "40px",
          width: "20px",
          height: "20px",
          background: "rgba(255,255,255,0.22)",
          borderRadius: "50%",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* LIVE-badge — vain kun pelaajia oikeasti on */}
        {hasPlayers && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              background: "#fff8ec",
              color: "#d63c2f",
              borderRadius: "8px",
              padding: "5px 10px",
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: "1px",
              marginBottom: "14px",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#d63c2f",
                animation: "pulse 1.5s infinite",
              }}
            />
            LIVE
          </div>
        )}

        {/* Otsikko */}
        <div
          style={{
            fontSize: "30px",
            fontWeight: "900",
            letterSpacing: "1.5px",
            marginBottom: "6px",
            lineHeight: 1,
          }}
        >
          {txt.title}
        </div>

        {/* Kuvaus */}
        <div
          style={{
            fontSize: "14px",
            fontWeight: "600",
            lineHeight: 1.3,
            maxWidth: "260px",
            marginBottom: "16px",
            opacity: 0.92,
          }}
        >
          {txt.desc}
        </div>

        {/* Pelaajamäärä-badge — vain jos pelaajia on */}
        {hasPlayers && (
          <div style={{ marginBottom: "10px" }}>
            <span
              style={{
                display: "inline-block",
                background: "rgba(80,20,15,0.32)",
                borderRadius: "999px",
                padding: "5px 12px",
                fontSize: "12px",
                fontWeight: "700",
              }}
            >
              {publicOnlineCount} {txt.players}
            </span>
          </div>
        )}

        {/* CTA */}
        <div
          style={{
            display: "inline-block",
            background: "#ffe38a",
            color: "#3d2c14",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: "900",
            letterSpacing: "0.5px",
            boxShadow: "0 3px 0 rgba(100,60,20,0.35)",
          }}
        >
          {hasPlayers ? txt.ctaJoin : txt.ctaStart}
        </div>
      </div>
    </button>
  );
}
