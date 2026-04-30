// DayBoxRow — alkuvalikon "Eilinen + Huominen" -rivi.
//
// Visuaalinen komponentti, joka renderöi rinnakkain kaksi pientä päivä-
// laatikkoa: pelattavissa oleva eilinen (vihreä) ja lukittu huominen (beige).
//
// Vanhempi (App.jsx) hoitaa päivämäärien laskennan ja tuloksen haun.
// Komponentin tehtävä on pelkkä renderöinti.
//
// Props:
//   S       aktiivinen teema-objekti (käytetään S.font, S.btnRadius)
//   past    { dateLabel, result, onClick } | null
//             - dateLabel: { weekday, short, ... }
//             - result: { score, ... } tai null jos ei pelattu
//             - onClick: klikkauskäsittelijä (avaa historia tai aloittaa)
//             - JOS past on null, eilinen-laatikkoa ei renderöidä
//               (käytä silloin kun arena ei ulotu eiliseen — esim. päivä 0 tai 1)
//   future  { dateLabel } — pakollinen, näytetään aina lukittuna
//
// Käyttäytymissäännöt:
//   - Eilinen-laatikko on klikattava: aloita peli tai avaa tulokset
//   - Huominen on aina disabled, näyttää lukko-emojin

import { menuColors } from "../menuColors.js";

export function DayBoxRow({ S, past, future }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        width: "100%",
        marginBottom: "12px",
      }}
    >
      {/* Eilinen — pelattavissa, jos olemassa */}
      {past && <PastBox S={S} {...past} />}

      {/* Huominen — aina lukittu */}
      <FutureBox S={S} dateLabel={future.dateLabel} />
    </div>
  );
}

function PastBox({ S, dateLabel, result, onClick }) {
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
        gap: "4px",
        padding: "16px 6px",
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
          fontSize: "15px",
          color: menuColors.pastText,
          textTransform: "capitalize",
          fontWeight: "700",
          opacity: 0.75,
        }}
      >
        {dateLabel.weekday.slice(0, 2)}
      </span>
      <span
        style={{
          fontSize: "22px",
          fontWeight: "800",
          color: menuColors.pastText,
        }}
      >
        {dateLabel.short}
      </span>
      {result ? (
        <span style={{ fontSize: "18px", fontWeight: "800", color: "#49634d" }}>
          {result.score}p
        </span>
      ) : (
        <span style={{ fontSize: "22px", color: "#49634d" }}>▶</span>
      )}
    </button>
  );
}

function FutureBox({ S, dateLabel }) {
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
        gap: "4px",
        padding: "16px 6px",
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
          fontSize: "15px",
          color: menuColors.futureText,
          textTransform: "capitalize",
          fontWeight: "700",
          opacity: 0.75,
        }}
      >
        {dateLabel.weekday.slice(0, 2)}
      </span>
      <span
        style={{
          fontSize: "22px",
          fontWeight: "800",
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
