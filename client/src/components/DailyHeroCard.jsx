// DailyHeroCard — alkuvalikon "Päivän Piilosana" -hero.
//
// Visuaalinen komponentti: ei tunne todayStr-/getDailyResult-funktioita,
// vaan saa kaiken laskettuna propseina. Vanhempi (App.jsx) hoitaa IIFE:ssä
// päivämäärän, teeman ja tuloksen laskennan, ja pelkkä onClick-callback
// ratkaisee mitä tapahtuu klikkauksesta.
//
// Props:
//   lang        "fi" | "sv" | "en"
//   t           käännösten kantaobjekti (käytetään t.daily, t.dailyDesc, t.dailyWords)
//   S           aktiivinen teema-objekti (käytetään S.font, S.panelRadius)
//   dateLabel   { weekday, short, ... } — vanhemman dateLabel(d,lang)-tulos
//   themeName   tämän päivän teeman nimi käännettynä
//   result      { score, wordsFound, totalWords } tai null/undefined jos ei pelattu
//   streak      { streak, best, ... } — alle 2:n streakia ei näytetä
//   onClick     klikkauskäsittelijä (esim. avaa historia jos pelattu, muutoin aloita)
//
// Käyttäytymissäännöt:
//   - Pelatun jälkeen näkyy tulos (score + sanat + mahdollinen streak)
//   - Pelaamattomana näkyy play-nuoli + kuvaus
//   - Streak näkyy vain kun > 1 (1 päivä = ei vielä putki)

import { menuColors } from "../menuColors.js";

const TEXTS = {
  fi: { theme: "Teema", streak: "päivää putkeen" },
  sv: { theme: "Tema",  streak: "dagar i rad" },
  en: { theme: "Theme", streak: "day streak" },
};

export function DailyHeroCard({
  lang,
  t,
  S,
  dateLabel,
  themeName,
  result,
  streak,
  onClick,
}) {
  const txt = TEXTS[lang] || TEXTS.fi;
  const isPlayed = result != null;
  const showStreak = streak?.streak > 1;

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "7px",
        padding: "26px 16px 22px",
        border: `2px solid ${menuColors.dailyBorder}`,
        borderRadius: S.panelRadius || "16px",
        cursor: "pointer",
        background: menuColors.dailyBg,
        boxShadow: menuColors.softShadow,
        marginBottom: "10px",
        position: "relative",
        overflow: "hidden",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 14px 36px rgba(57,45,28,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = menuColors.softShadow;
      }}
    >
      {/* Otsikko: PÄIVÄN PIILOSANA */}
      <span
        style={{
          fontSize: "20px",
          color: menuColors.dailyAccent,
          letterSpacing: "3px",
          textTransform: "uppercase",
          fontWeight: "800",
          textShadow: "0 1px 2px #00000044",
        }}
      >
        {t.daily}
      </span>

      {/* Teema */}
      <span
        style={{
          fontSize: "15px",
          color: menuColors.dailyMuted,
          fontStyle: "italic",
          fontWeight: "600",
        }}
      >
        {txt.theme}: {themeName}
      </span>

      {/* Päivämäärä */}
      <span
        style={{
          fontSize: "19px",
          color: menuColors.dailyText,
          textTransform: "capitalize",
          fontWeight: "700",
        }}
      >
        {dateLabel.weekday} {dateLabel.short}
      </span>

      {isPlayed ? (
        <>
          {/* Pisteet */}
          <span
            style={{
              fontSize: "42px",
              fontWeight: "800",
              color: menuColors.dailyAccent,
              lineHeight: 1,
              textShadow: "0 1px 2px #00000044",
            }}
          >
            {result.score}
            <span style={{ fontSize: "20px", fontWeight: "400" }}>p</span>
          </span>

          {/* Sanat / kokonaismäärä */}
          <span
            style={{
              fontSize: "15px",
              color: menuColors.dailyMuted,
              fontWeight: "600",
            }}
          >
            {result.wordsFound}/{result.totalWords} {t.dailyWords}
          </span>

          {/* Putki — vain jos > 1 päivä */}
          {showStreak && (
            <span
              style={{
                fontSize: "14px",
                color: "#ff6644",
                fontWeight: "700",
              }}
            >
              🔥 {streak.streak} {txt.streak}
            </span>
          )}
        </>
      ) : (
        <>
          {/* Play-nuoli */}
          <span
            style={{
              fontSize: "40px",
              color: menuColors.dailyAccent,
              marginTop: "2px",
              textShadow: "0 2px 4px #00000044",
            }}
          >
            ▶
          </span>

          {/* Kuvaus: "sama kaikille · yksi yritys · 3 min" */}
          <span
            style={{
              fontSize: "14px",
              color: menuColors.dailyMuted,
              fontWeight: "600",
            }}
          >
            {t.dailyDesc}
          </span>
        </>
      )}
    </button>
  );
}
