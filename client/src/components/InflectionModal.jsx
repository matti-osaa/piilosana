// InflectionModal – Suomen taivutusmuototaulukko-overlay.
//
// Näyttää 15 sijamuotoa (Nominatiivi-Komitatiivi) yksikön ja monikon
// muodoissa esimerkkisanalla "sametti". Auttaa pelaajaa ymmärtämään,
// miksi peli hyväksyy paljon enemmän muotoja kuin sanan perusmuoto.
//
// Komponentti käyttää lang-propsia oman tekstin kääntämiseen
// ("Sijamuoto" / "Case" / "Kasus" jne).
//
// Props:
//   S, lang
//   onClose

const TEXTS = {
  fi: {
    title: "TAIVUTUSMUODOT",
    example: "Esimerkki: sametti (substantiivi, tyyppi 5-C)",
    case: "Sijamuoto",
    singular: "Yksikkö",
    plural: "Monikko",
    note:
      "Lisäksi jokaiseen muotoon voi liittyä possessiivisuffiksi (-ni, -si, -nsa, -mme, -nne) → yhteensä yli 100 muotoa per sana. Kaikki hyväksytään pelissä!",
    source: "Lähde: Wikisanakirja",
  },
  sv: {
    title: "BÖJNINGSFORMER",
    example: "Exempel: sametti (substantiv, typ 5-C)",
    case: "Kasus",
    singular: "Singular",
    plural: "Plural",
    note:
      "Dessutom kan varje form ha possessivsuffix (-ni, -si, -nsa, -mme, -nne) → totalt över 100 former per ord. Alla godkänns i spelet!",
    source: "Källa: Wiktionary",
  },
  en: {
    title: "INFLECTION FORMS",
    example: "Example: sametti (noun, type 5-C)",
    case: "Case",
    singular: "Singular",
    plural: "Plural",
    note:
      "Each form can also have possessive suffixes (-ni, -si, -nsa, -mme, -nne) → over 100 forms per word. All are accepted in the game!",
    source: "Source: Wiktionary",
  },
};

const FORMS = [
  ["Nominatiivi", "sametti", "sametit"],
  ["Genetiivi", "sametin", "samettien"],
  ["Partitiivi", "samettia", "sametteja"],
  ["Akkusatiivi", "sametti / sametin", "sametit"],
  ["Inessiivi", "sametissa", "sameteissa"],
  ["Elatiivi", "sametista", "sameteista"],
  ["Illatiivi", "samettiin", "sametteihin"],
  ["Adessiivi", "sametilla", "sameteilla"],
  ["Ablatiivi", "sametilta", "sameteilta"],
  ["Allatiivi", "sametille", "sameteille"],
  ["Essiivi", "samettina", "sametteina"],
  ["Translatiivi", "sametiksi", "sameteiksi"],
  ["Abessiivi", "sametitta", "sameteitta"],
  ["Instruktiivi", "–", "samettein"],
  ["Komitatiivi", "–", "sametteine-"],
];

export function InflectionModal({ S, lang, onClose }) {
  const txt = TEXTS[lang] || TEXTS.fi;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "#000000cc",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fadeIn 0.3s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: S.bg,
          border: `3px solid ${S.green}`,
          padding: "24px",
          maxWidth: "520px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          position: "relative",
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
            marginBottom: "4px",
            fontWeight: "bold",
          }}
        >
          {txt.title}
        </div>
        <div
          style={{ fontSize: "12px", color: S.textMuted, marginBottom: "16px" }}
        >
          {txt.example}
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${S.border}` }}>
              <Th color={S.textSoft}>{txt.case}</Th>
              <Th color={S.textSoft}>{txt.singular}</Th>
              <Th color={S.textSoft}>{txt.plural}</Th>
            </tr>
          </thead>
          <tbody>
            {FORMS.map(([c, s, p], i) => (
              <tr
                key={i}
                style={{
                  borderBottom: `1px solid ${S.border}`,
                  background: i % 2 === 0 ? "transparent" : S.dark,
                }}
              >
                <td
                  style={{
                    padding: "5px 8px",
                    color: S.yellow,
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </td>
                <td style={{ padding: "5px 8px", color: S.green }}>{s}</td>
                <td style={{ padding: "5px 8px", color: S.green }}>{p}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: S.textMuted,
            lineHeight: "1.6",
          }}
        >
          {txt.note}
        </div>

        <div style={{ marginTop: "8px", fontSize: "11px", color: S.textMuted }}>
          {txt.source} –{" "}
          <span
            onClick={() =>
              window.open("https://fi.wiktionary.org/wiki/sametti", "_blank")
            }
            style={{
              color: S.green,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            fi.wiktionary.org/wiki/sametti
          </span>
        </div>
      </div>
    </div>
  );
}

function Th({ color, children }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 8px",
        color,
        fontWeight: "bold",
      }}
    >
      {children}
    </th>
  );
}
