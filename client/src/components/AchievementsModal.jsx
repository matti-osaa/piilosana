// AchievementsModal – saavutuskansion overlay.
//
// Näyttää: edistymispalkki, kaikki saavutukset gridissä (lukitut ja avatut),
// ja statistiikkayhteenveto pohjalla.
//
// Komponentti on puhdas: vanhempi (App.jsx) toimittaa kaikki tarvittavat
// data-objektit propseina ja huolehtii avaamisen/sulkemisen tilan
// hallinnasta. Komponentti renderöi vain.
//
// Props (data):
//   S, lang, t                  konteksti
//   Icon                         teeman ikoni-komponentti
//   achievements                 ACHIEVEMENTS-objekti { id: { icon, color, fi, en, sv, fi_d, ... } }
//   achUnlocked                  { id: timestamp } – milloin avattu
//   achStats                     { totalWords, gamesPlayed, bestScore, bestCombo,
//                                  longestWord, arenaWins }
//
// Props (callbacks):
//   onClose

const STAT_LABELS = {
  fi: {
    wordsFound: "Sanoja löydetty",
    gamesPlayed: "Pelejä pelattu",
    bestScore: "Paras tulos",
    bestCombo: "Paras kombo",
    longestWord: "Pisin sana",
    letters: "kirjainta",
    multiWins: "Moninpelivoitot",
  },
  sv: {
    wordsFound: "Ord hittade",
    gamesPlayed: "Spel spelade",
    bestScore: "Bästa poäng",
    bestCombo: "Bästa kombo",
    longestWord: "Längsta ord",
    letters: "bokstäver",
    multiWins: "Flerspelarvinster",
  },
  en: {
    wordsFound: "Words found",
    gamesPlayed: "Games played",
    bestScore: "Best score",
    bestCombo: "Best combo",
    longestWord: "Longest word",
    letters: "letters",
    multiWins: "Multiplayer wins",
  },
};

export function AchievementsModal({
  S,
  lang,
  t,
  Icon,
  achievements,
  achUnlocked,
  achStats,
  onClose,
}) {
  const labels = STAT_LABELS[lang] || STAT_LABELS.fi;
  const totalCount = Object.keys(achievements).length;
  const unlockedCount = Object.keys(achUnlocked).length;
  const progressPct = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#000000cc",
        zIndex: 150,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "40px 16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "600px",
          background: S.dark,
          border: "2px solid #ffcc00",
          boxShadow:
            S.panelShadow !== "none" ? S.panelShadow : "0 0 30px #ffcc0033",
          borderRadius: S.panelRadius,
          padding: "24px",
          animation: "fadeIn 0.3s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon icon="trophy" color="#ffcc00" size={4} badge={true} />
            <span
              style={{
                fontFamily: S.font,
                fontSize: "20px",
                fontWeight: "700",
                color: "#ffcc00",
              }}
            >
              {t.achievements}
            </span>
          </div>
          <span
            style={{
              fontSize: "15px",
              color: S.textSoft || "#88ccaa",
              fontWeight: "600",
            }}
          >
            {unlockedCount} / {totalCount}
          </span>
          <button
            onClick={onClose}
            style={{
              fontFamily: S.font,
              fontSize: "18px",
              color: S.green,
              background: "transparent",
              border: `2px solid ${S.green}`,
              padding: "6px 14px",
              cursor: "pointer",
              borderRadius: "8px",
            }}
          >
            X
          </button>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: "100%",
            height: "8px",
            background: S.border,
            marginBottom: "20px",
            borderRadius: "4px",
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: "linear-gradient(90deg, #ffcc00, #ff6644)",
              transition: "width 0.5s ease",
              borderRadius: "4px",
            }}
          />
        </div>

        {/* Achievement grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "10px",
          }}
        >
          {Object.entries(achievements).map(([id, ach]) => {
            const unlocked = !!achUnlocked[id];
            return (
              <div
                key={id}
                style={{
                  border: `2px solid ${unlocked ? ach.color + "88" : S.border}`,
                  padding: "14px",
                  textAlign: "center",
                  background: unlocked ? "#ffffff08" : "#00000044",
                  opacity: unlocked ? 1 : 0.5,
                  transition: "all 0.3s",
                  borderRadius: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "8px",
                  }}
                >
                  <Icon
                    icon={ach.icon}
                    color={unlocked ? ach.color : "#444"}
                    size={4}
                    badge={true}
                  />
                </div>
                <div
                  style={{
                    fontSize: "15px",
                    fontWeight: "700",
                    color: unlocked ? ach.color : S.textMuted,
                    marginBottom: "4px",
                    lineHeight: "1.4",
                  }}
                >
                  {ach[lang] || ach.fi}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: unlocked ? S.textSoft || "#88ccaa" : S.textMuted,
                    lineHeight: "1.4",
                  }}
                >
                  {ach[lang + "_d"] || ach.fi_d}
                </div>
                {unlocked && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: S.textMuted,
                      marginTop: "4px",
                    }}
                  >
                    {new Date(achUnlocked[id]).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats summary */}
        <div
          style={{
            marginTop: "20px",
            padding: "14px",
            border: `1px solid ${S.border}`,
            fontSize: "14px",
            color: S.textSoft || "#88ccaa",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            borderRadius: "8px",
          }}
        >
          <div>
            {labels.wordsFound}: <strong>{achStats.totalWords}</strong>
          </div>
          <div>
            {labels.gamesPlayed}: <strong>{achStats.gamesPlayed}</strong>
          </div>
          <div>
            {labels.bestScore}: <strong>{achStats.bestScore}</strong>
          </div>
          <div>
            {labels.bestCombo}: <strong>{achStats.bestCombo}</strong>
          </div>
          <div>
            {labels.longestWord}: <strong>{achStats.longestWord}</strong>{" "}
            {labels.letters}
          </div>
          <div>
            {labels.multiWins}: <strong>{achStats.arenaWins}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
