// useDailyPercentile — hookki, joka palauttaa pelaajan prosenttipaikan
// päivän haasteessa.
//
// Lataa palvelimelta `/api/daily-scores/:dateStr` -datan ja vertailee
// annettuun pisteeseen. Palauttaa kokonaisluvun 0–100 (esim. 73 = "olet
// parempi kuin 73 % muista pelaajista") tai null jos dataa ei vielä ole
// tai dateStr/score ei ole annettu.
//
// Filosofia: "olet top X %" -palaute ilman että näytetään muiden pelaajien
// määrää tai vertaillaan ihmiseltä ihmiselle. Tämä on vertailu jakaumaan,
// ei nimettyihin vastustajiin.
//
// Käyttö:
//   const pct = useDailyPercentile(myScore, "2026-04-30", "fi");
//   if (pct >= 90) sparkle();

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
        if (!Array.isArray(data) || data.length === 0) {
          setPercentile(null);
          return;
        }
        // Prosenttipaikka: kuinka iso osa pelaajista sai pelaajan
        // pistemäärän tai vähemmän. Esim. 100 pelaajaa, sinun pisteesi
        // on parempi kuin 73 muulla → percentile = 73.
        // Jos saat saman kuin moni muu, lasketaan kaikki ≤-tasot
        // mukaan, joten "tied" pelaajat eivät putoa pohjalle.
        const lowerOrEqual = data.filter((d) => d.score <= score).length;
        const pct = Math.round((lowerOrEqual / data.length) * 100);
        // Jos pelaaja itse on ainoa vastaus, percentile = 100. Tämä on
        // matemaattisesti oikein mutta UX:n kannalta epärehellinen
        // (näyttäisi "Top 100 %" yhden pelaajan datassa).
        // Pidetään tulos näytöllä vasta kun datapisteitä on >= 5.
        if (data.length < 5) {
          setPercentile(null);
          return;
        }
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
