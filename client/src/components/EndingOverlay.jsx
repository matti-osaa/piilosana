// EndingOverlay.jsx – siirretty App.jsx:stä (vaihe 1a).

// ============================================
// ENDINGS - 10 different game over animations
// ============================================
const ENDINGS = [
  { name:"LUMIMONSTERI", emoji:"⛄", color:"#6688ff",
    desc:{fi:"Lumimonsteri syö kirjaimet ja lauta tyhjenee",sv:"Snömonstret äter bokstäverna och brädet töms",en:"The snow monster eats the letters and the board empties"},
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
    desc:{fi:"Tulva nousee ja huuhtoo laudan tyhjäksi",sv:"Floden stiger och sköljer brädet tomt",en:"The flood rises and washes the board clean"},
    cellAnim:(i,total)=>{const row=Math.floor(i/5);const delay=(4-row)*0.12;return `cellFloat 0.6s ${delay}s ease forwards`;},
    cellColor:(i)=>"#4488ff",
    overlay:(progress)=>({
      bg:`linear-gradient(to top, #2244aa${Math.floor(progress*200).toString(16).padStart(2,'0')} 0%, transparent ${Math.min(100,progress*120)}%)`,
      text:progress>0.5?"TULVA!":"",textColor:"#88bbff",
      particles:Array.from({length:12},(_,i)=>({x:Math.random()*100,y:100-progress*100+Math.random()*30,size:2+Math.random()*4,color:"#88ccff",opacity:0.4}))
    })
  },
  { name:"RÄJÄHDYS", emoji:"💥", color:"#ff6622",
    desc:{fi:"Pommi räjähtää ja lauta lentää palasiksi",sv:"Bomben exploderar och brädet flyger i bitar",en:"The bomb goes off and the board blows to pieces"},
    cellAnim:(i,total)=>{const r=Math.floor(i/5)-2,c=i%5-2;const dist=Math.sqrt(r*r+c*c);return `cellExplode 0.48s ${dist*0.07}s ease forwards`;},
    cellColor:(i)=>"#ff6622",
    overlay:(progress)=>({
      bg:progress<0.3?`radial-gradient(circle at 50% 50%, #ff662266 0%, #ff220022 50%, transparent 70%)`:"transparent",
      text:progress>0.2?"BOOM!":"",textColor:"#ff8844",
      particles:Array.from({length:25},(_,i)=>({x:50+((Math.random()-0.5)*progress*200),y:50+((Math.random()-0.5)*progress*200),size:2+Math.random()*6,color:Math.random()>0.5?"#ff6622":"#ffcc00",opacity:Math.max(0,1-progress)}))
    })
  },
  { name:"TULIPALO", emoji:"🔥", color:"#ff4400",
    desc:{fi:"Tulipalo leviää ja polttaa laudan tuhkaksi",sv:"Elden sprider sig och bränner brädet till aska",en:"The fire spreads and burns the board to ash"},
    cellAnim:(i,total)=>{const r=Math.floor(i/5),c=i%5;const edge=Math.min(r,c,4-r,4-c);return `cellBurn 0.48s ${edge*0.15}s ease forwards`;},
    cellColor:(i)=>["#ff4400","#ff6600","#ffaa00","#ff8800"][i%4],
    overlay:(progress)=>({
      bg:`linear-gradient(to top, #ff440033 0%, #ff880011 ${progress*60}%, transparent ${progress*100}%)`,
      text:progress>0.4?"ROIHU!":"",textColor:"#ff8844",
      particles:Array.from({length:20},(_,i)=>({x:10+Math.random()*80,y:100-Math.random()*progress*120,size:3+Math.random()*6,color:Math.random()>0.5?"#ff6600":"#ffcc00",opacity:0.5+Math.random()*0.3}))
    })
  },
  { name:"MUSTA AUKKO", emoji:"🕳️", color:"#8844cc",
    desc:{fi:"Musta aukko imee laudan sisäänsä",sv:"Det svarta hålet suger in hela brädet",en:"The black hole swallows the whole board"},
    cellAnim:(i,total)=>{const r=Math.floor(i/5)-2,c=i%5-2;const dist=Math.sqrt(r*r+c*c);return `cellVortex 0.72s ${(3-dist)*0.12}s ease forwards`;},
    cellColor:(i)=>"#8844cc",
    overlay:(progress)=>({
      bg:`radial-gradient(circle at 50% 50%, #000000 ${progress*15}%, #8844cc22 ${progress*30}%, transparent 60%)`,
      text:progress>0.5?"WOOOOSH":"",textColor:"#aa66ff",
      particles:Array.from({length:15},(_,i)=>({x:50+Math.cos(i+progress*10)*30*(1-progress),y:50+Math.sin(i+progress*10)*30*(1-progress),size:2+Math.random()*3,color:"#aa66ff",opacity:0.5}))
    })
  },
  { name:"UFO", emoji:"🛸", color:"#44ff88",
    desc:{fi:"Ufo imaisee kirjaimet mukaansa ja lauta tyhjenee",sv:"Ufon suger upp bokstäverna och brädet töms",en:"The UFO beams up the letters and the board empties"},
    cellAnim:(i,total)=>`cellBeamUp 0.48s ${i*0.05}s ease forwards`,
    cellColor:(i)=>"#44ff88",
    overlay:(progress)=>({
      bg:`linear-gradient(to bottom, #44ff8811 0%, transparent 30%)`,
      text:progress>0.3?"BZZZT!":"",textColor:"#44ff88",
      particles:Array.from({length:10},(_,i)=>({x:30+Math.random()*40,y:Math.random()*progress*60,size:1+Math.random()*3,color:"#88ffaa",opacity:0.6}))
    })
  },
  { name:"TORNADO", emoji:"🌪️", color:"#aabbcc",
    desc:{fi:"Tornado tempaa kirjaimet mukaansa ja lauta tyhjenee",sv:"Tornadon rycker med sig bokstäverna och brädet töms",en:"The tornado sweeps the letters away and the board empties"},
    cellAnim:(i,total)=>`cellTornado 0.6s ${i*0.04}s ease forwards`,
    cellColor:(i)=>"#aabbcc",
    overlay:(progress)=>({
      bg:"transparent",
      text:progress>0.3?"WHOOOOSH!":"",textColor:"#ccddee",
      particles:Array.from({length:20},(_,i)=>({x:50+Math.cos(i*0.8+progress*15)*40*progress,y:50+Math.sin(i*0.8+progress*15)*40*progress,size:2+Math.random()*4,color:"#aabbcc",opacity:0.4}))
    })
  },
  { name:"PAKKANEN", emoji:"❄️", color:"#88ddff",
    desc:{fi:"Pakkanen jäädyttää laudan ja se särkyy palasiksi",sv:"Kylan fryser brädet och det spricker i bitar",en:"The frost freezes the board and it shatters to pieces"},
    cellAnim:(i,total)=>`cellFreeze 0.6s ${Math.random()*0.42}s ease forwards`,
    cellColor:(i)=>"#88ddff",
    overlay:(progress)=>({
      bg:`linear-gradient(135deg, #88ddff11 0%, #ffffff08 50%, #88ddff11 100%)`,
      text:progress>0.4?"KRRK!":"",textColor:"#aaeeff",
      particles:Array.from({length:25},(_,i)=>({x:Math.random()*100,y:Math.random()*100,size:1+Math.random()*4,color:"white",opacity:0.3+Math.random()*0.5}))
    })
  },
  { name:"LOHIKÄÄRME", emoji:"🐉", color:"#ff4466",
    desc:{fi:"Lohikäärme puhaltaa tulta ja polttaa laudan",sv:"Draken sprutar eld och bränner upp brädet",en:"The dragon breathes fire and burns the board"},
    cellAnim:(i,total)=>{const c=i%5;return `cellDragonFire 0.48s ${c*0.09}s ease forwards`;},
    cellColor:(i)=>["#ff2200","#ff6600","#ffaa00","#ff4400","#ff8800"][i%5],
    overlay:(progress)=>({
      bg:progress>0.2?`linear-gradient(to right, #ff440033 0%, #ff880011 50%, transparent 100%)`:"transparent",
      text:progress>0.3?"ROOAR!":"",textColor:"#ff6644",
      particles:Array.from({length:15},(_,i)=>({x:progress*120-20+Math.random()*30,y:30+Math.random()*40,size:3+Math.random()*5,color:Math.random()>0.5?"#ff4400":"#ffaa00",opacity:0.5}))
    })
  },
  { name:"GLITCH", emoji:"👾", color:"#00ff00",
    desc:{fi:"Järjestelmävirhe pyyhkii laudan muistista",sv:"Ett systemfel raderar brädet ur minnet",en:"A system error wipes the board from memory"},
    cellAnim:(i,total)=>`cellGlitch 0.36s ${Math.random()*0.48}s steps(4) forwards`,
    cellColor:(i)=>["#ff0000","#00ff00","#0000ff","#ff00ff","#00ffff"][i%5],
    overlay:(progress)=>({
      bg:"transparent",
      text:progress>0.2?(Math.random()>0.5?"ERR0R!":"SY5T3M FA1L"):"",textColor:"#00ff00",
      particles:Array.from({length:8},(_,i)=>({x:Math.random()*100,y:Math.random()*100,size:Math.random()*100,color:`#${Math.floor(Math.random()*16777215).toString(16)}`,opacity:0.1+Math.random()*0.2}))
    })
  },
  { name:"SULJETTU", emoji:"🚪", color:"#8b6914",
    desc:{fi:"Putiikki menee kiinni ja lauta katoaa luukkujen taakse",sv:"Butiken stänger och brädet försvinner bakom luckorna",en:"The shop closes and the board vanishes behind the shutters"},
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

// ============================================
// ENDING OVERLAY COMPONENT
// ============================================
function endingDesc(ending,lang){const d=ending.desc;return typeof d==="string"?d:(d[lang]||d.fi);}
function EndingOverlay({ending, progress, gridRect, lang}){
  if(!ending||!gridRect)return null;
  const desc=endingDesc(ending,lang);
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
          <div style={{fontFamily:"inherit",fontSize:"24px",fontWeight:"700",color:ending.color,textShadow:`0 0 30px ${ending.color}aa, 0 0 60px ${ending.color}44`,animation:"pop 0.6s ease",letterSpacing:"2px",marginBottom:"14px"}}>
            {ending.name}
          </div>
          <div style={{fontFamily:"inherit",fontSize:"16px",fontWeight:"600",color:"#ffffff",textShadow:`0 0 20px ${ending.color}aa, 2px 2px 0 #000`,animation:"fadeIn 0.8s ease",lineHeight:"1.8",padding:"0 8px"}}>
            {desc}
          </div>
        </div>
      )}
      {/* Action text during cell eating phase */}
      {!introPhase&&(
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center",zIndex:60,width:"90%"}}>
          {ending.emoji&&<div style={{fontSize:"56px",animation:"pop 0.4s ease",marginBottom:"6px"}}>{ending.emoji}</div>}
          <div style={{fontFamily:"inherit",fontSize:"18px",fontWeight:"600",color:"#ffffff",textShadow:`0 0 20px ${ending.color}aa, 2px 2px 0 #000`,lineHeight:"1.8",marginBottom:"8px"}}>
            {desc}
          </div>
          {ov.text&&<div style={{fontFamily:"inherit",fontSize:"26px",fontWeight:"700",color:ov.textColor,textShadow:`0 0 20px ${ov.textColor}88, 0 0 40px ${ov.textColor}44`,animation:"pop 0.4s ease"}}>
            {ov.text}
          </div>}
        </div>
      )}
    </div>
  );
}

export { ENDINGS, endingDesc, EndingOverlay };
