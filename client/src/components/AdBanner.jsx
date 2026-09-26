// AdBanner.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useRef, useState, useEffect } from "react";

// ============================================
// ADSENSE BANNER
// ============================================
function AdBanner(){
  const adRef=useRef(null);
  const pushed=useRef(false);
  const[adLoaded,setAdLoaded]=useState(false);
  useEffect(()=>{
    if(pushed.current)return;
    const tryPush=()=>{
      if(window.adsbygoogle&&adRef.current){
        try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}catch(e){}
        pushed.current=true;
        // Check if ad rendered (ins gets a child)
        const check=()=>{
          if(adRef.current&&adRef.current.querySelector("iframe,ins>div")){setAdLoaded(true);}
          else{setTimeout(check,1000);}
        };
        setTimeout(check,1500);
      }else{
        setTimeout(tryPush,500);
      }
    };
    tryPush();
  },[]);
  return(
    <div style={{width:"100%",maxWidth:"728px",margin:adLoaded?"4px auto 0":"0 auto",padding:0,zIndex:1,position:"relative",overflow:"hidden",
      maxHeight:adLoaded?"300px":"0",transition:"max-height 0.3s ease,margin 0.3s ease"}}>
      <ins ref={adRef} className="adsbygoogle"
        style={{display:"block"}}
        data-ad-client="ca-pub-8582386927565062"
        data-ad-slot="8910330266"
        data-ad-format="auto"
        data-full-width-responsive="true"/>
    </div>
  );
}

export { AdBanner };
