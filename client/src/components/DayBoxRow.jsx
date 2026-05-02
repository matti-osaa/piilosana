// DayBoxRow – alkuvalikon "Eilinen + Huominen" -rivi.
//
// Visuaalinen komponentti, joka renderöi rinnakkain kaksi pientä päivä-
// laatikkoa: pelattavissa oleva eilinen (vihreä) ja lukittu huominen (beige).
//
// Vanhempi (App.jsx) hoitaa päivämäärien laskennan ja tuloksen haun.
// Komponentin tehtävä on pelkkä renderöinti.
//
// Props:
//   S       aktiivinen teema-objekti (käytetään S.font, S.btnRadius)
//   lang    "fi" | "en" | "sv" – otsikkojen kieli
//   past    { dateLabel, result, onClick } | null
//             - dateLabel: { weekday, short, ... }
//             - result: { score, ... } tai null jos ei pelattu
//             - onClick: klikkauskäsittelijä (avaa historia tai aloittaa)
//             - JOS past on null, eilinen-laatikkoa ei renderöidä
//               (käytä silloin kun arena ei ulotu eiliseen – esim. päivä 0 tai 1)
//   future  { dateLabel } – pakollinen, näytetään aina lukittuna
//
// Käyttäytymissäännöt:
//   - Eilinen-laatikko on klikattava: aloita peli tai avaa tulokset
//   - Huominen on aina disabled, näyttää lukko-emojin

import { menuColors } from "../menuColors.js";

const TEXTS = {
  fi: { yesterday: "EILINEN", tomorrow: "HUOMINEN" },
  en: { yesterday: "YESTERDAY", tomorrow: "TOMORROW" },
  sv: { yesterday: "IGÅR", tomorrow: "IMORGON" },
};

export function DayBoxRow({ S, lang = "fi", past, future }) {
  const txt = TEXTS[lang] || TEXTS.fi;
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        width: "100%",
        marginBottom: "6px",
      }}
    >
      {/* Eilinen – pelattavissa, jos olemassa */}
      {past && <PastBox S={S} title={txt.yesterday} {...past} />}

      {/* Huominen – aina lukittu */}
      <FutureBox S={S} title={txt.tomorrow} dateLabel={future.dateLabel} />
    </div>
  );
}

function PastBox({ S, title, dateLabel, result, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: S.font,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        padding: "10px 6px",
        border: `2px solid ${menuColors.pastBorder}`,
        borderRadius: S.btnRadius,
        cursor: "pointer",
        background: menuColors.pastBg,
        color: menuColors.pastText,
        fontSize: "14px",
        minWidth: 0,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = menuColors.softShadow;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        style={{
          fontSize: "11px",
          color: menuColors.pastText,
          fontWeight: "800",
          letterSpacing: "1px",
          opacity: 0.85,
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: "16px",
          fontWeight: "700",
          color: menuColors.pastText,
        }}
      >
        {dateLabel.short}
      </span>
      {result ? (
        <span style={{ fontSize: "15px", fontWeight: "800", color: menuColors.pastText }}>
          {result.score}p
        </span>
      ) : (
        <span style={{ fontSize: "22px", color: menuColors.pastText }}>▶</span>
      )}
    </button>
  );
}

function FutureBox({ S, title, dateLabel }) {
  return (
    <button
      disabled
      style={{
        fontFamily: S.font,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
        padding: "10px 6px",
        border: `2px dashed ${menuColors.futureBorder}`,
        borderRadius: S.btnRadius,
        cursor: "default",
        background: menuColors.futureBg,
        color: menuColors.futureText,
        fontSize: "14px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "11px",
          color: menuColors.futureText,
          fontWeight: "800",
          letterSpacing: "1px",
          opacity: 0.85,
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: "16px",
          fontWeight: "700",
          color: menuColors.futureText,
        }}
      >
        {dateLabel.short}
      </span>
      <span
        style={{ fontSize: "20px", color: menuColors.futureText, opacity: 0.65 }}
      >
        🔒
      </span>
    </button>
  );
}
