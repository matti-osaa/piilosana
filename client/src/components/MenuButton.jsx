// MenuButton – yleinen alkuvalikon CTA-nappi.
//
// Käytetään HARJOITTELU-, OMA MONINPELI- ja PIKAOHJE-napeissa. Kaikilla
// on sama hover- ja varjokäyttäytyminen, vain värit, koko ja sisältö
// vaihtuvat.
//
// Kaksi muunnelmaa:
//   - Iso (`compact = false`): isompi padding, isompi fontti, label + subLabel
//     pinottuna pystyyn. Käytetään pääCTA-rivissä.
//   - Kompakti (`compact = true`): pienempi padding, label vaakaan ?-ikonin
//     kanssa. Käytetään apunapeissa kuten Pikaohje.
//
// Props:
//   S          aktiivinen teema (käytetään S.font, S.btnRadius)
//   bg         taustagradientti (esim. menuColors.practiceBg)
//   text       tekstin väri (esim. menuColors.practiceText)
//   label      pääteksti (lihava)
//   subLabel   valinnainen pienempi teksti label-rivin alla (vain isossa)
//   icon       valinnainen merkki/ikoni vasemmalla (vain kompaktissa)
//   compact    boolean – käytetäänkö pientä versiota
//   onClick    klikkauskäsittelijä

import { menuColors } from "../menuColors.js";

export function MenuButton({
  S,
  bg,
  text,
  label,
  subLabel,
  icon,
  compact = false,
  onClick,
}) {
  const padding = compact ? "8px 12px" : "18px 12px";
  const fontSize = compact ? "12px" : "16px";
  const baseOpacity = compact ? 0.92 : 1;

  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        fontSize,
        color: text,
        background: bg,
        border: "1px solid rgba(255,255,255,0.35)",
        padding,
        cursor: "pointer",
        boxShadow: menuColors.softShadow,
        borderRadius: S.btnRadius,
        flex: 1,
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? "6px" : "4px",
        transition: "all 0.2s",
        opacity: baseOpacity,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = compact
          ? "translateY(-1px)"
          : "translateY(-2px)";
        e.currentTarget.style.boxShadow = compact
          ? menuColors.softShadow
          : "0 14px 30px rgba(57,45,28,0.25)";
        e.currentTarget.style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = menuColors.softShadow;
        e.currentTarget.style.opacity = String(baseOpacity);
      }}
    >
      {icon && (
        <span style={{ fontSize: "14px", lineHeight: 1 }}>{icon}</span>
      )}
      <span style={{ fontWeight: "700" }}>{label}</span>
      {subLabel && !compact && (
        <span style={{ fontSize: "11px", opacity: 0.8 }}>{subLabel}</span>
      )}
    </button>
  );
}
