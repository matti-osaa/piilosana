// DailyEndResult — pelin päättymisen jälkeen näkyvä tulosbanneri kun
// pelaaja juuri lopetti päivän haasteen.
//
// Pieni keltainen banneri jossa näkyy päivä, pisteet, percentile-leima
// ja jaa-nappi. Tämä on emotionaalisesti merkittävin paikka näyttää
// tier-leima — pelaaja juuri sai tuloksensa ja näkee heti missä meni.
//
// Props:
//   S, t, lang
//   dateStr        "YYYY-MM-DD" (käytetään percentile-haussa)
//   dateLabel      { weekday, short, ... } — vanhemman dateLabel-tulos
//   result         { score, wordsFound, totalWords }
//   onShare        klikkaus jaa-napille
//   shareMsg       "Kopioitu!"-tyyppinen status tai tyhjä → näyttää default

import {
  useDailyPercentile,
  tierForPercentile,
  PERCENTILE_TEXTS,
} from "../hooks/useDailyPercentile.js";

export function DailyEndResult({
  S,
  t,
  lang,
  dateStr,
  dateLabel,
  result,
  onShare,
  shareMsg,
}) {
  const pctTxt = PERCENTILE_TEXTS[lang] || PERCENTILE_TEXTS.fi;
  const percentile = useDailyPercentile(result?.score, dateStr, lang);
  const tier = tierForPercentile(percentile);
  const yellow = S.yellow || "#ffcc00";
  const wordPct =
    result.totalWords > 0
      ? Math.round((result.wordsFound / result.totalWords) * 100)
      : 0;

  return (
    <div
      style={{
        margin: "12px 0",
        padding: "16px",
        background: `linear-gradient(135deg,${yellow}22,${yellow}11)`,
        border: `2px solid ${yellow}`,
        borderRadius: "14px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "18px",
          fontWeight: "700",
          color: yellow,
          marginBottom: "4px",
        }}
      >
        {t.daily} {dateLabel.short}
      </div>

      <div
        style={{
          fontSize: "24px",
          fontWeight: "800",
          color: tier ? tier.color : S.yellow,
          marginBottom: "4px",
          transition: "color 0.3s ease",
        }}
      >
        {result.score}p
      </div>

      {tier && (
        <div
          style={{
            fontSize: "13px",
            color: tier.color,
            fontWeight: "700",
            letterSpacing: "0.5px",
            marginBottom: "6px",
            animation: tier.sparkle ? "pulse 2s ease-in-out infinite" : "none",
          }}
        >
          {tier.sparkle ? "✨ " : ""}
          {pctTxt[tier.textKey]}
          {tier.sparkle ? " ✨" : ""}
        </div>
      )}

      <div style={{ fontSize: "14px", color: S.green, marginBottom: "8px" }}>
        {result.wordsFound}/{result.totalWords} {t.dailyWords} ({wordPct}%)
      </div>

      <button
        onClick={onShare}
        style={{
          fontFamily: S.font,
          fontSize: "15px",
          color: "#2a2000",
          background: `linear-gradient(135deg,${yellow},#E6B800)`,
          border: "none",
          padding: "10px 24px",
          cursor: "pointer",
          borderRadius: "10px",
          fontWeight: "700",
          boxShadow: `0 4px 12px ${yellow}44`,
        }}
      >
        {shareMsg || t.dailyShare}
      </button>
    </div>
  );
}
