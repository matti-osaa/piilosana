// Yhteiset paneelityylit pelin jälkeisiin näkymiin.
//
// Idea: jämäkkä 2px värillinen reuna, täysin peittävä tausta (ei haaleaa
// läpikuultoa) ja saman värin tummempi "tarravarjo" oikeassa alakulmassa –
// sama kieli kuin GlossyButtonissa.

// Lisää alfa-arvon hex-väriin; laajentaa myös 3-merkkiset (#334).
export function alpha(hex, aa) {
  if (typeof hex !== "string" || hex[0] !== "#") return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return hex;
  return `#${h}${aa}`;
}

// Iso pääpaneeli (pisteet, voittaja).
export function heroPanel(S, accent) {
  return {
    border: `2px solid ${accent}`,
    background: S.dark,
    borderRadius: "18px",
    boxShadow: `5px 5px 0 ${alpha(accent, "77")}, 0 10px 28px rgba(0,0,0,0.28)`,
    padding: "24px",
  };
}

// Pienempi osio (sanalistat, sijoitukset, ennätykset).
export function sectionPanel(S, accent) {
  return {
    border: `2px solid ${accent}`,
    background: S.dark,
    borderRadius: "14px",
    boxShadow: `4px 4px 0 ${alpha(accent, "55")}`,
    padding: "14px",
  };
}

// Osion otsikko: vahva, väritetty, alleviivattu samalla sävyllä.
export function sectionTitle(accent) {
  return {
    fontSize: "14px",
    fontWeight: "800",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: accent,
    marginBottom: "10px",
    paddingBottom: "6px",
    borderBottom: `2px solid ${alpha(accent, "55")}`,
  };
}

// Sanalaatta.
export function wordChip(color, dim = false) {
  return {
    padding: "2px 6px",
    borderRadius: "5px",
    fontWeight: "600",
    color,
    background: alpha(color, dim ? "14" : "22"),
    border: `1.5px solid ${alpha(color, dim ? "88" : "cc")}`,
  };
}
