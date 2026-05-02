// Päävalikon väripaletti.
// Käytetään App.jsx:n modeSelectJSX-komennossa ja kaikissa sieltä irrotetuissa
// alivalikkokomponenteissa (DailyHero, MultiplayerHero, jne).
//
// Värit on valittu niin että ne pysyvät yhtenäisinä eri teemoista riippumatta
// – tämä paletti EI muutu kun käyttäjä vaihtaa pelin värimaailmaa, koska
// alkuvalikon pitää olla visuaalisesti vakaa.

export const menuColors = {
  // Päivän Piilosana – hero (ympyränappi, syvä vihreä → kulta)
  dailyBg: "linear-gradient(145deg,#1b5e20,#2e7d32,#33691e)",
  dailyBorder: "#a8d44a",
  dailyText: "#ffffff",
  dailyMuted: "#c8e6c9",
  dailyAccent: "#ffd740",

  // Daily-ryhmän wrapper
  dailyGroupBg: "transparent",
  dailyGroupBorder: "transparent",

  // Eilinen-laatikko (kirkas vihreä)
  pastBg: "linear-gradient(135deg,#a5d6a7,#81c784)",
  pastBorder: "#66bb6a",
  pastText: "#1b5e20",

  // Huominen-laatikko (lukittu, lämmin)
  futureBg: "linear-gradient(135deg,#fff3e0,#ffe0b2)",
  futureBorder: "#ffb74d",
  futureText: "#e65100",

  // Harjoittelu (kirkas teal)
  practiceBg: "linear-gradient(135deg,#00acc1,#00838f)",
  practiceText: "#ffffff",

  // Moninpeli / Etsi sanoja (kirkas oranssi-punainen)
  arenaBg: "linear-gradient(135deg,#ff7043,#e64a19)",
  arenaBorder: "#bf360c",
  arenaText: "#ffffff",

  // Oma moninpeli (kirkas sininen)
  customBg: "linear-gradient(135deg,#42a5f5,#1565c0)",
  customText: "#ffffff",

  // Pikaohje (kirkas violetti)
  tutorialBg: "linear-gradient(135deg,#ab47bc,#7b1fa2)",
  tutorialText: "#ffffff",

  // Yhteinen varjo
  softShadow: "0 6px 20px rgba(0,0,0,0.25)"
};
