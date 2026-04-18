import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as Tone from "tone";
import { io } from "socket.io-client";

// ============================================
// PIILOSANA - Finnish Word Hunt Game
// ============================================

const VERSION = "2.1.0";
const SERVER_URL = window.location.origin;

import WORDS_RAW_FI from "./words.js";
import WORDS_RAW_EN from "./words_en.js";
import WORDS_RAW_SV from "./words_sv.js";

class TrieNode{constructor(){this.c={};this.w=false;}}
function buildTrie(words){const root=new TrieNode();for(const word of words){let n=root;for(const ch of word){if(!n.c[ch])n.c[ch]=new TrieNode();n=n.c[ch];}n.w=true;}return root;}

// Per-language configuration
const LANG_CONFIG={
  fi:{
    words:null, trie:null,
    lw:{a:120,i:108,t:87,n:88,e:80,s:79,l:58,o:53,k:51,u:51,"ä":37,m:33,v:25,r:29,j:20,h:19,y:19,p:18,d:10,"ö":4},
    letterValues:{a:1,i:1,n:1,s:1,t:1,e:1,l:2,o:2,k:2,u:4,"ä":2,m:3,v:4,r:2,j:4,h:4,y:4,p:4,d:7,"ö":7},
    flag:"🇫🇮", name:"Suomi", code:"fi",
  },
  en:{
    words:null, trie:null,
    lw:{e:127,t:91,a:82,o:75,i:70,n:67,s:63,h:61,r:60,d:43,l:40,c:28,u:28,m:24,w:24,f:22,g:20,y:20,p:19,b:15,v:10,k:8,j:2,x:2,q:1,z:1},
    letterValues:{e:1,a:1,i:1,o:1,n:1,r:1,t:1,l:1,s:1,u:1,d:2,g:2,b:3,c:3,m:3,p:3,f:4,h:4,v:4,w:4,y:4,k:5,j:8,x:8,q:10,z:10},
    flag:"🇬🇧", name:"English", code:"en",
  },
  sv:{
    words:null, trie:null,
    lw:{a:93,e:100,n:82,r:84,s:63,t:76,i:58,l:52,d:45,k:32,o:41,g:33,m:35,v:24,h:21,f:20,u:18,p:17,b:15,"ä":15,"ö":13,c:13,y:7,"å":13,j:7,x:2,z:1,w:1,q:1},
    letterValues:{a:1,e:1,n:1,r:1,s:1,t:1,d:1,i:1,l:1,o:2,g:2,k:2,m:2,h:3,b:3,f:3,u:3,v:3,p:4,c:4,y:4,"ä":4,"å":4,"ö":4,j:7,x:8,z:10,w:10,q:10},
    flag:"🇸🇪", name:"Svenska", code:"sv",
  },
};
// Build word sets + tries
LANG_CONFIG.fi.words=new Set(WORDS_RAW_FI.split("|"));
LANG_CONFIG.fi.trie=buildTrie(LANG_CONFIG.fi.words);
LANG_CONFIG.en.words=new Set(WORDS_RAW_EN.split("|"));
LANG_CONFIG.en.trie=buildTrie(LANG_CONFIG.en.words);
LANG_CONFIG.sv.words=new Set(WORDS_RAW_SV.split("|"));
LANG_CONFIG.sv.trie=buildTrie(LANG_CONFIG.sv.words);

function getLangConf(lang){return LANG_CONFIG[lang]||LANG_CONFIG.fi;}

function randLetterLang(lang){
  const lw=getLangConf(lang).lw;
  const ls=Object.keys(lw),ws=Object.values(lw),tot=ws.reduce((a,b)=>a+b,0);
  let r=Math.random()*tot;for(let i=0;i<ls.length;i++){r-=ws[i];if(r<=0)return ls[i];}return ls[ls.length-1];
}
function makeGrid(sz,lang='fi'){return Array.from({length:sz},()=>Array.from({length:sz},()=>randLetterLang(lang)));}

// Client-side gravity: remove cells, drop letters down, fill new from top
function applyGravityClient(grid,removedCells,lang='fi'){
  const sz=grid.length;
  const ng=grid.map(row=>[...row]);
  for(const{r,c}of removedCells)ng[r][c]=null;
  for(let c=0;c<sz;c++){
    const letters=[];
    for(let r=sz-1;r>=0;r--){if(ng[r][c]!==null)letters.push(ng[r][c]);}
    for(let r=sz-1;r>=0;r--){
      const idx=sz-1-r;
      ng[r][c]=idx<letters.length?letters[idx]:randLetterLang(lang);
    }
  }
  return ng;
}

// UI translations
const T={
  fi:{
    selectMode:"VALITSE PELIMUOTO",arena:"AREENA",arenaDesc:"24/7 nettipeli",customGame:"OMA NETTIPELI",customDesc:"eri moodeja",practice:"HARJOITUS",practiceDesc:"yksinpeli",
    findWords:"Etsi sanoja ruudukosta!",dragHint:"VEDÄ kirjaimien yli kaikkiin suuntiin. Aikaa 2 min.",comboHint:"Löydä sanoja nopeasti putkeen = kombo ja lisäpisteet!",
    scoring:"PISTEYTYS: 3kir=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"KOMBO x2 (3+) · KOMBO x3 (5+)",words:"sanaa",
    nickname:"NIMIMERKKI",join:"LIITY",back:"TAKAISIN",exit:"POISTU",play:"PELAA",
    arenaJoinDesc:"Jatkuva peli kaikille! Liity mukaan ja etsi sanoja. Kierros kestää 2 min.",
    nextRound:"Seuraava kierros alkaa",playersInArena:"pelaajaa areenalla",players:"pelaajaa",
    getReady:"VALMISTAUDU",roundOver:"KIERROS PÄÄTTYI",yourScore:"PISTEESI",nextRoundIn:"Seuraava kierros",starts:"alkaa!",
    roundResults:"KIERROKSEN TULOKSET",foundWords:"LÖYDETYT SANAT",ownHighlighted:"Omat sanasi korostettu väreillä",
    missed:"JÄIVÄT LÖYTÄMÄTTÄ",
    gameMode:"PELIMUOTO",classic:"KLASSINEN",battle:"TAISTELU",battleDesc:"Sanat näkyvät muille! Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä.",
    time:"AIKA",unlimited:"RAJATON",unlimitedDesc:"Ei aikarajaa! Vaihda ruudukko kun haluat.",
    letterMult:"PISTEYTYS",letterMultBtn:"KIRJAINARVOT",letterMultDesc:"Harvinaiset kirjaimet = enemmän pisteitä! (D,Ö=7 V,J,H,Y,P,U=4 ...)",
    otherOptions:"MUUT VALINNAT",nickForHof:"NIMIMERKKI (ennätystauluun)",optional:"VAPAAEHTOINEN",scoresSaved:"Pisteesi tallennetaan nimellä",
    modeNormal:"NORMAALI",modeTetris:"TETRIS",tetrisDesc:"Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä!",
    waiting:"ODOTETAAN PELAAJIA",playersCount:"PELAAJAT",youTag:"SINÄ",createGame:"LUO PELI",connecting:"YHDISTETÄÄN...",
    startGame:"ALOITA PELI",waitForPlayers:"Odota, että joku liittyy peliisi...",waitForHost:"Odota, että isäntä aloittaa pelin...",
    joinGame:"LIITY PELIIN",roomCode:"HUONEKOODI",noRooms:"Ei avoimia huoneita",orJoinRoom:"tai liity koodilla",
    newCustom:"UUSI OMA NETTIPELI",menu:"VALIKKO",newPractice:"UUSI HARJOITUS",
    results:"TULOKSET",score:"PISTEET",gameOver:"PELI PÄÄTTYI!",youWon:"VOITIT!",
    found:"LÖYDETYT",foundOf:"LÖYSIT",dragWords:"Vedä kirjaimista sanoja...",
    notValid:"Ei kelpaa",alreadyFound:"Jo löydetty",
    arenaLabel:"AREENA",battleLabel:"TAISTELU",tetrisLabel:"TETRIS",unlimitedLabel:"RAJATON",letterMultLabel:"KIRJAINARVOT",
    newLetters:"UUDET KIRJAIMET",stop:"LOPETA",
    saveAs:"TALLENNA NIMELLÄ",save:"TALLENNA",saved:"✓ Tallennettu!",saveToHof:"TALLENNA ENNÄTYSTAULULLE",
    gameStarts:"PELI ALKAA",battleStarts:"TAISTELU ALKAA",tetrisStarts:"TETRIS ALKAA",comboStreak:"putkeen!",
    megaCombo:"MEGA KOMBO",combo:"KOMBO",online:"online",
    openGames:"AVOIMET PELIT",roomFull:"Huone on täynnä",gameInProgress:"Peli on jo käynnissä",roomNotFound:"Huonetta ei löydy",
    someoneBeatYou:"Joku ehti ensin!",tooShort:"Liian lyhyt",notInGrid:"Ei löydy ruudukosta",wrongMode:"Väärä moodi",gameNotRunning:"Peli ei käynnissä",
    achievements:"SAAVUTUKSET",achievementUnlocked:"Uusi saavutus!",locked:"Lukittu",
    share:"JAA TULOS",shareCopied:"Kopioitu!",shareText:"Piilosana — löysin {words} sanaa ja sain {score} pistettä! Pääsetkö parempaan?",
    options:"ASETUKSET",quickPlay:"PELAA",or:"tai",advancedOptions:"Lisävalinnat",
    readMoreWords:"Lue lisää sanoista",
    wordInfoTitle:"SANALISTASTA",
    wordInfoBody1:"Sanalistassa on perusmuotoja, taivutuksia, yhdyssanoja, erisnimiä ja lyhenteitä.",
    wordInfoBody2:"Suomen kielelle sanoja on paljon, koska suomen rikas taivutusjärjestelmä tuottaa saman sanan monessa muodossa (esim. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"Lyhenteet kuten SDP, NATO tai EU ovat mukana pienaakkosina.",
    wordInfoSources:"Lähteet",
    wordInfoSourceFi:"Kotus — Kotimaisten kielten keskus (nykysuomen sanalista)",
    wordInfoSourceEn:"SOWPODS / Collins Scrabble Words",
    wordInfoSourceSv:"SAOL — Svenska Akademiens ordlista",
  },
  en:{
    selectMode:"SELECT GAME MODE",arena:"ARENA",arenaDesc:"24/7 online game",customGame:"CUSTOM GAME",customDesc:"various modes",practice:"PRACTICE",practiceDesc:"solo play",
    findWords:"Find words from the grid!",dragHint:"DRAG across letters in all directions. 2 min timer.",comboHint:"Find words quickly in a row = combo and bonus points!",
    scoring:"SCORING: 3let=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"COMBO x2 (3+) · COMBO x3 (5+)",words:"words",
    nickname:"NICKNAME",join:"JOIN",back:"BACK",exit:"EXIT",play:"PLAY",
    arenaJoinDesc:"Continuous game for everyone! Join in and find words. Round lasts 2 min.",
    nextRound:"Next round starts",playersInArena:"players in arena",players:"players",
    getReady:"GET READY",roundOver:"ROUND OVER",yourScore:"YOUR SCORE",nextRoundIn:"Next round",starts:"starting!",
    roundResults:"ROUND RESULTS",foundWords:"FOUND WORDS",ownHighlighted:"Your words highlighted in color",
    missed:"NOT FOUND",
    gameMode:"GAME MODE",classic:"CLASSIC",battle:"BATTLE",battleDesc:"Words visible to others! Found letters disappear and new ones drop from above.",
    time:"TIME",unlimited:"UNLIMITED",unlimitedDesc:"No time limit! Change grid whenever you want.",
    letterMult:"SCORING",letterMultBtn:"LETTER VALUES",letterMultDesc:"Rare letters = more points! (Q,Z=10 J,X=8 K=5 ...)",
    otherOptions:"OTHER OPTIONS",nickForHof:"NICKNAME (for leaderboard)",optional:"OPTIONAL",scoresSaved:"Your score will be saved as",
    modeNormal:"NORMAL",modeTetris:"TETRIS",tetrisDesc:"Found letters disappear and new ones drop from above!",
    waiting:"WAITING FOR PLAYERS",playersCount:"PLAYERS",youTag:"YOU",createGame:"CREATE GAME",connecting:"CONNECTING...",
    startGame:"START GAME",waitForPlayers:"Wait for someone to join...",waitForHost:"Waiting for host to start...",
    joinGame:"JOIN GAME",roomCode:"ROOM CODE",noRooms:"No open rooms",orJoinRoom:"or join with code",
    newCustom:"NEW CUSTOM GAME",menu:"MENU",newPractice:"NEW PRACTICE",
    results:"RESULTS",score:"SCORE",gameOver:"GAME OVER!",youWon:"YOU WON!",
    found:"FOUND",foundOf:"YOU FOUND",dragWords:"Drag across letters to find words...",
    notValid:"Not valid",alreadyFound:"Already found",
    arenaLabel:"ARENA",battleLabel:"BATTLE",tetrisLabel:"TETRIS",unlimitedLabel:"UNLIMITED",letterMultLabel:"LETTER VALUES",
    newLetters:"NEW LETTERS",stop:"STOP",
    saveAs:"SAVE AS",save:"SAVE",saved:"✓ Saved!",saveToHof:"SAVE TO LEADERBOARD",
    gameStarts:"GAME STARTS",battleStarts:"BATTLE STARTS",tetrisStarts:"TETRIS STARTS",comboStreak:"in a row!",
    megaCombo:"MEGA COMBO",combo:"COMBO",online:"online",
    openGames:"OPEN GAMES",roomFull:"Room is full",gameInProgress:"Game already in progress",roomNotFound:"Room not found",
    someoneBeatYou:"Someone got it first!",tooShort:"Too short",notInGrid:"Not found in grid",wrongMode:"Wrong mode",gameNotRunning:"Game not running",
    achievements:"ACHIEVEMENTS",achievementUnlocked:"New achievement!",locked:"Locked",
    share:"SHARE",shareCopied:"Copied!",shareText:"Piilosana — I found {words} words and scored {score} points! Can you beat me?",
    options:"SETTINGS",quickPlay:"PLAY",or:"or",advancedOptions:"More options",
    readMoreWords:"Read more about the words",
    wordInfoTitle:"ABOUT THE WORD LIST",
    wordInfoBody1:"The word list includes base forms, inflections, compound words, proper nouns and abbreviations.",
    wordInfoBody2:"The Finnish list is especially large because Finnish has a rich inflection system that produces many forms of each word (e.g. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"Abbreviations like SDP, NATO or EU are included in lowercase.",
    wordInfoSources:"Sources",
    wordInfoSourceFi:"Kotus — Institute for the Languages of Finland (modern Finnish word list)",
    wordInfoSourceEn:"SOWPODS / Collins Scrabble Words",
    wordInfoSourceSv:"SAOL — Swedish Academy Glossary",
  },
  sv:{
    selectMode:"VÄLJ SPELLÄGE",arena:"ARENA",arenaDesc:"24/7 onlinespel",customGame:"EGET SPEL",customDesc:"olika lägen",practice:"ÖVNING",practiceDesc:"ensam",
    findWords:"Hitta ord i rutnätet!",dragHint:"DRA över bokstäverna i alla riktningar. 2 min tid.",comboHint:"Hitta ord snabbt i rad = kombo och bonuspoäng!",
    scoring:"POÄNG: 3bok=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"KOMBO x2 (3+) · KOMBO x3 (5+)",words:"ord",
    nickname:"SMEKNAMN",join:"GÅ MED",back:"TILLBAKA",exit:"LÄMNA",play:"SPELA",
    arenaJoinDesc:"Löpande spel för alla! Gå med och hitta ord. Rundan varar 2 min.",
    nextRound:"Nästa runda börjar",playersInArena:"spelare i arenan",players:"spelare",
    getReady:"GÖR DIG REDO",roundOver:"RUNDAN SLUT",yourScore:"DINA POÄNG",nextRoundIn:"Nästa runda",starts:"börjar!",
    roundResults:"RUNDANS RESULTAT",foundWords:"HITTADE ORD",ownHighlighted:"Dina ord markerade i färg",
    missed:"INTE HITTADE",
    gameMode:"SPELLÄGE",classic:"KLASSISKT",battle:"STRID",battleDesc:"Ord syns för andra! Hittade bokstäver försvinner och nya faller uppifrån.",
    time:"TID",unlimited:"OBEGRÄNSAD",unlimitedDesc:"Ingen tidsgräns! Byt rutnät när du vill.",
    letterMult:"POÄNGSÄTTNING",letterMultBtn:"BOKSTAVSVÄRDEN",letterMultDesc:"Ovanliga bokstäver = mer poäng! (Z=10 X=8 J=7 ...)",
    otherOptions:"ANDRA VAL",nickForHof:"SMEKNAMN (för topplistan)",optional:"VALFRITT",scoresSaved:"Dina poäng sparas som",
    modeNormal:"NORMAL",modeTetris:"TETRIS",tetrisDesc:"Hittade bokstäver försvinner och nya faller uppifrån!",
    waiting:"VÄNTAR PÅ SPELARE",playersCount:"SPELARE",youTag:"DU",createGame:"SKAPA SPEL",connecting:"ANSLUTER...",
    startGame:"STARTA SPEL",waitForPlayers:"Vänta tills någon går med...",waitForHost:"Väntar på att värden startar...",
    joinGame:"GÅ MED I SPEL",roomCode:"RUMSKOD",noRooms:"Inga öppna rum",orJoinRoom:"eller gå med via kod",
    newCustom:"NYTT EGET SPEL",menu:"MENY",newPractice:"NY ÖVNING",
    results:"RESULTAT",score:"POÄNG",gameOver:"SPELET SLUT!",youWon:"DU VANN!",
    found:"HITTADE",foundOf:"DU HITTADE",dragWords:"Dra över bokstäver för att hitta ord...",
    notValid:"Ogiltigt",alreadyFound:"Redan hittat",
    arenaLabel:"ARENA",battleLabel:"STRID",tetrisLabel:"TETRIS",unlimitedLabel:"OBEGRÄNSAD",letterMultLabel:"BOKSTAVSVÄRDEN",
    newLetters:"NYA BOKSTÄVER",stop:"STOPPA",
    saveAs:"SPARA SOM",save:"SPARA",saved:"✓ Sparat!",saveToHof:"SPARA TILL TOPPLISTAN",
    gameStarts:"SPELET BÖRJAR",battleStarts:"STRIDEN BÖRJAR",tetrisStarts:"TETRIS BÖRJAR",comboStreak:"i rad!",
    megaCombo:"MEGA KOMBO",combo:"KOMBO",online:"online",
    openGames:"ÖPPNA SPEL",roomFull:"Rummet är fullt",gameInProgress:"Spelet pågår redan",roomNotFound:"Rummet hittades inte",
    someoneBeatYou:"Någon hann före!",tooShort:"För kort",notInGrid:"Finns inte i rutnätet",wrongMode:"Fel läge",gameNotRunning:"Spelet är inte igång",
    achievements:"PRESTATIONER",achievementUnlocked:"Ny prestation!",locked:"Låst",
    share:"DELA",shareCopied:"Kopierat!",shareText:"Piilosana — jag hittade {words} ord och fick {score} poäng! Kan du slå mig?",
    options:"INSTÄLLNINGAR",quickPlay:"SPELA",or:"eller",advancedOptions:"Fler alternativ",
    readMoreWords:"Läs mer om orden",
    wordInfoTitle:"OM ORDLISTAN",
    wordInfoBody1:"Ordlistan innehåller grundformer, böjningar, sammansatta ord, egennamn och förkortningar.",
    wordInfoBody2:"Den finska listan är särskilt stor eftersom finska har ett rikt böjningssystem som ger många former av varje ord (t.ex. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"Förkortningar som SDP, NATO eller EU ingår med små bokstäver.",
    wordInfoSources:"Källor",
    wordInfoSourceFi:"Kotus — Institutet för de inhemska språken (modern finsk ordlista)",
    wordInfoSourceEn:"SOWPODS / Collins Scrabble Words",
    wordInfoSourceSv:"SAOL — Svenska Akademiens ordlista",
  },
};

function findWords(grid,trie){
  const sz=grid.length,found=new Set(),dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*sz+c);for(const[dr,dc]of dirs){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<sz&&nc>=0&&nc<sz&&!vis.has(nr*sz+nc))dfs(nr,nc,nx,np,vis);}vis.delete(r*sz+c);}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++)dfs(r,c,trie,"",new Set());return found;
}

function pts(len){if(len<=2)return 0;if(len===3)return 1;if(len===4)return 2;if(len===5)return 4;if(len===6)return 6;if(len===7)return 10;return 14;}

// Letter values and colors are now per-language, resolved in component via lang state
const LETTER_VALUE_COLORS={1:"#88bbcc",2:"#44ccdd",3:"#ffbb44",4:"#ff8833",5:"#ff6655",7:"#ff4466",8:"#ff4466",10:"#ff2244"};
function getLetterValues(lang){return getLangConf(lang).letterValues;}
function ptsLetters(word,lang='fi'){const lv=getLetterValues(lang);let s=0;for(const ch of word)s+=(lv[ch]||1);return s;}
function letterColor(ch,lang='fi'){const lv=getLetterValues(lang);return LETTER_VALUE_COLORS[lv[ch]||1]||"#88bbcc";}

const fontCSS=`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');`;

// ============================================
// THEMES
// ============================================
const THEMES={
  dark:{
    name:"TUMMA",nameEn:"DARK",nameSv:"MÖRK",
    bg:"#0a0a1a",green:"#00ff88",yellow:"#ffcc00",red:"#ff4444",purple:"#ff66ff",
    dark:"#0d0d22",border:"#334",cell:"#1a1a3a",cellBorder:"#2a2a4a",
    font:"'Press Start 2P',monospace",
    gridBg:"#111133",textMuted:"#556",textSoft:"#88ccaa",
    inputBg:"#0d0d22",
  },
  light:{
    name:"VAALEA",nameEn:"LIGHT",nameSv:"LJUS",
    bg:"#f0f0f5",green:"#007744",yellow:"#aa6600",red:"#cc2222",purple:"#8833aa",
    dark:"#e0e0ea",border:"#999",cell:"#ffffff",cellBorder:"#bbb",
    font:"'Press Start 2P',monospace",
    gridBg:"#d8d8e8",textMuted:"#666",textSoft:"#335544",
    inputBg:"#ffffff",
  },
  pink:{
    name:"PINKKI",nameEn:"PINK",nameSv:"ROSA",
    bg:"#1a0a1a",green:"#ff66cc",yellow:"#ffaadd",red:"#ff4488",purple:"#ff99ff",
    dark:"#220d22",border:"#553",cell:"#2a1a2a",cellBorder:"#4a2a4a",
    font:"'Press Start 2P',monospace",
    gridBg:"#1a0a2a",textMuted:"#886",textSoft:"#cc88aa",
    inputBg:"#220d22",
  },
  electric:{
    name:"SÄHKÖ",nameEn:"ELECTRIC",nameSv:"ELEKTRO",
    bg:"#000820",green:"#00eeff",yellow:"#44ff44",red:"#ff2244",purple:"#8844ff",
    dark:"#001030",border:"#0055aa",cell:"#001848",cellBorder:"#0066cc",
    font:"'Press Start 2P',monospace",
    gridBg:"#000c30",textMuted:"#336699",textSoft:"#44aacc",
    inputBg:"#001030",
  },
  neon:{
    name:"NEON",nameEn:"NEON",nameSv:"NEON",
    bg:"#001a00",green:"#00ff44",yellow:"#88ff00",red:"#ff2200",purple:"#00ff88",
    dark:"#002200",border:"#005500",cell:"#003300",cellBorder:"#006600",
    font:"'Press Start 2P',monospace",
    gridBg:"#001800",textMuted:"#338833",textSoft:"#44cc44",
    inputBg:"#002200",
  },
};
function getTheme(id){return THEMES[id]||THEMES.dark;}

// ============================================
// ENDINGS - 10 different game over animations
// ============================================
const ENDINGS = [
  { name:"LUMIMONSTERI", emoji:"⛄", color:"#6688ff",
    desc:"Lumimonsteri syö kirjaimet!",
    cellAnim:(i,total)=>`cellShrinkSpin 0.48s ${i*0.05}s ease forwards`,
    cellColor:(i)=>"#6688ff",
    overlay:(progress)=>({
      bg:"radial-gradient(circle at 50% 50%, #6688ff22 0%, transparent 70%)",
      text:progress>0.3?"NAM NAM!":"",
      textColor:"#aaccff",
      particles:Array.from({length:20},(_,i)=>({x:Math.random()*100,y:Math.random()*100,size:3+Math.random()*5,color:"white",opacity:0.3+Math.random()*0.5}))
    })
  },
  { name:"TULVA", emoji:"🌊", color:"#4488ff",
    desc:"Vesi nousee ja huuhtoo kirjaimet!",
    cellAnim:(i,total)=>{const row=Math.floor(i/5);const delay=(4-row)*0.12;return `cellFloat 0.6s ${delay}s ease forwards`;},
    cellColor:(i)=>"#4488ff",
    overlay:(progress)=>({
      bg:`linear-gradient(to top, #2244aa${Math.floor(progress*200).toString(16).padStart(2,'0')} 0%, transparent ${Math.min(100,progress*120)}%)`,
      text:progress>0.5?"TULVA!":"",textColor:"#88bbff",
      particles:Array.from({length:12},(_,i)=>({x:Math.random()*100,y:100-progress*100+Math.random()*30,size:2+Math.random()*4,color:"#88ccff",opacity:0.4}))
    })
  },
  { name:"RÄJÄHDYS", emoji:"💥", color:"#ff6622",
    desc:"Ruudukko räjähtää!",
    cellAnim:(i,total)=>{const r=Math.floor(i/5)-2,c=i%5-2;const dist=Math.sqrt(r*r+c*c);return `cellExplode 0.48s ${dist*0.07}s ease forwards`;},
    cellColor:(i)=>"#ff6622",
    overlay:(progress)=>({
      bg:progress<0.3?`radial-gradient(circle at 50% 50%, #ff662266 0%, #ff220022 50%, transparent 70%)`:"transparent",
      text:progress>0.2?"BOOM!":"",textColor:"#ff8844",
      particles:Array.from({length:25},(_,i)=>({x:50+((Math.random()-0.5)*progress*200),y:50+((Math.random()-0.5)*progress*200),size:2+Math.random()*6,color:Math.random()>0.5?"#ff6622":"#ffcc00",opacity:Math.max(0,1-progress)}))
    })
  },
  { name:"TULIPALO", emoji:"🔥", color:"#ff4400",
    desc:"Tuli polttaa ruudukon!",
    cellAnim:(i,total)=>{const r=Math.floor(i/5),c=i%5;const edge=Math.min(r,c,4-r,4-c);return `cellBurn 0.48s ${edge*0.15}s ease forwards`;},
    cellColor:(i)=>["#ff4400","#ff6600","#ffaa00","#ff8800"][i%4],
    overlay:(progress)=>({
      bg:`linear-gradient(to top, #ff440033 0%, #ff880011 ${progress*60}%, transparent ${progress*100}%)`,
      text:progress>0.4?"ROIHU!":"",textColor:"#ff8844",
      particles:Array.from({length:20},(_,i)=>({x:10+Math.random()*80,y:100-Math.random()*progress*120,size:3+Math.random()*6,color:Math.random()>0.5?"#ff6600":"#ffcc00",opacity:0.5+Math.random()*0.3}))
    })
  },
  { name:"MUSTA AUKKO", emoji:"🕳️", color:"#8844cc",
    desc:"Musta aukko imee kirjaimet!",
    cellAnim:(i,total)=>{const r=Math.floor(i/5)-2,c=i%5-2;const dist=Math.sqrt(r*r+c*c);return `cellVortex 0.72s ${(3-dist)*0.12}s ease forwards`;},
    cellColor:(i)=>"#8844cc",
    overlay:(progress)=>({
      bg:`radial-gradient(circle at 50% 50%, #000000 ${progress*15}%, #8844cc22 ${progress*30}%, transparent 60%)`,
      text:progress>0.5?"WOOOOSH":"",textColor:"#aa66ff",
      particles:Array.from({length:15},(_,i)=>({x:50+Math.cos(i+progress*10)*30*(1-progress),y:50+Math.sin(i+progress*10)*30*(1-progress),size:2+Math.random()*3,color:"#aa66ff",opacity:0.5}))
    })
  },
  { name:"UFO", emoji:"🛸", color:"#44ff88",
    desc:"Avaruusolennot ryöstävät kirjaimet!",
    cellAnim:(i,total)=>`cellBeamUp 0.48s ${i*0.05}s ease forwards`,
    cellColor:(i)=>"#44ff88",
    overlay:(progress)=>({
      bg:`linear-gradient(to bottom, #44ff8811 0%, transparent 30%)`,
      text:progress>0.3?"BZZZT!":"",textColor:"#44ff88",
      particles:Array.from({length:10},(_,i)=>({x:30+Math.random()*40,y:Math.random()*progress*60,size:1+Math.random()*3,color:"#88ffaa",opacity:0.6}))
    })
  },
  { name:"TORNADO", emoji:"🌪️", color:"#aabbcc",
    desc:"Pyörremyrsky pyyhkäisee!",
    cellAnim:(i,total)=>`cellTornado 0.6s ${i*0.04}s ease forwards`,
    cellColor:(i)=>"#aabbcc",
    overlay:(progress)=>({
      bg:"transparent",
      text:progress>0.3?"WHOOOOSH!":"",textColor:"#ccddee",
      particles:Array.from({length:20},(_,i)=>({x:50+Math.cos(i*0.8+progress*15)*40*progress,y:50+Math.sin(i*0.8+progress*15)*40*progress,size:2+Math.random()*4,color:"#aabbcc",opacity:0.4}))
    })
  },
  { name:"PAKKANEN", emoji:"❄️", color:"#88ddff",
    desc:"Pakkanen jäädyttää ja särkee!",
    cellAnim:(i,total)=>`cellFreeze 0.6s ${Math.random()*0.42}s ease forwards`,
    cellColor:(i)=>"#88ddff",
    overlay:(progress)=>({
      bg:`linear-gradient(135deg, #88ddff11 0%, #ffffff08 50%, #88ddff11 100%)`,
      text:progress>0.4?"KRRK!":"",textColor:"#aaeeff",
      particles:Array.from({length:25},(_,i)=>({x:Math.random()*100,y:Math.random()*100,size:1+Math.random()*4,color:"white",opacity:0.3+Math.random()*0.5}))
    })
  },
  { name:"LOHIKÄÄRME", emoji:"🐉", color:"#ff4466",
    desc:"Lohikäärme puhaltaa tulta!",
    cellAnim:(i,total)=>{const c=i%5;return `cellDragonFire 0.48s ${c*0.09}s ease forwards`;},
    cellColor:(i)=>["#ff2200","#ff6600","#ffaa00","#ff4400","#ff8800"][i%5],
    overlay:(progress)=>({
      bg:progress>0.2?`linear-gradient(to right, #ff440033 0%, #ff880011 50%, transparent 100%)`:"transparent",
      text:progress>0.3?"ROOAR!":"",textColor:"#ff6644",
      particles:Array.from({length:15},(_,i)=>({x:progress*120-20+Math.random()*30,y:30+Math.random()*40,size:3+Math.random()*5,color:Math.random()>0.5?"#ff4400":"#ffaa00",opacity:0.5}))
    })
  },
  { name:"GLITCH", emoji:"👾", color:"#00ff00",
    desc:"Järjestelmävirhe!",
    cellAnim:(i,total)=>`cellGlitch 0.36s ${Math.random()*0.48}s steps(4) forwards`,
    cellColor:(i)=>["#ff0000","#00ff00","#0000ff","#ff00ff","#00ffff"][i%5],
    overlay:(progress)=>({
      bg:"transparent",
      text:progress>0.2?(Math.random()>0.5?"ERR0R!":"SY5T3M FA1L"):"",textColor:"#00ff00",
      particles:Array.from({length:8},(_,i)=>({x:Math.random()*100,y:Math.random()*100,size:Math.random()*100,color:`#${Math.floor(Math.random()*16777215).toString(16)}`,opacity:0.1+Math.random()*0.2}))
    })
  },
];

// ============================================
// SOUNDS
// ============================================
const SOUND_THEMES={
  retro:{
    synth:{oscillator:{type:"square"},envelope:{attack:0.01,decay:0.15,sustain:0.05,release:0.15},volume:-14},
    bass:{oscillator:{type:"triangle"},envelope:{attack:0.01,decay:0.3,sustain:0.1,release:0.3},volume:-10},
    btn:{noise:{type:"brown"},envelope:{attack:0.003,decay:0.04,sustain:0,release:0.02},volume:-22},
    btnFilter:400,
    notes:{
      find3:n=>[["C5","16n",n]],
      find4:n=>[["E5","16n",n],["G5","16n",n+0.08]],
      find5:n=>[["C5","16n",n],["E5","16n",n+0.07],["G5","8n",n+0.14]],
      find6:n=>({synth:[["C5","16n",n],["E5","16n",n+0.06],["G5","16n",n+0.12],["C6","8n",n+0.18]],bass:[["C3","4n",n]]}),
      find7:n=>({synth:[["C5","16n",n],["E5","16n",n+0.05],["G5","16n",n+0.1],["C6","16n",n+0.15],["E6","16n",n+0.2],["G6","4n",n+0.25]],bass:[["C3","8n",n],["G2","4n",n+0.15]]}),
      combo3:n=>[["C5","8n"],["E5","8n"],["G5","8n"],["C6","8n"]],
      combo5:n=>[["C5","8n"],["E5","8n"],["G5","8n"],["B5","8n"],["D6","8n"]],
      wrong:n=>[["E3","16n",n],["Eb3","8n",n+0.1]],
      tick:n=>[["A5","32n",n]],
      countdown:n=>[["G4","16n",n]],
      go:n=>[["C5","16n",n],["E5","16n",n+0.06],["G5","8n",n+0.12]],
      ending:n=>({bass:[["E2","8n",n],["C2","8n",n+0.2],["A1","4n",n+0.4]]}),
      chomp:n=>[["G3","32n",n]],
      btnBass:n=>[["A2","32n",n]],
    }
  },
  soft:{
    synth:{oscillator:{type:"sine"},envelope:{attack:0.05,decay:0.3,sustain:0.1,release:0.4},volume:-20},
    bass:{oscillator:{type:"sine"},envelope:{attack:0.05,decay:0.4,sustain:0.1,release:0.5},volume:-18},
    btn:{noise:{type:"pink"},envelope:{attack:0.01,decay:0.06,sustain:0,release:0.04},volume:-30},
    btnFilter:300,
    notes:{
      find3:n=>[["E5","8n",n]],
      find4:n=>[["G5","8n",n],["B5","8n",n+0.12]],
      find5:n=>[["E5","8n",n],["G5","8n",n+0.1],["B5","4n",n+0.2]],
      find6:n=>({synth:[["E5","8n",n],["G5","8n",n+0.09],["B5","8n",n+0.18],["E6","4n",n+0.27]],bass:[["E3","4n",n]]}),
      find7:n=>({synth:[["E5","8n",n],["G5","8n",n+0.08],["B5","8n",n+0.16],["E6","8n",n+0.24],["G6","4n",n+0.32]],bass:[["E3","8n",n],["B2","4n",n+0.2]]}),
      combo3:n=>[["E5","4n"],["G5","4n"],["B5","4n"],["E6","4n"]],
      combo5:n=>[["E5","4n"],["G5","4n"],["B5","4n"],["D6","4n"],["E6","4n"]],
      wrong:n=>[["D4","8n",n],["Db4","4n",n+0.15]],
      tick:n=>[["B5","32n",n]],
      countdown:n=>[["A4","8n",n]],
      go:n=>[["E5","8n",n],["G5","8n",n+0.1],["B5","4n",n+0.2]],
      ending:n=>({bass:[["G2","4n",n],["E2","4n",n+0.3],["C2","2n",n+0.6]]}),
      chomp:n=>[["A3","32n",n]],
      btnBass:n=>[["E3","32n",n]],
    }
  },
  modern:{
    synth:{oscillator:{type:"triangle"},envelope:{attack:0.02,decay:0.2,sustain:0.08,release:0.25},volume:-16},
    bass:{oscillator:{type:"sawtooth4"},envelope:{attack:0.02,decay:0.25,sustain:0.1,release:0.3},volume:-14},
    btn:{noise:{type:"white"},envelope:{attack:0.002,decay:0.03,sustain:0,release:0.02},volume:-26},
    btnFilter:500,
    notes:{
      find3:n=>[["D5","16n",n]],
      find4:n=>[["F5","16n",n],["A5","16n",n+0.06]],
      find5:n=>[["D5","16n",n],["F5","16n",n+0.05],["A5","8n",n+0.1]],
      find6:n=>({synth:[["D5","16n",n],["F5","16n",n+0.05],["A5","16n",n+0.1],["D6","8n",n+0.15]],bass:[["D3","4n",n]]}),
      find7:n=>({synth:[["D5","16n",n],["F5","16n",n+0.04],["A5","16n",n+0.08],["D6","16n",n+0.12],["F6","16n",n+0.16],["A6","4n",n+0.2]],bass:[["D3","8n",n],["A2","4n",n+0.12]]}),
      combo3:n=>[["D5","8n"],["F5","8n"],["A5","8n"],["D6","8n"]],
      combo5:n=>[["D5","8n"],["F5","8n"],["A5","8n"],["C#6","8n"],["E6","8n"]],
      wrong:n=>[["F3","16n",n],["E3","8n",n+0.08]],
      tick:n=>[["B5","32n",n]],
      countdown:n=>[["A4","16n",n]],
      go:n=>[["D5","16n",n],["F5","16n",n+0.05],["A5","8n",n+0.1]],
      ending:n=>({bass:[["F2","8n",n],["D2","8n",n+0.15],["A1","4n",n+0.3]]}),
      chomp:n=>[["A3","32n",n]],
      btnBass:n=>[["D3","32n",n]],
    }
  }
};

function useSounds(soundTheme){
  const synthRef=useRef(null);const bassRef=useRef(null);const btnNoiseRef=useRef(null);const initRef=useRef(false);
  const themeRef=useRef(soundTheme);themeRef.current=soundTheme;
  const lastInitTheme=useRef(null);

  const init=useCallback(async()=>{
    const st=SOUND_THEMES[themeRef.current]||SOUND_THEMES.retro;
    if(initRef.current&&lastInitTheme.current===themeRef.current)return;
    await Tone.start();
    // Dispose old synths if theme changed
    if(initRef.current){
      try{synthRef.current?.dispose();}catch{}
      try{bassRef.current?.dispose();}catch{}
      try{btnNoiseRef.current?.dispose();}catch{}
    }
    initRef.current=true;lastInitTheme.current=themeRef.current;
    synthRef.current=new Tone.PolySynth(Tone.Synth,st.synth).toDestination();
    bassRef.current=new Tone.Synth(st.bass).toDestination();
    const btnFilter=new Tone.Filter({frequency:st.btnFilter,type:"lowpass"}).toDestination();
    btnNoiseRef.current=new Tone.NoiseSynth(st.btn).connect(btnFilter);
  },[]);

  // Re-init when theme changes
  const reinit=useCallback(async()=>{
    if(!initRef.current)return;
    lastInitTheme.current=null;
    await init();
  },[init]);

  const playSynthNotes=useCallback((notesFn)=>{
    if(!synthRef.current)return;
    const n=Tone.now();const result=notesFn(n);
    if(Array.isArray(result)){
      result.forEach(args=>synthRef.current.triggerAttackRelease(...args));
    }else if(result){
      if(result.synth)result.synth.forEach(args=>synthRef.current.triggerAttackRelease(...args));
      if(result.bass&&bassRef.current)result.bass.forEach(args=>bassRef.current.triggerAttackRelease(...args));
    }
  },[]);

  const getNotes=useCallback(()=>(SOUND_THEMES[themeRef.current]||SOUND_THEMES.retro).notes,[]);

  const playByLength=useCallback((len)=>{
    const notes=getNotes();
    if(len<=3)playSynthNotes(notes.find3);
    else if(len===4)playSynthNotes(notes.find4);
    else if(len===5)playSynthNotes(notes.find5);
    else if(len===6)playSynthNotes(notes.find6);
    else playSynthNotes(notes.find7);
  },[playSynthNotes,getNotes]);

  const playCombo=useCallback((combo)=>{
    if(!synthRef.current)return;const n=Tone.now();const notes=getNotes();
    const arr=combo>=5?notes.combo5(n):notes.combo3(n);
    arr.forEach((args,i)=>synthRef.current.triggerAttackRelease(args[0],args[1],n+i*0.04));
    if(bassRef.current&&combo>=3)bassRef.current.triggerAttackRelease("C2","8n",n);
  },[getNotes]);

  const playWrong=useCallback(()=>{playSynthNotes(getNotes().wrong);},[playSynthNotes,getNotes]);
  const playTick=useCallback(()=>{playSynthNotes(getNotes().tick);},[playSynthNotes,getNotes]);
  const playCountdown=useCallback(()=>{playSynthNotes(getNotes().countdown);},[playSynthNotes,getNotes]);
  const playGo=useCallback(()=>{playSynthNotes(getNotes().go);},[playSynthNotes,getNotes]);
  const playEnding=useCallback(()=>{
    const notes=getNotes();const n=Tone.now();const result=notes.ending(n);
    if(result.bass&&bassRef.current)result.bass.forEach(args=>bassRef.current.triggerAttackRelease(...args));
    else if(Array.isArray(result)&&synthRef.current)result.forEach(args=>synthRef.current.triggerAttackRelease(...args));
  },[getNotes]);
  const playChomp=useCallback(()=>{playSynthNotes(getNotes().chomp);},[playSynthNotes,getNotes]);
  const playBtn=useCallback(()=>{
    if(!btnNoiseRef.current||!bassRef.current)return;
    const n=Tone.now();const notes=getNotes();
    btnNoiseRef.current.triggerAttackRelease("32n");
    notes.btnBass(n).forEach(args=>bassRef.current.triggerAttackRelease(...args));
  },[getNotes]);

  const api=useMemo(()=>({init,reinit,playByLength,playCombo,playWrong,playTick,playCountdown,playGo,playEnding,playChomp,playBtn}),[init,reinit,playByLength,playCombo,playWrong,playTick,playCountdown,playGo,playEnding,playChomp,playBtn]);
  return api;
}

// ============================================
// BACKGROUND MUSIC
// ============================================
const MUSIC_TRACKS={
  ambient:[
    // Gleba/Factorio inspired — slow evolving pads, atmospheric
    {id:"sumu",name:{fi:"Sumu",en:"Fog",sv:"Dimma"},bpm:30,sub:"1n",melDur:"4m",bassDur:"4m",
      melSynth:{oscillator:{type:"fatsine",count:3,spread:30},envelope:{attack:3,decay:2,sustain:0.7,release:4},volume:-20},
      bassSynth:{oscillator:{type:"sine"},envelope:{attack:4,decay:2,sustain:0.6,release:5},volume:-26},
      mel:[["A3","C4","E4"],null,null,null,["F3","A3","C4"],null,null,null,["C3","E3","G3"],null,null,null,["G3","B3","D4"],null,null,null,["A3","C4","E4"],null,null,null,["E3","G3","B3"],null,null,null,["F3","A3","C4"],null,null,null,["E3","G#3","B3"],null,null,null],
      bass:["A1",null,null,null,"F1",null,null,null,"C2",null,null,null,"G1",null,null,null,"A1",null,null,null,"E2",null,null,null,"F1",null,null,null,"E1",null,null,null]},
    // Deep space — ethereal, wider chords
    {id:"avaruus",name:{fi:"Avaruus",en:"Space",sv:"Rymd"},bpm:25,sub:"1n",melDur:"4m",bassDur:"4m",
      melSynth:{oscillator:{type:"fatsine",count:3,spread:40},envelope:{attack:4,decay:3,sustain:0.6,release:5},volume:-21},
      bassSynth:{oscillator:{type:"sine"},envelope:{attack:5,decay:3,sustain:0.5,release:6},volume:-27},
      mel:[["E3","G3","B3","F#4"],null,null,null,["D3","F#3","A3","C#4"],null,null,null,["C3","E3","G3","B3"],null,null,null,["B2","D3","F#3","A3"],null,null,null,["E3","G3","B3","D4"],null,null,null,["A2","C#3","E3","G#3"],null,null,null,["D3","F#3","A3","C#4"],null,null,null,["E3","G3","B3","F#4"],null,null,null],
      bass:["E1",null,null,null,"D1",null,null,null,"C1",null,null,null,"B0",null,null,null,"E1",null,null,null,"A0",null,null,null,"D1",null,null,null,"E1",null,null,null]},
    // Depths — minimal dark drone
    {id:"syvyys",name:{fi:"Syvyys",en:"Depths",sv:"Djup"},bpm:22,sub:"1n",melDur:"4m",bassDur:"4m",
      melSynth:{oscillator:{type:"fatsine",count:2,spread:15},envelope:{attack:5,decay:4,sustain:0.5,release:6},volume:-22},
      bassSynth:{oscillator:{type:"sine"},envelope:{attack:6,decay:4,sustain:0.4,release:8},volume:-25},
      mel:[["A2","E3"],null,null,null,null,null,["A2","C3"],null,null,null,null,null,["E2","B2"],null,null,null,null,null,["E2","G2"],null,null,null,null,null,["A2","E3"],null,null,null,null,null,["D2","A2"],null,null,null,null,null],
      bass:["A0",null,null,null,null,null,"A0",null,null,null,null,null,"E0",null,null,null,null,null,"E0",null,null,null,null,null,"A0",null,null,null,null,null,"D0",null,null,null,null,null]},
  ],
  acoustic:[
    // Kitaro / Mandala inspired — pentatonic meditation, plucked strings
    {id:"mandala",name:{fi:"Mandala",en:"Mandala",sv:"Mandala"},bpm:50,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"triangle"},envelope:{attack:0.01,decay:1.8,sustain:0,release:2.5},volume:-18},
      bassSynth:{oscillator:{type:"sine"},envelope:{attack:3,decay:2,sustain:0.5,release:4},volume:-26},
      mel:["A4",null,null,null,"C5",null,null,null,null,null,"E5",null,"D5",null,null,null,null,null,"C5",null,"A4",null,null,null,null,null,"G4",null,null,null,"A4",null,null,null,null,null,"E5",null,null,null,"D5",null,null,null,"C5",null,null,null],
      bass:["A2",null,null,null,null,null,null,null,null,null,null,null,"A2",null,null,null,null,null,null,null,null,null,null,null,"E2",null,null,null,null,null,null,null,null,null,null,null,"A2",null,null,null,null,null,null,null,null,null,null,null]},
    // Zen garden — D pentatonic, very sparse
    {id:"zen",name:{fi:"Zen",en:"Zen",sv:"Zen"},bpm:44,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"triangle"},envelope:{attack:0.01,decay:2.2,sustain:0,release:3},volume:-17},
      bassSynth:{oscillator:{type:"sine"},envelope:{attack:4,decay:2,sustain:0.4,release:5},volume:-27},
      mel:[null,null,"D5",null,null,null,null,null,"A4",null,null,null,null,null,null,null,"G4",null,null,null,"F4",null,null,null,null,null,"D4",null,null,null,null,null,null,null,"A4",null,null,null,null,null,"D5",null,null,null,null,null,"C5",null],
      bass:["D2",null,null,null,null,null,null,null,null,null,null,null,"D2",null,null,null,null,null,null,null,null,null,null,null,"A1",null,null,null,null,null,null,null,null,null,null,null,"D2",null,null,null,null,null,null,null,null,null,null,null]},
    // Silk Road — eastern pentatonic with harmonics
    {id:"silkki",name:{fi:"Silkkitie",en:"Silk Road",sv:"Sidenvägen"},bpm:48,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"triangle"},envelope:{attack:0.02,decay:2,sustain:0,release:2.5},volume:-17},
      bassSynth:{oscillator:{type:"fatsine",count:2,spread:10},envelope:{attack:3,decay:2,sustain:0.5,release:4},volume:-25},
      mel:["E5",null,null,null,"B4",null,null,null,null,null,"A4",null,"E4",null,null,null,null,null,"G4",null,null,null,"A4",null,"B4",null,null,null,null,null,null,null,"E5",null,null,null,"D5",null,null,null,"B4",null,null,null,"A4",null,null,null],
      bass:["E2",null,null,null,null,null,null,null,null,null,null,null,"E2",null,null,null,null,null,null,null,null,null,null,null,"A1",null,null,null,null,null,null,null,null,null,null,null,"E2",null,null,null,null,null,null,null,null,null,null,null]},
  ],
  electronic:[
    // Moby "Porcelain" inspired — warm pads + sparse emotional melody
    {id:"porcelain",name:{fi:"Posliini",en:"Porcelain",sv:"Porslin"},bpm:72,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"fatsine",count:2,spread:15},envelope:{attack:0.05,decay:1.5,sustain:0.1,release:2},volume:-18},
      bassSynth:{oscillator:{type:"fatsine",count:3,spread:25},envelope:{attack:3,decay:2,sustain:0.6,release:4},volume:-23},
      mel:[null,null,null,null,"E5",null,null,null,null,null,"D5",null,"C5",null,null,null,null,null,null,null,"B4",null,null,null,null,null,"A4",null,null,null,null,null,"G4",null,null,null,null,null,null,null,"A4",null,null,null,null,null,null,null],
      bass:[["A3","C4","E4"],null,null,null,null,null,null,null,["E3","G3","B3"],null,null,null,null,null,null,null,["F3","A3","C4"],null,null,null,null,null,null,null,["C3","E3","G3"],null,null,null,null,null,null,null,["A3","C4","E4"],null,null,null,null,null,null,null,["E3","G3","B3"],null,null,null,null,null,null,null]},
    // Moby "Everloving" style — gentle pulse + floating notes
    {id:"aalto",name:{fi:"Aalto",en:"Wave",sv:"Våg"},bpm:68,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"fatsine",count:2,spread:12},envelope:{attack:0.08,decay:1.2,sustain:0.15,release:2},volume:-19},
      bassSynth:{oscillator:{type:"fatsine",count:3,spread:20},envelope:{attack:3,decay:2,sustain:0.5,release:4},volume:-24},
      mel:[null,null,"E4",null,null,null,null,null,"G4",null,null,null,"A4",null,null,null,null,null,null,null,"B4",null,null,null,null,null,"A4",null,"G4",null,null,null,null,null,"E4",null,null,null,null,null,"D4",null,null,null,null,null,null,null],
      bass:[["D3","F3","A3"],null,null,null,null,null,null,null,null,null,null,null,["A2","C3","E3"],null,null,null,null,null,null,null,null,null,null,null,["Bb2","D3","F3"],null,null,null,null,null,null,null,null,null,null,null,["A2","C3","E3"],null,null,null,null,null,null,null,null,null,null,null]},
    // Natural ambient electronic — Moby "God Moving Over the Face of the Waters" style
    {id:"horisontti",name:{fi:"Horisontti",en:"Horizon",sv:"Horisont"},bpm:60,sub:"4n",melDur:"2n",bassDur:"4m",
      melSynth:{oscillator:{type:"sine"},envelope:{attack:0.1,decay:2,sustain:0.2,release:3},volume:-17},
      bassSynth:{oscillator:{type:"fatsine",count:3,spread:30},envelope:{attack:4,decay:3,sustain:0.5,release:5},volume:-22},
      mel:[null,null,null,null,"C5",null,null,null,null,null,null,null,"G4",null,null,null,null,null,"A4",null,null,null,null,null,null,null,null,null,"F4",null,null,null,null,null,null,null,"G4",null,null,null,null,null,null,null,"C5",null,null,null],
      bass:[["F3","A3","C4"],null,null,null,null,null,null,null,null,null,null,null,["C3","E3","G3"],null,null,null,null,null,null,null,null,null,null,null,["D3","F3","A3"],null,null,null,null,null,null,null,null,null,null,null,["C3","E3","G3"],null,null,null,null,null,null,null,null,null,null,null]},
  ]
};

function useMusic(category,isPlaying){
  const melSynthRef=useRef(null);const bassSynthRef=useRef(null);
  const melSeqRef=useRef(null);const bassSeqRef=useRef(null);
  const gainRef=useRef(null);const activeRef=useRef(false);
  const trackIdx=useRef(Math.floor(Math.random()*10));

  const cleanup=useCallback(()=>{
    try{Tone.Transport.stop();Tone.Transport.cancel();}catch{}
    try{melSeqRef.current?.stop();melSeqRef.current?.dispose();}catch{}melSeqRef.current=null;
    try{bassSeqRef.current?.stop();bassSeqRef.current?.dispose();}catch{}bassSeqRef.current=null;
    try{melSynthRef.current?.dispose();}catch{}melSynthRef.current=null;
    try{bassSynthRef.current?.dispose();}catch{}bassSynthRef.current=null;
    try{gainRef.current?.dispose();}catch{}gainRef.current=null;
    activeRef.current=false;
  },[]);

  useEffect(()=>{
    if(category==="off"||!isPlaying){cleanup();return;}
    const tracks=MUSIC_TRACKS[category];
    if(!tracks||!tracks.length)return;
    const track=tracks[trackIdx.current%tracks.length];
    trackIdx.current++;
    let cancelled=false;
    (async()=>{
      await Tone.start();
      if(cancelled)return;
      cleanup();
      Tone.Transport.bpm.value=track.bpm;
      gainRef.current=new Tone.Gain(0).toDestination();
      melSynthRef.current=new Tone.PolySynth(Tone.Synth,track.melSynth).connect(gainRef.current);
      bassSynthRef.current=new Tone.PolySynth(Tone.Synth,track.bassSynth).connect(gainRef.current);
      melSeqRef.current=new Tone.Sequence((time,note)=>{
        if(note)melSynthRef.current?.triggerAttackRelease(note,track.melDur,time);
      },track.mel,track.sub);
      melSeqRef.current.loop=true;
      if(track.bass){
        bassSeqRef.current=new Tone.Sequence((time,note)=>{
          if(note)bassSynthRef.current?.triggerAttackRelease(note,track.bassDur,time);
        },track.bass,track.sub);
        bassSeqRef.current.loop=true;
        bassSeqRef.current.start(0);
      }
      melSeqRef.current.start(0);
      Tone.Transport.start();
      activeRef.current=true;
      gainRef.current.gain.rampTo(0.7,2);
    })();
    return()=>{cancelled=true;cleanup();};
  },[category,isPlaying,cleanup]);
}

// ============================================
// ENDING OVERLAY COMPONENT
// ============================================
function EndingOverlay({ending, progress, gridRect}){
  if(!ending||!gridRect)return null;
  const ov=ending.overlay(progress);
  // Phase 1 (progress<0.35): Show big name + emoji intro
  // Phase 2 (progress>=0.35): Show overlay effects + action text
  const introPhase=progress<0.35;
  const introOpacity=introPhase?Math.min(1,progress/0.08):Math.max(0,1-(progress-0.35)/0.15);
  return(
    <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:50,overflow:"hidden",borderRadius:"4px"}}>
      <div style={{position:"absolute",inset:0,background:introPhase?"#0a0a1acc":ov.bg,transition:"background 0.5s"}}/>
      {!introPhase&&ov.particles&&ov.particles.map((p,i)=>(
        <div key={i} style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,width:`${p.size}px`,height:`${Math.min(p.size,8)}px`,background:p.color,borderRadius:"50%",opacity:p.opacity,animation:"snowfall 1s ease-out infinite",animationDelay:`${Math.random()}s`}}/>
      ))}
      {/* Big intro: emoji + name + description */}
      {introOpacity>0&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",zIndex:60,opacity:introOpacity,transition:"opacity 0.3s",width:"90%"}}>
          {ending.emoji&&<div style={{fontSize:"72px",animation:"pop 0.6s ease",marginBottom:"10px",filter:`drop-shadow(0 0 20px ${ending.color}88)`}}>{ending.emoji}</div>}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"20px",color:ending.color,textShadow:`0 0 30px ${ending.color}aa, 0 0 60px ${ending.color}44`,animation:"pop 0.6s ease",letterSpacing:"2px",marginBottom:"14px"}}>
            {ending.name}
          </div>
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"14px",color:"#ffffff",textShadow:`0 0 20px ${ending.color}aa, 2px 2px 0 #000`,animation:"fadeIn 0.8s ease",lineHeight:"2",padding:"0 8px"}}>
            {ending.desc}
          </div>
        </div>
      )}
      {/* Action text during cell eating phase */}
      {!introPhase&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",zIndex:60,width:"90%"}}>
          {ending.emoji&&<div style={{fontSize:"56px",animation:"pop 0.4s ease",marginBottom:"6px"}}>{ending.emoji}</div>}
          <div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"16px",color:"#ffffff",textShadow:`0 0 20px ${ending.color}aa, 2px 2px 0 #000`,lineHeight:"2",marginBottom:"8px"}}>
            {ending.desc}
          </div>
          {ov.text&&<div style={{fontFamily:"'Press Start 2P',monospace",fontSize:"22px",color:ov.textColor,textShadow:`0 0 20px ${ov.textColor}88, 0 0 40px ${ov.textColor}44`,animation:"pop 0.4s ease"}}>
            {ov.text}
          </div>}
        </div>
      )}
    </div>
  );
}

// ============================================
// CONFETTI CELEBRATION (multiplayer end)
// ============================================
function ConfettiCelebration({isWinner}){
  const canvasRef=useRef(null);
  const particles=useRef([]);
  const animRef=useRef(null);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width=400,H=canvas.height=600;
    const colors=isWinner
      ?["#ffcc00","#00ff88","#ff66ff","#44ddff","#ff8844","#ffffff"]
      :["#00ff88","#44ddff","#8866ff","#ff66aa","#66ffaa"];
    const shapes=["rect","circle","star"];
    particles.current=Array.from({length:isWinner?120:60},()=>({
      x:Math.random()*W,y:Math.random()*-H,
      vx:(Math.random()-0.5)*3,vy:1.5+Math.random()*3,
      rot:Math.random()*360,vr:(Math.random()-0.5)*8,
      w:4+Math.random()*6,h:3+Math.random()*5,
      color:colors[Math.floor(Math.random()*colors.length)],
      shape:shapes[Math.floor(Math.random()*shapes.length)],
      opacity:0.7+Math.random()*0.3,
      wobble:Math.random()*Math.PI*2,wobbleSpeed:0.02+Math.random()*0.04
    }));
    function drawStar(cx,cy,r,ctx){
      ctx.beginPath();
      for(let i=0;i<5;i++){
        const a=Math.PI*2*i/5-Math.PI/2;
        const ax=cx+Math.cos(a)*r,ay=cy+Math.sin(a)*r;
        const b=Math.PI*2*(i+0.5)/5-Math.PI/2;
        const bx=cx+Math.cos(b)*r*0.4,by=cy+Math.sin(b)*r*0.4;
        if(i===0)ctx.moveTo(ax,ay);else ctx.lineTo(ax,ay);
        ctx.lineTo(bx,by);
      }
      ctx.closePath();ctx.fill();
    }
    function frame(){
      ctx.clearRect(0,0,W,H);
      for(const p of particles.current){
        p.y+=p.vy;p.x+=p.vx+Math.sin(p.wobble)*0.5;
        p.rot+=p.vr;p.wobble+=p.wobbleSpeed;
        if(p.y>H+20){p.y=-10;p.x=Math.random()*W;}
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot*Math.PI/180);
        ctx.globalAlpha=p.opacity;ctx.fillStyle=p.color;
        if(p.shape==="rect"){ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);}
        else if(p.shape==="circle"){ctx.beginPath();ctx.arc(0,0,p.w/2,0,Math.PI*2);ctx.fill();}
        else{drawStar(0,0,p.w/2,ctx);}
        ctx.restore();
      }
      animRef.current=requestAnimationFrame(frame);
    }
    frame();
    return()=>{if(animRef.current)cancelAnimationFrame(animRef.current);};
  },[isWinner]);
  return <canvas ref={canvasRef} style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",width:"100vw",maxWidth:"600px",height:"100vh",pointerEvents:"none",zIndex:10}}/>;
}

// ============================================
// SCORE POPUP
// ============================================
function ScorePopup({text,color,x,y}){
  return(<div style={{position:"fixed",left:x,top:y,transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:200,fontFamily:"'Press Start 2P',monospace",fontSize:"18px",color,textShadow:`0 0 10px ${color}88`,animation:"floatUp 1s ease-out forwards"}}>{text}</div>);
}

// ============================================
// TITLE DEMO COMPONENT - shows word-finding animation in menu
// ============================================
// Per-language titles and demo words (subsequences to highlight)
const TITLE_CONFIG={
  fi:{
    title:"PIILOSANA",
    gearIdx:4, // the O in PIIL⚙SANA
    demos:[
      {word:"PII",indices:[0,1,2],color:"#44ff88"},
      {word:"ILO",indices:[2,3,4],color:"#4488ff"},
      {word:"OSA",indices:[4,5,6],color:"#ff8844"},
      {word:"SANA",indices:[5,6,7,8],color:"#ff44cc"},
      {word:"PIILO",indices:[0,1,2,3,4],color:"#ffcc00"},
      {word:"PIILOSANA",indices:[0,1,2,3,4,5,6,7,8],color:"#ff6644"},
    ]
  },
  en:{
    title:"LETTERLOOT",
    gearIdx:7, // the first O in LETTERL⚙OT
    // L(0) E(1) T(2) T(3) E(4) R(5) L(6) O(7) O(8) T(9)
    demos:[
      {word:"LET",indices:[0,1,2],color:"#44ff88"},
      {word:"LOOT",indices:[6,7,8,9],color:"#4488ff"},
      {word:"LETTER",indices:[0,1,2,3,4,5],color:"#ff8844"},
      {word:"RLOOT",indices:[5,6,7,8,9],color:"#ff44cc"},
      {word:"LETTERLOOT",indices:[0,1,2,3,4,5,6,7,8,9],color:"#ff6644"},
    ]
  },
  sv:{
    title:"ORDJAKT",
    gearIdx:0, // the O in ⚙RDJAKT
    // O(0) R(1) D(2) J(3) A(4) K(5) T(6)
    demos:[
      {word:"ORD",indices:[0,1,2],color:"#44ff88"},
      {word:"JAKT",indices:[3,4,5,6],color:"#4488ff"},
      {word:"AKT",indices:[4,5,6],color:"#ff8844"},
      {word:"ORDJA",indices:[0,1,2,3,4],color:"#ff44cc"},
      {word:"ORDJAKT",indices:[0,1,2,3,4,5,6],color:"#ff6644"},
    ]
  },
};

// Pixel art flags (9x6 grids)
const FLAG_PIXELS={
  fi:[
    "WWWBWWWWW",
    "WWWBWWWWW",
    "BBBBBBBBB",
    "BBBBBBBBB",
    "WWWBWWWWW",
    "WWWBWWWWW",
  ],
  en:[
    "BBBBRRRRRR",
    "BBBBWWWWWW",
    "BBBBRRRRRR",
    "WWWWWWWWWW",
    "RRRRRRRRRR",
    "WWWWWWWWWW",
  ],
  sv:[
    "BBBYBBBBB",
    "BBBYBBBBB",
    "YYYYYYYYY",
    "YYYYYYYYY",
    "BBBYBBBBB",
    "BBBYBBBBB",
  ],
};
const FLAG_COLS={fi:9,en:10,sv:9};
const FLAG_COLORS={W:"#ffffff",B:"#003580",R:"#cc2244",Y:"#ffcc00"};
function PixelFlag({lang,size=2}){
  const rows=FLAG_PIXELS[lang]||FLAG_PIXELS.fi;
  const cols=FLAG_COLS[lang]||9;
  const numRows=rows.length;
  return(
    <div style={{display:"inline-grid",gridTemplateColumns:`repeat(${cols},${size}px)`,gridTemplateRows:`repeat(${numRows},${size}px)`,gap:0,imageRendering:"pixelated",border:"1px solid #556",flexShrink:0}}>
      {rows.map((row,r)=>Array.from(row).map((ch,c)=>(
        <div key={r*cols+c} style={{width:size,height:size,background:FLAG_COLORS[ch]||"#000"}}/>
      )))}
    </div>
  );
}

// Pixel art icons (each row is a string, . = transparent, letter = color key)
const ICON_PIXELS={
  gear:{ // 19x19 multi-shaded pixel art gear (8 teeth, center hole)
    cols:19,
    rows:[
      "...................",
      ".........W.........",
      "........WWW........",
      "....WW..WhB..BB....",
      "...WWBW.WhB.BBBB...",
      "...WBhBWWhBBBlBB...",
      "....WBhhBBBllBB....",
      ".....WhBB.BBlB.....",
      "..WWWWBB...BBBBBB..",
      ".WWhhhB.....BdddBB.",
      "..WBBBBB...BBBBBB..",
      ".....BlBB.BBdB.....",
      "....BBllBBBddBB....",
      "...BBlBBBdBBBdBB...",
      "...BBBB.BdB.BBBB...",
      "....BB..BdB..BB....",
      "........BBB........",
      ".........B.........",
      "...................",
    ],
    colors:{B:"outline",W:"highlight",h:"light",l:"mid",d:"dark"},
  },
  swords:{ // 13x13 crossed swords with guards and handles
    cols:13,
    rows:[
      "S...........S",
      ".S.........S.",
      "..S.......S..",
      "...S.....S...",
      "....S...S....",
      ".....S.S.....",
      "......S......",
      ".....S.S.....",
      "....S...S....",
      "...GS...SG...",
      "..GGG...GGG..",
      "...H.....H...",
      "...H.....H...",
    ],
    colors:{S:"currentColor",G:"#ccaa44",H:"#aa7733"},
  },
  arrow:{ // 9x11 down arrow
    cols:9,
    rows:[
      "...A.A...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      ".A.AAA.A.",
      ".AAAAAAA.",
      "..AAAAA..",
      "...AAA...",
      "....A....",
    ],
    colors:{A:"currentColor"},
  },
  infinity:{ // 11x7 infinity
    cols:11,
    rows:[
      "..II...II..",
      ".I..I.I..I.",
      "I....I....I",
      "I....I....I",
      "I....I....I",
      ".I..I.I..I.",
      "..II...II..",
    ],
    colors:{I:"currentColor"},
  },
  refresh:{ // 11x11 circular arrows with arrowheads
    cols:11,
    rows:[
      "...RRRRR...",
      "..R.....R..",
      ".R.......R.",
      "R.....RRRRR",
      "R......RRR.",
      "R.......R..",
      "..R.......R",
      ".RRR......R",
      "RRRRR.....R",
      ".R.......R.",
      "..R.....R..",
      "...RRRRR...",
    ],
    colors:{R:"currentColor"},
  },
  stop:{ // 7x7 stop square
    cols:7,
    rows:[
      "SSSSSSS",
      "SSSSSSS",
      "SS...SS",
      "SS...SS",
      "SS...SS",
      "SSSSSSS",
      "SSSSSSS",
    ],
    colors:{S:"currentColor"},
  },
  person:{ // 9x9 compact person/user icon
    cols:9,
    rows:[
      "...PPP...",
      "..PPPPP..",
      "..PPPPP..",
      "...PPP...",
      ".PPPPPPP.",
      "PPPPPPPPP",
      "PP.PPP.PP",
      "...PPP...",
      "..PP.PP..",
    ],
    colors:{P:"currentColor"},
  },
};

// ============================================
// ACHIEVEMENT BADGE PIXEL ART (11x11 each)
// ============================================
const BADGE_PIXELS={
  star:{
    cols:9,rows:[
      "....*....",
      "...***...",
      "...***...",
      "*********",
      ".******.*",
      "..*****!.",
      "...*.*...",
      "..**.**!.",
      ".**...**.",
    ],colors:{"*":"currentColor","!":"currentColor"},
  },
  flame:{ // fire/streak
    cols:11,rows:[
      ".....*.....",
      "....**.....",
      "...**F*....",
      "..**FFF*...",
      "..*FFFFF*..",
      "..*FFFFF*..",
      ".*FFFFFFF*.",
      ".*FFFFFFF*.",
      ".*FFFFFFF*.",
      "..*FFFFF*..",
      "...***.*...",
    ],colors:{"*":"#ff4400",F:"currentColor"},
  },
  diamond:{
    cols:9,rows:[
      "....*....",
      "...*D*...",
      "..*DDD*..",
      ".*DDDDD*.",
      "*DDDDDDD*",
      ".*DDDDD*.",
      "..*DDD*..",
      "...*D*...",
      "....*....",
    ],colors:{"*":"outline",D:"currentColor"},
  },
  crown:{ // king crown
    cols:11,rows:[
      ".*...*...*.",
      ".*...*...*.",
      ".**.***..**",
      ".***.***..*",
      ".**GGGGG**.",
      ".*GGGGGGG*.",
      ".*GGGGGGG*.",
      ".*GGGGGGG*.",
      ".**GGGGG**.",
      "...........",
      "...........",
    ],colors:{"*":"currentColor",G:"#ffcc00"},
  },
  scroll:{ // word scroll
    cols:11,rows:[
      "..********.",
      ".*SSSSSS**.",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".**SSSSSS*.",
      "..********.",
      "...........",
    ],colors:{"*":"outline",S:"currentColor"},
  },
  trophy:{ // trophy cup
    cols:11,rows:[
      "...........",
      ".**GGGGG**.",
      "*.*GGGGG*.*",
      "*.*GGGGG*.*",
      "**.*GGG*..*",
      "...*GGG*...",
      "....*G*....",
      "....*G*....",
      "...*GGG*...",
      "..*GGGGG*..",
      "...........",
    ],colors:{"*":"outline",G:"currentColor"},
  },
  bolt:{ // lightning bolt speed
    cols:11,rows:[
      ".....****..",
      "....**.....",
      "...**......",
      "..**.......",
      ".********.*",
      "...........",
      ".*********.",
      ".......**.*",
      "......**...",
      ".....**....",
      "...**......",
    ],colors:{"*":"currentColor"},
  },
  sword:{ // arena sword
    cols:11,rows:[
      ".........*.",
      "........*..",
      ".......*...",
      "......*....",
      ".....*.....",
      "....*......",
      "..G*.......",
      ".GG........",
      "..G*.......",
      "...H.......",
      "...H.......",
    ],colors:{"*":"currentColor",G:"#ccaa44",H:"#aa7733"},
  },
};

// ============================================
// ACHIEVEMENT DEFINITIONS
// ============================================
const ACHIEVEMENTS={
  // Word-based achievements
  // -- TIER 1: Ensimmäinen peli (saa heti) --
  first_game:    {icon:"trophy", color:"#00ff88",tier:1,
    fi:"Ensimmäinen peli",     en:"First Game",         sv:"Första spelet",
    fi_d:"Pelaa ensimmäinen pelisi",en_d:"Play your first game",sv_d:"Spela ditt första spel",
    check:(s)=>s.gamesPlayed>=1},
  first_word:    {icon:"star",   color:"#00ff88",tier:1,
    fi:"Ensimmäinen sana",     en:"First Word",         sv:"Första ordet",
    fi_d:"Löydä ensimmäinen sanasi",en_d:"Find your first word",sv_d:"Hitta ditt första ord",
    check:(s)=>s.totalWords>=1},
  combo_3:       {icon:"flame",  color:"#ff6644",tier:1,
    fi:"Komboilija",           en:"Combo Starter",      sv:"Kombostartare",
    fi_d:"Saa 3 sanan kombo",en_d:"Get a 3 word combo",sv_d:"Få en 3-ordskombo",
    check:(s)=>s.bestCombo>=3},
  // -- TIER 2: Muutaman pelin jälkeen --
  hundred_words: {icon:"scroll", color:"#44ddff",tier:2,
    fi:"Sananiekka",           en:"Word Finder",        sv:"Ordhittare",
    fi_d:"Löydä 100 sanaa yhteensä",en_d:"Find 100 words total",sv_d:"Hitta 100 ord totalt",
    check:(s)=>s.totalWords>=100},
  ten_games:     {icon:"trophy", color:"#44ddff",tier:2,
    fi:"Kokenut pelaaja",      en:"Experienced",        sv:"Erfaren",
    fi_d:"Pelaa 10 peliä",en_d:"Play 10 games",sv_d:"Spela 10 spel",
    check:(s)=>s.gamesPlayed>=10},
  long_word_5:   {icon:"diamond",color:"#44ddff",tier:2,
    fi:"Pitkä sana",           en:"Long Word",          sv:"Långt ord",
    fi_d:"Löydä 5-kirjaiminen sana",en_d:"Find a 5-letter word",sv_d:"Hitta ett 5-bokstavsord",
    check:(s)=>s.longestWord>=5},
  score_30:      {icon:"star",   color:"#44ddff",tier:2,
    fi:"Hyvä alku",            en:"Good Start",         sv:"Bra start",
    fi_d:"Saa 30 pistettä yhdessä pelissä",en_d:"Score 30 in one game",sv_d:"Få 30 poäng i ett spel",
    check:(s)=>s.bestScore>=30},
  arena_player:  {icon:"sword",  color:"#ff6644",tier:2,
    fi:"Areenataistelija",     en:"Arena Fighter",      sv:"Arenakämpe",
    fi_d:"Pelaa areenalla",en_d:"Play in the arena",sv_d:"Spela i arenan",
    check:(s)=>s.arenaGames>=1},
  polyglot:      {icon:"scroll", color:"#ffcc00",tier:2,
    fi:"Monikielinen",         en:"Polyglot",           sv:"Polyglott",
    fi_d:"Pelaa kaikilla kolmella kielellä",en_d:"Play in all three languages",sv_d:"Spela på alla tre språk",
    check:(s)=>(s.langsPlayed||[]).length>=3},
  // -- TIER 3: Kymmenien pelien jälkeen --
  five_hundred_words:{icon:"scroll",color:"#ff66ff",tier:3,
    fi:"Sanamestari",          en:"Word Master",        sv:"Ordmästare",
    fi_d:"Löydä 500 sanaa yhteensä",en_d:"Find 500 words total",sv_d:"Hitta 500 ord totalt",
    check:(s)=>s.totalWords>=500},
  fifty_games:   {icon:"trophy", color:"#ff66ff",tier:3,
    fi:"Veteraani",            en:"Veteran",            sv:"Veteran",
    fi_d:"Pelaa 50 peliä",en_d:"Play 50 games",sv_d:"Spela 50 spel",
    check:(s)=>s.gamesPlayed>=50},
  long_word_6:   {icon:"diamond",color:"#ff66ff",tier:3,
    fi:"Todella pitkä",        en:"Really Long",        sv:"Riktigt långt",
    fi_d:"Löydä 6-kirjaiminen sana",en_d:"Find a 6-letter word",sv_d:"Hitta ett 6-bokstavsord",
    check:(s)=>s.longestWord>=6},
  score_60:      {icon:"star",   color:"#ffcc00",tier:3,
    fi:"Kuusikymppinen",       en:"Sixty Club",         sv:"Sextio",
    fi_d:"Saa 60 pistettä yhdessä pelissä",en_d:"Score 60 in one game",sv_d:"Få 60 poäng i ett spel",
    check:(s)=>s.bestScore>=60},
  combo_5:       {icon:"flame",  color:"#ff66ff",tier:3,
    fi:"Megakombo",            en:"Mega Combo",         sv:"Megakombo",
    fi_d:"Saa 5 sanan kombo",en_d:"Get a 5 word combo",sv_d:"Få en 5-ordskombo",
    check:(s)=>s.bestCombo>=5},
  speed_8:       {icon:"bolt",   color:"#ffcc00",tier:3,
    fi:"Nopea sormi",          en:"Quick Finger",       sv:"Snabbt finger",
    fi_d:"Löydä 8 sanaa minuutissa",en_d:"Find 8 words per minute",sv_d:"Hitta 8 ord per minut",
    check:(s)=>s.bestWordsPerMin>=8},
  arena_winner:  {icon:"crown",  color:"#ff6644",tier:3,
    fi:"Arenavoittaja",        en:"Arena Victor",       sv:"Arenavinnare",
    fi_d:"Voita areenakierros",en_d:"Win an arena round",sv_d:"Vinn en arenarunda",
    check:(s)=>s.arenaWins>=1},
  long_words_10: {icon:"diamond",color:"#44ddff",tier:3,
    fi:"Sanaetsijä",           en:"Word Hunter",        sv:"Ordjägare",
    fi_d:"Löydä 10 eri 6+ kirjaimen sanaa",en_d:"Find 10 different 6+ letter words",sv_d:"Hitta 10 olika 6+ bokstavsord",
    check:(s)=>s.longWordsTotal>=10},
  // -- TIER 4: Satoja pelejä, oikeasti hyvä --
  thousand_words:{icon:"scroll", color:"#ffcc00",tier:4,
    fi:"Sanalegenda",          en:"Word Legend",         sv:"Ordlegend",
    fi_d:"Löydä 1000 sanaa yhteensä",en_d:"Find 1000 words total",sv_d:"Hitta 1000 ord totalt",
    check:(s)=>s.totalWords>=1000},
  hundred_games: {icon:"trophy", color:"#ffcc00",tier:4,
    fi:"Omistautunut",         en:"Dedicated",          sv:"Hängiven",
    fi_d:"Pelaa 100 peliä",en_d:"Play 100 games",sv_d:"Spela 100 spel",
    check:(s)=>s.gamesPlayed>=100},
  long_word_7:   {icon:"diamond",color:"#ffcc00",tier:4,
    fi:"Sanamagiikka",         en:"Word Magic",         sv:"Ordmagi",
    fi_d:"Löydä 7+ kirjaimen sana",en_d:"Find a 7+ letter word",sv_d:"Hitta ett 7+ bokstavsord",
    check:(s)=>s.longestWord>=7},
  score_80:      {icon:"crown",  color:"#ffcc00",tier:4,
    fi:"Kahdeksankymppinen",   en:"Eighty Club",        sv:"Åttio",
    fi_d:"Saa 80 pistettä yhdessä pelissä",en_d:"Score 80 in one game",sv_d:"Få 80 poäng i ett spel",
    check:(s)=>s.bestScore>=80},
  combo_7:       {icon:"flame",  color:"#ffcc00",tier:4,
    fi:"Tulimyrsky",           en:"Firestorm",          sv:"Eldstorm",
    fi_d:"Saa 7 sanan kombo",en_d:"Get a 7 word combo",sv_d:"Få en 7-ordskombo",
    check:(s)=>s.bestCombo>=7},
  speed_12:      {icon:"bolt",   color:"#ff66ff",tier:4,
    fi:"Salamannopea",         en:"Speed Demon",        sv:"Blixtsnabb",
    fi_d:"Löydä 12 sanaa minuutissa",en_d:"Find 12 words per minute",sv_d:"Hitta 12 ord per minut",
    check:(s)=>s.bestWordsPerMin>=12},
  arena_5:       {icon:"sword",  color:"#ff66ff",tier:4,
    fi:"Gladiaattori",         en:"Gladiator",          sv:"Gladiator",
    fi_d:"Voita 5 areenakierrosta",en_d:"Win 5 arena rounds",sv_d:"Vinn 5 arenarundor",
    check:(s)=>s.arenaWins>=5},
  long_words_30: {icon:"diamond",color:"#ff66ff",tier:4,
    fi:"Sanakirja",            en:"Dictionary",         sv:"Ordbok",
    fi_d:"Löydä 30 eri 6+ kirjaimen sanaa",en_d:"Find 30 different 6+ letter words",sv_d:"Hitta 30 olika 6+ bokstavsord",
    check:(s)=>s.longWordsTotal>=30},
  marathon:      {icon:"trophy", color:"#ff6644",tier:4,
    fi:"Maratoonari",          en:"Marathoner",         sv:"Maratonlöpare",
    fi_d:"Pelaa 10 peliä yhden päivän aikana",en_d:"Play 10 games in one day",sv_d:"Spela 10 spel på en dag",
    check:(s)=>s.bestDayGames>=10},
  // -- TIER 5: Legenda, todella vaikea --
  three_thousand:{icon:"scroll", color:"#ff4400",tier:5,
    fi:"Sanatieteilijä",       en:"Lexicographer",      sv:"Lexikograf",
    fi_d:"Löydä 3000 sanaa yhteensä",en_d:"Find 3000 words total",sv_d:"Hitta 3000 ord totalt",
    check:(s)=>s.totalWords>=3000},
  score_100:     {icon:"crown",  color:"#ff4400",tier:5,
    fi:"Satanen",              en:"Century",            sv:"Hundra",
    fi_d:"Saa 100 pistettä yhdessä pelissä",en_d:"Score 100 in one game",sv_d:"Få 100 poäng i ett spel",
    check:(s)=>s.bestScore>=100},
  combo_10:      {icon:"flame",  color:"#ff4400",tier:5,
    fi:"Inferno",              en:"Inferno",            sv:"Inferno",
    fi_d:"Saa 10 sanan kombo",en_d:"Get a 10 word combo",sv_d:"Få en 10-ordskombo",
    check:(s)=>s.bestCombo>=10},
  arena_15:      {icon:"sword",  color:"#ff4400",tier:5,
    fi:"Mestari",              en:"Grand Master",       sv:"Stormästare",
    fi_d:"Voita 15 areenakierrosta",en_d:"Win 15 arena rounds",sv_d:"Vinn 15 arenarundor",
    check:(s)=>s.arenaWins>=15},
  perfect_game:  {icon:"crown",  color:"#ff4400",tier:5,
    fi:"Täydellinen peli",     en:"Perfect Game",       sv:"Perfekt spel",
    fi_d:"Löydä kaikki sanat yhdessä pelissä",en_d:"Find every word in a game",sv_d:"Hitta alla ord i ett spel",
    check:(s)=>s.perfectGames>=1},
  // -- TIER 6: Mahdoton / legenda --
  ten_thousand:  {icon:"scroll", color:"#ff0000",tier:6,
    fi:"Sanakoneen ydin",      en:"Word Engine",        sv:"Ordmaskin",
    fi_d:"Löydä 10 000 sanaa yhteensä",en_d:"Find 10,000 words total",sv_d:"Hitta 10 000 ord totalt",
    check:(s)=>s.totalWords>=10000},
  five_hundred_games:{icon:"trophy",color:"#ff0000",tier:6,
    fi:"Elinikäinen",          en:"Lifer",              sv:"Livstid",
    fi_d:"Pelaa 500 peliä",en_d:"Play 500 games",sv_d:"Spela 500 spel",
    check:(s)=>s.gamesPlayed>=500},
  score_150:     {icon:"crown",  color:"#ff0000",tier:6,
    fi:"Jumalallinen",         en:"Divine",             sv:"Gudomlig",
    fi_d:"Saa 150 pistettä yhdessä pelissä",en_d:"Score 150 in one game",sv_d:"Få 150 poäng i ett spel",
    check:(s)=>s.bestScore>=150},
  speed_15:      {icon:"bolt",   color:"#ff0000",tier:6,
    fi:"Aikamatkaaja",         en:"Time Traveler",      sv:"Tidsresenär",
    fi_d:"Löydä 15 sanaa minuutissa",en_d:"Find 15 words per minute",sv_d:"Hitta 15 ord per minut",
    check:(s)=>s.bestWordsPerMin>=15},
  arena_50:      {icon:"sword",  color:"#ff0000",tier:6,
    fi:"Kuolematon",           en:"Immortal",           sv:"Odödlig",
    fi_d:"Voita 50 areenakierrosta",en_d:"Win 50 arena rounds",sv_d:"Vinn 50 arenarundor",
    check:(s)=>s.arenaWins>=50},
  long_words_100:{icon:"diamond",color:"#ff0000",tier:6,
    fi:"Professori",           en:"Professor",          sv:"Professor",
    fi_d:"Löydä 100 eri 6+ kirjaimen sanaa",en_d:"Find 100 different 6+ letter words",sv_d:"Hitta 100 olika 6+ bokstavsord",
    check:(s)=>s.longWordsTotal>=100},
};

const INITIAL_STATS={totalWords:0,gamesPlayed:0,bestScore:0,bestCombo:0,longestWord:0,bestWordsPerMin:0,arenaGames:0,arenaWins:0,langsPlayed:[],perfectGames:0,longWordsTotal:0,bestDayGames:0,lastPlayDate:"",dayGames:0};

const SHADE_MAP={outline:0.4,dark:0.55,mid:0.7,light:0.85,highlight:1.0};
function PixelIcon({icon,color="currentColor",size=2,style={},badge=false}){
  const data=badge?BADGE_PIXELS[icon]:ICON_PIXELS[icon];
  if(!data)return null;
  const {cols,rows,colors}=data;
  const resolveColor=(ch)=>{
    if(ch===".")return"transparent";
    const v=colors[ch];
    if(v==="currentColor")return color;
    if(SHADE_MAP[v]!==undefined)return color;// shade handled via opacity
    return v;
  };
  const resolveOpacity=(ch)=>{
    if(ch===".")return 1;
    const v=colors[ch];
    return SHADE_MAP[v]!==undefined?SHADE_MAP[v]:1;
  };
  return(
    <div style={{display:"inline-grid",gridTemplateColumns:`repeat(${cols},${size}px)`,gridTemplateRows:`repeat(${rows.length},${size}px)`,
      gap:0,imageRendering:"pixelated",flexShrink:0,verticalAlign:"middle",transition:"filter 2s ease",...style}}>
      {rows.map((row,r)=>Array.from(row).map((ch,c)=>(
        <div key={r*cols+c} style={{width:size,height:size,
          background:resolveColor(ch),opacity:resolveOpacity(ch),transition:"background 2s ease"}}/>
      )))}
    </div>
  );
}

function TitleDemo({active,lang,onGearClick,showBubble,bubbleFading,hideGear}){
  const tc=TITLE_CONFIG[lang]||TITLE_CONFIG.fi;
  const titleChars=tc.title.split("");
  const demoWords=tc.demos;
  const[wordIdx,setWordIdx]=useState(0);
  const[charStep,setCharStep]=useState(-1); // -1=pause, 0..n-1=highlighting, n=hold
  const[scramble,setScramble]=useState(false);
  const[displayChars,setDisplayChars]=useState(titleChars);
  const timerRef=useRef(null);
  const wordIdxRef=useRef(wordIdx);
  wordIdxRef.current=wordIdx;
  const charStepRef=useRef(charStep);
  charStepRef.current=charStep;
  const prevLangRef=useRef(lang);
  const[gearBlend,setGearBlend]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setGearBlend(true),10000);return()=>clearTimeout(t);},[]);

  // Scramble animation on language change
  useEffect(()=>{
    if(prevLangRef.current===lang){setDisplayChars(titleChars);return;}
    prevLangRef.current=lang;
    setScramble(true);setWordIdx(0);setCharStep(-1);
    clearTimeout(timerRef.current);
    const letters="ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖ";
    let step=0;const maxSteps=8;
    const prevTitle=(TITLE_CONFIG[prevLangRef.current]||TITLE_CONFIG.fi).title;
    const maxLen=Math.max(titleChars.length,prevTitle.length);
    function scrambleTick(){
      step++;
      const chars=[];
      for(let i=0;i<titleChars.length;i++){
        if(step>maxSteps-3&&i<step-(maxSteps-3)){chars.push(titleChars[i]);}
        else{chars.push(letters[Math.floor(Math.random()*letters.length)]);}
      }
      setDisplayChars(chars);
      if(step<maxSteps){setTimeout(scrambleTick,70);}
      else{setDisplayChars(titleChars);setScramble(false);}
    }
    scrambleTick();
  },[lang]);

  useEffect(()=>{
    if(!active||scramble){return;}
    function tick(){
      const wi=wordIdxRef.current;
      const cs=charStepRef.current;
      const dw=demoWords[wi%demoWords.length];
      if(cs===-1){
        setCharStep(0);
        timerRef.current=setTimeout(tick,220);
      }else if(cs<dw.indices.length-1){
        setCharStep(cs+1);
        timerRef.current=setTimeout(tick,220);
      }else if(cs===dw.indices.length-1){
        setCharStep(cs+1);
        timerRef.current=setTimeout(tick,1400);
      }else{
        setWordIdx((wi+1)%demoWords.length);
        setCharStep(-1);
        timerRef.current=setTimeout(tick,800);
      }
    }
    timerRef.current=setTimeout(tick,1500);
    return()=>clearTimeout(timerRef.current);
  },[active,scramble,lang]);

  const dw=demoWords[wordIdx%demoWords.length];
  const lit=new Set();
  if(active&&!scramble&&charStep>=0){
    for(let i=0;i<=Math.min(charStep,dw.indices.length-1);i++)lit.add(dw.indices[i]);
  }
  return(
    <div style={{position:"relative",display:"inline-block"}}>
    <h1 style={{fontSize:"28px",letterSpacing:"4px",margin:"10px 0",display:"flex",justifyContent:"center",alignItems:"center",gap:"2px"}}>
      {displayChars.map((ch,i)=>{
        const isLit=lit.has(i);
        const isGear=!scramble&&i===tc.gearIdx;
        const baseStyle={
          color:scramble?"#ffcc0088":"#ffcc00",
          textShadow:scramble
            ?"3px 3px 0 #cc6600, 0 0 10px #ffcc0044"
            :isLit
            ?`3px 3px 0 #cc6600, 0 0 20px ${dw.color}cc, 0 0 40px ${dw.color}66`
            :"3px 3px 0 #cc6600, 0 0 20px #ffcc0066",
          transition:scramble?"none":"text-shadow 0.25s ease, transform 0.25s ease",
          transform:scramble?`translateY(${Math.random()>0.5?-2:2}px)`:isLit?"translateY(-2px)":"none",
          fontFamily:"'Press Start 2P',monospace",
          lineHeight:1,
        };
        if(isGear&&!hideGear){
          return <span key={i} onClick={onGearClick} style={{...baseStyle,
            textShadow:"none",
            cursor:"pointer",
            display:"inline-flex",alignItems:"center",justifyContent:"center",
            marginRight:"4px",
          }}><PixelIcon icon="gear" color={isLit?dw.color:gearBlend?"#ffcc00":"#88aacc"} size={1.7} style={{transition:"filter 2s ease"}}/></span>;
        }
        return <span key={i} style={baseStyle}>{ch}</span>;
      })}
    </h1>
    {/* Speech bubble below title pointing up */}
    {showBubble&&!scramble&&(
      <div style={{position:"absolute",bottom:"-52px",left:"50%",transform:"translateX(-50%)",
        animation:bubbleFading?"bubbleOut 0.6s ease-in forwards":`bubbleIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards`,
        whiteSpace:"nowrap",zIndex:50}}>
        <div style={{background:"#ffffff",color:"#000000",fontFamily:"'Press Start 2P',monospace",
          fontSize:"9px",padding:"8px 14px",borderRadius:"0px",position:"relative",lineHeight:"1.6",
          border:"3px solid #000000",boxShadow:"4px 4px 0 #00000044",
          imageRendering:"pixelated"}}>
          <div style={{position:"absolute",top:"-9px",left:"50%",transform:"translateX(-50%)",
            width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderBottom:"8px solid #000000"}}/>
          <div style={{position:"absolute",top:"-5px",left:"50%",transform:"translateX(-50%)",
            width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderBottom:"6px solid #ffffff"}}/>
          {lang==="en"?"Change settings like color theme!":lang==="sv"?"Ändra inställningar, som färgtema!":"Vaihda asetuksia, kuten väriteemaa!"}
        </div>
      </div>
    )}
    </div>
  );
}

// ============================================
// HALL OF FAME COMPONENT
// ============================================
function HallOfFame({gameMode,gameTime,currentScore,S,lang}){
  const[scores,setScores]=useState(null);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!gameMode||!gameTime||gameTime===0)return;
    setLoading(true);
    fetch(`${SERVER_URL}/api/hall-of-fame/${gameMode}/${gameTime}?lang=${lang||"fi"}`)
      .then(r=>r.json()).then(data=>{setScores(data);setLoading(false);})
      .catch(()=>{setScores([]);setLoading(false);});
  },[gameMode,gameTime,currentScore,lang]);
  if(!gameMode||!gameTime||gameTime===0)return null;
  const label=gameMode==="tetris"?"Tetris":lang==="en"?"Normal":lang==="sv"?"Normal":"Normaali";
  const timeLabel=gameTime===120?"2 min":lang==="en"?"6.7 min":"6,7 min";
  const hofTitle=lang==="en"?"RECORDS":lang==="sv"?"REKORD":"ENNÄTYKSET";
  const hofLoading=lang==="en"?"Loading...":lang==="sv"?"Laddar...":"Ladataan...";
  const hofEmpty=lang==="en"?"No results yet":lang==="sv"?"Inga resultat ännu":"Ei tuloksia vielä";
  return(
    <div style={{border:`2px solid ${S.border}`,padding:"8px",background:S.dark,marginTop:"10px",animation:"fadeIn 0.8s ease"}}>
      <div style={{fontSize:"13px",color:S.yellow,marginBottom:"6px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelFlag lang={lang||"fi"} size={2}/>{hofTitle} — {label} {timeLabel}</div>
      {loading?<div style={{fontSize:"11px",color:"#556",textAlign:"center"}}>{hofLoading}</div>:
      !scores||scores.length===0?<div style={{fontSize:"11px",color:"#556",textAlign:"center"}}>{hofEmpty}</div>:
      <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
        {scores.map((s,i)=>{
          const isHighlight=currentScore&&s.score===currentScore&&i<10;
          return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 6px",
            background:i===0?"#ffcc0011":isHighlight?"#44ff8811":"transparent",
            border:i===0?`1px solid ${S.yellow}33`:isHighlight?`1px solid ${S.green}33`:"1px solid transparent"}}>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <span style={{fontSize:"11px",color:i===0?S.yellow:i<3?"#cccccc":"#556",minWidth:"20px"}}>{i+1}.</span>
              <span style={{fontSize:"13px",color:i===0?S.yellow:S.green}}>{s.nickname}</span>
            </div>
            <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
              <span style={{fontSize:"13px",color:S.yellow}}>{s.score}p</span>
              <span style={{fontSize:"11px",color:"#88ccaa"}}>{s.percentage}%</span>
            </div>
          </div>;
        })}
      </div>}
    </div>
  );
}

// Submit score to hall of fame
async function submitToHallOfFame({nickname,score,wordsFound,wordsTotal,gameMode,gameTime,lang}){
  if(!nickname||score<=0||!gameMode||!gameTime||gameTime===0)return null;
  try{
    const res=await fetch(`${SERVER_URL}/api/hall-of-fame`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({nickname,score,wordsFound,wordsTotal,gameMode,gameTime,lang:lang||"fi"})
    });
    if(!res.ok)return null;
    return await res.json();
  }catch{return null;}
}

// ============================================
// MAIN COMPONENT
// ============================================
export default function Piilosana(){
  const SZ=5,COMBO_WINDOW=4000;
  const[lang,setLang]=useState(()=>localStorage.getItem("piilosana_lang")||"fi");
  const[themeId,setThemeId]=useState(()=>localStorage.getItem("piilosana_theme")||"dark");
  const[uiSize,setUiSize]=useState(()=>localStorage.getItem("piilosana_size")||"normal");
  const[confettiOn,setConfettiOn]=useState(()=>localStorage.getItem("piilosana_confetti")!=="off");
  const[soundTheme,setSoundTheme]=useState(()=>localStorage.getItem("piilosana_sound")||"retro");
  const[musicTheme,setMusicTheme]=useState(()=>localStorage.getItem("piilosana_music")||"off");
  const[audioStarted,setAudioStarted]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showMenuOptions,setShowMenuOptions]=useState(false);
  const[settingsBubble,setSettingsBubble]=useState(false);
  const[bubbleFading,setBubbleFading]=useState(false);
  const[flagBubble,setFlagBubble]=useState(false);
  const[flagBubbleFading,setFlagBubbleFading]=useState(false);
  const[showWordInfo,setShowWordInfo]=useState(false);
  const[gearBlend,setGearBlend]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setGearBlend(true),10000);return()=>clearTimeout(t);},[]);

  // Auth state
  const[authUser,setAuthUser]=useState(()=>{
    try{const s=localStorage.getItem("piilosana_auth");return s?JSON.parse(s):null;}catch{return null;}
  });
  const[showAuth,setShowAuth]=useState(false);
  const[authMode,setAuthMode]=useState("login"); // "login", "register", or "forgot"
  const[authError,setAuthError]=useState("");
  const[authLoading,setAuthLoading]=useState(false);
  const[authSuccess,setAuthSuccess]=useState("");
  const[showFirstTimeAuth,setShowFirstTimeAuth]=useState(()=>!localStorage.getItem("piilosana_auth")&&!sessionStorage.getItem("piilosana_auth_dismissed"));

  const applySettings=useCallback((s)=>{
    if(!s)return;
    if(s.theme){setThemeId(s.theme);localStorage.setItem("piilosana_theme",s.theme);}
    if(s.lang){setLang(s.lang);localStorage.setItem("piilosana_lang",s.lang);}
    if(s.size){setUiSize(s.size);localStorage.setItem("piilosana_size",s.size);}
    if(typeof s.confetti==="boolean"){setConfettiOn(s.confetti);localStorage.setItem("piilosana_confetti",s.confetti?"on":"off");}
    if(s.sound){setSoundTheme(s.sound);localStorage.setItem("piilosana_sound",s.sound);}
    if(s.music){setMusicTheme(s.music);localStorage.setItem("piilosana_music",s.music);}
  },[]);
  const doLogin=useCallback(async(nickname,password)=>{
    setAuthLoading(true);setAuthError("");
    try{
      const res=await fetch(`${SERVER_URL}/api/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname,password})});
      const data=await res.json();
      if(!res.ok){setAuthError(data.error||"Virhe");setAuthLoading(false);return false;}
      setAuthUser(data.user);localStorage.setItem("piilosana_auth",JSON.stringify(data.user));
      localStorage.setItem("piilosana_auth_cred",JSON.stringify({nickname,password}));
      if(data.user.settings)applySettings(data.user.settings);
      setShowAuth(false);setShowFirstTimeAuth(false);setAuthLoading(false);return true;
    }catch{setAuthError("Yhteysvirhe");setAuthLoading(false);return false;}
  },[applySettings]);

  const doRegister=useCallback(async(nickname,password,email,email2)=>{
    setAuthLoading(true);setAuthError("");
    try{
      const res=await fetch(`${SERVER_URL}/api/register`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname,password,email,email2})});
      const data=await res.json();
      if(!res.ok){setAuthError(data.error||"Virhe");setAuthLoading(false);return false;}
      setAuthUser(data.user);localStorage.setItem("piilosana_auth",JSON.stringify(data.user));
      localStorage.setItem("piilosana_auth_cred",JSON.stringify({nickname,password}));
      setShowAuth(false);setShowFirstTimeAuth(false);setAuthLoading(false);return true;
    }catch{setAuthError("Yhteysvirhe");setAuthLoading(false);return false;}
  },[]);

  const[googleClientId,setGoogleClientId]=useState(null);
  // Fetch Google Client ID on mount
  useEffect(()=>{
    fetch(`${SERVER_URL}/api/google-client-id`).then(r=>r.json()).then(d=>{
      if(d.clientId){
        setGoogleClientId(d.clientId);
        // Load GSI script
        if(!document.getElementById("gsi-script")){
          const s=document.createElement("script");
          s.id="gsi-script";s.src="https://accounts.google.com/gsi/client";s.async=true;
          document.head.appendChild(s);
        }
      }
    }).catch(()=>{});
  },[]);

  const doGoogleLogin=useCallback(async(credential)=>{
    setAuthLoading(true);setAuthError("");
    try{
      const res=await fetch(`${SERVER_URL}/api/google-login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential})});
      const data=await res.json();
      if(!res.ok){setAuthError(data.error||"Virhe");setAuthLoading(false);return false;}
      setAuthUser(data.user);localStorage.setItem("piilosana_auth",JSON.stringify(data.user));
      localStorage.setItem("piilosana_auth_cred",JSON.stringify({nickname:data.user.nickname,google:true}));
      if(data.user.settings)applySettings(data.user.settings);
      setShowAuth(false);setShowFirstTimeAuth(false);setAuthLoading(false);return true;
    }catch{setAuthError("Yhteysvirhe");setAuthLoading(false);return false;}
  },[applySettings]);

  const doLogout=useCallback(()=>{
    setAuthUser(null);localStorage.removeItem("piilosana_auth");localStorage.removeItem("piilosana_auth_cred");
  },[]);
  const saveSettingsToServer=useCallback(async(settings)=>{
    try{
      const cred=JSON.parse(localStorage.getItem("piilosana_auth_cred")||"null");
      if(!cred)return;
      await fetch(`${SERVER_URL}/api/settings`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nickname:cred.nickname,password:cred.password,settings})});
    }catch{}
  },[]);
  const syncSettings=useCallback((overrides={})=>{
    if(!authUser)return;
    const s={theme:themeId,lang,size:uiSize,confetti:confettiOn,sound:soundTheme,music:musicTheme,...overrides};
    saveSettingsToServer(s);
  },[authUser,themeId,lang,uiSize,confettiOn,soundTheme,musicTheme,saveSettingsToServer]);

  const doChangePassword=useCallback(async(currentPassword,newPassword)=>{
    setAuthLoading(true);setAuthError("");setAuthSuccess("");
    try{
      const res=await fetch(`${SERVER_URL}/api/change-password`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nickname:authUser?.nickname,currentPassword,newPassword})});
      const data=await res.json();
      if(!res.ok){setAuthError(data.error||"Virhe");setAuthLoading(false);return;}
      localStorage.setItem("piilosana_auth_cred",JSON.stringify({nickname:authUser.nickname,password:newPassword}));
      setAuthSuccess(lang==="en"?"Password changed!":lang==="sv"?"Lösenord ändrat!":"Salasana vaihdettu!");
      setAuthLoading(false);
    }catch{setAuthError("Yhteysvirhe");setAuthLoading(false);}
  },[authUser,lang]);

  const doForgotPassword=useCallback(async(email)=>{
    setAuthLoading(true);setAuthError("");setAuthSuccess("");
    try{
      const res=await fetch(`${SERVER_URL}/api/forgot-password`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
      const data=await res.json();
      if(!res.ok){setAuthError(data.error||"Virhe");setAuthLoading(false);return;}
      setAuthSuccess(data.message);setAuthLoading(false);
    }catch{setAuthError("Yhteysvirhe");setAuthLoading(false);}
  },[]);

  // ============================================
  // ACHIEVEMENTS STATE
  // ============================================
  const[achStats,setAchStats]=useState(()=>{
    try{const s=localStorage.getItem("piilosana_ach_stats");return s?{...INITIAL_STATS,...JSON.parse(s)}:{...INITIAL_STATS};}catch{return{...INITIAL_STATS};}
  });
  const[achUnlocked,setAchUnlocked]=useState(()=>{
    try{const s=localStorage.getItem("piilosana_ach_unlocked");return s?JSON.parse(s):{};}catch{return{};}
  });
  const[showAchievements,setShowAchievements]=useState(false);
  const[newAchPopup,setNewAchPopup]=useState(null);
  const achStatsRef=useRef(achStats);
  achStatsRef.current=achStats;
  const achUnlockedRef=useRef(achUnlocked);
  achUnlockedRef.current=achUnlocked;

  // Load achievements from server on login
  useEffect(()=>{
    if(authUser?.achievements){
      const serverAch=authUser.achievements;
      if(serverAch.stats){
        const merged={...INITIAL_STATS,...serverAch.stats};
        // Take max of local and server stats
        const local=achStatsRef.current;
        const best={...merged};
        for(const k of["totalWords","gamesPlayed","bestScore","bestCombo","longestWord","bestWordsPerMin","arenaGames","arenaWins"]){
          best[k]=Math.max(local[k]||0,merged[k]||0);
        }
        best.langsPlayed=[...new Set([...(local.langsPlayed||[]),...(merged.langsPlayed||[])])];
        setAchStats(best);localStorage.setItem("piilosana_ach_stats",JSON.stringify(best));
      }
      if(serverAch.unlocked){
        const merged={...achUnlockedRef.current,...serverAch.unlocked};
        setAchUnlocked(merged);localStorage.setItem("piilosana_ach_unlocked",JSON.stringify(merged));
      }
    }
  },[authUser]);

  const saveAchievementsToServer=useCallback(async(stats,unlocked)=>{
    try{
      const cred=JSON.parse(localStorage.getItem("piilosana_auth_cred")||"null");
      if(!cred)return;
      await fetch(`${SERVER_URL}/api/achievements`,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nickname:cred.nickname,password:cred.password,achievements:{stats,unlocked}})});
    }catch{}
  },[]);

  const checkAchievements=useCallback((newStats)=>{
    const prev=achUnlockedRef.current;
    const newUnlocked={...prev};
    let anyNew=null;
    for(const[id,ach]of Object.entries(ACHIEVEMENTS)){
      if(!prev[id]&&ach.check(newStats)){
        newUnlocked[id]=Date.now();
        anyNew=id;
      }
    }
    if(anyNew){
      setAchUnlocked(newUnlocked);
      localStorage.setItem("piilosana_ach_unlocked",JSON.stringify(newUnlocked));
      achUnlockedRef.current=newUnlocked;
      // Show popup for the last unlocked one
      setNewAchPopup(anyNew);
      setTimeout(()=>setNewAchPopup(null),3500);
      saveAchievementsToServer(newStats,newUnlocked);
    }
    return newUnlocked;
  },[saveAchievementsToServer]);

  const updateAchStats=useCallback((updates)=>{
    setAchStats(prev=>{
      const next={...prev,...updates};
      // For array fields like langsPlayed, merge
      if(updates.langsPlayed){
        next.langsPlayed=[...new Set([...(prev.langsPlayed||[]),...updates.langsPlayed])];
      }
      // Keep max values for best* fields
      for(const k of["bestScore","bestCombo","longestWord","bestWordsPerMin"]){
        if(updates[k]!==undefined)next[k]=Math.max(prev[k]||0,updates[k]);
      }
      // Accumulate counters
      if(updates.addWords)next.totalWords=(prev.totalWords||0)+updates.addWords;
      if(updates.addGames)next.gamesPlayed=(prev.gamesPlayed||0)+updates.addGames;
      if(updates.addArenaGames)next.arenaGames=(prev.arenaGames||0)+updates.addArenaGames;
      if(updates.addArenaWins)next.arenaWins=(prev.arenaWins||0)+updates.addArenaWins;
      if(updates.addLongWords)next.longWordsTotal=(prev.longWordsTotal||0)+updates.addLongWords;
      if(updates.addPerfect)next.perfectGames=(prev.perfectGames||0)+1;
      // Daily games tracking
      if(updates.dayDate){
        if(prev.lastPlayDate===updates.dayDate){
          next.dayGames=(prev.dayGames||0)+1;
        }else{
          next.dayGames=1;
        }
        next.lastPlayDate=updates.dayDate;
        next.bestDayGames=Math.max(prev.bestDayGames||0,next.dayGames);
      }
      localStorage.setItem("piilosana_ach_stats",JSON.stringify(next));
      achStatsRef.current=next;
      checkAchievements(next);
      return next;
    });
  },[checkAchievements]);

  const theme=getTheme(themeId);
  const langConf=getLangConf(lang);
  const WORDS_SET=langConf.words;
  const trie=useMemo(()=>langConf.trie,[lang]);
  const t=T[lang]||T.fi;
  const rawSounds=useSounds(soundTheme);
  // Wrap sounds with mute check
  const sounds=useMemo(()=>{
    if(soundTheme==="off")return{
      init:async()=>{},playByLength:()=>{},playCombo:()=>{},playWrong:()=>{},
      playTick:()=>{},playCountdown:()=>{},playGo:()=>{},playEnding:()=>{},
      playChomp:()=>{},playBtn:()=>{},reinit:async()=>{}
    };
    return rawSounds;
  },[soundTheme,rawSounds]);
  const isLarge=uiSize==="large";

  // Game settings (must be declared before states that reference them)
  const[gameTime,setGameTime]=useState(120); // 120 (2min) or 402 (6min 42s = "6,7")
  const[letterMult,setLetterMult]=useState(false); // scrabble-style letter values
  const[soloMode,setSoloMode]=useState("normal"); // 'normal' or 'tetris'
  const[dropKey,setDropKey]=useState(0); // increments on gravity to trigger drop animation
  const[gameMode,setGameMode]=useState("classic"); // 'classic' or 'battle'

  const[state,setState]=useState("menu");
  const[grid,setGrid]=useState([]);
  const[valid,setValid]=useState(new Set());
  const[found,setFound]=useState([]);
  const[sel,setSel]=useState([]);
  const[dragging,setDragging]=useState(false);
  const[word,setWord]=useState("");
  const[time,setTime]=useState(gameTime);
  const[score,setScore]=useState(0);
  const[msg,setMsg]=useState(null);
  const[shake,setShake]=useState(false);
  const[popups,setPopups]=useState([]);
  const[combo,setCombo]=useState(0);
  const[lastFoundTime,setLastFoundTime]=useState(0);
  const[flashKey,setFlashKey]=useState(0);
  // Solo nickname for hall of fame
  const[soloNickname,setSoloNickname]=useState(()=>{
    try{const a=JSON.parse(localStorage.getItem("piilosana_auth")||"null");if(a?.nickname)return a.nickname;}catch{}
    return localStorage.getItem("piilosana_nick")||"";
  });
  const[hofSubmitted,setHofSubmitted]=useState(false);
  // Ending
  const[ending,setEnding]=useState(null);
  const[endingProgress,setEndingProgress]=useState(0);
  const[eatenCells,setEatenCells]=useState(new Set());
  // Multiplayer states
  const[mode,setMode]=useState(null);
  const[socket,setSocket]=useState(null);
  const[roomCode,setRoomCode]=useState("");
  const[nickname,setNickname]=useState(()=>{
    try{const a=JSON.parse(localStorage.getItem("piilosana_auth")||"null");if(a?.nickname)return a.nickname;}catch{}
    return "";
  });
  // Sync nicknames when authUser changes
  useEffect(()=>{
    if(authUser?.nickname){
      setNickname(authUser.nickname);
      setSoloNickname(authUser.nickname);
      localStorage.setItem("piilosana_nick",authUser.nickname);
    }
  },[authUser]);

  const[players,setPlayers]=useState([]);
  const[playerId,setPlayerId]=useState(null);
  const[isHost,setIsHost]=useState(false);
  const[multiScores,setMultiScores]=useState([]);
  const[multiRankings,setMultiRankings]=useState(null);
  const[lobbyState,setLobbyState]=useState("enter_name");
  const[lobbyError,setLobbyError]=useState("");
  const[socketConnected,setSocketConnected]=useState(false);
  const[publicRooms,setPublicRooms]=useState([]);
  const[currentMultiGrid,setCurrentMultiGrid]=useState([]);
  const[countdown,setCountdown]=useState(0);
  const[multiValidWords,setMultiValidWords]=useState([]);
  const[multiAllFoundWords,setMultiAllFoundWords]=useState({});
  // Battle mode states
  const[otherSelections,setOtherSelections]=useState({}); // {playerId: {nickname, cells}}
  const[battleMsg,setBattleMsg]=useState(null); // {word, finder, points} - flash when someone finds
  // Public game (Piilosauna)
  const[publicState,setPublicState]=useState(null); // null|'waiting'|'countdown'|'playing'|'end'
  const[publicScores,setPublicScores]=useState([]);
  const[publicPlayerCount,setPublicPlayerCount]=useState(0);
  const[publicRankings,setPublicRankings]=useState(null);
  const[publicRound,setPublicRound]=useState(0);
  const[publicAllFound,setPublicAllFound]=useState([]);
  const[publicCountdown,setPublicCountdown]=useState(5);
  const[publicNextCountdown,setPublicNextCountdown]=useState(0);
  const[publicOnlineCount,setPublicOnlineCount]=useState(0);

  // Poll arena player count from REST API when on main menu
  useEffect(()=>{
    if(mode!==null)return;
    let active=true;
    const poll=async()=>{
      try{const r=await fetch(`${SERVER_URL}/api/arena-count`);const d=await r.json();if(active)setPublicOnlineCount(prev=>prev===d.count?prev:d.count);}catch{}
    };
    poll();
    const iv=setInterval(poll,10000);
    return()=>{active=false;clearInterval(iv);};
  },[mode]);

  const gRef=useRef(null);
  const wordBarRef=useRef(null);
  const tRef=useRef(null);
  const nicknameRef=useRef(null);
  const popupIdRef=useRef(0);
  const lastSubmittedWordRef=useRef("");
  const foundRef=useRef([]);

  // Keep foundRef in sync with found state (avoids stale closure in socket handlers)
  useEffect(()=>{foundRef.current=found;},[found]);

  // Show settings bubble briefly on main menu
  useEffect(()=>{
    if(mode!==null){setSettingsBubble(false);setBubbleFading(false);setFlagBubble(false);setFlagBubbleFading(false);return;}
    const shown=sessionStorage.getItem("piilosana_bubble_shown");
    if(shown)return;
    const t1=setTimeout(()=>setSettingsBubble(true),2000);
    const t2=setTimeout(()=>setBubbleFading(true),6000);
    const t3=setTimeout(()=>{setSettingsBubble(false);setBubbleFading(false);sessionStorage.setItem("piilosana_bubble_shown","1");},7000);
    const flagShown=sessionStorage.getItem("piilosana_flag_bubble_shown");
    const t4=flagShown?null:setTimeout(()=>setFlagBubble(true),8500);
    const t5=flagShown?null:setTimeout(()=>setFlagBubbleFading(true),12500);
    const t6=flagShown?null:setTimeout(()=>{setFlagBubble(false);setFlagBubbleFading(false);sessionStorage.setItem("piilosana_flag_bubble_shown","1");},13500);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);if(t4)clearTimeout(t4);if(t5)clearTimeout(t5);if(t6)clearTimeout(t6);};
  },[mode]);

  // (arena count polling handled above via /api/arena-count)

  // Global button sound — plays on any <button> tap
  useEffect(()=>{
    const handler=async(e)=>{if(e.target.closest("button")){setAudioStarted(true);await sounds.init();sounds.playBtn();}};
    document.addEventListener("pointerdown",handler,true);
    return()=>document.removeEventListener("pointerdown",handler,true);
  },[sounds]);

  const addPopup=useCallback((text,color,x,y)=>{
    let px=x,py=y;
    if(px===undefined||py===undefined){
      const el=gRef.current||wordBarRef.current;
      if(el){const r=el.getBoundingClientRect();px=r.left+r.width/2;py=r.top+r.height/2;}
      else{px=window.innerWidth/2;py=window.innerHeight/2;}
    }
    const id=++popupIdRef.current;
    setPopups(p=>[...p,{id,text,color,x:px,y:py}]);
    setTimeout(()=>setPopups(p=>p.filter(pp=>pp.id!==id)),1100);
  },[]);

  const startSolo=useCallback(async(overrideMode,overrideTime)=>{
    await sounds.init();
    const gt=overrideTime!==undefined?overrideTime:gameTime;
    let bg=null,bw=new Set();
    for(let i=0;i<30;i++){const g=makeGrid(SZ,lang),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setTime(gt);setScore(0);setMsg(null);
    setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);
    setEnding(null);setEndingProgress(0);setDropKey(0);
    setMode("solo");setCountdown(5);setState("countdown");
    if(overrideMode!==undefined)setSoloMode(overrideMode);
    if(overrideTime!==undefined)setGameTime(overrideTime);
    window.scrollTo(0,0);
  },[trie,sounds,gameTime,soloMode]);

  const start=useCallback(async()=>{
    if(mode==="solo"){
      await startSolo();
    }
  },[mode,startSolo]);

  // Countdown timer (shared for solo + multi)
  useEffect(()=>{
    if(state!=="countdown")return;
    if(countdown<=0){sounds.playGo();setState("play");return;}
    sounds.playCountdown(countdown);
    const t=setTimeout(()=>setCountdown(c=>c-1),1000);
    return()=>clearTimeout(t);
  },[state,countdown,sounds]);

  // Timer (solo mode only — multiplayer uses server timer_tick + game_over)
  const startTimeRef=useRef(null);
  const soundsRef=useRef(sounds);
  soundsRef.current=sounds;
  // Re-init synths when sound theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(soundTheme!=="off")rawSounds.reinit();},[soundTheme]);
  // Background music — plays whenever user has interacted (audio context unlocked)
  useMusic(musicTheme,audioStarted);
  useEffect(()=>{
    if(state!=="play"||mode==="multi"||mode==="public"||gameTime===0)return;
    startTimeRef.current=Date.now();
    let lastSecond=gameTime;
    tRef.current=setInterval(()=>{
      const elapsed=Math.floor((Date.now()-startTimeRef.current)/1000);
      const remaining=Math.max(0,gameTime-elapsed);
      setTime(remaining);
      if(remaining!==lastSecond){
        lastSecond=remaining;
        if(remaining<=15&&remaining>0)soundsRef.current.playTick();
      }
      if(remaining<=0){
        clearInterval(tRef.current);
        // Pick random ending
        const e=ENDINGS[Math.floor(Math.random()*ENDINGS.length)];
        setEnding(e);
        soundsRef.current.playEnding();
        setState("ending");
      }
    },200);
    return()=>clearInterval(tRef.current);
  },[state,mode,gameTime,soloMode]);

  // Ending animation (solo + multi)
  useEffect(()=>{
    if(state!=="ending")return;
    let progress=0;
    // Phase 1: show name/emoji big (progress 0-0.35, ~1s) - no cells eaten yet
    // Phase 2: cells start disappearing (progress 0.35-1.0, ~1.5s)
    // Phase 3: linger (1.0-1.3) then end (~0.5s)
    // Total ~3s
    const t=setInterval(()=>{
      progress+=0.043;
      setEndingProgress(progress);
      // Only start eating cells after intro phase
      if(progress>0.35){
        const eatProgress=(progress-0.35)/0.65; // 0 to 1
        const cellCount=Math.min(SZ*SZ, Math.floor(eatProgress * SZ * SZ));
        setEatenCells(prev=>{
          const n=new Set(prev);
          for(let i=0;i<cellCount;i++) n.add(i);
          return n;
        });
        if(eatProgress>0.05) soundsRef.current.playChomp();
      }
      if(progress>=1.3){
        clearInterval(t);
        setState("end");
        if(mode==="multi")setLobbyState("results");
      }
    },100);
    return()=>clearInterval(t);
  },[state,mode]);

  // Track achievements when game ends
  useEffect(()=>{
    if(state!=="end")return;
    const wordsFound=found.length;
    if(wordsFound===0&&score===0)return; // no-op game
    const longestFound=found.reduce((max,w)=>Math.max(max,w.length),0);
    // Use actual elapsed time if available, fall back to gameTime setting
    const actualElapsed=startTimeRef.current?Math.max(1,Math.floor((Date.now()-startTimeRef.current)/1000)):null;
    const gameTimeSec=gameTime===0?(actualElapsed||60):(actualElapsed||gameTime||120);
    const wordsPerMin=gameTimeSec>0?Math.round(wordsFound/(gameTimeSec/60)*10)/10:0;
    // Count 6+ letter words found this game
    const longWordsThisGame=found.filter(w=>w.length>=6).length;
    // Perfect game check (solo non-unlimited only)
    const isPerfect=mode==="solo"&&gameTime!==0&&soloMode!=="tetris"&&valid.size>0&&wordsFound>=valid.size;
    // Daily games tracking
    const today=new Date().toISOString().slice(0,10);
    const updates={addWords:wordsFound,addGames:1,bestScore:score,longestWord:longestFound,bestWordsPerMin:wordsPerMin,
      langsPlayed:[lang],addLongWords:longWordsThisGame};
    if(isPerfect)updates.addPerfect=1;
    // Day tracking
    updates.dayDate=today;
    if(mode==="public"){
      updates.addArenaGames=1;
      if(publicRankings&&publicRankings.length>0){
        const myNick=(authUser?.nickname||nickname||"").toUpperCase();
        if(publicRankings[0]?.nickname?.toUpperCase()===myNick)updates.addArenaWins=1;
      }
    }
    updateAchStats(updates);
  },[state]);

  // Track combo achievements during play
  const achComboRef=useRef(0);
  useEffect(()=>{
    if(combo>achComboRef.current)achComboRef.current=combo;
    if(state==="end"&&achComboRef.current>0){
      const c=achComboRef.current;
      achComboRef.current=0;
      setAchStats(prev=>{
        if(c>prev.bestCombo){
          const next={...prev,bestCombo:c};
          localStorage.setItem("piilosana_ach_stats",JSON.stringify(next));
          achStatsRef.current=next;
          checkAchievements(next);
          return next;
        }
        return prev;
      });
    }
  },[combo,state,checkAchievements]);

  // Cell detection - astroid hitbox clipped to cell bounds + adjacency bias.
  // Astroid |dx|^⅔+|dy|^⅔ ≤ (w/2)^⅔ with cusps at cell edges.
  // Large diagonal dead zones prevent accidental cross-picks during diagonal swipes.
  const cellAt=useCallback((x,y,lastCell)=>{
    if(!gRef.current)return null;
    let best=null,bestDist=Infinity;
    for(const el of gRef.current.querySelectorAll("[data-c]")){
      const rect=el.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const dx=Math.abs(x-cx),dy=Math.abs(y-cy);
      const hw=rect.width/2;
      if(dx>hw||dy>hw)continue;
      const dist=Math.pow(dx,2/3)+Math.pow(dy,2/3);
      const limit=Math.pow(hw,2/3);
      if(dist<=limit){
        const[row,col]=el.dataset.c.split(",").map(Number);
        let score=dist;
        if(lastCell&&(Math.abs(row-lastCell.r)>1||Math.abs(col-lastCell.c)>1))score+=limit*0.5;
        if(score<bestDist){best={r:row,c:col};bestDist=score;}
      }
    }
    return best;
  },[]);

  const adj=(a,b)=>Math.abs(a.r-b.r)<=1&&Math.abs(a.c-b.c)<=1&&!(a.r===b.r&&a.c===b.c);
  const isSel=(r,c)=>sel.some(s=>s.r===r&&s.c===c);

  // Submit word (handles both solo and multiplayer)
  const submitWord=useCallback((currentSel,currentWord)=>{
    if(currentWord.length<3)return;

    // Public game (Piilosauna)
    if(mode==="public"&&socket){
      if(!WORDS_SET.has(currentWord)){
        setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
        return;
      }
      if(found.includes(currentWord)){
        setMsg({t:currentWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
        return;
      }
      lastSubmittedWordRef.current=currentWord;
      socket.emit("public_word_found",{word:currentWord});
      return;
    }

    if(mode==="multi"&&socket){
      // Client-side dictionary check before sending to server
      if(!WORDS_SET.has(currentWord)){
        setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
        return;
      }
      lastSubmittedWordRef.current=currentWord;
      if(gameMode==="battle"){
        const cells=currentSel.map(s=>({r:s.r,c:s.c}));
        socket.emit("battle_word_found",{word:currentWord,cells});
      }else{
        socket.emit("word_found",{word:currentWord});
      }
      return;
    }
    
    // Solo mode logic
    const now=Date.now();
    // Always validate against valid set (pre-computed words traceable on current grid)
    // In tetris mode, valid is recomputed after each gravity step
    const isValidWord=valid.has(currentWord);
    const alreadyFound=found.includes(currentWord);
    // In tetris mode, allow re-finding same word (grid changed, new path)
    if(isValidWord&&(soloMode==="tetris"?true:!alreadyFound)){
      let p=letterMult?ptsLetters(currentWord,lang):pts(currentWord.length);
      const isCombo=(now-lastFoundTime)<COMBO_WINDOW&&lastFoundTime>0;
      const newCombo=isCombo?combo+1:1;
      setCombo(newCombo);setLastFoundTime(now);
      const comboMult=newCombo>=5?3:newCombo>=3?2:1;
      const totalPts=p*comboMult;
      setScore(s=>s+totalPts);setFound(f=>[...f,currentWord]);
      setMsg({t:currentWord,ok:true,p:totalPts,combo:newCombo});
      setFlashKey(k=>k+1);
      sounds.playByLength(currentWord.length);
      if(newCombo>=3)setTimeout(()=>sounds.playCombo(newCombo),200);
      {
        // Position popup at the center of selected cells on the grid
        let popX,popY;
        if(gRef.current&&currentSel.length>0){
          const mid=currentSel[Math.floor(currentSel.length/2)];
          const cellEl=gRef.current.querySelector(`[data-c="${mid.r},${mid.c}"]`);
          if(cellEl){const cr=cellEl.getBoundingClientRect();popX=cr.left+cr.width/2;popY=cr.top+cr.height/2;}
          else{const rect=gRef.current.getBoundingClientRect();popX=rect.left+rect.width/2;popY=rect.top+rect.height/2;}
        }else{const rect=(gRef.current||wordBarRef.current).getBoundingClientRect();popX=rect.left+rect.width/2;popY=rect.top+rect.height/2;}
        const color=currentWord.length>=6?"#ff66ff":currentWord.length>=5?"#ffcc00":"#00ff88";
        let text=`+${totalPts}`;
        if(newCombo>=3)text+=` x${comboMult}`;
        addPopup(text,color,popX,popY);
      }
      // Tetris mode: remove used cells, apply gravity, recompute valid words
      if(soloMode==="tetris"){
        const cells=currentSel.map(s=>({r:s.r,c:s.c}));
        const newGrid=applyGravityClient(grid,cells,lang);
        setGrid(newGrid);
        setDropKey(k=>k+1);
        const newValid=findWords(newGrid,trie);
        setValid(newValid);
      }
    }else if(found.includes(currentWord)){
      setMsg({t:currentWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }else{
      setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }
  },[valid,found,lastFoundTime,combo,sounds,addPopup,mode,socket,gameMode,soloMode,grid,trie,letterMult]);

  // Active grid: use currentMultiGrid in multi mode, grid in solo
  const activeGrid=mode==="multi"?currentMultiGrid:grid;

  // Drag handlers
  const onDragStart=useCallback((r,c)=>{if(state!=="play")return;setDragging(true);const s=[{r,c}];setSel(s);selRef.current=s;setWord(activeGrid[r]?.[c]||"");setMsg(null);
    // Battle mode: broadcast selection start
    if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:[{r,c}]});
  },[state,activeGrid,mode,gameMode,socket]);
  const selRef=useRef([]);
  const onDragMove=useCallback((x,y)=>{
    if(!dragging||state!=="play")return;
    const last=selRef.current.length>0?selRef.current[selRef.current.length-1]:null;
    const cell=cellAt(x,y,last);if(!cell)return;
    setSel(prev=>{
      let next=prev;
      if(prev.length>0&&prev[prev.length-1].r===cell.r&&prev[prev.length-1].c===cell.c)return prev;
      if(prev.length>=2&&prev[prev.length-2].r===cell.r&&prev[prev.length-2].c===cell.c){next=prev.slice(0,-1);setWord(next.map(s=>activeGrid[s.r][s.c]).join(""));}
      else if(prev.some(p=>p.r===cell.r&&p.c===cell.c))return prev;
      else if(prev.length>0&&!adj(prev[prev.length-1],cell))return prev;
      else{next=[...prev,cell];setWord(next.map(s=>activeGrid[s.r][s.c]).join(""));}
      // Battle mode: broadcast selection
      if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:next.map(s=>({r:s.r,c:s.c}))});
      selRef.current=next;
      return next;
    });
  },[dragging,state,cellAt,activeGrid,mode,gameMode,socket]);
  const onDragEnd=useCallback(()=>{if(!dragging)return;setDragging(false);submitWord(sel,word);setSel([]);selRef.current=[];setWord("");
    // Battle mode: clear selection broadcast
    if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:[]});
  },[dragging,sel,word,submitWord,mode,gameMode,socket]);

  const fmt=s=>`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`;

  // Grid flash animation via ref (no key remount)
  useEffect(()=>{
    if(flashKey<=0||!gRef.current)return;
    const el=gRef.current;
    el.style.animation="none";
    void el.offsetHeight; // force reflow
    el.style.animation="gridFlash 0.5s ease-out";
    if(combo>=3)el.style.animation="comboGlow 1s infinite";
  },[flashKey]);
  useEffect(()=>{
    if(!gRef.current)return;
    gRef.current.style.animation=combo>=3&&state==="play"?"comboGlow 1s infinite":"none";
  },[combo,state]);

  // Socket.io connection setup for multiplayer
  useEffect(()=>{
    if(mode!=="multi"&&mode!=="public")return;
    
    const newSocket=io(SERVER_URL,{reconnection:true,reconnectionDelay:1000,reconnectionDelayMax:5000,reconnectionAttempts:5});
    
    newSocket.on("connect",()=>{
      console.log("Connected to server");
      setSocketConnected(true);
      // Auto-join public arena if logged in (skipped nickname screen)
      if(mode==="public"){
        const auth=(() => {try{return JSON.parse(localStorage.getItem("piilosana_auth")||"null")}catch{return null}})();
        if(auth?.nickname){
          newSocket.emit("join_public",{nickname:auth.nickname,lang});
        }
      }
    });

    newSocket.on("disconnect",()=>{
      setSocketConnected(false);
      setLobbyState(prev=>{
        if(prev==="creating"||prev==="joining"){
          setLobbyError("Yhteys palvelimeen katkesi. Yritä uudelleen.");
          return "choose";
        }
        return prev;
      });
    });

    newSocket.on("connect_error",(err)=>{
      console.log("Connection error:",err.message);
      setSocketConnected(false);
    });
    
    newSocket.on("room_list",({rooms:roomList})=>{
      setPublicRooms(roomList||[]);
    });

    newSocket.on("room_created",({roomCode:code,playerId:pid})=>{
      setRoomCode(code);
      setPlayerId(pid);
      setIsHost(true);
      setLobbyState("waiting");
    });

    newSocket.on("room_joined",({roomCode:code,playerId:pid})=>{
      setRoomCode(code);
      setPlayerId(pid);
      setIsHost(false);
      setLobbyState("waiting");
    });

    newSocket.on("room_update",({players:playerList})=>{
      setPlayers(playerList);
      // Check if we became host (host transfer on disconnect)
      const me=playerList.find(p=>p.playerId===newSocket.id);
      if(me&&me.isHost)setIsHost(true);
    });
    
    newSocket.on("game_started",({grid:g,validWords:vw,gameMode:gm})=>{
      setCurrentMultiGrid(g);
      setValid(new Set(vw));
      setFound([]);
      setWord("");
      setTime(gameTime);
      setScore(0);
      setMsg(null);
      setCombo(0);
      setLastFoundTime(0);
      setPopups([]);
      setMultiScores([]);
      setEatenCells(new Set());
      setEnding(null);
      setEndingProgress(0);
      setGameMode(gm||"classic");
      setOtherSelections({});
      setBattleMsg(null);
      setLobbyState("playing");
      setCountdown(5);setState("countdown");
    });
    
    newSocket.on("timer_tick",({remaining})=>{
      setTime(remaining);
      if(remaining<=15&&remaining>0)sounds.playTick();
    });
    
    newSocket.on("score_update",({scores})=>{
      setMultiScores(scores);
    });
    
    newSocket.on("word_result",({valid:isValid,message,points,combo:c})=>{
      if(isValid){
        const w=lastSubmittedWordRef.current;
        if(w&&!foundRef.current.includes(w)){
          setScore(s=>s+points);
          setFound(f=>[...f,w]);
          setCombo(c);
          setLastFoundTime(Date.now());
          setFlashKey(k=>k+1);
          sounds.playByLength(w.length);
          if(c>=3)setTimeout(()=>sounds.playCombo(c),200);
          setMsg({t:w,ok:true,p:points,combo:c});
          {
            const rect=(gRef.current||wordBarRef.current).getBoundingClientRect();
            const popX=rect.left+rect.width/2,popY=rect.top+rect.height/2;
            const color=w.length>=6?"#ff66ff":w.length>=5?"#ffcc00":"#00ff88";
            let text=`+${points}`;
            if(c>=3)text+=` x${Math.floor(points/(pts(w.length)))}`;
            addPopup(text,color,popX,popY);
          }
        }
      }else{
        setMsg({t:lastSubmittedWordRef.current||"",ok:false,m:message||"Ei kelpaa"});
        setShake(true);
        setTimeout(()=>setShake(false),400);
        sounds.playWrong();
      }
      setSel([]);
      setWord("");
    });
    
    // Battle mode: grid update (someone found a word, grid changed)
    newSocket.on("battle_grid_update",({grid:newGrid,removedCells,word:foundWord,finder,finderId,points:p})=>{
      setBattleMsg({word:foundWord,finder,finderId,points:p});
      setTimeout(()=>setBattleMsg(null),2000);
      setCurrentMultiGrid(newGrid);
      setDropKey(k=>k+1);
      // Clear other player's selection since grid changed
      setOtherSelections({});
    });

    // Battle mode: other players' selections
    newSocket.on("battle_player_selection",({playerId:pid,nickname:nick,cells})=>{
      setOtherSelections(prev=>({...prev,[pid]:{nickname:nick,cells}}));
    });

    newSocket.on("game_over",({rankings,validWords:vw,allFoundWords:afw})=>{
      setMultiRankings(rankings);
      if(vw)setMultiValidWords(vw);
      if(afw)setMultiAllFoundWords(afw);
      // Start ending animation (random per player)
      const e=ENDINGS[Math.floor(Math.random()*ENDINGS.length)];
      setEnding(e);
      sounds.playEnding();
      setState("ending");
    });
    
    newSocket.on("error",({message})=>{
      setLobbyError(message);
      setLobbyState("choose");
    });
    
    newSocket.on("room_not_found",()=>{
      setLobbyError("Huonetta ei löydy!");
      setTimeout(()=>setLobbyError(""),3000);
    });

    // ---- PUBLIC GAME (PIILOSAUNA) events ----
    newSocket.on("public_countdown",({grid:g,validWords:vw,roundNumber})=>{
      setGrid(g);setValid(new Set(vw));setFound([]);setSel([]);setWord("");setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setEnding(null);setDropKey(0);
      setPublicState("countdown");setPublicCountdown(5);setPublicRound(roundNumber);
      setPublicRankings(null);setState("countdown");setCountdown(5);
    });
    newSocket.on("public_join_midgame",({grid:g,validWords:vw,timeLeft:tl,roundNumber})=>{
      setGrid(g);setValid(new Set(vw));setFound([]);setSel([]);setWord("");setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setEnding(null);setDropKey(0);
      setTime(tl);setPublicState("playing");setPublicRound(roundNumber);setPublicRankings(null);setState("play");
      startTimeRef.current=Date.now();
    });
    newSocket.on("public_game_start",()=>{
      setPublicState("playing");setState("play");startTimeRef.current=Date.now();
    });
    newSocket.on("public_timer_tick",({remaining})=>{
      setTime(remaining);
      if(remaining<=15&&remaining>0)soundsRef.current.playTick();
    });
    newSocket.on("public_score_update",({scores})=>{
      setPublicScores(scores);
    });
    newSocket.on("public_word_result",({valid:isValid,message,points})=>{
      if(isValid){
        const w=lastSubmittedWordRef.current;
        setFound(prev=>[...prev,w]);
        const p=points||pts(w.length);
        setScore(prev=>prev+p);
        const color=w.length>=6?"#ff66ff":w.length>=5?"#ffcc00":"#00ff88";
        addPopup(`+${p}`,color);
        soundsRef.current.playByLength(w.length);
      }else{
        setMsg({t:lastSubmittedWordRef.current,ok:false,m:message});
        setShake(true);setTimeout(()=>setShake(false),400);
        soundsRef.current.playWrong();
      }
    });
    newSocket.on("public_game_over",({rankings,validWords:vw,allFoundWords:afw})=>{
      setPublicState("end");setPublicRankings(rankings);setState("end");
      setValid(new Set(vw));
      setPublicAllFound(afw||[]);
      const e=ENDINGS[Math.floor(Math.random()*ENDINGS.length)];
      setEnding(e);soundsRef.current.playEnding();
    });
    newSocket.on("public_player_count",({count})=>{
      setPublicPlayerCount(count);
    });
    newSocket.on("public_waiting",({playerCount:c,nextRoundCountdown:nrc})=>{
      setPublicState("waiting");setPublicPlayerCount(c);
      if(nrc)setPublicNextCountdown(nrc);
    });
    newSocket.on("public_next_round_countdown",({seconds})=>{
      setPublicNextCountdown(seconds);
    });

    setSocket(newSocket);
    
    return()=>{
      if(newSocket)newSocket.disconnect();
    };
  },[mode]);
  const missed=useMemo(()=>state==="end"?[...valid].filter(w=>!found.includes(w)).sort((a,b)=>b.length-a.length):[],[state,valid,found]);
  const totalPossible=useMemo(()=>[...valid].reduce((s,w)=>s+(letterMult?ptsLetters(w,lang):pts(w.length)),0),[valid,letterMult,lang]);
  const wordColor=(len)=>len>=7?"#ff66ff":len>=6?"#ffaa00":len>=5?"#ffcc00":len>=4?"#00ffaa":"#00ff88";


  // Multiplayer helper functions
  const createRoom=useCallback(()=>{
    if(!socket||!nickname)return;
    if(!socket.connected){
      setLobbyError(lang==="en"?"No connection. Please wait...":"Ei yhteyttä palvelimeen. Odota hetki...");
      return;
    }
    setLobbyError("");
    setLobbyState("creating");
    socket.emit("create_room",{nickname,mode:"multi",lang});
    // Timeout: if no response in 10s, go back
    setTimeout(()=>{
      setLobbyState(prev=>{
        if(prev==="creating"){setLobbyError("Palvelin ei vastannut. Yritä uudelleen.");return "choose";}
        return prev;
      });
    },10000);
  },[socket,nickname]);

  const joinRoom=useCallback((code)=>{
    if(!socket||!code||!nickname)return;
    if(!socket.connected){
      setLobbyError(lang==="en"?"No connection. Please wait...":"Ei yhteyttä palvelimeen. Odota hetki...");
      return;
    }
    setLobbyError("");
    setLobbyState("joining");
    socket.emit("join_room",{roomCode:code,nickname,mode:"multi"});
    setTimeout(()=>{
      setLobbyState(prev=>{
        if(prev==="joining"){setLobbyError("Palvelin ei vastannut. Yritä uudelleen.");return "choose";}
        return prev;
      });
    },10000);
  },[socket,nickname]);
  
  // Unlimited mode: refresh grid with new letters
  const refreshGrid=useCallback(()=>{
    if(state!=="play"||gameTime!==0)return;
    let bg=null,bw=new Set();
    for(let i=0;i<30;i++){const g=makeGrid(SZ,lang),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setMsg(null);
    setDropKey(0);
  },[state,gameTime,trie,lang]);

  // Unlimited mode: end game voluntarily
  const endUnlimited=useCallback(()=>{
    if(gameTime!==0)return;
    const e=ENDINGS[Math.floor(Math.random()*ENDINGS.length)];
    setEnding(e);
    sounds.playEnding();
    setState("ending");
  },[gameTime,sounds]);

  const startGame=useCallback((selectedMode)=>{
    if(!socket||!isHost||players.length<2)return;
    const gm=selectedMode||gameMode;
    let bg=null,bw=new Set();
    for(let i=0;i<30;i++){const g=makeGrid(SZ,lang),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
    setCurrentMultiGrid(bg);
    setGameMode(gm);
    socket.emit("start_game",{grid:bg,validWords:Array.from(bw),gameMode:gm,gameTime});
  },[socket,isHost,players,trie,gameMode,gameTime,lang]);
  
  const playAgain=useCallback(()=>{
    setLobbyState("waiting");
    setMultiRankings(null);
    setFound([]);
    setScore(0);
    setWord("");
    setState("menu");
  },[]);
  
  const returnToModeSelect=useCallback(()=>{
    if(socket){
      if(mode==="public")socket.emit("leave_public");
      socket.disconnect();
    }
    setSocket(null);
    setMode(null);
    setPlayers([]);
    setRoomCode("");
    setNickname("");
    setPublicRooms([]);
    setPlayerId(null);
    setIsHost(false);
    setMultiScores([]);
    setMultiRankings(null);
    setLobbyState("enter_name");
    setLobbyError("");
    setSocketConnected(false);
    setGameMode("classic");
    setOtherSelections({});
    setBattleMsg(null);
    setPublicState(null);
    setPublicScores([]);
    setPublicRankings(null);
    setState("menu");
  },[socket,mode]);
  
  const refreshRooms=useCallback(()=>{
    if(socket&&socket.connected)socket.emit("list_rooms");
  },[socket]);

  // Switch from solo to multi (or from multi results)
  const switchToMulti=useCallback(async()=>{
    if(socket)socket.disconnect();
    setSocket(null);
    await sounds.init();
    setMode("multi");
    setPlayers([]);
    setRoomCode("");
    setPlayerId(null);
    setIsHost(false);
    setMultiScores([]);
    setMultiRankings(null);
    setLobbyState("enter_name");
    setLobbyError("");
    setSocketConnected(false);
    setPublicRooms([]);
    setState("menu");
  },[socket,sounds]);

  // Switch from multi to solo
  const switchToSolo=useCallback(()=>{
    if(socket)socket.disconnect();
    setSocket(null);
    setMode("solo");
    setPlayers([]);
    setRoomCode("");
    setPlayerId(null);
    setIsHost(false);
    setMultiScores([]);
    setMultiRankings(null);
    setLobbyState("enter_name");
    setLobbyError("");
    setSocketConnected(false);
    setPublicRooms([]);
    setState("menu");
  },[socket]);

  // Render multiplayer screens
  const S=theme;
  const modeSelectJSX=(
    <div style={{textAlign:"center",marginTop:"20px",animation:"fadeIn 0.5s ease",maxWidth:"600px",width:"100%"}}>
      {/* Main button — ARENA */}
      <button onClick={async()=>{await sounds.init();setMode("public");if(authUser){setPublicState("waiting");}else{setPublicState("nickname");}}} style={{fontFamily:S.font,fontSize:"22px",color:S.bg,background:"#ff6644",border:"none",padding:"24px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #cc3311",width:"100%",minHeight:"70px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"6px",marginBottom:"10px"}}
        onMouseEnter={e=>{e.currentTarget.style.transform="translate(-2px,-2px)";e.currentTarget.style.boxShadow="6px 6px 0 #cc3311"}}
        onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="4px 4px 0 #cc3311"}}>
        <span style={{display:"flex",alignItems:"center",gap:"8px"}}>{t.arena}<span style={{fontSize:"11px",display:"inline-flex",alignItems:"center",gap:"4px",opacity:0.7}}><PixelIcon icon="person" color={S.bg} size={1.3}/>{publicOnlineCount}</span></span>
        <span style={{fontSize:"9px",opacity:0.8}}>{t.arenaDesc}</span>
      </button>

      {/* Two smaller buttons side by side */}
      <div style={{display:"flex",gap:"8px"}}>
        <button onClick={()=>startSolo("normal",120)} style={{fontFamily:S.font,fontSize:"14px",color:S.bg,background:S.green,border:"none",padding:"18px 16px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"4px"}}
          onMouseEnter={e=>{e.currentTarget.style.transform="translate(-2px,-2px)";e.currentTarget.style.boxShadow="5px 5px 0 #008844"}}
          onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="3px 3px 0 #008844"}}>
          <span>{t.practice}</span>
          <span style={{fontSize:"8px",opacity:0.7}}>{t.practiceDesc}</span>
        </button>
        <button onClick={async()=>{await sounds.init();setMode("multi");if(authUser){setNickname(authUser.nickname);setLobbyState("choose");}else{setLobbyState("enter_name");setTimeout(()=>{if(nicknameRef.current)nicknameRef.current.focus();},50);}}} style={{fontFamily:S.font,fontSize:"14px",color:S.bg,background:S.yellow,border:"none",padding:"18px 16px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"4px"}}
          onMouseEnter={e=>{e.currentTarget.style.transform="translate(-2px,-2px)";e.currentTarget.style.boxShadow="5px 5px 0 #cc8800"}}
          onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="3px 3px 0 #cc8800"}}>
          <span>{t.customGame}</span>
          <span style={{fontSize:"8px",opacity:0.7}}>{t.customDesc}</span>
        </button>
      </div>

      {/* Expandable solo options under the smaller buttons */}
      <button onClick={()=>setShowMenuOptions(v=>!v)} style={{fontFamily:S.font,fontSize:"9px",color:"#556",background:"transparent",border:"none",padding:"8px",cursor:"pointer",display:"flex",alignItems:"center",gap:"4px",margin:"0 auto",marginTop:"4px"}}>
        <span style={{transform:showMenuOptions?"rotate(90deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▶</span>
        {t.advancedOptions}
      </button>
      {showMenuOptions&&(
        <div style={{padding:"16px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"4px",animation:"fadeIn 0.3s ease"}}>
          <div style={{marginBottom:"12px"}}>
            <div style={{fontSize:"9px",color:S.green,marginBottom:"6px"}}>{t.gameMode}</div>
            <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setSoloMode("normal")} style={{fontFamily:S.font,fontSize:"10px",color:soloMode==="normal"?S.bg:S.green,background:soloMode==="normal"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer"}}>{t.modeNormal}</button>
              <button onClick={()=>setSoloMode("tetris")} style={{fontFamily:S.font,fontSize:"10px",color:soloMode==="tetris"?S.bg:S.purple,background:soloMode==="tetris"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:"5px"}}><PixelIcon icon="arrow" color={soloMode==="tetris"?S.bg:S.purple} size={1.5}/>{t.modeTetris}</button>
            </div>
          </div>
          <div style={{marginBottom:"12px"}}>
            <div style={{fontSize:"9px",color:S.green,marginBottom:"6px"}}>{t.time}</div>
            <div style={{display:"flex",gap:"6px",justifyContent:"center"}}>
              <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"10px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer"}}>2 MIN</button>
              <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"10px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 14px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
              <button onClick={()=>setGameTime(0)} style={{fontFamily:S.font,fontSize:"10px",color:gameTime===0?S.bg:"#44ddff",background:gameTime===0?"#44ddff":"transparent",border:"2px solid #44ddff",padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:"4px"}}><PixelIcon icon="infinity" color={gameTime===0?S.bg:"#44ddff"} size={1.5}/>{t.unlimited}</button>
            </div>
          </div>
          <div>
            <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"10px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 14px",cursor:"pointer"}}>
              {letterMult?"✓ ":""}{t.letterMultBtn}
            </button>
          </div>
          <button onClick={()=>startSolo()} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.green,border:"none",padding:"10px 24px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",marginTop:"14px"}}>{t.practice}</button>
        </div>
      )}

      {/* Footer */}
      <div style={{marginTop:"24px"}}>
        <div style={{fontSize:"12px",color:"#445",marginBottom:"4px"}}>{WORDS_SET.size.toLocaleString()} {t.words}</div>
        <button onClick={()=>setShowWordInfo(true)} style={{fontFamily:S.font,fontSize:"9px",color:S.green,background:"transparent",border:"none",padding:"2px 6px",cursor:"pointer",textDecoration:"underline",opacity:0.7}}>{t.readMoreWords}</button>
        <div style={{fontSize:"9px",color:"#334",marginTop:"4px"}}>v{VERSION} · © Matti Kuokkanen 2026</div>
        <div style={{fontSize:"9px",marginTop:"4px",display:"flex",gap:"10px",justifyContent:"center"}}>
          <a href="mailto:info@piilosana.com" style={{color:"#445",textDecoration:"none"}}>{lang==="en"?"Feedback":lang==="sv"?"Feedback":"Palaute"}</a>
          <a href="/privacy" style={{color:"#445",textDecoration:"none"}}>{lang==="en"?"Privacy":lang==="sv"?"Integritet":"Tietosuoja"}</a>
        </div>
      </div>
    </div>
  );
  
  const isWinner=multiRankings&&multiRankings.length>0&&multiRankings[0].playerId===playerId;
  const myRank=multiRankings?multiRankings.findIndex(p=>p.playerId===playerId):0;
  const ResultsScreen=()=>(
    <div style={{textAlign:"center",marginTop:"20px",animation:"fadeIn 1s ease",position:"relative"}}>
      <ConfettiCelebration isWinner={isWinner}/>
      <div style={{position:"relative",zIndex:1,border:`3px solid ${isWinner?S.yellow:S.green}`,padding:"20px",boxShadow:`0 0 30px ${isWinner?S.yellow:S.green}33`,background:S.dark,maxWidth:"600px"}}>
        {myRank===0&&<div style={{fontSize:"36px",marginBottom:"8px",animation:"pop 0.6s ease"}}>🏆</div>}
        {myRank===1&&<div style={{fontSize:"36px",marginBottom:"8px",animation:"pop 0.6s ease"}}>🥈</div>}
        {myRank===2&&<div style={{fontSize:"36px",marginBottom:"8px",animation:"pop 0.6s ease"}}>🥉</div>}
        <div style={{fontSize:"16px",color:isWinner?S.yellow:myRank<=2?"#cccccc":S.green,marginBottom:"4px",animation:myRank<=2?"pop 0.6s ease":"none"}}>{isWinner?t.youWon:myRank===1?"2.":myRank===2?"3.":t.gameOver}</div>
        <p style={{fontSize:"11px",color:S.green,marginBottom:"12px"}}>{t.results}</p>
        {multiRankings&&multiRankings.slice(0,5).map((p,i)=>{
          const medals=["🥇","🥈","🥉"];
          const isMe=p.playerId===playerId;
          return(
            <div key={i} style={{fontSize:"11px",color:isMe?S.yellow:S.green,padding:"6px 10px",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:isMe?"#ffcc0011":"transparent",animation:isMe?"pop 0.4s ease":"none"}}>
              <span>{medals[i]||`${i+1}.`} {p.nickname}</span>
              <span>{p.score}p ({p.wordsFound} {t.words})</span>
            </div>
          );
        })}
        {gameMode==="classic"&&multiValidWords.length>0&&(
          <div style={{fontSize:"11px",color:"#88ccaa",marginTop:"8px"}}>{(() => {const allF=new Set();Object.values(multiAllFoundWords).forEach(ws=>ws.forEach(w=>allF.add(w)));return `${allF.size} / ${multiValidWords.length} ${t.words} (${Math.round(allF.size/multiValidWords.length*100)}%)`;})()}</div>
        )}
        {/* Word summary for multiplayer - separate boxes */}
        {gameMode==="battle"&&multiRankings&&(()=>{
          // Battle mode: show all found words per player, no missed words
          const allFound=new Set();
          Object.values(multiAllFoundWords).forEach(ws=>ws.forEach(w=>allFound.add(w)));
          const foundWords=[...allFound].sort((a,b)=>b.length-a.length||a.localeCompare(b));
          const nickMap={};
          if(multiRankings)multiRankings.forEach(p=>{nickMap[p.playerId]=p.nickname;});
          return foundWords.length>0&&(
            <div style={{marginTop:"16px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"14px",color:S.purple,marginBottom:"6px",display:"flex",alignItems:"center",gap:"6px"}}><PixelIcon icon="swords" color={S.purple} size={2}/>LÖYDETYT ({foundWords.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {foundWords.map((w,i)=>{
                  const finders=Object.entries(multiAllFoundWords).filter(([,ws])=>ws.includes(w)).map(([pid])=>nickMap[pid]||"?");
                  return(
                    <span key={i} style={{fontSize:"14px",background:"#2a1a3a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}} title={finders.join(", ")}>{w.toUpperCase()}</span>
                  );
                })}
              </div>
            </div>
          );
        })()}
        {gameMode!=="battle"&&multiValidWords.length>0&&(()=>{
          const allFound=new Set();
          Object.values(multiAllFoundWords).forEach(ws=>ws.forEach(w=>allFound.add(w)));
          const foundWords=[...allFound].sort((a,b)=>b.length-a.length||a.localeCompare(b));
          const missedWords=[...multiValidWords].filter(w=>!allFound.has(w)).sort((a,b)=>b.length-a.length||a.localeCompare(b));
          const nickMap={};
          if(multiRankings)multiRankings.forEach(p=>{nickMap[p.playerId]=p.nickname;});
          return(<>
            {foundWords.length>0&&(
              <div style={{marginTop:"16px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",animation:"fadeIn 0.8s ease"}}>
                <div style={{fontSize:"14px",color:S.green,marginBottom:"6px"}}>LÖYDETYT ({foundWords.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                  {foundWords.map((w,i)=>{
                    const finders=Object.entries(multiAllFoundWords).filter(([,ws])=>ws.includes(w)).map(([pid])=>nickMap[pid]||"?");
                    return(
                      <span key={i} style={{fontSize:"14px",background:"#1a3a2a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}} title={finders.join(", ")}>{w.toUpperCase()}</span>
                    );
                  })}
                </div>
              </div>
            )}
            {missedWords.length>0&&(
              <div style={{marginTop:"10px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
                <div style={{fontSize:"14px",color:"#ff6666",marginBottom:"6px"}}>JÄIVÄT LÖYTÄMÄTTÄ ({missedWords.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                  {missedWords.map((w,i)=>(
                    <span key={i} style={{fontSize:"14px",background:"#2a1a1a",padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                  ))}
                </div>
              </div>
            )}
          </>);
        })()}
        <div style={{marginTop:"16px",display:"flex",flexDirection:"column",gap:"8px",alignItems:"center"}}>
          {isHost&&<button onClick={playAgain} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>{t.newCustom}</button>}
          <button onClick={switchToSolo} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>{t.practice}</button>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>{t.menu}</button>
        </div>
      </div>
    </div>
  );


  return(
    <div style={{fontFamily:S.font,background:S.bg,color:S.green,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",userSelect:"none",WebkitUserSelect:"none",padding:"8px 4px",position:"relative",overflow:"hidden"}}
      onMouseMove={e=>onDragMove(e.clientX,e.clientY)} onMouseUp={onDragEnd} onTouchEnd={onDragEnd}>
      {/* Top bar: language selector + login button - only visible in main menu */}
      {mode===null&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",width:"100%",maxWidth:"600px",marginBottom:"4px"}}>
        <div style={{display:"flex",gap:"6px"}}>
          {Object.entries(LANG_CONFIG).map(([code,lc])=>(
            <button key={code} onClick={()=>{setLang(code);localStorage.setItem("piilosana_lang",code);setFlagBubble(false);sessionStorage.setItem("piilosana_flag_bubble_shown","1");syncSettings({lang:code});}}
              style={{fontFamily:S.font,fontSize:"9px",background:lang===code?S.dark:"transparent",
                border:lang===code?`2px solid ${S.green}`:`2px solid ${S.border}`,
                padding:"4px 8px",cursor:"pointer",color:lang===code?S.green:"#556",
                boxShadow:lang===code?`0 0 8px ${S.green}44`:"none",
                transition:"all 0.2s",display:"flex",alignItems:"center",gap:"5px"}}>
              <PixelFlag lang={code} size={2}/>
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
          <button onClick={()=>{setShowSettings(v=>!v);setSettingsBubble(false);}} style={{fontFamily:S.font,fontSize:"9px",color:"#88aacc",
            background:"transparent",border:`2px solid ${S.border}`,padding:"4px 8px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s"}}>
            <PixelIcon icon="gear" color="#88aacc" size={2}/>
          </button>
          <button onClick={()=>setShowAchievements(true)} style={{fontFamily:S.font,fontSize:"9px",color:"#ffcc00",
            background:"transparent",border:`2px solid ${S.border}`,padding:"4px 8px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s",position:"relative"}}>
            <PixelIcon icon="trophy" color="#ffcc00" size={2} badge={true}/>
            {Object.keys(achUnlocked).length>0&&<span style={{fontSize:"8px"}}>{Object.keys(achUnlocked).length}/{Object.keys(ACHIEVEMENTS).length}</span>}
          </button>
          <button onClick={()=>{setShowAuth(true);setShowFirstTimeAuth(false);}} style={{fontFamily:S.font,fontSize:"9px",color:authUser?S.green:S.yellow,
            background:authUser?S.dark:"transparent",border:`2px solid ${authUser?S.green:S.border}`,padding:"4px 8px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s",
            boxShadow:authUser?`0 0 8px ${S.green}44`:"none"}}>
            <PixelIcon icon="person" color={authUser?S.green:S.yellow} size={2}/>
            {authUser&&authUser.nickname}
          </button>
        </div>
      </div>}
      {mode===null&&flagBubble&&(
        <div style={{width:"100%",maxWidth:"600px",
          animation:flagBubbleFading?"flagBubbleOut 0.6s ease-in forwards":"flagBubbleIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards",
          zIndex:50,marginBottom:"4px"}}>
          <div style={{background:"#ffffff",color:"#000000",fontFamily:"'Press Start 2P',monospace",
            fontSize:"8px",padding:"8px 12px",borderRadius:"0px",position:"relative",lineHeight:"1.6",
            border:"3px solid #000000",boxShadow:"4px 4px 0 #00000044",imageRendering:"pixelated",
            width:"max-content",maxWidth:"100%"}}>
            <div style={{position:"absolute",top:"-9px",left:"20px",
              width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderBottom:"8px solid #000000"}}/>
            <div style={{position:"absolute",top:"-5px",left:"22px",
              width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderBottom:"6px solid #ffffff"}}/>
            {lang==="en"?"Play in different languages!":lang==="sv"?"Spela på olika språk!":"Pelaa eri kielillä!"}
          </div>
        </div>
      )}
      {/* Word info modal */}
      {showWordInfo&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={()=>setShowWordInfo(false)}>
          <div style={{background:S.bg,border:`3px solid ${S.green}`,padding:"20px",maxWidth:"500px",width:"100%",maxHeight:"80vh",overflowY:"auto",fontFamily:S.font,position:"relative"}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowWordInfo(false)} style={{position:"absolute",top:"8px",right:"8px",fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,width:"32px",height:"32px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            <div style={{fontSize:"14px",color:S.green,marginBottom:"16px"}}>{t.wordInfoTitle}</div>
            <div style={{fontSize:"9px",color:S.green,lineHeight:"1.8",marginBottom:"12px"}}>{t.wordInfoBody1}</div>
            <div style={{fontSize:"9px",color:S.green,lineHeight:"1.8",marginBottom:"12px"}}>{t.wordInfoBody2}</div>
            <div style={{fontSize:"9px",color:S.green,lineHeight:"1.8",marginBottom:"16px"}}>{t.wordInfoBody3}</div>
            <div style={{fontSize:"9px",color:S.green,marginBottom:"8px",borderTop:`1px solid ${S.border}`,paddingTop:"12px"}}>
              <div style={{marginBottom:"8px",color:S.yellow}}>{t.wordInfoSources}:</div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇫🇮</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceFi}</span>
                  <span style={{color:"#556",marginLeft:"8px"}}>{LANG_CONFIG.fi.words.size.toLocaleString()}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇬🇧</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceEn}</span>
                  <span style={{color:"#556",marginLeft:"8px"}}>{LANG_CONFIG.en.words.size.toLocaleString()}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇸🇪</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceSv}</span>
                  <span style={{color:"#556",marginLeft:"8px"}}>{LANG_CONFIG.sv.words.size.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{fontCSS}</style>
      <style>{`
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
        @keyframes pop{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}
        @keyframes snowfall{0%{transform:translateY(0);opacity:0.6}100%{transform:translateY(30px);opacity:0}}
        @keyframes fadeIn{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{text-shadow:0 0 5px #ff444444}50%{text-shadow:0 0 20px #ff444488}}
        @keyframes floatUp{0%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}50%{opacity:1;transform:translate(-50%,-100%) scale(1.5)}100%{opacity:0;transform:translate(-50%,-180%) scale(1.8)}}
        @keyframes comboGlow{0%,100%{box-shadow:0 0 5px #ffcc0044}50%{box-shadow:0 0 25px #ffcc0088,0 0 50px #ff66ff44}}
        @keyframes epicPulse{0%{transform:scale(1)}50%{transform:scale(1.05)}100%{transform:scale(1)}}
        @keyframes wordFlash{0%{background:#00ff8833;box-shadow:0 0 20px #00ff8866}100%{background:transparent;box-shadow:none}}
        @keyframes gridFlash{0%{border-color:#00ff88;box-shadow:0 0 30px #00ff8866}100%{border-color:#334;box-shadow:0 0 30px #00ff8822}}
        @keyframes scoreJump{0%{transform:scale(1)}30%{transform:scale(1.4)}100%{transform:scale(1)}}
        @keyframes cellShrinkSpin{0%{transform:scale(1) rotate(0);opacity:1}100%{transform:scale(0) rotate(180deg);opacity:0}}
        @keyframes cellFloat{0%{transform:translateY(0);opacity:1}40%{transform:translateY(-10px);opacity:0.8}100%{transform:translateY(60px);opacity:0}}
        @keyframes cellExplode{0%{transform:scale(1) translate(0,0);opacity:1}100%{transform:scale(0.3) translate(var(--ex,0px),var(--ey,0px));opacity:0}}
        @keyframes cellBurn{0%{opacity:1;filter:brightness(1)}40%{filter:brightness(2) saturate(2)}100%{opacity:0;filter:brightness(0.2);transform:scale(0.8)}}
        @keyframes cellVortex{0%{transform:scale(1) rotate(0) translate(0,0);opacity:1}100%{transform:scale(0) rotate(720deg) translate(0,0);opacity:0}}
        @keyframes cellBeamUp{0%{transform:translateY(0) scaleY(1);opacity:1}50%{transform:translateY(-10px) scaleY(1.3);opacity:0.7}100%{transform:translateY(-80px) scaleY(0.1);opacity:0}}
        @keyframes cellTornado{0%{transform:rotate(0) translate(0,0);opacity:1}100%{transform:rotate(360deg) translate(80px,-40px);opacity:0}}
        @keyframes cellFreeze{0%{opacity:1;filter:hue-rotate(0)}30%{filter:hue-rotate(180deg) brightness(1.5)}60%{transform:scale(1.1)}100%{transform:scale(0.8) rotate(5deg);opacity:0;filter:hue-rotate(180deg) brightness(2)}}
        @keyframes cellDragonFire{0%{opacity:1;filter:brightness(1)}30%{filter:brightness(3) saturate(3)}100%{opacity:0;transform:scale(0.5);filter:brightness(0.1)}}
        @keyframes cellGlitch{0%{opacity:1;transform:translate(0,0)}25%{transform:translate(5px,-3px);filter:hue-rotate(90deg)}50%{transform:translate(-5px,3px);filter:hue-rotate(180deg)}75%{transform:translate(3px,5px);filter:hue-rotate(270deg)}100%{opacity:0;transform:translate(-10px,-10px);filter:hue-rotate(360deg)}}
        @keyframes cellDrop{0%{transform:translateY(-100%);opacity:0.5}60%{transform:translateY(5%);opacity:1}80%{transform:translateY(-2%)}100%{transform:translateY(0)}}
        @keyframes cellPop{0%{transform:scale(1)}50%{transform:scale(0);opacity:0}100%{transform:scale(0);opacity:0}}
        @keyframes bubbleIn{0%{opacity:0;transform:translateX(-50%) translateY(8px) scale(0.3)}30%{opacity:1;transform:translateX(-50%) translateY(-4px) scale(1.05)}50%{transform:translateX(-50%) translateY(2px) scale(0.97)}70%{transform:translateX(-50%) translateY(-1px) scale(1.01)}100%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
        @keyframes bubbleOut{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}40%{opacity:0.8;transform:translateX(-50%) translateY(-3px) scale(1.03)}100%{opacity:0;transform:translateX(-50%) translateY(10px) scale(0.3)}}
        @keyframes flagBubbleIn{0%{opacity:0;transform:translateY(8px) scale(0.3)}30%{opacity:1;transform:translateY(-4px) scale(1.05)}50%{transform:translateY(2px) scale(0.97)}70%{transform:translateY(-1px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes flagBubbleOut{0%{opacity:1;transform:translateY(0) scale(1)}40%{opacity:0.8;transform:translateY(-3px) scale(1.03)}100%{opacity:0;transform:translateY(10px) scale(0.3)}}
        @keyframes bubbleFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-3px)}}
        @keyframes floatUnicorn{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-20px) rotate(5deg)}}
        @keyframes scanlines{0%,100%{opacity:1}}
        @keyframes electricPulse{0%,100%{opacity:0.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}}
      `}</style>

      {popups.map(p=><ScorePopup key={p.id}{...p}/>)}

      {(mode===null||(mode==="solo"&&state==="menu")||(mode==="public"&&publicState==="nickname")||(mode==="multi"&&(lobbyState==="enter_name"||lobbyState==="choose")))?(
        <TitleDemo active={true} lang={lang} onGearClick={()=>{setShowSettings(v=>!v);setSettingsBubble(false);}} showBubble={mode!==null&&settingsBubble} bubbleFading={bubbleFading} hideGear={mode===null}/>
      ):(
        <h1 style={{fontSize:"28px",letterSpacing:"4px",margin:"10px 0",display:"flex",justifyContent:"center",alignItems:"center",gap:"2px",
          animation:state==="play"&&time<=15&&gameTime!==0?"pulse 0.5s infinite":"none"}}>
          {(()=>{const tc=TITLE_CONFIG[lang]||TITLE_CONFIG.fi;return tc.title.split("").map((ch,i)=>{
            if(i===tc.gearIdx)return <span key={i} onClick={()=>setShowSettings(v=>!v)} style={{
              cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",
              marginRight:"4px"}}>
              <PixelIcon icon="gear" color={gearBlend?S.yellow:"#88aacc"} size={1.7} style={{transition:"filter 2s ease"}}/></span>;
            return <span key={i} style={{color:S.yellow,textShadow:`3px 3px 0 #cc6600, 0 0 20px ${S.yellow}66`,fontFamily:"'Press Start 2P',monospace"}}>{ch}</span>;
          });})()}
        </h1>
      )}

      {/* Achievement unlock popup */}
      {newAchPopup&&ACHIEVEMENTS[newAchPopup]&&(
        <div style={{position:"fixed",top:"20%",left:"50%",transform:"translateX(-50%)",zIndex:200,
          animation:"pop 0.5s ease",pointerEvents:"none",textAlign:"center"}}>
          <div style={{background:S.dark,border:`3px solid ${ACHIEVEMENTS[newAchPopup].color}`,
            padding:"16px 24px",boxShadow:`0 0 40px ${ACHIEVEMENTS[newAchPopup].color}66`,minWidth:"200px"}}>
            <div style={{fontSize:"11px",color:ACHIEVEMENTS[newAchPopup].color,marginBottom:"8px"}}>{t.achievementUnlocked}</div>
            <div style={{display:"flex",justifyContent:"center",marginBottom:"8px"}}>
              <PixelIcon icon={ACHIEVEMENTS[newAchPopup].icon} color={ACHIEVEMENTS[newAchPopup].color} size={4} badge={true}/>
            </div>
            <div style={{fontSize:"13px",color:"#fff"}}>{ACHIEVEMENTS[newAchPopup][lang]||ACHIEVEMENTS[newAchPopup].fi}</div>
            <div style={{fontSize:"9px",color:"#88ccaa",marginTop:"4px"}}>{ACHIEVEMENTS[newAchPopup][lang+"_d"]||ACHIEVEMENTS[newAchPopup].fi_d}</div>
          </div>
        </div>
      )}

      {/* Achievements view */}
      {showAchievements&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:150,
          display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"40px 16px",overflowY:"auto"}}
          onClick={(e)=>{if(e.target===e.currentTarget)setShowAchievements(false);}}>
          <div style={{width:"100%",maxWidth:"500px",background:S.dark,border:`2px solid #ffcc00`,
            boxShadow:"0 0 30px #ffcc0033",padding:"20px",animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <PixelIcon icon="trophy" color="#ffcc00" size={3} badge={true}/>
                <span style={{fontFamily:S.font,fontSize:"14px",color:"#ffcc00"}}>{t.achievements}</span>
              </div>
              <span style={{fontSize:"11px",color:"#88ccaa"}}>{Object.keys(achUnlocked).length} / {Object.keys(ACHIEVEMENTS).length}</span>
              <button onClick={()=>setShowAchievements(false)} style={{fontFamily:S.font,fontSize:"14px",color:S.green,
                background:"transparent",border:`2px solid ${S.green}`,padding:"4px 10px",cursor:"pointer"}}>X</button>
            </div>
            {/* Progress bar */}
            <div style={{width:"100%",height:"6px",background:"#333",marginBottom:"16px",border:`1px solid ${S.border}`}}>
              <div style={{width:`${Object.keys(achUnlocked).length/Object.keys(ACHIEVEMENTS).length*100}%`,height:"100%",
                background:"linear-gradient(90deg, #ffcc00, #ff6644)",transition:"width 0.5s ease"}}/>
            </div>
            {/* Achievement grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(130px, 1fr))",gap:"8px"}}>
              {Object.entries(ACHIEVEMENTS).map(([id,ach])=>{
                const unlocked=!!achUnlocked[id];
                return(
                  <div key={id} style={{border:`2px solid ${unlocked?ach.color+"88":"#333"}`,
                    padding:"10px",textAlign:"center",background:unlocked?"#ffffff08":"#00000044",
                    opacity:unlocked?1:0.5,transition:"all 0.3s"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:"6px"}}>
                      <PixelIcon icon={ach.icon} color={unlocked?ach.color:"#444"} size={3} badge={true}/>
                    </div>
                    <div style={{fontSize:"9px",color:unlocked?ach.color:"#556",marginBottom:"2px",lineHeight:"1.4"}}>
                      {ach[lang]||ach.fi}
                    </div>
                    <div style={{fontSize:"8px",color:unlocked?"#88ccaa":"#334",lineHeight:"1.3"}}>
                      {ach[lang+"_d"]||ach.fi_d}
                    </div>
                    {unlocked&&<div style={{fontSize:"7px",color:"#556",marginTop:"3px"}}>
                      {new Date(achUnlocked[id]).toLocaleDateString()}
                    </div>}
                  </div>
                );
              })}
            </div>
            {/* Stats summary */}
            <div style={{marginTop:"16px",padding:"10px",border:`1px solid ${S.border}`,fontSize:"9px",color:"#88ccaa",
              display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px"}}>
              <div>{lang==="en"?"Words found":lang==="sv"?"Ord hittade":"Sanoja löydetty"}: {achStats.totalWords}</div>
              <div>{lang==="en"?"Games played":lang==="sv"?"Spel spelade":"Pelejä pelattu"}: {achStats.gamesPlayed}</div>
              <div>{lang==="en"?"Best score":lang==="sv"?"Bästa poäng":"Paras tulos"}: {achStats.bestScore}</div>
              <div>{lang==="en"?"Best combo":lang==="sv"?"Bästa kombo":"Paras kombo"}: {achStats.bestCombo}</div>
              <div>{lang==="en"?"Longest word":lang==="sv"?"Längsta ord":"Pisin sana"}: {achStats.longestWord} {lang==="en"?"letters":lang==="sv"?"bokstäver":"kirjainta"}</div>
              <div>{lang==="en"?"Arena wins":lang==="sv"?"Arenavinster":"Arenavoitot"}: {achStats.arenaWins}</div>
            </div>
          </div>
        </div>
      )}

      {/* Settings panel - overlay below title */}
      {showSettings&&(
        <div style={{width:"100%",maxWidth:"500px",padding:"18px",border:`2px solid ${S.green}`,background:S.dark,
          boxShadow:`0 0 20px ${S.green}33`,animation:"fadeIn 0.3s ease",marginBottom:"8px",zIndex:100,position:"relative"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
            <div style={{fontFamily:S.font,fontSize:"11px",color:S.yellow}}>
              {lang==="en"?"SETTINGS":lang==="sv"?"INSTÄLLNINGAR":"ASETUKSET"}
            </div>
            <button onClick={()=>setShowSettings(false)} style={{fontFamily:S.font,fontSize:"9px",color:S.green,background:"transparent",border:`1px solid ${S.green}`,padding:"4px 10px",cursor:"pointer"}}>✕</button>
          </div>
          {/* Theme */}
          <div style={{marginBottom:"12px"}}>
            <div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"6px"}}>
              {lang==="en"?"THEME":lang==="sv"?"TEMA":"TEEMA"}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {Object.entries(THEMES).map(([id,th])=>(
                <button key={id} onClick={()=>{setThemeId(id);localStorage.setItem("piilosana_theme",id);syncSettings({theme:id});}}
                  style={{fontFamily:S.font,fontSize:"8px",
                    color:themeId===id?th.bg:th.green,
                    background:themeId===id?th.green:"transparent",
                    border:`2px solid ${th.green}`,padding:"5px 8px",cursor:"pointer",
                    boxShadow:themeId===id?`0 0 8px ${th.green}66`:"none"}}>
                  {lang==="en"?th.nameEn:lang==="sv"?th.nameSv:th.name}
                </button>
              ))}
            </div>
          </div>
          {/* Size */}
          <div style={{marginBottom:"12px"}}>
            <div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"6px"}}>
              {lang==="en"?"SIZE":lang==="sv"?"STORLEK":"KOKO"}
            </div>
            <div style={{display:"flex",gap:"4px"}}>
              <button onClick={()=>{setUiSize("normal");localStorage.setItem("piilosana_size","normal");syncSettings({size:"normal"});}}
                style={{fontFamily:S.font,fontSize:"8px",
                  color:uiSize==="normal"?S.bg:S.green,background:uiSize==="normal"?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer"}}>
                {lang==="en"?"NORMAL":lang==="sv"?"NORMAL":"NORMAALI"}
              </button>
              <button onClick={()=>{setUiSize("large");localStorage.setItem("piilosana_size","large");syncSettings({size:"large"});}}
                style={{fontFamily:S.font,fontSize:"8px",
                  color:uiSize==="large"?S.bg:S.green,background:uiSize==="large"?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer"}}>
                {lang==="en"?"LARGE":lang==="sv"?"STOR":"ISO"}
              </button>
            </div>
          </div>
          {/* Sound */}
          <div style={{marginBottom:"12px"}}>
            <div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"6px"}}>
              {lang==="en"?"SOUNDS":lang==="sv"?"LJUD":"ÄÄNET"}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {[["retro",{fi:"RETRO",en:"RETRO",sv:"RETRO"}],["soft",{fi:"PEHMEÄ",en:"SOFT",sv:"MJUK"}],["modern",{fi:"MODERNI",en:"MODERN",sv:"MODERN"}],["off",{fi:"POIS",en:"OFF",sv:"AV"}]].map(([id,names])=>(
                <button key={id} onClick={()=>{setSoundTheme(id);localStorage.setItem("piilosana_sound",id);syncSettings({sound:id});}}
                  style={{fontFamily:S.font,fontSize:"8px",
                    color:soundTheme===id?S.bg:S.green,background:soundTheme===id?S.green:"transparent",
                    border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer",
                    boxShadow:soundTheme===id?`0 0 8px ${S.green}66`:"none"}}>
                  {names[lang]||names.en}
                </button>
              ))}
            </div>
          </div>
          {/* Music */}
          <div style={{marginBottom:"12px"}}>
            <div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"6px"}}>
              {lang==="en"?"MUSIC":lang==="sv"?"MUSIK":"MUSIIKKI"}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {[["ambient",{fi:"AMBIENT",en:"AMBIENT",sv:"AMBIENT"}],["acoustic",{fi:"AKUSTINEN",en:"ACOUSTIC",sv:"AKUSTISK"}],["electronic",{fi:"ELEKTRONINEN",en:"ELECTRONIC",sv:"ELEKTRONISK"}],["off",{fi:"POIS",en:"OFF",sv:"AV"}]].map(([id,names])=>(
                <button key={id} onClick={()=>{setMusicTheme(id);localStorage.setItem("piilosana_music",id);syncSettings({music:id});}}
                  style={{fontFamily:S.font,fontSize:"8px",
                    color:musicTheme===id?S.bg:S.green,background:musicTheme===id?S.green:"transparent",
                    border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer",
                    boxShadow:musicTheme===id?`0 0 8px ${S.green}66`:"none"}}>
                  {names[lang]||names.en}
                </button>
              ))}
            </div>
            {musicTheme!=="off"&&(
              <div style={{fontFamily:S.font,fontSize:"7px",color:"#556",marginTop:"4px"}}>
                {lang==="en"?"Plays during game":lang==="sv"?"Spelas under spelet":"Soi pelin aikana"}
              </div>
            )}
          </div>
          {/* Confetti */}
          <div>
            <div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"6px"}}>
              {lang==="en"?"EFFECTS":lang==="sv"?"EFFEKTER":"TEHOSTEET"}
            </div>
            <button onClick={()=>{const v=!confettiOn;setConfettiOn(v);localStorage.setItem("piilosana_confetti",v?"on":"off");syncSettings({confetti:v});}}
              style={{fontFamily:S.font,fontSize:"8px",
                color:confettiOn?S.bg:S.green,background:confettiOn?S.green:"transparent",
                border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer"}}>
              {confettiOn?"✓ ":""}{lang==="en"?"CONFETTI ON WIN":lang==="sv"?"KONFETTI VID VINST":"KONFETTI VOITOSTA"}
            </button>
          </div>
        </div>
      )}

      {/* AUTH PANEL */}
      {showAuth&&(
        <div style={{width:"100%",maxWidth:"500px",padding:"18px",border:`2px solid ${S.yellow}`,background:S.dark,
          boxShadow:`0 0 20px ${S.yellow}33`,animation:"fadeIn 0.3s ease",marginBottom:"8px",zIndex:100,position:"relative"}}>
          {authUser?(
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:S.font,fontSize:"11px",color:S.green,marginBottom:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
                <PixelIcon icon="person" color={S.green} size={2}/>
                {authUser.nickname}
              </div>
              {authUser.email&&<div style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,marginBottom:"12px"}}>{authUser.email}</div>}
              {authMode==="changePassword"?(
                <form onSubmit={async(e)=>{e.preventDefault();const fd=new FormData(e.target);await doChangePassword(fd.get("currentPassword"),fd.get("newPassword"));}} style={{textAlign:"left"}}>
                  <input name="currentPassword" type="password" autoComplete="current-password" placeholder={lang==="en"?"CURRENT PASSWORD":lang==="sv"?"NUVARANDE LÖSENORD":"NYKYINEN SALASANA"}
                    style={{fontFamily:S.font,fontSize:"11px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  <input name="newPassword" type="password" autoComplete="new-password" minLength="4" placeholder={lang==="en"?"NEW PASSWORD":lang==="sv"?"NYTT LÖSENORD":"UUSI SALASANA"}
                    style={{fontFamily:S.font,fontSize:"11px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  {authError&&<div style={{fontFamily:S.font,fontSize:"9px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                  {authSuccess&&<div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"8px"}}>{authSuccess}</div>}
                  <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"100%"}}>
                    {authLoading?"...":(lang==="en"?"CHANGE PASSWORD":lang==="sv"?"ÄNDRA LÖSENORD":"VAIHDA SALASANA")}
                  </button>
                  <button type="button" onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
                    ← {lang==="en"?"Back":lang==="sv"?"Tillbaka":"Takaisin"}
                  </button>
                </form>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center"}}>
                  <button onClick={()=>{setAuthMode("changePassword");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"9px",color:S.yellow,background:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 16px",cursor:"pointer"}}>
                    {lang==="en"?"CHANGE PASSWORD":lang==="sv"?"ÄNDRA LÖSENORD":"VAIHDA SALASANA"}
                  </button>
                  <button onClick={()=>{doLogout();setShowAuth(false);}} style={{fontFamily:S.font,fontSize:"9px",color:S.red||"#ff4444",background:"transparent",border:`2px solid ${S.red||"#ff4444"}`,padding:"6px 16px",cursor:"pointer"}}>
                    {lang==="en"?"LOG OUT":lang==="sv"?"LOGGA UT":"KIRJAUDU ULOS"}
                  </button>
                  <button onClick={()=>setShowAuth(false)} style={{fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,padding:"8px 18px",cursor:"pointer",marginTop:"8px",width:"100%"}}>✕</button>
                </div>
              )}
            </div>
          ):(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"9px",color:authMode==="login"?S.bg:S.yellow,background:authMode==="login"?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"5px 12px",cursor:"pointer"}}>
                    {lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"}
                  </button>
                  <button onClick={()=>{setAuthMode("register");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"9px",color:authMode==="register"?S.bg:S.yellow,background:authMode==="register"?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"5px 12px",cursor:"pointer"}}>
                    {lang==="en"?"REGISTER":lang==="sv"?"REGISTRERA":"LUO TUNNUS"}
                  </button>
                </div>
                <button onClick={()=>setShowAuth(false)} style={{fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer"}}>✕</button>
              </div>
              {authMode==="forgot"?(
                <form onSubmit={async(e)=>{e.preventDefault();const fd=new FormData(e.target);await doForgotPassword(fd.get("email"));}}>
                  <div style={{fontFamily:S.font,fontSize:"9px",color:S.textMuted,marginBottom:"10px",lineHeight:"1.6"}}>
                    {lang==="en"?"Enter your email and we'll send a new password.":lang==="sv"?"Ange din e-post så skickar vi ett nytt lösenord.":"Syötä sähköpostisi niin lähetämme uuden salasanan."}
                  </div>
                  <input name="email" type="email" autoComplete="email" placeholder={lang==="en"?"EMAIL":lang==="sv"?"E-POST":"SÄHKÖPOSTI"}
                    style={{fontFamily:S.font,fontSize:"11px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  {authError&&<div style={{fontFamily:S.font,fontSize:"9px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                  {authSuccess&&<div style={{fontFamily:S.font,fontSize:"9px",color:S.green,marginBottom:"8px"}}>{authSuccess}</div>}
                  <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"100%"}}>
                    {authLoading?"...":(lang==="en"?"SEND NEW PASSWORD":lang==="sv"?"SKICKA NYTT LÖSENORD":"LÄHETÄ UUSI SALASANA")}
                  </button>
                  <button type="button" onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
                    ← {lang==="en"?"Back to login":lang==="sv"?"Tillbaka till inloggning":"Takaisin kirjautumiseen"}
                  </button>
                </form>
              ):(
              <form autoComplete="on" onSubmit={async(e)=>{
                e.preventDefault();
                const fd=new FormData(e.target);
                const nick=fd.get("nickname"),pw=fd.get("password");
                if(authMode==="login"){await doLogin(nick,pw);}
                else{await doRegister(nick,pw,fd.get("email")||"",fd.get("email2")||"");}
              }}>
                <input name="nickname" type="text" autoComplete="username" maxLength="12" placeholder={lang==="en"?"NICKNAME":lang==="sv"?"SMEKNAMN":"NIMIMERKKI"}
                  style={{fontFamily:S.font,fontSize:"11px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                <input name="password" type="password" autoComplete={authMode==="register"?"new-password":"current-password"} minLength="4"
                  placeholder={lang==="en"?"PASSWORD":lang==="sv"?"LÖSENORD":"SALASANA"}
                  style={{fontFamily:S.font,fontSize:"11px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                {authMode==="register"&&(
                  <>
                    <input name="email" type="email" autoComplete="email" placeholder={`${lang==="en"?"EMAIL":lang==="sv"?"E-POST":"SÄHKÖPOSTI"} (${lang==="en"?"optional":lang==="sv"?"valfritt":"vapaaehtoinen"})`}
                      style={{fontFamily:S.font,fontSize:"9px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                    <input name="email2" type="email" autoComplete="email" placeholder={lang==="en"?"CONFIRM EMAIL":lang==="sv"?"BEKRÄFTA E-POST":"VAHVISTA SÄHKÖPOSTI"}
                      style={{fontFamily:S.font,fontSize:"9px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                    <div style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,marginBottom:"8px",lineHeight:"1.6"}}>
                      {lang==="en"?"Password will be sent to your email for safekeeping":lang==="sv"?"Lösenordet skickas till din e-post":"Salasana lähetetään sähköpostiisi muistiksi"}
                    </div>
                  </>
                )}
                {authError&&<div style={{fontFamily:S.font,fontSize:"9px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:`3px 3px 0 #cc8800`,width:"100%"}}>
                  {authLoading?"...":(authMode==="login"?(lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"):(lang==="en"?"CREATE ACCOUNT":lang==="sv"?"SKAPA KONTO":"LUO TUNNUS"))}
                </button>
                {authMode==="login"&&(
                  <button type="button" onClick={()=>{setAuthMode("forgot");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
                    {lang==="en"?"Forgot password?":lang==="sv"?"Glömt lösenord?":"Unohtuiko salasana?"}
                  </button>
                )}
              </form>
              )}
              {/* Google Sign-In */}
              {googleClientId&&(
                <div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${S.border}`,textAlign:"center"}}>
                  <div style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,marginBottom:"8px"}}>
                    {lang==="en"?"or":lang==="sv"?"eller":"tai"}
                  </div>
                  <div id="google-signin-btn" ref={(el)=>{
                    if(el&&window.google?.accounts?.id){
                      el.innerHTML="";
                      window.google.accounts.id.initialize({
                        client_id:googleClientId,
                        callback:(response)=>doGoogleLogin(response.credential),
                      });
                      window.google.accounts.id.renderButton(el,{
                        theme:"filled_black",size:"large",width:280,text:"signin_with",shape:"rectangular",
                      });
                    }
                  }}/>
                  <div style={{fontFamily:S.font,fontSize:"7px",color:S.textMuted,marginTop:"10px",lineHeight:"1.8",maxWidth:"280px",textAlign:"center"}}>
                    {lang==="en"?"Google only shares your name and email. We never see your password or access your Google account. "
                    :lang==="sv"?"Google delar bara ditt namn och e-post. Vi ser aldrig ditt lösenord eller kommer åt ditt Google-konto. "
                    :"Google jakaa vain nimesi ja sähköpostisi. Emme näe salasanaasi emmekä pääse Google-tilillesi. "}
                    <a href="https://support.google.com/accounts/answer/112802" target="_blank" rel="noopener noreferrer" style={{color:S.green,textDecoration:"underline"}}>
                      {lang==="en"?"Learn more":lang==="sv"?"Läs mer":"Lue lisää"}
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* First-time auth prompt */}
      {mode===null&&showFirstTimeAuth&&!authUser&&!showAuth&&(
        <div style={{width:"100%",maxWidth:"500px",padding:"12px",border:`2px solid ${S.yellow}`,background:S.dark,
          boxShadow:`0 0 12px ${S.yellow}22`,animation:"fadeIn 0.5s ease",marginBottom:"8px",textAlign:"center"}}>
          <div style={{fontFamily:S.font,fontSize:"9px",color:S.yellow,marginBottom:"8px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
            <PixelIcon icon="person" color={S.yellow} size={2}/>
            {lang==="en"?"Save your nickname?":lang==="sv"?"Spara ditt smeknamn?":"Tallenna nimimerkkisi?"}
          </div>
          <div style={{fontFamily:S.font,fontSize:"8px",color:S.textMuted,marginBottom:"10px",lineHeight:"1.6"}}>
            {lang==="en"?"Create an account to save your progress":lang==="sv"?"Skapa ett konto för att spara dina framsteg":"Luo tunnus — nimimerkkisi ja saavutuksesi tallentuvat"}
          </div>
          <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
            <button onClick={()=>{setShowAuth(true);setAuthMode("register");setShowFirstTimeAuth(false);}}
              style={{fontFamily:S.font,fontSize:"9px",color:S.bg,background:S.yellow,border:"none",padding:"6px 16px",cursor:"pointer",boxShadow:"2px 2px 0 #cc8800"}}>
              {lang==="en"?"CREATE ACCOUNT":lang==="sv"?"SKAPA KONTO":"LUO TUNNUS"}
            </button>
            <button onClick={()=>{setShowAuth(true);setAuthMode("login");setShowFirstTimeAuth(false);}}
              style={{fontFamily:S.font,fontSize:"9px",color:S.yellow,background:"transparent",border:`1px solid ${S.yellow}`,padding:"6px 16px",cursor:"pointer"}}>
              {lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"}
            </button>
            <button onClick={()=>{setShowFirstTimeAuth(false);sessionStorage.setItem("piilosana_auth_dismissed","1");}}
              style={{fontFamily:S.font,fontSize:"14px",color:S.textMuted,background:"transparent",border:`2px solid ${S.border}`,padding:"4px 12px",cursor:"pointer"}}>✕</button>
          </div>
        </div>
      )}

      {/* MENU */}
      {/* MODE SELECT */}
      {mode===null&&modeSelectJSX}
      
      {/* MULTIPLAYER SCREENS - inline to prevent focus loss */}
      {mode==="multi"&&lobbyState==="enter_name"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.green}`,padding:"24px",boxShadow:`0 0 20px ${S.green}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"11px",lineHeight:"2",marginBottom:"16px",color:S.green}}>{t.nickname}</p>
            <input ref={el=>{nicknameRef.current=el;if(el)el.focus();}} type="text" inputMode="text" maxLength="12" value={nickname} onChange={e=>setNickname(e.target.value.toUpperCase())}
              autoFocus placeholder={t.nickname} onKeyDown={e=>{if(e.key==="Enter"&&nickname)setLobbyState("choose");}}
              style={{fontFamily:S.font,fontSize:"18px",padding:"8px 12px",width:"100%",maxWidth:"500px",background:S.dark,color:S.green,border:`2px solid ${S.green}`,boxSizing:"border-box",marginBottom:"16px"}}/>
            <br/>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>nickname&&setLobbyState("choose")} style={{fontFamily:S.font,fontSize:"16px",color:S.bg,background:nickname?S.green:"#333",border:"none",padding:"12px 28px",cursor:nickname?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>{lang==="en"?"CONTINUE":"JATKA"}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}
      {mode==="multi"&&(lobbyState==="creating"||lobbyState==="joining")&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.yellow}`,padding:"24px",boxShadow:`0 0 20px ${S.yellow}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"11px",lineHeight:"2",color:S.yellow,animation:"pulse 1s infinite"}}>
              {lobbyState==="creating"?"LUODAAN HUONETTA...":"LIITYTÄÄN HUONEESEEN..."}
            </p>
          </div>
        </div>
      )}
      {mode==="multi"&&lobbyState==="choose"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.green}`,padding:"24px",boxShadow:`0 0 20px ${S.green}44`,maxWidth:"600px"}}>
            {lobbyError&&<p style={{fontSize:"13px",color:S.red,marginBottom:"8px"}}>{lobbyError}</p>}
            {!socketConnected&&<p style={{fontSize:"13px",color:S.yellow,marginBottom:"12px",animation:"pulse 1s infinite"}}>{t.connecting}</p>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <p style={{fontSize:"11px",lineHeight:"2",color:S.green,margin:0}}>{t.openGames}</p>
              <button onClick={refreshRooms} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`1px solid ${S.green}`,background:"transparent",padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center"}}><PixelIcon icon="refresh" color={S.green} size={2}/></button>
            </div>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"80px",maxHeight:"200px",overflowY:"auto"}}>
              {publicRooms.length===0&&(
                <p style={{fontSize:"18px",color:"#556",padding:"16px 0"}}>{t.noRooms}</p>
              )}
              {publicRooms.map((r,i)=>(
                <div key={r.roomCode} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px",borderBottom:i<publicRooms.length-1?`1px solid ${S.border}`:"none"}}>
                  <div>
                    <span style={{marginRight:"6px",display:"inline-flex",verticalAlign:"middle"}}><PixelFlag lang={r.lang||"fi"} size={2}/></span>
                    <span style={{fontSize:"11px",color:S.yellow}}>{r.hostNickname}</span>
                    <span style={{fontSize:"18px",color:"#888",marginLeft:"8px"}}>{r.playerCount}/{r.maxPlayers}</span>
                  </div>
                  <button onClick={()=>joinRoom(r.roomCode)} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"6px 14px",cursor:"pointer",boxShadow:"2px 2px 0 #cc8800"}}>{t.join}</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <button onClick={createRoom} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:socketConnected?S.green:"#333",border:"none",padding:"12px 20px",cursor:socketConnected?"pointer":"default",boxShadow:socketConnected?"3px 3px 0 #008844":"none"}}>{socketConnected?t.createGame:t.connecting}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"10px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}
      {mode==="multi"&&lobbyState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.yellow}`,padding:"24px",boxShadow:`0 0 20px ${S.yellow}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"18px",lineHeight:"2",marginBottom:"12px",color:S.yellow}}>{t.waiting}</p>
            <p style={{fontSize:"11px",lineHeight:"2",color:S.green,marginBottom:"12px"}}>{t.playersCount} ({players.length})</p>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"60px"}}>
              {players.map((p,i)=><div key={i} style={{fontSize:"11px",color:p.playerId===playerId?S.yellow:S.green,padding:"4px"}}>{i+1}. {p.nickname}{p.playerId===playerId?` (${t.youTag})`:""}</div>)}
            </div>
            {isHost&&(
              <div style={{marginBottom:"12px"}}>
                <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.gameMode}</p>
                <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                  <button onClick={()=>setGameMode("classic")} style={{fontFamily:S.font,fontSize:"11px",color:gameMode==="classic"?S.bg:S.green,background:gameMode==="classic"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>{t.classic}</button>
                  <button onClick={()=>setGameMode("battle")} style={{fontFamily:S.font,fontSize:"11px",color:gameMode==="battle"?S.bg:S.purple,background:gameMode==="battle"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><PixelIcon icon="swords" color={gameMode==="battle"?S.bg:S.purple} size={2}/>{t.battle}</button>
                </div>
                {gameMode==="battle"&&<p style={{fontSize:"11px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>{t.battleDesc}</p>}
                <div style={{marginTop:"12px"}}>
                  <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.time}</p>
                  <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                    <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
                    <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
                  </div>
                </div>
                {gameMode!=="battle"&&(
                  <div style={{marginTop:"12px"}}>
                    <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.letterMult}</p>
                    <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"11px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                      {letterMult?"✓ ":""}{t.letterMultBtn}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isHost&&<button onClick={()=>startGame(gameMode)} disabled={players.length<2} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:players.length>=2?S.green:"#333",border:"none",padding:"12px 24px",cursor:players.length>=2?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>{t.startGame}</button>}
            {isHost&&players.length<2&&<p style={{fontSize:"18px",color:"#666",marginTop:"8px"}}>{t.waitForPlayers}</p>}
            {!isHost&&<p style={{fontSize:"18px",color:"#666"}}>{t.waitForHost}</p>}
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"12px"}}>{t.exit}</button>
          </div>
        </div>
      )}
      {mode==="multi"&&state==="end"&&lobbyState==="results"&&<ResultsScreen/>}

      {/* PIILOSAUNA - nickname entry */}
      {mode==="public"&&publicState==="nickname"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:"3px solid #ff6644",padding:"24px",boxShadow:"0 0 20px #ff664444",maxWidth:"600px"}}>
            <p style={{fontSize:"18px",color:"#ff6644",marginBottom:"8px"}}>{t.arena}</p>
            <p style={{fontSize:"11px",color:"#88ccaa",marginBottom:"16px",lineHeight:"1.8"}}>{t.arenaJoinDesc}</p>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.nickname}</p>
            <input type="text" maxLength="12" value={soloNickname} onChange={e=>setSoloNickname(e.target.value.toUpperCase())}
              placeholder={t.nickname} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:S.dark,
              border:`2px solid ${S.green}`,padding:"10px",width:"200px",textAlign:"center",outline:"none",marginBottom:"16px"}}
              onKeyDown={e=>{if(e.key==="Enter"&&soloNickname.trim()&&socket){
                localStorage.setItem("piilosana_nick",soloNickname);
                socket.emit("join_public",{nickname:soloNickname.trim(),lang});
                setPublicState("waiting");
              }}}/>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>{
                if(!soloNickname.trim()||!socket)return;
                localStorage.setItem("piilosana_nick",soloNickname);
                socket.emit("join_public",{nickname:soloNickname.trim(),lang});
                setPublicState("waiting");
              }} disabled={!soloNickname.trim()}
                style={{fontFamily:S.font,fontSize:"13px",color:soloNickname.trim()?S.bg:"#556",
                background:soloNickname.trim()?"#ff6644":"#333",border:"none",padding:"12px 24px",
                cursor:soloNickname.trim()?"pointer":"default",boxShadow:soloNickname.trim()?"3px 3px 0 #cc3311":"none"}}>
                {t.join}
              </button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}

      {/* AREENA - waiting for round */}
      {mode==="public"&&publicState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <p style={{fontSize:"18px",color:"#ff6644"}}>{t.arena}</p>
          {publicNextCountdown>0?(
            <>
              <p style={{fontSize:"13px",color:"#556",marginTop:"12px"}}>{t.nextRound}</p>
              <p style={{fontSize:"28px",color:S.green,marginTop:"8px",animation:publicNextCountdown<=5?"pulse 0.5s infinite":"none"}}>{publicNextCountdown}s</p>
            </>
          ):(
            <p style={{fontSize:"13px",color:"#556",marginTop:"12px",animation:"pulse 1s infinite"}}>{lang==="en"?"Connecting...":lang==="sv"?"Ansluter...":"Yhdistetään..."}</p>
          )}
          <p style={{fontSize:"11px",color:"#88ccaa",marginTop:"8px"}}>{publicPlayerCount} {t.playersInArena}</p>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"16px"}}>{t.back}</button>
        </div>
      )}

      {/* PIILOSAUNA - countdown */}
      {mode==="public"&&publicState==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"11px",color:"#ff6644",marginBottom:"24px"}}>{t.arena}</div>
          <div style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{publicPlayerCount} {t.players}</div>
          <div style={{fontSize:"18px",color:S.green}}>{t.getReady}</div>
        </div>
      )}

      {/* PIILOSAUNA - end of round */}
      {mode==="public"&&publicState==="end"&&(()=>{
        const MEDALS=["🥇","🥈","🥉"];
        const publicMissed=valid.size>0?[...valid].filter(w=>!publicAllFound.includes(w)).sort((a,b)=>b.length-a.length):[];
        const publicFoundSorted=[...publicAllFound].sort((a,b)=>b.length-a.length);
        return(
        <div style={{width:"100%",maxWidth:"600px",textAlign:"center",animation:"fadeIn 1s ease"}}>
          {/* Your score */}
          <div style={{border:"3px solid #ff6644",padding:"20px",marginBottom:"12px",boxShadow:"0 0 30px #ff664433",background:S.dark}}>
            <div style={{fontSize:"13px",color:"#ff6644",marginBottom:"4px"}}>{t.arena} — {t.roundOver}</div>
            <div style={{fontSize:"13px",color:"#556",marginBottom:"10px"}}>{t.yourScore}</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}</div>
            <div style={{fontSize:"13px",color:"#88ccaa",marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            <div style={{fontSize:"13px",color:publicNextCountdown<=10?S.yellow:"#88ccaa",marginTop:"12px"}}>
              {t.nextRoundIn}: {publicNextCountdown>0?`${publicNextCountdown}s`:t.starts}
            </div>
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"10px"}}>{t.exit}</button>
          </div>

          {/* Rankings with medals */}
          {publicRankings&&publicRankings.length>0&&(
            <div style={{border:`2px solid ${S.border}`,padding:"8px",background:S.dark,marginBottom:"10px",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"13px",color:S.yellow,marginBottom:"8px"}}>{t.roundResults}</div>
              <div style={{display:"flex",flexDirection:"column",gap:"2px",textAlign:"left"}}>
                {publicRankings.slice(0,10).map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",
                    background:i<3?["#ffcc0015","#cccccc10","#cc884410"][i]:"transparent",
                    border:i<3?`1px solid ${["#ffcc0033","#cccccc33","#cc884433"][i]}`:"1px solid transparent",
                    borderRadius:"2px"}}>
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      <span style={{fontSize:"16px",minWidth:"24px"}}>{i<3?MEDALS[i]:<span style={{fontSize:"11px",color:"#556"}}>{i+1}.</span>}</span>
                      <span style={{fontSize:"13px",color:r.nickname===soloNickname?S.green:i===0?S.yellow:i<3?"#cccccc":"#aaa",fontWeight:r.nickname===soloNickname?"bold":"normal"}}>{r.nickname}</span>
                    </div>
                    <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                      <span style={{fontSize:"13px",color:S.yellow}}>{r.score}p</span>
                      <span style={{fontSize:"11px",color:"#88ccaa"}}>{r.percentage}%</span>
                      <span style={{fontSize:"11px",color:"#556"}}>{r.wordsFound} {t.words}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All found words (collective) */}
          {publicFoundSorted.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"13px",color:S.green,marginBottom:"6px"}}>{t.foundWords} ({publicFoundSorted.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicFoundSorted.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:found.includes(w)?"#1a3a2a":"#1a1a2a",padding:"2px 4px",
                    border:`1px solid ${found.includes(w)?wordColor(w.length)+"44":"#33333366"}`,
                    color:found.includes(w)?wordColor(w.length):"#667"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              <div style={{fontSize:"11px",color:"#556",marginTop:"4px"}}>{t.ownHighlighted}</div>
            </div>
          )}

          {/* Missed words */}
          {publicMissed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>{t.missed} ({publicMissed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicMissed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:"#2a1a1a",padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame gameMode="normal" gameTime={120} currentScore={score} S={S} lang={lang}/>
        </div>
        );
      })()}

      {/* SOLO MENU - just play button */}
      {mode==="solo"&&state==="menu"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.gameMode}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setSoloMode("normal")} style={{fontFamily:S.font,fontSize:"11px",color:soloMode==="normal"?S.bg:S.green,background:soloMode==="normal"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>{t.modeNormal}</button>
              <button onClick={()=>setSoloMode("tetris")} style={{fontFamily:S.font,fontSize:"11px",color:soloMode==="tetris"?S.bg:S.purple,background:soloMode==="tetris"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><PixelIcon icon="arrow" color={soloMode==="tetris"?S.bg:S.purple} size={2}/>{t.modeTetris}</button>
            </div>
            {soloMode==="tetris"&&<p style={{fontSize:"11px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>{t.tetrisDesc}</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.time}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
              <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
              <button onClick={()=>setGameTime(0)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===0?S.bg:"#44ddff",background:gameTime===0?"#44ddff":"transparent",border:"2px solid #44ddff",padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><PixelIcon icon="infinity" color={gameTime===0?S.bg:"#44ddff"} size={2}/>{t.unlimited}</button>
            </div>
            {gameTime===0&&<p style={{fontSize:"11px",color:"#44ddff",marginTop:"8px",lineHeight:"1.8"}}>{t.unlimitedDesc}</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{t.otherOptions}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"11px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                {letterMult?"✓ ":""}{t.letterMultBtn}
              </button>
            </div>
            {letterMult&&<p style={{fontSize:"11px",color:S.yellow,marginTop:"6px",lineHeight:"1.8"}}>{t.letterMultDesc}</p>}
          </div>
          {gameTime!==0&&!authUser&&(
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:"#556",marginBottom:"6px"}}>{t.nickForHof}</p>
            <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
              placeholder={t.optional} style={{fontFamily:S.font,fontSize:"11px",color:S.green,background:S.dark,
              border:`2px solid ${S.border}`,padding:"8px",width:"160px",textAlign:"center",outline:"none"}}/>
            {soloNickname.trim()&&<p style={{fontSize:"11px",color:"#88ccaa",marginTop:"4px"}}>{t.scoresSaved} {soloNickname.trim()}</p>}
          </div>
          )}
          {gameTime!==0&&authUser&&(
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:"#88ccaa"}}>{t.scoresSaved} {authUser.nickname}</p>
          </div>
          )}
          <div style={{display:"flex",gap:"12px",justifyContent:"center",alignItems:"center"}}>
            <button onClick={start} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"14px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #008844"}}
              onMouseEnter={e=>{e.target.style.transform="translate(-2px,-2px)";e.target.style.boxShadow="6px 6px 0 #008844"}}
              onMouseLeave={e=>{e.target.style.transform="none";e.target.style.boxShadow="4px 4px 0 #008844"}}>
              {t.play}
            </button>
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
          </div>
        </div>
      )}

      {/* COUNTDOWN */}
      {state==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"11px",color:S.green,marginBottom:"24px"}}>{mode==="multi"?(gameMode==="battle"?t.battleStarts:t.gameStarts):(soloMode==="tetris"?t.tetrisStarts:t.getReady)}</div>
          <div key={countdown} style={{fontSize:"72px",color:countdown<=2?S.red:countdown<=3?S.yellow:S.green,textShadow:`0 0 40px ${countdown<=2?"#ff444488":countdown<=3?"#ffcc0088":"#00ff8888"}`,animation:"pop 0.3s ease",lineHeight:"1"}}>
            {countdown>0?countdown:t.play+"!"}
          </div>
          {mode==="multi"&&<div style={{fontSize:"18px",color:"#556",marginTop:"24px"}}>{players.length} {t.players}</div>}
        </div>
      )}

      {/* PLAYING + ENDING */}
      {(state==="play"||state==="ending")&&(
        <div style={{width:"100%",maxWidth:"600px",position:"relative",padding:"0 2px"}}>
          {/* HUD */}
          <div style={{marginBottom:"6px",border:`2px solid ${(gameMode==="battle"||(mode==="solo"&&soloMode==="tetris"))?S.purple+"88":gameTime===0?"#44ddff88":S.border}`,background:S.dark}}>
            {mode==="public"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:"#ff6644",background:"#ff664411",borderBottom:`1px solid ${S.border}`}}>{t.arenaLabel} — {publicPlayerCount} {t.players}</div>}
            {mode==="multi"&&gameMode==="battle"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelIcon icon="swords" color={S.purple} size={1}/>{t.battleLabel}</div>}
            {mode==="solo"&&soloMode==="tetris"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelIcon icon="arrow" color={S.purple} size={1}/>{t.tetrisLabel}</div>}
            {mode==="solo"&&gameTime===0&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:"#44ddff",background:"#44ddff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelIcon icon="infinity" color="#44ddff" size={1}/>{t.unlimitedLabel}</div>}
            {letterMult&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.yellow,background:"#ffcc0011",borderBottom:`1px solid ${S.border}`}}>{t.letterMultLabel}</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px"}}>
              {gameTime!==0?(
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>{t.time}</div>
                <div style={{fontSize:"18px",color:time<=15?S.red:time<=30?S.yellow:S.green}}>{fmt(time)}</div>
              </div>
              ):(
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>{t.words.toUpperCase()}</div>
                <div style={{fontSize:"18px",color:"#44ddff"}}>{found.length}</div>
              </div>
              )}
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>{t.score}</div>
                <div style={{fontSize:"18px",color:S.yellow}}>{score}</div>
              </div>
            </div>
            <div ref={wordBarRef} key={flashKey} style={{borderTop:`1px solid ${S.border}`,padding:"4px 10px",textAlign:"center",animation:flashKey>0&&!word&&msg?.ok?"wordFlash 0.6s ease-out":"none"}}>
              <div style={{fontSize:"18px",minHeight:"20px",animation:shake?"shake 0.4s":(!word&&msg?.ok?"scoreJump 0.4s ease-out":"none"),color:word?wordColor(word.length):undefined}}>
                {state==="ending"?<span style={{color:ending?.color,fontSize:"16px",animation:"pulse 1s infinite"}}>{ending?.emoji} {ending?.name}</span>:
                 word?word.toUpperCase():
                 (msg?<span style={{color:msg.ok?S.green:S.red,fontSize:msg.ok?"12px":"10px",fontWeight:msg.ok?"bold":"normal"}}>{msg.ok?`${msg.t?.toUpperCase()} +${msg.p}p${msg.combo>=3?` ${T[lang]?.combo||"COMBO"}!`:""}`:msg.m}</span>:<span style={{color:"#333"}}>···</span>)}
              </div>
            </div>
          </div>

          {/* Battle mode: flash when someone finds a word */}
          {gameMode==="battle"&&battleMsg&&state==="play"&&(
            <div style={{textAlign:"center",fontSize:"11px",padding:"4px 8px",marginBottom:"4px",background:battleMsg.finderId===playerId?"#00ff8822":"#ff66aa22",border:`1px solid ${battleMsg.finderId===playerId?S.green:"#ff66aa"}`,color:battleMsg.finderId===playerId?S.green:"#ff66aa",animation:"fadeIn 0.5s ease"}}>
              {battleMsg.finder}: {battleMsg.word.toUpperCase()} +{battleMsg.points}p
            </div>
          )}

          {combo>=2&&state==="play"&&(
            <div style={{textAlign:"center",fontSize:"11px",color:combo>=5?S.purple:combo>=3?S.yellow:S.green,marginBottom:"4px",animation:combo>=3?"epicPulse 0.5s infinite":"none"}}>
              {combo>=5?`${t.megaCombo} x${combo}!`:combo>=3?`${t.combo} x${combo}! (x2)`:`${combo} ${t.comboStreak}`}
            </div>
          )}

          {/* Percentage counter - solo normal + classic multi only */}
          {mode==="solo"&&soloMode==="normal"&&state==="play"&&valid.size>0&&(
            <div style={{textAlign:"center",fontSize:"11px",color:"#556",marginBottom:"4px"}}>
              {found.length} / {valid.size} {t.words} ({Math.round(found.length/valid.size*100)}%)
            </div>
          )}
          {mode==="multi"&&gameMode==="classic"&&state==="play"&&valid.size>0&&(
            <div style={{textAlign:"center",fontSize:"11px",color:"#556",marginBottom:"4px"}}>
              {found.length} / {valid.size} {t.words} ({Math.round(found.length/valid.size*100)}%)
            </div>
          )}

          {gameTime!==0&&(
          <div style={{height:"4px",background:"#1a1a2e",marginBottom:"6px",border:"1px solid #222"}}>
            <div style={{height:"100%",width:`${(time/gameTime)*100}%`,background:time<=15?S.red:time<=30?S.yellow:S.green,transition:"width 0.3s linear"}}/>
          </div>
          )}


          {/* GRID */}
          <div style={{position:"relative"}}>
            <div ref={gRef}
              onTouchMove={e=>{e.preventDefault();onDragMove(e.touches[0].clientX,e.touches[0].clientY);}}
              style={{display:"grid",gridTemplateColumns:`repeat(${SZ},1fr)`,gap:isLarge?"6px":"4px",padding:isLarge?"8px":"6px",background:S.gridBg||"#111133",
                border:`3px solid ${combo>=3&&state==="play"?S.yellow:ending?ending.color+"88":S.border}`,
                boxShadow:combo>=5?`0 0 30px ${S.purple}66`:combo>=3?`0 0 20px ${S.yellow}44`:`0 0 30px ${S.green}22`,
                touchAction:"none",
                position:"relative"}}>
              {(mode==="multi"?currentMultiGrid:grid).map((row,r)=>row.map((letter,c)=>{
                const s=isSel(r,c);
                const last=sel.length>0&&sel[sel.length-1].r===r&&sel[sel.length-1].c===c;
                const cellIdx=r*SZ+c;
                const eaten=eatenCells.has(cellIdx);
                const endAnim=eaten&&ending?ending.cellAnim(cellIdx,SZ*SZ):"none";
                const endColor=eaten&&ending?ending.cellColor(cellIdx):null;
                // Battle mode: check if other players are selecting this cell
                const BATTLE_COLORS=["#ff66aa","#66aaff","#ffaa44","#aa66ff","#66ffaa","#ff4444","#44ffff"];
                let otherSelColor=null;
                if(gameMode==="battle"&&!s){
                  const selectors=Object.entries(otherSelections);
                  for(let si=0;si<selectors.length;si++){
                    const [,{cells:oCells}]=selectors[si];
                    if(oCells&&oCells.some(oc=>oc.r===r&&oc.c===c)){
                      otherSelColor=BATTLE_COLORS[si%BATTLE_COLORS.length];
                      break;
                    }
                  }
                }
                // In tetris/battle mode, use dropKey in key to re-mount and animate
                const useDropAnim=(soloMode==="tetris"||gameMode==="battle")&&dropKey>0&&!eaten&&!s;
                return(
                  <div key={`${r}-${c}-${dropKey}`} data-c={`${r},${c}`}
                    onMouseDown={e=>{e.preventDefault();onDragStart(r,c);}}
                    onTouchStart={e=>{e.preventDefault();onDragStart(r,c);}}
                    style={{
                      width:"100%",aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:isLarge?"clamp(34px,10vw,56px)":"clamp(28px,8vw,48px)",fontFamily:"'VT323',monospace",fontWeight:"normal",
                      color:eaten?endColor||"transparent":s?S.bg:otherSelColor||(letterMult?letterColor(letter,lang):S.green),
                      background:eaten?(S.gridBg||"#111133"):last?S.yellow:s?S.green:otherSelColor?otherSelColor+"33":S.cell,
                      border:`2px solid ${eaten?(S.gridBg||"#111133"):s?S.green:otherSelColor||S.cellBorder}`,
                      cursor:state==="play"?"pointer":"default",transition:"all 0.1s",
                      boxShadow:eaten?"none":s?`0 0 12px ${S.green}66`:otherSelColor?`0 0 8px ${otherSelColor}44`:"none",
                      textTransform:"uppercase",textShadow:s||eaten?"none":`0 0 8px ${otherSelColor||(letterMult?letterColor(letter,lang):S.green)}44`,
                      animation:eaten?endAnim:useDropAnim?`cellDrop 0.3s ${c*0.03}s ease-out`:"none",
                      "--ex":`${((c-2)*40)}px`,"--ey":`${((r-2)*40)}px`,
                      position:"relative",
                    }}>
                    {eaten?"":<>
                      {letter}
                      {letterMult&&<span style={{position:"absolute",bottom:"1px",right:"3px",fontSize:"clamp(9px,2.5vw,13px)",fontFamily:"'Press Start 2P',monospace",color:letterColor(letter,lang),opacity:0.7,lineHeight:1}}>{getLetterValues(lang)[letter]||1}</span>}
                    </>}
                  </div>
                );
              }))}
            </div>
            {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true}/>}
          </div>

          {state==="play"&&(
            <div style={{marginTop:"8px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,maxHeight:"120px",overflowY:"auto"}}>
              <div style={{fontSize:"13px",color:"#555",marginBottom:"4px"}}>{(gameMode==="battle"||(mode==="solo"&&soloMode==="tetris"))?`${t.found} (${found.length})`:`${t.found} (${found.length}/${valid.size})`}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {found.length===0?<span style={{fontSize:"18px",color:"#333"}}>{t.dragWords}</span>:
                  found.map((w,i)=>(
                    <span key={i} style={{fontSize:"18px",background:"#1a3a2a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length),animation:i===found.length-1?"pop 0.3s ease":"none"}}>
                      {w.toUpperCase()} +{letterMult?ptsLetters(w,lang):pts(w.length)}
                    </span>
                  ))
                }
              </div>
            </div>
          )}

          {/* Unlimited mode: refresh + end buttons */}
          {state==="play"&&mode==="solo"&&gameTime===0&&(
            <div style={{display:"flex",gap:"8px",marginTop:"8px"}}>
              <button onClick={refreshGrid} style={{fontFamily:S.font,fontSize:"11px",color:"#44ddff",background:"transparent",border:"2px solid #44ddff",padding:"10px 16px",cursor:"pointer",flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelIcon icon="refresh" color="#44ddff" size={2}/>{t.newLetters}</button>
              <button onClick={endUnlimited} style={{fontFamily:S.font,fontSize:"11px",color:S.red,background:"transparent",border:`2px solid ${S.red}`,padding:"10px 16px",cursor:"pointer",flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelIcon icon="stop" color={S.red} size={2}/>{t.stop}</button>
            </div>
          )}
        </div>
      )}

      {/* GAME OVER */}
      {mode==="solo"&&state==="end"&&(
        <div style={{width:"100%",maxWidth:"600px",textAlign:"center",animation:"fadeIn 1s ease",position:"relative"}}>
          {confettiOn&&<ConfettiCelebration isWinner={true}/>}
          <div style={{position:"relative",zIndex:1,border:`3px solid ${ending?.color||S.yellow}`,padding:"20px",marginBottom:"12px",boxShadow:`0 0 30px ${ending?.color||S.yellow}33`,background:S.dark}}>
            <div style={{fontSize:"13px",color:ending?.color||S.yellow,marginBottom:"4px"}}>{ending?.emoji} {ending?.desc||"Peli päättyi!"}</div>
            <div style={{fontSize:"13px",color:"#556",marginBottom:"10px"}}>{t.score}</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}{(soloMode!=="tetris"&&gameTime!==0)?<span style={{fontSize:"16px",color:"#556"}}> / {totalPossible}</span>:null}</div>
            {(soloMode==="tetris"||gameTime===0)?<div style={{fontSize:"13px",color:"#556",marginTop:"6px"}}>{found.length} {t.words}</div>:<>
            <div style={{fontSize:"13px",color:"#88ccaa",marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            </>}

            {/* Hall of Fame submit */}
            {gameTime!==0&&score>0&&!hofSubmitted&&(
              <div style={{marginTop:"12px",padding:"10px",border:`1px solid ${S.yellow}44`,background:"#ffcc0008"}}>
                {soloNickname.trim()?(
                  <button onClick={async()=>{
                    await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                      wordsTotal:valid.size,gameMode:soloMode,gameTime,lang});
                    setHofSubmitted(true);
                  }} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:S.yellow,border:"none",padding:"8px 16px",cursor:"pointer"}}>
                    {t.saveAs} {soloNickname.trim()}
                  </button>
                ):(
                  <>
                    <div style={{fontSize:"11px",color:S.yellow,marginBottom:"6px"}}>{t.saveToHof}</div>
                    <div style={{display:"flex",gap:"6px",justifyContent:"center",alignItems:"center"}}>
                      <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
                        placeholder={t.nickname} style={{fontFamily:S.font,fontSize:"11px",color:S.green,background:S.dark,
                        border:`2px solid ${S.green}`,padding:"8px",width:"140px",textAlign:"center",outline:"none"}}/>
                      <button onClick={async()=>{
                        if(!soloNickname.trim())return;
                        await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                          wordsTotal:valid.size,gameMode:soloMode,gameTime,lang});
                        setHofSubmitted(true);
                      }} disabled={!soloNickname.trim()}
                        style={{fontFamily:S.font,fontSize:"11px",color:soloNickname.trim()?S.bg:"#556",
                        background:soloNickname.trim()?S.yellow:"#333",border:"none",padding:"8px 12px",cursor:soloNickname.trim()?"pointer":"default"}}>
                        {t.save}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {hofSubmitted&&<div style={{fontSize:"11px",color:S.green,marginTop:"8px"}}>{t.saved}</div>}

            {/* Share result */}
            <button onClick={async()=>{
              const text=t.shareText.replace("{words}",found.length).replace("{score}",score)+"\nhttps://piilosana.up.railway.app";
              if(navigator.share){try{await navigator.share({text});return;}catch{}}
              try{await navigator.clipboard.writeText(text);addPopup(t.shareCopied,S.green);}catch{}
            }} style={{fontFamily:S.font,fontSize:"11px",color:"#44ddff",border:"2px solid #44ddff",background:"transparent",
              padding:"8px 16px",cursor:"pointer",marginTop:"10px",width:"280px"}}>
              {t.share}
            </button>

            <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center",marginTop:"10px"}}>
              <button onClick={()=>{setHofSubmitted(false);start();}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>{t.newPractice}</button>
              <button onClick={switchToMulti} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>{t.customGame}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>{t.menu}</button>
            </div>
          </div>

          {found.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"18px",color:S.green,marginBottom:"6px"}}>{t.foundOf} ({found.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {[...found].sort((a,b)=>b.length-a.length).map((w,i)=>(
                  <span key={i} style={{fontSize:"18px",background:"#1a3a2a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {soloMode!=="tetris"&&gameTime!==0&&missed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>{t.missed} ({missed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {missed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:"#2a1a1a",padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame gameMode={soloMode} gameTime={gameTime} currentScore={hofSubmitted?score:null} S={S} lang={lang}/>
        </div>
      )}

      {/* Ad banner placeholder */}
      <div style={{width:"100%",maxWidth:"600px",minHeight:"60px",marginTop:"16px",flexShrink:0}}/>


      {/* Pink theme unicorn decorations */}
      {themeId==="pink"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"10%",left:"5%",fontSize:"32px",opacity:0.12,animation:"floatUnicorn 8s ease-in-out infinite"}}>🦄</div>
          <div style={{position:"absolute",top:"30%",right:"8%",fontSize:"24px",opacity:0.10,animation:"floatUnicorn 10s ease-in-out infinite 2s"}}>🌸</div>
          <div style={{position:"absolute",bottom:"20%",left:"10%",fontSize:"28px",opacity:0.10,animation:"floatUnicorn 9s ease-in-out infinite 4s"}}>✨</div>
          <div style={{position:"absolute",top:"60%",right:"5%",fontSize:"26px",opacity:0.08,animation:"floatUnicorn 11s ease-in-out infinite 1s"}}>🦄</div>
          <div style={{position:"absolute",bottom:"35%",left:"45%",fontSize:"20px",opacity:0.08,animation:"floatUnicorn 7s ease-in-out infinite 3s"}}>💖</div>
          <div style={{position:"absolute",top:"5%",right:"30%",fontSize:"18px",opacity:0.10,animation:"floatUnicorn 12s ease-in-out infinite 5s"}}>🌈</div>
        </div>
      )}

      {/* Electric theme scanline / glow effects */}
      {themeId==="electric"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
            background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,100,255,0.03) 2px,rgba(0,100,255,0.03) 4px)",
            animation:"scanlines 0.1s steps(1) infinite"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:"120%",height:"120%",
            background:"radial-gradient(ellipse at center,rgba(0,100,255,0.08) 0%,transparent 70%)",
            animation:"electricPulse 4s ease-in-out infinite"}}/>
        </div>
      )}
    </div>
  );
}
