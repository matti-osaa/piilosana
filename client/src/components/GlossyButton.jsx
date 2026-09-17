// GlossyButton – alkuvalikon "tarranappi".
//
// Muoto: iso pyöristys vasemmassa ylä- ja oikeassa alakulmassa, terävät
// vastakkaiset kulmat (lehtimäinen). Valkoinen tarrareunus, kiiltävä
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
};

const RADIUS = "40px 6px 40px 6px";

export function GlossyButton({ S, color = GLOSSY.blue, label, subLabel, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        width: "100%",
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        textAlign: "left",
        transition: "transform 0.15s, filter 0.15s",
        WebkitTapHighlightColor: "transparent",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.filter = "none"; }}
      onMouseDown={(e) => { e.currentTarget.style.transform = "translateY(1px) scale(0.99)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; }}
    >
      {/* Valkoinen tarrareunus */}
      <div
        style={{
          background: "#ffffff",
          border: "2px solid #cfd4d8",
          borderRadius: RADIUS,
          padding: "5px",
          boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
        }}
      >
        {/* Väritäyttö */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: RADIUS,
            background: `linear-gradient(180deg, ${color.top} 0%, ${color.bottom} 100%)`,
            boxShadow: `inset -6px -6px 0 0 ${color.dark}`,
            padding: "14px 22px 16px 22px",
            minHeight: "64px",
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
            <div style={{ fontFamily: "'Montserrat', 'Inter', sans-serif", fontSize: "22px", fontWeight: "800", letterSpacing: "4px", textTransform: "uppercase", textAlign: "center", textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>
              {label}
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
