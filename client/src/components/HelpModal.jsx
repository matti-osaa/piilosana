// HelpModal — "Näin pelaat" -overlay.
//
// Yksinkertainen modal joka listaa pelin perusasiat: vetäminen, aika,
// pisteytys, kombo, kerroin, kieli, taivutusmuodot, määritelmät.
//
// Kaikki tekstit tulevat t-objektista. Komponentti on puhdas — ei tunne
// state-managementia, vain render + onClose-callback.
//
// Props:
//   S         aktiivinen teema
//   t         käännösten kantaobjekti (käytetään t.howToPlay, t.helpDrag, ...)
//   onClose   sulkukäsittelijä (kutsutaan kun klikataan taustaa tai ✕)

export function HelpModal({ S, t, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#000000cc",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: S.bg,
          border: `3px solid ${S.green}`,
          padding: "20px",
          maxWidth: "440px",
          width: "100%",
          maxHeight: "80vh",
          overflowY: "auto",
          fontFamily: S.font,
          position: "relative",
          borderRadius: S.panelRadius,
          boxShadow: S.panelShadow,
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            fontFamily: S.font,
            fontSize: "16px",
            color: S.green,
            background: "transparent",
            border: `2px solid ${S.green}`,
            width: "32px",
            height: "32px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: S.btnRadius,
          }}
        >
          ✕
        </button>

        <div
          style={{
            fontSize: "14px",
            color: S.green,
            marginBottom: "16px",
          }}
        >
          {t.howToPlay?.toUpperCase()}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            fontSize: "13px",
            color: S.green,
            lineHeight: "1.8",
          }}
        >
          <Row icon="☝" color={S.yellow}>{t.helpDrag}</Row>
          <Row icon="⏱" color={S.yellow}>{t.helpTime}</Row>
          <Row icon="⭐" color={S.yellow}>{t.helpScoring}</Row>
          <Row icon="🔥" color={S.yellow}>{t.helpCombo}</Row>
          <Row icon="✦" color={S.yellow}>{t.helpMultiplier}</Row>
          <Row icon="🌐" color={S.yellow}>{t.helpLang}</Row>
          <Row icon="🔤" color={S.yellow}>{t.helpInflection}</Row>
          {t.helpDefs && (
            <Row icon="💬" color={S.yellow}>{t.helpDefs}</Row>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, color, children }) {
  return (
    <div>
      <span style={{ color }}>{icon}</span> {children}
    </div>
  );
}
