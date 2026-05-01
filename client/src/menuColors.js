// Päävalikon väripaletti.
// Käytetään App.jsx:n modeSelectJSX-komennossa ja kaikissa sieltä irrotetuissa
// alivalikkokomponenteissa (DailyHero, MultiplayerHero, jne).
//
// Värit on valittu niin että ne pysyvät yhtenäisinä eri teemoista riippumatta
// – tämä paletti EI muutu kun käyttäjä vaihtaa pelin värimaailmaa, koska
// alkuvalikon pitää olla visuaalisesti vakaa.

export const menuColors = {
  // Päivän Piilosana – hero
  dailyBg: "linear-gradient(135deg,#49634d,#3f5744)",
  dailyBorder: "#7f8a4b",
  dailyText: "#fff8ec",
  dailyMuted: "#e8dfcf",
  dailyAccent: "#f4e7b2",

  // Daily-ryhmän wrapper (yhdistää hero + päivärivi visuaalisesti)
  dailyGroupBg: "rgba(243, 236, 220, 0.55)",
  dailyGroupBorder: "rgba(127, 138, 75, 0.25)",

  // Eilinen-laatikko (sage green, kevyt)
  pastBg: "linear-gradient(135deg,#dfe7d8,#d2dccb)",
  pastBorder: "#aeb99b",
  pastText: "#314733",

  // Huominen-laatikko (lukittu, lämmin beige)
  futureBg: "linear-gradient(135deg,#f7f1e7,#efe7d8)",
  futureBorder: "#c9b99d",
  futureText: "#8b7a5c",

  // Harjoittelu (tumma sage)
  practiceBg: "linear-gradient(135deg,#6f9d8d,#558779)",
  practiceText: "#fff8ec",

  // Moninpeli / Etsi sanoja (lämmin terrakotta)
  arenaBg: "linear-gradient(135deg,#d98261,#c45b3b)",
  arenaBorder: "#a94831",
  arenaText: "#fff8ec",

  // Oma moninpeli (sumeansininen)
  customBg: "linear-gradient(135deg,#7fa4b0,#658d9a)",
  customText: "#fff8ec",

  // Pikaohje (vaaleanvioletti)
  tutorialBg: "linear-gradient(135deg,#9a829d,#816b86)",
  tutorialText: "#fff8ec",

  // Yhteinen pehmeä varjo kaikille korteille
  softShadow: "0 10px 26px rgba(57,45,28,0.18)"
};
