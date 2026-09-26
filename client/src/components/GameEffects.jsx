// GameEffects.jsx – siirretty App.jsx:stä (vaihe 1a).
import { useRef, useEffect } from "react";

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
  return(<div style={{position:"fixed",left:x,top:y,transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:200,fontFamily:"inherit",fontSize:"20px",fontWeight:"700",color,textShadow:`0 0 10px ${color}88`,animation:"floatUp 1s ease-out forwards"}}>{text}</div>);
}
function WordPopup({text,color,x,y,font}){
  const len=text.length;
  const isEpic=len>=10;
  const isBig=len>=8;
  const sz=isEpic?"32px":isBig?"26px":"22px";
  const glow=isEpic?`0 0 24px ${color}88, 0 0 48px ${color}44, 0 2px 6px #00000066`:isBig?`0 0 16px ${color}66, 0 2px 4px #00000044`:`0 0 12px ${color}66, 0 2px 4px #00000044`;
  return(<div style={{position:"fixed",left:x,top:y,transform:"translate(-50%,-50%)",pointerEvents:"none",zIndex:199,fontFamily:font||"inherit",fontSize:sz,fontWeight:"700",letterSpacing:isEpic?"4px":"3px",color,textShadow:glow,animation:isEpic?"wordRiseEpic 1.8s ease-out forwards":isBig?"wordRiseBig 1.5s ease-out forwards":"wordRise 1.2s ease-out forwards"}}>
    {isEpic&&<span style={{fontSize:"16px",display:"block",textAlign:"center",marginBottom:"2px",animation:"pulse 0.3s ease"}}>WOW!</span>}
    {text}
  </div>);
}

export { ConfettiCelebration, ScorePopup, WordPopup };
