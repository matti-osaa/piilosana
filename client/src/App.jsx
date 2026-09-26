import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { io } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";
import DEFS_FI from "./defs_fi.js";
import { menuColors } from "./menuColors.js";
import { useAudioSystem } from "./hooks/useAudioSystem.js";
import { StreakWarning } from "./components/StreakWarning.jsx";
import { DailyEndResult } from "./components/DailyEndResult.jsx";
import { MenuFooter } from "./components/MenuFooter.jsx";
import { PracticeOptionsModal } from "./components/PracticeOptionsModal.jsx";
import { GlossyButton, GLOSSY } from "./components/GlossyButton.jsx";
import { SHAPES, randomShape, getBoard, makeBoardGrid, findWordsOnBoard, gridFitsBoard } from "./boards.js";
import { ShapeBoard } from "./components/ShapeBoard.jsx";
import { heroPanel, sectionPanel, sectionTitle, wordChip, alpha } from "./components/panelStyle.js";
import { ResultsScreen as ResultsScreenView } from "./components/ResultsScreen.jsx";
import { HelpModal } from "./components/HelpModal.jsx";
import { InflectionModal } from "./components/InflectionModal.jsx";
import { WordInfoModal } from "./components/WordInfoModal.jsx";
import { AchievementsModal } from "./components/AchievementsModal.jsx";
import { HamburgerMenu } from "./components/HamburgerMenu.jsx";
import { AuthPanel } from "./components/AuthPanel.jsx";
import { LobbyEnterName, LobbyChoose, LobbyWaiting } from "./components/MultiplayerLobby.jsx";
import { THEMES, getTheme, fontCSS } from "./lib/themes.js";
import { LANG_CONFIG, loadWords, getLangConf, EMPTY_SET, EMPTY_TRIE, randLetterLang, makeGrid, findWordsHex, findWords, ptsLetters, pts, adjHex, letterColor, getLetterValues } from "./lib/wordEngine.js";
import { getDailyResult, todayStr, getDailyResultForDate, getDailyTheme, seededRng, dailySeed, countThemeWords, dateLabel, getDailyStreak, DAILY_THEME_BONUS, saveDailyResult, updateDailyStreak, isThemeWord, DAILY_THEME_THRESHOLD } from "./lib/daily.js";
import { SERVER_URL, DAILY_ENABLED, VERSION } from "./lib/config.js";
import { INITIAL_STATS, ACHIEVEMENTS } from "./lib/achievements.js";
import { T } from "./lib/i18n.js";
import { WORD_THEMES, pickBombCell, pickMysteryCell, randomChessPiece, scrambleArea, rotateRow, rotateCol, chessValidMoves, CHESS_MULT, CHESS_EMOJI, applyGravityClient, CHESS_NAMES } from "./lib/gridMechanics.js";
import { ENDINGS, EndingOverlay, endingDesc } from "./components/EndingOverlay.jsx";
import { ModernIcon, PixelIcon, PixelFlag } from "./components/PixelArt.jsx";
import { DailyPopup } from "./components/DailyPopup.jsx";
import { AdBanner } from "./components/AdBanner.jsx";
import { ConfettiCelebration, ScorePopup, WordPopup } from "./components/GameEffects.jsx";
import { QuickTutorial } from "./components/QuickTutorial.jsx";
import { TitleDemo, TITLE_CONFIG, titleColor, titleShadow } from "./components/TitleDemo.jsx";
import { HallOfFame, submitToHallOfFame } from "./components/HallOfFame.jsx";

// ============================================
// SANAPIILO - Finnish Word Hunt Game
// ============================================


// ============================================
// MAIN COMPONENT
// ============================================
export default function Piilosana(){
  const SZ=5,HEX_ROWS=7,HEX_COLS=5,COMBO_WINDOW=4000;
  const[lang,setLang]=useState(()=>localStorage.getItem("piilosana_lang")||"fi");
  const[themeId,setThemeId]=useState(()=>{const saved=localStorage.getItem("piilosana_theme");return saved&&THEMES[saved]?saved:"light";});
  const[uiSize,setUiSize]=useState(()=>localStorage.getItem("piilosana_size")||"normal");
  const[confettiOn,setConfettiOn]=useState(()=>localStorage.getItem("piilosana_confetti")!=="off");
  const audio = useAudioSystem();
  const { sounds, soundTheme, musicOn, musicTrack, audioStarted,
          setSoundTheme, setMusicOn, setMusicTrack, music, musicTracks } = audio;
  const[updateAvailable,setUpdateAvailable]=useState(false);
  const[wordsLoaded,setWordsLoaded]=useState(()=>({fi:LANG_CONFIG.fi.loaded,en:LANG_CONFIG.en.loaded,sv:LANG_CONFIG.sv.loaded}));
  useEffect(()=>{
    let mounted=true;
    Promise.all([loadWords("fi"),loadWords("en"),loadWords("sv")]).then(()=>{
      if(mounted)setWordsLoaded({fi:true,en:true,sv:true});
    });
    // Also update as each individual language loads
    loadWords("fi").then(()=>{if(mounted)setWordsLoaded(p=>({...p,fi:true}));});
    loadWords("en").then(()=>{if(mounted)setWordsLoaded(p=>({...p,en:true}));});
    loadWords("sv").then(()=>{if(mounted)setWordsLoaded(p=>({...p,sv:true}));});
    return()=>{mounted=false;};
  },[]);
  // Version polling — detect deploys, show update banner
  useEffect(()=>{
    let v0=null,mounted=true;
    const check=()=>fetch('/api/version').then(r=>r.json()).then(d=>{
      if(!mounted)return;
      if(!v0)v0=d.version;
      else if(d.version!==v0)setUpdateAvailable(true);
    }).catch(()=>{});
    check();
    const iv=setInterval(check,3*60*1000); // every 3 min
    return()=>{mounted=false;clearInterval(iv);};
  },[]);
  const currentLangLoaded=wordsLoaded[lang]||false;
  const[showSettings,setShowSettings]=useState(false);
  const[showMenuOptions,setShowMenuOptions]=useState(false);
  const[flagBubble,setFlagBubble]=useState(false);
  const[flagBubbleFading,setFlagBubbleFading]=useState(false);
  const[showWordInfo,setShowWordInfo]=useState(false);
  const[showHelp,setShowHelp]=useState(false);
  const[showInflection,setShowInflection]=useState(false);
  // Pikaohje näytetään automaattisesti ensimmäisellä käynnillä, sen jälkeen vain ?-napista.
  const[showTutorial,setShowTutorial]=useState(()=>{
    try{return !localStorage.getItem("piilosana_tutorial_seen");}catch{return false;}
  });
  const closeTutorial=useCallback(()=>{
    setShowTutorial(false);
    try{localStorage.setItem("piilosana_tutorial_seen","1");}catch{}
  },[]);
  const[dailyMode,setDailyMode]=useState(false);
  const[dailyTheme,setDailyTheme]=useState(null);
  const[dailyThemeFound,setDailyThemeFound]=useState([]); // stems of theme words found in daily
  const[dailyThemeBonusGiven,setDailyThemeBonusGiven]=useState(false);
  const[dailyResult,setDailyResult]=useState(()=>getDailyResult(lang));
  // Refresh daily result when language changes
  useEffect(()=>{setDailyResult(getDailyResult(lang));},[lang]);
  const[dailyShareMsg,setDailyShareMsg]=useState(null);
  const[showDailyHistory,setShowDailyHistory]=useState(null); // date string or null
  const[showExitConfirm,setShowExitConfirm]=useState(false);
  const[showHamburger,setShowHamburger]=useState(false);
  const[muteEmojis,setMuteEmojis]=useState(()=>localStorage.getItem("piilosana_mute_emoji")==="on");
  const muteEmojisRef=useRef(muteEmojis);
  useEffect(()=>{muteEmojisRef.current=muteEmojis;},[muteEmojis]);
  const[themeTransition,setThemeTransition]=useState(false);
  const themeInitRef=useRef(true);
  useEffect(()=>{if(themeInitRef.current){themeInitRef.current=false;return;}setThemeTransition(true);const t=setTimeout(()=>setThemeTransition(false),700);return()=>clearTimeout(t);},[themeId]);

  // Auth state
  const[authUser,setAuthUser]=useState(()=>{
    try{const s=localStorage.getItem("piilosana_auth");return s?JSON.parse(s):null;}catch{return null;}
  });
  const[showAuth,setShowAuth]=useState(false);
  const[firstTimePhase,setFirstTimePhase]=useState("wait"); // "wait" | "in" | "out"
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
    if(s.sound){const snd=s.sound==="modern"||s.sound==="off"?s.sound:"modern";setSoundTheme(snd);localStorage.setItem("piilosana_sound",snd);}
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
  // Re-derive when wordsLoaded changes (lazy loading completes)
  const WORDS_SET=currentLangLoaded?langConf.words:EMPTY_SET;
  const trie=useMemo(()=>currentLangLoaded?langConf.trie:EMPTY_TRIE,[lang,currentLangLoaded]);
  const t=T[lang]||T.fi;
  const isLarge=uiSize==="large";

  // Game settings (must be declared before states that reference them)
  const[gameTime,setGameTime]=useState(120); // 120 (2min) or 402 (6min 42s = "6,7")
  const[letterMult,setLetterMult]=useState(false); // scrabble-style letter values
  const[soloMode,setSoloMode]=useState("hex"); // 'hex' is the default and only visible mode
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
  const[scrambleStyle,setScrambleStyle]=useState("random"); // intro animation variant
  const[settledCells,setSettledCells]=useState(new Set()); // which cells have settled during wave/spiral/rain
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
  const[pendingDeepLink,setPendingDeepLink]=useState(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.has("arena"))return{type:"arena"};
    if(p.get("room"))return{type:"room",code:p.get("room").toUpperCase()};
    return null;
  });
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
  // Deep link handling: ?arena or ?room=XXXX
  useEffect(()=>{
    if(!pendingDeepLink)return;
    // Clean URL without reload
    window.history.replaceState({},"",window.location.pathname);
    if(pendingDeepLink.type==="arena"){
      setMode("public");
      if(authUser){setPublicState("waiting");}else{setPublicState("nickname");}
    }else if(pendingDeepLink.type==="room"){
      setMode("multi");
      if(authUser){setNickname(authUser.nickname);setLobbyState("choose");}else{setLobbyState("enter_name");}
      setRoomCode(pendingDeepLink.code);
    }
    setPendingDeepLink(null);
  },[]);

  const[players,setPlayers]=useState([]);
  const[playerId,setPlayerId]=useState(null);
  const[isHost,setIsHost]=useState(false);
  const[multiScores,setMultiScores]=useState([]);
  const[multiRankings,setMultiRankings]=useState(null);
  const[lobbyState,setLobbyState]=useState("enter_name");
  const[lobbyError,setLobbyError]=useState("");
  const[linkCopied,setLinkCopied]=useState(false);
  const[showSharePopup,setShowSharePopup]=useState(false);
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
  const[publicHex,setPublicHex]=useState(false);
  // Laudan muoto: "hex" = vanha kuusikulmiopiirto, muut piirretään ShapeBoardilla.
  // Online/moninpeli: palvelin/isäntä arpoo. Harjoittelu: practiceShape ("random" tai muoto). Päivän peli: aina hex.
  const[boardShape,setBoardShapeState]=useState("hex");
  const boardShapeRef=useRef("hex");
  const setBoardShape=useCallback((sh)=>{const v=SHAPES.includes(sh)?sh:"hex";boardShapeRef.current=v;setBoardShapeState(v);},[]);
  const[practiceShape,setPracticeShape]=useState(()=>{try{return localStorage.getItem("piilosana_shape")||"random";}catch{return "random";}});
  const shapeBoard=boardShape!=="hex"?getBoard(boardShape):null;
  // Satunnainen kirjainruudukko nykyiselle laudalle (sekoitusanimaatiot)
  const randGridForShape=useCallback((sh)=>sh&&sh!=="hex"?makeBoardGrid(sh,()=>randLetterLang(lang)):makeGrid(HEX_ROWS,lang,HEX_COLS),[lang]);

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
  // Peliruudun sovitus näkymän korkeuteen: jos HUD + ruudukko + löydetyt sanat eivät mahdu
  // ikkunaan (esim. leveä mutta matala auton selain), kavennetaan pelialuetta niin että
  // kaikki mahtuu ilman vieritystä. Ruudukon korkeus seuraa leveyttä (prosenttipohjaiset solut).
  const playRef=useRef(null);
  const PLAY_MAX_W=600,PLAY_MIN_W=200;
  const[playMaxWidth,setPlayMaxWidth]=useState(PLAY_MAX_W);
  const wordBarRef=useRef(null);
  const tRef=useRef(null);
  const nicknameRef=useRef(null);
  const popupIdRef=useRef(0);
  const lastSubmittedWordRef=useRef("");
  const foundRef=useRef([]);

  // Keep foundRef in sync with found state (avoids stale closure in socket handlers)
  useEffect(()=>{foundRef.current=found;},[found]);

  // Kielilippuvinkki näytetään hetken alkuvalikossa
  useEffect(()=>{
    if(mode!==null){setFlagBubble(false);setFlagBubbleFading(false);return;}
    if(sessionStorage.getItem("piilosana_flag_bubble_shown"))return;
    const t4=setTimeout(()=>setFlagBubble(true),8500);
    const t5=setTimeout(()=>setFlagBubbleFading(true),12500);
    const t6=setTimeout(()=>{setFlagBubble(false);setFlagBubbleFading(false);sessionStorage.setItem("piilosana_flag_bubble_shown","1");},13500);
    return()=>{clearTimeout(t4);clearTimeout(t5);clearTimeout(t6);};
  },[mode]);

  // (arena count polling handled above via /api/arena-count)


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
    const popDuration=word.length>=10?2000:word.length>=8?1600:1300;
    setTimeout(()=>setWordPopups(p=>p.filter(pp=>pp.id!==id)),popDuration);
  },[]);

  const startSolo=useCallback(async(overrideMode,overrideTime)=>{
    // Ensure word list is loaded before starting
    if(!LANG_CONFIG[lang].loaded){await loadWords(lang);setWordsLoaded(p=>({...p,[lang]:true}));}
    sounds.init().catch(()=>{});
    const gt=overrideTime!==undefined?overrideTime:gameTime;
    const sm=overrideMode!==undefined?overrideMode:soloMode;
    let bg=null,bw=new Set();
    // Harjoittelussa muodon saa valita; "random" arpoo
    const shape=sm==="hex"?(practiceShape==="random"||!SHAPES.includes(practiceShape)?randomShape():practiceShape):"hex";
    setBoardShape(shape);
    const useBoard=sm==="hex"&&shape!=="hex";
    for(let i=0;i<50;i++){const g=useBoard?makeBoardGrid(shape,()=>randLetterLang(lang)):sm==="hex"?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(SZ,lang);const w=useBoard?findWordsOnBoard(g,trie,shape):(sm==="hex"?findWordsHex:findWords)(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=(sm==="hex"?25:15))break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setTime(gt);setScore(0);setMsg(null);
    // Fetch long words (11-15 chars) from server in background
    if(lang==="fi"&&bg){fetch(`${SERVER_URL}/api/find-long-words`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grid:bg,hex:sm==="hex",shape:sm==="hex"?shape:undefined})}).then(r=>r.json()).then(({words})=>{if(words&&words.length>0)setValid(prev=>{const n=new Set(prev);words.forEach(w=>n.add(w));return n;});}).catch(()=>{});}
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

    setMode("solo");setCountdown(3);setState("countdown");
    if(overrideMode!==undefined)setSoloMode(overrideMode);
    if(overrideTime!==undefined)setGameTime(overrideTime);
    window.scrollTo(0,0);
  },[trie,sounds,gameTime,soloMode,lang,practiceShape,setBoardShape]);

  const[dailyDate,setDailyDate]=useState(todayStr()); // which date's daily we're playing
  const startDaily=useCallback(async(forDate)=>{
    const playDate=forDate||todayStr();
    if(getDailyResultForDate(playDate,lang))return; // already played this date
    // Only allow today and past 6 days (compare in Finnish timezone)
    const today=todayStr();
    const dayDiff=Math.floor((new Date(today+"T12:00:00Z").getTime()-new Date(playDate+"T12:00:00Z").getTime())/(86400000));
    if(dayDiff<0)return; // can't play future
    if(dayDiff>6)return; // too old
    if(!LANG_CONFIG[lang].loaded){await loadWords(lang);setWordsLoaded(p=>({...p,[lang]:true}));}
    sounds.init().catch(()=>{});
    // Pick today's theme deterministically
    const theme=getDailyTheme(playDate,lang);
    // Generate grids, prefer ones with more theme words (while still ensuring good total word count)
    let bg=null,bw=new Set(),bestThemeCount=0;
    for(let i=0;i<50;i++){
      const rng=seededRng(dailySeed(playDate+lang+i));
      const g=makeGrid(7,lang,5,rng);
      const w=findWordsHex(g,trie);
      const tc=countThemeWords(w,theme);
      // Prefer grids with more theme words, but require decent total word count
      if(w.size>=15&&(tc>bestThemeCount||(tc===bestThemeCount&&w.size>bw.size))){bg=g;bw=w;bestThemeCount=tc;}
      else if(!bg&&w.size>bw.size){bg=g;bw=w;}
      if(w.size>=25&&tc>=5)break;
    }
    if(!bg){const rng=seededRng(dailySeed(playDate+lang));bg=makeGrid(7,lang,5,rng);bw=findWordsHex(bg,trie);}
    setDailyTheme(theme);
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setTime(180);setScore(0);setMsg(null);
    setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);
    setEnding(null);setEndingProgress(0);setDropKey(0);
    setActiveTheme(null);setThemeFound([]);setBombCell(null);setBombTimer(0);
    setMysteryCell(null);setMysteryRevealed(false);
    setChessPiece(null);setChessPos(null);setChessPath([]);setChessWord("");setChessValidCells([]);setChessInvalid(null);setChessMoves(0);setChessGrid([]);setChessPlacing(false);
    setDailyMode(true);setDailyDate(playDate);setDailyThemeFound([]);setDailyThemeBonusGiven(false);
    setSoloMode("hex");setBoardShape("hex");setGameTime(180);
    setMode("solo");setCountdown(3);setState("countdown");
    window.scrollTo(0,0);
    if(lang==="fi"&&bg){fetch(`${SERVER_URL}/api/find-long-words`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grid:bg,hex:true})}).then(r=>r.json()).then(({words})=>{if(words&&words.length>0)setValid(prev=>{const n=new Set(prev);words.forEach(w=>n.add(w));return n;});}).catch(()=>{});}
  },[trie,sounds,lang]);

  const shareDailyResult=useCallback(()=>{
    const dr=getDailyResult(lang)||getDailyResultForDate(dailyDate,lang);if(!dr)return;
    const dl=dateLabel(dr.date,lang);
    const pct=dr.totalWords>0?Math.round(dr.wordsFound/dr.totalWords*100):0;
    const streak=getDailyStreak(lang);
    const themeStr=dailyTheme?` (${dailyTheme.name})`:"";
    const bonusStr=dailyThemeBonusGiven?` 🎯 Teemabonus +${DAILY_THEME_BONUS}p!`:"";
    const text=`Sain ${dl.full} Sanapiilossa${themeStr} ${dr.score} pistettä (${dr.wordsFound}/${dr.totalWords} sanaa)!${bonusStr} Pystytkö parempaan?${streak.streak>1?` 🔥 ${streak.streak} päivää putkeen!`:""}\n\nPelaa: https://piilosana.com`;
    if(navigator.share){navigator.share({title:`Päivän Sanapiilo – ${dl.full}`,text}).catch(()=>{});}
    else{navigator.clipboard.writeText(text).then(()=>setDailyShareMsg(t.dailyCopied)).catch(()=>{});setTimeout(()=>setDailyShareMsg(null),2000);}
  },[t,lang,dailyDate,dailyTheme,dailyThemeBonusGiven]);

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
      {const styles=["random","wave","rain","spiral","scatter"];setScrambleStyle(styles[Math.floor(Math.random()*styles.length)]);}
      setSettledCells(new Set());setState("scramble");setScrambleStep(0);setScrambleGrid(boardShapeRef.current!=="hex"?randGridForShape(boardShapeRef.current):soloMode==="hex"?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(soloMode==="chess"?8:SZ,lang));return;
    }
    sounds.playCountdown(countdown);
    const t=setTimeout(()=>setCountdown(c=>c-1),1000);
    return()=>clearTimeout(t);
  },[state,countdown,sounds]);

  // Scramble animation — letters randomize then settle into final grid
  useEffect(()=>{
    if(state!=="scramble")return;
    const isHex=soloMode==="hex"||mode==="multi"||publicHex||(mode==="public");
    const sb=boardShapeRef.current!=="hex"?getBoard(boardShapeRef.current):null;
    const rows=sb?sb.rowLens.length:isHex?HEX_ROWS:soloMode==="chess"?8:SZ;
    const cols=sb?sb.maxCols:isHex?HEX_COLS:soloMode==="chess"?8:SZ;
    const totalCells=sb?sb.cells.length:rows*cols;
    const mkRand=()=>sb?randGridForShape(sb.shape):isHex?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(rows,lang,cols!==rows?cols:undefined);
    const style=scrambleStyle;

    if(style==="random"){
      // Classic: all letters randomize together, then snap
      let step=0;
      const interval=setInterval(()=>{
        step++;
        if(step<=10){
          setScrambleGrid(mkRand());
        }else{
          clearInterval(interval);
          sounds.playGo();
          setScrambleGrid(null);setScrambleStep(0);setSettledCells(new Set());
          setState("play");
        }
      },70);
      return()=>clearInterval(interval);
    }

    if(style==="wave"||style==="rain"||style==="spiral"||style==="scatter"){
      // Phase 1: randomize all cells (400ms), Phase 2: settle cells progressively
      let step=0;
      const scrambleFrames=6;
      // Build settle order based on style
      const cellOrder=[];
      if(sb)for(const cell of sb.cells)cellOrder.push({r:cell.r,c:cell.c,idx:cell.i}); // muotolaudat: lineaarinen indeksi
      else for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)cellOrder.push({r,c,idx:r*cols+c});
      if(style==="wave"){
        cellOrder.sort((a,b)=>a.c-b.c||(a.c%2===0?a.r-b.r:b.r-a.r));
      }else if(style==="rain"){
        cellOrder.sort((a,b)=>a.r-b.r||a.c-b.c);
      }else if(style==="spiral"){
        const cr=(rows-1)/2,cc=(cols-1)/2;
        cellOrder.sort((a,b)=>{const da=Math.sqrt((a.r-cr)**2+(a.c-cc)**2);const db=Math.sqrt((b.r-cr)**2+(b.c-cc)**2);return da-db;});
      }else{
        // scatter: random order
        for(let i=cellOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cellOrder[i],cellOrder[j]]=[cellOrder[j],cellOrder[i]];}
      }
      // Group cells into ~6-8 batches
      const batchCount=Math.min(8,Math.ceil(totalCells/4));
      const batchSize=Math.ceil(totalCells/batchCount);

      const settled=new Set();
      const interval=setInterval(()=>{
        step++;
        if(step<=scrambleFrames){
          setScrambleGrid(mkRand());
        }else{
          const settleStep=step-scrambleFrames;
          const settleEnd=Math.min(settleStep*batchSize,totalCells);
          for(let i=0;i<settleEnd;i++)settled.add(cellOrder[i].idx);
          setSettledCells(new Set(settled));
          setScrambleGrid(mkRand());
          if(settleEnd>=totalCells){
            clearInterval(interval);
            sounds.playGo();
            setScrambleGrid(null);setScrambleStep(0);setSettledCells(new Set());
            setState("play");
          }
        }
      },70);
      return()=>clearInterval(interval);
    }
  },[state,lang,sounds,scrambleStyle]);

  // Timer (solo mode only — multiplayer uses server timer_tick + game_over)
  const startTimeRef=useRef(null);
  const soundsRef=useRef(sounds);
  soundsRef.current=sounds;
  const themeIdRef=useRef(themeId);
  themeIdRef.current=themeId;
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
        setScrambleGrid(boardShapeRef.current!=="hex"?randGridForShape(boardShapeRef.current):soloMode==="hex"?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(soloMode==="chess"?8:SZ,lang));
        setScrambleStep(0);
      }else if(progress>0.25&&scrambleCount>0){
        // End scramble phase — clear it
        setScrambleGrid(null);setScrambleStep(0);
        scrambleCount=0;
      }
      // Phase 2: start eating cells
      if(progress>0.45){
        const eatProgress=(progress-0.45)/0.55; // 0 to 1
        const isHex=soloMode==="hex"||mode==="multi"||(mode==="public"&&publicHex);
        const totalCells=boardShapeRef.current!=="hex"?getBoard(boardShapeRef.current).cells.length:isHex?HEX_ROWS*HEX_COLS:(soloMode==="chess"?8*8:SZ*SZ);
        const cellCount=Math.min(totalCells, Math.floor(eatProgress * totalCells));
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
        // daily save handled in separate useEffect
      }
    },80);
    return()=>clearInterval(t);
  },[state,mode]);

  // Save daily result when game ends — local + server
  useEffect(()=>{
    if(state==="end"&&dailyMode&&!getDailyResultForDate(dailyDate,lang)){
      saveDailyResult(score,found.length,valid.size,dailyDate,lang);
      if(dailyDate===todayStr())updateDailyStreak(lang);
      setDailyResult(getDailyResult(lang));
      // Submit to server daily leaderboard
      const nick=authUser?.nickname||(()=>{try{const a=JSON.parse(localStorage.getItem("piilosana_auth")||"null");if(a?.nickname)return a.nickname;}catch{}return localStorage.getItem('piilosana_nick')||'Anon';})();
      fetch('/api/daily-scores',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nickname:nick,score,wordsFound:found.length,wordsTotal:valid.size,dateStr:dailyDate,lang})
      }).catch(()=>{});
    }
  },[state,dailyMode,score,found,valid,dailyDate]);


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
    if(boardShapeRef.current!=="hex"){
      // Muotolaudat: muunnetaan ruutukoordinaatit laudan yksiköihin ja testataan monikulmiot.
      const b=getBoard(boardShapeRef.current),rect=gRef.current.getBoundingClientRect();
      if(!rect.width||!rect.height)return null;
      const px=(x-rect.left)/rect.width*b.W,py=(y-rect.top)/rect.height*b.H;
      const cell=b.cellAtPoint(px,py);if(!cell)return null;
      // Vedon aikana vaaditaan osuma ruudun keskiosaan, ettei kulmien ohi vetäminen nappaa vääriä ruutuja
      if(lastCell){const k=0.7;if(b.cellAtPoint(cell.cx+(px-cell.cx)/k,cell.cy+(py-cell.cy)/k)!==cell)return null;}
      return{r:cell.r,c:cell.c};
    }
    let best=null,bestDist=Infinity;
    for(const el of gRef.current.querySelectorAll("[data-c]")){
      const rect=el.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const dx=Math.abs(x-cx),dy=Math.abs(y-cy);
      const hw=rect.width/2,hh=rect.height/2;
      if(dx>hw||dy>hh)continue;
      // Hex hit-test for polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%)
      // From center: nx=dx/hw (0..1), ny=dy/hh (0..1)
      // Flat sides at nx=1 (when ny≤0.5), diagonal edges when ny>0.5: nx ≤ 2*(1-ny)
      const nx=dx/hw,ny=dy/hh;
      const inHex=ny<=0.5?(nx<=1):(nx<=2*(1-ny));
      if(!inHex)continue;
      const dist=dx*dx+dy*dy;
      const[row,col]=el.dataset.c.split(",").map(Number);
      let score=dist;
      if(lastCell&&(Math.abs(row-lastCell.r)>1||Math.abs(col-lastCell.c)>1))score+=hw*hw*2;
      if(score<bestDist){best={r:row,c:col};bestDist=score;}
    }
    return best;
  },[]);

  const isHexMode=soloMode==="hex"||mode==="multi"||(mode==="public"&&publicHex)||!!shapeBoard;

  const inPlayScreen=state==="play"||state==="ending"||state==="scramble";
  useEffect(()=>{
    if(!inPlayScreen){setPlayMaxWidth(PLAY_MAX_W);return;}
    let raf=0;
    const fit=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const c=playRef.current,g=gRef.current;
        if(!c||!g||!c.lastElementChild)return;
        const cr=c.getBoundingClientRect();
        const cw=cr.width;
        const gh=g.getBoundingClientRect().height;
        if(cw<=0||gh<=0)return;
        // Sisällön todellinen korkeus (ei flex-grow:n venyttämä laatikko): containerin
        // yläreunasta viimeisen lapsen alareunaan.
        const contentH=c.lastElementChild.getBoundingClientRect().bottom-cr.top;
        const other=contentH-gh;                          // HUD, palkit, löydetyt sanat
        const top=cr.top+window.scrollY;                  // pelialueen etäisyys sivun yläreunasta
        const avail=window.innerHeight-top-8;             // tilaa alareunan paddingiin asti
        const ratio=gh/cw;                                // ruudukon korkeus suhteessa leveyteen
        const want=Math.round(Math.max(PLAY_MIN_W,Math.min(PLAY_MAX_W,(avail-other)/ratio)));
        setPlayMaxWidth(prev=>Math.abs(prev-want)>2?want:prev);
      });
    };
    fit();
    window.addEventListener("resize",fit);
    window.addEventListener("orientationchange",fit);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",fit);window.removeEventListener("orientationchange",fit);};
  },[inPlayScreen,isHexMode,found.length,isLarge,boardShape]);
  const adj=(a,b)=>shapeBoard?shapeBoard.isAdjacent(a,b):isHexMode?adjHex(a,b):(Math.abs(a.r-b.r)<=1&&Math.abs(a.c-b.c)<=1&&!(a.r===b.r&&a.c===b.c));
  const isSel=(r,c)=>sel.some(s=>s.r===r&&s.c===c);

  // Submit word (handles both solo and multiplayer)
  const submitWord=useCallback((currentSel,currentWord)=>{
    if(currentWord.length<3)return;

    // Public game (Piilosauna)
    if(mode==="public"&&socket){
      if(!WORDS_SET.has(currentWord)&&currentWord.length<=10){
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
      // Client-side dictionary check before sending to server (skip for long words - server validates)
      if(!WORDS_SET.has(currentWord)&&currentWord.length<=10){
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
    let isValidWord=valid.has(currentWord);
    const alreadyFound=found.includes(currentWord);

    // For long words (>8 chars), validate server-side if not in local set
    if(!isValidWord&&currentWord.length>8&&lang==="fi"){
      const savedSel=[...currentSel];
      fetch(`${SERVER_URL}/api/validate-word`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({word:currentWord})})
        .then(r=>r.json()).then(({valid:v})=>{
          if(v&&!found.includes(currentWord)){
            // Score the word directly
            const n2=Date.now();
            let p2=letterMult?ptsLetters(currentWord,lang):pts(currentWord.length);
            const isC=(n2-lastFoundTime)<COMBO_WINDOW&&lastFoundTime>0;
            const nc=isC?combo+1:1;
            setCombo(nc);setLastFoundTime(n2);
            const cm=nc>=5?3:nc>=3?2:1;
            const tp=p2*cm;
            setScore(s=>s+tp);setFound(f=>[...f,currentWord]);
            setValid(prev=>{const n=new Set(prev);n.add(currentWord);return n;});
            setMsg({t:currentWord,ok:true,p:tp,combo:nc});
            setFlashKey(k=>k+1);
            sounds.playByLength(currentWord.length);
            if(nc>=3)setTimeout(()=>sounds.playCombo(nc),200);
            // Popup
            let popX,popY;
            if(gRef.current&&savedSel.length>0){
              const mid=savedSel[Math.floor(savedSel.length/2)];
              const cellEl=gRef.current.querySelector(`[data-c="${mid.r},${mid.c}"]`);
              if(cellEl){const cr=cellEl.getBoundingClientRect();popX=cr.left+cr.width/2;popY=cr.top+cr.height/2;}
              else{const rect=gRef.current.getBoundingClientRect();popX=rect.left+rect.width/2;popY=rect.top+rect.height/2;}
            }else if(gRef.current){const rect=gRef.current.getBoundingClientRect();popX=rect.left+rect.width/2;popY=rect.top+rect.height/2;}
            if(popX)addPopup(`${currentWord.toUpperCase()} +${tp}${nc>=3?` x${cm}`:""}`,wordColor(),popX,popY);
          }else if(v){
            setMsg({t:currentWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
          }else{
            setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
          }
        }).catch(()=>{
          setMsg({t:currentWord,ok:false,m:T[lang]?.notValid||"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
        });
      return;
    }

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
      // Daily mode: check if word is a theme word, give +10p per theme word
      if(dailyMode&&dailyTheme){
        const stem=isThemeWord(currentWord,dailyTheme);
        if(stem&&!dailyThemeFound.includes(stem)){
          const newFound=[...dailyThemeFound,stem];
          setDailyThemeFound(newFound);
          const THEME_WORD_BONUS=10;
          setScore(s=>s+THEME_WORD_BONUS);
          const themeLabel=lang==="en"?`Theme word! +${THEME_WORD_BONUS}p`:lang==="sv"?`Temaord! +${THEME_WORD_BONUS}p`:`Teemasana! +${THEME_WORD_BONUS}p`;
          addPopup(`🎯 ${themeLabel}`,S.yellow||"#ffcc00");
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
  },[valid,found,lastFoundTime,combo,sounds,addPopup,mode,socket,gameMode,soloMode,grid,trie,letterMult,activeTheme,themeFound,bombCell,mysteryCell,mysteryRevealed,lang,dailyMode,dailyTheme,dailyThemeFound,dailyThemeBonusGiven]);

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
      // Auto-join room from deep link (?room=XXXX)
      if(mode==="multi"&&roomCode){
        const auth=(() => {try{return JSON.parse(localStorage.getItem("piilosana_auth")||"null")}catch{return null}})();
        if(auth?.nickname){
          setLobbyState("joining");
          newSocket.emit("join_room",{roomCode,nickname:auth.nickname,mode:"multi"});
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
      // Jos pelin aikana yhteys katkeaa, ilmoita ja palaa valikkoon – pelitila
      // ei voi enää jatkua koska palvelin ei tunne meitä uudessa yhteydessä.
      const inPublicGame=mode==="public"&&(publicState==="playing"||publicState==="countdown");
      const inMultiGame=mode==="multi"&&(state==="play"||state==="countdown"||state==="ending");
      if(inPublicGame||inMultiGame){
        setTimeout(()=>{
          alert(lang==="en"?"Connection lost. Returning to menu.":lang==="sv"?"Anslutningen bröts. Återgår till menyn.":"Yhteys katkesi. Palataan valikkoon.");
          returnToModeSelect();
        },100);
      }
    });

    // Server lähettää tämän kun se on lähdössä alas (uuden version deploy).
    // Annetaan käyttäjälle selvä palaute, ei hiljaista bug-kokemusta.
    newSocket.on("server_draining",()=>{
      console.log("Server draining — version update");
      const inGame=(mode==="public"&&publicState==="playing")||(mode==="multi"&&state==="play");
      if(inGame){
        setTimeout(()=>{
          alert(lang==="en"?"Server is updating. The game will end – please try again in a moment.":lang==="sv"?"Servern uppdateras. Spelet avslutas – försök igen om en stund.":"Päivitys käynnissä – peli päättyy. Yritä hetken päästä uudelleen.");
          returnToModeSelect();
        },100);
      }
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
    
    newSocket.on("game_started",({grid:g,validWords:vw,gameMode:gm,shape})=>{
      setBoardShape(shape&&gridFitsBoard(g,getBoard(shape))?shape:"hex");
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
      startTimeRef.current=Date.now();
      // Scramble intro
      {const styles=["random","wave","rain","spiral","scatter"];setScrambleStyle(styles[Math.floor(Math.random()*styles.length)]);}
      setSettledCells(new Set());setScrambleStep(0);
      const isHex=g&&g.length===HEX_ROWS&&g[0]?.length===HEX_COLS;
      setScrambleGrid(isHex?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(SZ,lang));
      setState("scramble");
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
    newSocket.on("public_countdown",({grid:g,validWords:vw,roundNumber,hex,shape})=>{
      setBoardShape(shape&&gridFitsBoard(g,getBoard(shape))?shape:"hex");
      setGrid(g);setValid(new Set(vw));setFound([]);setSel([]);setWord("");setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);setEnding(null);setDropKey(0);
      setTime(120);setPublicState("playing");setPublicCountdown(0);setPublicRound(roundNumber);
      setPublicRankings(null);setPublicHex(!!hex);startTimeRef.current=Date.now();
      // Scramble intro
      {const styles=["random","wave","rain","spiral","scatter"];setScrambleStyle(styles[Math.floor(Math.random()*styles.length)]);}
      setSettledCells(new Set());setScrambleStep(0);setScrambleGrid(randGridForShape(boardShapeRef.current));setState("scramble");
    });
    newSocket.on("public_join_midgame",({grid:g,validWords:vw,timeLeft:tl,roundNumber,hex,shape})=>{
      setBoardShape(shape&&gridFitsBoard(g,getBoard(shape))?shape:"hex");
      setGrid(g);setValid(new Set(vw));setFound([]);setSel([]);setWord("");setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);setWordPopups([]);setEnding(null);setDropKey(0);
      setTime(tl);setPublicState("playing");setPublicRound(roundNumber);setPublicRankings(null);setState("play");setPublicHex(!!hex);
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
      if(muteEmojisRef.current)return;
      const id=++emojiFeedIdRef.current;
      setEmojiFeed(prev=>[...prev.slice(-7),{id,nickname,emoji,fading:false}]);
      setTimeout(()=>setEmojiFeed(prev=>prev.map(e=>e.id===id?{...e,fading:true}:e)),3500);
      setTimeout(()=>setEmojiFeed(prev=>prev.filter(e=>e.id!==id)),4300);
    });

    setSocket(newSocket);
    
    return()=>{
      if(newSocket)newSocket.disconnect();
    };
  },[mode]);
  const missed=useMemo(()=>state==="end"?[...valid].filter(w=>!found.includes(w)).sort((a,b)=>b.length-a.length):[],[state,valid,found]);
  const totalPossible=useMemo(()=>[...valid].reduce((s,w)=>s+(letterMult?ptsLetters(w,lang):pts(w.length)),0),[valid,letterMult,lang]);
  const wordColor=()=>S.green;
  const[defPopup,setDefPopup]=useState(null); // {word,def,x,y}
  const DEFS=lang==="fi"?DEFS_FI:null;
  const showDef=useCallback((w,e)=>{
    if(!DEFS)return;
    const d=DEFS[w.toLowerCase()];
    if(!d)return;
    const r=e.currentTarget.getBoundingClientRect();
    setDefPopup({word:w,def:d,x:r.left+r.width/2,y:r.top});
  },[DEFS]);
  // Pelin aikana selitys sulkeutuu itsestään, ettei se jää peittämään lautaa
  useEffect(()=>{
    if(!defPopup||state!=="play")return;
    const id=setTimeout(()=>setDefPopup(null),4000);
    return()=>clearTimeout(id);
  },[defPopup,state]);


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
    const sh=boardShapeRef.current;
    for(let i=0;i<50;i++){const g=sh!=="hex"?makeBoardGrid(sh,()=>randLetterLang(lang)):soloMode==="hex"?makeGrid(HEX_ROWS,lang,HEX_COLS):makeGrid(SZ,lang);const w=sh!=="hex"?findWordsOnBoard(g,trie,sh):(soloMode==="hex"?findWordsHex:findWords)(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=(soloMode==="hex"?25:15))break;}
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
    // Klassinen moninpeli: isäntä arpoo laudan muodon. Battle (painovoima) pysyy vanhalla laudalla.
    const shape=gm==="battle"?null:randomShape();
    for(let i=0;i<50;i++){
      const g=!shape?makeGrid(SZ,lang):shape==="hex"?makeGrid(HEX_ROWS,lang,HEX_COLS):makeBoardGrid(shape,()=>randLetterLang(lang));
      const w=!shape?(soloMode==="hex"?findWordsHex:findWords)(g,trie):shape==="hex"?findWordsHex(g,trie):findWordsOnBoard(g,trie,shape);
      if(w.size>bw.size){bg=g;bw=w;}if(w.size>=(shape?25:15))break;}
    setCurrentMultiGrid(bg);
    setGameMode(gm);
    socket.emit("start_game",{grid:bg,validWords:Array.from(bw),gameMode:gm,gameTime,shape:shape||undefined});
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
    // Clean URL params
    if(window.location.search)window.history.replaceState({},"",window.location.pathname);
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
    setDailyMode(false);
    setDailyTheme(null);
    setDailyResult(getDailyResult(lang));
    setState("menu");
  },[socket,mode,lang]);
  
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
  // Pelinäkymän paneelien reuna ja varjo: teeman harmaa (sama sävy kuin laudan tummemmat kohdat)
  const playAccent=S.border;
  const playShadow=`4px 4px 0 ${S.border}`;
  const Icon=S.cellGradient?ModernIcon:PixelIcon;
  useEffect(()=>{
    if(!(mode===null&&showFirstTimeAuth&&!showTutorial&&!authUser&&!showAuth)){setFirstTimePhase("wait");return;}
    const t1=setTimeout(()=>setFirstTimePhase("in"),1500);
    const t2=setTimeout(()=>setFirstTimePhase("out"),11500);
    const t3=setTimeout(()=>{setShowFirstTimeAuth(false);sessionStorage.setItem("piilosana_auth_dismissed","1");},12300);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);};
  },[mode,showFirstTimeAuth,showTutorial,authUser,showAuth]);
  // Kirjautumiskuplat: molemmat ponnahtavat footerin kirjautumiskuvakkeesta.
  // - showAuth: varsinainen kirjautumislomake ajatuskuplana
  // - ensikerran vinkki: pieni kupla, joka tulee esiin ja haihtuu itsestään
  const firstTimeBubbleVisible=mode===null&&showFirstTimeAuth&&!showTutorial&&!authUser&&!showAuth;
  const authBubbleNode=showAuth?(
        <AuthPanel
          S={S}
          t={t}
          lang={lang}
          Icon={Icon}
          authUser={authUser}
          authMode={authMode}
          authError={authError}
          authSuccess={authSuccess}
          authLoading={authLoading}
          googleClientId={googleClientId}
          onModeChange={(m)=>{setAuthMode(m);setAuthError("");setAuthSuccess("");}}
          onLogin={doLogin}
          onRegister={doRegister}
          onForgotPassword={doForgotPassword}
          onChangePassword={doChangePassword}
          onGoogleLogin={doGoogleLogin}
          onLogout={doLogout}
          onClose={()=>setShowAuth(false)}
        />
  ):(firstTimeBubbleVisible&&firstTimePhase!=="wait")?(
    <div style={{width:"min(260px,80vw)",padding:"14px 16px 12px",borderRadius:"30px 34px 32px 36px / 34px 30px 36px 32px",
      border:`2px solid ${S.yellow}`,background:S.cell||S.dark,boxShadow:"0 10px 26px rgba(0,0,0,0.3)",textAlign:"center",
      animation:firstTimePhase==="out"?"authBubbleDownOut 0.7s ease forwards":"authBubbleDownIn 0.45s ease",transformOrigin:"58% -20%",position:"relative"}}>
      <span aria-hidden="true" style={{position:"absolute",width:"16px",height:"16px",borderRadius:"50%",left:"calc(58% - 8px)",top:"-13px",background:S.cell||S.dark,border:`2px solid ${S.yellow}`}}/>
      <span aria-hidden="true" style={{position:"absolute",width:"9px",height:"9px",borderRadius:"50%",left:"calc(58% - 4px)",top:"-25px",background:S.cell||S.dark,border:`2px solid ${S.yellow}`}}/>
      <button aria-label="close" onClick={()=>{setShowFirstTimeAuth(false);sessionStorage.setItem("piilosana_auth_dismissed","1");}}
        style={{position:"absolute",top:"6px",right:"12px",background:"transparent",border:"none",color:S.textMuted,fontSize:"14px",cursor:"pointer",padding:"4px"}}>✕</button>
      <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"700",color:S.yellow,marginBottom:"4px"}}>
        {lang==="en"?"Save your nickname?":lang==="sv"?"Spara ditt smeknamn?":"Tallenna nimimerkkisi?"}
      </div>
      <div style={{fontFamily:S.font,fontSize:"12px",color:S.textSoft||S.textMuted,marginBottom:"10px",lineHeight:"1.5"}}>
        {lang==="en"?"Create an account to save your progress":lang==="sv"?"Skapa ett konto för att spara dina framsteg":"Luo tunnus – nimimerkkisi ja saavutuksesi tallentuvat"}
      </div>
      <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
        <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.orange} label={lang==="en"?"CREATE":lang==="sv"?"SKAPA":"LUO TUNNUS"} onClick={()=>{setShowAuth(true);setAuthMode("register");setShowFirstTimeAuth(false);}}/>
        <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.gray} label={lang==="en"?"LOG IN":lang==="sv"?"LOGGA IN":"KIRJAUDU"} onClick={()=>{setShowAuth(true);setAuthMode("login");setShowFirstTimeAuth(false);}}/>
      </div>
    </div>
  ):null;

  const modeSelectJSX=(
    <div style={{textAlign:"center",marginTop:"16px",animation:"fadeIn 0.5s ease",maxWidth:"420px",width:"100%",position:"relative"}}>


      {/* Streak-varoitus (vain kun päiväpeli käytössä) */}
      {DAILY_ENABLED&&(
        <StreakWarning
          S={S}
          lang={lang}
          streak={getDailyStreak(lang)}
          isPlayed={!!getDailyResult(lang)}
        />
      )}

      {/* ===== PELINAPIT: online-peli ja harjoittelu ===== */}
      <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>

        {/* 1. ONLINE-PELI */}
        <GlossyButton
          S={S}
          color={GLOSSY.blue}
          label={lang==="fi"?"ONLINE-PELI":lang==="sv"?"ONLINE-SPEL":"ONLINE GAME"}
          subLabel={lang==="fi"?"Pelaa muita vastaan · 2 min":lang==="sv"?"Spela mot andra · 2 min":"Play against others · 2 min"}
          badge={publicOnlineCount>1?`${publicOnlineCount} online`:null}
          onClick={()=>{
            sounds.init().catch(()=>{});
            setMode("public");
            if(authUser){setPublicState("waiting");}else{setPublicState("nickname");}
          }}
        />

        {/* 2. PÄIVÄN PIILOSANA (piilotettu kun DAILY_ENABLED=false) */}
        {DAILY_ENABLED&&(()=>{
          const d=todayStr();
          const dl=dateLabel(d,lang);
          const res=getDailyResult(lang);
          const todayTheme=getDailyTheme(d,lang);
          const themeName=lang==="en"?(todayTheme.nameEn||todayTheme.name):lang==="sv"?(todayTheme.nameSv||todayTheme.name):todayTheme.name;
          const streak=getDailyStreak(lang);
          const isPlayed=res!=null;
          return(
            <button
              onClick={()=>{if(isPlayed){setShowDailyHistory(d);}else{startDaily();}}}
              style={{
                fontFamily:S.font,width:"100%",
                padding:"18px 20px",
                background:menuColors.dailyBg,
                border:`2px solid ${menuColors.dailyBorder}`,
                borderRadius:"14px",
                color:menuColors.dailyText,
                cursor:"pointer",
                boxShadow:menuColors.softShadow,
                transition:"all 0.2s",
                textAlign:"left",
              }}
              onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 12px 30px rgba(0,0,0,0.35)";}}
              onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=menuColors.softShadow;}}
            >
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:"20px",fontWeight:"900",letterSpacing:"1px",marginBottom:"2px"}}>
                    {t.daily}
                  </div>
                  <div style={{fontSize:"12px",fontWeight:"600",opacity:0.85}}>
                    {themeName} · 3 min
                  </div>
                </div>
                {isPlayed?(
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:"28px",fontWeight:"800",color:menuColors.dailyAccent,lineHeight:1}}>{res.score}<span style={{fontSize:"14px",fontWeight:"400"}}>p</span></div>
                    {streak?.streak>1&&<div style={{fontSize:"11px",color:"#ff6644",fontWeight:"700"}}>🔥 {streak.streak}</div>}
                  </div>
                ):(
                  <div style={{fontSize:"12px",fontWeight:"700",color:menuColors.dailyAccent,background:"rgba(255,255,255,0.12)",borderRadius:"8px",padding:"6px 12px"}}>
                    {lang==="fi"?"PELAA":lang==="sv"?"SPELA":"PLAY"} ▶
                  </div>
                )}
              </div>
            </button>
          );
        })()}

        {/* 3. HARJOITTELU */}
        <GlossyButton
          S={S}
          color={GLOSSY.green}
          label={t.practice}
          subLabel={lang==="fi"?"Pelaa yksin omaan tahtiin":lang==="sv"?"Spela ensam i egen takt":"Play solo at your own pace"}
          onClick={()=>setShowMenuOptions(true)}
        />

      </div>

      {/* Pikaohje-linkki heti pelinappien alla, sama tarratyyli pienenä */}
      <button
        onClick={()=>setShowTutorial(true)}
        aria-label={t.tutorialBtn}
        style={{
          fontFamily:S.font,marginTop:"12px",padding:0,
          borderRadius:"22px 4px 22px 4px",
          background:"transparent",border:"none",
          boxShadow:"0 4px 10px rgba(0,0,0,0.2)",
          cursor:"pointer",transition:"transform 0.15s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";}}
        onMouseLeave={e=>{e.currentTarget.style.transform="none";}}
      >
        <span style={{
          display:"inline-flex",alignItems:"center",gap:"8px",
          padding:"6px 16px 7px 18px",borderRadius:"22px 4px 22px 4px",
          background:`linear-gradient(180deg, ${GLOSSY.orange.top}, ${GLOSSY.orange.bottom})`,
          boxShadow:`inset -3px -3px 0 0 ${GLOSSY.orange.dark}`,
          color:"#fff",fontFamily:"'Montserrat','Inter',sans-serif",fontSize:"12px",fontWeight:"800",letterSpacing:"2px",textTransform:"uppercase",
          textShadow:"0 1px 1px rgba(0,0,0,0.25)",
        }}>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:"18px",height:"18px",borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.9)",fontSize:"11px"}}>?</span>
          {t.tutorialBtn}
        </span>
      </button>

      {/* Daily history popup with leaderboard */}
      {showDailyHistory&&(
        <DailyPopup dateStr={showDailyHistory} lang={lang} t={t} S={S}
          myResult={getDailyResultForDate(showDailyHistory,lang)||(showDailyHistory===todayStr()?getDailyResult(lang):null)}
          onShare={showDailyHistory===todayStr()?shareDailyResult:null}
          dailyShareMsg={dailyShareMsg}
          onClose={()=>setShowDailyHistory(null)} />
      )}

      {/* ===== Harjoittelun asetukset – overlay ===== */}
      {showMenuOptions&&(
        <PracticeOptionsModal
          S={S}
          t={t}
          lang={lang}
          Icon={Icon}
          gameTime={gameTime}
          letterMult={letterMult}
          onGameTimeChange={setGameTime}
          onLetterMultToggle={()=>setLetterMult(v=>!v)}
          shape={practiceShape}
          onShapeChange={(sh)=>{setPracticeShape(sh);try{localStorage.setItem("piilosana_shape",sh);}catch{}}}
          onStart={()=>{startSolo();setShowMenuOptions(false);}}
          onClose={()=>setShowMenuOptions(false)}
        />
      )}

      {/* ===== Footer ===== */}
      <MenuFooter
        S={S}
        lang={lang}
        t={t}
        Icon={Icon}
        PixelFlag={PixelFlag}
        version={VERSION}
        langConfig={LANG_CONFIG}
        authUser={authUser}
        achUnlockedCount={Object.keys(achUnlocked).length}
        achTotalCount={Object.keys(ACHIEVEMENTS).length}
        wordCount={WORDS_SET.size}
        wordsLoaded={currentLangLoaded}
        onShowAchievements={()=>setShowAchievements(true)}
        onShowAuth={()=>{setShowAuth(v=>!v);setShowFirstTimeAuth(false);}}
        authBubble={authBubbleNode}
        onShowInflection={()=>setShowInflection(true)}
        onShowHelp={()=>setShowHelp(true)}
        onShowWordInfo={()=>setShowWordInfo(true)}
        onLangChange={(code)=>{setLang(code);localStorage.setItem("piilosana_lang",code);setFlagBubble(false);sessionStorage.setItem("piilosana_flag_bubble_shown","1");syncSettings({lang:code});}}
      />

      {/* ===== AD SPACE – footerin alla, ei varaa tilaa ennen kuin mainos oikeasti latautuu ===== */}
      <AdBanner/>
    </div>
  );
  
  const isWinner=multiRankings&&multiRankings.length>0&&multiRankings[0].playerId===playerId;
  const myRank=multiRankings?multiRankings.findIndex(p=>p.playerId===playerId):0;
  const ResultsScreen=()=>(
    <ResultsScreenView
      S={S}
      t={t}
      isWinner={isWinner}
      myRank={myRank}
      isHost={isHost}
      gameMode={gameMode}
      multiRankings={multiRankings}
      multiAllFoundWords={multiAllFoundWords}
      multiValidWords={multiValidWords}
      playerId={playerId}
      wordColor={wordColor}
      DEFS={DEFS}
      showDef={showDef}
      roomLang={room?.lang||"fi"}
      Icon={Icon}
      ConfettiCelebration={ConfettiCelebration}
      onPlayAgain={playAgain}
      onSwitchToSolo={switchToSolo}
      onReturnToMenu={returnToModeSelect}
    />
  );


  return(
    <div style={{fontFamily:S.font,background:S.bg,color:S.green,minHeight:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",userSelect:"none",WebkitUserSelect:"none",padding:"8px 4px",position:"relative",overflowX:"hidden",animation:themeTransition?"themeResolve 0.6s ease-out":"none"}}
      onMouseMove={e=>onDragMove(e.clientX,e.clientY)} onMouseUp={onDragEnd} onTouchEnd={onDragEnd}>

      {/* Update available banner */}
      {updateAvailable&&<div style={{position:"fixed",top:0,left:0,right:0,zIndex:9999,background:"linear-gradient(135deg,#ffcc00,#ff9900)",color:"#1a1000",padding:"8px 16px",display:"flex",alignItems:"center",justifyContent:"center",gap:"12px",fontSize:"13px",fontFamily:S.font,fontWeight:"600",boxShadow:"0 2px 12px #00000044"}}>
        <span>{lang==="en"?"New version available!":lang==="sv"?"Ny version tillgänglig!":"Uusi versio saatavilla!"}</span>
        <button onClick={()=>window.location.reload()} style={{background:"#1a1000",color:"#ffcc00",border:"none",padding:"4px 14px",borderRadius:"6px",cursor:"pointer",fontFamily:S.font,fontWeight:"700",fontSize:"12px"}}>{lang==="en"?"UPDATE":lang==="sv"?"UPPDATERA":"PÄIVITÄ"}</button>
        <button onClick={()=>setUpdateAvailable(false)} style={{background:"transparent",border:"none",color:"#1a100088",cursor:"pointer",fontSize:"18px",lineHeight:"1",padding:"0 4px"}}>×</button>
      </div>}

      {/* Global hamburger — top-left, always visible */}
      {state!=="play"&&state!=="ending"&&state!=="scramble"&&(
        <button onClick={()=>setShowHamburger(true)} style={{position:"fixed",left:"max(10px, calc(50% - 210px))",top:"14px",zIndex:100,background:`${S.dark}cc`,border:`1px solid ${S.border}`,padding:"6px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"10px",transition:"all 0.15s",fontSize:"20px",color:S.textMuted,lineHeight:"1",height:"36px",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=S.green;e.currentTarget.style.color=S.green;e.currentTarget.style.background=S.green+"15";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=S.border;e.currentTarget.style.color=S.textMuted;e.currentTarget.style.background=`${S.dark}cc`;}}>
          &#9776;
        </button>
      )}

      {/* Word definition popup */}
      {defPopup&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:300}} onClick={()=>setDefPopup(null)}>
          <div style={{position:"fixed",left:"50%",top:"40%",
            transform:"translate(-50%,-50%)",background:S.dark||"#1a1a2e",border:`2px solid ${S.green}`,
            padding:"10px 16px",borderRadius:"12px",boxShadow:`0 4px 20px #00000066`,
            maxWidth:"280px",width:"auto",zIndex:301,animation:"pop 0.2s ease"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"16px",fontWeight:"700",color:S.yellow,marginBottom:"4px"}}>{defPopup.word.toUpperCase()}</div>
            <div style={{fontSize:"13px",color:S.green,lineHeight:"1.5"}}>{defPopup.def}</div>
          </div>
        </div>
      )}
      {/* Top bar removed — buttons moved to footer */}
      {/* Word info modal */}
      {showWordInfo&&(
        <WordInfoModal S={S} t={t} langConfig={LANG_CONFIG} onClose={()=>setShowWordInfo(false)} />
      )}
      {/* Help / How to play modal */}
      {showTutorial&&<QuickTutorial lang={lang} theme={S} onClose={closeTutorial}/>}
      {showHelp&&(
        <HelpModal S={S} t={t} onClose={()=>setShowHelp(false)} />
      )}

      {/* Inflection table modal */}
      {showInflection&&(
        <InflectionModal S={S} lang={lang} onClose={()=>setShowInflection(false)} />
      )}

      {/* Share popup — game link + QR */}
      {showSharePopup&&(()=>{
        const shareUrl=mode==="public"?`${window.location.origin}?arena`:`${window.location.origin}?room=${roomCode}`;
        const copyLink=()=>{navigator.clipboard.writeText(shareUrl).then(()=>{setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);}).catch(()=>{});};
        return(
        <div onClick={()=>setShowSharePopup(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000000cc",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",animation:"fadeIn 0.3s ease"}}>
          <div onClick={e=>e.stopPropagation()} style={{background:S.bg,border:`3px solid ${S.green}`,padding:"24px",maxWidth:"360px",width:"100%",textAlign:"center"}}>
            <div style={{fontSize:"14px",color:S.green,marginBottom:"16px",fontWeight:"bold"}}>{t.shareGame}</div>
            <div style={{display:"flex",gap:"6px",alignItems:"center",justifyContent:"center",marginBottom:"16px"}}>
              <input readOnly value={shareUrl} style={{fontFamily:S.font,fontSize:"12px",color:S.textSoft,background:S.dark,border:`1px solid ${S.border}`,padding:"8px",flex:1,outline:"none",textAlign:"center"}} onClick={e=>e.target.select()}/>
              <button onClick={copyLink} style={{fontFamily:S.font,fontSize:"12px",color:linkCopied?S.bg:S.green,background:linkCopied?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 14px",cursor:"pointer",minWidth:"90px",transition:"all 0.2s"}}>{linkCopied?t.copied:t.shareLink}</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:"8px",marginBottom:"16px"}}>
              <QRCodeSVG value={shareUrl} size={140} bgColor="transparent" fgColor={S.textSoft} level="L"/>
              <p style={{fontSize:"12px",color:S.textMuted}}>{t.scanToJoin}</p>
            </div>
            <button onClick={()=>setShowSharePopup(false)} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 24px",cursor:"pointer"}}>{t.exitNo||"SULJE"}</button>
          </div>
        </div>);
      })()}
      <style>{fontCSS}</style>
      <style>{`
        @keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-4px)}40%{transform:translateX(4px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
        @keyframes pop{0%{transform:scale(1)}50%{transform:scale(1.3)}100%{transform:scale(1)}}
        @keyframes chessArrive{0%{transform:translate(var(--chess-dx),var(--chess-dy)) scale(1.2);opacity:0.6}60%{transform:translate(0,0) scale(1.1);opacity:1}100%{transform:translate(0,0) scale(1);opacity:1}}
        @keyframes snowfall{0%{transform:translateY(0);opacity:0.6}100%{transform:translateY(30px);opacity:0}}
        @keyframes fadeIn{0%{opacity:0;transform:translateY(20px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        @keyframes slideInLeft{0%{transform:translateX(-100%);opacity:0}100%{transform:translateX(0);opacity:1}}
        @keyframes bubbleIn{0%{opacity:0;transform:scale(0.3) translateY(10px)}40%{opacity:1;transform:scale(1.08) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes emojiBubbleIn{0%{opacity:0;transform:translateY(-6px) scale(0.85)}100%{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes emojiBubbleOut{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-14px) scale(0.95)}}
        @keyframes authBubbleOut{0%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(0.6) translateY(18px)}}
        @keyframes authBubbleIn{0%{opacity:0;transform:scale(0.5) translateY(16px)}60%{opacity:1;transform:scale(1.03) translateY(-2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes authBubbleDownIn{0%{opacity:0;transform:scale(0.5) translateY(-16px)}60%{opacity:1;transform:scale(1.03) translateY(2px)}100%{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes authBubbleDownOut{0%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(0.6) translateY(-18px)}}
        @keyframes bubbleOut{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.6) translateY(-10px)}}
        @keyframes chatSlideIn{0%{opacity:0;transform:translateX(-30px) scale(0.7)}30%{opacity:1;transform:translateX(4px) scale(1.04)}60%{transform:translateX(-2px) scale(0.98)}100%{opacity:1;transform:translateX(0) scale(1)}}
        @keyframes chatFadeOut{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0.92);max-height:0;margin:0;padding:0}}
        @keyframes pulse{0%,100%{text-shadow:0 0 5px #ff444444}50%{text-shadow:0 0 20px #ff444488}}
        @keyframes arenaPulse{0%,100%{box-shadow:4px 4px 0 #d4888b,0 0 20px #e5989b33}50%{box-shadow:4px 4px 0 #d4888b,0 0 35px #e5989b55}}
        @keyframes floatUp{0%{opacity:1;transform:translate(-50%,-50%) scale(1.2)}50%{opacity:1;transform:translate(-50%,-100%) scale(1.5)}100%{opacity:0;transform:translate(-50%,-180%) scale(1.8)}}
        @keyframes wordRise{0%{opacity:0.9;transform:translate(-50%,-50%) scale(0.8)}20%{opacity:1;transform:translate(-50%,-80%) scale(1.1)}60%{opacity:0.8;transform:translate(-50%,-140%) scale(1)}100%{opacity:0;transform:translate(-50%,-200%) scale(0.9)}}
        @keyframes wordRiseBig{0%{opacity:0.9;transform:translate(-50%,-50%) scale(0.6)}15%{opacity:1;transform:translate(-50%,-70%) scale(1.3)}30%{transform:translate(-50%,-90%) scale(1.15)}60%{opacity:0.8;transform:translate(-50%,-150%) scale(1.05)}100%{opacity:0;transform:translate(-50%,-220%) scale(0.95)}}
        @keyframes wordRiseEpic{0%{opacity:0.9;transform:translate(-50%,-50%) scale(0.4)}10%{opacity:1;transform:translate(-50%,-60%) scale(1.5)}25%{transform:translate(-50%,-80%) scale(1.2)}40%{transform:translate(-50%,-100%) scale(1.3)}60%{opacity:0.9;transform:translate(-50%,-140%) scale(1.1)}100%{opacity:0;transform:translate(-50%,-240%) scale(1)}}
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
        @keyframes hexPrismatic{0%{background-position:200% 0}100%{background-position:-200% 0}}
        @keyframes hexGlowPulse{0%,100%{opacity:0.3;transform:scale(0.98)}50%{opacity:0.6;transform:scale(1.02)}}
        @keyframes hexSelectPop{0%{transform:scale(0.92);opacity:0}40%{transform:scale(1.05);opacity:1}70%{transform:scale(0.98)}100%{transform:scale(1);opacity:1}}
        @keyframes hexAuroraShift{0%{filter:hue-rotate(0deg) brightness(1.05)}50%{filter:hue-rotate(15deg) brightness(1.12)}100%{filter:hue-rotate(0deg) brightness(1.05)}}
        @media(max-height:750px){
          .piilosana-title{font-size:22px!important;margin:4px 0!important;}
          .piilosana-grid{gap:4px!important;padding:5px!important;}
          .piilosana-hud{padding:3px 8px!important;}
          .piilosana-found{height:70px!important;padding:4px!important;}
        }
        @media(max-height:650px){
          .piilosana-title{font-size:18px!important;margin:2px 0!important;}
          .piilosana-grid{gap:3px!important;padding:4px!important;}
          .piilosana-hud{padding:2px 6px!important;}
          .piilosana-found{height:56px!important;padding:3px!important;}
        }
      `}</style>

      {popups.map(p=><ScorePopup key={p.id}{...p}/>)}
      {wordPopups.map(p=><WordPopup key={p.id}{...p} font={S.font}/>)}

      {(mode===null||(mode==="solo"&&state==="menu")||(mode==="public"&&publicState==="nickname")||(mode==="multi"&&(lobbyState==="enter_name"||lobbyState==="choose")))?(
        <TitleDemo active={true} lang={lang} theme={S}/>
      ):(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",maxWidth:(state==="play"||state==="ending"||state==="scramble")?`${playMaxWidth}px`:"600px",margin:"6px 0",position:"relative",boxSizing:"border-box"}}>
          {(state==="play"||state==="ending"||state==="scramble")&&gameTime!==0&&(
            <span style={{position:"absolute",left:"2px",fontSize:"18px",fontWeight:"700",color:time<=15?S.red:time<=30?S.yellow:S.green,fontVariantNumeric:"tabular-nums",fontFamily:S.font}}>{fmt(time)}</span>
          )}
          {(state==="play"||state==="ending"||state==="scramble")&&gameTime===0&&(
            <span style={{position:"absolute",left:"2px",fontSize:"14px",fontWeight:"700",color:"#44ddff",fontFamily:S.font}}>{found.length} {t.words}</span>
          )}
          <h1 className="piilosana-title" style={{fontSize:"28px",letterSpacing:"4px",margin:0,display:"flex",justifyContent:"center",alignItems:"center",gap:"2px",
            animation:state==="play"&&time<=15&&gameTime!==0?"pulse 0.5s infinite":"none"}}>
            {(()=>{const tc=TITLE_CONFIG[lang]||TITLE_CONFIG.fi;const lowTime=state==="play"&&gameTime!==0&&time<=15;return tc.title.split("").map((ch,i)=>{
              const tC=lowTime?"#FF2D55":titleColor(i,tc.title.length);
              return <span key={i} style={{color:tC,textShadow:lowTime?`0 0 12px #FF2D55, 0 0 24px #FF2D5588, 2px 2px 0 #FF2D5544`:titleShadow(tC),fontFamily:S.titleFont,transition:"color 0.5s, text-shadow 0.5s"}}>{ch}</span>;
            });})()}
            {!currentLangLoaded&&<span style={{fontSize:"10px",color:S.green,marginLeft:"6px",animation:"pulse 1s ease-in-out infinite",display:"inline-flex",alignItems:"center",gap:"2px"}}><span style={{width:"6px",height:"6px",borderRadius:"50%",border:`2px solid ${S.green}`,borderTopColor:"transparent",display:"inline-block",animation:"spin 0.8s linear infinite"}}></span></span>}
          </h1>
          {(state==="play"||state==="ending"||state==="scramble")&&(
            <span style={{position:"absolute",right:"2px",fontSize:"18px",fontWeight:"700",color:S.yellow,fontVariantNumeric:"tabular-nums",fontFamily:S.font}}>{score}p.</span>
          )}
        </div>
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
        <AchievementsModal
          S={S}
          lang={lang}
          t={t}
          Icon={Icon}
          achievements={ACHIEVEMENTS}
          achUnlocked={achUnlocked}
          achStats={achStats}
          onClose={()=>setShowAchievements(false)}
        />
      )}


      {/* MENU */}
      {/* MODE SELECT */}
      {mode===null&&modeSelectJSX}
      
      {/* MULTIPLAYER SCREENS - inline to prevent focus loss */}
      {mode==="multi"&&lobbyState==="enter_name"&&(
        <LobbyEnterName
          S={S}
          t={t}
          lang={lang}
          nickname={nickname}
          nicknameRef={nicknameRef}
          onNicknameChange={setNickname}
          onContinue={()=>setLobbyState("choose")}
          onBack={returnToModeSelect}
        />
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
        <LobbyChoose
          S={S}
          t={t}
          Icon={Icon}
          PixelFlag={PixelFlag}
          socketConnected={socketConnected}
          lobbyError={lobbyError}
          publicRooms={publicRooms}
          roomCode={roomCode}
          onRoomCodeChange={setRoomCode}
          onJoinRoom={joinRoom}
          onCreateRoom={createRoom}
          onRefreshRooms={refreshRooms}
          onBack={returnToModeSelect}
        />
      )}
      {mode==="multi"&&lobbyState==="waiting"&&(
        <LobbyWaiting
          S={S}
          t={t}
          lang={lang}
          Icon={Icon}
          players={players}
          playerId={playerId}
          roomCode={roomCode}
          linkCopied={linkCopied}
          isHost={isHost}
          gameMode={gameMode}
          gameTime={gameTime}
          letterMult={letterMult}
          onCopyLink={()=>{
            const shareUrl=`${window.location.origin}?room=${roomCode}`;
            navigator.clipboard.writeText(shareUrl).then(()=>{
              setLinkCopied(true);
              setTimeout(()=>setLinkCopied(false),2000);
            }).catch(()=>{});
          }}
          onGameModeChange={setGameMode}
          onGameTimeChange={setGameTime}
          onLetterMultToggle={()=>setLetterMult(v=>!v)}
          onStartGame={startGame}
          onExit={returnToModeSelect}
        />
      )}
      {mode==="multi"&&state==="end"&&lobbyState==="results"&&<ResultsScreen/>}

      {/* PIILOSAUNA - nickname entry */}
      {mode==="public"&&publicState==="nickname"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:"1px solid #ff664444",padding:"24px",boxShadow:"0 4px 24px #ff664422, 0 8px 32px #00000022",maxWidth:"600px",borderRadius:"16px",background:`${S.dark}f0`,backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
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
      {mode==="public"&&publicState==="waiting"&&(()=>{
        const arenaUrl=`${window.location.origin}?arena`;
        const copyArena=()=>{navigator.clipboard.writeText(arenaUrl).then(()=>{setLinkCopied(true);setTimeout(()=>setLinkCopied(false),2000);}).catch(()=>{});};
        return(
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
          {/* Share arena link */}
          <div style={{marginTop:"20px",padding:"12px",background:S.gridBg,border:`1px solid ${S.border}`,borderRadius:"4px",maxWidth:"320px",margin:"20px auto 0"}}>
            <p style={{fontSize:"12px",color:S.textMuted,marginBottom:"8px"}}>{t.arenaLink}</p>
            <div style={{display:"flex",gap:"6px",alignItems:"center",justifyContent:"center",marginBottom:"10px"}}>
              <input readOnly value={arenaUrl} style={{fontFamily:S.font,fontSize:"11px",color:S.textSoft,background:S.dark,border:`1px solid ${S.border}`,padding:"5px 8px",flex:1,outline:"none"}} onClick={e=>e.target.select()}/>
              <button onClick={copyArena} style={{fontFamily:S.font,fontSize:"11px",color:linkCopied?S.bg:S.green,background:linkCopied?S.green:"transparent",border:`2px solid ${S.green}`,padding:"5px 10px",cursor:"pointer",minWidth:"70px",transition:"all 0.2s"}}>{linkCopied?t.copied:t.shareLink}</button>
            </div>
            <QRCodeSVG value={arenaUrl} size={100} bgColor="transparent" fgColor={S.textSoft} level="L"/>
          </div>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"13px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"16px"}}>{t.back}</button>
        </div>);
      })()}

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
        const RED="#ff5a5a";
        const sec=(accent)=>({...sectionPanel(S,accent),marginBottom:"14px",textAlign:"left"});
        return(
        <div style={{width:"100%",maxWidth:"600px",textAlign:"center",animation:"fadeIn 1s ease"}}>
          {/* Your score */}
          <div style={{...heroPanel(S,S.green),marginBottom:"18px"}}>
            <div style={{fontSize:"13px",color:S.green,marginBottom:"4px",letterSpacing:"2px",fontWeight:"800",textTransform:"uppercase"}}>{t.roundOver}</div>
            <div style={{fontSize:"36px",fontWeight:"800",color:S.green,marginBottom:"2px",marginTop:"8px",animation:"pop 0.3s ease"}}>{score}<span style={{fontSize:"14px",color:S.textSoft,marginLeft:"4px"}}>/ {[...valid].reduce((s,w)=>s+pts(w.length),0)}p</span></div>
            <div style={{fontSize:"13px",color:S.textSoft,marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            <div style={{fontSize:"13px",color:publicNextCountdown<=10?"#ffaa33":S.textSoft,marginTop:"12px",fontWeight:publicNextCountdown<=10?"bold":"normal"}}>
              {t.nextRoundIn}: {publicNextCountdown>0?`${publicNextCountdown}s`:t.starts}
            </div>
            <div style={{display:"flex",gap:"10px",justifyContent:"center",marginTop:"14px",flexWrap:"wrap"}}>
              <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.orange} icon={<Icon icon="share" color="#ffffff" size={1.5}/>} label={t.invitePlayer} onClick={()=>setShowSharePopup(true)}/>
              <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.gray} label={t.exit} onClick={returnToModeSelect}/>
            </div>
          </div>

          {/* Rankings with medals */}
          {publicRankings&&publicRankings.length>0&&(
            <div style={{...sec(S.yellow),animation:"fadeIn 0.8s ease"}}>
              <div style={sectionTitle(S.yellow)}>{t.roundResults}</div>
              <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
                {publicRankings.slice(0,10).map((r,i)=>{
                  const isMe=r.nickname===soloNickname;
                  return(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:i===0?"7px 8px":"5px 8px",
                    background:isMe?`${S.green}2a`:i<3?["#ffcc0026","#cccccc1c","#cc88441f"][i]:"transparent",
                    border:isMe?`2px solid ${S.green}`:i<3?`1.5px solid ${["#ffcc0099","#cccccc77","#cc884488"][i]}`:"1.5px solid transparent",
                    borderRadius:"8px",marginBottom:"1px"}}>
                    <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                      <span style={{fontSize:"16px",minWidth:"24px"}}>{i<3?MEDALS[i]:<span style={{fontSize:"13px",color:S.textMuted}}>{i+1}.</span>}</span>
                      <span style={{fontSize:i===0?"15px":"14px",color:isMe?S.green:i===0?S.yellow:i<3?"#cccccc":S.textSoft,fontWeight:isMe||i<3?"bold":"normal"}}>{r.nickname}</span>
                    </div>
                    <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                      <span style={{fontSize:i===0?"15px":"14px",color:i===0?S.yellow:S.green,fontWeight:"bold"}}>{r.score}p</span>
                      <span style={{fontSize:"13px",color:S.textSoft}}>{r.percentage}%</span>
                      <span style={{fontSize:"12px",color:S.textMuted}}>{r.wordsFound} {t.words}</span>
                    </div>
                  </div>);
                })}
              </div>
            </div>
          )}

          {/* All found words (collective) */}
          {publicFoundSorted.length>0&&(
            <div style={{...sec(S.green),animation:"fadeIn 0.8s ease"}}>
              <div style={sectionTitle(S.green)}>{t.foundWords} ({publicFoundSorted.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                {publicFoundSorted.map((w,i)=>(
                  <span key={i} onClick={e=>showDef(w,e)} style={{fontSize:"14px",...(found.includes(w)?wordChip(wordColor(w.length)):wordChip(S.textMuted,true)),cursor:DEFS&&DEFS[w.toLowerCase()]?"pointer":"default",textDecoration:DEFS&&DEFS[w.toLowerCase()]?"underline dotted":"none",textUnderlineOffset:"3px"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              <div style={{fontSize:"12px",color:S.textMuted,marginTop:"6px"}}>{t.ownHighlighted}{DEFS?" · "+t.defHint:""}</div>
            </div>
          )}

          {/* Missed words */}
          {publicMissed.length>0&&(
            <div style={{...sec(RED),maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={sectionTitle(RED)}>{t.missed} ({publicMissed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                {publicMissed.map((w,i)=>(
                  <span key={i} onClick={e=>showDef(w,e)} style={{fontSize:"14px",...wordChip(RED),cursor:DEFS&&DEFS[w.toLowerCase()]?"pointer":"default",textDecoration:DEFS&&DEFS[w.toLowerCase()]?"underline dotted":"none",textUnderlineOffset:"3px"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              {lang==="fi"&&<div style={{fontSize:"12px",color:S.textMuted,marginTop:"8px",fontStyle:"italic"}}>{t.missedLong||"Laudalta löytyi myös pidempiä sanoja"}</div>}
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
          {/* Mode selection removed — hex only */}
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
        <div ref={playRef} style={{width:"100%",maxWidth:`${playMaxWidth}px`,containerType:"inline-size",position:"relative",padding:(soloMode==="hex"||mode==="multi"||(mode==="public"&&publicHex))?"0":"0 2px",display:"flex",flexDirection:"column",flex:"1 1 auto",minHeight:0}}>
          {/* HUD + emoji picker wrapper */}
          <div style={{position:"relative",zIndex:10,marginBottom:isHexMode?"6px":"8px"}}>
          {/* HUD */}
          <div style={{...sectionPanel(S,playAccent),boxShadow:playShadow,padding:0,overflow:"hidden",position:"relative",isolation:"isolate"}}>
            {/* Aikajana palkin sisällä: tummempi täyttö kutistuu oikealta vasemmalle; pyöristetty reuna leikkaa sen siististi */}
            {gameTime!==0&&(
              <div aria-hidden="true" style={{position:"absolute",left:0,top:0,bottom:0,zIndex:-1,pointerEvents:"none",
                width:`${Math.max(0,Math.min(1,time/gameTime))*100}%`,
                background:time<=15?alpha(S.red,"40"):alpha(S.border,"a0"),
                transition:"width 0.3s linear, background 0.5s"}}/>
            )}

            {mode==="multi"&&gameMode==="battle"&&<div style={{textAlign:"center",padding:"1px",fontSize:"11px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"4px"}}><Icon icon="swords" color={S.purple} size={1}/>{t.battleLabel}</div>}
            {mode==="solo"&&soloMode==="tetris"&&<div style={{textAlign:"center",padding:"1px",fontSize:"11px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"4px"}}><Icon icon="arrow" color={S.purple} size={1}/>{t.tetrisLabel}</div>}
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
            {dailyMode&&dailyTheme&&<div style={{textAlign:"center",padding:"3px",fontSize:"12px",color:S.yellow||"#ffcc00",background:`${S.yellow||"#ffcc00"}11`,borderBottom:`1px solid ${S.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:"5px",fontStyle:"italic"}}>{lang==="en"?"Theme":lang==="sv"?"Tema":"Teema"}: {lang==="en"?dailyTheme.nameEn||dailyTheme.name:lang==="sv"?dailyTheme.nameSv||dailyTheme.name:dailyTheme.name}<span style={{fontSize:"10px",opacity:0.7,marginLeft:"4px"}}>🎯 {dailyThemeFound.length>0?<span style={{fontWeight:"700",opacity:1}}>+{dailyThemeFound.length*10}p</span>:lang==="en"?"+10p/theme word":lang==="sv"?"+10p/temaord":"+10p/teemasana"}</span></div>}
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
            <div ref={wordBarRef} key={flashKey} style={{padding:S.cellGradient?"4px 10px":"2px 8px",textAlign:"center",position:"relative",animation:"none",background:"transparent",borderRadius:S.cellGradient?"0 0 12px 12px":"0"}}>
              {/* Hamburger menu button */}
              <button onClick={()=>setShowHamburger(true)} style={{position:"absolute",left:"6px",top:"50%",transform:"translateY(-50%)",background:"transparent",border:`1px solid ${S.textMuted}44`,padding:"4px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"8px",transition:"all 0.15s",zIndex:2,fontSize:"20px",color:S.textMuted,lineHeight:1}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=S.green;e.currentTarget.style.background=S.green+"15";e.currentTarget.style.color=S.green;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=S.textMuted+"44";e.currentTarget.style.background="transparent";e.currentTarget.style.color=S.textMuted;}}>
                &#9776;
              </button>
              <div style={{fontSize:S.cellGradient?"clamp(14px,7cqw,28px)":"clamp(11px,4.5cqw,18px)",minHeight:"1.15em",fontWeight:S.cellGradient?"700":"normal",letterSpacing:S.cellGradient?"3px":"0",animation:shake?"shake 0.4s":(!word&&msg?.ok?"scoreJump 0.4s ease-out":"none"),color:word?wordColor(word.length):undefined,transition:"all 0.15s ease"}}>
                {state==="ending"?<span style={{color:ending?.color,fontSize:S.cellGradient?"18px":"16px",animation:"pulse 1s infinite"}}>{ending?.emoji} {ending?.name}</span>:
                 word?word.toUpperCase():
                 (msg?<span style={{color:msg.ok?S.green:S.red,fontSize:msg.ok?(S.cellGradient?"16px":"12px"):(S.cellGradient?"14px":"10px"),fontWeight:msg.ok?"bold":"normal"}}>{msg.ok?`${msg.t?.toUpperCase()} +${msg.p}p${msg.combo>=3?` ${T[lang]?.combo||"COMBO"}!`:""}`:msg.m}</span>:<span style={{color:S.textMuted,fontSize:S.cellGradient?"20px":"18px"}}>···</span>)}
              </div>
              {(mode==="multi"||mode==="public")&&<span style={{position:"absolute",right:"4px",top:"50%",transform:"translateY(-50%)",fontSize:"13px",color:S.textMuted,display:"flex",alignItems:"center",gap:"6px",padding:"4px 8px"}}>
                <span style={{display:"flex",alignItems:"center",gap:"3px"}}><Icon icon="person" color={S.textMuted} size={1.5}/>{mode==="public"?publicPlayerCount:players.length}</span>
                <button onClick={e=>{e.stopPropagation();setEmojiOpen(o=>o==="open"?false:"open");}} style={{background:emojiOpen==="open"?S.green+"22":"transparent",border:`1px solid ${emojiOpen==="open"?S.green+"66":S.textMuted+"44"}`,padding:"2px 6px",cursor:"pointer",borderRadius:"6px",fontSize:"14px",lineHeight:1,transition:"all 0.15s",color:emojiOpen==="open"?S.green:S.textMuted}} onMouseEnter={e=>{e.currentTarget.style.borderColor=S.green;e.currentTarget.style.color=S.green;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=emojiOpen==="open"?S.green+"66":S.textMuted+"44";e.currentTarget.style.color=emojiOpen==="open"?S.green:S.textMuted;}}>💬</button>
              </span>}
            </div>
          </div>

          {/* Emoji picker dropdown - multiplayer only — absolute, anchored to HUD wrapper */}
          {(mode==="multi"||mode==="public")&&emojiOpen==="open"&&socket&&state==="play"&&(
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,animation:"fadeIn 0.15s ease",pointerEvents:"none"}} onClick={()=>setEmojiOpen(false)}>
              <div style={{background:`${S.dark}f0`,border:`1px solid ${S.border}`,borderRadius:"12px",padding:"8px",margin:"2px 0",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",boxShadow:"0 4px 16px #00000033",pointerEvents:"auto"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:"2px"}}>
                  {["😀","😎","🤔","😮","🔥","💪","🎯","👀","😭","🤣","😱","🥳","👏","❤️","💀","🫡"].map(em=>(
                    <button key={em} onClick={()=>{socket.emit("emoji_reaction",{emoji:em});setEmojiOpen(false);}}
                      style={{fontSize:"20px",padding:"6px",background:"transparent",border:"none",borderRadius:"8px",cursor:"pointer",lineHeight:1,
                      transition:"transform 0.12s, background 0.12s"}}
                      onMouseDown={e=>{e.currentTarget.style.transform="scale(1.2)";e.currentTarget.style.background=S.green+"22";}}
                      onMouseUp={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}
                      onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}
                      onTouchStart={e=>{e.currentTarget.style.transform="scale(1.2)";e.currentTarget.style.background=S.green+"22";}}
                      onTouchEnd={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.background="transparent";}}>{em}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {/* Hymiöt: pienet puhekuplat HUDin alla oikeassa yläkulmassa – feidaavat esiin ja haihtuvat */}
          {(mode==="multi"||mode==="public")&&emojiFeed.length>0&&state==="play"&&(
            <div style={{position:"absolute",top:"100%",right:"4px",zIndex:40,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px",paddingTop:"8px",pointerEvents:"none"}}>
              {emojiFeed.slice(-3).map(e=>(
                <div key={e.id} style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",
                  padding:"5px 10px 4px",minWidth:"44px",
                  background:S.cell||S.dark,border:`2px solid ${S.green}`,
                  borderRadius:"16px 4px 16px 16px",
                  boxShadow:"0 4px 12px rgba(0,0,0,0.3)",
                  animation:e.fading?"emojiBubbleOut 0.8s ease forwards":"emojiBubbleIn 0.35s ease-out"}}>
                  <span style={{fontSize:"24px",lineHeight:1.1}}>{e.emoji}</span>
                  <span style={{fontSize:"9px",color:S.textSoft||S.textMuted,fontFamily:S.font,fontWeight:"700",letterSpacing:"0.5px",maxWidth:"80px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:"1px"}}>{e.nickname}</span>
                </div>
              ))}
            </div>
          )}
          </div>{/* end HUD + emoji picker wrapper */}

          {/* Battle mode: flash when someone finds a word */}
          {gameMode==="battle"&&battleMsg&&state==="play"&&(
            <div style={{textAlign:"center",fontSize:"13px",padding:"4px 8px",marginBottom:"4px",background:battleMsg.finderId===playerId?"#00ff8822":"#ff66aa22",border:`1px solid ${battleMsg.finderId===playerId?S.green:"#ff66aa"}`,color:battleMsg.finderId===playerId?S.green:"#ff66aa",animation:"fadeIn 0.5s ease"}}>
              {battleMsg.finder}: {battleMsg.word.toUpperCase()} +{battleMsg.points}p
            </div>
          )}

          {/* Combo banner poistettu – combo-info näkyy inline sanapalkissa (rivi ~5287) */}

          {/* Exit confirmation overlay */}
          {showExitConfirm&&(
            <div style={{position:"absolute",top:0,left:0,right:0,bottom:0,background:"#000000cc",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.2s ease",borderRadius:"8px"}} onClick={()=>setShowExitConfirm(false)}>
              <div style={{background:S.dark,border:`2px solid ${S.red}`,borderRadius:S.panelRadius,padding:"24px 28px",textAlign:"center",boxShadow:`0 0 30px ${S.red}33`}} onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:"16px",color:S.red,fontFamily:S.font,fontWeight:"700",marginBottom:"16px"}}>{t.exitConfirm}</div>
                <div style={{display:"flex",gap:"12px",justifyContent:"center"}}>
                  <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.red} label={t.exitYes} onClick={()=>{setShowExitConfirm(false);returnToModeSelect();}}/>
                  <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.green} label={t.exitNo} onClick={()=>setShowExitConfirm(false)}/>
                </div>
              </div>
            </div>
          )}





          {/* GRID – containerType antaa cqw-yksiköt kirjainkoolle; kehys samaa tyyliä kuin loppuruudun paneelit */}
          <div style={{position:"relative",containerType:"inline-size",...sectionPanel(S,combo>=3&&state==="play"?S.yellow:ending?ending.color:playAccent),boxShadow:playShadow,padding:isHexMode?"4px":"6px",transition:"border-color 0.3s, box-shadow 0.3s"}}>
            {shapeBoard&&gridFitsBoard(mode==="multi"?currentMultiGrid:grid,shapeBoard)?(
              <>
              <ShapeBoard
                board={shapeBoard}
                grid={mode==="multi"?currentMultiGrid:grid}
                gRef={gRef}
                S={S}
                isLight={S.flavor==="ivory"||S.flavor==="dream"}
                sel={sel}
                state={state}
                eatenCells={eatenCells}
                ending={ending}
                scrambleGrid={scrambleGrid}
                scrambleStep={scrambleStep}
                settledCells={settledCells}
                letterMult={letterMult}
                letterColor={(l)=>letterColor(l,lang)}
                letterValue={(l)=>getLetterValues(lang)[l]||1}
                dropKey={dropKey}
                onPointerDownAt={(x,y)=>{if(state!=="play")return;const cell=cellAt(x,y,null);if(cell)onDragStart(cell.r,cell.c);}}
                onTouchMoveAt={(x,y)=>onDragMove(x,y)}
              />
              {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true} lang={lang}/>}
              </>
            ):(soloMode==="hex"||mode==="multi"||(mode==="public"&&publicHex))?(
            <div ref={gRef}
              onTouchMove={e=>{e.preventDefault();onDragMove(e.touches[0].clientX,e.touches[0].clientY);}}
              style={{padding:isLarge?"4px 0":"2px 0",background:"transparent",
                touchAction:"none",position:"relative"}}>
              {(()=>{const isLight=S.flavor==="ivory"||S.flavor==="dream";const hexGrid=mode==="multi"?currentMultiGrid:grid;return hexGrid.map((row,r)=>(
                <div key={r} style={{display:"flex",justifyContent:"center",gap:"0px",
                  marginTop:r>0?"-5.254%":"0",
                  transform:r%2===1?"translateX(calc(18.2% / 4))":"translateX(calc(-18.2% / 4))",
                  position:"relative",zIndex:hexGrid.length-r}}>
                  {row.map((letter,c)=>{
                    const s=isSel(r,c);
                    const last=sel.length>0&&sel[sel.length-1].r===r&&sel[sel.length-1].c===c;
                    const hexCols=row.length;
                    const cellIdx=r*hexCols+c;
                    const eaten=eatenCells.has(cellIdx);
                    const totalHexCells=hexGrid.length*hexCols;
                    const endAnim=eaten&&ending?ending.cellAnim(cellIdx,totalHexCells):"none";
                    const endColor=eaten&&ending?ending.cellColor(cellIdx):null;
                    const isScrambling=state==="scramble"||(state==="ending"&&scrambleGrid);
                    const settled=state==="scramble"&&(scrambleStep>cellIdx||settledCells.has(cellIdx));
                    const scrambleLetter=isScrambling&&scrambleGrid?scrambleGrid[r]?.[c]||letter:letter;
                    const displayLetter=isScrambling&&!settled&&scrambleGrid?scrambleLetter:letter;
                    const scrambleColor=isScrambling&&!settled?`hsl(${(cellIdx*37+scrambleStep*73)%360},70%,65%)`:null;
                    const hexClip="polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
                    const hexClipInner="polygon(50% 4%, 96% 27%, 96% 73%, 50% 96%, 4% 73%, 4% 27%)";
                    // Border: bright & visible in all themes; selected = aurora prismatic
                    const selIdx=s?sel.findIndex(p=>p.r===r&&p.c===c):-1;
                    const borderBg=eaten?"transparent":s?`linear-gradient(${120+selIdx*60}deg, #00ffaa, #44bbff, #aa66ff, #ff66aa, #ffaa44, #00ffaa)`:(S.cellBorder||S.border);
                    const innerInset=s?"3px":"2px";
                    const cellBg=eaten?(S.gridBg||"#111133"):s?`linear-gradient(${160+selIdx*30}deg, ${S.cell}ee 0%, ${S.cell}cc 40%, ${S.dark||S.cell}dd 100%)`:S.cellGradient?`linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)`:S.cell;
                    return(
                      <div key={`${r}-${c}-${dropKey}`} data-c={`${r},${c}`}
                        onMouseDown={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                        onTouchStart={e=>{if(state==="play"){e.preventDefault();onDragStart(r,c);}}}
                        style={{
                          width:"18.2%",aspectRatio:"0.866",
                          position:"relative",
                          clipPath:hexClip,
                          cursor:state==="play"?"pointer":"default",
                          transition:"transform 0.12s ease-out",
                          transform:s?(last?"translateY(3px) scale(0.96)":"translateY(2px) scale(0.97)"):"none",
                          animation:eaten?endAnim:(isScrambling&&settled?"pop 0.2s ease":"none"),
                          zIndex:s?10:0,
                          "--ex":`${((c-Math.floor(hexCols/2))*40)}px`,"--ey":`${((r-Math.floor(grid.length/2))*40)}px`,
                        }}>
                        {/* Drop shadow — disappears when pressed */}
                        {!eaten&&!s&&<div style={{position:"absolute",inset:"-1px",top:"2px",clipPath:hexClip,
                          background:isLight?"#00000010":"#00000044",
                          filter:"blur(3px)",
                          pointerEvents:"none"}}/>}
                        {/* Base hex — soft rim for 3D depth */}
                        <div style={{position:"absolute",inset:s?"-2px":"0",clipPath:hexClip,
                          background:s?borderBg:(isLight
                            ?`linear-gradient(180deg, #ece8e2 0%, #e0dbd4 40%, #d4cec6 100%)`
                            :`linear-gradient(175deg, ${S.cellBorder||S.border} 0%, #111111 100%)`),
                          backgroundSize:s?"300% 100%":"100% 100%",
                          animation:s?`hexPrismatic 6s linear infinite, hexAuroraShift 8s ease-in-out infinite`:"none",
                          transition:"background 0.2s ease, inset 0.2s ease",
                          boxShadow:s?`0 0 12px ${S.green}88, inset 0 0 6px #ffffff22`:"none"}}/>
                        {/* Glow ring behind selected cell */}
                        {s&&!isScrambling&&<div style={{position:"absolute",inset:"-4px",clipPath:hexClip,
                          background:`radial-gradient(ellipse at 50% 50%, ${S.green}44 0%, transparent 60%)`,
                          pointerEvents:"none"}}/>}
                        {/* Pillow face — convex ceramic surface */}
                        <div style={{position:"absolute",inset:"1.5px",top:"1px",bottom:"2.5px",clipPath:hexClipInner,
                          background:eaten?(S.gridBg||"#111133"):(isLight
                            ?`radial-gradient(ellipse 80% 75% at 48% 45%, #ffffff 0%, #fefefe 25%, #faf8f5 45%, #f2eeea 65%, #e8e4de 85%, #ddd8d0 100%)`
                            :(s?cellBg:`radial-gradient(ellipse at 40% 35%, ${S.cell} 0%, ${S.cell}dd 40%, ${S.dark||S.cell}bb 80%, ${S.dark||S.cell}99 100%)`)),
                          display:"flex",alignItems:"center",justifyContent:"center",
                          fontSize:isLarge?"clamp(12px,7.5cqw,42px)":"clamp(11px,6.5cqw,36px)",
                          fontFamily:S.letterFont,fontWeight:"500",
                          textTransform:"uppercase",
                          transition:"all 0.2s ease",
                          color:eaten?endColor||"transparent":scrambleColor||(s?"#ffffff":(letterMult?letterColor(letter,lang):(S.cellText||(S.cellGradient?"#e6eef8":"#22ccaa")))),
                          textShadow:eaten?"none":s?`0 0 8px ${S.green}99, 0 1px 2px #000000cc`:(isLight?`0 1px 0 #ffffff88`:`0 1px 2px #000000aa`),
                        }}>
                          {/* Specular highlight — double-layer ceramic glaze reflection */}
                          {!eaten&&<div style={{position:"absolute",inset:0,clipPath:hexClipInner,
                            background:isLight
                              ?`radial-gradient(ellipse 50% 40% at 38% 30%, #ffffffee 0%, #ffffffaa 20%, #ffffff44 40%, transparent 65%), radial-gradient(ellipse 30% 25% at 32% 25%, #ffffff 0%, transparent 50%)`
                              :`radial-gradient(ellipse at 35% 28%, #ffffff22 0%, #ffffff11 20%, transparent 50%)`,
                            pointerEvents:"none",zIndex:0}}/>}
                          {/* Bottom-right shadow — strong edge darkening for convex ceramic shape */}
                          {!eaten&&<div style={{position:"absolute",inset:0,clipPath:hexClipInner,
                            background:isLight
                              ?`radial-gradient(ellipse 50% 40% at 68% 75%, #00000010 0%, #00000006 30%, transparent 55%)`
                              :`radial-gradient(ellipse at 70% 75%, #00000033 0%, #00000015 30%, transparent 60%)`,
                            pointerEvents:"none",zIndex:0}}/>}
                          {eaten?"":<>
                            {/* Letter */}
                            <span style={{position:"relative",zIndex:2,
                              transition:"transform 0.15s ease, text-shadow 0.15s ease, filter 0.15s ease",
                              transform:"none",
                              filter:s?`drop-shadow(0 0 3px ${S.green}88)`:"none",
                            }}>{displayLetter}</span>
                            {/* Prismatic light sweep on selected cells */}
                            {s&&!isScrambling&&<>
                              <span style={{position:"absolute",inset:0,
                                background:`linear-gradient(135deg, transparent 20%, rgba(255,255,255,0.25) 35%, rgba(68,255,170,0.12) 45%, rgba(136,102,255,0.12) 55%, rgba(255,255,255,0.2) 65%, transparent 80%)`,
                                backgroundSize:"300% 300%",
                                animation:"hexPrismatic 8s ease-in-out infinite",
                                pointerEvents:"none",zIndex:1,clipPath:hexClipInner}}/>
                              <span style={{position:"absolute",inset:0,
                                background:`radial-gradient(circle at ${30+selIdx*10}% ${25+selIdx*8}%, rgba(255,255,255,0.3) 0%, transparent 50%)`,
                                pointerEvents:"none",zIndex:1}}/>
                            </>}
                            {letterMult&&!isScrambling&&<span style={{position:"absolute",bottom:"4px",right:"6px",fontSize:"clamp(8px,2vw,11px)",fontFamily:"'Press Start 2P',monospace",color:s?"#ffffff":letterColor(letter,lang),opacity:s?0.9:0.7,lineHeight:1,zIndex:3}}>{getLetterValues(lang)[letter]||1}</span>}
                          </>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));})()}
              {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true} lang={lang}/>}
            </div>
            ):(<>
            <div ref={gRef} className="piilosana-grid"
              onTouchMove={e=>{e.preventDefault();onDragMove(e.touches[0].clientX,e.touches[0].clientY);}}
              style={{display:"grid",gridTemplateColumns:`repeat(${soloMode==="chess"?CHESS_SZ:SZ},1fr)`,gap:soloMode==="chess"?"2px":(S.gridGap!=="0px"?S.gridGap:isLarge?"6px":"4px"),padding:soloMode==="chess"?"4px":(isLarge?"8px":"6px"),background:S.gridBg||"#111133",
                border:"none",
                boxShadow:combo>=5?`0 0 30px ${S.purple}66`:combo>=3?`0 0 20px ${S.yellow}44`:"none",
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
                      fontSize:isChessMode?"clamp(10px,4.5cqw,22px)":(isLarge?"clamp(14px,10cqw,56px)":"clamp(12px,8cqw,48px)"),fontFamily:S.letterFont,fontWeight:"700",
                      letterSpacing:S.cellGradient?"1px":"0",
                      color:eaten?endColor||"transparent":scrambleColor||(chessIsPos?"#ddaa33":chessInPath?"#ddaa33":chessIsInvalid?"#ff4444":s?(S.cellTextSel||"#0f1720"):otherSelColor||(letterMult?letterColor(letter,lang):(S.cellText||(S.cellGradient?"#e6eef8":S.green)))),
                      background:eaten?(S.gridBg||"#111133"):chessIsPos?"#ddaa3355":chessInPath?"#ddaa3330":chessIsValid?"#ddaa3320":chessIsInvalid?"#ff444433":(isChessMode&&chessPlacing&&chessBottomRow)?"#ddaa3322":isChessMode?(chessSquareLight?"#2a2a3a":"#1a1a28"):last?S.yellow:s?S.green:otherSelColor?otherSelColor+"33":(soloMode==="bomb"&&bombCell&&r===bombCell.r&&c===bombCell.c)?`linear-gradient(135deg, #ff444433 0%, #ff880033 100%)`:(soloMode==="mystery"&&mysteryCell&&r===mysteryCell.r&&c===mysteryCell.c&&!mysteryRevealed)?`linear-gradient(135deg, #aa66ff33 0%, #6644ff33 100%)`:S.cellGradient?`linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)`:S.cell,
                      border:chessIsPos?`2px solid #ddaa33`:chessIsValid?`2px dashed #ddaa3366`:chessIsInvalid?`2px solid #ff4444`:chessInPath?`2px solid #ddaa3355`:S.cellGradient?`1px solid ${eaten?(S.gridBg||"#111133"):s?S.green:otherSelColor||S.cellBorder}`:`2px solid ${eaten?(S.gridBg||"#111133"):s?S.green:otherSelColor||S.cellBorder}`,
                      borderRadius:S.cellRadius,
                      cursor:state==="play"?(rotateActive?"grab":"pointer"):"default",transition:isScrambling?"color 0.07s, transform 0.15s":(S.cellGradient?"all 0.15s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)":"all 0.1s"),transform:cellTransform,
                      boxShadow:eaten?"none":isScrambling&&settled?`0 0 12px ${S.green}66`:(s?(S.cellGradient?`0 0 16px ${S.green}55, inset 0 0 8px ${S.green}22`:`0 0 12px ${S.green}66`):otherSelColor?`0 0 8px ${otherSelColor}44`:((S.flavor==="ivory"||S.flavor==="dream")?"inset 0 1px 2px #ffffff88, inset 0 -2px 4px #00000018, 0 2px 5px #00000020, 0 1px 2px #00000015":(S.cellShadow?(S.cellShadow+", inset 0 1px 3px #ffffff12, inset 0 -1px 3px #00000030, 0 2px 4px #00000044"):("inset 0 1px 3px #ffffff12, inset 0 -1px 3px #00000030, 0 2px 4px #00000044")))),
                      textTransform:"uppercase",textShadow:isScrambling&&!settled?`0 0 8px ${scrambleColor}88`:(s||eaten?"none":((S.flavor==="ivory"||S.flavor==="dream")?`0 1px 1px #00000025`:`0 1px 2px #000000aa`)),
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
            {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true} lang={lang}/>}
            {/* Rotate mode: visual overlay when in rotate-active state */}
            {soloMode==="rotate"&&state==="play"&&rotateActive&&(
              <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:10,
                border:"3px solid #ff9900",borderRadius:S.cellRadius!=="0px"?"16px":"0px",
                boxShadow:"inset 0 0 20px #ff990033, 0 0 20px #ff990022"}}/>
            )}
            </>)}
          </div>

          {/* Löydetyt: kiinteä korkeus ja mukana jo sekoitus-/lopetusvaiheessa, ettei lauta liikahda */}
          {(state==="play"||state==="scramble"||state==="ending")&&(
            <div className="piilosana-found" style={{...sectionPanel(S,playAccent),boxShadow:playShadow,marginTop:isHexMode?"6px":"10px",padding:"6px 8px",height:"clamp(60px,13vh,104px)",flexShrink:0,boxSizing:"border-box",overflowY:"auto"}}>
              <div style={{fontSize:"15px",fontWeight:"700",color:S.textSoft||S.textMuted,marginBottom:"4px",display:"flex",alignItems:"baseline",gap:"6px"}}>
                <span style={{fontSize:"12px",fontWeight:"600",letterSpacing:"1px",textTransform:"uppercase",color:S.textMuted}}>{t.found}</span>
                {(gameMode==="battle"||(mode==="solo"&&(soloMode==="tetris"||soloMode==="rotate"||soloMode==="chess")))
                  ?<span style={{color:S.green,fontVariantNumeric:"tabular-nums"}}>{found.length}</span>
                  :<><span style={{color:S.green,fontVariantNumeric:"tabular-nums"}}>{found.length}<span style={{color:S.textMuted,fontWeight:"600"}}> / {valid.size}</span></span>
                    <span style={{color:S.textMuted,fontVariantNumeric:"tabular-nums"}}>{valid.size>0?Math.round(found.length/valid.size*100):0}%</span></>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px"}}>
                {found.length===0?null:
                  [...found].reverse().map((w,i)=>(
                    <span key={w} onClick={e=>showDef(w,e)} style={{fontSize:"14px",...wordChip(wordColor(w.length)),padding:"1px 5px",animation:i===0?"pop 0.3s ease":"none",cursor:DEFS&&DEFS[w.toLowerCase()]?"pointer":"default",textDecoration:DEFS&&DEFS[w.toLowerCase()]?"underline dotted":"none",textUnderlineOffset:"3px"}}>
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
          <div style={{position:"relative",zIndex:1,...heroPanel(S,dailyMode?S.yellow:S.green),marginBottom:"18px"}}>
            {dailyMode?<><div style={{fontSize:"15px",color:S.yellow||"#ffcc00",marginBottom:"4px",fontWeight:"700"}}>{t.daily} {dateLabel(dailyDate,lang).short}</div>
            {dailyTheme&&<div style={{fontSize:"12px",color:S.textMuted,marginBottom:"6px",fontStyle:"italic"}}>{lang==="en"?"Theme":lang==="sv"?"Tema":"Teema"}: {lang==="en"?dailyTheme.nameEn||dailyTheme.name:lang==="sv"?dailyTheme.nameSv||dailyTheme.name:dailyTheme.name}</div>}</>
            :<div style={{fontSize:"13px",color:ending?.color||S.yellow,marginBottom:"4px"}}>{ending?.emoji} {ending?endingDesc(ending,lang):(lang==="sv"?"Spelet är slut!":lang==="en"?"Game over!":"Peli päättyi!")}</div>}
            {!dailyMode&&(()=>{const m=gameTime===0?(lang==="en"?"unlimited":lang==="sv"?"obegränsad":"rajaton"):gameTime===402?"6,7 min":`${Math.round(gameTime/60)} min`;return(<div style={{fontSize:"12px",color:S.textMuted,marginBottom:"6px",letterSpacing:"1px",fontWeight:"600"}}>{m}</div>);})()}
            <div style={{fontSize:"13px",color:S.textMuted,marginBottom:"10px"}}>{t.score}</div>
            <div style={{fontSize:"40px",color:S.green,marginBottom:"4px",animation:"pop 0.3s ease",fontWeight:"800",letterSpacing:"2px"}}>{score}<span style={{fontSize:"16px",color:S.textMuted,fontWeight:"400"}}>p</span>{(soloMode==="normal"&&gameTime!==0)?<span style={{fontSize:"16px",color:S.textMuted,fontWeight:"400"}}> / {totalPossible}p</span>:null}</div>
            {(soloMode!=="normal"||gameTime===0)?<div style={{fontSize:"13px",color:S.textMuted,marginTop:"6px"}}>{found.length} {t.words}</div>:<>
            <div style={{fontSize:"13px",color:S.textSoft,marginTop:"6px"}}>{found.length} / {valid.size} {t.words} ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            </>}

            {/* Hall of Fame submit — skip for daily mode (auto-saved) */}
            {!dailyMode&&gameTime!==0&&score>0&&!hofSubmitted&&(
              <div style={{marginTop:"16px",padding:"14px",border:`2px solid ${S.yellow}`,background:`${S.yellow}1a`,borderRadius:"12px"}}>
                {soloNickname.trim()?(
                  <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.yellow} label={`${t.saveAs} ${soloNickname.trim()}`} onClick={async()=>{
                    await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                      wordsTotal:valid.size,gameMode:soloMode,gameTime,lang,shape:boardShape});
                    setHofSubmitted(true);
                  }}/>
                ):(
                  <>
                    <div style={{fontSize:"13px",color:S.yellow,marginBottom:"6px"}}>{t.saveToHof}</div>
                    <div style={{display:"flex",gap:"6px",justifyContent:"center",alignItems:"center"}}>
                      <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
                        placeholder={t.nickname} style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:S.dark,
                        border:`2px solid ${S.green}`,padding:"8px",width:"140px",textAlign:"center",outline:"none"}}/>
                      <GlossyButton S={S} size="sm" width="auto" color={GLOSSY.yellow} label={t.save} disabled={!soloNickname.trim()} onClick={async()=>{
                        if(!soloNickname.trim())return;
                        await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                          wordsTotal:valid.size,gameMode:soloMode,gameTime,lang,shape:boardShape});
                        setHofSubmitted(true);
                      }}/>
                    </div>
                  </>
                )}
              </div>
            )}
            {!dailyMode&&hofSubmitted&&<div style={{fontSize:"13px",color:S.green,marginTop:"8px"}}>{t.saved}</div>}

            {/* Share result */}
            <div style={{display:"flex",justifyContent:"center",marginTop:"14px"}}>
            <GlossyButton S={S} size="sm" width="280px" color={GLOSSY.orange} label={t.share} onClick={async()=>{
              const text=t.shareText.replace("{words}",found.length).replace("{score}",score)+"\nhttps://piilosana.up.railway.app";
              if(navigator.share){try{await navigator.share({text});return;}catch{}}
              try{await navigator.clipboard.writeText(text);addPopup(t.shareCopied,S.green);}catch{}
            }}/>
            </div>

            <AdBanner/>

            {dailyMode&&(()=>{
              const dr=dailyResult||getDailyResultForDate(dailyDate,lang);
              const dl=dateLabel(dailyDate,lang);
              if(!dr)return null;
              return(
                <DailyEndResult
                  S={S}
                  t={t}
                  lang={lang}
                  dateStr={dailyDate}
                  dateLabel={dl}
                  result={dr}
                  onShare={shareDailyResult}
                  shareMsg={dailyShareMsg}
                  themeFound={dailyThemeFound.length}
                  themeBonusGiven={dailyThemeBonusGiven}
                  themeBonus={DAILY_THEME_BONUS}
                  themeThreshold={DAILY_THEME_THRESHOLD}
                  themeName={dailyTheme?(lang==="en"?dailyTheme.nameEn||dailyTheme.name:lang==="sv"?dailyTheme.nameSv||dailyTheme.name:dailyTheme.name):null}
                />
              );
            })()}

            <div style={{display:"flex",flexDirection:"column",gap:"10px",alignItems:"center",marginTop:"14px"}}>
              <GlossyButton S={S} size="md" width="280px" color={GLOSSY.green} label={t.backToMenu} onClick={returnToModeSelect}/>
              <GlossyButton S={S} size="md" width="280px" color={GLOSSY.blue} label={t.joinMulti} onClick={()=>{
                // Vie nykyiseen online-peliin (sama kuin alkuvalikon ONLINE-PELI), ei vanhoihin huoneisiin
                returnToModeSelect();
                sounds.init().catch(()=>{});
                setMode("public");
                if(authUser){setPublicState("waiting");}else{setPublicState("nickname");}
              }}/>
            </div>
          </div>

          {found.length>0&&(
            <div style={{...sectionPanel(S,S.green),marginBottom:"14px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={sectionTitle(S.green)}>{t.foundOf} ({found.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {[...found].sort((a,b)=>b.length-a.length).map((w,i)=>{
                  const isTheme=dailyMode&&dailyTheme&&isThemeWord(w,dailyTheme);
                  return(
                  <span key={i} onClick={e=>showDef(w,e)} style={{fontSize:"14px",...wordChip(isTheme?(S.yellow||"#ffcc00"):wordColor(w.length)),cursor:DEFS&&DEFS[w.toLowerCase()]?"pointer":"default",textDecoration:DEFS&&DEFS[w.toLowerCase()]?"underline dotted":"none",textUnderlineOffset:"3px"}}>{isTheme?"🎯 ":""}{w.toUpperCase()}</span>
                  );})}
              </div>
            </div>
          )}

          {soloMode==="normal"&&gameTime!==0&&missed.length>0&&(
            <div style={{...sectionPanel(S,"#ff5a5a"),textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={sectionTitle("#ff5a5a")}>{t.missed} ({missed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {missed.map((w,i)=>(
                  <span key={i} onClick={e=>showDef(w,e)} style={{fontSize:"14px",...wordChip("#ff5a5a"),cursor:DEFS&&DEFS[w.toLowerCase()]?"pointer":"default",textDecoration:DEFS&&DEFS[w.toLowerCase()]?"underline dotted":"none",textUnderlineOffset:"3px"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              {lang==="fi"&&<div style={{fontSize:"12px",color:S.textMuted,marginTop:"8px",fontStyle:"italic"}}>{t.missedLong||"Laudalta löytyi myös pidempiä sanoja"}</div>}
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame gameMode={soloMode} gameTime={gameTime} currentScore={hofSubmitted?score:null} S={S} lang={lang}/>
        </div>
      )}

      {/* Universal hamburger menu overlay */}
      {showHamburger&&(
        <HamburgerMenu
          S={S}
          t={t}
          lang={lang}
          Icon={Icon}
          sound={soundTheme==="modern"}
          music={musicOn}
          musicTrack={musicTrack}
          musicTracks={musicTracks}
          theme={themeId}
          themes={THEMES}
          size={uiSize}
          confetti={confettiOn}
          muteEmojis={muteEmojis}
          inMultiplayer={mode==="multi"||mode==="public"}
          inActiveGame={state==="play"||state==="ending"||state==="scramble"}
          hasMode={mode!==null}
          onSoundToggle={()=>{
            const next=soundTheme==="modern"?"off":"modern";
            setSoundTheme(next);
            localStorage.setItem("piilosana_sound",next);
          }}
          onMusicToggle={()=>{
            const next=!musicOn;
            setMusicOn(next);
            localStorage.setItem("piilosana_music",next?"on":"off");
            if(!next&&music)music.stop();
          }}
          onMusicTrackChange={(i)=>{
            setMusicTrack(i);
            localStorage.setItem("piilosana_music_track",String(i));
          }}
          onThemeChange={(id)=>{
            setThemeId(id);
            localStorage.setItem("piilosana_theme",id);
            if(typeof syncSettings==="function")syncSettings({theme:id});
          }}
          onSizeChange={(id)=>{
            setUiSize(id);
            localStorage.setItem("piilosana_size",id);
            if(typeof syncSettings==="function")syncSettings({size:id});
          }}
          onConfettiToggle={()=>{
            const v=!confettiOn;
            setConfettiOn(v);
            localStorage.setItem("piilosana_confetti",v?"on":"off");
            if(typeof syncSettings==="function")syncSettings({confetti:v});
          }}
          onMuteEmojisToggle={()=>{
            const next=!muteEmojis;
            setMuteEmojis(next);
            localStorage.setItem("piilosana_mute_emoji",next?"on":"off");
          }}
          onShare={()=>{setShowHamburger(false);setShowSharePopup(true);}}
          onExit={()=>{
            setShowHamburger(false);
            if(mode==="solo"&&(state==="play"||state==="ending"||state==="scramble")){
              setShowExitConfirm(true);
            }else{
              returnToModeSelect();
            }
          }}
          onClose={()=>setShowHamburger(false)}
        />
      )}

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

      {/* Electric Blue – pulsing cyan glow */}
      {themeId==="electric"&&(
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
          <div style={{position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",width:"60%",height:"40%",
            background:"radial-gradient(ellipse at center,rgba(0,229,255,0.06) 0%,transparent 70%)",
            animation:"electricPulse 3s ease-in-out infinite"}}/>
          <div style={{position:"absolute",top:"20%",left:"10%",width:"40%",height:"40%",
            background:"radial-gradient(ellipse at center,rgba(118,255,3,0.03) 0%,transparent 60%)",
            animation:"electricPulse 5s ease-in-out infinite 1.5s"}}/>
        </div>
      )}

      {/* Retro – scanlines + neon glow */}
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
