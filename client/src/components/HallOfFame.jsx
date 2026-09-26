// HallOfFame.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useState, useEffect } from "react";
import { SERVER_URL } from "../lib/config.js";
import { sectionPanel, sectionTitle } from "./panelStyle.js";
import { PixelFlag } from "./PixelArt.jsx";
import { SHAPE_NAMES, ShapeIcon } from "./ShapeBoard.jsx";

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
  const timeMins=gameTime/60;const timeLabel=Number.isInteger(timeMins)?`${timeMins} min`:lang==="en"?`${timeMins.toFixed(1)} min`:`${timeMins.toFixed(1).replace(".",",")} min`;
  const hofTitle=lang==="en"?"RECORDS":lang==="sv"?"REKORD":"ENNÄTYKSET";
  const hofLoading=lang==="en"?"Loading...":lang==="sv"?"Laddar...":"Ladataan...";
  const hofEmpty=lang==="en"?"No results yet":lang==="sv"?"Inga resultat ännu":"Ei tuloksia vielä";
  return(
    <div style={{...sectionPanel(S,S.yellow),marginTop:"14px",textAlign:"left",animation:"fadeIn 0.8s ease"}}>
      <div style={{...sectionTitle(S.yellow),display:"flex",alignItems:"center",gap:"6px"}}><PixelFlag lang={lang||"fi"} size={2}/>{hofTitle} <span style={{fontWeight:"normal",fontSize:"12px",color:S.textMuted}}>({label} {timeLabel})</span></div>
      {loading?<div style={{fontSize:"14px",color:S.textMuted,textAlign:"center"}}>{hofLoading}</div>:
      !scores||scores.length===0?<div style={{fontSize:"14px",color:S.textMuted,textAlign:"center"}}>{hofEmpty}</div>:
      <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
        {scores.map((s,i)=>{
          const isHighlight=currentScore&&s.score===currentScore&&i<10;
          const medals=["🥇","🥈","🥉"];
          return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",
            background:isHighlight?`${S.green}15`:"transparent",
            border:isHighlight?`1px solid ${S.green}33`:"1px solid transparent",
            borderRadius:"8px",marginBottom:"1px"}}>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <span style={{fontSize:"14px",minWidth:"24px",textAlign:"center"}}>{i<3?medals[i]:<span style={{color:S.textMuted,fontWeight:"600"}}>{i+1}.</span>}</span>
              <span style={{fontSize:"14px",color:S.textSoft,fontWeight:"600"}}>{s.nickname}</span>
            </div>
            <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
              <span style={{fontSize:"14px",color:S.green,fontWeight:"700",fontVariantNumeric:"tabular-nums"}}>{s.score}p</span>
              <span style={{fontSize:"14px",color:S.textMuted,minWidth:"38px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{s.percentage}%</span>
              {/* Laudan muoto; vanhat tulokset (ei muotoa) pelattiin kuusikulmiolla */}
              <span title={(SHAPE_NAMES[lang]||SHAPE_NAMES.fi)[s.shape||"hex"]} style={{display:"inline-flex",opacity:s.shape?1:0.55}}><ShapeIcon shape={s.shape||"hex"} color={S.textSoft||S.textMuted} size={16}/></span>
            </div>
          </div>;
        })}
      </div>}
    </div>
  );
}

// Submit score to hall of fame
async function submitToHallOfFame({nickname,score,wordsFound,wordsTotal,gameMode,gameTime,lang,shape}){
  if(!nickname||score<=0||!gameMode||!gameTime||gameTime===0)return null;
  try{
    const res=await fetch(`${SERVER_URL}/api/hall-of-fame`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({nickname,score,wordsFound,wordsTotal,gameMode,gameTime,lang:lang||"fi",shape})
    });
    if(!res.ok)return null;
    return await res.json();
  }catch{return null;}
}

export { HallOfFame, submitToHallOfFame };
