// HamburgerMenu — vasemmalta liukuva sivumenu, joka avautuu hampurilais-
// painikkeesta peliruudussa.
//
// Sisältää: Sound on/off, Music on/off + musiikkivalitsin, teemavalinta,
// kokovalinta, konfetti on/off, emoji-mute (vain multi), Jaa peli (vain
// multi), Poistu pelistä (vain pelin aikana), Sulje menu.
//
// Komponentti on puhdas: kaikki tila tulee propseina, kaikki muutokset
// menevät callbackien kautta. Vanhempi (App.jsx) hoitaa localStorage- ja
// syncSettings-kutsut callbackissa.
//
// Props (data):
//   S, t, lang, Icon              konteksti
//   sound                          boolean — ääni päällä
//   music                          boolean — musiikki päällä
//   musicTrack                     number — valitun raidan indeksi
//   musicTracks                    [{ id, name, nameFi }]
//   theme                          string — valitun teeman id
//   themes                         { id: { bg, border, green, cell, name, nameEn, nameSv } }
//   size                           string — "normal" | "large"
//   confetti                       boolean
//   muteEmojis                     boolean
//
// Props (context flags):
//   inMultiplayer                  näytetäänkö multi-only -optiot
//   inActiveGame                   onko peli käynnissä (vaikuttaa "Exit"-tekstiin)
//   hasMode                        onko mode != null (näytetäänkö Exit lainkaan)
//
// Props (callbacks):
//   onSoundToggle
//   onMusicToggle
//   onMusicTrackChange(index)
//   onThemeChange(id)
//   onSizeChange(id)
//   onConfettiToggle
//   onMuteEmojisToggle
//   onShare
//   onExit
//   onClose

const SIZE_LABELS = [
  ["normal", { fi: "NORMAALI", en: "NORMAL", sv: "NORMAL" }],
  ["large", { fi: "ISO", en: "LARGE", sv: "STOR" }],
];

export function HamburgerMenu({
  S,
  t,
  lang,
  Icon,
  sound,
  music,
  musicTrack,
  musicTracks,
  theme,
  themes,
  size,
  confetti,
  muteEmojis,
  inMultiplayer,
  inActiveGame,
  hasMode,
  onSoundToggle,
  onMusicToggle,
  onMusicTrackChange,
  onThemeChange,
  onSizeChange,
  onConfettiToggle,
  onMuteEmojisToggle,
  onShare,
  onExit,
  onClose,
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#00000088",
        zIndex: 200,
        animation: "fadeIn 0.15s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: "260px",
          background: `${S.dark}f8`,
          borderRight: `1px solid ${S.border}`,
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          animation: "slideInLeft 0.2s ease",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "0 12px 12px 0",
          boxShadow: "4px 0 24px #00000044",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontSize: "12px",
            color: S.textMuted,
            fontFamily: S.font,
            marginBottom: "6px",
            letterSpacing: "2px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span style={{ fontSize: "16px" }}>&#9776;</span>{" "}
          {t.options || "ASETUKSET"}
        </div>
        <Divider color={S.border} />

        {/* Sound */}
        <ToggleRow
          S={S}
          on={sound}
          label={t.menuSound || "SOUNDS"}
          icon={<span style={{ fontSize: "16px" }}>{sound ? "🔊" : "🔇"}</span>}
          tOn={t.on}
          tOff={t.off}
          onClick={onSoundToggle}
        />

        {/* Music */}
        <ToggleRow
          S={S}
          on={music}
          label={t.menuMusic || "MUSIC"}
          icon={
            <Icon
              icon={music ? "musicOn" : "musicOff"}
              color={music ? S.green : S.textMuted}
              size={2}
            />
          }
          tOn={t.on}
          tOff={t.off}
          onClick={onMusicToggle}
        />

        {/* Music track selector */}
        {music && (
          <div
            style={{
              padding: "4px 8px 8px",
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
            }}
          >
            {musicTracks.map((tr, i) => (
              <div
                key={tr.id}
                onClick={() => onMusicTrackChange(i)}
                style={{
                  fontSize: "10px",
                  fontFamily: S.font,
                  padding: "3px 8px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  background: musicTrack === i ? S.green + "33" : "transparent",
                  border: `1px solid ${
                    musicTrack === i ? S.green + "66" : S.border + "44"
                  }`,
                  color:
                    musicTrack === i ? S.green : S.textMuted || "#888",
                  transition: "all 0.15s",
                }}
              >
                {lang === "fi" ? tr.nameFi : tr.name}
              </div>
            ))}
          </div>
        )}

        {/* Theme picker */}
        <div style={{ padding: "8px" }}>
          <SectionLabel S={S}>{t.menuTheme || "THEME"}</SectionLabel>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {Object.entries(themes).map(([id, th]) => (
              <div
                key={id}
                onClick={() => onThemeChange(id)}
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  background: th.bg,
                  border:
                    theme === id
                      ? `3px solid ${S.green}`
                      : `2px solid ${th.border || "#555"}`,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  boxShadow:
                    theme === id
                      ? `0 0 8px ${S.green}66`
                      : "0 1px 4px #00000033",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title={
                  lang === "en"
                    ? th.nameEn || th.name
                    : lang === "sv"
                    ? th.nameSv || th.name
                    : th.name
                }
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: th.green || th.cell,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Grid size */}
        <div style={{ padding: "8px" }}>
          <SectionLabel S={S}>
            {lang === "en" ? "SIZE" : lang === "sv" ? "STORLEK" : "KOKO"}
          </SectionLabel>
          <div style={{ display: "flex", gap: "6px" }}>
            {SIZE_LABELS.map(([id, names]) => (
              <button
                key={id}
                onClick={() => onSizeChange(id)}
                style={{
                  fontFamily: S.font,
                  fontSize: "11px",
                  color: size === id ? S.bg : S.textMuted,
                  background: size === id ? S.green : "transparent",
                  border: `1px solid ${
                    size === id ? S.green : S.textMuted + "44"
                  }`,
                  padding: "4px 10px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  transition: "all 0.15s",
                }}
              >
                {names[lang] || names.en}
              </button>
            ))}
          </div>
        </div>

        {/* Confetti */}
        <ToggleRow
          S={S}
          on={confetti}
          label={
            lang === "en" ? "CONFETTI" : lang === "sv" ? "KONFETTI" : "KONFETTI"
          }
          icon={<span style={{ fontSize: "16px" }}>🎊</span>}
          tOn={t.on}
          tOff={t.off}
          onClick={onConfettiToggle}
        />

        {/* Share — multi/public only */}
        {inMultiplayer && (
          <ActionRow
            S={S}
            icon={<Icon icon="share" color={S.green} size={2} />}
            label={t.menuShare || "INVITE"}
            onClick={onShare}
          />
        )}

        {/* Mute emojis — multi only */}
        {inMultiplayer && (
          <ToggleRow
            S={S}
            on={!muteEmojis}
            label={t.menuMuteEmoji || "MUTE GESTURES"}
            icon={<span style={{ fontSize: "16px" }}>💬</span>}
            tOn={t.on}
            tOff={t.off}
            onClick={onMuteEmojisToggle}
          />
        )}

        <Divider color={S.border} margin="4px 0" />

        {/* Exit — only when in a mode */}
        {hasMode && (
          <div
            onClick={onExit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 8px",
              cursor: "pointer",
              borderRadius: "8px",
              transition: "background 0.15s",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = S.red + "22";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M3 13L13 3"
                stroke={S.red}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: "13px", color: S.red, fontFamily: S.font }}>
              {inActiveGame
                ? t.menuExitGame || "EXIT GAME"
                : t.menu || "VALIKKO"}
            </span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Close menu */}
        <div
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            padding: "10px 8px",
            cursor: "pointer",
            borderRadius: "8px",
            transition: "background 0.15s",
            background: "transparent",
            borderTop: `1px solid ${S.border}`,
            marginTop: "auto",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = S.border + "33")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <span
            style={{ fontSize: "12px", color: S.textMuted, fontFamily: S.font }}
          >
            {t.menuClose || "CLOSE MENU"}
          </span>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ S, on, label, icon, tOn, tOff, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 8px",
        cursor: "pointer",
        borderRadius: "8px",
        transition: "background 0.15s",
        background: "transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = S.border + "33")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        style={{
          fontSize: "13px",
          color: S.textSoft || S.textMuted,
          fontFamily: S.font,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        {icon} {label}
      </span>
      <span
        style={{
          fontSize: "11px",
          fontFamily: S.font,
          color: on ? S.green : S.textMuted,
          background: on ? S.green + "22" : "transparent",
          padding: "2px 8px",
          borderRadius: "4px",
          border: `1px solid ${on ? S.green + "44" : S.textMuted + "44"}`,
        }}
      >
        {on ? tOn || "ON" : tOff || "OFF"}
      </span>
    </div>
  );
}

function ActionRow({ S, icon, label, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 8px",
        cursor: "pointer",
        borderRadius: "8px",
        transition: "background 0.15s",
        background: "transparent",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = S.border + "33")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
      <span
        style={{
          fontSize: "13px",
          color: S.textSoft || S.textMuted,
          fontFamily: S.font,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SectionLabel({ S, children }) {
  return (
    <div
      style={{
        fontSize: "12px",
        color: S.textMuted,
        fontFamily: S.font,
        marginBottom: "8px",
        letterSpacing: "1px",
      }}
    >
      {children}
    </div>
  );
}

function Divider({ color, margin = "0 0 4px 0" }) {
  return <div style={{ height: "1px", background: color, margin }} />;
}
