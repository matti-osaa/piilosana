import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as Tone from "tone";
import { io } from "socket.io-client";

// ============================================
// PIILOSANA - Finnish Word Hunt Game
// ============================================

const VERSION = "2.0.0";
const SERVER_URL = window.location.origin;

import WORDS_RAW from "./words.js";
const WORDS_SET = new Set(WORDS_RAW.split("|"));

class TrieNode{constructor(){this.c={};this.w=false;}}
function buildTrie(words){const root=new TrieNode();for(const word of words){let n=root;for(const ch of word){if(!n.c[ch])n.c[ch]=new TrieNode();n=n.c[ch];}n.w=true;}return root;}

const LW={a:120,i:108,t:87,n:88,e:80,s:79,l:58,o:53,k:51,u:51,"ä":37,m:33,v:25,r:29,j:20,h:19,y:19,p:18,d:10,"ö":4};
function randLetter(){const ls=Object.keys(LW),ws=Object.values(LW),tot=ws.reduce((a,b)=>a+b,0);let r=Math.random()*tot;for(let i=0;i<ls.length;i++){r-=ws[i];if(r<=0)return ls[i];}return ls[ls.length-1];}
function makeGrid(sz){return Array.from({length:sz},()=>Array.from({length:sz},()=>randLetter()));}

// Client-side gravity: remove cells, drop letters down, fill new from top
function applyGravityClient(grid,removedCells){
  const sz=grid.length;
  const ng=grid.map(row=>[...row]);
  for(const{r,c}of removedCells)ng[r][c]=null;
  for(let c=0;c<sz;c++){
    const letters=[];
    for(let r=sz-1;r>=0;r--){if(ng[r][c]!==null)letters.push(ng[r][c]);}
    for(let r=sz-1;r>=0;r--){
      const idx=sz-1-r;
      ng[r][c]=idx<letters.length?letters[idx]:randLetter();
    }
  }
  return ng;
}

function findWords(grid,trie){
  const sz=grid.length,found=new Set(),dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*sz+c);for(const[dr,dc]of dirs){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<sz&&nc>=0&&nc<sz&&!vis.has(nr*sz+nc))dfs(nr,nc,nx,np,vis);}vis.delete(r*sz+c);}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++)dfs(r,c,trie,"",new Set());return found;
}

function pts(len){if(len<=2)return 0;if(len===3)return 1;if(len===4)return 2;if(len===5)return 4;if(len===6)return 6;if(len===7)return 10;return 14;}

// Finnish Scrabble letter values (Sanapeli)
const LETTER_VALUES={a:1,i:1,n:1,s:1,t:1,e:1,l:2,o:2,k:2,u:4,"ä":2,m:3,v:4,r:2,j:4,h:4,y:4,p:4,d:7,"ö":7};
function ptsLetters(word){let s=0;for(const ch of word)s+=(LETTER_VALUES[ch]||1);return s;}
// Colorblind-safe letter value colors (blue-orange scale)
const LETTER_VALUE_COLORS={1:"#88bbcc",2:"#44ccdd",3:"#ffbb44",4:"#ff8833",7:"#ff4466"};
function letterColor(ch){return LETTER_VALUE_COLORS[LETTER_VALUES[ch]||1]||"#88bbcc";}

const fontCSS=`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');`;

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
function useSounds(){
  const synthRef=useRef(null);const bassRef=useRef(null);const btnNoiseRef=useRef(null);const initRef=useRef(false);

  const init=useCallback(async()=>{
    if(initRef.current)return;await Tone.start();initRef.current=true;
    synthRef.current=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"square"},envelope:{attack:0.01,decay:0.15,sustain:0.05,release:0.15},volume:-14}).toDestination();
    bassRef.current=new Tone.Synth({oscillator:{type:"triangle"},envelope:{attack:0.01,decay:0.3,sustain:0.1,release:0.3},volume:-10}).toDestination();
    const btnFilter=new Tone.Filter({frequency:400,type:"lowpass"}).toDestination();
    btnNoiseRef.current=new Tone.NoiseSynth({noise:{type:"brown"},envelope:{attack:0.003,decay:0.04,sustain:0,release:0.02},volume:-22}).connect(btnFilter);
  },[]);

  const play3=useCallback(()=>{if(!synthRef.current)return;synthRef.current.triggerAttackRelease("C5","16n");},[]);
  const play4=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("E5","16n",n);synthRef.current.triggerAttackRelease("G5","16n",n+0.08);},[]);
  const play5=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("C5","16n",n);synthRef.current.triggerAttackRelease("E5","16n",n+0.07);synthRef.current.triggerAttackRelease("G5","8n",n+0.14);},[]);
  const play6=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("C5","16n",n);synthRef.current.triggerAttackRelease("E5","16n",n+0.06);synthRef.current.triggerAttackRelease("G5","16n",n+0.12);synthRef.current.triggerAttackRelease("C6","8n",n+0.18);if(bassRef.current)bassRef.current.triggerAttackRelease("C3","4n",n);},[]);
  const play7=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("C5","16n",n);synthRef.current.triggerAttackRelease("E5","16n",n+0.05);synthRef.current.triggerAttackRelease("G5","16n",n+0.1);synthRef.current.triggerAttackRelease("C6","16n",n+0.15);synthRef.current.triggerAttackRelease("E6","16n",n+0.2);synthRef.current.triggerAttackRelease("G6","4n",n+0.25);if(bassRef.current){bassRef.current.triggerAttackRelease("C3","8n",n);bassRef.current.triggerAttackRelease("G2","4n",n+0.15);}},[]);

  const playByLength=useCallback((len)=>{if(len<=3)play3();else if(len===4)play4();else if(len===5)play5();else if(len===6)play6();else play7();},[play3,play4,play5,play6,play7]);
  const playCombo=useCallback((combo)=>{if(!synthRef.current)return;const n=Tone.now();const notes=combo>=5?["C5","E5","G5","B5","D6"]:combo>=3?["C5","E5","G5","C6"]:["C5","G5"];notes.forEach((note,i)=>synthRef.current.triggerAttackRelease(note,"8n",n+i*0.04));if(bassRef.current&&combo>=3)bassRef.current.triggerAttackRelease("C2","8n",n);},[]);
  const playWrong=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("E3","16n",n);synthRef.current.triggerAttackRelease("Eb3","8n",n+0.1);},[]);
  const playTick=useCallback(()=>{if(!synthRef.current)return;synthRef.current.triggerAttackRelease("A5","32n");},[]);
  const playCountdown=useCallback((n)=>{if(!synthRef.current)return;synthRef.current.triggerAttackRelease("G4","16n");},[]);
  const playGo=useCallback(()=>{if(!synthRef.current)return;const n=Tone.now();synthRef.current.triggerAttackRelease("C5","16n",n);synthRef.current.triggerAttackRelease("E5","16n",n+0.06);synthRef.current.triggerAttackRelease("G5","8n",n+0.12);},[]);
  const playEnding=useCallback(()=>{if(!bassRef.current)return;const n=Tone.now();bassRef.current.triggerAttackRelease("E2","8n",n);bassRef.current.triggerAttackRelease("C2","8n",n+0.2);bassRef.current.triggerAttackRelease("A1","4n",n+0.4);},[]);
  const playChomp=useCallback(()=>{if(!synthRef.current)return;synthRef.current.triggerAttackRelease("G3","32n");},[]);
  const playBtn=useCallback(()=>{if(!btnNoiseRef.current||!bassRef.current)return;btnNoiseRef.current.triggerAttackRelease("32n");bassRef.current.triggerAttackRelease("A2","32n");},[]);

  return{init,playByLength,playCombo,playWrong,playTick,playCountdown,playGo,playEnding,playChomp,playBtn};
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
  return <canvas ref={canvasRef} style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"600px",height:"100%",pointerEvents:"none",zIndex:0}}/>;
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
const TITLE_CHARS="PIILOSANA".split("");
// Words to demo-find, with their letter indices in "PIILOSANA"
const DEMO_WORDS=[
  {word:"PII",indices:[0,1,2],color:"#44ff88"},
  {word:"ILO",indices:[2,3,4],color:"#4488ff"},
  {word:"OSA",indices:[4,5,6],color:"#ff8844"},
  {word:"SANA",indices:[5,6,7,8],color:"#ff44cc"},
  {word:"PIILO",indices:[0,1,2,3,4],color:"#ffcc00"},
  {word:"PIILOSANA",indices:[0,1,2,3,4,5,6,7,8],color:"#ff6644"},
];
function TitleDemo({active}){
  const[wordIdx,setWordIdx]=useState(0);
  const[charStep,setCharStep]=useState(-1); // -1=pause, 0..n-1=highlighting, n=hold
  const timerRef=useRef(null);
  const wordIdxRef=useRef(wordIdx);
  wordIdxRef.current=wordIdx;
  const charStepRef=useRef(charStep);
  charStepRef.current=charStep;
  useEffect(()=>{
    if(!active){setWordIdx(0);setCharStep(-1);return;}
    function tick(){
      const wi=wordIdxRef.current;
      const cs=charStepRef.current;
      const dw=DEMO_WORDS[wi];
      if(cs===-1){
        // Start highlighting first char
        setCharStep(0);
        timerRef.current=setTimeout(tick,220);
      }else if(cs<dw.indices.length-1){
        // Highlight next char
        setCharStep(cs+1);
        timerRef.current=setTimeout(tick,220);
      }else if(cs===dw.indices.length-1){
        // All chars lit, hold
        setCharStep(cs+1);
        timerRef.current=setTimeout(tick,1400);
      }else{
        // Move to next word
        setWordIdx((wi+1)%DEMO_WORDS.length);
        setCharStep(-1);
        timerRef.current=setTimeout(tick,800);
      }
    }
    timerRef.current=setTimeout(tick,1500);
    return()=>clearTimeout(timerRef.current);
  },[active]);
  // Compute which indices are currently highlighted
  const dw=DEMO_WORDS[wordIdx];
  const lit=new Set();
  if(active&&charStep>=0){
    for(let i=0;i<=Math.min(charStep,dw.indices.length-1);i++)lit.add(dw.indices[i]);
  }
  return(
    <h1 style={{fontSize:"28px",letterSpacing:"4px",margin:"10px 0",display:"flex",justifyContent:"center",gap:"2px"}}>
      {TITLE_CHARS.map((ch,i)=>{
        const isLit=lit.has(i);
        return <span key={i} style={{
          color:"#ffcc00",
          textShadow:isLit
            ?`3px 3px 0 #cc6600, 0 0 20px ${dw.color}cc, 0 0 40px ${dw.color}66`
            :"3px 3px 0 #cc6600, 0 0 20px #ffcc0066",
          transition:"text-shadow 0.25s ease, transform 0.25s ease",
          transform:isLit?"translateY(-2px)":"none",
          fontFamily:"'Press Start 2P',monospace"
        }}>{ch}</span>;
      })}
    </h1>
  );
}

// ============================================
// HALL OF FAME COMPONENT
// ============================================
function HallOfFame({gameMode,gameTime,currentScore,S}){
  const[scores,setScores]=useState(null);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!gameMode||!gameTime||gameTime===0)return;
    setLoading(true);
    fetch(`${SERVER_URL}/api/hall-of-fame/${gameMode}/${gameTime}`)
      .then(r=>r.json()).then(data=>{setScores(data);setLoading(false);})
      .catch(()=>{setScores([]);setLoading(false);});
  },[gameMode,gameTime,currentScore]);
  if(!gameMode||!gameTime||gameTime===0)return null;
  const label=gameMode==="tetris"?"Tetris":"Normaali";
  const timeLabel=gameTime===120?"2 min":"6,7 min";
  return(
    <div style={{border:`2px solid ${S.border}`,padding:"8px",background:S.dark,marginTop:"10px",animation:"fadeIn 0.8s ease"}}>
      <div style={{fontSize:"13px",color:S.yellow,marginBottom:"6px",textAlign:"center"}}>ENNÄTYKSET — {label} {timeLabel}</div>
      {loading?<div style={{fontSize:"11px",color:"#556",textAlign:"center"}}>Ladataan...</div>:
      !scores||scores.length===0?<div style={{fontSize:"11px",color:"#556",textAlign:"center"}}>Ei tuloksia vielä</div>:
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
async function submitToHallOfFame({nickname,score,wordsFound,wordsTotal,gameMode,gameTime}){
  if(!nickname||score<=0||!gameMode||!gameTime||gameTime===0)return null;
  try{
    const res=await fetch(`${SERVER_URL}/api/hall-of-fame`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({nickname,score,wordsFound,wordsTotal,gameMode,gameTime})
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
  const trie=useMemo(()=>buildTrie(WORDS_SET),[]);
  const sounds=useSounds();

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
  const[soloNickname,setSoloNickname]=useState(()=>localStorage.getItem("piilosana_nick")||"");
  const[hofSubmitted,setHofSubmitted]=useState(false);
  // Ending
  const[ending,setEnding]=useState(null);
  const[endingProgress,setEndingProgress]=useState(0);
  const[eatenCells,setEatenCells]=useState(new Set());
  // Multiplayer states
  const[mode,setMode]=useState(null);
  const[socket,setSocket]=useState(null);
  const[roomCode,setRoomCode]=useState("");
  const[nickname,setNickname]=useState("");
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

  const gRef=useRef(null);
  const wordBarRef=useRef(null);
  const tRef=useRef(null);
  const nicknameRef=useRef(null);
  const popupIdRef=useRef(0);
  const lastSubmittedWordRef=useRef("");
  const foundRef=useRef([]);

  // Keep foundRef in sync with found state (avoids stale closure in socket handlers)
  useEffect(()=>{foundRef.current=found;},[found]);

  // Fetch online player count for Piilosauna button
  useEffect(()=>{
    if(mode!==null)return;
    const fetchCount=()=>fetch(`${SERVER_URL}/api/public-game`).then(r=>r.json()).then(d=>setPublicOnlineCount(d.playerCount||0)).catch(()=>{});
    fetchCount();
    const t=setInterval(fetchCount,10000);
    return()=>clearInterval(t);
  },[mode]);

  // Global button sound — plays on any <button> tap
  useEffect(()=>{
    const handler=async(e)=>{if(e.target.closest("button")){await sounds.init();sounds.playBtn();}};
    document.addEventListener("pointerdown",handler,true);
    return()=>document.removeEventListener("pointerdown",handler,true);
  },[sounds]);

  const addPopup=useCallback((text,color,x,y)=>{
    const id=++popupIdRef.current;
    setPopups(p=>[...p,{id,text,color,x,y}]);
    setTimeout(()=>setPopups(p=>p.filter(pp=>pp.id!==id)),1100);
  },[]);

  const start=useCallback(async()=>{
    if(mode==="solo"){
      await sounds.init();
      let bg=null,bw=new Set();
      for(let i=0;i<30;i++){const g=makeGrid(SZ),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
      setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setTime(gameTime);setScore(0);setMsg(null);
      setEatenCells(new Set());setCombo(0);setLastFoundTime(0);setPopups([]);
      setEnding(null);setEndingProgress(0);setDropKey(0);
      setCountdown(5);setState("countdown");
      window.scrollTo(0,0);
    }
  },[trie,sounds,mode,gameTime,soloMode]);

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


  // Cell detection
  const cellAt=useCallback((x,y)=>{
    if(!gRef.current)return null;
    let best=null,bestDist=Infinity;
    for(const el of gRef.current.querySelectorAll("[data-c]")){
      const rect=el.getBoundingClientRect();
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const dist=Math.sqrt((x-cx)**2+(y-cy)**2);
      const coreRadius=rect.width*0.55;
      if(dist<coreRadius&&dist<bestDist){const[row,col]=el.dataset.c.split(",").map(Number);best={r:row,c:col};bestDist=dist;}
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
        setMsg({t:currentWord,ok:false,m:"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
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
        setMsg({t:currentWord,ok:false,m:"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
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
      let p=letterMult?ptsLetters(currentWord):pts(currentWord.length);
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
        const bar=wordBarRef.current||gRef.current;
        const rect=bar.getBoundingClientRect();
        const popX=rect.left+rect.width/2,popY=rect.top+rect.height/2;
        const color=currentWord.length>=6?"#ff66ff":currentWord.length>=5?"#ffcc00":"#00ff88";
        let text=`+${totalPts}`;
        if(newCombo>=3)text+=` x${comboMult}`;
        addPopup(text,color,popX,popY);
      }
      // Tetris mode: remove used cells, apply gravity, recompute valid words
      if(soloMode==="tetris"){
        const cells=currentSel.map(s=>({r:s.r,c:s.c}));
        const newGrid=applyGravityClient(grid,cells);
        setGrid(newGrid);
        setDropKey(k=>k+1);
        const newValid=findWords(newGrid,trie);
        setValid(newValid);
      }
    }else if(found.includes(currentWord)){
      setMsg({t:currentWord,ok:false,m:"Jo löydetty!"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }else{
      setMsg({t:currentWord,ok:false,m:"Ei kelpaa"});setShake(true);setTimeout(()=>setShake(false),400);sounds.playWrong();
    }
  },[valid,found,lastFoundTime,combo,sounds,addPopup,mode,socket,gameMode,soloMode,grid,trie,letterMult]);

  // Active grid: use currentMultiGrid in multi mode, grid in solo
  const activeGrid=mode==="multi"?currentMultiGrid:grid;

  // Drag handlers
  const onDragStart=useCallback((r,c)=>{if(state!=="play")return;setDragging(true);setSel([{r,c}]);setWord(activeGrid[r]?.[c]||"");setMsg(null);
    // Battle mode: broadcast selection start
    if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:[{r,c}]});
  },[state,activeGrid,mode,gameMode,socket]);
  const onDragMove=useCallback((x,y)=>{
    if(!dragging||state!=="play")return;const cell=cellAt(x,y);if(!cell)return;
    setSel(prev=>{
      let next=prev;
      if(prev.length>0&&prev[prev.length-1].r===cell.r&&prev[prev.length-1].c===cell.c)return prev;
      if(prev.length>=2&&prev[prev.length-2].r===cell.r&&prev[prev.length-2].c===cell.c){next=prev.slice(0,-1);setWord(next.map(s=>activeGrid[s.r][s.c]).join(""));}
      else if(prev.some(p=>p.r===cell.r&&p.c===cell.c))return prev;
      else if(prev.length>0&&!adj(prev[prev.length-1],cell))return prev;
      else{next=[...prev,cell];setWord(next.map(s=>activeGrid[s.r][s.c]).join(""));}
      // Battle mode: broadcast selection
      if(mode==="multi"&&gameMode==="battle"&&socket)socket.emit("battle_selection",{cells:next.map(s=>({r:s.r,c:s.c}))});
      return next;
    });
  },[dragging,state,cellAt,activeGrid,mode,gameMode,socket]);
  const onDragEnd=useCallback(()=>{if(!dragging)return;setDragging(false);submitWord(sel,word);setSel([]);setWord("");
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
            const bar=wordBarRef.current||gRef.current;
            const rect=bar.getBoundingClientRect();
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
    });
    newSocket.on("public_game_start",()=>{
      setPublicState("playing");setState("play");
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
        addPopup(w,p);
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
  const totalPossible=useMemo(()=>[...valid].reduce((s,w)=>s+(letterMult?ptsLetters(w):pts(w.length)),0),[valid,letterMult]);
  const wordColor=(len)=>len>=7?"#ff66ff":len>=6?"#ffaa00":len>=5?"#ffcc00":len>=4?"#00ffaa":"#00ff88";


  // Multiplayer helper functions
  const createRoom=useCallback(()=>{
    if(!socket||!nickname)return;
    if(!socket.connected){
      setLobbyError("Ei yhteyttä palvelimeen. Odota hetki...");
      return;
    }
    setLobbyError("");
    setLobbyState("creating");
    socket.emit("create_room",{nickname,mode:"multi"});
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
      setLobbyError("Ei yhteyttä palvelimeen. Odota hetki...");
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
    for(let i=0;i<30;i++){const g=makeGrid(SZ),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
    setGrid(bg);setValid(bw);setFound([]);setSel([]);setWord("");setMsg(null);
    setDropKey(0);
  },[state,gameTime,trie]);

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
    for(let i=0;i<30;i++){const g=makeGrid(SZ),w=findWords(g,trie);if(w.size>bw.size){bg=g;bw=w;}if(w.size>=15)break;}
    setCurrentMultiGrid(bg);
    setGameMode(gm);
    socket.emit("start_game",{grid:bg,validWords:Array.from(bw),gameMode:gm,gameTime});
  },[socket,isHost,players,trie,gameMode,gameTime]);
  
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
  const ModeSelectScreen=()=>(
    <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
      <div style={{border:`3px solid ${S.green}`,padding:"40px 24px",boxShadow:`0 0 20px ${S.green}44, inset 0 0 20px ${S.green}11`,maxWidth:"600px"}}>
        <p style={{fontSize:"11px",lineHeight:"2",marginBottom:"16px",color:S.green}}>VALITSE PELIMUOTO</p>
        <div style={{display:"flex",flexDirection:"column",gap:"12px",marginBottom:"24px"}}>
          <button onClick={async()=>{await sounds.init();setMode("public");setPublicState("nickname");}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:"#ff6644",border:"none",padding:"22px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #cc3311",width:"100%",minHeight:"82px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span>AREENA</span>
            <span style={{fontSize:"9px",marginTop:"6px",opacity:0.8}}>24/7 nettipeli</span>
            {publicOnlineCount>0&&<span style={{fontSize:"9px",marginTop:"4px",opacity:0.7}}>{publicOnlineCount} online</span>}
          </button>
          <button onClick={async()=>{await sounds.init();setMode("multi");setLobbyState("enter_name");setTimeout(()=>{if(nicknameRef.current)nicknameRef.current.focus();},50);}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"22px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #cc8800",width:"100%",minHeight:"82px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span>OMA NETTIPELI</span>
            <span style={{fontSize:"9px",marginTop:"6px",opacity:0.8}}>eri moodeja</span>
          </button>
          <button onClick={async()=>{await sounds.init();setMode("solo");setState("menu");}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"22px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #008844",width:"100%",minHeight:"82px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <span>HARJOITUS</span>
            <span style={{fontSize:"9px",marginTop:"6px",opacity:0.8}}>yksinpeli</span>
          </button>
        </div>
        <p style={{fontSize:"14px",lineHeight:"1.8",marginBottom:"12px"}}>Etsi sanoja ruudukosta!</p>
        <p style={{fontSize:"14px",lineHeight:"2.2",color:"#88ccaa",marginBottom:"16px"}}>
          VEDÄ kirjaimien yli kaikkiin suuntiin. Aikaa 2 min.
        </p>
        <p style={{fontSize:"14px",lineHeight:"2.2",color:"#ccaa66",marginBottom:"20px"}}>
          Löydä sanoja nopeasti putkeen = kombo ja lisäpisteet!
        </p>
        <div style={{fontSize:"14px",color:"#446655",lineHeight:"2.2"}}>
          <p>PISTEYTYS: 3kir=1p · 4=2p · 5=4p · 6=6p · 7=10p</p>
          <p>KOMBO x2 (3+) · KOMBO x3 (5+)</p>
        </div>
        <div style={{fontSize:"14px",color:"#556",marginTop:"12px"}}>{WORDS_SET.size.toLocaleString()} sanaa</div>
        <div style={{fontSize:"11px",color:"#334",marginTop:"8px"}}>v{VERSION}</div>
        <div style={{fontSize:"11px",color:"#334",marginTop:"4px"}}>© Matti Kuokkanen 2026</div>
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
        <div style={{fontSize:"16px",color:isWinner?S.yellow:myRank<=2?"#cccccc":S.green,marginBottom:"4px",animation:myRank<=2?"pop 0.6s ease":"none"}}>{isWinner?"VOITIT!":myRank===1?"2. SIJA!":myRank===2?"3. SIJA!":"PELI PÄÄTTYI!"}</div>
        <p style={{fontSize:"11px",color:S.green,marginBottom:"12px"}}>TULOKSET</p>
        {multiRankings&&multiRankings.slice(0,5).map((p,i)=>{
          const medals=["🥇","🥈","🥉"];
          const isMe=p.playerId===playerId;
          return(
            <div key={i} style={{fontSize:"11px",color:isMe?S.yellow:S.green,padding:"6px 10px",borderBottom:`1px solid ${S.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:isMe?"#ffcc0011":"transparent",animation:isMe?"pop 0.4s ease":"none"}}>
              <span>{medals[i]||`${i+1}.`} {p.nickname}</span>
              <span>{p.score}p ({p.wordsFound} sanaa)</span>
            </div>
          );
        })}
        {gameMode==="classic"&&multiValidWords.length>0&&(
          <div style={{fontSize:"11px",color:"#88ccaa",marginTop:"8px"}}>{(() => {const allF=new Set();Object.values(multiAllFoundWords).forEach(ws=>ws.forEach(w=>allF.add(w)));return `${allF.size} / ${multiValidWords.length} sanaa (${Math.round(allF.size/multiValidWords.length*100)}%)`;})()}</div>
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
              <div style={{fontSize:"14px",color:S.purple,marginBottom:"6px"}}>⚔️ LÖYDETYT ({foundWords.length})</div>
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
          {isHost&&<button onClick={playAgain} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>UUSI OMA NETTIPELI</button>}
          <button onClick={switchToSolo} style={{fontFamily:S.font,fontSize:"13px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>HARJOITUS</button>
          <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>VALIKKO</button>
        </div>
      </div>
    </div>
  );

  const S={bg:"#0a0a1a",green:"#00ff88",yellow:"#ffcc00",red:"#ff4444",purple:"#ff66ff",dark:"#0d0d22",border:"#334",cell:"#1a1a3a",cellBorder:"#2a2a4a",font:"'Press Start 2P',monospace"};

  return(
    <div style={{fontFamily:S.font,background:S.bg,color:S.green,minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",userSelect:"none",WebkitUserSelect:"none",padding:"8px 4px",position:"relative",overflow:"hidden"}}
      onMouseMove={e=>onDragMove(e.clientX,e.clientY)} onMouseUp={onDragEnd} onTouchEnd={onDragEnd}>
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
      `}</style>

      {popups.map(p=><ScorePopup key={p.id}{...p}/>)}

      {(mode===null||(mode==="solo"&&state==="menu")||(mode==="public"&&publicState==="nickname")||(mode==="multi"&&(lobbyState==="enter_name"||lobbyState==="choose")))?(
        <TitleDemo active={true}/>
      ):(
        <h1 style={{fontSize:"28px",color:S.yellow,textShadow:`3px 3px 0 #cc6600, 0 0 20px ${S.yellow}66`,letterSpacing:"4px",margin:"10px 0",
          animation:state==="play"&&time<=15&&gameTime!==0?"pulse 0.5s infinite":"none"}}>
          PIILOSANA
        </h1>
      )}

      {/* MENU */}
      {/* MODE SELECT */}
      {mode===null&&<ModeSelectScreen/>}
      
      {/* MULTIPLAYER SCREENS - inline to prevent focus loss */}
      {mode==="multi"&&lobbyState==="enter_name"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.green}`,padding:"24px",boxShadow:`0 0 20px ${S.green}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"11px",lineHeight:"2",marginBottom:"16px",color:S.green}}>KIRJOITA NIMIMERKKI</p>
            <input ref={el=>{nicknameRef.current=el;if(el)el.focus();}} type="text" inputMode="text" maxLength="12" value={nickname} onChange={e=>setNickname(e.target.value.toUpperCase())}
              autoFocus placeholder="NIMIMERKKI" onKeyDown={e=>{if(e.key==="Enter"&&nickname)setLobbyState("choose");}}
              style={{fontFamily:S.font,fontSize:"18px",padding:"8px 12px",width:"100%",maxWidth:"500px",background:S.dark,color:S.green,border:`2px solid ${S.green}`,boxSizing:"border-box",marginBottom:"16px"}}/>
            <br/>
            <button onClick={()=>nickname&&setLobbyState("choose")} style={{fontFamily:S.font,fontSize:"16px",color:S.bg,background:nickname?S.green:"#333",border:"none",padding:"12px 28px",cursor:nickname?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>JATKA</button>
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
            {!socketConnected&&<p style={{fontSize:"13px",color:S.yellow,marginBottom:"12px",animation:"pulse 1s infinite"}}>Yhdistetään palvelimeen...</p>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
              <p style={{fontSize:"11px",lineHeight:"2",color:S.green,margin:0}}>AVOIMET PELIT</p>
              <button onClick={refreshRooms} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`1px solid ${S.green}`,background:"transparent",padding:"4px 10px",cursor:"pointer"}}>PÄIVITÄ</button>
            </div>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"80px",maxHeight:"200px",overflowY:"auto"}}>
              {publicRooms.length===0&&(
                <p style={{fontSize:"18px",color:"#556",padding:"16px 0"}}>Ei avoimia pelejä. Luo uusi!</p>
              )}
              {publicRooms.map((r,i)=>(
                <div key={r.roomCode} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px",borderBottom:i<publicRooms.length-1?`1px solid ${S.border}`:"none"}}>
                  <div>
                    <span style={{fontSize:"11px",color:S.yellow}}>{r.hostNickname}</span>
                    <span style={{fontSize:"18px",color:"#888",marginLeft:"8px"}}>{r.playerCount}/{r.maxPlayers}</span>
                  </div>
                  <button onClick={()=>joinRoom(r.roomCode)} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"6px 14px",cursor:"pointer",boxShadow:"2px 2px 0 #cc8800"}}>LIITY</button>
                </div>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <button onClick={createRoom} disabled={!socketConnected} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:socketConnected?S.green:"#333",border:"none",padding:"12px 20px",cursor:socketConnected?"pointer":"default",boxShadow:socketConnected?"3px 3px 0 #008844":"none"}}>{socketConnected?"LUO PELI":"YHDISTETÄÄN..."}</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"18px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"10px 20px",cursor:"pointer"}}>TAKAISIN</button>
            </div>
          </div>
        </div>
      )}
      {mode==="multi"&&lobbyState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:`3px solid ${S.yellow}`,padding:"24px",boxShadow:`0 0 20px ${S.yellow}44`,maxWidth:"600px"}}>
            <p style={{fontSize:"18px",lineHeight:"2",marginBottom:"12px",color:S.yellow}}>ODOTETAAN PELAAJIA</p>
            <p style={{fontSize:"11px",lineHeight:"2",color:S.green,marginBottom:"12px"}}>PELAAJAT ({players.length})</p>
            <div style={{background:S.dark,padding:"8px",border:`1px solid ${S.border}`,marginBottom:"16px",minHeight:"60px"}}>
              {players.map((p,i)=><div key={i} style={{fontSize:"11px",color:p.playerId===playerId?S.yellow:S.green,padding:"4px"}}>{i+1}. {p.nickname}{p.playerId===playerId?" (SÄ)":""}</div>)}
            </div>
            {isHost&&(
              <div style={{marginBottom:"12px"}}>
                <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>PELIMUOTO</p>
                <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                  <button onClick={()=>setGameMode("classic")} style={{fontFamily:S.font,fontSize:"11px",color:gameMode==="classic"?S.bg:S.green,background:gameMode==="classic"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>KLASSINEN</button>
                  <button onClick={()=>setGameMode("battle")} style={{fontFamily:S.font,fontSize:"11px",color:gameMode==="battle"?S.bg:S.purple,background:gameMode==="battle"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer"}}>TAISTELU ⚔️</button>
                </div>
                {gameMode==="battle"&&<p style={{fontSize:"11px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>Sanat näkyvät muille! Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä.</p>}
                <div style={{marginTop:"12px"}}>
                  <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>AIKA</p>
                  <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
                    <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
                    <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>6,7 MIN</button>
                  </div>
                </div>
                {gameMode!=="battle"&&(
                  <div style={{marginTop:"12px"}}>
                    <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"11px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                      {letterMult?"✓ ":""}KIRJAINKERTOIMET
                    </button>
                  </div>
                )}
              </div>
            )}
            {isHost&&<button onClick={()=>startGame(gameMode)} disabled={players.length<2} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:players.length>=2?S.green:"#333",border:"none",padding:"12px 24px",cursor:players.length>=2?"pointer":"default",boxShadow:"4px 4px 0 #008844"}}>ALOITA PELI</button>}
            {isHost&&players.length<2&&<p style={{fontSize:"18px",color:"#666",marginTop:"8px"}}>Odota, että joku liittyy peliisi...</p>}
            {!isHost&&<p style={{fontSize:"18px",color:"#666"}}>Odota, että isäntä aloittaa pelin...</p>}
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"12px"}}>POISTU</button>
          </div>
        </div>
      )}
      {mode==="multi"&&state==="end"&&lobbyState==="results"&&<ResultsScreen/>}

      {/* PIILOSAUNA - nickname entry */}
      {mode==="public"&&publicState==="nickname"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{border:"3px solid #ff6644",padding:"24px",boxShadow:"0 0 20px #ff664444",maxWidth:"600px"}}>
            <p style={{fontSize:"18px",color:"#ff6644",marginBottom:"8px"}}>AREENA</p>
            <p style={{fontSize:"11px",color:"#88ccaa",marginBottom:"16px",lineHeight:"1.8"}}>Jatkuva peli kaikille! Liity mukaan ja etsi sanoja. Kierros kestää 2 min.</p>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>NIMIMERKKI</p>
            <input type="text" maxLength="12" value={soloNickname} onChange={e=>setSoloNickname(e.target.value.toUpperCase())}
              placeholder="NIMIMERKKI" style={{fontFamily:S.font,fontSize:"13px",color:S.green,background:S.dark,
              border:`2px solid ${S.green}`,padding:"10px",width:"200px",textAlign:"center",outline:"none",marginBottom:"16px"}}
              onKeyDown={e=>{if(e.key==="Enter"&&soloNickname.trim()&&socket){
                localStorage.setItem("piilosana_nick",soloNickname);
                socket.emit("join_public",{nickname:soloNickname.trim()});
                setPublicState("waiting");
              }}}/>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>{
                if(!soloNickname.trim()||!socket)return;
                localStorage.setItem("piilosana_nick",soloNickname);
                socket.emit("join_public",{nickname:soloNickname.trim()});
                setPublicState("waiting");
              }} disabled={!soloNickname.trim()}
                style={{fontFamily:S.font,fontSize:"13px",color:soloNickname.trim()?S.bg:"#556",
                background:soloNickname.trim()?"#ff6644":"#333",border:"none",padding:"12px 24px",
                cursor:soloNickname.trim()?"pointer":"default",boxShadow:soloNickname.trim()?"3px 3px 0 #cc3311":"none"}}>
                LIITY
              </button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer"}}>TAKAISIN</button>
            </div>
          </div>
        </div>
      )}

      {/* AREENA - waiting for round */}
      {mode==="public"&&publicState==="waiting"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <p style={{fontSize:"18px",color:"#ff6644"}}>AREENA</p>
          <p style={{fontSize:"13px",color:"#556",marginTop:"12px"}}>Seuraava kierros alkaa</p>
          {publicNextCountdown>0&&<p style={{fontSize:"28px",color:S.green,marginTop:"8px"}}>{publicNextCountdown}s</p>}
          <p style={{fontSize:"11px",color:"#88ccaa",marginTop:"8px"}}>{publicPlayerCount} pelaajaa areenalla</p>
        </div>
      )}

      {/* PIILOSAUNA - countdown */}
      {mode==="public"&&publicState==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"11px",color:"#ff6644",marginBottom:"24px"}}>AREENA</div>
          <div style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>{publicPlayerCount} pelaajaa</div>
          <div style={{fontSize:"18px",color:S.green}}>VALMISTAUDU</div>
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
            <div style={{fontSize:"13px",color:"#ff6644",marginBottom:"4px"}}>AREENA — KIERROS PÄÄTTYI</div>
            <div style={{fontSize:"13px",color:"#556",marginBottom:"10px"}}>PISTEESI</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}</div>
            <div style={{fontSize:"13px",color:"#88ccaa",marginTop:"6px"}}>{found.length} / {valid.size} sanaa ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            <div style={{fontSize:"13px",color:publicNextCountdown<=10?S.yellow:"#88ccaa",marginTop:"12px"}}>
              Seuraava kierros: {publicNextCountdown>0?`${publicNextCountdown}s`:"alkaa!"}
            </div>
            <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",marginTop:"10px"}}>POISTU</button>
          </div>

          {/* Rankings with medals */}
          {publicRankings&&publicRankings.length>0&&(
            <div style={{border:`2px solid ${S.border}`,padding:"8px",background:S.dark,marginBottom:"10px",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"13px",color:S.yellow,marginBottom:"8px"}}>KIERROKSEN TULOKSET</div>
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
                      <span style={{fontSize:"11px",color:"#556"}}>{r.wordsFound} sanaa</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All found words (collective) */}
          {publicFoundSorted.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"13px",color:S.green,marginBottom:"6px"}}>LÖYDETYT SANAT ({publicFoundSorted.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicFoundSorted.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:found.includes(w)?"#1a3a2a":"#1a1a2a",padding:"2px 4px",
                    border:`1px solid ${found.includes(w)?wordColor(w.length)+"44":"#33333366"}`,
                    color:found.includes(w)?wordColor(w.length):"#667"}}>{w.toUpperCase()}</span>
                ))}
              </div>
              <div style={{fontSize:"11px",color:"#556",marginTop:"4px"}}>Omat sanasi korostettu väreillä</div>
            </div>
          )}

          {/* Missed words */}
          {publicMissed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>JÄIVÄT LÖYTÄMÄTTÄ ({publicMissed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {publicMissed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:"#2a1a1a",padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame gameMode="normal" gameTime={120} currentScore={score} S={S}/>
        </div>
        );
      })()}

      {/* SOLO MENU - just play button */}
      {mode==="solo"&&state==="menu"&&(
        <div style={{textAlign:"center",marginTop:"30px",animation:"fadeIn 0.5s ease"}}>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>PELIMUOTO</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>setSoloMode("normal")} style={{fontFamily:S.font,fontSize:"11px",color:soloMode==="normal"?S.bg:S.green,background:soloMode==="normal"?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>NORMAALI</button>
              <button onClick={()=>setSoloMode("tetris")} style={{fontFamily:S.font,fontSize:"11px",color:soloMode==="tetris"?S.bg:S.purple,background:soloMode==="tetris"?S.purple:"transparent",border:`2px solid ${S.purple}`,padding:"8px 16px",cursor:"pointer"}}>TETRIS ⬇️</button>
            </div>
            {soloMode==="tetris"&&<p style={{fontSize:"11px",color:S.purple,marginTop:"8px",lineHeight:"1.8"}}>Löydetyt kirjaimet katoavat ja uudet tippuvat ylhäältä!</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>AIKA</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setGameTime(120)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===120?S.bg:S.green,background:gameTime===120?S.green:"transparent",border:`2px solid ${S.green}`,padding:"8px 16px",cursor:"pointer"}}>2 MIN</button>
              <button onClick={()=>setGameTime(402)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===402?S.bg:S.yellow,background:gameTime===402?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>6,7 MIN</button>
              <button onClick={()=>setGameTime(0)} style={{fontFamily:S.font,fontSize:"11px",color:gameTime===0?S.bg:"#44ddff",background:gameTime===0?"#44ddff":"transparent",border:"2px solid #44ddff",padding:"8px 16px",cursor:"pointer"}}>RAJATON ∞</button>
            </div>
            {gameTime===0&&<p style={{fontSize:"11px",color:"#44ddff",marginTop:"8px",lineHeight:"1.8"}}>Ei aikarajaa! Vaihda ruudukko kun haluat.</p>}
          </div>
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:S.green,marginBottom:"8px"}}>MUUT VALINNAT</p>
            <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
              <button onClick={()=>setLetterMult(v=>!v)} style={{fontFamily:S.font,fontSize:"11px",color:letterMult?S.bg:S.yellow,background:letterMult?S.yellow:"transparent",border:`2px solid ${S.yellow}`,padding:"8px 16px",cursor:"pointer"}}>
                {letterMult?"✓ ":""}KIRJAINKERTOIMET
              </button>
            </div>
            {letterMult&&<p style={{fontSize:"11px",color:S.yellow,marginTop:"6px",lineHeight:"1.8"}}>Harvinaiset kirjaimet = enemmän pisteitä! (D,Ö=7 V,J,H,Y,P,U=4 ...)</p>}
          </div>
          {gameTime!==0&&(
          <div style={{marginBottom:"16px"}}>
            <p style={{fontSize:"11px",color:"#556",marginBottom:"6px"}}>NIMIMERKKI (ennätystauluun)</p>
            <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
              placeholder="VAPAAEHTOINEN" style={{fontFamily:S.font,fontSize:"11px",color:S.green,background:S.dark,
              border:`2px solid ${S.border}`,padding:"8px",width:"160px",textAlign:"center",outline:"none"}}/>
            {soloNickname.trim()&&<p style={{fontSize:"11px",color:"#88ccaa",marginTop:"4px"}}>Pisteesi tallennetaan nimellä {soloNickname.trim()}</p>}
          </div>
          )}
          <button onClick={start} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"14px 32px",cursor:"pointer",boxShadow:"4px 4px 0 #008844"}}
            onMouseEnter={e=>{e.target.style.transform="translate(-2px,-2px)";e.target.style.boxShadow="6px 6px 0 #008844"}}
            onMouseLeave={e=>{e.target.style.transform="none";e.target.style.boxShadow="4px 4px 0 #008844"}}>
            PELAA
          </button>
        </div>
      )}

      {/* COUNTDOWN */}
      {state==="countdown"&&(
        <div style={{textAlign:"center",marginTop:"60px",animation:"fadeIn 0.5s ease"}}>
          <div style={{fontSize:"11px",color:S.green,marginBottom:"24px"}}>{mode==="multi"?(gameMode==="battle"?"⚔️ TAISTELU ALKAA":"PELI ALKAA"):(soloMode==="tetris"?"⬇️ TETRIS ALKAA":"VALMISTAUDU")}</div>
          <div key={countdown} style={{fontSize:"72px",color:countdown<=2?S.red:countdown<=3?S.yellow:S.green,textShadow:`0 0 40px ${countdown<=2?"#ff444488":countdown<=3?"#ffcc0088":"#00ff8888"}`,animation:"pop 0.3s ease",lineHeight:"1"}}>
            {countdown>0?countdown:"PELAA!"}
          </div>
          {mode==="multi"&&<div style={{fontSize:"18px",color:"#556",marginTop:"24px"}}>{players.length} pelaajaa</div>}
        </div>
      )}

      {/* PLAYING + ENDING */}
      {(state==="play"||state==="ending")&&(
        <div style={{width:"100%",maxWidth:"600px",position:"relative",padding:"0 2px"}}>
          {/* HUD */}
          <div style={{marginBottom:"6px",border:`2px solid ${(gameMode==="battle"||(mode==="solo"&&soloMode==="tetris"))?S.purple+"88":gameTime===0?"#44ddff88":S.border}`,background:S.dark}}>
            {mode==="public"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:"#ff6644",background:"#ff664411",borderBottom:`1px solid ${S.border}`}}>AREENA — {publicPlayerCount} pelaajaa</div>}
            {mode==="multi"&&gameMode==="battle"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`}}>⚔️ TAISTELU</div>}
            {mode==="solo"&&soloMode==="tetris"&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.purple,background:"#ff66ff11",borderBottom:`1px solid ${S.border}`}}>⬇️ TETRIS</div>}
            {mode==="solo"&&gameTime===0&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:"#44ddff",background:"#44ddff11",borderBottom:`1px solid ${S.border}`}}>∞ RAJATON</div>}
            {letterMult&&<div style={{textAlign:"center",padding:"3px",fontSize:"10px",color:S.yellow,background:"#ffcc0011",borderBottom:`1px solid ${S.border}`}}>KIRJAINKERTOIMET</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px"}}>
              {gameTime!==0?(
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>AIKA</div>
                <div style={{fontSize:"18px",color:time<=15?S.red:time<=30?S.yellow:S.green}}>{fmt(time)}</div>
              </div>
              ):(
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>SANOJA</div>
                <div style={{fontSize:"18px",color:"#44ddff"}}>{found.length}</div>
              </div>
              )}
              <div style={{textAlign:"center",flex:1}}>
                <div style={{fontSize:"13px",color:"#555",marginBottom:"2px"}}>PISTEET</div>
                <div style={{fontSize:"18px",color:S.yellow}}>{score}</div>
              </div>
            </div>
            <div ref={wordBarRef} key={flashKey} style={{borderTop:`1px solid ${S.border}`,padding:"4px 10px",textAlign:"center",animation:flashKey>0&&!word&&msg?.ok?"wordFlash 0.6s ease-out":"none"}}>
              <div style={{fontSize:"18px",minHeight:"20px",animation:shake?"shake 0.4s":(!word&&msg?.ok?"scoreJump 0.4s ease-out":"none"),color:word?wordColor(word.length):undefined}}>
                {state==="ending"?<span style={{color:ending?.color,fontSize:"16px",animation:"pulse 1s infinite"}}>{ending?.emoji} {ending?.name}</span>:
                 word?word.toUpperCase():
                 (msg?<span style={{color:msg.ok?S.green:S.red,fontSize:msg.ok?"12px":"10px",fontWeight:msg.ok?"bold":"normal"}}>{msg.ok?`${msg.t?.toUpperCase()} +${msg.p}p${msg.combo>=3?" COMBO!":""}`:msg.m}</span>:<span style={{color:"#333"}}>···</span>)}
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
              {combo>=5?`MEGA KOMBO x${combo}!`:combo>=3?`KOMBO x${combo}! (x2 pisteet)`:`${combo} putkeen!`}
            </div>
          )}

          {/* Percentage counter - solo normal + classic multi only */}
          {mode==="solo"&&soloMode==="normal"&&state==="play"&&valid.size>0&&(
            <div style={{textAlign:"center",fontSize:"11px",color:"#556",marginBottom:"4px"}}>
              {found.length} / {valid.size} sanaa ({Math.round(found.length/valid.size*100)}%)
            </div>
          )}
          {mode==="multi"&&gameMode==="classic"&&state==="play"&&valid.size>0&&(
            <div style={{textAlign:"center",fontSize:"11px",color:"#556",marginBottom:"4px"}}>
              {found.length} / {valid.size} sanaa ({Math.round(found.length/valid.size*100)}%)
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
              style={{display:"grid",gridTemplateColumns:`repeat(${SZ},1fr)`,gap:"4px",padding:"6px",background:"#111133",
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
                      fontSize:"clamp(28px,8vw,48px)",fontFamily:"'VT323',monospace",fontWeight:"normal",
                      color:eaten?endColor||"transparent":s?"#0a0a1a":otherSelColor||(letterMult?letterColor(letter):S.green),
                      background:eaten?"#111133":last?S.yellow:s?S.green:otherSelColor?otherSelColor+"33":S.cell,
                      border:`2px solid ${eaten?"#111133":s?S.green:otherSelColor||S.cellBorder}`,
                      cursor:state==="play"?"pointer":"default",transition:"all 0.1s",
                      boxShadow:eaten?"none":s?`0 0 12px ${S.green}66`:otherSelColor?`0 0 8px ${otherSelColor}44`:"none",
                      textTransform:"uppercase",textShadow:s||eaten?"none":`0 0 8px ${otherSelColor||(letterMult?letterColor(letter):S.green)}44`,
                      animation:eaten?endAnim:useDropAnim?`cellDrop 0.3s ${c*0.03}s ease-out`:"none",
                      "--ex":`${((c-2)*40)}px`,"--ey":`${((r-2)*40)}px`,
                      position:"relative",
                    }}>
                    {eaten?"":<>
                      {letter}
                      {letterMult&&<span style={{position:"absolute",bottom:"1px",right:"3px",fontSize:"clamp(9px,2.5vw,13px)",fontFamily:"'Press Start 2P',monospace",color:letterColor(letter),opacity:0.7,lineHeight:1}}>{LETTER_VALUES[letter]||1}</span>}
                    </>}
                  </div>
                );
              }))}
            </div>
            {state==="ending"&&<EndingOverlay ending={ending} progress={endingProgress} gridRect={true}/>}
          </div>

          {state==="play"&&(
            <div style={{marginTop:"8px",padding:"8px",border:`2px solid ${S.border}`,background:S.dark,maxHeight:"120px",overflowY:"auto"}}>
              <div style={{fontSize:"13px",color:"#555",marginBottom:"4px"}}>{(gameMode==="battle"||(mode==="solo"&&soloMode==="tetris"))?`LÖYDETYT (${found.length})`:`LÖYDETYT (${found.length}/${valid.size})`}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {found.length===0?<span style={{fontSize:"18px",color:"#333"}}>Vedä kirjaimista sanoja...</span>:
                  found.map((w,i)=>(
                    <span key={i} style={{fontSize:"18px",background:"#1a3a2a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length),animation:i===found.length-1?"pop 0.3s ease":"none"}}>
                      {w.toUpperCase()} +{letterMult?ptsLetters(w):pts(w.length)}
                    </span>
                  ))
                }
              </div>
            </div>
          )}

          {/* Unlimited mode: refresh + end buttons */}
          {state==="play"&&mode==="solo"&&gameTime===0&&(
            <div style={{display:"flex",gap:"8px",marginTop:"8px"}}>
              <button onClick={refreshGrid} style={{fontFamily:S.font,fontSize:"11px",color:"#44ddff",background:"transparent",border:"2px solid #44ddff",padding:"10px 16px",cursor:"pointer",flex:1}}>🔄 UUDET KIRJAIMET</button>
              <button onClick={endUnlimited} style={{fontFamily:S.font,fontSize:"11px",color:S.red,background:"transparent",border:`2px solid ${S.red}`,padding:"10px 16px",cursor:"pointer",flex:1}}>⏹ LOPETA</button>
            </div>
          )}
        </div>
      )}

      {/* GAME OVER */}
      {mode==="solo"&&state==="end"&&(
        <div style={{width:"100%",maxWidth:"600px",textAlign:"center",animation:"fadeIn 1s ease"}}>
          <div style={{border:`3px solid ${ending?.color||S.yellow}`,padding:"20px",marginBottom:"12px",boxShadow:`0 0 30px ${ending?.color||S.yellow}33`,background:S.dark}}>
            <div style={{fontSize:"13px",color:ending?.color||S.yellow,marginBottom:"4px"}}>{ending?.emoji} {ending?.desc||"Peli päättyi!"}</div>
            <div style={{fontSize:"13px",color:"#556",marginBottom:"10px"}}>PISTEET</div>
            <div style={{fontSize:"28px",color:S.green,marginBottom:"2px",animation:"pop 0.3s ease"}}>{score}{(soloMode!=="tetris"&&gameTime!==0)?<span style={{fontSize:"16px",color:"#556"}}> / {totalPossible}</span>:null}</div>
            {(soloMode==="tetris"||gameTime===0)?<div style={{fontSize:"13px",color:"#556",marginTop:"6px"}}>{found.length} sanaa löydetty</div>:<>
            <div style={{fontSize:"13px",color:"#88ccaa",marginTop:"6px"}}>{found.length} / {valid.size} sanaa ({valid.size>0?Math.round(found.length/valid.size*100):0}%)</div>
            </>}

            {/* Hall of Fame submit */}
            {gameTime!==0&&score>0&&!hofSubmitted&&(
              <div style={{marginTop:"12px",padding:"10px",border:`1px solid ${S.yellow}44`,background:"#ffcc0008"}}>
                {soloNickname.trim()?(
                  <button onClick={async()=>{
                    await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                      wordsTotal:valid.size,gameMode:soloMode,gameTime});
                    setHofSubmitted(true);
                  }} style={{fontFamily:S.font,fontSize:"11px",color:S.bg,background:S.yellow,border:"none",padding:"8px 16px",cursor:"pointer"}}>
                    TALLENNA NIMELLÄ {soloNickname.trim()}
                  </button>
                ):(
                  <>
                    <div style={{fontSize:"11px",color:S.yellow,marginBottom:"6px"}}>TALLENNA ENNÄTYSTAULULLE</div>
                    <div style={{display:"flex",gap:"6px",justifyContent:"center",alignItems:"center"}}>
                      <input type="text" maxLength="12" value={soloNickname} onChange={e=>{setSoloNickname(e.target.value.toUpperCase());localStorage.setItem("piilosana_nick",e.target.value.toUpperCase());}}
                        placeholder="NIMIMERKKI" style={{fontFamily:S.font,fontSize:"11px",color:S.green,background:S.dark,
                        border:`2px solid ${S.green}`,padding:"8px",width:"140px",textAlign:"center",outline:"none"}}/>
                      <button onClick={async()=>{
                        if(!soloNickname.trim())return;
                        await submitToHallOfFame({nickname:soloNickname.trim(),score,wordsFound:found.length,
                          wordsTotal:valid.size,gameMode:soloMode,gameTime});
                        setHofSubmitted(true);
                      }} disabled={!soloNickname.trim()}
                        style={{fontFamily:S.font,fontSize:"11px",color:soloNickname.trim()?S.bg:"#556",
                        background:soloNickname.trim()?S.yellow:"#333",border:"none",padding:"8px 12px",cursor:soloNickname.trim()?"pointer":"default"}}>
                        TALLENNA
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {hofSubmitted&&<div style={{fontSize:"11px",color:S.green,marginTop:"8px"}}>✓ Tallennettu!</div>}

            <div style={{display:"flex",flexDirection:"column",gap:"8px",alignItems:"center",marginTop:"10px"}}>
              <button onClick={()=>{setHofSubmitted(false);start();}} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.green,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #008844",width:"280px"}}>UUSI HARJOITUS</button>
              <button onClick={switchToMulti} style={{fontFamily:S.font,fontSize:"18px",color:S.bg,background:S.yellow,border:"none",padding:"10px 20px",cursor:"pointer",boxShadow:"3px 3px 0 #cc8800",width:"280px"}}>OMA NETTIPELI</button>
              <button onClick={returnToModeSelect} style={{fontFamily:S.font,fontSize:"11px",color:S.green,border:`2px solid ${S.green}`,background:"transparent",padding:"8px 20px",cursor:"pointer",width:"280px"}}>VALIKKO</button>
            </div>
          </div>

          {found.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,marginBottom:"10px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
              <div style={{fontSize:"18px",color:S.green,marginBottom:"6px"}}>LÖYSIT ({found.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {[...found].sort((a,b)=>b.length-a.length).map((w,i)=>(
                  <span key={i} style={{fontSize:"18px",background:"#1a3a2a",padding:"2px 4px",border:`1px solid ${wordColor(w.length)}44`,color:wordColor(w.length)}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {soloMode!=="tetris"&&gameTime!==0&&missed.length>0&&(
            <div style={{padding:"8px",border:`2px solid ${S.border}`,background:S.dark,textAlign:"left",maxHeight:"180px",overflowY:"auto",animation:"fadeIn 1s ease"}}>
              <div style={{fontSize:"13px",color:"#ff6666",marginBottom:"6px"}}>JÄIVÄT LÖYTÄMÄTTÄ ({missed.length})</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"3px"}}>
                {missed.map((w,i)=>(
                  <span key={i} style={{fontSize:"14px",background:"#2a1a1a",padding:"2px 4px",border:"1px solid #ff444444",color:"#ff6666"}}>{w.toUpperCase()}</span>
                ))}
              </div>
            </div>
          )}

          {/* Hall of Fame */}
          <HallOfFame gameMode={soloMode} gameTime={gameTime} currentScore={hofSubmitted?score:null} S={S}/>
        </div>
      )}

      {/* Ad banner placeholder */}
      <div style={{width:"100%",maxWidth:"600px",minHeight:"60px",marginTop:"16px",flexShrink:0}}/>
    </div>
  );
}
