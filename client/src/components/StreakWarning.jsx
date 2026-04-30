// StreakWarning – pieni lämmin "putki vaarassa" -muistutus alkuvalikossa.
//
// Näkyy vain kun pelaajalla on aktiivinen streak (>= 1) ja hän ei ole
// vielä pelannut tämän päivän haastetta. Tarkoitus: motivoida palaamaan
// ja säilyttämään putki, ilman aggressiivista painostusta.
//
// Sijainti: Daily-kortin yläpuolella, joten pelaaja näkee sen heti
// avatessaan sivun. Klikkaaminen ei tee mitään – käyttäjä klikkaa
// itse Daily-korttia.
//
// Props:
//   S, lang
//   streak     { streak, ... } | null
//   isPlayed   onko Päivän Piilosana jo pelattu tänään

const TEXTS = {
  fi: {
    label: (n) => `${n} päivän putki – pelaa tänään säilyttääksesi sen`,
    starting: "Aloita putki – pelaa tänään",
  },
  sv: {
    label: (n) => `${n} dagars svit – spela idag för att behålla den`,
    starting: "Starta en svit – spela idag",
  },
  en: {
    label: (n) => `${n}-day streak — play today to keep it`,
    starting: "Start a streak — play today",
  },
};

export function StreakWarning({ S, lang, streak, isPlayed }) {
  // Näytä vain jos: ei pelattu vielä, on aktiivinen putki
  if (isPlayed) return null;
  if (!streak || !streak.streak || streak.streak < 1) return null;

  const txt = TEXTS[lang] || TEXTS.fi;
  const message =
    streak.streak >= 2 ? txt.label(streak.streak) : txt.starting;

  return (
    <div
      style={{
        fontFamily: S.font,
        width: "100%",
        marginBottom: "10px",
        padding: "10px 14px",
        background: "linear-gradient(135deg,#e6b48a22,#d9826122)",
        border: "1px solid #d9826166",
        borderRadius: "12px",
        textAlign: "center",
        fontSize: "13px",
        fontWeight: "600",
        color: "#a94831",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        animation: "fadeIn 0.5s ease",
      }}
    >
      <span style={{ fontSize: "16px" }}>🔥</span>
      <span>{message}</span>
    </div>
  );
}
