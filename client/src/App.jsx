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

// Rotate grid: shift a row left/right or column up/down (wrap-around)
function rotateRow(grid,row,dir){// dir: 1=right, -1=left
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let c=0;c<sz;c++){ng[row][(c+dir+sz)%sz]=grid[row][c];}
  return ng;
}
function rotateCol(grid,col,dir){// dir: 1=down, -1=up
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let r=0;r<sz;r++){ng[(r+dir+sz)%sz][col]=grid[r][col];}
  return ng;
}

// Chess piece movement rules
const CHESS_PIECES=["pawn","rook","bishop","knight","queen"];
const CHESS_EMOJI={pawn:"♟",rook:"♜",bishop:"♝",knight:"♞",queen:"♛"};
const CHESS_NAMES={
  fi:{pawn:"sotilas",rook:"torni",bishop:"lähetti",knight:"ratsu",queen:"kuningatar"},
  en:{pawn:"pawn",rook:"rook",bishop:"bishop",knight:"knight",queen:"queen"},
  sv:{pawn:"bonde",rook:"torn",bishop:"löpare",knight:"springare",queen:"dam"},
};
const CHESS_MULT={pawn:1.5,rook:1,bishop:1.5,knight:2,queen:1};
function chessValidMoves(piece,r,c,sz){
  const moves=[];
  if(piece==="knight"){
    for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<sz&&nc>=0&&nc<sz)moves.push({r:nr,c:nc});
    }
  }else if(piece==="rook"){
    for(let i=0;i<sz;i++){if(i!==r)moves.push({r:i,c});if(i!==c)moves.push({r,c:i});}
  }else if(piece==="bishop"){
    for(let d=1;d<sz;d++){
      if(r-d>=0&&c-d>=0)moves.push({r:r-d,c:c-d});
      if(r-d>=0&&c+d<sz)moves.push({r:r-d,c:c+d});
      if(r+d<sz&&c-d>=0)moves.push({r:r+d,c:c-d});
      if(r+d<sz&&c+d<sz)moves.push({r:r+d,c:c+d});
    }
  }else if(piece==="queen"){
    for(let i=0;i<sz;i++){if(i!==r)moves.push({r:i,c});if(i!==c)moves.push({r,c:i});}
    for(let d=1;d<sz;d++){
      if(r-d>=0&&c-d>=0)moves.push({r:r-d,c:c-d});
      if(r-d>=0&&c+d<sz)moves.push({r:r-d,c:c+d});
      if(r+d<sz&&c-d>=0)moves.push({r:r+d,c:c-d});
      if(r+d<sz&&c+d<sz)moves.push({r:r+d,c:c+d});
    }
  }else if(piece==="pawn"){
    // Pawn: forward (up) + diagonal captures (up-left, up-right)
    if(r-1>=0)moves.push({r:r-1,c});
    if(r-1>=0&&c-1>=0)moves.push({r:r-1,c:c-1});
    if(r-1>=0&&c+1<sz)moves.push({r:r-1,c:c+1});
  }
  return moves;
}
function randomChessPiece(){return CHESS_PIECES[Math.floor(Math.random()*CHESS_PIECES.length)];}

// Theme word categories
const WORD_THEMES={
  fi:[
    {name:"Eläimet",emoji:"🐾",words:["kissa","koira","karhu","hirvi","lintu","orava","kettu","jänis","susi","kotka","hauki","ahven","sorsa","tikka","haukka"]},
    {name:"Ruoka",emoji:"🍽️",words:["leipä","juusto","kakku","liha","kala","riisi","pasta","keitto","salaatti","peruna","tomaatti","sipuli","porkkana","omena","marja"]},
    {name:"Luonto",emoji:"🌿",words:["metsä","järvi","joki","puu","kukka","taivas","pilvi","sade","tuuli","lumi","kallio","niitty","suo","lahti","saari"]},
    {name:"Koti",emoji:"🏠",words:["tuoli","pöytä","sänky","ovi","ikkuna","lattia","seinä","katto","lampu","peili","matto","tyyny","lakana","hylly","kaappi"]},
    {name:"Keho",emoji:"🫀",words:["käsi","jalka","pää","silmä","korva","nenä","suu","sormi","polvi","olka","rinta","selkä","vatsa","sydän","luut"]},
  ],
  en:[
    {name:"Animals",emoji:"🐾",words:["cat","dog","bear","bird","fish","deer","wolf","fox","hawk","eagle","snake","mouse","frog","duck","owl"]},
    {name:"Food",emoji:"🍽️",words:["bread","cheese","cake","meat","fish","rice","pasta","soup","salad","apple","grape","lemon","peach","plum","corn"]},
    {name:"Nature",emoji:"🌿",words:["tree","lake","river","cloud","rain","wind","snow","rock","hill","field","leaf","bloom","shore","wave","sand"]},
    {name:"Home",emoji:"🏠",words:["chair","table","bed","door","wall","floor","lamp","shelf","desk","couch","rug","towel","plate","glass","cup"]},
    {name:"Body",emoji:"🫀",words:["hand","foot","head","eye","ear","nose","mouth","arm","leg","knee","back","neck","chest","heart","bone"]},
  ],
  sv:[
    {name:"Djur",emoji:"🐾",words:["katt","hund","björn","fågel","fisk","rådjur","varg","räv","hök","örn","orm","mus","groda","anka","uggla"]},
    {name:"Mat",emoji:"🍽️",words:["bröd","ost","kaka","kött","fisk","ris","soppa","sallad","äpple","druva","citron","majs","plommon","päron","banan"]},
    {name:"Natur",emoji:"🌿",words:["träd","sjö","flod","moln","regn","vind","snö","sten","kulle","fält","löv","strand","våg","sand","skog"]},
    {name:"Hem",emoji:"🏠",words:["stol","bord","säng","dörr","vägg","golv","lampa","hylla","soffa","matta","kudde","glas","kopp","skål","fat"]},
    {name:"Kropp",emoji:"🫀",words:["hand","fot","huvud","öga","öra","näsa","mun","arm","ben","knä","rygg","nacke","bröst","hjärta","blod"]},
  ],
};

// Pick random mystery cell
function pickMysteryCell(sz){return{r:Math.floor(Math.random()*sz),c:Math.floor(Math.random()*sz)};}

// Pick random bomb cell
function pickBombCell(sz){return{r:Math.floor(Math.random()*sz),c:Math.floor(Math.random()*sz)};}

// Scramble a section of the grid (for bomb explosion)
function scrambleArea(grid,centerR,centerC,radius,lang){
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let r=Math.max(0,centerR-radius);r<=Math.min(sz-1,centerR+radius);r++){
    for(let c=Math.max(0,centerC-radius);c<=Math.min(sz-1,centerC+radius);c++){
      ng[r][c]=randLetterLang(lang);
    }
  }
  return ng;
}

// UI translations
const T={
  fi:{
    selectMode:"VALITSE PELIMUOTO",arena:"MONINPELI",arenaDesc:"24/7 nonstop-moninpeli",arenaCta:"PELAA NYT",arenaWelcome:"Tervetuloa — liity peliin!",customGame:"OMA MONINPELI",customDesc:"kutsu kavereita",practice:"HARJOITTELU",practiceDesc:"yksinpeli",
    findWords:"Etsi sanoja ruudukosta!",dragHint:"VEDÄ kirjaimien yli kaikkiin suuntiin. Aikaa 2 min.",comboHint:"Löydä sanoja nopeasti putkeen = kombo ja lisäpisteet!",
    scoring:"PISTEYTYS: 3kir=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"KOMBO x2 (3+) · KOMBO x3 (5+)",words:"sanaa",
    nickname:"NIMIMERKKI",join:"LIITY",back:"TAKAISIN",exit:"POISTU",play:"PELAA",
    arenaJoinDesc:"Jatkuva peli kaikille! Liity mukaan ja etsi sanoja. Kierros kestää 2 min.",
    nextRound:"Seuraava kierros alkaa",playersInArena:"pelaajaa moninpelissä",playerInArena:"pelaaja moninpelissä",players:"pelaajaa",player:"pelaaja",
    getReady:"VALMISTAUDU",roundOver:"KIERROS PÄÄTTYI",yourScore:"PISTEESI",nextRoundIn:"Seuraava kierros",starts:"alkaa!",
    roundResults:"KIERROKSEN TULOKSET",foundWords:"LÖYDETYT SANAT",ownHighlighted:"Omat sanasi korostettu väreillä",
    missed:"JÄIVÄT LÖYTÄMÄTTÄ",
    gameMode:"PELIMUOTO",classic:"KLASSINEN",battle:"TAISTELU",battleDesc:"Sanat näkyvät muille! Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä.",
    time:"AIKA",unlimited:"RAJATON",unlimitedDesc:"Ei aikarajaa! Vaihda ruudukko kun haluat.",
    letterMult:"PISTEYTYS",letterMultBtn:"KIRJAINARVOT",letterMultDesc:"Harvinaiset kirjaimet = enemmän pisteitä! (D,Ö=7 V,J,H,Y,P,U=4 ...)",
    otherOptions:"MUUT VALINNAT",nickForHof:"NIMIMERKKI (ennätystauluun)",optional:"VAPAAEHTOINEN",scoresSaved:"Pisteesi tallennetaan nimellä",
    modeNormal:"NORMAALI",modeTetris:"PUDOTUS",tetrisDesc:"Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä!",
    modeRotate:"PYÖRITYS",rotateDesc:"Raahaa reunoilta pyörittääksesi rivejä ja sarakkeita — kuin kuutiota! Löydä uusia sanoja.",rotateStarts:"PYÖRITYS ALKAA",rotateLabel:"PYÖRITYS",
    modeTheme:"TEEMAT",themeDesc:"Löydä teemaan kuuluvia sanoja bonuspisteillä!",themeStarts:"TEEMAT ALKAA",themeLabel:"TEEMAT",themeBonus:"TEEMABONUS",themeHint:"Teema",
    modeBomb:"POMMI",bombDesc:"Käytä tikittävä kirjain sanassa ennen kuin se räjähtää!",bombStarts:"POMMI ALKAA",bombLabel:"POMMI",bombExploded:"POMMI RÄJÄHTI!",
    modeMystery:"MYSTEERI",mysteryDesc:"Piilotettu kirjain paljastuu kun löydät sanan sen kautta!",mysteryStarts:"MYSTEERI ALKAA",mysteryLabel:"MYSTEERI",mysteryRevealed:"PALJASTETTU!",
    modeChess:"SHAKKI",chessDesc:"Liikuta shakkinappulaa ja muodosta sanoja sen liikkeen mukaan!",chessLabel:"SHAKKI",chessSubmit:"VAHVISTA",chessSkip:"OHITA",chessNewPiece:"Uusi nappula:",chessInvalidMove:"Ei mahdollinen!",
    modeHex:"HEKSA",hexDesc:"Kuusikulmaiset ruudut — 6 naapuria jokaisella! Uusia polkuja sanoille.",hexStarts:"HEKSA ALKAA",hexLabel:"HEKSA",
    waiting:"ODOTETAAN PELAAJIA",playersCount:"PELAAJAT",youTag:"SINÄ",createGame:"LUO PELI",connecting:"YHDISTETÄÄN...",
    startGame:"ALOITA PELI",waitForPlayers:"Odota, että joku liittyy peliisi...",waitForHost:"Odota, että isäntä aloittaa pelin...",
    joinGame:"LIITY PELIIN",roomCode:"HUONEKOODI",noRooms:"Ei avoimia huoneita",orJoinRoom:"tai liity koodilla",
    newCustom:"UUSI OMA NETTIPELI",menu:"VALIKKO",newPractice:"UUSI HARJOITUS",
    results:"TULOKSET",score:"PISTEET",gameOver:"PELI PÄÄTTYI!",youWon:"VOITIT!",
    found:"LÖYDETYT",foundOf:"LÖYSIT",dragWords:"Vedä kirjaimista sanoja...",
    notValid:"Ei kelpaa",alreadyFound:"Jo löydetty",
    arenaLabel:"MONINPELI",battleLabel:"TAISTELU",tetrisLabel:"PUDOTUS",rotateLabel:"PYÖRITYS",themeLabel:"TEEMAT",bombLabel:"POMMI",mysteryLabel:"MYSTEERI",unlimitedLabel:"RAJATON",letterMultLabel:"KIRJAINARVOT",
    newLetters:"UUDET KIRJAIMET",stop:"LOPETA",
    saveAs:"TALLENNA NIMELLÄ",save:"TALLENNA",saved:"✓ Tallennettu!",saveToHof:"TALLENNA ENNÄTYSTAULULLE",
    gameStarts:"PELI ALKAA",battleStarts:"TAISTELU ALKAA",tetrisStarts:"PUDOTUS ALKAA",comboStreak:"putkeen!",
    megaCombo:"MEGA KOMBO",combo:"KOMBO",online:"online",
    openGames:"AVOIMET PELIT",roomFull:"Huone on täynnä",gameInProgress:"Peli on jo käynnissä",roomNotFound:"Huonetta ei löydy",
    someoneBeatYou:"Joku ehti ensin!",tooShort:"Liian lyhyt",notInGrid:"Ei löydy ruudukosta",wrongMode:"Väärä moodi",gameNotRunning:"Peli ei käynnissä",
    achievements:"SAAVUTUKSET",achievementUnlocked:"Uusi saavutus!",locked:"Lukittu",
    share:"JAA TULOS",shareCopied:"Kopioitu!",shareText:"Piilosana — löysin {words} sanaa ja sain {score} pistettä! Pääsetkö parempaan?",
    options:"ASETUKSET",quickPlay:"PELAA",or:"tai",advancedOptions:"Lisävalinnat",
    readMoreWords:"Lue lisää sanoista",
    wordInfoTitle:"SANALISTASTA",
    wordInfoBody1:"Sanalistassa on perusmuotoja, taivutuksia ja yhdyssanoja — yhteensä noin 138 000 sanaa.",
    wordInfoBody2:"Suomen kielelle sanoja on paljon, koska suomen rikas taivutusjärjestelmä tuottaa saman sanan monessa muodossa (esim. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"Sanalista perustuu Wiktionary-sanakirjaan (kaikki.org). Sanat ovat 3–7 kirjainta pitkiä.",
    wordInfoSources:"Lähteet",
    wordInfoSourceFi:"Wiktionary (kaikki.org) — perusmuodot ja taivutukset, ~138 000 sanaa",
    wordInfoSourceEn:"ENABLE — Enhanced North American Benchmark Lexicon (public domain)",
    wordInfoSourceSv:"Wiktionary (kaikki.org) — grundformer och böjningar (CC-BY-SA)",
    howToPlay:"Näin pelaat",
    helpDrag:"Vedä sormella tai hiirellä kirjainten yli muodostaaksesi sanoja. Voit liikkua kaikkiin suuntiin, myös vinottain.",
    helpTime:"Sinulla on 2 minuuttia aikaa löytää mahdollisimman monta sanaa.",
    helpScoring:"Pisteytys: 3 kirjainta = 1p · 4 = 2p · 5 = 4p · 6 = 6p · 7+ = 10p",
    helpCombo:"Löydä sanoja nopeasti peräkkäin → combo! 3+ peräkkäin = x2, 5+ = x3 pisteet.",
    helpMultiplier:"Kultaiset kirjaimet antavat 2× tai 3× pistekertoimen sanaan.",
    helpLang:"Voit vaihtaa kieltä päävalikossa. Jokaisella kielellä on oma sanavarasto — suomeksi noin 138 000, englanniksi ja ruotsiksi omat sanalistansa.",
  },
  en:{
    selectMode:"SELECT GAME MODE",arena:"MULTIPLAYER",arenaDesc:"24/7 online game",arenaCta:"PLAY NOW",arenaWelcome:"Welcome — join the game!",customGame:"CUSTOM GAME",customDesc:"various modes",practice:"PRACTICE",practiceDesc:"solo play",
    findWords:"Find words from the grid!",dragHint:"DRAG across letters in all directions. 2 min timer.",comboHint:"Find words quickly in a row = combo and bonus points!",
    scoring:"SCORING: 3let=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"COMBO x2 (3+) · COMBO x3 (5+)",words:"words",
    nickname:"NICKNAME",join:"JOIN",back:"BACK",exit:"EXIT",play:"PLAY",
    arenaJoinDesc:"Continuous game for everyone! Join in and find words. Round lasts 2 min.",
    nextRound:"Next round starts",playersInArena:"playing",playerInArena:"playing",players:"players",player:"player",
    getReady:"GET READY",roundOver:"ROUND OVER",yourScore:"YOUR SCORE",nextRoundIn:"Next round",starts:"starting!",
    roundResults:"ROUND RESULTS",foundWords:"FOUND WORDS",ownHighlighted:"Your words highlighted in color",
    missed:"NOT FOUND",
    gameMode:"GAME MODE",classic:"CLASSIC",battle:"BATTLE",battleDesc:"Words visible to others! Found letters disappear and new ones drop from above.",
    time:"TIME",unlimited:"UNLIMITED",unlimitedDesc:"No time limit! Change grid whenever you want.",
    letterMult:"SCORING",letterMultBtn:"LETTER VALUES",letterMultDesc:"Rare letters = more points! (Q,Z=10 J,X=8 K=5 ...)",
    otherOptions:"OTHER OPTIONS",nickForHof:"NICKNAME (for leaderboard)",optional:"OPTIONAL",scoresSaved:"Your score will be saved as",
    modeNormal:"NORMAL",modeTetris:"DROP",tetrisDesc:"Found letters disappear and new ones drop from above!",
    modeRotate:"ROTATE",rotateDesc:"Drag edges to rotate rows and columns — like a cube! Find new words.",rotateStarts:"ROTATE STARTS",rotateLabel:"ROTATE",
    modeTheme:"THEMES",themeDesc:"Find themed words for bonus points!",themeStarts:"THEMES START",themeLabel:"THEMES",themeBonus:"THEME BONUS",themeHint:"Theme",
    modeBomb:"BOMB",bombDesc:"Use the ticking letter in a word before it explodes!",bombStarts:"BOMB STARTS",bombLabel:"BOMB",bombExploded:"BOMB EXPLODED!",
    modeMystery:"MYSTERY",mysteryDesc:"A hidden letter is revealed when you find a word through it!",mysteryStarts:"MYSTERY STARTS",mysteryLabel:"MYSTERY",mysteryRevealed:"REVEALED!",
    modeChess:"CHESS",chessDesc:"Move a chess piece and form words following its movement rules!",chessLabel:"CHESS",chessSubmit:"SUBMIT",chessSkip:"SKIP",chessNewPiece:"New piece:",chessInvalidMove:"Not possible!",
    modeHex:"HEX",hexDesc:"Hexagonal cells — 6 neighbors each! New paths for words.",hexStarts:"HEX STARTS",hexLabel:"HEX",
    waiting:"WAITING FOR PLAYERS",playersCount:"PLAYERS",youTag:"YOU",createGame:"CREATE GAME",connecting:"CONNECTING...",
    startGame:"START GAME",waitForPlayers:"Wait for someone to join...",waitForHost:"Waiting for host to start...",
    joinGame:"JOIN GAME",roomCode:"ROOM CODE",noRooms:"No open rooms",orJoinRoom:"or join with code",
    newCustom:"NEW CUSTOM GAME",menu:"MENU",newPractice:"NEW PRACTICE",
    results:"RESULTS",score:"SCORE",gameOver:"GAME OVER!",youWon:"YOU WON!",
    found:"FOUND",foundOf:"YOU FOUND",dragWords:"Drag across letters to find words...",
    notValid:"Not valid",alreadyFound:"Already found",
    arenaLabel:"MULTIPLAYER",battleLabel:"BATTLE",tetrisLabel:"DROP",rotateLabel:"ROTATE",themeLabel:"THEMES",bombLabel:"BOMB",mysteryLabel:"MYSTERY",unlimitedLabel:"UNLIMITED",letterMultLabel:"LETTER VALUES",
    newLetters:"NEW LETTERS",stop:"STOP",
    saveAs:"SAVE AS",save:"SAVE",saved:"✓ Saved!",saveToHof:"SAVE TO LEADERBOARD",
    gameStarts:"GAME STARTS",battleStarts:"BATTLE STARTS",tetrisStarts:"DROP STARTS",comboStreak:"in a row!",
    megaCombo:"MEGA COMBO",combo:"COMBO",online:"online",
    openGames:"OPEN GAMES",roomFull:"Room is full",gameInProgress:"Game already in progress",roomNotFound:"Room not found",
    someoneBeatYou:"Someone got it first!",tooShort:"Too short",notInGrid:"Not found in grid",wrongMode:"Wrong mode",gameNotRunning:"Game not running",
    achievements:"ACHIEVEMENTS",achievementUnlocked:"New achievement!",locked:"Locked",
    share:"SHARE",shareCopied:"Copied!",shareText:"Piilosana — I found {words} words and scored {score} points! Can you beat me?",
    options:"SETTINGS",quickPlay:"PLAY",or:"or",advancedOptions:"More options",
    readMoreWords:"Read more about the words",
    wordInfoTitle:"ABOUT THE WORD LIST",
    wordInfoBody1:"The word list includes base forms, inflections and compound words — about 138,000 words in total.",
    wordInfoBody2:"The Finnish list is especially large because Finnish has a rich inflection system that produces many forms of each word (e.g. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"The word list is based on the Wiktionary dictionary (kaikki.org). Words are 3–7 letters long.",
    wordInfoSources:"Sources",
    wordInfoSourceFi:"Wiktionary (kaikki.org) — base forms and inflections, ~138,000 words",
    wordInfoSourceEn:"ENABLE — Enhanced North American Benchmark Lexicon (public domain)",
    wordInfoSourceSv:"SAOL — Swedish Academy Glossary",
    howToPlay:"How to play",
    helpDrag:"Drag your finger or mouse across letters to form words. You can move in all directions, including diagonally.",
    helpTime:"You have 2 minutes to find as many words as possible.",
    helpScoring:"Scoring: 3 letters = 1pt · 4 = 2pt · 5 = 4pt · 6 = 6pt · 7+ = 10pt",
    helpCombo:"Find words quickly in a row → combo! 3+ in a row = x2, 5+ = x3 points.",
    helpMultiplier:"Golden letters give a 2× or 3× score multiplier for the word.",
    helpLang:"You can switch language from the main menu. Each language has its own word list — Finnish has about 138,000 words, English and Swedish have their own vocabularies.",
  },
  sv:{
    selectMode:"VÄLJ SPELLÄGE",arena:"FLERSPELARE",arenaDesc:"24/7 onlinespel",arenaCta:"SPELA NU",arenaWelcome:"Välkommen — gå med i spelet!",customGame:"EGET SPEL",customDesc:"olika lägen",practice:"ÖVNING",practiceDesc:"ensam",
    findWords:"Hitta ord i rutnätet!",dragHint:"DRA över bokstäverna i alla riktningar. 2 min tid.",comboHint:"Hitta ord snabbt i rad = kombo och bonuspoäng!",
    scoring:"POÄNG: 3bok=1p · 4=2p · 5=4p · 6=6p · 7=10p",comboScoring:"KOMBO x2 (3+) · KOMBO x3 (5+)",words:"ord",
    nickname:"SMEKNAMN",join:"GÅ MED",back:"TILLBAKA",exit:"LÄMNA",play:"SPELA",
    arenaJoinDesc:"Löpande spel för alla! Gå med och hitta ord. Rundan varar 2 min.",
    nextRound:"Nästa runda börjar",playersInArena:"spelar",playerInArena:"spelar",players:"spelare",player:"spelare",
    getReady:"GÖR DIG REDO",roundOver:"RUNDAN SLUT",yourScore:"DINA POÄNG",nextRoundIn:"Nästa runda",starts:"börjar!",
    roundResults:"RUNDANS RESULTAT",foundWords:"HITTADE ORD",ownHighlighted:"Dina ord markerade i färg",
    missed:"INTE HITTADE",
    gameMode:"SPELLÄGE",classic:"KLASSISKT",battle:"STRID",battleDesc:"Ord syns för andra! Hittade bokstäver försvinner och nya faller uppifrån.",
    time:"TID",unlimited:"OBEGRÄNSAD",unlimitedDesc:"Ingen tidsgräns! Byt rutnät när du vill.",
    letterMult:"POÄNGSÄTTNING",letterMultBtn:"BOKSTAVSVÄRDEN",letterMultDesc:"Ovanliga bokstäver = mer poäng! (Z=10 X=8 J=7 ...)",
    otherOptions:"ANDRA VAL",nickForHof:"SMEKNAMN (för topplistan)",optional:"VALFRITT",scoresSaved:"Dina poäng sparas som",
    modeNormal:"NORMAL",modeTetris:"FALL",tetrisDesc:"Hittade bokstäver försvinner och nya faller uppifrån!",
    modeRotate:"ROTERA",rotateDesc:"Dra i kanterna för att rotera rader och kolumner — som en kub! Hitta nya ord.",rotateStarts:"ROTERA BÖRJAR",rotateLabel:"ROTERA",
    modeTheme:"TEMAN",themeDesc:"Hitta temaord för bonuspoäng!",themeStarts:"TEMAN BÖRJAR",themeLabel:"TEMAN",themeBonus:"TEMABONUS",themeHint:"Tema",
    modeBomb:"BOMB",bombDesc:"Använd den tickande bokstaven i ett ord innan den exploderar!",bombStarts:"BOMB BÖRJAR",bombLabel:"BOMB",bombExploded:"BOMBEN EXPLODERADE!",
    modeMystery:"MYSTERIUM",mysteryDesc:"En dold bokstav avslöjas när du hittar ett ord genom den!",mysteryStarts:"MYSTERIUM BÖRJAR",mysteryLabel:"MYSTERIUM",mysteryRevealed:"AVSLÖJAD!",
    modeChess:"SCHACK",chessDesc:"Flytta en schackpjäs och bilda ord efter dess rörelseregler!",chessLabel:"SCHACK",chessSubmit:"BEKRÄFTA",chessSkip:"HOPPA ÖVER",chessNewPiece:"Ny pjäs:",chessInvalidMove:"Inte möjligt!",
    modeHex:"HEXA",hexDesc:"Hexagonala rutor — 6 grannar var! Nya vägar för ord.",hexStarts:"HEXA BÖRJAR",hexLabel:"HEXA",
    waiting:"VÄNTAR PÅ SPELARE",playersCount:"SPELARE",youTag:"DU",createGame:"SKAPA SPEL",connecting:"ANSLUTER...",
    startGame:"STARTA SPEL",waitForPlayers:"Vänta tills någon går med...",waitForHost:"Väntar på att värden startar...",
    joinGame:"GÅ MED I SPEL",roomCode:"RUMSKOD",noRooms:"Inga öppna rum",orJoinRoom:"eller gå med via kod",
    newCustom:"NYTT EGET SPEL",menu:"MENY",newPractice:"NY ÖVNING",
    results:"RESULTAT",score:"POÄNG",gameOver:"SPELET SLUT!",youWon:"DU VANN!",
    found:"HITTADE",foundOf:"DU HITTADE",dragWords:"Dra över bokstäver för att hitta ord...",
    notValid:"Ogiltigt",alreadyFound:"Redan hittat",
    arenaLabel:"FLERSPELARE",battleLabel:"STRID",tetrisLabel:"FALL",rotateLabel:"ROTERA",themeLabel:"TEMAN",bombLabel:"BOMB",mysteryLabel:"MYSTERIUM",unlimitedLabel:"OBEGRÄNSAD",letterMultLabel:"BOKSTAVSVÄRDEN",
    newLetters:"NYA BOKSTÄVER",stop:"STOPPA",
    saveAs:"SPARA SOM",save:"SPARA",saved:"✓ Sparat!",saveToHof:"SPARA TILL TOPPLISTAN",
    gameStarts:"SPELET BÖRJAR",battleStarts:"STRIDEN BÖRJAR",tetrisStarts:"FALL BÖRJAR",comboStreak:"i rad!",
    megaCombo:"MEGA KOMBO",combo:"KOMBO",online:"online",
    openGames:"ÖPPNA SPEL",roomFull:"Rummet är fullt",gameInProgress:"Spelet pågår redan",roomNotFound:"Rummet hittades inte",
    someoneBeatYou:"Någon hann före!",tooShort:"För kort",notInGrid:"Finns inte i rutnätet",wrongMode:"Fel läge",gameNotRunning:"Spelet är inte igång",
    achievements:"PRESTATIONER",achievementUnlocked:"Ny prestation!",locked:"Låst",
    share:"DELA",shareCopied:"Kopierat!",shareText:"Piilosana — jag hittade {words} ord och fick {score} poäng! Kan du slå mig?",
    options:"INSTÄLLNINGAR",quickPlay:"SPELA",or:"eller",advancedOptions:"Fler alternativ",
    readMoreWords:"Läs mer om orden",
    wordInfoTitle:"OM ORDLISTAN",
    wordInfoBody1:"Ordlistan innehåller grundformer, böjningar och sammansatta ord — totalt cirka 138 000 ord.",
    wordInfoBody2:"Den finska listan är särskilt stor eftersom finska har ett rikt böjningssystem som ger många former av varje ord (t.ex. talo → taloa, talossa, talojen, taloihin...).",
    wordInfoBody3:"Ordlistan baseras på Wiktionary (kaikki.org). Orden är 3–7 bokstäver långa.",
    wordInfoSources:"Källor",
    wordInfoSourceFi:"Wiktionary (kaikki.org) — grundformer och böjningar, ~138 000 ord",
    wordInfoSourceEn:"ENABLE — Enhanced North American Benchmark Lexicon (public domain)",
    wordInfoSourceSv:"Wiktionary (kaikki.org) — grundformer och böjningar (CC-BY-SA)",
    howToPlay:"Så spelar du",
    helpDrag:"Dra fingret eller musen över bokstäver för att bilda ord. Du kan röra dig i alla riktningar, även diagonalt.",
    helpTime:"Du har 2 minuter på dig att hitta så många ord som möjligt.",
    helpScoring:"Poäng: 3 bokstäver = 1p · 4 = 2p · 5 = 4p · 6 = 6p · 7+ = 10p",
    helpCombo:"Hitta ord snabbt i rad → kombo! 3+ i rad = x2, 5+ = x3 poäng.",
    helpMultiplier:"Gyllene bokstäver ger 2× eller 3× poängmultiplikator för ordet.",
    helpLang:"Du kan byta språk från huvudmenyn. Varje språk har sin egen ordlista — finska har cirka 138 000 ord, engelska och svenska har egna vokabulär.",
  },
};

function findWords(grid,trie){
  const sz=grid.length,found=new Set(),dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*sz+c);for(const[dr,dc]of dirs){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<sz&&nc>=0&&nc<sz&&!vis.has(nr*sz+nc))dfs(nr,nc,nx,np,vis);}vis.delete(r*sz+c);}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++)dfs(r,c,trie,"",new Set());return found;
}

// Hex grid utilities (6-neighbor hexagonal grid, odd-r offset)
const HEX_DIRS_EVEN=[[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
const HEX_DIRS_ODD=[[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
function hexNeighbors(r,c,sz){const dirs=r%2===0?HEX_DIRS_EVEN:HEX_DIRS_ODD;return dirs.map(([dr,dc])=>({r:r+dr,c:c+dc})).filter(n=>n.r>=0&&n.r<sz&&n.c>=0&&n.c<sz);}
function findWordsHex(grid,trie){
  const sz=grid.length,found=new Set();
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*sz+c);for(const n of hexNeighbors(r,c,sz)){if(!vis.has(n.r*sz+n.c))dfs(n.r,n.c,nx,np,vis);}vis.delete(r*sz+c);}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++)dfs(r,c,trie,"",new Set());return found;
}
function adjHex(a,b){const dirs=a.r%2===0?HEX_DIRS_EVEN:HEX_DIRS_ODD;return dirs.some(([dr,dc])=>a.r+dr===b.r&&a.c+dc===b.c);}

function pts(len){if(len<=2)return 0;if(len===3)return 1;if(len===4)return 2;if(len===5)return 4;if(len===6)return 6;if(len===7)return 10;return 14;}

// Letter values and colors are now per-language, resolved in component via lang state
const LETTER_VALUE_COLORS={1:"#88bbcc",2:"#44ccdd",3:"#ffbb44",4:"#ff8833",5:"#ff6655",7:"#ff4466",8:"#ff4466",10:"#ff2244"};
function getLetterValues(lang){return getLangConf(lang).letterValues;}
function ptsLetters(word,lang='fi'){const lv=getLetterValues(lang);let s=0;for(const ch of word)s+=(lv[ch]||1);return s;}
function letterColor(ch,lang='fi'){const lv=getLetterValues(lang);return LETTER_VALUE_COLORS[lv[ch]||1]||"#88bbcc";}

const fontCSS=`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700&display=swap');`;

// ============================================
// THEMES
// ============================================
const MODERN_BASE={
  font:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  cellRadius:"10px",btnRadius:"10px",
  cellShadow:"inset 0 1px 4px #00000060, 0 2px 8px #00000030",
  btnShadow:"0 4px 16px #00000040",
  cellGradient:true,
  panelRadius:"12px",panelShadow:"0 8px 32px #00000055",
  titleFont:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  gridGap:"6px",
  letterFont:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
};
const THEMES={
  light:{
    name:"VAALEA",nameEn:"LIGHT",nameSv:"LJUS",
    bg:"#faf8f4",green:"#2d6a4f",yellow:"#7a6408",red:"#c0392b",purple:"#6c5ce7",
    dark:"#f0ece4",border:"#d4cbbf",cell:"#ffffff",cellBorder:"#e0d8ce",
    gridBg:"#f5f0e8",textMuted:"#8b7e6e",textSoft:"#5c4f3d",
    inputBg:"#ffffff",
    cellText:"#2c2416",cellTextSel:"#ffffff",
    btnYellowBg:"#8b7209",btnYellowShadow:"#5c4b06",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 3px #00000012, 0 1px 4px #00000008",
    panelShadow:"0 4px 16px #00000012",
    flavor:"ivory",
  },
  dark:{
    name:"TUMMA",nameEn:"DARK",nameSv:"MÖRK",
    bg:"#12101a",green:"#b39ddb",yellow:"#f0c674",red:"#ef5350",purple:"#ce93d8",
    dark:"#1c1828",border:"#342e48",cell:"#1c1828",cellBorder:"#3e3658",
    gridBg:"#0e0c16",textMuted:"#7e6fa0",textSoft:"#c4b5e0",
    inputBg:"#0e0c16",
    ...MODERN_BASE,
    flavor:"velvet",
  },
  pink:{
    name:"PINK DREAM",nameEn:"PINK DREAM",nameSv:"PINK DREAM",
    bg:"#fff0f5",green:"#d6336c",yellow:"#e64980",red:"#c2255c",purple:"#be4bdb",
    dark:"#ffe0ec",border:"#f0a0c0",cell:"#fff5f8",cellBorder:"#f5b8d0",
    gridBg:"#ffe8f0",textMuted:"#d0709a",textSoft:"#b03060",
    inputBg:"#fff5f8",
    cellText:"#6b1040",cellTextSel:"#ffffff",
    btnYellowBg:"#e64980",btnYellowShadow:"#c2255c",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 3px #ff80b020, 0 1px 4px #ff80b010",
    panelShadow:"0 4px 16px #ff80b018",
    flavor:"dream",
  },
  electric:{
    name:"ELECTRIC BLUE",nameEn:"ELECTRIC BLUE",nameSv:"ELECTRIC BLUE",
    bg:"#000814",green:"#00f0ff",yellow:"#7dff3a",red:"#ff2050",purple:"#6090ff",
    dark:"#001228",border:"#0050aa",cell:"#001030",cellBorder:"#0060cc",
    gridBg:"#000610",textMuted:"#2890dd",textSoft:"#50d0ff",
    inputBg:"#000a18",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 4px #00a0ff30, 0 2px 8px #00a0ff15",
    panelShadow:"0 8px 32px #0080ff20",
    flavor:"electric",
  },
  retro:{
    name:"RETRO",nameEn:"RETRO",nameSv:"RETRO",
    bg:"#0a0a1a",green:"#00ff88",yellow:"#ffcc00",red:"#ff4444",purple:"#ff66ff",
    dark:"#0d0d22",border:"#334",cell:"#1a1a3a",cellBorder:"#2a2a4a",
    font:"'Press Start 2P',monospace",
    gridBg:"#111133",textMuted:"#556",textSoft:"#88ccaa",
    inputBg:"#0d0d22",
    flavor:"retro",
  },
};
function getTheme(id){
  const t=THEMES[id]||THEMES.dark;
  return {
    cellRadius:"0px",btnRadius:"0px",cellShadow:"none",btnShadow:"none",
    cellGradient:false,panelRadius:"0px",panelShadow:"none",
    titleFont:t.font,gridGap:"0px",letterFont:"'VT323',monospace",
    ...t
  };
}

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
  { name:"SULJETTU", emoji:"🚪", color:"#8b6914",
    desc:"Putiikki menee kiinni!",
    cellAnim:(i,total)=>{const c=i%5;const fromLeft=c;const fromRight=4-c;const delay=Math.min(fromLeft,fromRight)*0.12;return `cellShutterClose 0.5s ${delay}s ease-in forwards`;},
    cellColor:(i)=>"#5c3a0a",
    overlay:(progress)=>({
      bg:`linear-gradient(to right, #3a2208${Math.floor(Math.min(1,progress*1.5)*200).toString(16).padStart(2,'0')} 0%, transparent ${Math.max(0,50-progress*50)}%, transparent ${Math.min(100,50+progress*50)}%, #3a2208${Math.floor(Math.min(1,progress*1.5)*200).toString(16).padStart(2,'0')} 100%)`,
      text:progress>0.3?"SULJETTU!":"",textColor:"#d4a832",
      particles:[]
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
      tick:n=>[["E5","32n",n],["G5","32n",n+0.06]],
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
      tick:n=>[["G5","32n",n],["B5","32n",n+0.08]],
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
      tick:n=>[["F#5","32n",n],["A5","32n",n+0.05]],
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
  const playTick=useCallback((remaining)=>{
    const notes=getNotes();
    if(remaining!==undefined&&remaining<=5){
      // Last 5 seconds: double tick, rising pitch
      const pitch=["C6","D6","E6","F#6","G#6"][5-remaining]||"G#6";
      playSynthNotes(n=>[["E5","32n",n],[pitch,"32n",n+0.08]]);
    }else{
      playSynthNotes(notes.tick);
    }
  },[playSynthNotes,getNotes]);
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
  // Stone slide sound for rotate mode
  const playSlide=useCallback(()=>{
    if(!btnNoiseRef.current||!bassRef.current)return;
    const n=Tone.now();
    btnNoiseRef.current.triggerAttackRelease("8n",n);
    bassRef.current.triggerAttackRelease("E1","8n",n,0.3);
    bassRef.current.triggerAttackRelease("G1","16n",n+0.08,0.2);
  },[]);
  // Chess piece move sound — short wooden "clack" like a real chess move
  const playChessMove=useCallback(()=>{
    if(!synthRef.current||!bassRef.current)return;
    const n=Tone.now();
    // Sharp attack, fast decay — percussive tap
    synthRef.current.triggerAttackRelease("G5","32n",n,0.25);
    synthRef.current.triggerAttackRelease("D5","32n",n+0.02,0.15);
    bassRef.current.triggerAttackRelease("G2","16n",n,0.4);
    // Soft noise click
    if(btnNoiseRef.current)btnNoiseRef.current.triggerAttackRelease("64n",n);
  },[]);
  // Chess piece place sound — deeper thud when placing on board
  const playChessPlace=useCallback(()=>{
    if(!synthRef.current||!bassRef.current)return;
    const n=Tone.now();
    synthRef.current.triggerAttackRelease("E4","16n",n,0.3);
    bassRef.current.triggerAttackRelease("C2","8n",n,0.5);
    if(btnNoiseRef.current)btnNoiseRef.current.triggerAttackRelease("32n",n);
  },[]);

  const api=useMemo(()=>({init,reinit,playByLength,playCombo,playWrong,playTick,playCountdown,playGo,playEnding,playChomp,playBtn,playSlide,playChessMove,playChessPlace}),[init,reinit,playByLength,playCombo,playWrong,playTick,playCountdown,playGo,playEnding,playChomp,playBtn,playSlide,playChessMove,playChessPlace]);
  return api;
}

// ============================================
// BACKGROUND MUSIC - Two Dots / Monument Valley ambient
// Soft piano + bell tones + light pad. C-pentatonic, lots of space.
// ============================================
function useMusic(){
  const partsRef=useRef(null);
  const startedRef=useRef(false);

  const start=useCallback(async()=>{
    if(startedRef.current)return;
    await Tone.start();
    startedRef.current=true;

    // Soft synth lead — warm, dreamy, slightly bouncy
    const synth=new Tone.PolySynth(Tone.Synth,{
      oscillator:{type:"fatsine3",spread:12},
      envelope:{attack:0.05,decay:0.6,sustain:0.2,release:1.8},
      volume:-19
    }).toDestination();

    // Bell / sparkle — bright, playful
    const bell=new Tone.Synth({
      oscillator:{type:"triangle"},
      envelope:{attack:0.005,decay:1.5,sustain:0.0,release:2},
      volume:-22
    }).toDestination();

    // Pad — warm, wider, slightly brighter
    const pad=new Tone.PolySynth(Tone.Synth,{
      oscillator:{type:"fatsine2",spread:20},
      envelope:{attack:1.5,decay:2,sustain:0.35,release:3},
      volume:-27
    }).toDestination();

    // Pluck bass — gentle rhythmic pulse
    const bass=new Tone.Synth({
      oscillator:{type:"sine"},
      envelope:{attack:0.02,decay:0.8,sustain:0.0,release:1.2},
      volume:-25
    }).toDestination();

    // C-pentatonic notes — upbeat range
    const synthNotes=["C4","D4","E4","G4","A4","C5","D5","E5","G5","A5"];
    const bellNotes=["E5","G5","A5","C6","D6","E6"];
    const bassNotes=["C2","G2","A2","C3","D3"];
    const padChords=[
      ["C3","E3","G3","C4"],
      ["A2","C3","E3","A3"],
      ["G2","B2","D3","G3"],
      ["D3","G3","A3","D4"],
      ["C3","E3","G3","C4"],
    ];

    // Synth melody: more frequent, playful pattern
    let synthStep=0;
    const synthLoop=new Tone.Loop((time)=>{
      // 60% chance — busier but still breathing
      if(Math.random()<0.6){
        const note=synthNotes[Math.floor(Math.random()*synthNotes.length)];
        synth.triggerAttackRelease(note,"4n",time);
        // 30% chance of a quick follow-up note for bounce
        if(Math.random()<0.3){
          const note2=synthNotes[Math.floor(Math.random()*synthNotes.length)];
          synth.triggerAttackRelease(note2,"8n",time+0.18);
        }
      }
      synthStep++;
    },"4n"); // every quarter note — more movement

    // Bell: playful sparkles, more frequent
    const bellLoop=new Tone.Loop((time)=>{
      if(Math.random()<0.4){
        const note=bellNotes[Math.floor(Math.random()*bellNotes.length)];
        bell.triggerAttackRelease(note,"2n",time);
      }
    },"2n"); // every half note

    // Bass: gentle pulse on beats
    const bassLoop=new Tone.Loop((time)=>{
      if(Math.random()<0.5){
        const note=bassNotes[Math.floor(Math.random()*bassNotes.length)];
        bass.triggerAttackRelease(note,"8n",time);
      }
    },"2n");

    // Pad: chord changes every measure — more harmonic movement
    let padIdx=0;
    const padLoop=new Tone.Loop((time)=>{
      const ch=padChords[padIdx%padChords.length];
      pad.triggerAttackRelease(ch,"1m",time);
      padIdx++;
    },"1m"); // every measure

    Tone.Transport.bpm.value=72; // upbeat but still chill
    padLoop.start(0);
    bassLoop.start(0);
    synthLoop.start("1m"); // synth enters after first pad
    bellLoop.start("1m"); // bells enter with synth
    Tone.Transport.start();

    partsRef.current={synth,bell,pad,bass,synthLoop,bellLoop,bassLoop,padLoop};
  },[]);

  const stop=useCallback(()=>{
    if(!startedRef.current)return;
    startedRef.current=false;
    const p=partsRef.current;
    if(p){
      p.synthLoop.stop();p.bellLoop.stop();p.bassLoop.stop();p.padLoop.stop();
      Tone.Transport.stop();
      setTimeout(()=>{
        try{p.synth.dispose();}catch{}
        try{p.bell.dispose();}catch{}
        try{p.pad.dispose();}catch{}
        try{p.bass.dispose();}catch{}
        try{p.synthLoop.dispose();}catch{}
        try{p.bellLoop.dispose();}catch{}
        try{p.bassLoop.dispose();}catch{}
        try{p.padLoop.dispose();}catch{}
      },500);
      partsRef.current=null;
    }
  },[]);

  return useMemo(()=>({start,stop}),[start,stop]);
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
function WordPopup({text,color,x,y,font}){
  return(<div style={{position:"fixed",left:x,top:y,transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:199,fontFamily:font||"inherit",fontSize:"22px",fontWeight:"700",letterSpacing:"3px",color,textShadow:`0 0 12px ${color}66, 0 2px 4px #00000044`,animation:"wordRise 1.2s ease-out forwards"}}>{text}</div>);
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
    fi:"Moninpelitaistelija",  en:"Multiplayer Fighter", sv:"Flerspelarkämpe",
    fi_d:"Pelaa moninpelissä",en_d:"Play in multiplayer",sv_d:"Spela flerspelare",
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
    fi:"Moninpelivoittaja",    en:"Multiplayer Victor", sv:"Flerspelarvinnare",
    fi_d:"Voita moninpelikierros",en_d:"Win a multiplayer round",sv_d:"Vinn en flerspelarrunda",
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
    fi_d:"Voita 5 moninpelikierrosta",en_d:"Win 5 multiplayer rounds",sv_d:"Vinn 5 flerspelarrundor",
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
    fi_d:"Voita 15 moninpelikierrosta",en_d:"Win 15 multiplayer rounds",sv_d:"Vinn 15 flerspelarrundor",
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
    fi_d:"Voita 50 moninpelikierrosta",en_d:"Win 50 multiplayer rounds",sv_d:"Vinn 50 flerspelarrundor",
    check:(s)=>s.arenaWins>=50},
  long_words_100:{icon:"diamond",color:"#ff0000",tier:6,
    fi:"Professori",           en:"Professor",          sv:"Professor",
    fi_d:"Löydä 100 eri 6+ kirjaimen sanaa",en_d:"Find 100 different 6+ letter words",sv_d:"Hitta 100 olika 6+ bokstavsord",
    check:(s)=>s.longWordsTotal>=100},
};

const INITIAL_STATS={totalWords:0,gamesPlayed:0,bestScore:0,bestCombo:0,longestWord:0,bestWordsPerMin:0,arenaGames:0,arenaWins:0,langsPlayed:[],perfectGames:0,longWordsTotal:0,bestDayGames:0,lastPlayDate:"",dayGames:0};

const SHADE_MAP={outline:0.4,dark:0.55,mid:0.7,light:0.85,highlight:1.0};
function ModernIcon({icon,color="currentColor",size=2,style={}}){
  const s=size*8;
  const icons={
    gear:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    trophy:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,
    person:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    arrow:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7-7 7 7"/></svg>,
    infinity:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg>,
  };
  return <span style={{display:"inline-flex",alignItems:"center",verticalAlign:"middle",flexShrink:0,...style}}>{icons[icon]||null}</span>;
}
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

function TitleDemo({active,lang,onGearClick,showBubble,bubbleFading,hideGear,theme:titleTheme}){
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
    <div style={{display:"flex",justifyContent:"center",alignItems:"flex-start",gap:"6px",paddingTop:"8px"}}>
    <h1 style={{fontSize:"28px",letterSpacing:"4px",margin:"0 0 10px 0",display:"flex",justifyContent:"center",alignItems:"center",gap:"2px"}}>
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
          fontFamily:titleTheme?.titleFont||"'Press Start 2P',monospace",
          lineHeight:1,
        };
        if(isGear&&!hideGear){
          return <span key={i} onClick={onGearClick} style={{...baseStyle,
            textShadow:"none",
            cursor:"pointer",
            display:"inline-flex",alignItems:"center",justifyContent:"center",
            marginRight:"4px",
          }}><PixelIcon icon="gear" color={isLit?dw.color:gearBlend?(titleTheme?.yellow||"#ffcc00"):(titleTheme?.textSoft||"#556677")} size={1.7} style={{transition:"filter 2s ease"}}/></span>;
        }
        return <span key={i} style={baseStyle}>{ch}</span>;
      })}
    </h1>
      {/* Coffee cup illustration - steaming */}
      <svg width="44" height="44" viewBox="0 0 100 100" style={{flexShrink:0,marginTop:"-2px"}}>
        {/* Steam */}
        <path d="M35 30 Q30 20 35 10" fill="none" stroke="#aaaaaa" strokeWidth="2.5" strokeLinecap="round" opacity="0.5">
          <animate attributeName="d" values="M35 30 Q30 20 35 10;M35 30 Q40 18 35 8;M35 30 Q30 20 35 10" dur="2.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0.2;0.5" dur="2.5s" repeatCount="indefinite"/>
        </path>
        <path d="M50 28 Q45 16 50 6" fill="none" stroke="#aaaaaa" strokeWidth="2.5" strokeLinecap="round" opacity="0.6">
          <animate attributeName="d" values="M50 28 Q45 16 50 6;M50 28 Q55 14 50 4;M50 28 Q45 16 50 6" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.6;0.25;0.6" dur="2s" repeatCount="indefinite"/>
        </path>
        <path d="M65 30 Q60 18 65 8" fill="none" stroke="#aaaaaa" strokeWidth="2.5" strokeLinecap="round" opacity="0.4">
          <animate attributeName="d" values="M65 30 Q60 18 65 8;M65 30 Q70 16 65 6;M65 30 Q60 18 65 8" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0.15;0.4" dur="3s" repeatCount="indefinite"/>
        </path>
        {/* Cup body */}
        <path d="M22 38 L22 75 Q22 85 35 85 L65 85 Q78 85 78 75 L78 38 Z" fill="#f5e6d0" stroke="#8b6914" strokeWidth="2.5"/>
        {/* Coffee surface */}
        <ellipse cx="50" cy="42" rx="28" ry="6" fill="#6b3a1f"/>
        <ellipse cx="50" cy="41" rx="24" ry="4" fill="#8b5a2f" opacity="0.6"/>
        {/* Handle */}
        <path d="M78 48 Q94 48 94 60 Q94 72 78 72" fill="none" stroke="#8b6914" strokeWidth="3" strokeLinecap="round"/>
        {/* Cup rim */}
        <ellipse cx="50" cy="38" rx="29" ry="6" fill="none" stroke="#8b6914" strokeWidth="2.5"/>
        {/* Cute face on cup */}
        <circle cx="40" cy="62" r="2.5" fill="#8b6914"/>
        <circle cx="60" cy="62" r="2.5" fill="#8b6914"/>
        <path d="M44 70 Q50 75 56 70" fill="none" stroke="#8b6914" strokeWidth="2" strokeLinecap="round"/>
        {/* Blush */}
        <ellipse cx="34" cy="68" rx="4" ry="2.5" fill="#ffaaaa" opacity="0.5"/>
        <ellipse cx="66" cy="68" rx="4" ry="2.5" fill="#ffaaaa" opacity="0.5"/>
      </svg>
    </div>
    {/* Speech bubble below title pointing up */}
    {showBubble&&!scramble&&(
      <div style={{position:"absolute",bottom:"-52px",left:"50%",transform:"translateX(-50%)",
        animation:bubbleFading?"bubbleOut 0.6s ease-in forwards":`bubbleIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards`,
        whiteSpace:"nowrap",zIndex:50}}>
        <div style={{background:"#ffffff",color:"#000000",fontFamily:"'Press Start 2P',monospace",
          fontSize:"13px",padding:"8px 14px",borderRadius:"0px",position:"relative",lineHeight:"1.6",
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
  const label=gameMode==="tetris"?(lang==="en"?"Drop":lang==="sv"?"Fall":"Pudotus"):lang==="en"?"Normal":lang==="sv"?"Normal":"Normaali";
  const timeLabel=gameTime===120?"2 min":lang==="en"?"6.7 min":"6,7 min";
  const hofTitle=lang==="en"?"RECORDS":lang==="sv"?"REKORD":"ENNÄTYKSET";
  const hofLoading=lang==="en"?"Loading...":lang==="sv"?"Laddar...":"Ladataan...";
  const hofEmpty=lang==="en"?"No results yet":lang==="sv"?"Inga resultat ännu":"Ei tuloksia vielä";
  return(
    <div style={{border:`2px solid ${S.border}`,padding:"8px",background:S.dark,marginTop:"10px",animation:"fadeIn 0.8s ease"}}>
      <div style={{fontSize:"13px",color:S.yellow,marginBottom:"6px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><PixelFlag lang={lang||"fi"} size={2}/>{hofTitle} — {label} {timeLabel}</div>
      {loading?<div style={{fontSize:"13px",color:S.textMuted,textAlign:"center"}}>{hofLoading}</div>:
      !scores||scores.length===0?<div style={{fontSize:"13px",color:S.textMuted,textAlign:"center"}}>{hofEmpty}</div>:
      <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
        {scores.map((s,i)=>{
          const isHighlight=currentScore&&s.score===currentScore&&i<10;
          return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 6px",
            background:i===0?"#ffcc0011":isHighlight?"#44ff8811":"transparent",
            border:i===0?`1px solid ${S.yellow}33`:isHighlight?`1px solid ${S.green}33`:"1px solid transparent"}}>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <span style={{fontSize:"13px",color:i===0?S.yellow:i<3?"#cccccc":S.textMuted,minWidth:"20px"}}>{i+1}.</span>
              <span style={{fontSize:"13px",color:i===0?S.yellow:S.green}}>{s.nickname}</span>
            </div>
            <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
              <span style={{fontSize:"13px",color:S.yellow}}>{s.score}p</span>
              <span style={{fontSize:"13px",color:S.textSoft||"#88ccaa"}}>{s.percentage}%</span>
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
  const SZ=5,HEX_SZ=6,COMBO_WINDOW=4000;
  const[lang,setLang]=useState(()=>localStorage.getItem("piilosana_lang")||"fi");
  const[themeId,setThemeId]=useState(()=>{const saved=localStorage.getItem("piilosana_theme");return saved&&THEMES[saved]?saved:"dark";});
  const[uiSize,setUiSize]=useState(()=>localStorage.getItem("piilosana_size")||"normal");
  const[confettiOn,setConfettiOn]=useState(()=>localStorage.getItem("piilosana_confetti")!=="off");
  const[soundTheme,setSoundTheme]=useState(()=>localStorage.getItem("piilosana_sound")||"modern");
  const[musicOn,setMusicOn]=useState(()=>localStorage.getItem("piilosana_music")!=="off");
  const[audioStarted,setAudioStarted]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showMenuOptions,setShowMenuOptions]=useState(false);
  const[settingsBubble,setSettingsBubble]=useState(false);
  const[bubbleFading,setBubbleFading]=useState(false);
  const[flagBubble,setFlagBubble]=useState(false);
  const[flagBubbleFading,setFlagBubbleFading]=useState(false);
  const[showWordInfo,setShowWordInfo]=useState(false);
  const[showHelp,setShowHelp]=useState(false);
  const[gearBlend,setGearBlend]=useState(false);
  useEffect(()=>{const t=setTimeout(()=>setGearBlend(true),10000);return()=>clearTimeout(t);},[]);
  const[themeTransition,setThemeTransition]=useState(false);
  const themeInitRef=useRef(true);
  useEffect(()=>{if(themeInitRef.current){themeInitRef.current=false;return;}setThemeTransition(true);const t=setTimeout(()=>setThemeTransition(false),700);return()=>clearTimeout(t);},[themeId]);

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
    if(typeof s.music==="boolean"){setMusicOn(s.music);localStorage.setItem("piilosana_music",s.music?"on":"off");}
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
    const s={theme:themeId,lang,size:uiSize,confetti:confettiOn,sound:soundTheme,music:musicOn,...overrides};
    saveSettingsToServer(s);
  },[authUser,themeId,lang,uiSize,confettiOn,soundTheme,musicOn,saveSettingsToServer]);

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
  const music=useMusic();
  // Wrap sounds with mute check
  const sounds=useMemo(()=>{
    if(soundTheme==="off")return{
      init:async()=>{},playByLength:()=>{},playCombo:()=>{},playWrong:()=>{},
      playTick:()=>{},playCountdown:()=>{},playGo:()=>{},playEnding:()=>{},
      playChomp:()=>{},playBtn:()=>{},playSlide:()=>{},playChessMove:()=>{},playChessPlace:()=>{},reinit:async()=>{}
    };
    return rawSounds;
  },[soundTheme,rawSounds]);
  const isLarge=uiSize==="large";

  // Game settings (must be declared before states that reference them)
  const[gameTime,setGameTime]=useState(120); // 120 (2min) or 402 (6min 42s = "6,7")
  const[letterMult,setLetterMult]=useState(false); // scrabble-style letter values
  const[soloMode,setSoloMode]=useState("normal"); // 'normal','tetris','rotate','theme','bomb','mystery','chess','hex'
  const[dropKey,setDropKey]=useState(0); // increments on gravity to trigger drop animation
  const[gameMode,setGameMode]=useState("classic"); // 'classic' or 'battle'

  // Rotate mode state
  const[rotateAnim,setRotateAnim]=useState(null); // {type:'row'|'col', idx, dir}
  const[rotateCount,setRotateCount]=useState(0);
  const[rotateActive,setRotateActive]=useState(false); // toggle: false=word mode, true=rotate mode

  // Theme mode state
  const[activeTheme,setActiveTheme]=useState(null); // {name, words}
  const[themeFound,setThemeFound]=useState([]); // theme words found

  // Bomb mode state
  const[bombCell,setBombCell]=useState(null); // {r,c}
  const[bombTimer,setBombTimer]=useState(0);

  // Mystery mode state
  const[mysteryCell,setMysteryCell]=useState(null); // {r,c}
  const[mysteryRevealed,setMysteryRevealed]=useState(false);

  // Chess mode state
  const[chessPiece,setChessPiece]=useState(null); // 'pawn','rook','bishop','knight','queen'
  const[chessPos,setChessPos]=useState(null); // {r,c} current piece position
  const[chessPath,setChessPath]=useState([]); // [{r,c},...] cells visited
  const[chessWord,setChessWord]=useState(""); // word being built
  const[chessValidCells,setChessValidCells]=useState([]); // valid move targets
  const[chessInvalid,setChessInvalid]=useState(null); // {r,c,t} for invalid move flash
  const[chessMoves,setChessMoves]=useState(0); // total moves this game
  const[chessAnimFrom,setChessAnimFrom]=useState(null); // {r,c} previous position for move animation
  const[chessGrid,setChessGrid]=useState([]); // separate 8×8 grid for chess mode
  const[chessPlacing,setChessPlacing]=useState(true); // true = placing piece phase
  const CHESS_SZ=8;

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
  const[wordPopups,setWordPopups]=useState([]);
  const[combo,setCombo]=useState(0);
  const[lastFoundTime,setLastFoundTime]=useState(0);
  const[flashKey,setFlashKey]=useState(0);
  const[scrambleGrid,setScrambleGrid]=useState(null); // grid of random letters shown during scramble
  const[scrambleStep,setScrambleStep]=useState(0); // how many letters have "settled" into final position
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
  const[emojiFeed,setEmojiFeed]=useState([]); // [{id, nickname, emoji, fading}]
  const emojiFeedIdRef=useRef(0);
  const[emojiOpen,setEmojiOpen]=useState(false); // false | "open" | "closing"
  const[chatHidden,setChatHidden]=useState(false); // hide glass chat overlay
  const closeEmojiPicker=useCallback(()=>{
    setEmojiOpen("closing");
    setTimeout(()=>setEmojiOpen(false),250);
  },[]);
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
    const handler=(e)=>{if(e.target.closest("button")){setAudioStarted(true);sounds.init().then(()=>sounds.playBtn()).catch(()=>{});}};
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

  const addWordPopup=useCallback((word,color,x,y)=>{
    let px=x,py=y;
    if(px===undefined||py===undefined){
      const el=wordBarRef.current||gRef.current;
      if(el){const r=el.getBoundingClientRect();px=r.left+r.width/2;py=r.top;}
      else{px=window.innerWidth/2;py=window.innerHeight/3;}
    }
    const id=++popupIdRef.current;
    setWordPopups(p=>[...p,{id,text:word.toUpperCase(),color,x:px,y:py}]);
    setTimeout(()=>setWordPopups(p=>p.filter(pp=>pp.id!==id)),1300);
  },[]);

  const startSolo=useCallback(async(overrideMode,overrideTime)=>{
    sounds.init().catch(()=>{});
    const gt=overrideTime!==undefined?overrideTime:gameTime;
    const sm=overrideMode!==undefined?overrideMode:soloMode;
    let bg=null,bw=new Set();
    const gridSz=sm==="hex"?HEX_SZ:SZ;
    for(let i=0;i<30;i++){const g=makeGrid(gridSz,lang),w=(sm==="hex"?findWordsHex:findWords)(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=(sm==="hex"?25:15))break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setTime(gt);setScore(0);setMsg(null);
    setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);
    setEnding(null);setEndingProgress(0);setDropKey(0);

    // Mode-specific initialization
    if(sm==="rotate"){setRotateAnim(null);setRotateCount(0);setRotateActive(false);}
    if(sm==="theme"){
      const themes=WORD_THEMES[lang]||WORD_THEMES.fi;
      const theme=themes[Math.floor(Math.random()*themes.length)];
      // Filter to words that exist in trie and are in valid set
      const validThemeWords=theme.words.filter(w=>bw.has(w));
      setActiveTheme({name:theme.name,emoji:theme.emoji,words:validThemeWords.length>0?validThemeWords:theme.words});
      setThemeFound([]);
    }else{setActiveTheme(null);setThemeFound([]);}
    if(sm==="bomb"){
      setBombCell(pickBombCell(SZ));setBombTimer(15);
    }else{setBombCell(null);setBombTimer(0);}
    if(sm==="mystery"){
      setMysteryCell(pickMysteryCell(SZ));setMysteryRevealed(false);
    }else{setMysteryCell(null);setMysteryRevealed(false);}
    if(sm==="chess"){
      const piece=randomChessPiece();
      // Generate 8×8 grid
      const cg=makeGrid(8,lang);
      setChessGrid(cg);
      setChessPiece(piece);setChessPos(null);
      setChessPath([]);setChessWord("");
      setChessValidCells([]);
      setChessInvalid(null);setChessMoves(0);setChessPlacing(true);
    }else{setChessPiece(null);setChessPos(null);setChessPath([]);setChessWord("");setChessValidCells([]);setChessInvalid(null);setChessMoves(0);setChessGrid([]);setChessPlacing(false);}

    setMode("solo");setCountdown(5);setState("countdown");
    if(overrideMode!==undefined)setSoloMode(overrideMode);
    if(overrideTime!==undefined)setGameTime(overrideTime);
    window.scrollTo(0,0);
  },[trie,sounds,gameTime,soloMode,lang]);

  const start=useCallback(async()=>{
    if(mode==="solo"){
      await startSolo();
    }
  },[mode,startSolo]);

  // Countdown timer (shared for solo + multi)
  useEffect(()=>{
    if(state!=="countdown")return;
    if(countdown<=0){
      if(mode==="public"){sounds.playGo();setState("play");return;}
      setState("scramble");setScrambleStep(0);setScrambleGrid(makeGrid(soloMode==="chess"?8:soloMode==="hex"?HEX_SZ:SZ,lang));return;
    }
    sounds.playCountdown(countdown);
    const t=setTimeout(()=>setCountdown(c=>c-1),1000);
    return()=>clearTimeout(t);
  },[state,countdown,sounds]);

  // Scramble animation — letters randomize ~0.8s then snap to final grid
  useEffect(()=>{
    if(state!=="scramble")return;
    let step=0;
    const interval=setInterval(()=>{
      step++;
      if(step<=10){
        // Randomize letters rapidly (10 × 80ms = 800ms)
        setScrambleGrid(makeGrid(soloMode==="chess"?8:soloMode==="hex"?HEX_SZ:SZ,lang));
      }else{
        // Done — snap to real grid and start playing
        clearInterval(interval);
        sounds.playGo();
        setScrambleGrid(null);setScrambleStep(0);
        setState("play");
      }
    },80);
    return()=>clearInterval(interval);
  },[state,lang,sounds]);

  // Timer (solo mode only — multiplayer uses server timer_tick + game_over)
  const startTimeRef=useRef(null);
  const soundsRef=useRef(sounds);
  soundsRef.current=sounds;
  const themeIdRef=useRef(themeId);
  themeIdRef.current=themeId;
  // Re-init synths when sound theme changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(()=>{if(soundTheme!=="off")rawSounds.reinit();},[soundTheme]);
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
        if(remaining<=15&&remaining>0)soundsRef.current.playTick(remaining);
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

  // Ending animation (solo + multi) — now with scramble phase
  useEffect(()=>{
    if(state!=="ending")return;
    let progress=0;
    let scrambleCount=0;
    // Phase 0: scramble letters (progress 0-0.25, ~0.7s)
    // Phase 1: show name/emoji big (progress 0.25-0.45, ~0.6s) - no cells eaten yet
    // Phase 2: cells start disappearing (progress 0.45-1.0, ~1.5s)
    // Phase 3: linger (1.0-1.3) then end (~0.5s)
    const t=setInterval(()=>{
      progress+=0.04;
      setEndingProgress(progress);
      // Phase 0: scramble letters rapidly
      if(progress<=0.25){
        scrambleCount++;
        setScrambleGrid(makeGrid(soloMode==="chess"?8:soloMode==="hex"?HEX_SZ:SZ,lang));
        setScrambleStep(0);
      }else if(progress>0.25&&scrambleCount>0){
        // End scramble phase — clear it
        setScrambleGrid(null);setScrambleStep(0);
        scrambleCount=0;
      }
      // Phase 2: start eating cells
      if(progress>0.45){
        const eatProgress=(progress-0.45)/0.55; // 0 to 1
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
        if(mode==="public")setPublicState("end");
      }
    },80);
    return()=>clearInterval(t);
  },[state,mode]);

  // Background music control
  useEffect(()=>{
    if(musicOn){
      music.start();
    }else{
      music.stop();
    }
    return()=>music.stop();
  },[state,musicOn,music]);

  // Bomb mode timer
  useEffect(()=>{
    if(state!=="play"||soloMode!=="bomb"||!bombCell)return;
    const iv=setInterval(()=>{
      setBombTimer(t=>{
        if(t<=1){
          // BOOM! Scramble area around bomb
          setGrid(g=>{
            const ng=scrambleArea(g,bombCell.r,bombCell.c,1,lang);
            const nv=(soloMode==="hex"?findWordsHex:findWords)(ng,trie);
            setValid(nv);
            return ng;
          });
          addPopup(T[lang]?.bombExploded||"💥","#ff4444");
          setScore(s=>Math.max(0,s-5));
          sounds.playWrong();
          // New bomb
          setBombCell(pickBombCell(SZ));
          return 15;
        }
        if(t<=5)sounds.playTick();
        return t-1;
      });
    },1000);
    return()=>clearInterval(iv);
  },[state,soloMode,bombCell,lang,trie,sounds,addPopup]);

  // Rotate mode: drag on grid cells to rotate row/column when rotateActive
  const rotateDragRef=useRef(null);
  useEffect(()=>{
    if(state!=="play"||soloMode!=="rotate"||!rotateActive)return;
    const gridEl=gRef.current;
    if(!gridEl)return;
    const THRESHOLD=25;
    const onDown=(e)=>{
      e.preventDefault();
      // Find which cell was touched
      const cell=e.target.closest("[data-c]");
      if(!cell)return;
      const[rr,cc]=cell.dataset.c.split(",").map(Number);
      const px=e.touches?e.touches[0].clientX:e.clientX;
      const py=e.touches?e.touches[0].clientY:e.clientY;
      rotateDragRef.current={row:rr,col:cc,startX:px,startY:py,done:false};
    };
    const onMove=(e)=>{
      const d=rotateDragRef.current;
      if(!d||d.done)return;
      e.preventDefault();
      const px=e.touches?e.touches[0].clientX:e.clientX;
      const py=e.touches?e.touches[0].clientY:e.clientY;
      const dx=px-d.startX,dy=py-d.startY;
      // Determine if horizontal (row rotate) or vertical (col rotate)
      if(Math.abs(dx)>THRESHOLD&&Math.abs(dx)>Math.abs(dy)){
        d.done=true;
        const dir=dx>0?1:-1;
        setRotateAnim({type:"row",idx:d.row,dir});
        sounds.playSlide();
        setTimeout(()=>{
          setGrid(g=>{
            const ng=rotateRow(g,d.row,dir);
            const nv=(soloMode==="hex"?findWordsHex:findWords)(ng,trie);setValid(nv);
            return ng;
          });
          setRotateCount(n=>n+1);setRotateAnim(null);
        },300);
      }else if(Math.abs(dy)>THRESHOLD&&Math.abs(dy)>Math.abs(dx)){
        d.done=true;
        const dir=dy>0?1:-1;
        setRotateAnim({type:"col",idx:d.col,dir});
        sounds.playSlide();
        setTimeout(()=>{
          setGrid(g=>{
            const ng=rotateCol(g,d.col,dir);
            const nv=(soloMode==="hex"?findWordsHex:findWords)(ng,trie);setValid(nv);
            return ng;
          });
          setRotateCount(n=>n+1);setRotateAnim(null);
        },300);
      }
    };
    const onUp=()=>{rotateDragRef.current=null;};
    const onCtx=(e)=>{e.preventDefault();}; // block right-click menu
    gridEl.addEventListener("pointerdown",onDown,{passive:false});
    gridEl.addEventListener("pointermove",onMove,{passive:false});
    gridEl.addEventListener("pointerup",onUp);
    gridEl.addEventListener("pointercancel",onUp);
    gridEl.addEventListener("touchstart",onDown,{passive:false});
    gridEl.addEventListener("touchmove",onMove,{passive:false});
    gridEl.addEventListener("touchend",onUp);
    gridEl.addEventListener("contextmenu",onCtx);
    return()=>{
      gridEl.removeEventListener("pointerdown",onDown);
      gridEl.removeEventListener("pointermove",onMove);
      gridEl.removeEventListener("pointerup",onUp);
      gridEl.removeEventListener("pointercancel",onUp);
      gridEl.removeEventListener("touchstart",onDown);
      gridEl.removeEventListener("touchmove",onMove);
      gridEl.removeEventListener("touchend",onUp);
      gridEl.removeEventListener("contextmenu",onCtx);
    };
  },[state,soloMode,rotateActive,trie,sounds]);

  // Chess mode: is cell on bottom row (placing zone)?
  const isBottomRow=useCallback((r)=>{
    return r===CHESS_SZ-1;
  },[]);

  // Chess mode: handle cell click
  const chessClickCell=useCallback((r,c)=>{
    if(state!=="play"||soloMode!=="chess"||!chessPiece)return;
    // Placing phase: must click an edge cell
    if(chessPlacing){
      if(!isBottomRow(r)){
        setChessInvalid({r,c,t:Date.now()});
        sounds.playWrong();
        setTimeout(()=>setChessInvalid(null),400);
        return;
      }
      // Place piece on this edge cell
      setChessPos({r,c});
      setChessPath([{r,c}]);
      setChessWord(chessGrid[r]?.[c]||"");
      setChessValidCells(chessValidMoves(chessPiece,r,c,CHESS_SZ));
      setChessPlacing(false);
      setChessMoves(0);
      setChessAnimFrom(null);
      sounds.playChessPlace();
      return;
    }
    // Clicking current position — ignore (use undo button to go back)
    if(chessPos&&r===chessPos.r&&c===chessPos.c){
      return;
    }
    // Check if this is a valid move
    const isValid=chessValidCells.some(m=>m.r===r&&m.c===c);
    if(!isValid){
      setChessInvalid({r,c,t:Date.now()});
      sounds.playWrong();
      setTimeout(()=>setChessInvalid(null),400);
      return;
    }
    // Already visited? not allowed
    if(chessPath.some(p=>p.r===r&&p.c===c)){
      setChessInvalid({r,c,t:Date.now()});
      sounds.playWrong();
      setTimeout(()=>setChessInvalid(null),400);
      return;
    }
    // Move piece — trigger animation from old position
    const oldPos={...chessPos};
    const newPath=[...chessPath,{r,c}];
    const newWord=chessWord+(chessGrid[r]?.[c]||"");
    setChessAnimFrom(oldPos);
    setChessPos({r,c});
    setChessPath(newPath);
    setChessWord(newWord);
    setChessValidCells(chessValidMoves(chessPiece,r,c,CHESS_SZ));
    setChessMoves(m=>m+1);
    sounds.playChessMove();
    // Clear animation after it completes
    setTimeout(()=>setChessAnimFrom(null),280);
  },[state,soloMode,chessPiece,chessValidCells,chessPath,chessWord,chessGrid,chessPlacing,chessPos,isBottomRow,sounds]);

  // Chess mode: undo last move (or go back to placing if only 1 step)
  const chessUndo=useCallback(()=>{
    if(soloMode!=="chess"||chessPath.length<1)return;
    if(chessPath.length===1){
      // Undo placement — go back to placing phase
      setChessPos(null);
      setChessPath([]);
      setChessWord("");
      setChessValidCells([]);
      setChessPlacing(true);
      setChessAnimFrom(null);
      return;
    }
    const newPath=chessPath.slice(0,-1);
    const lastPos=newPath[newPath.length-1];
    const newWord=newPath.map(p=>chessGrid[p.r]?.[p.c]||"").join("");
    setChessPos(lastPos);
    setChessPath(newPath);
    setChessWord(newWord);
    setChessValidCells(chessValidMoves(chessPiece,lastPos.r,lastPos.c,CHESS_SZ));
    setChessMoves(m=>Math.max(0,m-1));
    setChessAnimFrom(null);
  },[soloMode,chessPath,chessGrid,chessPiece]);

  // Chess mode: submit current word
  const chessSubmitWord=useCallback(()=>{
    if(soloMode!=="chess"||chessWord.length<3)return;
    const isValidWord=WORDS_SET.has(chessWord);
    const alreadyFound=found.includes(chessWord);
    if(isValidWord&&!alreadyFound){
      const mult=CHESS_MULT[chessPiece]||1;
      let p=letterMult?ptsLetters(chessWord,lang):pts(chessWord.length);
      p=Math.round(p*mult);
      setScore(s=>s+p);setFound(f=>[...f,chessWord]);
      setMsg({t:chessWord,ok:true,p});
      setFlashKey(k=>k+1);
      sounds.playByLength(chessWord.length);
      addPopup(`${chessWord.toUpperCase()} +${p} ${CHESS_EMOJI[chessPiece]}`,wordColor());
    }else if(alreadyFound){
      setMsg({t:chessWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }else{
      setMsg({t:chessWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }
    // Reset: new piece, go to placing phase
    const piece=randomChessPiece();
    setChessPiece(piece);setChessPos(null);
    setChessPath([]);setChessWord("");
    setChessValidCells([]);setChessPlacing(true);
  },[soloMode,chessWord,chessPiece,found,sounds,addPopup,letterMult,lang]);

  // Chess mode: reset current path (skip this piece)
  const chessReset=useCallback(()=>{
    if(soloMode!=="chess")return;
    const piece=randomChessPiece();
    setChessPiece(piece);setChessPos(null);
    setChessPath([]);setChessWord("");
    setChessValidCells([]);setChessPlacing(true);
  },[soloMode]);

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
    const isPerfect=mode==="solo"&&gameTime!==0&&soloMode==="normal"&&valid.size>0&&wordsFound>=valid.size;
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

  const adj=(a,b)=>soloMode==="hex"?adjHex(a,b):(Math.abs(a.r-b.r)<=1&&Math.abs(a.c-b.c)<=1&&!(a.r===b.r&&a.c===b.c));
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
        const color=wordColor();
        let text=`+${totalPts}`;
        if(newCombo>=3)text+=` x${comboMult}`;
        addPopup(`${currentWord.toUpperCase()} ${text}`,color,popX,popY);
      }
      // Tetris mode: remove used cells, apply gravity, recompute valid words
      if(soloMode==="tetris"){
        const cells=currentSel.map(s=>({r:s.r,c:s.c}));
        const newGrid=applyGravityClient(grid,cells,lang);
        setGrid(newGrid);
        setDropKey(k=>k+1);
        const newValid=(soloMode==="hex"?findWordsHex:findWords)(newGrid,trie);
        setValid(newValid);
      }
      // Theme mode: check if word is a theme word
      if(soloMode==="theme"&&activeTheme){
        if(activeTheme.words.includes(currentWord)&&!themeFound.includes(currentWord)){
          const bonus=5;
          setScore(s=>s+bonus);
          setThemeFound(f=>[...f,currentWord]);
          addPopup(`${t.themeBonus} +${bonus}`,`#44bb66`);
        }
      }
      // Bomb mode: check if word uses bomb cell
      if(soloMode==="bomb"&&bombCell){
        const usesBomb=currentSel.some(s=>s.r===bombCell.r&&s.c===bombCell.c);
        if(usesBomb){
          // Defused! Pick new bomb
          const bonus=3;
          setScore(s=>s+bonus);
          addPopup(`💣 +${bonus}`,"#ff4444");
          setBombCell(pickBombCell(SZ));setBombTimer(15);
        }
      }
      // Mystery mode: check if word passes through mystery cell
      if(soloMode==="mystery"&&mysteryCell&&!mysteryRevealed){
        const usesMystery=currentSel.some(s=>s.r===mysteryCell.r&&s.c===mysteryCell.c);
        if(usesMystery){
          setMysteryRevealed(true);
          const bonus=3;
          setScore(s=>s+bonus);
          addPopup(`${t.mysteryRevealed} +${bonus}`,"#aa66ff");
          // After a delay, pick new mystery cell
          setTimeout(()=>{setMysteryCell(pickMysteryCell(SZ));setMysteryRevealed(false);},2000);
        }
      }
    }else if(found.includes(currentWord)){
      setMsg({t:currentWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }else{
      setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }
  },[valid,found,lastFoundTime,combo,sounds,addPopup,mode,socket,gameMode,soloMode,grid,trie,letterMult,activeTheme,themeFound,bombCell,mysteryCell,mysteryRevealed,lang]);

  // Active grid: use currentMultiGrid in multi mode, grid in solo
  const activeGrid=mode==="multi"?currentMultiGrid:grid;

  // Drag handlers
  const onDragStart=useCallback((r,c)=>{if(state!=="play"||rotateActive)return;if(soloMode==="chess"){chessClickCell(r,c);return;}setDragging(true);const s=[{r,c}];setSel(s);selRef.current=s;setWord(activeGrid[r]?.[c]||"");setMsg(null);
    // Battle mode: broadcast selection start
    if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:[{r,c}]});
  },[state,activeGrid,mode,gameMode,socket,soloMode,chessClickCell]);
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
      setPopups([]);setWordPopups([]);
      setMultiScores([]);
      setEatenCells(new Set());
      setEnding(null);
      setEndingProgress(0);
      setGameMode(gm||"classic");
      setOtherSelections({});
      setBattleMsg(null);
      setEmojiFeed([]);
      setLobbyState("playing");
      setCountdown(5);setState("countdown");
    });
    
    newSocket.on("timer_tick",({remaining})=>{
      setTime(remaining);
      if(remaining<=15&&remaining>0)sounds.playTick(remaining);
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
            const tid=themeIdRef.current;
            const color=(THEMES[tid]||THEMES.dark).green;
            let text=`+${points}`;
            if(c>=3)text+=` x${Math.floor(points/(pts(w.length)))}`;
            addPopup(`${w.toUpperCase()} ${text}`,color,popX,popY);
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
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);setEnding(null);setDropKey(0);
      setPublicState("countdown");setPublicCountdown(5);setPublicRound(roundNumber);
      setPublicRankings(null);setState("countdown");setCountdown(5);
    });
    newSocket.on("public_join_midgame",({grid:g,validWords:vw,timeLeft:tl,roundNumber})=>{
      setGrid(g);setValid(new Set(vw));setFound([]);setSel([]);setWord("");setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);setEnding(null);setDropKey(0);
      setTime(tl);setPublicState("playing");setPublicRound(roundNumber);setPublicRankings(null);setState("play");
      startTimeRef.current=Date.now();
    });
    newSocket.on("public_game_start",()=>{
      setPublicState("playing");setState("play");startTimeRef.current=Date.now();
    });
    newSocket.on("public_timer_tick",({remaining})=>{
      setTime(remaining);
      if(remaining<=15&&remaining>0)soundsRef.current.playTick(remaining);
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
        const color=(THEMES[themeIdRef.current]||THEMES.dark).green;
        addPopup(`${w.toUpperCase()} +${p}`,color);
        soundsRef.current.playByLength(w.length);
      }else{
        setMsg({t:lastSubmittedWordRef.current,ok:false,m:message});
        setShake(true);setTimeout(()=>setShake(false),400);
        soundsRef.current.playWrong();
      }
    });
    newSocket.on("public_game_over",({rankings,validWords:vw,allFoundWords:afw})=>{
      setPublicRankings(rankings);
      setValid(new Set(vw));
      setPublicAllFound(afw||[]);
      const e=ENDINGS[Math.floor(Math.random()*ENDINGS.length)];
      setEnding(e);soundsRef.current.playEnding();
      setState("ending");
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
    newSocket.on("emoji_feed",({nickname,emoji})=>{
      const id=++emojiFeedIdRef.current;
      setEmojiFeed(prev=>[...prev.slice(-7),{id,nickname,emoji,fading:false}]);
      setTimeout(()=>setEmojiFeed(prev=>prev.map(e=>e.id===id?{...e,fading:true}:e)),5200);
      setTimeout(()=>setEmojiFeed(prev=>prev.filter(e=>e.id!==id)),6000);
    });

    setSocket(newSocket);
    
    return()=>{
      if(newSocket)newSocket.disconnect();
    };
  },[mode]);
  const missed=useMemo(()=>state==="end"?[...valid].filter(w=>!found.includes(w)).sort((a,b)=>b.length-a.length):[],[state,valid,found]);
  const totalPossible=useMemo(()=>[...valid].reduce((s,w)=>s+(letterMult?ptsLetters(w,lang):pts(w.length)),0),[valid,letterMult,lang]);
  const wordColor=()=>S.green;


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
    const gsz=soloMode==="hex"?HEX_SZ:SZ;
    for(let i=0;i<30;i++){const g=makeGrid(gsz,lang),w=(soloMode==="hex"?findWordsHex:findWords)(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=(soloMode==="hex"?25:15))break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setMsg(null);
    setDropKey(0);
  },[state,gameTime,trie,lang,soloMode]);

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
    for(let i=0;i<30;i++){const g=makeGrid(SZ,lang),w=(soloMode==="hex"?findWordsHex:findWords)(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
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
    sounds.init().catch(()=>{});
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
  const Icon=S.cellGradient?ModernIcon:PixelIcon;
  const modeSelectJSX=(
    <div style={{textAlign:"center",marginTop:"20px",animation:"fadeIn 0.5s ease",maxWidth:"600px",width:"100%"}}>
      {/* Welcome text + ARENA CTA */}
      <div style={{fontSize:"14px",color:S.textSoft,marginBottom:"10px",letterSpacing:"1px"}}>{t.arenaWelcome}</div>
      <button onClick={()=>{sounds.init().catch(()=>{});setMode("public");if(authUser){setPublicState("waiting");}else{setPublicState("nickname");}}} style={{fontFamily:S.font,fontSize:"32px",color:"#fff",background:"linear-gradient(135deg,#ff6644 0%,#ff4422 100%)",border:"none",padding:"28px 32px 24px",cursor:"pointer",boxShadow:S.btnShadow!=="none"?`0 6px 24px #ff664466,${S.btnShadow}`:"4px 4px 0 #cc3311,0 0 20px #ff664433",borderRadius:S.btnRadius,width:"100%",minHeight:"90px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"6px",marginBottom:"6px",animation:"arenaPulse 3s ease-in-out infinite",position:"relative",overflow:"hidden"}}
        onMouseEnter={e=>{e.currentTarget.style.transform=S.btnShadow!=="none"?"translateY(-3px) scale(1.01)":"translate(-2px,-2px)";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?"0 8px 32px #ff664488":"6px 6px 0 #cc3311,0 0 30px #ff664455"}}
        onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?`0 6px 24px #ff664466,${S.btnShadow}`:"4px 4px 0 #cc3311,0 0 20px #ff664433"}}>
        <span style={{fontSize:"13px",letterSpacing:"3px",opacity:0.9}}>{t.arenaDesc}</span>
        <span>{t.arenaCta}</span>
      </button>
      <div style={{fontSize:"16px",color:S.textSoft,marginBottom:"10px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
        <Icon icon="person" color={S.green} size={2}/><span style={{color:S.green,fontWeight:"700"}}>{publicOnlineCount}</span> {publicOnlineCount===1?t.playerInArena:t.playersInArena}
      </div>

      {/* Two smaller buttons side by side */}
      <div style={{display:"flex",gap:"8px"}}>
        <button onClick={()=>setShowMenuOptions(true)} style={{fontFamily:S.font,fontSize:"14px",color:S.bg,background:S.green,border:"none",padding:"18px 16px",cursor:"pointer",boxShadow:S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #008844",borderRadius:S.btnRadius,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"4px"}}
          onMouseEnter={e=>{e.currentTarget.style.transform=S.btnShadow!=="none"?"translateY(-2px)":"translate(-2px,-2px)";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?"0 6px 20px #00000044":"5px 5px 0 #008844"}}
          onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #008844"}}>
          <span>{t.practice}</span>
          <span style={{fontSize:"13px",opacity:0.7}}>{t.practiceDesc}</span>
        </button>
        <button onClick={()=>{sounds.init().catch(()=>{});setMode("multi");if(authUser){setNickname(authUser.nickname);setLobbyState("choose");}else{setLobbyState("enter_name");setTimeout(()=>{if(nicknameRef.current)nicknameRef.current.focus();},50);}}} style={{fontFamily:S.font,fontSize:"14px",color:S.bg,background:S.yellow,border:"none",padding:"18px 16px",cursor:"pointer",boxShadow:S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #cc8800",borderRadius:S.btnRadius,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"4px"}}
          onMouseEnter={e=>{e.currentTarget.style.transform=S.btnShadow!=="none"?"translateY(-2px)":"translate(-2px,-2px)";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?"0 6px 20px #00000044":"5px 5px 0 #cc8800"}}
          onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #cc8800"}}>
          <span>{t.customGame}</span>
          <span style={{fontSize:"13px",opacity:0.7}}>{t.customDesc}</span>
        </button>
      </div>

      {/* Solo options — fullscreen overlay so start button is always visible */}
      {showMenuOptions&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:150,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",animation:"fadeIn 0.2s ease"}} onClick={()=>setShowMenuOptions(false)}>
          <div style={{background:S.dark,border:`2px solid ${S.green}`,borderRadius:S.panelRadius,width:"100%",maxWidth:"440px",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:S.panelShadow}} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px 10px",borderBottom:`1px solid ${S.green}33`,flexShrink:0}}>
              <div style={{fontSize:"14px",color:S.green,fontFamily:S.font,fontWeight:"700"}}>{t.practice}</div>
              <button onClick={()=>setShowMenuOptions(false)} style={{fontFamily:S.font,fontSize:"16px",color:S.textMuted,background:"transparent",border:"none",cursor:"pointer",padding:"2px 6px"}}>✕</button>
            </div>
            {/* Scrollable content */}
            <div style={{padding:"12px 16px",overflowY:"auto",flex:1}}>
              <div style={{marginBottom:"12px"}}>
                <div style={{fontSize:"13px",color:S.green,marginBottom:"6px"}}>{t.gameMode}</div>
                <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>setSoloMode("normal")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="normal"?S.bg:S.green,background:soloMode==="normal"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>{t.modeNormal}</button>
                  <button onClick={()=>setSoloMode("tetris")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="tetris"?S.bg:S.purple,background:soloMode==="tetris"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:"5px",borderRadius:S.btnRadius}}><Icon icon="arrow" color={soloMode==="tetris"?S.bg:S.purple} size={1.5}/>{t.modeTetris}</button>
                  <button onClick={()=>setSoloMode("rotate")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="rotate"?S.bg:"#ff9900",background:soloMode==="rotate"?"#ff9900":"transparent",border:"2px solid #ff9900",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>🔄 {t.modeRotate}</button>
                  <button onClick={()=>setSoloMode("theme")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="theme"?S.bg:"#44bb66",background:soloMode==="theme"?"#44bb66":"transparent",border:"2px solid #44bb66",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>📚 {t.modeTheme}</button>
                  <button onClick={()=>setSoloMode("bomb")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="bomb"?S.bg:"#ff4444",background:soloMode==="bomb"?"#ff4444":"transparent",border:"2px solid #ff4444",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>💣 {t.modeBomb}</button>
                  <button onClick={()=>setSoloMode("mystery")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="mystery"?S.bg:"#aa66ff",background:soloMode==="mystery"?"#aa66ff":"transparent",border:"2px solid #aa66ff",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>❓ {t.modeMystery}</button>
                  <button onClick={()=>setSoloMode("chess")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="chess"?S.bg:"#ddaa33",background:soloMode==="chess"?"#ddaa33":"transparent",border:"2px solid #ddaa33",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>♞ {t.modeChess}</button>
                  <button onClick={()=>setSoloMode("hex")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="hex"?S.bg:"#22ccaa",background:soloMode==="hex"?"#22ccaa":"transparent",border:"2px solid #22ccaa",padding:"6px 14px",cursor:"pointer",borderRadius:S.btnRadius}}>⬡ {t.modeHex}</button>
                </div>
                {soloMode==="rotate"&&<p style={{fontSize:"13px",color:"#ff9900",marginTop:"8px",lineHeight:"1.8"}}>{t.rotateDesc}</p>}
                {soloMode==="theme"&&<p style={{fontSize:"13px",color:"#44bb66",marginTop:"8px",lineHeight:"1.8"}}>{t.themeDesc}</p>}
                {soloMode==="bomb"&&<p style={{fontSize:"13px",color:"#ff4444",marginTop:"8px",lineHeight:"1.8"}}>{t.bombDesc}</p>}
                {soloMode==="mystery"&&<p style={{fontSize:"13px",color:"#aa66ff",marginTop:"8px",lineHeight:"1.8"}}>{t.mysteryDesc}</p>}
                {soloMode==="chess"&&<p style={{fontSize:"13px",color:"#ddaa33",marginTop:"8px",lineHeight:"1.8"}}>{t.chessDesc}</p>}
                {soloMode==="hex"&&<p style={{fontSize:"13px",color:"#22ccaa",marginTop:"8px",lineHeight:"1.8"}}>{t.hexDesc}</p>}
              </div>
              <div style={{marginBottom:"12px"}}>
                <div style={{fontSize:"13px",color:S.green,marginBottom:"6px"}}>{t.time}</div>
                <div style={{display:"flex",gap:"6px",justifyContent:"center"}}>
                  <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer"}}>2 MIN</button>
                  <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 14px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
                  <button onClick={()=>setGameTime(0)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===0?S.bg:"#44ddff",background:gameTime===0?"#44ddff":"transparent",border:"2px solid #44ddff",padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:"4px"}}><Icon icon="infinity" color={gameTime===0?S.bg:"#44ddff"} size={1.5}/>{t.unlimited}</button>
                </div>
              </div>
              <div>
                <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"13px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 14px",cursor:"pointer"}}>
                  {letterMult?"✓ ":""}{t.letterMultBtn}
                </button>
              </div>
            </div>
            {/* Fixed start button at bottom */}
            <div style={{padding:"12px 16px 16px",borderTop:`1px solid ${S.green}33`,flexShrink:0}}>
              <button onClick={()=>{startSolo();setShowMenuOptions(false);}} style={{fontFamily:S.font,fontSize:"16px",color:S.bg,background:S.green,border:"none",padding:"14px 32px",cursor:"pointer",boxShadow:S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #008844",borderRadius:S.btnRadius,width:"100%",letterSpacing:"2px"}}
                onMouseEnter={e=>{e.currentTarget.style.transform=S.btnShadow!=="none"?"translateY(-2px)":"translate(-2px,-2px)";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?"0 6px 20px #00000044":"5px 5px 0 #008844"}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=S.btnShadow!=="none"?S.btnShadow:"3px 3px 0 #008844"}}>▶ {t.startGame||"ALOITA"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Footer with buttons + info */}
      <div style={{marginTop:"24px",width:"100%",maxWidth:"600px"}}>
        {/* Flag language bubble — positioned above flag buttons */}
        {mode===null&&flagBubble&&(
          <div style={{width:"100%",display:"flex",justifyContent:"center",
            animation:flagBubbleFading?"flagBubbleOut 0.6s ease-in forwards":"flagBubbleIn 0.7s cubic-bezier(0.34,1.56,0.64,1) forwards",
            zIndex:50,marginBottom:"6px"}}>
            <div style={{fontFamily:S.font,
              fontSize:S.cellGradient?"13px":"13px",padding:"8px 12px",borderRadius:S.btnRadius||"0px",position:"relative",lineHeight:"1.6",
              border:S.cellGradient?`2px solid ${S.border}`:"3px solid #000000",boxShadow:S.cellGradient?S.panelShadow:"4px 4px 0 #00000044",
              width:"max-content",maxWidth:"90%",
              background:S.cellGradient?S.dark:"#ffffff",color:S.cellGradient?S.green:"#000000"}}>
              <div style={{position:"absolute",bottom:"-9px",left:"50%",transform:"translateX(-50%)",
                width:0,height:0,borderLeft:"8px solid transparent",borderRight:"8px solid transparent",borderTop:S.cellGradient?`8px solid ${S.border}`:"8px solid #000000"}}/>
              <div style={{position:"absolute",bottom:"-5px",left:"50%",transform:"translateX(-50%)",
                width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:S.cellGradient?`6px solid ${S.dark}`:"6px solid #ffffff"}}/>
              {lang==="en"?"Play in different languages!":lang==="sv"?"Spela på olika språk!":"Pelaa eri kielillä!"}
            </div>
          </div>
        )}
        {/* Action buttons row */}
        <div style={{display:"flex",gap:"6px",justifyContent:"center",flexWrap:"wrap",marginBottom:"12px"}}>
          {Object.entries(LANG_CONFIG).map(([code,lc])=>(
            <button key={code} onClick={()=>{setLang(code);localStorage.setItem("piilosana_lang",code);setFlagBubble(false);sessionStorage.setItem("piilosana_flag_bubble_shown","1");syncSettings({lang:code});}}
              style={{fontFamily:S.font,fontSize:"13px",background:lang===code?S.dark:"transparent",
                border:lang===code?`2px solid ${S.green}`:`2px solid ${S.border}`,
                padding:"6px 10px",cursor:"pointer",color:lang===code?S.green:S.textMuted,
                boxShadow:lang===code?`0 0 8px ${S.green}44`:"none",
                transition:"all 0.2s",display:"flex",alignItems:"center",gap:"5px",minHeight:"36px",borderRadius:S.btnRadius}}>
              <PixelFlag lang={code} size={2}/>
            </button>
          ))}
          <button onClick={()=>{setShowSettings(v=>!v);setSettingsBubble(false);}} style={{fontFamily:S.font,fontSize:"13px",color:S.textSoft,
            background:"transparent",border:`2px solid ${S.border}`,padding:"6px 10px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s",minHeight:"36px",borderRadius:S.btnRadius}}>
            <Icon icon="gear" color={S.textSoft} size={2}/>
          </button>
          <button onClick={()=>setShowAchievements(true)} style={{fontFamily:S.font,fontSize:"13px",color:S.yellow,
            background:"transparent",border:`2px solid ${S.border}`,padding:"6px 10px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s",position:"relative",minHeight:"36px",borderRadius:S.btnRadius}}>
            <Icon icon="trophy" color={S.yellow} size={2} badge={true}/>
            {Object.keys(achUnlocked).length>0&&<span style={{fontSize:"13px"}}>{Object.keys(achUnlocked).length}/{Object.keys(ACHIEVEMENTS).length}</span>}
          </button>
          <button onClick={()=>{setShowAuth(true);setShowFirstTimeAuth(false);}} style={{fontFamily:S.font,fontSize:"13px",color:authUser?S.green:S.yellow,
            background:authUser?S.dark:"transparent",border:`2px solid ${authUser?S.green:S.border}`,padding:"6px 10px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:"5px",transition:"all 0.2s",
            boxShadow:authUser?`0 0 8px ${S.green}44`:"none",minHeight:"36px",borderRadius:S.btnRadius}}>
            <Icon icon="person" color={authUser?S.green:S.yellow} size={2}/>
            {authUser&&authUser.nickname}
          </button>
        </div>
        {/* Info links */}
        <div style={{fontSize:"14px",color:S.textMuted,marginBottom:"4px"}}>{WORDS_SET.size.toLocaleString("fi-FI")} {t.words}</div>
        <div style={{display:"flex",gap:"12px",justifyContent:"center"}}>
          <button onClick={()=>setShowHelp(true)} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:"transparent",border:"none",padding:"2px 6px",cursor:"pointer",textDecoration:"underline",opacity:0.7}}>{t.howToPlay}</button>
          <button onClick={()=>setShowWordInfo(true)} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:"transparent",border:"none",padding:"2px 6px",cursor:"pointer",textDecoration:"underline",opacity:0.7}}>{t.readMoreWords}</button>
        </div>
        <div style={{fontSize:"13px",color:S.textMuted,marginTop:"4px"}}>v{VERSION} · © Matti Kuokkanen 2026</div>
        <div style={{fontSize:"13px",marginTop:"4px",display:"flex",gap:"10px",justifyContent:"center"}}>
          <a href="mailto:info@piilosana.com" style={{color:S.textMuted,textDecoration:"none"}}>{lang==="en"?"Feedback":lang==="sv"?"Feedback":"Palaute"}</a>
          <a href="/privacy" style={{color:S.textMuted,textDecoration:"none"}}>{lang==="en"?"Privacy":lang==="sv"?"Integritet":"Tietosuoja"}</a>
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
        <p style={{fontSize:"13px",color:S.green,marginBottom:"12px"}}>{t.results}</p>
        {multiRankings&&multiRankings.slice(0,5).map((p,i)=>{
          const medals=["🥇","🥈","🥉"];
          const isMe=p.playerId===playerId;
          return(
            <div key={i} style={{fontSize:"13px",color:isMe?S.yellow:S.green,padding:"6px 10px",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:isMe?"#ffcc0011":"transparent",animation:isMe?"pop 0.4s ease":"none"}}>
              <span>{medals[i]||`${i+1}.`} {p.nickname}</span>
              <span>{p.score}p ({p.wordsFound} {t.words})</span>
            </div>
          );
        })}
        {gameMode==="classic"&&multiValidWords.length>0&&(
          <div style={{fontSize:"13px",color:S.textSoft||"#88ccaa",marginTop:"8px"}}>{(() => {const allF=new Set();Object.values(multiAllFoundWords).forEach(ws=>ws.forEach(w=>allF.add(w)));return `${allF.size} / ${multiValidWords.length} ${t.words} (${Math.round(allF.size/multiValidWords.length*100)}%)`;})()}</div>
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
              <div style={{fontSize:"14px",color:S.purple,marginBottom:"6px",display:"flex",alignItems:"center",gap:"6px"}}><Icon icon="swords" color={S.purple} size={2}/>LÖYDETYT ({foundWords.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {foundWords.map((w,i)=>{
                  const finders=Object.entries(multiAllFoundWords).filter(([,ws])=>ws.includes(w)).map(([pid])=>nickMap[pid]||"?");
                  return(
                    <span key={i} style={{fontSize:"14px",background:S.dark,padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}} title={finders.join(", ")}>{w.toUpperCase()}</span>
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
                      <span key={i} style={{fontSize:"14px",background:S.dark,padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}} title={finders.join(", ")}>{w.toUpperCase()}</span>
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
                    <span key={i} style={{fontSize:"14px",background:S.dark,padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                  ))}
                </div>
              </div>
            )}
          </>);
        })()}
        <div style={{marginTop:"16px",display:"flex",flexDirection:"column",gap:"8px",alignItems:"center"}}>
          {isHost&&<button onClick={playAgain} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>{t.newCustom}</button>}
          <button onClick={switchToSolo} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>{t.practice}</button>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>{t.menu}</button>
        </div>
      </div>
    </div>
  );


  return(
    <div style={{fontFamily:S.font,background:S.bg,color:S.green,minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",userSelect:"none",WebkitUserSelect:"none",padding:"8px 4px",position:"relative",overflowX:"hidden",animation:themeTransition?"themeResolve 0.6s ease-out":"none"}}
      onMouseMove={e=>onDragMove(e.clientX,e.clientY)} onMouseUp={onDragEnd} onTouchEnd={onDragEnd}>
      {/* Top bar removed — buttons moved to footer */}
      {/* Word info modal */}
      {showWordInfo&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={()=>setShowWordInfo(false)}>
          <div style={{background:S.bg,border:`3px solid ${S.green}`,padding:"20px",maxWidth:"500px",width:"100%",maxHeight:"80vh",overflowY:"auto",fontFamily:S.font,position:"relative",borderRadius:S.panelRadius,boxShadow:S.panelShadow}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowWordInfo(false)} style={{position:"absolute",top:"8px",right:"8px",fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,width:"32px",height:"32px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:S.btnRadius}}>✕</button>
            <div style={{fontSize:"14px",color:S.green,marginBottom:"16px"}}>{t.wordInfoTitle}</div>
            <div style={{fontSize:"13px",color:S.green,lineHeight:"1.8",marginBottom:"12px"}}>{t.wordInfoBody1}</div>
            <div style={{fontSize:"13px",color:S.green,lineHeight:"1.8",marginBottom:"12px"}}>{t.wordInfoBody2}</div>
            <div style={{fontSize:"13px",color:S.green,lineHeight:"1.8",marginBottom:"16px"}}>{t.wordInfoBody3}</div>
            <div style={{fontSize:"13px",color:S.green,marginBottom:"8px",borderTop:`1px solid ${S.border}`,paddingTop:"12px"}}>
              <div style={{marginBottom:"8px",color:S.yellow}}>{t.wordInfoSources}:</div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇫🇮</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceFi}</span>
                  <span style={{color:S.textMuted,marginLeft:"8px"}}>{LANG_CONFIG.fi.words.size.toLocaleString()}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇬🇧</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceEn}</span>
                  <span style={{color:S.textMuted,marginLeft:"8px"}}>{LANG_CONFIG.en.words.size.toLocaleString()}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                  <span>🇸🇪</span>
                  <span style={{flex:1,marginLeft:"8px"}}>{t.wordInfoSourceSv}</span>
                  <span style={{color:S.textMuted,marginLeft:"8px"}}>{LANG_CONFIG.sv.words.size.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Help / How to play modal */}
      {showHelp&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}} onClick={()=>setShowHelp(false)}>
          <div style={{background:S.bg,border:`3px solid ${S.green}`,padding:"20px",maxWidth:"440px",width:"100%",maxHeight:"80vh",overflowY:"auto",fontFamily:S.font,position:"relative",borderRadius:S.panelRadius,boxShadow:S.panelShadow}} onClick={e=>e.stopPropagation()}>
            <button onClick={()=>setShowHelp(false)} style={{position:"absolute",top:"8px",right:"8px",fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,width:"32px",height:"32px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:S.btnRadius}}>✕</button>
            <div style={{fontSize:"14px",color:S.green,marginBottom:"16px"}}>{t.howToPlay?.toUpperCase()}</div>
            <div style={{display:"flex",flexDirection:"column",gap:"14px",fontSize:"13px",color:S.green,lineHeight:"1.8"}}>
              <div><span style={{color:S.yellow}}>☝</span> {t.helpDrag}</div>
              <div><span style={{color:S.yellow}}>⏱</span> {t.helpTime}</div>
              <div><span style={{color:S.yellow}}>⭐</span> {t.helpScoring}</div>
              <div><span style={{color:S.yellow}}>🔥</span> {t.helpCombo}</div>
              <div><span style={{color:S.yellow}}>✦</span> {t.helpMultiplier}</div>
              <div><span style={{color:S.yellow}}>🌐</span> {t.helpLang}</div>
            </div>
          </div>
        </div>
      )}
      <style>{fontCSS}</style>
      <style>{`
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
        @keyframes pop{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}
        @keyframes chessArrive{0%{transform:translate(var(--chess-dx),var(--chess-dy)) scale(1.2);opacity:0.6}60%{transform:translate(0,0) scale(1.1);opacity:1}100%{transform:translate(0,0) scale(1);opacity:1}}
        @keyframes snowfall{0%{transform:translateY(0);opacity:0.6}100%{transform:translateY(30px);opacity:0}}
        @keyframes fadeIn{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes bubbleIn{0%{opacity:0;transform:scale(0.3) translateY(10px)}40%{opacity:1;transform:scale(1.08) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes bubbleOut{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.6) translateY(-10px)}}
        @keyframes chatSlideIn{0%{opacity:0;transform:translateX(-30px) scale(0.7)}30%{opacity:1;transform:translateX(4px) scale(1.04)}60%{transform:translateX(-2px) scale(0.98)}100%{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes chatFadeOut{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.92);max-height:0;margin:0;padding:0}}
        @keyframes pulse{0%,100%{text-shadow:0 0 5px #ff444444}50%{text-shadow:0 0 20px #ff444488}}
        @keyframes arenaPulse{0%,100%{box-shadow:4px 4px 0 #cc3311,0 0 20px #ff664433}50%{box-shadow:4px 4px 0 #cc3311,0 0 35px #ff664466}}
        @keyframes floatUp{0%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}50%{opacity:1;transform:translate(-50%,-100%) scale(1.5)}100%{opacity:0;transform:translate(-50%,-180%) scale(1.8)}}
        @keyframes wordRise{0%{opacity:0.9;transform:translate(-50%,-50%) scale(0.8)}20%{opacity:1;transform:translate(-50%,-80%) scale(1.1)}60%{opacity:0.8;transform:translate(-50%,-140%) scale(1)}100%{opacity:0;transform:translate(-50%,-200%) scale(0.9)}}
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
        @keyframes cellShutterClose{0%{opacity:1;transform:scaleX(1)}30%{opacity:1;transform:scaleX(1.05)}60%{opacity:0.8;transform:scaleX(0.3)}100%{opacity:0;transform:scaleX(0);background:#3a2208}}
        @keyframes cellDrop{0%{transform:translateY(-100%);opacity:0.5}60%{transform:translateY(5%);opacity:1}80%{transform:translateY(-2%)}100%{transform:translateY(0)}}
        @keyframes rotateRowRight{0%{transform:perspective(400px) rotateY(0deg)}40%{transform:perspective(400px) rotateY(45deg);opacity:0.6}60%{transform:perspective(400px) rotateY(-10deg);opacity:0.9}100%{transform:perspective(400px) rotateY(0deg);opacity:1}}
        @keyframes rotateRowLeft{0%{transform:perspective(400px) rotateY(0deg)}40%{transform:perspective(400px) rotateY(-45deg);opacity:0.6}60%{transform:perspective(400px) rotateY(10deg);opacity:0.9}100%{transform:perspective(400px) rotateY(0deg);opacity:1}}
        @keyframes rotateColDown{0%{transform:perspective(400px) rotateX(0deg)}40%{transform:perspective(400px) rotateX(-45deg);opacity:0.6}60%{transform:perspective(400px) rotateX(10deg);opacity:0.9}100%{transform:perspective(400px) rotateX(0deg);opacity:1}}
        @keyframes rotateColUp{0%{transform:perspective(400px) rotateX(0deg)}40%{transform:perspective(400px) rotateX(45deg);opacity:0.6}60%{transform:perspective(400px) rotateX(-10deg);opacity:0.9}100%{transform:perspective(400px) rotateX(0deg);opacity:1}}
        @keyframes cellPop{0%{transform:scale(1)}50%{transform:scale(0);opacity:0}100%{transform:scale(0);opacity:0}}
        @keyframes bubbleIn{0%{opacity:0;transform:translateX(-50%) translateY(8px) scale(0.3)}30%{opacity:1;transform:translateX(-50%) translateY(-4px) scale(1.05)}50%{transform:translateX(-50%) translateY(2px) scale(0.97)}70%{transform:translateX(-50%) translateY(-1px) scale(1.01)}100%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
        @keyframes bubbleOut{0%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}40%{opacity:0.8;transform:translateX(-50%) translateY(-3px) scale(1.03)}100%{opacity:0;transform:translateX(-50%) translateY(10px) scale(0.3)}}
        @keyframes flagBubbleIn{0%{opacity:0;transform:translateY(8px) scale(0.3)}30%{opacity:1;transform:translateY(-4px) scale(1.05)}50%{transform:translateY(2px) scale(0.97)}70%{transform:translateY(-1px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes flagBubbleOut{0%{opacity:1;transform:translateY(0) scale(1)}40%{opacity:0.8;transform:translateY(-3px) scale(1.03)}100%{opacity:0;transform:translateY(10px) scale(0.3)}}
        @keyframes themeResolve{0%{filter:blur(6px) contrast(1.8) brightness(1.3);transform:scale(1.02)}40%{filter:blur(3px) contrast(1.3) brightness(1.1)}100%{filter:none;transform:scale(1)}}
        @keyframes bubbleFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-3px)}}
        @keyframes floatUnicorn{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-20px) rotate(5deg)}}
        @keyframes scanlines{0%,100%{opacity:1}}
        @keyframes electricPulse{0%,100%{opacity:0.5;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.05)}}
        @property --rainbow-angle{syntax:'<angle>';initial-value:0deg;inherits:false}
        @keyframes rainbowSpin{from{--rainbow-angle:0deg}to{--rainbow-angle:360deg}}
        @keyframes rainbowText{0%{color:#ff4444}14%{color:#ff8844}28%{color:#ffcc44}42%{color:#44dd88}57%{color:#44aaff}71%{color:#8866ff}85%{color:#ff44cc}100%{color:#ff4444}}
        @media(max-height:750px){
          .piilosana-title{font-size:22px!important;margin:4px 0!important;}
          .piilosana-grid{gap:4px!important;padding:5px!important;}
          .piilosana-hud{padding:3px 8px!important;}
          .piilosana-found{max-height:70px!important;padding:4px!important;}
        }
        @media(max-height:650px){
          .piilosana-title{font-size:18px!important;margin:2px 0!important;}
          .piilosana-grid{gap:3px!important;padding:4px!important;}
          .piilosana-hud{padding:2px 6px!important;}
          .piilosana-found{max-height:50px!important;padding:3px!important;}
        }
      `}</style>

      {popups.map(p=><ScorePopup key={p.id}{...p}/>)}
      {wordPopups.map(p=><WordPopup key={p.id}{...p} font={S.font}/>)}

      {(mode===null||(mode==="solo"&&state==="menu")||(mode==="public"&&publicState==="nickname")||(mode==="multi"&&(lobbyState==="enter_name"||lobbyState==="choose")))?(
        <TitleDemo active={true} lang={lang} onGearClick={()=>{setShowSettings(v=>!v);setSettingsBubble(false);}} showBubble={mode!==null&&settingsBubble} bubbleFading={bubbleFading} hideGear={mode===null} theme={S}/>
      ):(
        <h1 className="piilosana-title" style={{fontSize:"28px",letterSpacing:"4px",margin:"6px 0",display:"flex",justifyContent:"center",alignItems:"center",gap:"2px",
          animation:state==="play"&&time<=15&&gameTime!==0?"pulse 0.5s infinite":"none"}}>
          {(()=>{const tc=TITLE_CONFIG[lang]||TITLE_CONFIG.fi;return tc.title.split("").map((ch,i)=>{
            if(i===tc.gearIdx)return <span key={i} onClick={()=>setShowSettings(v=>!v)} style={{
              cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",
              marginRight:"4px"}}>
              <Icon icon="gear" color={gearBlend?S.yellow:S.textSoft} size={S.cellGradient?3.5:1.7} style={{transition:"filter 2s ease"}}/></span>;
            return <span key={i} style={{color:S.yellow,textShadow:`3px 3px 0 #cc6600, 0 0 20px ${S.yellow}66`,fontFamily:S.titleFont}}>{ch}</span>;
          });})()}
        </h1>
      )}

      {/* Achievement unlock popup */}
      {newAchPopup&&ACHIEVEMENTS[newAchPopup]&&(
        <div style={{position:"fixed",top:"18%",left:"50%",transform:"translateX(-50%)",zIndex:200,
          animation:"pop 0.5s ease",pointerEvents:"none",textAlign:"center"}}>
          <div style={{background:S.dark,border:`3px solid ${ACHIEVEMENTS[newAchPopup].color}`,
            padding:"24px 36px",boxShadow:`0 0 60px ${ACHIEVEMENTS[newAchPopup].color}66`,minWidth:"280px",borderRadius:S.panelRadius}}>
            <div style={{fontSize:"16px",color:ACHIEVEMENTS[newAchPopup].color,marginBottom:"12px",fontWeight:"700",letterSpacing:"1px"}}>{t.achievementUnlocked}</div>
            <div style={{display:"flex",justifyContent:"center",marginBottom:"12px"}}>
              <Icon icon={ACHIEVEMENTS[newAchPopup].icon} color={ACHIEVEMENTS[newAchPopup].color} size={6} badge={true}/>
            </div>
            <div style={{fontSize:"20px",color:"#fff",fontWeight:"700"}}>{ACHIEVEMENTS[newAchPopup][lang]||ACHIEVEMENTS[newAchPopup].fi}</div>
            <div style={{fontSize:"14px",color:S.textSoft||"#88ccaa",marginTop:"6px"}}>{ACHIEVEMENTS[newAchPopup][lang+"_d"]||ACHIEVEMENTS[newAchPopup].fi_d}</div>
          </div>
        </div>
      )}

      {/* Achievements view */}
      {showAchievements&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:150,
          display:"flex",justifyContent:"center",alignItems:"flex-start",padding:"40px 16px",overflowY:"auto"}}
          onClick={(e)=>{if(e.target===e.currentTarget)setShowAchievements(false);}}>
          <div style={{width:"100%",maxWidth:"600px",background:S.dark,border:`2px solid #ffcc00`,
            boxShadow:S.panelShadow!=="none"?S.panelShadow:"0 0 30px #ffcc0033",borderRadius:S.panelRadius,padding:"24px",animation:"fadeIn 0.3s ease"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                <Icon icon="trophy" color="#ffcc00" size={4} badge={true}/>
                <span style={{fontFamily:S.font,fontSize:"20px",fontWeight:"700",color:"#ffcc00"}}>{t.achievements}</span>
              </div>
              <span style={{fontSize:"15px",color:S.textSoft||"#88ccaa",fontWeight:"600"}}>{Object.keys(achUnlocked).length} / {Object.keys(ACHIEVEMENTS).length}</span>
              <button onClick={()=>setShowAchievements(false)} style={{fontFamily:S.font,fontSize:"18px",color:S.green,
                background:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer",borderRadius:"8px"}}>X</button>
            </div>
            {/* Progress bar */}
            <div style={{width:"100%",height:"8px",background:S.border,marginBottom:"20px",borderRadius:"4px"}}>
              <div style={{width:`${Object.keys(achUnlocked).length/Object.keys(ACHIEVEMENTS).length*100}%`,height:"100%",
                background:"linear-gradient(90deg, #ffcc00, #ff6644)",transition:"width 0.5s ease",borderRadius:"4px"}}/>
            </div>
            {/* Achievement grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))",gap:"10px"}}>
              {Object.entries(ACHIEVEMENTS).map(([id,ach])=>{
                const unlocked=!!achUnlocked[id];
                return(
                  <div key={id} style={{border:`2px solid ${unlocked?ach.color+"88":S.border}`,
                    padding:"14px",textAlign:"center",background:unlocked?"#ffffff08":"#00000044",
                    opacity:unlocked?1:0.5,transition:"all 0.3s",borderRadius:"10px"}}>
                    <div style={{display:"flex",justifyContent:"center",marginBottom:"8px"}}>
                      <Icon icon={ach.icon} color={unlocked?ach.color:"#444"} size={4} badge={true}/>
                    </div>
                    <div style={{fontSize:"15px",fontWeight:"700",color:unlocked?ach.color:S.textMuted,marginBottom:"4px",lineHeight:"1.4"}}>
                      {ach[lang]||ach.fi}
                    </div>
                    <div style={{fontSize:"13px",color:unlocked?(S.textSoft||"#88ccaa"):S.textMuted,lineHeight:"1.4"}}>
                      {ach[lang+"_d"]||ach.fi_d}
                    </div>
                    {unlocked&&<div style={{fontSize:"13px",color:S.textMuted,marginTop:"4px"}}>
                      {new Date(achUnlocked[id]).toLocaleDateString()}
                    </div>}
                  </div>
                );
              })}
            </div>
            {/* Stats summary */}
            <div style={{marginTop:"20px",padding:"14px",border:`1px solid ${S.border}`,fontSize:"14px",color:S.textSoft||"#88ccaa",
              display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px",borderRadius:"8px"}}>
              <div>{lang==="en"?"Words found":lang==="sv"?"Ord hittade":"Sanoja löydetty"}: <strong>{achStats.totalWords}</strong></div>
              <div>{lang==="en"?"Games played":lang==="sv"?"Spel spelade":"Pelejä pelattu"}: <strong>{achStats.gamesPlayed}</strong></div>
              <div>{lang==="en"?"Best score":lang==="sv"?"Bästa poäng":"Paras tulos"}: <strong>{achStats.bestScore}</strong></div>
              <div>{lang==="en"?"Best combo":lang==="sv"?"Bästa kombo":"Paras kombo"}: <strong>{achStats.bestCombo}</strong></div>
              <div>{lang==="en"?"Longest word":lang==="sv"?"Längsta ord":"Pisin sana"}: <strong>{achStats.longestWord}</strong> {lang==="en"?"letters":lang==="sv"?"bokstäver":"kirjainta"}</div>
              <div>{lang==="en"?"Multiplayer wins":lang==="sv"?"Flerspelarvinster":"Moninpelivoitot"}: <strong>{achStats.arenaWins}</strong></div>
            </div>
          </div>
        </div>
      )}

      {/* Settings panel - overlay below title */}
      {showSettings&&(
        <div style={{width:"100%",maxWidth:"500px",padding:"18px",border:`2px solid ${S.green}`,background:S.dark,
          boxShadow:S.panelShadow!=="none"?S.panelShadow:`0 0 20px ${S.green}33`,borderRadius:S.panelRadius,animation:"fadeIn 0.3s ease",marginBottom:"8px",zIndex:100,position:"relative"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px",borderBottom:`1px solid ${S.border}`,paddingBottom:"10px"}}>
            <div style={{fontFamily:S.font,fontSize:"16px",fontWeight:"700",color:S.yellow,letterSpacing:"1px"}}>
              {lang==="en"?"SETTINGS":lang==="sv"?"INSTÄLLNINGAR":"ASETUKSET"}
            </div>
            <button onClick={()=>setShowSettings(false)} style={{fontFamily:S.font,fontSize:"14px",color:S.green,background:"transparent",border:`1px solid ${S.green}`,padding:"4px 12px",cursor:"pointer",borderRadius:S.btnRadius}}>✕</button>
          </div>
          {/* Theme */}
          <div style={{marginBottom:"14px"}}>
            <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"600",color:S.textMuted,marginBottom:"8px",letterSpacing:"2px",textTransform:"uppercase"}}>
              {lang==="en"?"Color Theme":lang==="sv"?"Färgtema":"Väriteema"}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {Object.entries(THEMES).map(([id,th])=>(
                <button key={id} onClick={()=>{setThemeId(id);localStorage.setItem("piilosana_theme",id);syncSettings({theme:id});}}
                  style={{fontFamily:S.font,fontSize:"13px",
                    color:themeId===id?th.bg:th.green,
                    background:themeId===id?th.green:"transparent",
                    border:`2px solid ${th.green}`,padding:"5px 8px",cursor:"pointer",
                    boxShadow:themeId===id?`0 0 8px ${th.green}66`:"none",
                    borderRadius:S.btnRadius}}>
                  {lang==="en"?th.nameEn:lang==="sv"?th.nameSv:th.name}
                </button>
              ))}
            </div>
          </div>
          {/* Size */}
          <div style={{marginBottom:"14px"}}>
            <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"600",color:S.textMuted,marginBottom:"8px",letterSpacing:"2px",textTransform:"uppercase"}}>
              {lang==="en"?"Grid Size":lang==="sv"?"Rutstorlek":"Ruudukon koko"}
            </div>
            <div style={{display:"flex",gap:"4px"}}>
              <button onClick={()=>{setUiSize("normal");localStorage.setItem("piilosana_size","normal");syncSettings({size:"normal"});}}
                style={{fontFamily:S.font,fontSize:"13px",
                  color:uiSize==="normal"?S.bg:S.green,background:uiSize==="normal"?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer"}}>
                {lang==="en"?"NORMAL":lang==="sv"?"NORMAL":"NORMAALI"}
              </button>
              <button onClick={()=>{setUiSize("large");localStorage.setItem("piilosana_size","large");syncSettings({size:"large"});}}
                style={{fontFamily:S.font,fontSize:"13px",
                  color:uiSize==="large"?S.bg:S.green,background:uiSize==="large"?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer"}}>
                {lang==="en"?"LARGE":lang==="sv"?"STOR":"ISO"}
              </button>
            </div>
          </div>
          {/* Sound */}
          <div style={{marginBottom:"14px"}}>
            <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"600",color:S.textMuted,marginBottom:"8px",letterSpacing:"2px",textTransform:"uppercase"}}>
              {lang==="en"?"Sound Effects":lang==="sv"?"Ljudeffekter":"Ääniefektit"}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
              {[["retro",{fi:"RETRO",en:"RETRO",sv:"RETRO"}],["soft",{fi:"PEHMEÄ",en:"SOFT",sv:"MJUK"}],["modern",{fi:"MODERNI",en:"MODERN",sv:"MODERN"}],["off",{fi:"POIS",en:"OFF",sv:"AV"}]].map(([id,names])=>(
                <button key={id} onClick={()=>{setSoundTheme(id);localStorage.setItem("piilosana_sound",id);syncSettings({sound:id});}}
                  style={{fontFamily:S.font,fontSize:"13px",
                    color:soundTheme===id?S.bg:S.green,background:soundTheme===id?S.green:"transparent",
                    border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer",
                    boxShadow:soundTheme===id?`0 0 8px ${S.green}66`:"none"}}>
                  {names[lang]||names.en}
                </button>
              ))}
            </div>
          </div>
          {/* Background Music */}
          <div style={{marginBottom:"14px"}}>
            <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"600",color:S.textMuted,marginBottom:"8px",letterSpacing:"2px",textTransform:"uppercase"}}>
              {lang==="en"?"Background Music":lang==="sv"?"Bakgrundsmusik":"Taustamusiikki"}
            </div>
            <div style={{display:"flex",gap:"4px"}}>
              <button onClick={()=>{setMusicOn(true);localStorage.setItem("piilosana_music","on");}}
                style={{fontFamily:S.font,fontSize:"13px",
                  color:musicOn?S.bg:S.green,background:musicOn?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer",
                  boxShadow:musicOn?`0 0 8px ${S.green}66`:"none"}}>
                {lang==="en"?"ON":lang==="sv"?"PÅ":"PÄÄLLÄ"}
              </button>
              <button onClick={()=>{setMusicOn(false);localStorage.setItem("piilosana_music","off");music.stop();}}
                style={{fontFamily:S.font,fontSize:"13px",
                  color:!musicOn?S.bg:S.green,background:!musicOn?S.green:"transparent",
                  border:`2px solid ${S.green}`,padding:"5px 8px",cursor:"pointer",
                  boxShadow:!musicOn?`0 0 8px ${S.green}66`:"none"}}>
                {lang==="en"?"OFF":lang==="sv"?"AV":"POIS"}
              </button>
            </div>
          </div>
          {/* Confetti */}
          <div>
            <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"600",color:S.textMuted,marginBottom:"8px",letterSpacing:"2px",textTransform:"uppercase"}}>
              {lang==="en"?"Visual Effects":lang==="sv"?"Visuella effekter":"Visuaaliset tehosteet"}
            </div>
            <button onClick={()=>{const v=!confettiOn;setConfettiOn(v);localStorage.setItem("piilosana_confetti",v?"on":"off");syncSettings({confetti:v});}}
              style={{fontFamily:S.font,fontSize:"13px",
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
              <div style={{fontFamily:S.font,fontSize:"13px",color:S.green,marginBottom:"12px",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
                <Icon icon="person" color={S.green} size={2}/>
                {authUser.nickname}
              </div>
              {authUser.email&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginBottom:"12px"}}>{authUser.email}</div>}
              {authMode==="changePassword"?(
                <form onSubmit={async(e)=>{e.preventDefault();const fd=new FormData(e.target);await doChangePassword(fd.get("currentPassword"),fd.get("newPassword"));}} style={{textAlign:"left"}}>
                  <input name="currentPassword" type="password" autoComplete="current-password" placeholder={lang==="en"?"CURRENT PASSWORD":lang==="sv"?"NUVARANDE LÖSENORD":"NYKYINEN SALASANA"}
                    style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  <input name="newPassword" type="password" autoComplete="new-password" minLength="4" placeholder={lang==="en"?"NEW PASSWORD":lang==="sv"?"NYTT LÖSENORD":"UUSI SALASANA"}
                    style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  {authError&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                  {authSuccess&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.green,marginBottom:"8px"}}>{authSuccess}</div>}
                  <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"100%"}}>
                    {authLoading?"...":(lang==="en"?"CHANGE PASSWORD":lang==="sv"?"ÄNDRA LÖSENORD":"VAIHDA SALASANA")}
                  </button>
                  <button type="button" onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
                    ← {lang==="en"?"Back":lang==="sv"?"Tillbaka":"Takaisin"}
                  </button>
                </form>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center"}}>
                  <button onClick={()=>{setAuthMode("changePassword");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:S.yellow,background:"transparent",border:`2px solid ${S.yellow}`,padding:"6px 16px",cursor:"pointer"}}>
                    {lang==="en"?"CHANGE PASSWORD":lang==="sv"?"ÄNDRA LÖSENORD":"VAIHDA SALASANA"}
                  </button>
                  <button onClick={()=>{doLogout();setShowAuth(false);}} style={{fontFamily:S.font,fontSize:"13px",color:S.red||"#ff4444",background:"transparent",border:`2px solid ${S.red||"#ff4444"}`,padding:"6px 16px",cursor:"pointer"}}>
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
                  <button onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:authMode==="login"?S.bg:S.yellow,background:authMode==="login"?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"5px 12px",cursor:"pointer"}}>
                    {lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"}
                  </button>
                  <button onClick={()=>{setAuthMode("register");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:authMode==="register"?S.bg:S.yellow,background:authMode==="register"?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"5px 12px",cursor:"pointer"}}>
                    {lang==="en"?"REGISTER":lang==="sv"?"REGISTRERA":"LUO TUNNUS"}
                  </button>
                </div>
                <button onClick={()=>setShowAuth(false)} style={{fontFamily:S.font,fontSize:"16px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,padding:"6px 14px",cursor:"pointer"}}>✕</button>
              </div>
              {authMode==="forgot"?(
                <form onSubmit={async(e)=>{e.preventDefault();const fd=new FormData(e.target);await doForgotPassword(fd.get("email"));}}>
                  <div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginBottom:"10px",lineHeight:"1.6"}}>
                    {lang==="en"?"Enter your email and we'll send a new password.":lang==="sv"?"Ange din e-post så skickar vi ett nytt lösenord.":"Syötä sähköpostisi niin lähetämme uuden salasanan."}
                  </div>
                  <input name="email" type="email" autoComplete="email" placeholder={lang==="en"?"EMAIL":lang==="sv"?"E-POST":"SÄHKÖPOSTI"}
                    style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                  {authError&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                  {authSuccess&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.green,marginBottom:"8px"}}>{authSuccess}</div>}
                  <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"100%"}}>
                    {authLoading?"...":(lang==="en"?"SEND NEW PASSWORD":lang==="sv"?"SKICKA NYTT LÖSENORD":"LÄHETÄ UUSI SALASANA")}
                  </button>
                  <button type="button" onClick={()=>{setAuthMode("login");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
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
                  style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                <input name="password" type="password" autoComplete={authMode==="register"?"new-password":"current-password"} minLength="4"
                  placeholder={lang==="en"?"PASSWORD":lang==="sv"?"LÖSENORD":"SALASANA"}
                  style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                {authMode==="register"&&(
                  <>
                    <input name="email" type="email" autoComplete="email" placeholder={`${lang==="en"?"EMAIL":lang==="sv"?"E-POST":"SÄHKÖPOSTI"} (${lang==="en"?"optional":lang==="sv"?"valfritt":"vapaaehtoinen"})`}
                      style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                    <input name="email2" type="email" autoComplete="email" placeholder={lang==="en"?"CONFIRM EMAIL":lang==="sv"?"BEKRÄFTA E-POST":"VAHVISTA SÄHKÖPOSTI"}
                      style={{fontFamily:S.font,fontSize:"13px",padding:"8px",width:"100%",boxSizing:"border-box",background:S.inputBg||S.dark,color:S.green,border:`2px solid ${S.border}`,marginBottom:"8px"}}/>
                    <div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginBottom:"8px",lineHeight:"1.6"}}>
                      {lang==="en"?"Password will be sent to your email for safekeeping":lang==="sv"?"Lösenordet skickas till din e-post":"Salasana lähetetään sähköpostiisi muistiksi"}
                    </div>
                  </>
                )}
                {authError&&<div style={{fontFamily:S.font,fontSize:"13px",color:S.red||"#ff4444",marginBottom:"8px"}}>{authError}</div>}
                <button type="submit" disabled={authLoading} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"8px 20px",cursor:"pointer",boxShadow:`3px 3px 0 #cc8800`,width:"100%"}}>
                  {authLoading?"...":(authMode==="login"?(lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"):(lang==="en"?"CREATE ACCOUNT":lang==="sv"?"SKAPA KONTO":"LUO TUNNUS"))}
                </button>
                {authMode==="login"&&(
                  <button type="button" onClick={()=>{setAuthMode("forgot");setAuthError("");setAuthSuccess("");}} style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,background:"transparent",border:"none",padding:"8px",cursor:"pointer",marginTop:"6px",width:"100%",textAlign:"center"}}>
                    {lang==="en"?"Forgot password?":lang==="sv"?"Glömt lösenord?":"Unohtuiko salasana?"}
                  </button>
                )}
              </form>
              )}
              {/* Google Sign-In */}
              {googleClientId&&(
                <div style={{marginTop:"12px",paddingTop:"12px",borderTop:`1px solid ${S.border}`,textAlign:"center"}}>
                  <div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginBottom:"8px"}}>
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
                  <div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginTop:"10px",lineHeight:"1.8",maxWidth:"280px",textAlign:"center"}}>
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
          <div style={{fontFamily:S.font,fontSize:"13px",color:S.yellow,marginBottom:"8px",display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>
            <Icon icon="person" color={S.yellow} size={2}/>
            {lang==="en"?"Save your nickname?":lang==="sv"?"Spara ditt smeknamn?":"Tallenna nimimerkkisi?"}
          </div>
          <div style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,marginBottom:"10px",lineHeight:"1.6"}}>
            {lang==="en"?"Create an account to save your progress":lang==="sv"?"Skapa ett konto för att spara dina framsteg":"Luo tunnus — nimimerkkisi ja saavutuksesi tallentuvat"}
          </div>
          <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
            <button onClick={()=>{setShowAuth(true);setAuthMode("register");setShowFirstTimeAuth(false);}}
              style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"6px 16px",cursor:"pointer",boxShadow:"2px 2px 0 #cc8800"}}>
              {lang==="en"?"CREATE ACCOUNT":lang==="sv"?"SKAPA KONTO":"LUO TUNNUS"}
            </button>
            <button onClick={()=>{setShowAuth(true);setAuthMode("login");setShowFirstTimeAuth(false);}}
              style={{fontFamily:S.font,fontSize:"13px",color:S.yellow,background:"transparent",border:`1px solid ${S.yellow}`,padding:"6px 16px",cursor:"pointer"}}>
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
            <p style={{fontSize:"14px",lineHeight:"2",marginBottom:"16px",color:S.green}}>{t.nickname}</p>
            <input ref={el=>{nicknameRef.current=el;if(el)el.focus();}} type="text" inputMode="text" maxLength="12" value={nickname} onChange={e=>setNickname(e.target.value.toUpperCase())}
              autoFocus placeholder={t.nickname} onKeyDown={e=>{if(e.key==="Enter"&&nickname)setLobbyState("choose");}}
              style={{fontFamily:S.font,fontSize:"18px",padding:"8px 12px",width:"100%",maxWidth:"500px",background:S.dark,color:S.green,border:`2px solid ${S.green}`,boxSizing:"border-box",marginBottom:"16px"}}/>
            <br/>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>nickname&&setLobbyState("choose")} style={{fontFamily:S.font,fontSize:"16px",color:S.bg,background:nickname?S.green:S.border,border:"none",padding:"12px 28px",cursor:nickname?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>{lang==="en"?"CONTINUE":"JATKA"}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}
      {mode==="multi"&&(lobbyState==="creating"||lobbyState==="joining")&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.yellow}`,padding:"24px",boxShadow:`0 0 20px ${S.yellow}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"13px",lineHeight:"2",color:S.yellow,animation:"pulse 1s infinite"}}>
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
              <p style={{fontSize:"13px",lineHeight:"2",color:S.green,margin:0}}>{t.openGames}</p>
              <button onClick={refreshRooms} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`1px solid ${S.green}`,background:"transparent",padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center"}}><Icon icon="refresh" color={S.green} size={2}/></button>
            </div>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"80px",maxHeight:"200px",overflowY:"auto"}}>
              {publicRooms.length===0&&(
                <p style={{fontSize:"18px",color:S.textMuted,padding:"16px 0"}}>{t.noRooms}</p>
              )}
              {publicRooms.map((r,i)=>(
                <div key={r.roomCode} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px",borderBottom:i<publicRooms.length-1?`1px solid ${S.border}`:"none"}}>
                  <div>
                    <span style={{marginRight:"6px",display:"inline-flex",verticalAlign:"middle"}}><PixelFlag lang={r.lang||"fi"} size={2}/></span>
                    <span style={{fontSize:"13px",color:S.yellow}}>{r.hostNickname}</span>
                    <span style={{fontSize:"18px",color:"#888",marginLeft:"8px"}}>{r.playerCount}/{r.maxPlayers}</span>
                  </div>
                  <button onClick={()=>joinRoom(r.roomCode)} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"6px 14px",cursor:"pointer",boxShadow:"2px 2px 0 #cc8800"}}>{t.join}</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <button onClick={createRoom} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:socketConnected?S.green:S.border,border:"none",padding:"12px 20px",cursor:socketConnected?"pointer":"default",boxShadow:socketConnected?"3px 3px 0 #008844":"none"}}>{socketConnected?t.createGame:t.connecting}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"10px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}
      {mode==="multi"&&lobbyState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.yellow}`,padding:"24px",boxShadow:`0 0 20px ${S.yellow}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"18px",lineHeight:"2",marginBottom:"12px",color:S.yellow}}>{t.waiting}</p>
            <p style={{fontSize:"13px",lineHeight:"2",color:S.green,marginBottom:"12px"}}>{t.playersCount} ({players.length})</p>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"60px"}}>
              {players.map((p,i)=><div key={i} style={{fontSize:"13px",color:p.playerId===playerId?S.yellow:S.green,padding:"4px"}}>{i+1}. {p.nickname}{p.playerId===playerId?` (${t.youTag})`:""}</div>)}
            </div>
            {isHost&&(
              <div style={{marginBottom:"12px"}}>
                <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.gameMode}</p>
                <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                  <button onClick={()=>setGameMode("classic")} style={{fontFamily:S.font,fontSize:"13px",color:gameMode==="classic"?S.bg:S.green,background:gameMode==="classic"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>{t.classic}</button>
                  <button onClick={()=>setGameMode("battle")} style={{fontFamily:S.font,fontSize:"13px",color:gameMode==="battle"?S.bg:S.purple,background:gameMode==="battle"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><Icon icon="swords" color={gameMode==="battle"?S.bg:S.purple} size={2}/>{t.battle}</button>
                </div>
                {gameMode==="battle"&&<p style={{fontSize:"13px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>{t.battleDesc}</p>}
                <div style={{marginTop:"12px"}}>
                  <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.time}</p>
                  <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                    <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
                    <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
                  </div>
                </div>
                {gameMode!=="battle"&&(
                  <div style={{marginTop:"12px"}}>
                    <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.letterMult}</p>
                    <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"13px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                      {letterMult?"✓ ":""}{t.letterMultBtn}
                    </button>
                  </div>
                )}
              </div>
            )}
            {isHost&&<button onClick={()=>startGame(gameMode)} disabled={players.length<2} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:players.length>=2?S.green:S.border,border:"none",padding:"12px 24px",cursor:players.length>=2?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>{t.startGame}</button>}
            {isHost&&players.length<2&&<p style={{fontSize:"18px",color:"#666",marginTop:"8px"}}>{t.waitForPlayers}</p>}
            {!isHost&&<p style={{fontSize:"18px",color:"#666"}}>{t.waitForHost}</p>}
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"12px"}}>{t.exit}</button>
          </div>
        </div>
      )}
      {mode==="multi"&&state==="end"&&lobbyState==="results"&&<ResultsScreen/>}

      {/* PIILOSAUNA - nickname entry */}
      {mode==="public"&&publicState==="nickname"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:"3px solid #ff6644",padding:"24px",boxShadow:"0 0 20px #ff664444",maxWidth:"600px"}}>
            <p style={{fontSize:"18px",color:"#ff6644",marginBottom:"8px"}}>{t.arena}</p>
            <p style={{fontSize:"14px",color:S.textSoft||"#88ccaa",marginBottom:"16px",lineHeight:"1.8"}}>{t.arenaJoinDesc}</p>
            <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.nickname}</p>
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
                style={{fontFamily:S.font,fontSize:"13px",color:soloNickname.trim()?S.bg:S.textMuted,
                background:soloNickname.trim()?"#ff6644":S.border,border:"none",padding:"12px 24px",
                cursor:soloNickname.trim()?"pointer":"default",boxShadow:soloNickname.trim()?"3px 3px 0 #cc3311":"none"}}>
                {t.join}
              </button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
            </div>
          </div>
        </div>
      )}

      {/* AREENA - waiting for round */}
      {mode==="public"&&publicState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <p style={{fontSize:"22px",color:"#ff6644"}}>{t.arena}</p>
          {publicNextCountdown>0?(
            <>
              <p style={{fontSize:"15px",color:S.textMuted,marginTop:"12px"}}>{t.nextRound}</p>
              <p style={{fontSize:"28px",color:S.green,marginTop:"8px",animation:publicNextCountdown<=5?"pulse 0.5s infinite":"none"}}>{publicNextCountdown}s</p>
            </>
          ):(
            <p style={{fontSize:"15px",color:S.textMuted,marginTop:"12px",animation:"pulse 1s infinite"}}>{lang==="en"?"Connecting...":lang==="sv"?"Ansluter...":"Yhdistetään..."}</p>
          )}
          <p style={{fontSize:"15px",color:S.textSoft||"#88ccaa",marginTop:"8px"}}>{publicPlayerCount} {publicPlayerCount===1?t.playerInArena:t.playersInArena}</p>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"16px"}}>{t.back}</button>
        </div>
      )}

      {/* PIILOSAUNA - countdown */}
      {mode==="public"&&publicState==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"18px",color:"#ff6644",marginBottom:"24px"}}>{t.arena}</div>
          <div style={{fontSize:"15px",color:S.green,marginBottom:"8px"}}>{publicPlayerCount} {publicPlayerCount===1?t.playerInArena:t.playersInArena}</div>
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
            <div style={{fontSize:"13px",color:"#ff6644",marginBottom:"4px"}}>{t.roundOver}</div>
            <div style={{fontSize:"13px",color:S.textMuted,marginBottom:"10px"}}>{t.yourScore}</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}</div>
            <div style={{fontSize:"13px",color:S.textSoft,marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            <div style={{fontSize:"13px",color:publicNextCountdown<=10?S.yellow:S.textSoft,marginTop:"12px"}}>
              {t.nextRoundIn}: {publicNextCountdown>0?`${publicNextCountdown}s`:t.starts}
            </div>
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"10px"}}>{t.exit}</button>
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
                      <span style={{fontSize:"16px",minWidth:"24px"}}>{i<3?MEDALS[i]:<span style={{fontSize:"13px",color:S.textMuted}}>{i+1}.</span>}</span>
                      <span style={{fontSize:"13px",color:r.nickname===soloNickname?S.green:i===0?S.yellow:i<3?"#cccccc":"#aaa",fontWeight:r.nickname===soloNickname?"bold":"normal"}}>{r.nickname}</span>
                    </div>
                    <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                      <span style={{fontSize:"13px",color:S.yellow}}>{r.score}p</span>
                      <span style={{fontSize:"13px",color:S.textSoft}}>{r.percentage}%</span>
                      <span style={{fontSize:"13px",color:S.textMuted}}>{r.wordsFound} {t.words}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All found words (collective) */}
          {publicFoundSorted.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"16px",color:S.green,marginBottom:"6px"}}>{t.foundWords} ({publicFoundSorted.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicFoundSorted.map((w,i)=>(
                  <span key={i} style={{fontSize:"16px",background:found.includes(w)?S.dark:S.gridBg,padding:"2px 4px",
                    border:`1px solid ${found.includes(w)?wordColor(w.length)+"44":"#33333366"}`,
                    color:found.includes(w)?wordColor(w.length):"#667"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              <div style={{fontSize:"13px",color:S.textMuted,marginTop:"4px"}}>{t.ownHighlighted}</div>
            </div>
          )}

          {/* Missed words */}
          {publicMissed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>{t.missed} ({publicMissed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicMissed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:S.dark,padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
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
            <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.gameMode}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setSoloMode("normal")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="normal"?S.bg:S.green,background:soloMode==="normal"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>{t.modeNormal}</button>
              <button onClick={()=>setSoloMode("tetris")} style={{fontFamily:S.font,fontSize:"13px",color:soloMode==="tetris"?S.bg:S.purple,background:soloMode==="tetris"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><Icon icon="arrow" color={soloMode==="tetris"?S.bg:S.purple} size={2}/>{t.modeTetris}</button>
            </div>
            {soloMode==="tetris"&&<p style={{fontSize:"13px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>{t.tetrisDesc}</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.time}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
              <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>{lang==="en"?"6.7":"6,7"} MIN</button>
              <button onClick={()=>setGameTime(0)} style={{fontFamily:S.font,fontSize:"13px",color:gameTime===0?S.bg:"#44ddff",background:gameTime===0?"#44ddff":"transparent",border:"2px solid #44ddff",padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px"}}><Icon icon="infinity" color={gameTime===0?S.bg:"#44ddff"} size={2}/>{t.unlimited}</button>
            </div>
            {gameTime===0&&<p style={{fontSize:"13px",color:"#44ddff",marginTop:"8px",lineHeight:"1.8"}}>{t.unlimitedDesc}</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"13px",color:S.green,marginBottom:"8px"}}>{t.otherOptions}</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"13px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                {letterMult?"✓ ":""}{t.letterMultBtn}
              </button>
            </div>
            {letterMult&&<p style={{fontSize:"13px",color:S.yellow,marginTop:"6px",lineHeight:"1.8"}}>{t.letterMultDesc}</p>}
          </div>
          {gameTime!==0&&!authUser&&(
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"13px",color:S.textMuted,marginBottom:"6px"}}>{t.nickForHof}</p>
            <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
              placeholder={t.optional} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:S.dark,
              border:`2px solid ${S.border}`,padding:"8px",width:"160px",textAlign:"center",outline:"none"}}/>
            {soloNickname.trim()&&<p style={{fontSize:"13px",color:S.textSoft||"#88ccaa",marginTop:"4px"}}>{t.scoresSaved} {soloNickname.trim()}</p>}
          </div>
          )}
          {gameTime!==0&&authUser&&(
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"13px",color:S.textSoft||"#88ccaa"}}>{t.scoresSaved} {authUser.nickname}</p>
          </div>
          )}
          <div style={{display:"flex",gap:"12px",justifyContent:"center",alignItems:"center"}}>
            <button onClick={start} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"14px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #008844"}}
              onMouseEnter={e=>{e.target.style.transform="translate(-2px,-2px)";e.target.style.boxShadow="6px 6px 0 #008844"}}
              onMouseLeave={e=>{e.target.style.transform="none";e.target.style.boxShadow="4px 4px 0 #008844"}}>
              {t.play}
            </button>
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>{t.back}</button>
          </div>
        </div>
      )}

      {/* COUNTDOWN */}
      {state==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"13px",color:S.green,marginBottom:"24px"}}>{mode==="multi"?(gameMode==="battle"?t.battleStarts:t.gameStarts):(soloMode==="tetris"?t.tetrisStarts:soloMode==="rotate"?t.rotateStarts:soloMode==="theme"?t.themeStarts:soloMode==="bomb"?t.bombStarts:soloMode==="mystery"?t.mysteryStarts:soloMode==="chess"?`${CHESS_EMOJI[chessPiece]||"♞"} ${t.chessLabel}`:t.getReady)}</div>
          <div key={countdown} style={{fontSize:"72px",color:countdown<=2?S.red:countdown<=3?S.yellow:S.green,textShadow:`0 0 40px ${countdown<=2?"#ff444488":countdown<=3?"#ffcc0088":"#00ff8888"}`,animation:"pop 0.3s ease",lineHeight:"1"}}>
            {countdown>0?countdown:t.play+"!"}
          </div>
          {mode==="multi"&&<div style={{fontSize:"18px",color:S.textMuted,marginTop:"24px"}}>{players.length} {t.players}</div>}
        </div>
      )}

      {/* PLAYING + ENDING + SCRAMBLE */}
      {(state==="play"||state==="ending"||state==="scramble")&&(
        <div style={{width:"100%",maxWidth:"600px",position:"relative",padding:"0 2px",display:"flex",flexDirection:"column",flex:"1 1 auto",minHeight:0}}>
          {/* HUD */}
          <div style={{marginBottom:"6px",border:`2px solid ${(gameMode==="battle"||(mode==="solo"&&soloMode==="tetris"))?S.purple+"88":gameTime===0?"#44ddff88":S.border}`,background:S.dark}}>
            {mode==="public"&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:"#ff6644",background:"#ff664411",borderBottom:`1px solid ${S.border}`}}>{t.arenaLabel} — {publicPlayerCount} {publicPlayerCount===1?t.player:t.players}</div>}
            {mode==="multi"&&gameMode==="battle"&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><Icon icon="swords" color={S.purple} size={1}/>{t.battleLabel}</div>}
            {mode==="solo"&&soloMode==="tetris"&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><Icon icon="arrow" color={S.purple} size={1}/>{t.tetrisLabel}</div>}
            {mode==="solo"&&soloMode==="rotate"&&(
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",padding:"4px",
                background:rotateActive?"#ff990022":"#ff990008",borderBottom:`1px solid ${S.border}`,transition:"background 0.2s"}}>
                <button onClick={()=>setRotateActive(a=>!a)}
                  style={{fontFamily:S.font,fontSize:"13px",padding:"4px 14px",cursor:"pointer",borderRadius:S.btnRadius,
                    border:rotateActive?"2px solid #ff9900":`2px solid ${S.border}`,
                    background:rotateActive?"#ff9900":"transparent",
                    color:rotateActive?S.bg:"#ff9900",
                    transition:"all 0.2s",display:"flex",alignItems:"center",gap:"5px"}}>
                  {rotateActive?"🔄":"✋"} {rotateActive?(lang==="en"?"ROTATING":lang==="sv"?"ROTERA":"PYÖRITÄ"):(lang==="en"?"FIND WORDS":lang==="sv"?"HITTA ORD":"ETSI SANOJA")}
                </button>
                <span style={{fontSize:"13px",color:"#ff990088"}}>{rotateCount>0?`${rotateCount} ${lang==="en"?"moves":lang==="sv"?"drag":"siirtoa"}`:""}</span>
              </div>
            )}
            {mode==="solo"&&soloMode==="theme"&&activeTheme&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:"#44bb66",background:"#44bb6611",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>{activeTheme.emoji} {t.themeHint}: {activeTheme.name} — {themeFound.length}/{activeTheme.words.length}</div>}
            {mode==="solo"&&soloMode==="bomb"&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:"#ff4444",background:"#ff444411",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>💣 {t.bombLabel} — {bombTimer}s</div>}
            {mode==="solo"&&soloMode==="mystery"&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:"#aa66ff",background:"#aa66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}>❓ {t.mysteryLabel}</div>}
            {mode==="solo"&&soloMode==="chess"&&state==="play"&&chessPiece&&(
              <div style={{textAlign:"center",padding:"8px",fontSize:"13px",color:"#ddaa33",background:"#ddaa3311",borderBottom:`1px solid ${S.border}`}}>
                {chessPlacing?(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"10px"}}>
                    <span style={{fontSize:"42px",color:"#fff",filter:"drop-shadow(0 0 10px #ddaa33) drop-shadow(0 2px 4px #000)",WebkitTextStroke:"1px rgba(221,170,51,0.6)"}}>{CHESS_EMOJI[chessPiece]}</span>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:"12px",color:"#ddaa33",fontFamily:S.font,textTransform:"uppercase",letterSpacing:"1px"}}>{(CHESS_NAMES[lang]||CHESS_NAMES.fi)[chessPiece]}</div>
                      <div style={{fontSize:"13px",color:"#ddaa3388",marginTop:"2px"}}>{lang==="en"?"Place on bottom row":lang==="sv"?"Placera på nedersta raden":"Aseta alariville ↓"}</div>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"32px",color:"#fff",filter:"drop-shadow(0 0 6px #ddaa33)",WebkitTextStroke:"0.5px rgba(221,170,51,0.4)"}}>{CHESS_EMOJI[chessPiece]}</span>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:"11px",color:"#ddaa3388",fontFamily:S.font,textTransform:"uppercase"}}>{(CHESS_NAMES[lang]||CHESS_NAMES.fi)[chessPiece]}</div>
                      <div style={{fontSize:"16px",fontFamily:S.font,letterSpacing:"2px",color:chessWord.length>=3&&WORDS_SET.has(chessWord)?"#44bb66":"#fff",fontWeight:"700"}}>{chessWord.toUpperCase()||"..."}</div>
                    </div>
                    <div style={{display:"flex",gap:"4px",marginLeft:"auto"}}>
                      <button onClick={chessSubmitWord} disabled={chessWord.length<3} style={{fontFamily:S.font,fontSize:"13px",color:chessWord.length>=3?"#fff":"#555",background:chessWord.length>=3?"#44bb66":"#333",border:"none",padding:"5px 14px",cursor:chessWord.length>=3?"pointer":"default",borderRadius:S.btnRadius,transition:"all 0.2s"}}>✓</button>
                      <button onClick={chessUndo} disabled={chessPath.length<1} style={{fontFamily:S.font,fontSize:"13px",color:chessPath.length>=1?"#ddaa33":"#444",background:"transparent",border:`1px solid ${chessPath.length>=1?"#ddaa3366":"#33333366"}`,padding:"5px 10px",cursor:chessPath.length>=1?"pointer":"default",borderRadius:S.btnRadius}}>↩</button>
                      <button onClick={chessReset} style={{fontFamily:S.font,fontSize:"13px",color:"#ddaa33",background:"transparent",border:"1px solid #ddaa3366",padding:"5px 10px",cursor:"pointer",borderRadius:S.btnRadius}}>⟳</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {mode==="solo"&&gameTime===0&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:"#44ddff",background:"#44ddff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><Icon icon="infinity" color="#44ddff" size={1}/>{t.unlimitedLabel}</div>}
            {letterMult&&<div style={{textAlign:"center",padding:"3px",fontSize:"13px",color:S.yellow,background:"#ffcc0011",borderBottom:`1px solid ${S.border}`}}>{t.letterMultLabel}</div>}
            <div className="piilosana-hud" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 14px"}}>
              {gameTime!==0?(
              <div style={{display:"flex",alignItems:"baseline",gap:"8px",flex:1}}>
                <span style={{fontSize:"14px",color:S.textMuted,fontWeight:"600"}}>{t.time}</span>
                <span style={{fontSize:"28px",fontWeight:"700",color:time<=15?S.red:time<=30?S.yellow:S.green,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{fmt(time)}</span>
              </div>
              ):(
              <div style={{display:"flex",alignItems:"baseline",gap:"8px",flex:1}}>
                <span style={{fontSize:"14px",color:S.textMuted,fontWeight:"600"}}>{t.words.toUpperCase()}</span>
                <span style={{fontSize:"28px",fontWeight:"700",color:"#44ddff",lineHeight:1}}>{found.length}</span>
              </div>
              )}
              <div style={{display:"flex",alignItems:"baseline",gap:"8px",justifyContent:"flex-end",flex:1}}>
                <span style={{fontSize:"14px",color:S.textMuted,fontWeight:"600"}}>{t.score}</span>
                <span style={{fontSize:"28px",fontWeight:"700",color:S.yellow,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{score}</span>
              </div>
            </div>
            <div ref={wordBarRef} key={flashKey} style={{borderTop:S.cellGradient?`1px solid ${S.border}`:`1px solid ${S.border}`,padding:S.cellGradient?"10px 14px":"4px 10px",textAlign:"center",animation:"none",background:S.cellGradient?S.dark:"transparent",borderRadius:S.cellGradient?"0 0 12px 12px":"0"}}>
              <div style={{fontSize:S.cellGradient?"28px":"18px",minHeight:S.cellGradient?"36px":"20px",fontWeight:S.cellGradient?"700":"normal",letterSpacing:S.cellGradient?"3px":"0",animation:shake?"shake 0.4s":(!word&&msg?.ok?"scoreJump 0.4s ease-out":"none"),color:word?wordColor(word.length):undefined,transition:"all 0.15s ease"}}>
                {state==="ending"?<span style={{color:ending?.color,fontSize:S.cellGradient?"22px":"16px",animation:"pulse 1s infinite"}}>{ending?.emoji} {ending?.name}</span>:
                 word?word.toUpperCase():
                 (msg?<span style={{color:msg.ok?S.green:S.red,fontSize:msg.ok?(S.cellGradient?"16px":"12px"):(S.cellGradient?"14px":"10px"),fontWeight:msg.ok?"bold":"normal"}}>{msg.ok?`${msg.t?.toUpperCase()} +${msg.p}p${msg.combo>=3?` ${T[lang]?.combo||"COMBO"}!`:""}`:msg.m}</span>:<span style={{color:S.textMuted,fontSize:S.cellGradient?"20px":"18px"}}>···</span>)}
              </div>
            </div>
          </div>

          {/* Battle mode: flash when someone finds a word */}
          {gameMode==="battle"&&battleMsg&&state==="play"&&(
            <div style={{textAlign:"center",fontSize:"13px",padding:"4px 8px",marginBottom:"4px",background:battleMsg.finderId===playerId?"#00ff8822":"#ff66aa22",border:`1px solid ${battleMsg.finderId===playerId?S.green:"#ff66aa"}`,color:battleMsg.finderId===playerId?S.green:"#ff66aa",animation:"fadeIn 0.5s ease"}}>
              {battleMsg.finder}: {battleMsg.word.toUpperCase()} +{battleMsg.points}p
            </div>
          )}

          {combo>=2&&state==="play"&&(
            <div style={{textAlign:"center",fontSize:"13px",color:combo>=5?S.purple:combo>=3?S.yellow:S.green,marginBottom:"4px",animation:combo>=3?"epicPulse 0.5s infinite":"none"}}>
              {combo>=5?`${t.megaCombo} x${combo}!`:combo>=3?`${t.combo} x${combo}! (x2)`:`${combo} ${t.comboStreak}`}
            </div>
          )}

          {gameTime!==0&&(
          <div style={{height:"4px",background:S.dark,marginBottom:"6px",border:`1px solid ${S.border}`}}>
            <div style={{height:"100%",width:`${(time/gameTime)*100}%`,background:time<=15?S.red:time<=30?S.yellow:S.green,transition:"width 0.3s linear"}}/>
          </div>
          )}


          {/* GRID */}
          <div style={{position:"relative"}}>
            {soloMode==="hex"?(
            <div ref={gRef}
              onTouchMove={e=>{e.preventDefault();onDragMove(e.touches[0].clientX,e.touches[0].clientY);}}
              style={{padding:isLarge?"10px":"8px",background:S.gridBg||"#111133",
                border:`3px solid ${combo>=3&&state==="play"?S.yellow:ending?ending.color+"88":S.border}`,
                boxShadow:combo>=5?`0 0 30px ${S.purple}66`:combo>=3?`0 0 20px ${S.yellow}44`:`0 0 30px #22ccaa22`,
                touchAction:"none",position:"relative",borderRadius:"16px"}}>
              {grid.map((row,r)=>(
                <div key={r} style={{display:"flex",justifyContent:"center",gap:"3px",
                  marginTop:r>0?"-4.8%":"0",
                  paddingLeft:r%2===1?"8%":"0",paddingRight:r%2===0?"8%":"0",
                  position:"relative",zIndex:grid.length-r}}>
                  {row.map((letter,c)=>{
                    const s=isSel(r,c);
                    const last=sel.length>0&&sel[sel.length-1].r===r&&sel[sel.length-1].c===c;
                    const hexSz=grid.length;
                    const cellIdx=r*hexSz+c;
                    const eaten=eatenCells.has(cellIdx);
                    const endAnim=eaten&&ending?ending.cellAnim(cellIdx,hexSz*hexSz):"none";
                    const endColor=eaten&&ending?ending.cellColor(cellIdx):null;
                    const isScrambling=state==="scramble"||(state==="ending"&&scrambleGrid);
                    const settled=state==="scramble"&&scrambleStep>cellIdx;
                    const scrambleLetter=isScrambling&&scrambleGrid?scrambleGrid[r]?.[c]||letter:letter;
                    const displayLetter=isScrambling&&!settled&&scrambleGrid?scrambleLetter:letter;
                    const scrambleColor=isScrambling&&!settled?`hsl(${(cellIdx*37+scrambleStep*73)%360},70%,65%)`:null;
                    // Hex border color — high contrast across all themes
                    const hexBorderColor=s?S.green:(S.cellBorder||S.border);
                    return(
                      <div key={`${r}-${c}-${dropKey}`} data-c={`${r},${c}`}
                        onMouseDown={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                        onTouchStart={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                        style={{
                          width:"15.5%",aspectRatio:"0.866",
                          clipPath:"polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:isLarge?"clamp(24px,6vw,38px)":"clamp(20px,5.5vw,32px)",
                          fontFamily:S.letterFont,fontWeight:S.cellGradient?"700":"normal",
                          color:eaten?endColor||"transparent":scrambleColor||(s?(S.cellText||(S.cellGradient?"#e6eef8":"#ffffff")):(letterMult?letterColor(letter,lang):(S.cellText||(S.cellGradient?"#e6eef8":"#22ccaa")))),
                          background:eaten?(S.gridBg||"#111133"):last?`linear-gradient(160deg, ${S.yellow}cc 0%, ${S.yellow}88 50%, ${S.yellow}55 100%)`:s?`linear-gradient(160deg, ${S.green}40 0%, ${S.green}25 40%, ${S.green}15 100%)`:S.cellGradient?`linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)`:S.cell,
                          cursor:state==="play"?"pointer":"default",
                          transition:isScrambling?"color 0.07s, transform 0.15s, filter 0.15s":"all 0.2s ease",
                          textTransform:"uppercase",
                          textShadow:s?`0 0 12px ${S.green}88, 0 1px 3px #00000066`:(eaten?"none":S.cellGradient?`0 1px 2px #00000066`:`0 0 8px ${letterMult?letterColor(letter,lang):"#22ccaa"}44`),
                          filter:eaten?"none":`drop-shadow(0 0 1.5px ${hexBorderColor}) drop-shadow(0 0 0.5px ${hexBorderColor})`,
                          animation:eaten?endAnim:(isScrambling&&settled?"pop 0.2s ease":"none"),
                          transform:s?"scale(1.06)":"none",
                          "--ex":`${((c-2)*40)}px`,"--ey":`${((r-2)*40)}px`,
                          position:"relative",
                        }}>
                        {eaten?"":<>
                          {displayLetter}
                          {/* Liquid glass effect on selected cells */}
                          {s&&!isScrambling&&<span style={{position:"absolute",inset:0,
                            clipPath:"polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                            background:`linear-gradient(170deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 35%, transparent 50%, rgba(255,255,255,0.05) 65%, rgba(255,255,255,0.15) 100%)`,
                            pointerEvents:"none",zIndex:1}}/>}
                          {s&&!isScrambling&&<span style={{position:"absolute",top:"8%",left:"20%",width:"60%",height:"30%",
                            borderRadius:"50%",
                            background:`radial-gradient(ellipse, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.06) 60%, transparent 100%)`,
                            pointerEvents:"none",zIndex:2,filter:"blur(1px)"}}/>}
                          {letterMult&&!isScrambling&&<span style={{position:"absolute",bottom:"2px",right:"4px",fontSize:"clamp(8px,2vw,11px)",fontFamily:"'Press Start 2P',monospace",color:letterColor(letter,lang),opacity:0.7,lineHeight:1,zIndex:3}}>{getLetterValues(lang)[letter]||1}</span>}
                        </>}
                      </div>
                    );
                  })}
                </div>
              ))}
              {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true}/>}
            </div>
            ):(<>
            <div ref={gRef} className="piilosana-grid"
              onTouchMove={e=>{e.preventDefault();onDragMove(e.touches[0].clientX,e.touches[0].clientY);}}
              style={{display:"grid",gridTemplateColumns:`repeat(${soloMode==="chess"?CHESS_SZ:SZ},1fr)`,gap:soloMode==="chess"?"2px":(S.gridGap!=="0px"?S.gridGap:isLarge?"6px":"4px"),padding:soloMode==="chess"?"4px":(isLarge?"8px":"6px"),background:S.gridBg||"#111133",
                border:`3px solid ${combo>=3&&state==="play"?S.yellow:ending?ending.color+"88":S.border}`,
                boxShadow:combo>=5?`0 0 30px ${S.purple}66`:combo>=3?`0 0 20px ${S.yellow}44`:`0 0 30px ${S.green}22`,
                touchAction:"none",
                position:"relative",
                borderRadius:S.cellRadius!=="0px"?"16px":"0px"}}>
              {(soloMode==="chess"?chessGrid:mode==="multi"?currentMultiGrid:grid).map((row,r)=>row.map((letter,c)=>{
                const isChessMode=soloMode==="chess";
                const gridSz=isChessMode?CHESS_SZ:SZ;
                const s=isChessMode?false:isSel(r,c);
                const last=isChessMode?false:(sel.length>0&&sel[sel.length-1].r===r&&sel[sel.length-1].c===c);
                const cellIdx=r*gridSz+c;
                const totalCells=gridSz*gridSz;
                const eaten=eatenCells.has(cellIdx);
                const endAnim=eaten&&ending?ending.cellAnim(cellIdx,totalCells):"none";
                const endColor=eaten&&ending?ending.cellColor(cellIdx):null;
                // Chess: checkered pattern (light/dark squares)
                const chessSquareLight=isChessMode&&(r+c)%2===0;
                const chessBottomRow=isChessMode&&r===CHESS_SZ-1;
                // Scramble: show random letter or settled real letter
                const isScrambling=state==="scramble"||(state==="ending"&&scrambleGrid);
                const settled=state==="scramble"&&scrambleStep>cellIdx;
                const scrambleLetter=isScrambling&&scrambleGrid?scrambleGrid[r]?.[c]||letter:letter;
                const displayLetter=isScrambling&&!settled&&scrambleGrid?scrambleLetter:letter;
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
                // Tilt animation for modern theme
                const selIdx = s ? sel.findIndex(p=>p.r===r&&p.c===c) : -1;
                const selDir = selIdx > 0 ? {dr:r-sel[selIdx-1].r, dc:c-sel[selIdx-1].c} : null;
                const cellTransform = S.cellGradient && s ? (selDir ? `perspective(300px) rotateY(${selDir.dc*10}deg) rotateX(${-selDir.dr*10}deg) scale(1.06)` : `perspective(300px) scale(1.06)`) : isScrambling&&settled?"scale(1.1)":"none";
                // In tetris/battle mode, use dropKey in key to re-mount and animate
                const useDropAnim=(soloMode==="tetris"||gameMode==="battle")&&dropKey>0&&!eaten&&!s;
                // Scramble color: random hue for unsettled, green flash for just-settled
                const scrambleColor=isScrambling&&!settled?`hsl(${(cellIdx*37+scrambleStep*73)%360},70%,65%)`:null;
                // Chess mode: piece position, path, valid moves, invalid flash
                const isChess=soloMode==="chess"&&state==="play";
                const chessIsPos=isChess&&chessPos&&r===chessPos.r&&c===chessPos.c;
                const chessInPath=isChess&&chessPath.some(p=>p.r===r&&p.c===c);
                const chessIsValid=isChess&&chessValidCells.some(m=>m.r===r&&m.c===c)&&!chessInPath;
                const chessIsInvalid=isChess&&chessInvalid&&r===chessInvalid.r&&c===chessInvalid.c;
                return(
                  <div key={`${r}-${c}-${dropKey}`} data-c={`${r},${c}`}
                    onMouseDown={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                    onTouchStart={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                    style={{
                      width:"100%",aspectRatio:"1",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:isChessMode?"clamp(14px,4vw,22px)":(isLarge?"clamp(34px,10vw,56px)":"clamp(28px,8vw,48px)"),fontFamily:S.letterFont,fontWeight:S.cellGradient?"700":"normal",
                      letterSpacing:S.cellGradient?"1px":"0",
                      color:eaten?endColor||"transparent":scrambleColor||(chessIsPos?"#ddaa33":chessInPath?"#ddaa33":chessIsInvalid?"#ff4444":s?(S.cellTextSel||"#0f1720"):otherSelColor||(letterMult?letterColor(letter,lang):(S.cellText||(S.cellGradient?"#e6eef8":S.green)))),
                      background:eaten?(S.gridBg||"#111133"):chessIsPos?"#ddaa3355":chessInPath?"#ddaa3330":chessIsValid?"#ddaa3320":chessIsInvalid?"#ff444433":(isChessMode&&chessPlacing&&chessBottomRow)?"#ddaa3322":isChessMode?(chessSquareLight?"#2a2a3a":"#1a1a28"):last?S.yellow:s?S.green:otherSelColor?otherSelColor+"33":(soloMode==="bomb"&&bombCell&&r===bombCell.r&&c===bombCell.c)?`linear-gradient(135deg, #ff444433 0%, #ff880033 100%)`:(soloMode==="mystery"&&mysteryCell&&r===mysteryCell.r&&c===mysteryCell.c&&!mysteryRevealed)?`linear-gradient(135deg, #aa66ff33 0%, #6644ff33 100%)`:S.cellGradient?`linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)`:S.cell,
                      border:chessIsPos?`2px solid #ddaa33`:chessIsValid?`2px dashed #ddaa3366`:chessIsInvalid?`2px solid #ff4444`:chessInPath?`2px solid #ddaa3355`:S.cellGradient?`1px solid ${eaten?(S.gridBg||"#111133"):s?S.green:otherSelColor||S.cellBorder}`:`2px solid ${eaten?(S.gridBg||"#111133"):s?S.green:otherSelColor||S.cellBorder}`,
                      borderRadius:S.cellRadius,
                      cursor:state==="play"?(rotateActive?"grab":"pointer"):"default",transition:isScrambling?"color 0.07s, transform 0.15s":(S.cellGradient?"all 0.15s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)":"all 0.1s"),transform:cellTransform,
                      boxShadow:eaten?"none":isScrambling&&settled?`0 0 12px ${S.green}66`:(s?(S.cellGradient?`0 0 16px ${S.green}55, inset 0 0 8px ${S.green}22`:`0 0 12px ${S.green}66`):otherSelColor?`0 0 8px ${otherSelColor}44`:S.cellShadow),
                      textTransform:"uppercase",textShadow:isScrambling&&!settled?`0 0 8px ${scrambleColor}88`:(s||eaten?"none":S.cellGradient?`0 1px 2px #00000066`:`0 0 8px ${otherSelColor||(letterMult?letterColor(letter,lang):S.green)}44`),
                      animation:chessIsInvalid?"shake 0.3s ease":eaten?endAnim:useDropAnim?`cellDrop 0.3s ${c*0.03}s ease-out`:(rotateAnim&&((rotateAnim.type==="row"&&rotateAnim.idx===r)||(rotateAnim.type==="col"&&rotateAnim.idx===c)))?`${rotateAnim.type==="row"?(rotateAnim.dir>0?"rotateRowRight":"rotateRowLeft"):(rotateAnim.dir>0?"rotateColDown":"rotateColUp")} 0.3s ease-out`:(isScrambling&&settled?"pop 0.2s ease":"none"),
                      "--ex":`${((c-2)*40)}px`,"--ey":`${((r-2)*40)}px`,
                      position:"relative",
                    }}>
                    {eaten?"":<>
                      {/* Mystery mode: show ? for hidden cell */}
                      {soloMode==="mystery"&&mysteryCell&&r===mysteryCell.r&&c===mysteryCell.c&&!mysteryRevealed&&!isScrambling?"?":displayLetter}
                      {/* Chess: glass piece overlay on current position — letter shows through */}
                      {chessIsPos&&chessPiece&&!isScrambling&&(()=>{
                        const hasAnim=chessAnimFrom&&(chessAnimFrom.r!==r||chessAnimFrom.c!==c);
                        const dx=hasAnim?`${(chessAnimFrom.c-c)*100}%`:"0";
                        const dy=hasAnim?`${(chessAnimFrom.r-r)*100}%`:"0";
                        return <span style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"clamp(20px,6vw,34px)",lineHeight:1,zIndex:2,pointerEvents:"none",
                          color:"transparent",WebkitTextStroke:"1.5px rgba(255,255,255,0.8)",
                          filter:"drop-shadow(0 0 8px #ddaa3388) drop-shadow(0 1px 2px #000a)",
                          background:"radial-gradient(circle, rgba(221,170,51,0.15) 0%, rgba(221,170,51,0.05) 70%, transparent 100%)",
                          borderRadius:"inherit",
                          "--chess-dx":dx,"--chess-dy":dy,
                          animation:hasAnim?"chessArrive 0.25s cubic-bezier(0.22,1,0.36,1)":"none",
                        }}>{CHESS_EMOJI[chessPiece]}</span>;
                      })()}
                      {/* Chess: dot on valid moves */}
                      {chessIsValid&&!isScrambling&&<span style={{position:"absolute",width:"clamp(6px,2vw,10px)",height:"clamp(6px,2vw,10px)",borderRadius:"50%",background:"#ddaa33",opacity:0.5,zIndex:1,pointerEvents:"none"}}/>}
                      {/* Chess: placing phase — glow on bottom row cells */}
                      {isChessMode&&chessPlacing&&chessBottomRow&&!isScrambling&&<span style={{position:"absolute",inset:0,borderRadius:"inherit",boxShadow:"inset 0 0 10px #ddaa3355, 0 0 6px #ddaa3333",pointerEvents:"none"}}/>}
                      {letterMult&&!isScrambling&&<span style={{position:"absolute",bottom:"1px",right:"3px",fontSize:"clamp(9px,2.5vw,13px)",fontFamily:"'Press Start 2P',monospace",color:letterColor(letter,lang),opacity:0.7,lineHeight:1}}>{getLetterValues(lang)[letter]||1}</span>}
                      {/* Bomb indicator */}
                      {soloMode==="bomb"&&bombCell&&r===bombCell.r&&c===bombCell.c&&!isScrambling&&<span style={{position:"absolute",top:"-2px",right:"-2px",fontSize:"clamp(10px,3vw,16px)",animation:bombTimer<=5?"epicPulse 0.4s infinite":"none",lineHeight:1}}>💣</span>}
                      {/* Mystery sparkle on revealed */}
                      {soloMode==="mystery"&&mysteryCell&&r===mysteryCell.r&&c===mysteryCell.c&&mysteryRevealed&&!isScrambling&&<span style={{position:"absolute",top:"-2px",right:"-2px",fontSize:"clamp(10px,3vw,16px)",animation:"pop 0.3s ease",lineHeight:1}}>✨</span>}
                    </>}
                  </div>
                );
              }))}
            </div>
            {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true}/>}
            {/* Rotate mode: visual overlay when in rotate-active state */}
            {soloMode==="rotate"&&state==="play"&&rotateActive&&(
              <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:10,
                border:"3px solid #ff9900",borderRadius:S.cellRadius!=="0px"?"16px":"0px",
                boxShadow:"inset 0 0 20px #ff990033, 0 0 20px #ff990022"}}/>
            )}
            </>)}
          </div>

          {state==="play"&&(
            <div className="piilosana-found" style={{marginTop:"8px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,maxHeight:"120px",overflowY:"auto"}}>
              <div style={{fontSize:"13px",color:S.textMuted,marginBottom:"4px"}}>{(gameMode==="battle"||(mode==="solo"&&(soloMode==="tetris"||soloMode==="rotate"||soloMode==="chess")))?`${t.found} (${found.length})`:`${t.found} (${found.length}/${valid.size}) ${valid.size>0?Math.round(found.length/valid.size*100):0}%`}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {found.length===0?<span style={{fontSize:"18px",color:S.textMuted}}>{t.dragWords}</span>:
                  found.map((w,i)=>(
                    <span key={i} style={{fontSize:"18px",background:S.dark,padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length),animation:i===found.length-1?"pop 0.3s ease":"none"}}>
                      {w.toUpperCase()} +{letterMult?ptsLetters(w,lang):pts(w.length)}
                    </span>
                  ))
                }
              </div>
            </div>
          )}

          {/* Glassmorphic chat overlay - multiplayer only */}
          {(mode==="public"||mode==="multi")&&state==="play"&&socket&&!chatHidden&&(
            <div style={{position:"fixed",bottom:"16px",right:"16px",zIndex:100,
              width:"clamp(180px,30vw,220px)",
              background:"rgba(15,20,35,0.55)",
              backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
              border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:"18px",
              boxShadow:"0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              overflow:"hidden",
              animation:"fadeIn 0.4s ease"}}>
              {/* Glass light reflection */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:"40%",
                background:"linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 60%, transparent 100%)",
                borderRadius:"18px 18px 0 0",pointerEvents:"none"}}/>
              {/* Header with close */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px 4px",position:"relative",zIndex:1}}>
                <button onClick={()=>emojiOpen==="open"?closeEmojiPicker():setEmojiOpen("open")}
                  style={{fontSize:"16px",padding:"4px 10px",background:emojiOpen?"rgba(255,255,255,0.12)":"transparent",
                  border:"1px solid rgba(255,255,255,0.15)",borderRadius:"12px",cursor:"pointer",lineHeight:1,
                  transition:"all 0.15s",color:S.green,fontFamily:S.font,fontSize:"12px",display:"flex",alignItems:"center",gap:"4px"}}
                >💬</button>
                <button onClick={()=>setChatHidden(true)}
                  style={{fontSize:"11px",padding:"2px 6px",background:"transparent",border:"none",cursor:"pointer",
                  color:"rgba(255,255,255,0.4)",fontFamily:S.font,transition:"color 0.15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,255,255,0.8)";}}
                  onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.4)";}}
                >✕</button>
              </div>
              {/* Emoji picker */}
              {emojiOpen&&(
                <div style={{padding:"4px 8px 8px",position:"relative",zIndex:1,
                  animation:"fadeIn 0.2s ease"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"2px"}}>
                    {["😀","😎","🤔","😮","🔥","💪","🎯","👀","😭","🤣","😱","🥳","👏","❤️","💀","🫡"].map(em=>(
                      <button key={em} onClick={()=>{socket.emit("emoji_reaction",{emoji:em});closeEmojiPicker();}}
                        style={{fontSize:"18px",padding:"5px",background:"transparent",border:"none",borderRadius:"8px",cursor:"pointer",lineHeight:1,
                        transition:"transform 0.12s, background 0.12s"}}
                        onMouseDown={e=>{e.currentTarget.style.transform="scale(1.2)";e.currentTarget.style.background="rgba(255,255,255,0.1)";}}
                        onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}
                        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}
                        onTouchStart={e=>{e.currentTarget.style.transform="scale(1.2)";e.currentTarget.style.background="rgba(255,255,255,0.1)";}}
                        onTouchEnd={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}>{em}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Chat feed */}
              {emojiFeed.length>0&&(
                <div style={{padding:"0 8px 8px",maxHeight:"120px",overflowY:"auto",position:"relative",zIndex:1}}>
                  {emojiFeed.map(e=>(
                    <div key={e.id} style={{
                      display:"flex",alignItems:"center",gap:"6px",
                      padding:"4px 8px",marginBottom:"3px",
                      background:"rgba(255,255,255,0.06)",
                      borderRadius:"10px",
                      animation:e.fading?"chatFadeOut 0.8s ease forwards":"chatSlideIn 0.3s ease-out"}}>
                      <span style={{fontSize:"11px",fontWeight:"600",color:S.green,fontFamily:S.font,whiteSpace:"nowrap",opacity:0.9}}>{e.nickname}</span>
                      <span style={{fontSize:"20px",lineHeight:1}}>{e.emoji}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Chat hidden - small reopen button */}
          {(mode==="public"||mode==="multi")&&state==="play"&&socket&&chatHidden&&(
            <button onClick={()=>setChatHidden(false)}
              style={{position:"fixed",bottom:"16px",right:"16px",zIndex:100,
                fontSize:"16px",padding:"8px",lineHeight:1,
                background:"rgba(15,20,35,0.45)",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
                border:"1px solid rgba(255,255,255,0.1)",borderRadius:"14px",cursor:"pointer",
                boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
                transition:"all 0.2s",opacity:0.6}}
              onMouseEnter={e=>{e.currentTarget.style.opacity="1";}}
              onMouseLeave={e=>{e.currentTarget.style.opacity="0.6";}}
            >💬</button>
          )}

          {/* Unlimited mode: refresh + end buttons */}
          {state==="play"&&mode==="solo"&&gameTime===0&&(
            <div style={{display:"flex",gap:"8px",marginTop:"8px"}}>
              <button onClick={refreshGrid} style={{fontFamily:S.font,fontSize:"13px",color:"#44ddff",background:"transparent",border:"2px solid #44ddff",padding:"10px 16px",cursor:"pointer",flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><Icon icon="refresh" color="#44ddff" size={2}/>{t.newLetters}</button>
              <button onClick={endUnlimited} style={{fontFamily:S.font,fontSize:"13px",color:S.red,background:"transparent",border:`2px solid ${S.red}`,padding:"10px 16px",cursor:"pointer",flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"6px"}}><Icon icon="stop" color={S.red} size={2}/>{t.stop}</button>
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
            <div style={{fontSize:"13px",color:S.textMuted,marginBottom:"10px"}}>{t.score}</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}{(soloMode==="normal"&&gameTime!==0)?<span style={{fontSize:"16px",color:S.textMuted}}> / {totalPossible}</span>:null}</div>
            {(soloMode!=="normal"||gameTime===0)?<div style={{fontSize:"13px",color:S.textMuted,marginTop:"6px"}}>{found.length} {t.words}</div>:<>
            <div style={{fontSize:"13px",color:S.textSoft,marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            </>}

            {/* Hall of Fame submit */}
            {gameTime!==0&&score>0&&!hofSubmitted&&(
              <div style={{marginTop:"12px",padding:"10px",border:`1px solid ${S.yellow}44`,background:"#ffcc0008"}}>
                {soloNickname.trim()?(
                  <button onClick={async()=>{
                    await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                      wordsTotal:valid.size,gameMode:soloMode,gameTime,lang});
                    setHofSubmitted(true);
                  }} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"8px 16px",cursor:"pointer"}}>
                    {t.saveAs} {soloNickname.trim()}
                  </button>
                ):(
                  <>
                    <div style={{fontSize:"13px",color:S.yellow,marginBottom:"6px"}}>{t.saveToHof}</div>
                    <div style={{display:"flex",gap:"6px",justifyContent:"center",alignItems:"center"}}>
                      <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
                        placeholder={t.nickname} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:S.dark,
                        border:`2px solid ${S.green}`,padding:"8px",width:"140px",textAlign:"center",outline:"none"}}/>
                      <button onClick={async()=>{
                        if(!soloNickname.trim())return;
                        await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                          wordsTotal:valid.size,gameMode:soloMode,gameTime,lang});
                        setHofSubmitted(true);
                      }} disabled={!soloNickname.trim()}
                        style={{fontFamily:S.font,fontSize:"13px",color:soloNickname.trim()?S.bg:S.textMuted,
                        background:soloNickname.trim()?S.yellow:S.border,border:"none",padding:"8px 12px",cursor:soloNickname.trim()?"pointer":"default"}}>
                        {t.save}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {hofSubmitted&&<div style={{fontSize:"13px",color:S.green,marginTop:"8px"}}>{t.saved}</div>}

            {/* Share result */}
            <button onClick={async()=>{
              const text=t.shareText.replace("{words}",found.length).replace("{score}",score)+"\nhttps://piilosana.up.railway.app";
              if(navigator.share){try{await navigator.share({text});return;}catch{}}
              try{await navigator.clipboard.writeText(text);addPopup(t.shareCopied,S.green);}catch{}
            }} style={{fontFamily:S.font,fontSize:"13px",color:"#44ddff",border:"2px solid #44ddff",background:"transparent",
              padding:"8px 16px",cursor:"pointer",marginTop:"10px",width:"280px"}}>
              {t.share}
            </button>

            <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center",marginTop:"10px"}}>
              <button onClick={()=>{setHofSubmitted(false);start();}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>{t.newPractice}</button>
              <button onClick={switchToMulti} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>{t.customGame}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>{t.menu}</button>
            </div>
          </div>

          {found.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"18px",color:S.green,marginBottom:"6px"}}>{t.foundOf} ({found.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {[...found].sort((a,b)=>b.length-a.length).map((w,i)=>(
                  <span key={i} style={{fontSize:"18px",background:S.dark,padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {soloMode==="normal"&&gameTime!==0&&missed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>{t.missed} ({missed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {missed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:S.dark,padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
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


      {/* Ivory Light — warm golden shimmer */}
      {themeId==="light"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"-20%",right:"-10%",width:"60%",height:"60%",
            background:"radial-gradient(ellipse at center,rgba(184,134,11,0.06) 0%,transparent 70%)",
            animation:"floatUnicorn 12s ease-in-out infinite"}}/>
          <div style={{position:"absolute",bottom:"-10%",left:"-10%",width:"50%",height:"50%",
            background:"radial-gradient(ellipse at center,rgba(45,106,79,0.04) 0%,transparent 70%)",
            animation:"floatUnicorn 10s ease-in-out infinite 3s"}}/>
        </div>
      )}

      {/* Dark Velvet — subtle purple mist */}
      {themeId==="dark"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:"130%",height:"130%",
            background:"radial-gradient(ellipse at 30% 40%,rgba(179,157,219,0.05) 0%,transparent 55%),radial-gradient(ellipse at 70% 60%,rgba(206,147,216,0.04) 0%,transparent 50%)",
            animation:"electricPulse 8s ease-in-out infinite"}}/>
        </div>
      )}

      {/* Pink Blush — floating hearts & sparkles */}
      {themeId==="pink"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"10%",left:"5%",fontSize:"28px",opacity:0.08,animation:"floatUnicorn 8s ease-in-out infinite"}}>💖</div>
          <div style={{position:"absolute",top:"30%",right:"8%",fontSize:"22px",opacity:0.06,animation:"floatUnicorn 10s ease-in-out infinite 2s"}}>🌸</div>
          <div style={{position:"absolute",bottom:"20%",left:"10%",fontSize:"24px",opacity:0.06,animation:"floatUnicorn 9s ease-in-out infinite 4s"}}>✨</div>
          <div style={{position:"absolute",top:"60%",right:"5%",fontSize:"22px",opacity:0.05,animation:"floatUnicorn 11s ease-in-out infinite 1s"}}>💗</div>
        </div>
      )}

      {/* Electric Blue — pulsing cyan glow */}
      {themeId==="electric"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:"120%",height:"120%",
            background:"radial-gradient(ellipse at center,rgba(0,229,255,0.06) 0%,transparent 60%)",
            animation:"electricPulse 3s ease-in-out infinite"}}/>
          <div style={{position:"absolute",top:"20%",left:"10%",width:"40%",height:"40%",
            background:"radial-gradient(ellipse at center,rgba(118,255,3,0.03) 0%,transparent 60%)",
            animation:"electricPulse 5s ease-in-out infinite 1.5s"}}/>
        </div>
      )}

      {/* Retro — scanlines + neon glow */}
      {themeId==="retro"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",
            background:"repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,255,136,0.015) 3px,rgba(0,255,136,0.015) 4px)"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",
            width:"100%",height:"100%",
            background:"radial-gradient(ellipse at center,rgba(0,255,136,0.05) 0%,transparent 65%)"}}/>
        </div>
      )}
    </div>
  );
}
