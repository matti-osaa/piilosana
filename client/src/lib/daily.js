// daily.js – siirretty App.jsx:stä (vaihe 1a). Päivän piilosana: siemenet, teemat, tulokset, putki ja päivämääräapurit.
import { makeGrid } from "./wordEngine.js";

// Seeded PRNG for daily challenge — mulberry32
function seededRng(seed){let t=seed|0;return()=>{t=t+0x6D2B79F5|0;let x=Math.imul(t^(t>>>15),1|t);x^=x+Math.imul(x^(x>>>7),61|x);return((x^(x>>>14))>>>0)/4294967296;};}
function dailySeed(dateStr){let h=0;for(let i=0;i<dateStr.length;i++){h=Math.imul(31,h)+dateStr.charCodeAt(i)|0;}return h;}
// Daily challenge number: days since 2026-04-27
const DAILY_EPOCH=new Date('2026-04-27').getTime();
function dailyNumber(){return Math.floor((Date.now()-DAILY_EPOCH)/(1000*60*60*24))+1;}
function todayStr(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Helsinki'});}
function makeDailyGrid(lang='fi'){const rng=seededRng(dailySeed(todayStr()+lang));return makeGrid(7,lang,5,rng);}

// ============================================
// DAILY THEMES — themed word lists for daily challenge
// ============================================
const DAILY_THEMES={
  fi:[
    {id:"luonto",name:"Luonto",nameEn:"Nature",nameSv:"Natur",words:["metsä","puu","lehti","kukka","joki","järvi","vuori","kivi","sammal","sieni","oksa","juuri","pilvi","sade","tuuli","lumi","jää","ruoho","niitty","taivas","aurinko","kuu","tähti","maa","vesi"]},
    {id:"eläimet",name:"Eläimet",nameEn:"Animals",nameSv:"Djur",words:["koira","kissa","lintu","kala","karhu","kettu","hirvi","jänis","orava","susi","kotka","pöllö","hevonen","lammas","lehmä","sika","ankka","kana","hiiri","käärme","sammakko","mehiläinen","perhonen"]},
    {id:"ruoka",name:"Ruoka",nameEn:"Food",nameSv:"Mat",words:["leipä","juusto","kakku","keitto","liha","kala","peruna","porkkana","omena","marja","suola","sokeri","maito","voi","muna","riisi","pasta","salaatti","piirakka","lettu","puuro","mehu","kahvi"]},
    {id:"koti",name:"Koti",nameEn:"Home",nameSv:"Hem",words:["tuoli","pöytä","sänky","ikkuna","ovi","lattia","katto","seinä","lamppu","matto","peili","kirja","kello","tyyny","peitto","lasi","kuppi","lusikka","haarukka","veitsi","astia","hylly"]},
    {id:"urheilu",name:"Urheilu",nameEn:"Sports",nameSv:"Sport",words:["pallo","maali","juoksu","hyppy","uinti","hiihto","luistelu","pyörä","joukkue","peli","ottelu","kenttä","tuomari","voitto","häviö","piste","sarja","harjoitus","valmentaja"]},
    {id:"meri",name:"Meri",nameEn:"Sea",nameSv:"Hav",words:["aalto","ranta","laiva","vene","saari","kala","lohi","rapu","simpukka","ankkuri","purje","satama","majakka","hiekka","tuuli","myrsky","valas","hylje","lokki","sumu"]},
    {id:"musiikki",name:"Musiikki",nameEn:"Music",nameSv:"Musik",words:["laulu","soitto","kitara","piano","rumpu","huilu","viulu","nuotti","melodia","rytmi","basso","sävelmä","kuoro","säveltäjä","konsertti","levy","radio","ääni"]},
    {id:"sää",name:"Sää",nameEn:"Weather",nameSv:"Väder",words:["aurinko","pilvi","sade","lumi","tuuli","myrsky","ukkonen","salama","sumu","halla","pakkanen","lämpö","jää","raekuuro","sateenkaari","kostea","kuiva"]},
    {id:"kaupunki",name:"Kaupunki",nameEn:"City",nameSv:"Stad",words:["talo","katu","silta","puisto","kauppa","koulu","kirjasto","museo","teatteri","ravintola","hotelli","kirkko","torni","asema","bussi","auto","pyörä","valo","penkki"]},
    {id:"avaruus",name:"Avaruus",nameEn:"Space",nameSv:"Rymd",words:["tähti","kuu","aurinko","planeetta","galaksi","raketti","astronautti","satelliitti","meteori","kometta","avaruus","musta","aukko","valo","pimeä","rata"]},
    {id:"puutarha",name:"Puutarha",nameEn:"Garden",nameSv:"Trädgård",words:["kukka","ruusu","puu","pensas","nurmikko","siemen","multa","kastelukanne","kukkula","omena","marja","tomaatti","kurkku","salaatti","peruna","porkkana","herne","papu"]},
    {id:"juhla",name:"Juhla",nameEn:"Party",nameSv:"Fest",words:["kakku","lahja","koriste","ilmapallo","valo","musiikki","tanssi","nauru","ystävä","perhe","juhla","kutsu","tarjoilu","juoma","konfetti","serpentiini","hattu"]},
    {id:"värit",name:"Värit",nameEn:"Colors",nameSv:"Färger",words:["punainen","sininen","vihreä","keltainen","valkoinen","musta","oranssi","violetti","ruskea","harmaa","pinkki","turkoosi","kulta","hopea","vaaleanpunainen"]},
    {id:"ammatti",name:"Ammatit",nameEn:"Professions",nameSv:"Yrken",words:["lääkäri","opettaja","kokki","poliisi","palomies","insinööri","taiteilija","muusikko","kirjailija","maanviljelijä","kauppias","sähköasentaja","putkimies"]},
    {id:"talvi",name:"Talvi",nameEn:"Winter",nameSv:"Vinter",words:["lumi","jää","pakkanen","hanki","hiihto","luistelu","pulkka","latu","suksi","lumiukko","joulu","kynttilä","takka","viltti","kaakao","pipari"]},
    {id:"kesä",name:"Kesä",nameEn:"Summer",nameSv:"Sommar",words:["aurinko","uiminen","ranta","loma","grilli","mökki","sauna","vene","kalastus","marjastus","pyöräily","jäätelö","lämmin","yötön","helle","uimaranta"]},
  ],
  en:[
    {id:"nature",name:"Nature",words:["tree","leaf","river","lake","mountain","rock","moss","cloud","rain","wind","snow","ice","grass","sky","sun","moon","star","earth","water","flower","root","branch"]},
    {id:"animals",name:"Animals",words:["dog","cat","bird","fish","bear","fox","deer","rabbit","wolf","eagle","owl","horse","sheep","cow","pig","duck","hen","mouse","snake","frog","bee"]},
    {id:"food",name:"Food",words:["bread","cheese","cake","soup","meat","fish","potato","carrot","apple","berry","salt","sugar","milk","butter","egg","rice","pasta","salad","pie","juice","coffee"]},
    {id:"home",name:"Home",words:["chair","table","bed","window","door","floor","roof","wall","lamp","rug","mirror","book","clock","pillow","glass","cup","spoon","fork","knife","shelf"]},
    {id:"sea",name:"Sea",words:["wave","beach","ship","boat","island","fish","crab","shell","anchor","sail","port","sand","wind","storm","whale","seal","gull","fog","reef","tide"]},
    {id:"city",name:"City",words:["house","street","bridge","park","shop","school","museum","hotel","church","tower","bus","car","bike","light","bench","road","train","sign","cafe"]},
    {id:"space",name:"Space",words:["star","moon","sun","planet","galaxy","rocket","orbit","comet","meteor","light","dark","void","ring","dust","probe","mars","venus"]},
    {id:"winter",name:"Winter",words:["snow","ice","frost","ski","sled","scarf","mitten","fire","candle","cocoa","cold","chill","storm","flake","icicle"]},
    {id:"summer",name:"Summer",words:["sun","swim","beach","camp","grill","cabin","boat","fish","berry","bike","warm","heat","lake","shade","wave","sand"]},
  ],
  sv:[
    {id:"natur",name:"Natur",words:["träd","löv","flod","sjö","berg","sten","moln","regn","vind","snö","is","gräs","himmel","sol","måne","stjärna","jord","vatten","blomma","rot"]},
    {id:"djur",name:"Djur",words:["hund","katt","fågel","fisk","björn","räv","älg","hare","varg","örn","uggla","häst","får","ko","gris","anka","höna","mus","orm","groda","bi"]},
    {id:"mat",name:"Mat",words:["bröd","ost","kaka","soppa","kött","fisk","potatis","morot","äpple","bär","salt","socker","mjölk","smör","ägg","ris","pasta","sallad","paj","juice","kaffe"]},
  ]
};

function getDailyTheme(dateStr,lang){
  const themes=DAILY_THEMES[lang]||DAILY_THEMES.fi;
  const rng=seededRng(dailySeed(dateStr+"theme"));
  return themes[Math.floor(rng()*themes.length)];
}

// Count how many theme words (or their inflections) are findable in a hex grid.
// Käyttää prefiksi-matchausta – jos teemasana on "kissa", taivutukset
// "kissan", "kissoja", "kissalla" lasketaan myös. Stem-pituus = 4 tai
// sanan koko pituus jos lyhyempi (esim. "puu" → "puu", löytää "puuta").
function countThemeWords(foundWords,theme){
  if(!theme||!theme.words)return 0;
  const stems=theme.words.map(w=>w.slice(0,Math.min(4,w.length)));
  const seen=new Set();
  for(const w of foundWords){
    for(const stem of stems){
      if(w.startsWith(stem)&&!seen.has(stem)){seen.add(stem);break;}
    }
  }
  return seen.size;
}
// Check if a single word matches any theme word (stem-based).
// Returns the matched stem or null.
function isThemeWord(word,theme){
  if(!theme||!theme.words)return null;
  for(const tw of theme.words){
    const stem=tw.slice(0,Math.min(4,tw.length));
    if(word.startsWith(stem))return stem;
  }
  return null;
}
const DAILY_THEME_BONUS=25; // bonus points when finding 2+ theme words
const DAILY_THEME_THRESHOLD=2; // how many theme words needed for bonus
function getDailyResult(lang='fi'){try{const d=JSON.parse(localStorage.getItem(`piilosana_daily_${lang}`)||'{}');if(d.date===todayStr())return d;return null;}catch{return null;}}
function saveDailyResult(score,wordsFound,totalWords,forDate,lang='fi'){
  const d=forDate||todayStr();
  const result={date:d,num:dailyNumberForDate(d),score,wordsFound,totalWords,lang};
  if(d===todayStr())localStorage.setItem(`piilosana_daily_${lang}`,JSON.stringify(result));
  // Save to history (last 14 days, no duplicates)
  try{let hist=JSON.parse(localStorage.getItem(`piilosana_daily_history_${lang}`)||'[]');
  hist=hist.filter(h=>h.date!==d);hist.unshift(result);
  localStorage.setItem(`piilosana_daily_history_${lang}`,JSON.stringify(hist.slice(0,14)));}catch{}
}
function getDailyHistory(lang='fi'){try{return JSON.parse(localStorage.getItem(`piilosana_daily_history_${lang}`)||'[]');}catch{return [];}}
function getDailyResultForDate(dateStr,lang='fi'){const hist=getDailyHistory(lang);return hist.find(h=>h.date===dateStr)||null;}
function getDailyStreak(lang='fi'){try{const s=JSON.parse(localStorage.getItem(`piilosana_streak_${lang}`)||'{}');return s;}catch{return{};}}
function updateDailyStreak(lang='fi'){const s=getDailyStreak(lang);const today=todayStr();const yesterday=daysAgoStr(1);if(s.lastDate===today)return s;const streak=(s.lastDate===yesterday)?(s.streak||0)+1:1;const best=Math.max(streak,s.best||0);const result={streak,best,lastDate:today};localStorage.setItem(`piilosana_streak_${lang}`,JSON.stringify(result));return result;}
// Date helpers for daily challenge UI
const WEEKDAYS_FI=["sunnuntai","maanantai","tiistai","keskiviikko","torstai","perjantai","lauantai"];
const WEEKDAYS_EN=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WEEKDAYS_SV=["söndag","måndag","tisdag","onsdag","torsdag","fredag","lördag"];
function dateLabel(dateStr,lang='fi'){
  const d=new Date(dateStr+"T12:00:00");
  const wd=lang==="sv"?WEEKDAYS_SV:lang==="en"?WEEKDAYS_EN:WEEKDAYS_FI;
  return{weekday:wd[d.getDay()],short:d.getDate()+"."+(d.getMonth()+1)+".",full:wd[d.getDay()]+" "+d.getDate()+"."+(d.getMonth()+1)+"."};
}
function dailyNumberForDate(dateStr){return Math.floor((new Date(dateStr+"T12:00:00").getTime()-DAILY_EPOCH)/(1000*60*60*24))+1;}
function daysAgoStr(n){const d=new Date(Date.now()-n*86400000);return d.toLocaleDateString('sv-SE',{timeZone:'Europe/Helsinki'});}
function tomorrowStr(){return daysAgoStr(-1);}

export { seededRng, dailySeed, DAILY_EPOCH, dailyNumber, todayStr, makeDailyGrid, DAILY_THEMES, getDailyTheme, countThemeWords, isThemeWord, DAILY_THEME_BONUS, DAILY_THEME_THRESHOLD, getDailyResult, saveDailyResult, getDailyHistory, getDailyResultForDate, getDailyStreak, updateDailyStreak, WEEKDAYS_FI, WEEKDAYS_EN, WEEKDAYS_SV, dateLabel, dailyNumberForDate, daysAgoStr, tomorrowStr };
