// DailyHeroCard – alkuvalikon "Päivän Piilosana" -hero.
//
// Ympyränmuotoinen nappi, joka erottuu selkeästi valikosta.
// Pelin jälkeen näytetään pisteet + percentile-tieri.

import { menuColors } from "../menuColors.js";
import {
  useDailyPercentile,
  tierForPercentile,
  PERCENTILE_TEXTS,
} from "../hooks/useDailyPercentile.js";

const TEXTS = {
  fi: { theme: "Teema", streak: "päivää putkeen", sameForAll: "Sama ruudukko kaikille", startBtn: "PELAA", themeBonus: "🎯 2 teemasanaa → +25p" },
  sv: { theme: "Tema",  streak: "dagar i rad",     sameForAll: "Samma rutnät för alla",     startBtn: "SPELA", themeBonus: "🎯 2 temaord → +25p" },
  en: { theme: "Theme", streak: "day streak",      sameForAll: "Same grid for everyone",    startBtn: "PLAY", themeBonus: "🎯 2 theme words → +25p" },
};

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
  const pctTxt = PERCENTILE_TEXTS[lang] || PERCENTILE_TEXTS.fi;
  const isPlayed = result != null;
  const showStreak = streak?.streak > 1;
  const percentile = useDailyPercentile(
    isPlayed ? result.score : null,
    dateStr,
    lang
  );
  const tier = tierForPercentile(percentile);
  const scoreColor = tier ? tier.color : menuColors.dailyAccent;

  // Ympyrän koko – riittävän iso jotta sisältö mahtuu
  const circleSize = "clamp(200px, 52vw, 260px)";

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        width: circleSize,
        height: circleSize,
        borderRadius: "50%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        padding: "16px",
        border: `3px solid ${menuColors.dailyBorder}`,
        cursor: "pointer",
        background: menuColors.dailyBg,
        boxShadow: `${menuColors.softShadow}, inset 0 2px 8px rgba(255,255,255,0.12)`,
        position: "relative",
        overflow: "hidden",
        transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        margin: "0 auto",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.04)";
        e.currentTarget.style.boxShadow = `0 12px 36px rgba(0,0,0,0.35), inset 0 2px 8px rgba(255,255,255,0.15)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = `${menuColors.softShadow}, inset 0 2px 8px rgba(255,255,255,0.12)`;
      }}
    >
      {/* Radial highlight */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), transparent 55%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
        {/* Otsikko */}
        <span style={{ fontSize: "14px", color: menuColors.dailyAccent, letterSpacing: "2px", textTransform: "uppercase", fontWeight: "800", textShadow: "0 1px 3px #00000066" }}>
          {t.daily}
        </span>

        {/* Päivämäärä */}
        <span style={{ fontSize: "13px", color: menuColors.dailyText, textTransform: "capitalize", fontWeight: "700" }}>
          {dateLabel.weekday} {dateLabel.short}
        </span>

        {/* Teema */}
        <span style={{ fontSize: "11px", color: menuColors.dailyMuted, fontStyle: "italic", fontWeight: "600" }}>
          {txt.theme}: {themeName}
        </span>

        {isPlayed ? (
          <>
            {/* Pisteet */}
            <span style={{ fontSize: "36px", fontWeight: "800", color: scoreColor, lineHeight: 1, textShadow: "0 2px 6px #00000066", transition: "color 0.3s ease", marginTop: "2px" }}>
              {result.score}
              <span style={{ fontSize: "16px", fontWeight: "400" }}>p</span>
            </span>

            {tier && (
              <span style={{ fontSize: "11px", color: tier.color, fontWeight: "700", letterSpacing: "0.5px", animation: tier.sparkle ? "pulse 2s ease-in-out infinite" : "none" }}>
                {tier.sparkle ? "✨ " : ""}
                {pctTxt[tier.textKey]}
                {tier.sparkle ? " ✨" : ""}
              </span>
            )}

            <span style={{ fontSize: "11px", color: menuColors.dailyMuted, fontWeight: "600" }}>
              {result.wordsFound}/{result.totalWords} {t.dailyWords}
            </span>

            {showStreak && (
              <span style={{ fontSize: "11px", color: "#ff6644", fontWeight: "700" }}>
                🔥 {streak.streak} {txt.streak}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Teemabonus-vihje */}
            <span style={{ fontSize: "9px", color: menuColors.dailyAccent, fontWeight: "600", opacity: 0.9 }}>
              {txt.themeBonus}
            </span>

            {/* CTA */}
            <div
              style={{
                marginTop: "4px",
                padding: "7px 22px",
                background: menuColors.dailyAccent,
                color: "#1b5e20",
                fontSize: "14px",
                fontWeight: "900",
                letterSpacing: "1.5px",
                borderRadius: "20px",
                boxShadow: "0 3px 0 #00000033, 0 4px 10px #00000022",
                textShadow: "0 1px 0 #ffffff44",
              }}
            >
              {txt.startBtn} ⚡
            </div>

            <span style={{ fontSize: "9px", color: menuColors.dailyMuted, opacity: 0.7, fontWeight: "500", marginTop: "1px" }}>
              3 min · {txt.sameForAll}
            </span>
          </>
        )}
      </div>
    </button>
  );
}
