// DailyPopup.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useState, useEffect } from "react";
import { dateLabel } from "../lib/daily.js";
import { computePercentile, tierForPercentile, PERCENTILE_TEXTS } from "../hooks/useDailyPercentile.js";

// ============================================
// HALL OF FAME COMPONENT
// ============================================
function DailyPopup({dateStr,lang,t,S,myResult,onShare,dailyShareMsg,onClose}){
  const[leaderboard,setLeaderboard]=useState(null);
  const dl=dateLabel(dateStr,lang);
  const myNick=(()=>{try{const a=JSON.parse(localStorage.getItem("piilosana_auth")||"null");if(a?.nickname)return a.nickname;}catch{}return localStorage.getItem('piilosana_nick')||localStorage.getItem('piilosana_nickname')||'';})();
  useEffect(()=>{
    fetch(`/api/daily-scores/${dateStr}?lang=${lang}`).then(r=>r.json()).then(data=>{setLeaderboard(data);}).catch(()=>setLeaderboard([]));
  },[dateStr,lang]);
  return(
    <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",animation:"fadeIn 0.2s ease"}} onClick={onClose}>
      <div style={{background:S.dark,border:`2px solid ${S.yellow||"#ffcc00"}`,borderRadius:S.panelRadius,width:"100%",maxWidth:"400px",padding:"20px",boxShadow:`0 0 30px ${S.yellow||"#ffcc00"}22`,maxHeight:"80vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:"center",marginBottom:"12px"}}>
          <div style={{fontFamily:S.font,fontSize:"14px",color:S.yellow||"#ffcc00",fontWeight:"700",marginBottom:"4px",textTransform:"capitalize"}}>{t.daily} – {dl.full}</div>
        </div>
        {myResult&&(
          <div style={{textAlign:"center",marginBottom:"16px",padding:"12px",background:`${S.yellow||"#ffcc00"}11`,borderRadius:"10px",border:`1px solid ${S.yellow||"#ffcc00"}33`}}>
            <div style={{fontSize:"28px",fontWeight:"800",color:S.yellow}}>{myResult.score}<span style={{fontSize:"14px",fontWeight:"400",color:S.textMuted}}>p</span></div>
            {(()=>{const _pct=computePercentile(myResult.score,leaderboard);const _tier=tierForPercentile(_pct);if(!_tier)return null;const _txt=(PERCENTILE_TEXTS[lang]||PERCENTILE_TEXTS.fi);return(<div style={{fontSize:"13px",color:_tier.color,fontWeight:"700",letterSpacing:"0.5px",marginTop:"4px",animation:_tier.sparkle?"pulse 2s ease-in-out infinite":"none"}}>{_tier.sparkle?"✨ ":""}{_txt[_tier.textKey]}{_tier.sparkle?" ✨":""}</div>);})()}
            <div style={{fontSize:"13px",color:S.green,marginTop:"2px"}}>{myResult.wordsFound}/{myResult.totalWords} {t.dailyWords} ({myResult.totalWords>0?Math.round(myResult.wordsFound/myResult.totalWords*100):0}%)</div>
          </div>
        )}
        {/* Leaderboard */}
        <div style={{marginBottom:"12px"}}>
          <div style={{fontFamily:S.font,fontSize:"13px",fontWeight:"700",color:S.yellow||"#ffcc00",marginBottom:"8px",textAlign:"center"}}>{lang==="en"?"Leaderboard":lang==="sv"?"Topplista":"Tuloslista"}</div>
          {leaderboard===null?(
            <div style={{textAlign:"center",color:S.textMuted,fontSize:"13px",padding:"12px"}}>...</div>
          ):leaderboard.length===0?(
            <div style={{textAlign:"center",color:S.textMuted,fontSize:"13px",padding:"12px"}}>{lang==="en"?"No scores yet":lang==="sv"?"Inga poäng än":"Ei tuloksia vielä"}</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:"2px"}}>
              {leaderboard.map((s,i)=>{
                const isMe=myNick&&s.nickname.toLowerCase()===myNick.toLowerCase();
                const medals=["🥇","🥈","🥉"];
                return(
                  <div key={i} style={{display:"flex",alignItems:"center",padding:"6px 10px",borderRadius:"8px",
                    background:isMe?`${S.yellow||"#ffcc00"}22`:"transparent",
                    border:isMe?`1px solid ${S.yellow||"#ffcc00"}44`:"1px solid transparent"}}>
                    <span style={{width:"28px",fontSize:"14px",fontWeight:"700",color:i<3?(S.yellow||"#ffcc00"):S.textMuted}}>{i<3?medals[i]:`${i+1}.`}</span>
                    <span style={{flex:1,fontSize:"14px",fontWeight:isMe?"700":"500",color:isMe?(S.yellow||"#ffcc00"):(S.textSoft||"#444")}}>{s.nickname}</span>
                    <span style={{fontSize:"14px",fontWeight:"700",color:S.green||"#44ddaa",fontVariantNumeric:"tabular-nums"}}>{s.score}p</span>
                    <span style={{fontSize:"14px",color:S.textMuted,marginLeft:"8px",minWidth:"40px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{s.words_found}/{s.words_total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:"8px",justifyContent:"center"}}>
          {onShare&&<button onClick={e=>{e.stopPropagation();onShare();}} style={{fontFamily:S.font,fontSize:"13px",color:"#2a2000",background:`linear-gradient(135deg,${S.yellow||"#ffcc00"},#E6B800)`,border:"none",padding:"8px 20px",cursor:"pointer",borderRadius:"10px",fontWeight:"600"}}>
            {dailyShareMsg||t.dailyShare}
          </button>}
          <button onClick={onClose} style={{fontFamily:S.font,fontSize:"13px",color:S.textMuted,background:"transparent",border:`1px solid ${S.border}`,padding:"8px 20px",cursor:"pointer",borderRadius:"10px"}}>{t.back}</button>
        </div>
      </div>
    </div>
  );
}

export { DailyPopup };
