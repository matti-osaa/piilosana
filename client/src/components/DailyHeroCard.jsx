// DailyHeroCard — alkuvalikon "Päivän Piilosana" -hero.
//
// Pelin jälkeen näytetään pisteet + percentile-tieri (väri + lyhyt teksti).
// Ei näytetä pelaajamääriä, vain jakaumaan suhteutettu palaute.

import { menuColors } from "../menuColors.js";
import { useDailyPercentile } from "../hooks/useDailyPercentile.js";

const TEXTS = {
  fi: {
    theme: "Teema",
    streak: "päivää putkeen",
    top10: "Top 10 %",
    top25: "Top 25 %",
    aboveAvg: "Yli keskiarvon",
    nearAvg: "Lähellä keskiarvoa",
    belowAvg: "Aloituspisteet",
  },
  sv: {
    theme: "Tema",
    streak: "dagar i rad",
    top10: "Top 10 %",
    top25: "Top 25 %",
    aboveAvg: "Över genomsnittet",
    nearAvg: "Nära genomsnittet",
    belowAvg: "Startpoäng",
  },
  en: {
    theme: "Theme",
    streak: "day streak",
    top10: "Top 10%",
    top25: "Top 25%",
    aboveAvg: "Above average",
    nearAvg: "Near average",
    belowAvg: "Starting score",
  },
};

const PERCENTILE_TIERS = [
  { min: 90, color: "#fff4b8", textKey: "top10", sparkle: true },
  { min: 75, color: "#d8e8a8", textKey: "top25" },
  { min: 50, color: menuColors.dailyAccent, textKey: "aboveAvg" },
  { min: 25, color: "#d9c98c", textKey: "nearAvg" },
  { min: 0, color: "#e6b48a", textKey: "belowAvg" },
];

function tierForPercentile(pct) {
  if (pct == null) return null;
  for (const tier of PERCENTILE_TIERS) {
    if (pct >= tier.min) return tier;
  }
  return null;
}

export function DailyHeroCard({
  lang,
  t,
  S,
  dateStr,
  dateLabel,
  themeName,
  result,
  streak,
  onClick,
}) {
  const txt = TEXTS[lang] || TEXTS.fi;
  const isPlayed = result != null;
  const showStreak = streak?.streak > 1;
  const percentile = useDailyPercentile(
    isPlayed ? result.score : null,
    dateStr,
    lang
  );
  const tier = tierForPercentile(percentile);
  const scoreColor = tier ? tier.color : menuColors.dailyAccent;

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
      <span style={{ fontSize: "20px", color: menuColors.dailyAccent, letterSpacing: "3px", textTransform: "uppercase", fontWeight: "800", textShadow: "0 1px 2px #00000044" }}>
        {t.daily}
      </span>

      <span style={{ fontSize: "15px", color: menuColors.dailyMuted, fontStyle: "italic", fontWeight: "600" }}>
        {txt.theme}: {themeName}
      </span>

      <span style={{ fontSize: "19px", color: menuColors.dailyText, textTransform: "capitalize", fontWeight: "700" }}>
        {dateLabel.weekday} {dateLabel.short}
      </span>

      {isPlayed ? (
        <>
          <span style={{ fontSize: "42px", fontWeight: "800", color: scoreColor, lineHeight: 1, textShadow: "0 1px 2px #00000044", transition: "color 0.3s ease" }}>
            {result.score}
            <span style={{ fontSize: "20px", fontWeight: "400" }}>p</span>
          </span>

          {tier && (
            <span style={{ fontSize: "13px", color: tier.color, fontWeight: "700", letterSpacing: "0.5px", animation: tier.sparkle ? "pulse 2s ease-in-out infinite" : "none" }}>
              {tier.sparkle ? "✨ " : ""}
              {txt[tier.textKey]}
              {tier.sparkle ? " ✨" : ""}
            </span>
          )}

          <span style={{ fontSize: "15px", color: menuColors.dailyMuted, fontWeight: "600" }}>
            {result.wordsFound}/{result.totalWords} {t.dailyWords}
          </span>

          {showStreak && (
            <span style={{ fontSize: "14px", color: "#ff6644", fontWeight: "700" }}>
              🔥 {streak.streak} {txt.streak}
            </span>
          )}
        </>
      ) : (
        <>
          <span style={{ fontSize: "40px", color: menuColors.dailyAccent, marginTop: "2px", textShadow: "0 2px 4px #00000044" }}>
            ▶
          </span>
          <span style={{ fontSize: "14px", color: menuColors.dailyMuted, fontWeight: "600" }}>
            {t.dailyDesc}
          </span>
        </>
      )}
    </button>
  );
}
