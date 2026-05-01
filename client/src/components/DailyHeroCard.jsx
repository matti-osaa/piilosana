// DailyHeroCard – alkuvalikon "Päivän Piilosana" -hero.
//
// Pelin jälkeen näytetään pisteet + percentile-tieri (väri + lyhyt teksti).
// Tier-määrittelyt ja käännökset tulevat hooks/useDailyPercentile-moduulista,
// joka jakaa logiikan myös DailyPopupin kanssa.

import { menuColors } from "../menuColors.js";
import {
  useDailyPercentile,
  tierForPercentile,
  PERCENTILE_TEXTS,
} from "../hooks/useDailyPercentile.js";

const TEXTS = {
  fi: { theme: "Teema", streak: "päivää putkeen", sameForAll: "Kaikille sama ruudukko · vaihtuu päivittäin", startBtn: "ALOITA HAASTE", themeBonus: "🎯 Löydä 2 teemasanaa → +25p bonus!" },
  sv: { theme: "Tema",  streak: "dagar i rad",     sameForAll: "Samma rutnät för alla · byts dagligen",     startBtn: "STARTA UTMANING", themeBonus: "🎯 Hitta 2 temaord → +25p bonus!" },
  en: { theme: "Theme", streak: "day streak",      sameForAll: "Same grid for everyone · changes daily",    startBtn: "START CHALLENGE", themeBonus: "🎯 Find 2 theme words → +25p bonus!" },
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
        gap: "5px",
        padding: "16px 12px 14px",
        border: `2px solid ${menuColors.dailyBorder}`,
        borderRadius: S.panelRadius || "16px",
        cursor: "pointer",
        background: menuColors.dailyBg,
        boxShadow: menuColors.softShadow,
        marginBottom: "6px",
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
      <span style={{ fontSize: "16px", color: menuColors.dailyAccent, letterSpacing: "2.5px", textTransform: "uppercase", fontWeight: "800", textShadow: "0 1px 2px #00000044" }}>
        {t.daily}
      </span>

      <span style={{ fontSize: "12px", color: menuColors.dailyMuted, fontStyle: "italic", fontWeight: "600" }}>
        {txt.theme}: {themeName}
      </span>

      {!isPlayed && (
        <span style={{ fontSize: "10px", color: menuColors.dailyAccent, fontWeight: "600", opacity: 0.85 }}>
          {txt.themeBonus}
        </span>
      )}

      <span style={{ fontSize: "10px", color: menuColors.dailyMuted, opacity: 0.7, fontWeight: "500", letterSpacing: "0.3px" }}>
        {txt.sameForAll}
      </span>

      <span style={{ fontSize: "15px", color: menuColors.dailyText, textTransform: "capitalize", fontWeight: "700", marginTop: "2px" }}>
        {dateLabel.weekday} {dateLabel.short}
      </span>

      {isPlayed ? (
        <>
          <span style={{ fontSize: "34px", fontWeight: "800", color: scoreColor, lineHeight: 1, textShadow: "0 1px 2px #00000044", transition: "color 0.3s ease" }}>
            {result.score}
            <span style={{ fontSize: "17px", fontWeight: "400" }}>p</span>
          </span>

          {tier && (
            <span style={{ fontSize: "12px", color: tier.color, fontWeight: "700", letterSpacing: "0.5px", animation: tier.sparkle ? "pulse 2s ease-in-out infinite" : "none" }}>
              {tier.sparkle ? "✨ " : ""}
              {pctTxt[tier.textKey]}
              {tier.sparkle ? " ✨" : ""}
            </span>
          )}

          <span style={{ fontSize: "12px", color: menuColors.dailyMuted, fontWeight: "600" }}>
            {result.wordsFound}/{result.totalWords} {t.dailyWords}
          </span>

          {showStreak && (
            <span style={{ fontSize: "12px", color: "#ff6644", fontWeight: "700" }}>
              🔥 {streak.streak} {txt.streak}
            </span>
          )}
        </>
      ) : (
        <>
          <span style={{ fontSize: "13px", color: menuColors.dailyMuted, fontWeight: "600" }}>
            {t.dailyDesc}
          </span>
          {/* CTA-nappi (näyttää napilta vaikka koko kortti on klikattava) */}
          <div
            style={{
              marginTop: "4px",
              padding: "8px 18px",
              background: menuColors.dailyAccent,
              color: "#3f5744",
              fontSize: "13px",
              fontWeight: "800",
              letterSpacing: "1px",
              borderRadius: "10px",
              boxShadow: "0 4px 0 #00000033, 0 6px 12px #00000022",
              border: `2px solid ${menuColors.dailyAccent}`,
              textShadow: "0 1px 0 #ffffff66",
            }}
          >
            {txt.startBtn} ⚡ 3 min
          </div>
        </>
      )}
    </button>
  );
}
