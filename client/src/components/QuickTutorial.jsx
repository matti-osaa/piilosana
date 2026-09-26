// QuickTutorial.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useState, useRef, useEffect } from "react";

// ============================================
// QUICK TUTORIAL - animated demo showing how to drag words
// ============================================
const TUTORIAL_GRIDS={
  fi:{
    // 4 rows × 5 cols – letters placed so paths spell real words
    // sauna: (2,0)s → (1,0)a → (0,0)u → (0,1)n → (1,1)a
    // suo:   (3,2)s → (3,1)u → (2,1)o
    grid:[
      ["u","n","k","e","t"],
      ["a","a","l","i","v"],
      ["s","o","m","a","p"],
      ["r","u","s","h","i"],
    ],
    words:[
      {word:"sauna",path:[[2,0],[1,0],[0,0],[0,1],[1,1]],color:"#44ff88"},
      {word:"suo",path:[[3,2],[3,1],[2,1]],color:"#ffaa44"},
    ],
  },
  en:{
    // train: (2,0)t → (1,0)r → (0,0)a → (0,1)i → (1,1)n
    // net:   (3,2)n → (3,1)e → (2,1)t
    grid:[
      ["a","i","k","o","p"],
      ["r","n","l","f","d"],
      ["t","t","m","h","s"],
      ["g","e","n","a","w"],
    ],
    words:[
      {word:"train",path:[[2,0],[1,0],[0,0],[0,1],[1,1]],color:"#44ff88"},
      {word:"net",path:[[3,2],[3,1],[2,1]],color:"#ffaa44"},
    ],
  },
  sv:{
    // storm: (2,0)s → (1,0)t → (0,0)o → (0,1)r → (1,1)m
    // sol:   (3,2)s → (3,1)o → (2,1)l
    grid:[
      ["o","r","k","e","n"],
      ["t","m","a","i","d"],
      ["s","l","v","h","p"],
      ["g","o","s","a","f"],
    ],
    words:[
      {word:"storm",path:[[2,0],[1,0],[0,0],[0,1],[1,1]],color:"#44ff88"},
      {word:"sol",path:[[3,2],[3,1],[2,1]],color:"#ffaa44"},
    ],
  },
};

function QuickTutorial({lang,theme,onClose}){
  const S=theme;
  const config=TUTORIAL_GRIDS[lang]||TUTORIAL_GRIDS.fi;
  const grid=config.grid;
  const rows=grid.length,cols=grid[0].length;
  const [step,setStep]=useState(0); // which word we're animating
  const [progress,setProgress]=useState(0); // 0..1 progress along current word path
  const [completedWords,setCompletedWords]=useState([]);
  const [wordFlash,setWordFlash]=useState(null);
  const containerRef=useRef(null);

  // Timing: each word takes ~2.5s to trace, 1s pause between, 1s at end
  const TRACE_DURATION=2500;
  const PAUSE_BETWEEN=800;
  const END_PAUSE=1500;

  useEffect(()=>{
    let cancelled=false;
    async function animate(){
      for(let wi=0;wi<config.words.length;wi++){
        if(cancelled)return;
        setStep(wi);
        setProgress(0);
        // Animate tracing
        await new Promise(resolve=>{
          const start=performance.now();
          function tick(now){
            if(cancelled){resolve();return;}
            const elapsed=now-start;
            const p=Math.min(1,elapsed/TRACE_DURATION);
            setProgress(p);
            if(p<1)requestAnimationFrame(tick);
            else{
              setCompletedWords(prev=>[...prev,wi]);
              setWordFlash(wi);
              setTimeout(()=>setWordFlash(null),600);
              setTimeout(resolve,PAUSE_BETWEEN);
            }
          }
          requestAnimationFrame(tick);
        });
      }
      // Wait at end then close
      if(!cancelled)setTimeout(()=>{if(!cancelled)onClose();},END_PAUSE);
    }
    animate();
    return()=>{cancelled=true;};
  },[]);

  // Calculate which cells are currently "selected" (traced by the pointer)
  const currentWord=config.words[step];
  const path=currentWord?currentWord.path:[];
  const cellCount=path.length;
  const activeCellCount=Math.min(cellCount,Math.floor(progress*cellCount)+1);
  const activeCells=path.slice(0,Math.min(activeCellCount,cellCount));

  // All completed word cells
  const completedCells=new Set();
  completedWords.forEach(wi=>{
    config.words[wi].path.forEach(([r,c])=>completedCells.add(`${r},${c}`));
  });

  // Pointer is visible when we're actively tracing (not between words)
  const pointerVisible=progress>0||step===0;

  // Get cell center position using DOM refs
  const cellRefs=useRef({});
  const getCellCenter=(r,c)=>{
    const el=cellRefs.current[`${r},${c}`];
    const container=containerRef.current;
    if(!el||!container)return null;
    const cRect=container.getBoundingClientRect();
    const eRect=el.getBoundingClientRect();
    return{
      x:eRect.left+eRect.width/2-cRect.left,
      y:eRect.top+eRect.height/2-cRect.top,
    };
  };

  const hexClip="polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

  // Build the formed word text
  const formedWord=activeCells.map(([r,c])=>grid[r][c]).join("").toUpperCase();
  const completedWordTexts=completedWords.map(wi=>config.words[wi].word.toUpperCase());

  return(
    <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000dd",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"12px",animation:"fadeIn 0.3s ease"}} onClick={onClose}>
      <div style={{background:S.bg,border:`3px solid ${S.green}`,borderRadius:S.panelRadius,padding:"16px",maxWidth:"340px",width:"100%",boxShadow:S.panelShadow,position:"relative",maxHeight:"90vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <button onClick={onClose} style={{position:"absolute",top:"6px",right:"6px",fontFamily:S.font,fontSize:"14px",color:S.green,background:"transparent",border:`2px solid ${S.green}`,width:"28px",height:"28px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",borderRadius:S.btnRadius,zIndex:10}}>✕</button>

        {/* Otsikko */}
        <div style={{textAlign:"center",fontFamily:S.font,fontSize:"16px",fontWeight:"800",letterSpacing:"2px",textTransform:"uppercase",color:S.green,marginBottom:"6px",paddingRight:"28px"}}>
          {lang==="sv"?"Så spelar du: hitta ord":lang==="en"?"How to play: find words":"Näin pelaat: etsi sanoja"}
        </div>

        {/* Formed word display */}
        <div style={{textAlign:"center",marginBottom:"8px",minHeight:"28px"}}>
          {formedWord&&!completedWords.includes(step)&&(
            <span style={{fontSize:"18px",fontWeight:"700",fontFamily:S.font,color:currentWord.color,letterSpacing:"3px",textShadow:`0 0 10px ${currentWord.color}66`,animation:"none"}}>{formedWord}</span>
          )}
          {wordFlash!==null&&(
            <span style={{fontSize:"18px",fontWeight:"700",fontFamily:S.font,color:config.words[wordFlash].color,letterSpacing:"3px",textShadow:`0 0 15px ${config.words[wordFlash].color}88`,animation:"pop 0.5s ease"}}>{config.words[wordFlash].word.toUpperCase()} ✓</span>
          )}
        </div>

        {/* Mini hex grid */}
        <div style={{position:"relative",width:"100%",paddingBottom:"78%",overflow:"hidden",borderRadius:"12px",background:S.gridBg||S.dark,border:`2px solid ${S.border}`}}>
          <div ref={containerRef} style={{position:"absolute",inset:0,padding:"6px 8px"}}>
            {grid.map((row,r)=>(
              <div key={r} style={{display:"flex",justifyContent:"center",gap:"3px",
                marginTop:r>0?"calc(-4.475% + 1px)":"0",
                transform:r%2===1?"translateX(calc(18% / 4 + 0.5px))":"translateX(calc(-18% / 4 - 0.5px))",
                position:"relative",zIndex:rows-r}}>
                {row.map((letter,c)=>{
                  const cellKey=`${r},${c}`;
                  const isActive=activeCells.some(([ar,ac])=>ar===r&&ac===c)&&!completedWords.includes(step);
                  const isCompleted=completedCells.has(cellKey);
                  const wordIdx=isCompleted?completedWords.find(wi=>config.words[wi].path.some(([pr,pc])=>pr===r&&pc===c)):null;
                  const completedColor=wordIdx!==null&&wordIdx!==undefined?config.words[wordIdx].color:null;
                  const activeColor=currentWord?currentWord.color:"#44ff88";
                  const isLast=isActive&&activeCells.length>0&&activeCells[activeCells.length-1][0]===r&&activeCells[activeCells.length-1][1]===c;
                  const selIdx=isActive?activeCells.findIndex(([ar,ac])=>ar===r&&ac===c):-1;
                  const borderBg=isActive?`linear-gradient(${120+selIdx*60}deg, #00ffaa, #44bbff, #aa66ff, #ff66aa, #ffaa44, #00ffaa)`:(isCompleted?`${completedColor}88`:(S.cellBorder||S.border));
                  const cellBg=isActive?`linear-gradient(${160+selIdx*30}deg, ${S.cell}ee 0%, ${S.cell}cc 40%, ${S.dark||S.cell}dd 100%)`:(isCompleted?`${completedColor}44`:S.cellGradient?`linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)`:S.cell);

                  return(
                    <div key={c} ref={el=>{if(el)cellRefs.current[`${r},${c}`]=el;}} style={{width:"18%",aspectRatio:"0.866",position:"relative",
                      transition:"transform 0.2s cubic-bezier(0.34,1.56,0.64,1)",
                      transform:isActive?(isLast?"scale(1.12)":"scale(1.05)"):"none",
                      zIndex:isActive?10:0}}>
                      {/* Outer border — prismatic when active */}
                      <div style={{position:"absolute",inset:isActive?"-2px":"0",clipPath:hexClip,
                        background:borderBg,
                        backgroundSize:isActive?"300% 100%":"100% 100%",
                        animation:isActive?"hexPrismatic 6s linear infinite":"none",
                        transition:"all 0.2s ease",
                        boxShadow:isActive?`0 0 12px ${S.green}88, 0 0 20px #aa66ff44`:"none"}}/>
                      {/* Glow ring */}
                      {isActive&&<div style={{position:"absolute",inset:"-5px",clipPath:hexClip,
                        background:"radial-gradient(ellipse at 50% 50%, #44ffaa33 0%, #8866ff22 40%, transparent 70%)",
                        pointerEvents:"none"}}/>}
                      {/* Inner cell */}
                      <div style={{position:"absolute",inset:isActive?"3px":"1px",clipPath:hexClip,
                        background:cellBg,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:"clamp(14px,4.5vw,22px)",fontFamily:S.letterFont,fontWeight:"700",
                        textTransform:"uppercase",transition:"all 0.2s ease",
                        color:isActive?"#ffffff":(isCompleted?"#ffffff":(S.cellText||(S.cellGradient?"#e6eef8":"#22ccaa"))),
                        textShadow:isActive?`0 0 12px #44ffaa99, 0 0 24px #8866ff66, 0 1px 2px #000000aa`:(isCompleted?`0 1px 3px #00000088, 0 0 8px ${completedColor}88`:"none")}}>
                        <span style={{position:"relative",zIndex:2,
                          filter:isActive?"drop-shadow(0 0 4px #44ffaa88) drop-shadow(0 0 8px #8866ff44)":(isCompleted?"drop-shadow(0 1px 1px #00000066)":"none"),
                        }}>{letter}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Animated hand pointer */}
            {pointerVisible&&!completedWords.includes(step)&&(()=>{
              // Interpolate between cell centers using DOM positions
              const totalSegments=Math.max(1,path.length-1);
              const exactPos=progress*totalSegments;
              const segIdx=Math.max(0,Math.min(Math.floor(exactPos),totalSegments-1));
              const segProgress=exactPos-segIdx;
              const p1=getCellCenter(...path[segIdx]);
              const p2=getCellCenter(...path[Math.min(segIdx+1,path.length-1)]);
              if(!p1||!p2)return null;
              const px=p1.x+(p2.x-p1.x)*segProgress;
              const py=p1.y+(p2.y-p1.y)*segProgress;
              return(
                <div style={{position:"absolute",left:`${px}px`,top:`${py}px`,transform:"translate(-14px, -2px)",
                  pointerEvents:"none",zIndex:50,transition:"none",filter:"drop-shadow(0 3px 6px #00000077)"}}>
                  {/* Sormenpää (ihonvärinen etusormi, hieman kallellaan) – kärki osuu solun keskelle */}
                  <svg width="40" height="48" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" style={{overflow:"visible"}}>
                    <defs>
                      <linearGradient id="tutSkin" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#ffd8b5"/><stop offset="1" stopColor="#f0b388"/>
                      </linearGradient>
                    </defs>
                    <g transform="rotate(-18 50 60)">
                      {/* Pelkkä etusormi, alareuna pyöristetty */}
                      <path d="M40 96 L40 18 C40 8, 48 2, 54 2 C60 2, 68 8, 68 18 L68 96 C68 104, 40 104, 40 96 Z" fill="url(#tutSkin)" stroke="#b3785a" strokeWidth="3" strokeLinejoin="round"/>
                      <path d="M45 16 C45 8, 63 8, 63 16 C63 22, 45 22, 45 16 Z" fill="#ffe6d6" stroke="#d9a58a" strokeWidth="1.5"/>
                      <path d="M44 36 Q54 40 64 36" fill="none" stroke="#d29a7a" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M44 54 Q54 58 64 54" fill="none" stroke="#d29a7a" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M44 74 Q54 78 64 74" fill="none" stroke="#d29a7a" strokeWidth="1.8" strokeLinecap="round"/>
                    </g>
                    {/* Kosketusrengas sormenpäässä */}
                    <circle cx="36" cy="4" r="9" fill="none" stroke="#44ffaa" strokeWidth="2.5" opacity="0.7">
                      <animate attributeName="r" values="6;18;6" dur="1.5s" repeatCount="indefinite"/>
                      <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Completed words shown below */}
        <div style={{display:"flex",gap:"6px",justifyContent:"center",marginTop:"10px",minHeight:"24px",flexWrap:"wrap"}}>
          {completedWordTexts.map((w,i)=>(
            <span key={i} style={{fontSize:"13px",fontWeight:"700",fontFamily:S.font,color:config.words[i].color,
              padding:"2px 8px",border:`2px solid ${config.words[i].color}66`,borderRadius:"4px",
              background:`${config.words[i].color}15`,letterSpacing:"1px"}}>{w} ✓</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export { TUTORIAL_GRIDS, QuickTutorial };
