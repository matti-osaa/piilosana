// PracticeOptionsModal — kokoruudun overlay, jossa valitaan harjoittelun
// peliaika ja kirjainkertoimet ennen kuin yksinpeli alkaa.
//
// Vanhempi (App.jsx) hoitaa avaamisen/sulkemisen tilan ja peliasetukset
// (gameTime, letterMult). Komponentti on puhdas: se renderöi UI:n ja kutsuu
// callbackeja kun käyttäjä klikkaa.
//
// Props (data):
//   S         aktiivinen teema
//   t         käännösten kantaobjekti
//   lang      "fi" | "sv" | "en" — kirjoitusasun fix (6,7 vs 6.7)
//   Icon      teeman mukainen ikoni-komponentti
//   gameTime  120 | 402 | 0  (sekuntia; 0 = rajaton)
//   letterMult boolean — onko kirjainkertoimet päällä
//
// Props (callbacks):
//   onGameTimeChange(seconds)
//   onLetterMultToggle()
//   onStart()   — käynnistää pelin (App.jsx hoitaa start + sulje)
//   onClose()   — sulje overlay

export function PracticeOptionsModal({
  S,
  t,
  lang,
  Icon,
  gameTime,
  letterMult,
  onGameTimeChange,
  onLetterMultToggle,
  onStart,
  onClose,
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#000000cc",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: S.dark,
          border: `2px solid ${S.green}`,
          borderRadius: S.panelRadius,
          width: "100%",
          maxWidth: "440px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: S.panelShadow,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${S.green}33`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: "14px",
              color: S.green,
              fontFamily: S.font,
              fontWeight: "700",
            }}
          >
            {t.practice}
          </div>
          <button
            onClick={onClose}
            style={{
              fontFamily: S.font,
              fontSize: "16px",
              color: S.textMuted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Sisältö (scrollattava) */}
        <div style={{ padding: "12px 16px", overflowY: "auto", flex: 1 }}>
          {/* Aikavalinta */}
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{ fontSize: "13px", color: S.green, marginBottom: "6px" }}
            >
              {t.time}
            </div>
            <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
              <button
                onClick={() => onGameTimeChange(120)}
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: gameTime === 120 ? S.bg : S.green,
                  background: gameTime === 120 ? S.green : "transparent",
                  border: `2px solid ${S.green}`,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                2 MIN
              </button>
              <button
                onClick={() => onGameTimeChange(402)}
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: gameTime === 402 ? S.bg : S.yellow,
                  background: gameTime === 402 ? S.yellow : "transparent",
                  border: `2px solid ${S.yellow}`,
                  padding: "6px 14px",
                  cursor: "pointer",
                }}
              >
                {lang === "en" ? "6.7" : "6,7"} MIN
              </button>
              <button
                onClick={() => onGameTimeChange(0)}
                style={{
                  fontFamily: S.font,
                  fontSize: "13px",
                  color: gameTime === 0 ? S.bg : "#44ddff",
                  background: gameTime === 0 ? "#44ddff" : "transparent",
                  border: "2px solid #44ddff",
                  padding: "6px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <Icon
                  icon="infinity"
                  color={gameTime === 0 ? S.bg : "#44ddff"}
                  size={1.5}
                />
                {t.unlimited}
              </button>
            </div>
          </div>

          {/* Kirjainkertoimet */}
          <div>
            <button
              onClick={onLetterMultToggle}
              style={{
                fontFamily: S.font,
                fontSize: "13px",
                color: letterMult ? S.bg : S.yellow,
                background: letterMult ? S.yellow : "transparent",
                border: `2px solid ${S.yellow}`,
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              {letterMult ? "✓ " : ""}
              {t.letterMultBtn}
            </button>
          </div>
        </div>

        {/* ALOITA-nappi alalaidassa */}
        <div
          style={{
            padding: "12px 16px 16px",
            borderTop: `1px solid ${S.green}33`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onStart}
            style={{
              fontFamily: S.font,
              fontSize: "16px",
              color: S.bg,
              background: S.green,
              border: "none",
              padding: "14px 32px",
              cursor: "pointer",
              boxShadow:
                S.btnShadow !== "none" ? S.btnShadow : "3px 3px 0 #008844",
              borderRadius: S.btnRadius,
              width: "100%",
              letterSpacing: "2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform =
                S.btnShadow !== "none"
                  ? "translateY(-2px)"
                  : "translate(-2px,-2px)";
              e.currentTarget.style.boxShadow =
                S.btnShadow !== "none"
                  ? "0 6px 20px #00000044"
                  : "5px 5px 0 #008844";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow =
                S.btnShadow !== "none" ? S.btnShadow : "3px 3px 0 #008844";
            }}
          >
            ▶ {t.startGame || "ALOITA"}
          </button>
        </div>
      </div>
    </div>
  );
}
