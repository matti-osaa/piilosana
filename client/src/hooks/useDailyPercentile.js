// useDailyPercentile — hookki päivän haasteen prosenttipaikalle.
//
// Lataa /api/daily-scores/:dateStr ja palauttaa kokonaisluvun 0–100
// tai null jos vertailtavia ei ole tarpeeksi.
//
// Käytetään mid-rank-laskentaa: pct = (strictly_less + same/2) / total * 100
// Tämä on tilastotieteen vakiokäytäntö ja antaa oikean tuloksen myös
// pienissä otoksissa (esim. top-pelaaja kahden joukosta saa 75 %).

import { useEffect, useState } from "react";

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
        if (!Array.isArray(data) || data.length < 2) {
          setPercentile(null);
          return;
        }
        const strictlyLess = data.filter((d) => d.score < score).length;
        const sameScore = data.filter((d) => d.score === score).length;
        const pct = Math.round(
          ((strictlyLess + sameScore / 2) / data.length) * 100
        );
        setPercentile(pct);
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
