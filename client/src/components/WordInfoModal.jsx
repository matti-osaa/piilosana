// WordInfoModal – "Lue lisää sanoista" -overlay.
//
// Selittää mistä pelin sanavarasto tulee ja mitä lähteitä on käytetty
// kullekin kielelle. Käännökset tulevat t-objektista, lähdemäärät
// langConfig-objektista (LANG_CONFIG App.jsx:ssä).
//
// Props:
//   S         aktiivinen teema
//   t         käännökset (käytetään t.wordInfoTitle, t.wordInfoBody1-3,
//             t.wordInfoSources, t.wordInfoSourceFi/En/Sv)
//   langConfig { fi: { words: Set }, en: ..., sv: ... }
//   onClose   sulkukäsittelijä

export function WordInfoModal({ S, t, langConfig, onClose }) {
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
          maxWidth: "500px",
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

        <div style={{ fontSize: "14px", color: S.green, marginBottom: "16px" }}>
          {t.wordInfoTitle}
        </div>

        <Body color={S.green}>{t.wordInfoBody1}</Body>
        <Body color={S.green}>{t.wordInfoBody2}</Body>
        <Body color={S.green} marginBottom="16px">
          {t.wordInfoBody3}
        </Body>

        <div
          style={{
            fontSize: "13px",
            color: S.green,
            marginBottom: "8px",
            borderTop: `1px solid ${S.border}`,
            paddingTop: "12px",
          }}
        >
          <div style={{ marginBottom: "8px", color: S.yellow }}>
            {t.wordInfoSources}:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <SourceRow
              flag="🇫🇮"
              label={t.wordInfoSourceFi}
              count={langConfig.fi.words.size}
              muted={S.textMuted}
            />
            <SourceRow
              flag="🇬🇧"
              label={t.wordInfoSourceEn}
              count={langConfig.en.words.size}
              muted={S.textMuted}
            />
            <SourceRow
              flag="🇸🇪"
              label={t.wordInfoSourceSv}
              count={langConfig.sv.words.size}
              muted={S.textMuted}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Body({ color, marginBottom = "12px", children }) {
  return (
    <div
      style={{
        fontSize: "13px",
        color,
        lineHeight: "1.8",
        marginBottom,
      }}
    >
      {children}
    </div>
  );
}

function SourceRow({ flag, label, count, muted }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
      }}
    >
      <span>{flag}</span>
      <span style={{ flex: 1, marginLeft: "8px" }}>{label}</span>
      <span style={{ color: muted, marginLeft: "8px" }}>
        {count.toLocaleString()}
      </span>
    </div>
  );
}
