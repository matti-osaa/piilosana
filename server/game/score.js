// Pisteytys – kuinka paljon pisteitä sana antaa pituutensa perusteella.
//
// Kaava on yksinkertainen: 3 kirjainta = 1 p, 4 = 2 p, 5 = 4 p, 6 = 6 p,
// 7 = 10 p, 8+ = 14 p. Pisteet kasvavat eksponentiaalisesti, jotta
// pidempiä sanoja palkitaan suhteellisesti enemmän.

/**
 * Palauttaa pistemäärän sanan pituuden perusteella.
 * @param {number} length - sanan kirjainmäärä
 * @returns {number} - pisteet (0 jos length < 3)
 */
export function getScoreForWordLength(length) {
  if (length < 3) return 0;
  if (length === 3) return 1;
  if (length === 4) return 2;
  if (length === 5) return 4;
  if (length === 6) return 6;
  if (length === 7) return 10;
  return 14;
}

/**
 * Palauttaa pistemäärän sanan perusteella (perustuu pituuteen).
 * @param {string} word - sana
 * @returns {number} - pisteet
 */
export function getScoreForWord(word) {
  if (typeof word !== "string") return 0;
  return getScoreForWordLength(word.length);
}
