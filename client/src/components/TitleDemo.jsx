// TitleDemo.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useState, useRef, useEffect } from "react";

// ============================================
// TITLE DEMO COMPONENT - shows word-finding animation in menu
// ============================================
// Per-language titles and demo words (subsequences to highlight)
// Activity-ring inspired title colors: red, lime-green, cyan, purple
const TITLE_COLORS=["#FF2D55","#FF375F","#E8254A","#A8FF00","#8CE600","#00E5FF","#00C8E0","#BF5AF2","#A040D0"];
function titleColor(i,len){
  // Spread the 4 ring colors across the title letters
  const colors=["#FF2D55","#FF6040","#A8FF00","#70E000","#00E5FF","#00C8E0","#BF5AF2","#A040D0","#FF2D55"];
  return colors[i%colors.length];
}
function titleShadow(color){return `2px 2px 0 ${color}44, 0 0 16px ${color}66`;}
const TITLE_CONFIG={
  fi:{
    title:"SANAPIILO",
    gearIdx:4, // the P in SANA⚙IILO
    // S(0) A(1) N(2) A(3) P(4) I(5) I(6) L(7) O(8)
    demos:[
      {word:"SANA",indices:[0,1,2,3],color:"#44ff88"},
      {word:"PII",indices:[4,5,6],color:"#4488ff"},
      {word:"ILO",indices:[6,7,8],color:"#ff8844"},
      {word:"PIILO",indices:[4,5,6,7,8],color:"#ff44cc"},
      {word:"SANAPIILO",indices:[0,1,2,3,4,5,6,7,8],color:"#ff6644"},
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
    title:"ORDLETARE",
    gearIdx:5, // the A in ORDLE⚙ARE
    // O(0) R(1) D(2) L(3) E(4) T(5) A(6) R(7) E(8)
    demos:[
      {word:"ORD",indices:[0,1,2],color:"#44ff88"},
      {word:"LET",indices:[3,4,5],color:"#4488ff"},
      {word:"LETA",indices:[3,4,5,6],color:"#ff8844"},
      {word:"ARE",indices:[6,7,8],color:"#ff44cc"},
      {word:"ORDLETARE",indices:[0,1,2,3,4,5,6,7,8],color:"#ff6644"},
    ]
  },
};

function TitleDemo({active,lang,theme:titleTheme}){
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
    <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:"0",paddingTop:"8px",position:"relative"}}>
    <h1 style={{fontSize:"28px",letterSpacing:"4px",margin:"0 0 10px 0",display:"flex",justifyContent:"center",alignItems:"center",gap:"2px"}}>
      {displayChars.map((ch,i)=>{
        const isLit=lit.has(i);
        const tColor=titleColor(i,displayChars.length);
        const baseStyle={
          color:scramble?tColor+"88":tColor,
          textShadow:scramble
            ?`2px 2px 0 ${tColor}44, 0 0 10px ${tColor}44`
            :isLit
            ?`2px 2px 0 ${tColor}44, 0 0 20px ${dw.color}cc, 0 0 40px ${dw.color}66`
            :titleShadow(tColor),
          transition:scramble?"none":"text-shadow 0.25s ease, transform 0.25s ease",
          transform:scramble?`translateY(${Math.random()>0.5?-2:2}px)`:isLit?"translateY(-2px)":"none",
          fontFamily:titleTheme?.titleFont||"'Press Start 2P',monospace",
          lineHeight:1,
        };
        return <span key={i} style={baseStyle}>{ch}</span>;
      })}
    </h1>
      {/* Coffee cup illustration - steaming, spills on lang change */}
      <svg width="64" height="64" viewBox="0 0 100 100" style={{position:"absolute",right:"-70px",top:"-8px",flexShrink:0,transition:"transform 0.15s ease",transform:scramble?"rotate(-12deg)":"rotate(0deg)"}}>
        {/* Steam — hidden during spill */}
        {!scramble&&<>
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
        </>}
        {/* Coffee splash drops — only during spill */}
        {scramble&&<>
          <ellipse cx="18" cy="30" rx="4" ry="3" fill="#6b3a1f" opacity="0.8">
            <animate attributeName="cy" values="30;18;28" dur="0.6s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.8;0.4;0.8" dur="0.6s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="10" cy="36" rx="3" ry="2" fill="#8b5a2f" opacity="0.6">
            <animate attributeName="cy" values="36;26;34" dur="0.5s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.6;0.2;0.6" dur="0.5s" repeatCount="indefinite"/>
          </ellipse>
          <ellipse cx="24" cy="22" rx="2.5" ry="2" fill="#6b3a1f" opacity="0.7">
            <animate attributeName="cy" values="22;12;20" dur="0.7s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="0.7;0.3;0.7" dur="0.7s" repeatCount="indefinite"/>
          </ellipse>
        </>}
        {/* Cup body */}
        <path d="M22 38 L22 75 Q22 85 35 85 L65 85 Q78 85 78 75 L78 38 Z" fill="#f5e6d0" stroke="#8b6914" strokeWidth="2.5"/>
        {/* Coffee surface — tilts during spill */}
        <ellipse cx={scramble?"45":"50"} cy={scramble?"40":"42"} rx="28" ry={scramble?"7":"6"} fill="#6b3a1f" style={{transition:"all 0.2s ease"}}/>
        <ellipse cx={scramble?"44":"50"} cy={scramble?"39":"41"} rx="24" ry={scramble?"5":"4"} fill="#8b5a2f" opacity="0.6" style={{transition:"all 0.2s ease"}}/>
        {/* Handle */}
        <path d="M78 48 Q94 48 94 60 Q94 72 78 72" fill="none" stroke="#8b6914" strokeWidth="3" strokeLinecap="round"/>
        {/* Cup rim */}
        <ellipse cx="50" cy="38" rx="29" ry="6" fill="none" stroke="#8b6914" strokeWidth="2.5"/>
        {/* Face — normal vs embarrassed */}
        {scramble?<>
          {/* Embarrassed spiral eyes */}
          <g transform="translate(40,62)">
            <circle r="3.5" fill="none" stroke="#8b6914" strokeWidth="1.5">
              <animate attributeName="r" values="2;3.5;2" dur="0.4s" repeatCount="indefinite"/>
            </circle>
            <circle r="1" fill="#8b6914"/>
          </g>
          <g transform="translate(60,62)">
            <circle r="3.5" fill="none" stroke="#8b6914" strokeWidth="1.5">
              <animate attributeName="r" values="3.5;2;3.5" dur="0.4s" repeatCount="indefinite"/>
            </circle>
            <circle r="1" fill="#8b6914"/>
          </g>
          {/* Wavy embarrassed mouth */}
          <path d="M43 71 Q47 69 50 71 Q53 73 57 71" fill="none" stroke="#8b6914" strokeWidth="2" strokeLinecap="round"/>
          {/* Extra blush — more visible when embarrassed */}
          <ellipse cx="34" cy="68" rx="5" ry="3" fill="#ff8888" opacity="0.7"/>
          <ellipse cx="66" cy="68" rx="5" ry="3" fill="#ff8888" opacity="0.7"/>
          {/* Sweat drop */}
          <path d="M72 54 Q74 50 73 46" fill="none" stroke="#66aadd" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
          <circle cx="73" cy="46" r="1.5" fill="#66aadd" opacity="0.8"/>
        </>:<>
          {/* Normal happy face */}
          <circle cx="40" cy="62" r="2.5" fill="#8b6914"/>
          <circle cx="60" cy="62" r="2.5" fill="#8b6914"/>
          <path d="M44 70 Q50 75 56 70" fill="none" stroke="#8b6914" strokeWidth="2" strokeLinecap="round"/>
          {/* Normal blush */}
          <ellipse cx="34" cy="68" rx="4" ry="2.5" fill="#ffaaaa" opacity="0.5"/>
          <ellipse cx="66" cy="68" rx="4" ry="2.5" fill="#ffaaaa" opacity="0.5"/>
        </>}
      </svg>
    </div>
    </div>
  );
}

export { TITLE_COLORS, titleColor, titleShadow, TITLE_CONFIG, TitleDemo };
