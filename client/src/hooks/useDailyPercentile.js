// useDailyPercentile — percentile-laskennan moduuli päivän haasteelle.
//
// Sisältää:
//   - useDailyPercentile(score, dateStr, lang): hookki joka hakee API:sta
//     päivän leaderboardin ja palauttaa pelaajan prosenttipaikan
//   - computePercentile(score, leaderboard): pure function samasta laskennasta,
//     hyödyllinen kun leaderboard on jo paikallisesti
//   - PERCENTILE_TIERS, tierForPercentile, PERCENTILE_TEXTS:
//     värit ja käännetyt tekstit eri prosenttipaikoille
//
// Käytetään mid-rank-laskentaa: pct = (strictly_less + same/2) / total * 100
// Tämä on tilastotieteen vakiokäytäntö ja antaa oikean tuloksen myös
// pienissä otoksissa (top-pelaaja kahden joukosta saa 75 %).

import { useEffect, useState } from "react";

// ===== Pure laskenta — käytettävissä myös ilman hookkia =====

export function computePercentile(score, leaderboard) {
  if (score == null || !Array.isArray(leaderboard)) return null;
  if (leaderboard.length < 2) return null;
  const strictlyLess = leaderboard.filter((d) => d.score < score).length;
  const sameScore = leaderboard.filter((d) => d.score === score).length;
  return Math.round(
    ((strictlyLess + sameScore / 2) / leaderboard.length) * 100
  );
}

// ===== Hookki — komponentin käyttöön kun leaderboardia ei vielä ole =====

export function useDailyPercentile(score, dateStr, lang) {
  const [percentile, setPercentile] = useState(null);

  useEffect(() => {
    if (score == null || !dateStr) {
      setPercentile(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/daily-scores/${dateStr}?lang=${lang}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setPercentile(computePercentile(score, data));
      })
      .catch(() => {
        if (!cancelled) setPercentile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [score, dateStr, lang]);

  return percentile;
}

// ===== Tier-määrittely — väri ja teksti per prosenttipaikka =====

export const PERCENTILE_TIERS = [
  { min: 90, color: "#fff4b8", textKey: "top10", sparkle: true },
  { min: 75, color: "#d8e8a8", textKey: "top25" },
  { min: 50, color: "#f4e7b2", textKey: "aboveAvg" },
  { min: 25, color: "#d9c98c", textKey: "nearAvg" },
  { min: 0,  color: "#e6b48a", textKey: "belowAvg" },
];

export function tierForPercentile(pct) {
  if (pct == null) return null;
  for (const tier of PERCENTILE_TIERS) {
    if (pct >= tier.min) return tier;
  }
  return null;
}

export const PERCENTILE_TEXTS = {
  fi: {
    top10: "Top 10 %",
    top25: "Top 25 %",
    aboveAvg: "Yli keskiarvon",
    nearAvg: "Lähellä keskiarvoa",
    belowAvg: "Aloituspisteet",
  },
  sv: {
    top10: "Top 10 %",
    top25: "Top 25 %",
    aboveAvg: "Över genomsnittet",
    nearAvg: "Nära genomsnittet",
    belowAvg: "Startpoäng",
  },
  en: {
    top10: "Top 10%",
    top25: "Top 25%",
    aboveAvg: "Above average",
    nearAvg: "Near average",
    belowAvg: "Starting score",
  },
};
