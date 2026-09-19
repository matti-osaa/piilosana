// GlossyButton – alkuvalikon "tarranappi".
//
// Muoto: iso pyöristys vasemmassa ylä- ja oikeassa alakulmassa, terävät
// vastakkaiset kulmat (lehtimäinen). Ei reunusta, kiiltävä
// väritäyttö ja tummempi sävy oikeassa alareunassa. Teksti keskitetty,
// leveä kirjainväli (Montserrat 800).
//
// Props:
//   S         teema (S.font)
//   color     { top, bottom, dark }  – täytön yläsävy, alasävy, reunavarjo
//   label     pääteksti
//   subLabel  pienempi teksti labelin alla (valinnainen)
//   badge     pieni pilleri oikeassa yläkulmassa (valinnainen, esim. "12 online")
//   onClick   klikkauskäsittelijä

export const GLOSSY = {
  blue:   { top:"#3fb8f2", bottom:"#0f9be0", dark:"#0a6fb5" },
  green:  { top:"#3fc25e", bottom:"#16a53a", dark:"#0f7a2a" },
  orange: { top:"#ff9a3c", bottom:"#f47a1f", dark:"#e2361c" },
  yellow: { top:"#ffc93c", bottom:"#f5a80f", dark:"#c97a00" },
  red:    { top:"#ff6b6b", bottom:"#e23b3b", dark:"#a81f1f" },
  purple: { top:"#b07cf5", bottom:"#8a4fe0", dark:"#5f2fb0" },
  gray:   { top:"#8d97a8", bottom:"#69748a", dark:"#475066" },
};

// Koot: lg = alkuvalikon iso nappi, md = valikoiden päätoiminnot,
// sm = pienet sivutoiminnot (takaisin, jaa, poistu).
const SIZES = {
  lg: { radius:"40px 6px 40px 6px", pad:"14px 22px 16px 22px", minH:"64px", font:"22px", ls:"4px", inset:6, shadow:"0 6px 16px rgba(0,0,0,0.25)" },
  md: { radius:"26px 5px 26px 5px", pad:"10px 20px 12px 20px", minH:"0",    font:"15px", ls:"2.5px", inset:4, shadow:"0 4px 12px rgba(0,0,0,0.25)" },
  sm: { radius:"18px 4px 18px 4px", pad:"7px 16px 9px 16px",   minH:"0",    font:"12px", ls:"1.5px", inset:3, shadow:"0 3px 8px rgba(0,0,0,0.22)" },
};

export function GlossyButton({ S, color = GLOSSY.blue, label, subLabel, badge, onClick, size = "lg", width = "100%", disabled = false, icon = null, type = "button", style = null }) {
  const Z = SIZES[size] || SIZES.lg;
  const RADIUS = Z.radius;
  if (disabled) color = GLOSSY.gray;
  return (
    <button
      type={type}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: S.font,
        width,
        opacity: disabled ? 0.55 : 1,
        ...(style || {}),
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
        transition: "transform 0.15s, filter 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={(e) => { if (disabled) return; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.filter = "none"; }}
      onMouseDown={(e) => { if (disabled) return; e.currentTarget.style.transform = "translateY(1px) scale(0.99)"; }}
      onMouseUp={(e) => { if (disabled) return; e.currentTarget.style.transform = "translateY(-2px)"; }}
    >
      {/* Valkoinen tarrareunus */}
      <div
        style={{
          borderRadius: RADIUS,
          boxShadow: Z.shadow,
        }}
      >
        {/* Väritäyttö */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: RADIUS,
            background: `linear-gradient(180deg, ${color.top} 0%, ${color.bottom} 100%)`,
            boxShadow: `inset -${Z.inset}px -${Z.inset}px 0 0 ${color.dark}`,
            padding: Z.pad,
            minHeight: Z.minH,
            color: "#ffffff",
          }}
        >
          {/* Pehmeä yläkiilto */}
          <div
            style={{
              position: "absolute",
              left: 0, right: 0, top: 0,
              height: "45%",
              background: "linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0))",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontFamily: "'Montserrat', 'Inter', sans-serif", fontSize: Z.font, fontWeight: "800", letterSpacing: Z.ls, textTransform: "uppercase", textAlign: "center", textShadow: "0 1px 2px rgba(0,0,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              {icon}{label}
            </div>
            {subLabel && (
              <div style={{ fontFamily: "'Montserrat', 'Inter', sans-serif", fontSize: "11px", fontWeight: "700", letterSpacing: "1px", opacity: 0.9, marginTop: "3px", textAlign: "center" }}>
                {subLabel}
              </div>
            )}
          </div>
          {badge && (
            <span style={{ position: "absolute", top: "8px", right: "14px", fontSize: "11px", fontWeight: "700", background: "rgba(255,255,255,0.25)", borderRadius: "8px", padding: "3px 8px", zIndex: 1 }}>
              {badge}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
