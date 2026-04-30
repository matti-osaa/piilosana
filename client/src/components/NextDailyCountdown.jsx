// NextDailyCountdown — pieni laskuri alkuvalikon Daily-kortin alla.
//
// Näkyy vain kun pelaaja on jo pelannut tämän päivän haasteen — ei ole
// järkevää näyttää "seuraava haaste 14 t" jos pelaaja ei ole vielä
// pelannut tätäkään.
//
// Päivittyy joka minuutti, lopussa joka sekunti viimeisen 60 s aikana.
//
// Props:
//   S, lang   konteksti
//   isPlayed  boolean — onko Päivän Piilosana jo pelattu

import { useEffect, useState } from "react";

const TEXTS = {
  fi: {
    label: "Seuraava haaste",
    hours: "t",
    mins: "min",
    secs: "s",
  },
  sv: {
    label: "Nästa utmaning",
    hours: "t",
    mins: "min",
    secs: "s",
  },
  en: {
    label: "Next challenge in",
    hours: "h",
    mins: "m",
    secs: "s",
  },
};

function msUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow - now;
}

export function NextDailyCountdown({ S, lang, isPlayed }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isPlayed) return;
    // Päivitä joka minuutti normaalisti, mutta joka sekunti kun alle 1 min jäljellä
    const update = () => setTick((t) => t + 1);
    const ms = msUntilTomorrow();
    const interval = ms < 60_000 ? 1000 : 30_000;
    const id = setInterval(update, interval);
    return () => clearInterval(id);
  }, [isPlayed, tick]);

  if (!isPlayed) return null;

  const txt = TEXTS[lang] || TEXTS.fi;
  const ms = msUntilTomorrow();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let display;
  if (hours > 0) {
    display = `${hours} ${txt.hours} ${minutes} ${txt.mins}`;
  } else if (minutes > 0) {
    display = `${minutes} ${txt.mins}`;
  } else {
    display = `${seconds} ${txt.secs}`;
  }

  return (
    <div
      style={{
        fontFamily: S.font,
        fontSize: "12px",
        color: S.textMuted,
        textAlign: "center",
        marginTop: "-4px",
        marginBottom: "12px",
        letterSpacing: "0.3px",
        opacity: 0.85,
      }}
    >
      {txt.label} {display}
    </div>
  );
}
