// SpeechBubble + HoverBubble – sarjakuvamaiset puhekuplat alkuvalikkoa varten.
//
// SpeechBubble: pelkkä kupla, sopii missä tahansa.
// HoverBubble: absolute-positioitu wrapper joka pulissaa esiin tietyin
// väliajoin, näyttää viestin n. 5 s ja katoaa, sitten pop-up uudelleen
// satunnaisella tauolla. Ei ota layout-tilaa, klikkaukset menevät läpi.
//
// Käyttö:
//   <div style={{position:"relative"}}>
//     <DailyHeroCard ... />
//     <HoverBubble messages={["Pystytkö parhaaseen kastiin?", ...]} />
//   </div>

import { useState, useEffect, useRef } from "react";

export function SpeechBubble({ text, onClick, scale = 1 }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-block",
        cursor: onClick ? "pointer" : "default",
        animation: "bubblePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        userSelect: "none",
        transform: `scale(${scale})`,
        transformOrigin: "bottom left",
      }}
    >
      <svg
        viewBox="0 0 320 100"
        width="280"
        height="88"
        style={{ display: "block", overflow: "visible", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.18))" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern
            id="halftone"
            x="0"
            y="0"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="3" cy="3" r="1.1" fill="#1a1a22" />
          </pattern>
          <clipPath id="bubbleClip">
            <path d="M 30 12 Q 8 12 8 38 Q 8 70 40 78 L 70 78 L 56 96 L 92 78 L 285 78 Q 312 78 312 50 Q 312 14 280 12 Z" />
          </clipPath>
        </defs>

        <g clipPath="url(#bubbleClip)">
          <rect x="180" y="40" width="140" height="50" fill="url(#halftone)" />
        </g>

        <path
          d="M 30 12
             Q 8 12 8 38
             Q 8 70 40 78
             L 70 78
             L 56 96
             L 92 78
             L 285 78
             Q 312 78 312 50
             Q 312 14 280 12
             Z"
          fill="#ffffff"
          stroke="#1a1a22"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />

        <text
          x="160"
          y="48"
          textAnchor="middle"
          fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
          fontWeight="800"
          fontSize={text.length > 28 ? "14" : text.length > 20 ? "16" : "17"}
          fill="#1a1a22"
          style={{ pointerEvents: "none" }}
        >
          {text}
        </text>
      </svg>

      <style>{`
        @keyframes bubblePop {
          0%   { transform: scale(0.4) rotate(-8deg); opacity: 0; }
          50%  { transform: scale(1.1) rotate(3deg); opacity: 1; }
          75%  { transform: scale(0.95) rotate(-2deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes bubbleOut {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.6) translateY(-8px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// HoverBubble – pulissaa esiin, pysyy hetken, katoaa. Toistuu satunnaisin
// väliajoin. Vaihtaa viestin satunnaisesti listasta joka kerta.
export function HoverBubble({
  messages,
  position = { top: -38, right: 0 },
  visibleMs = 5000,
  pauseMinMs = 8000,
  pauseMaxMs = 18000,
  initialDelayMs = 1500,
  scale = 0.85,
}) {
  const [visible, setVisible] = useState(false);
  const [out, setOut] = useState(false);
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * (messages?.length || 1)));
  const timersRef = useRef([]);

  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const list = messages;

    function clearAll() {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    }

    function show() {
      setIdx((i) => {
        if (list.length === 1) return 0;
        let n = Math.floor(Math.random() * list.length);
        if (n === i) n = (n + 1) % list.length;
        return n;
      });
      setOut(false);
      setVisible(true);
      timersRef.current.push(setTimeout(() => {
        setOut(true);
        timersRef.current.push(setTimeout(() => {
          setVisible(false);
          const pause = pauseMinMs + Math.random() * (pauseMaxMs - pauseMinMs);
          timersRef.current.push(setTimeout(show, pause));
        }, 300));
      }, visibleMs));
    }

    timersRef.current.push(setTimeout(show, initialDelayMs));
    return clearAll;
  }, [messages, visibleMs, pauseMinMs, pauseMaxMs, initialDelayMs]);

  if (!visible || !messages || messages.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        ...position,
        pointerEvents: "none",
        zIndex: 5,
        animation: out ? "bubbleOut 0.3s ease-in forwards" : undefined,
      }}
    >
      <SpeechBubble text={messages[idx]} scale={scale} />
    </div>
  );
}
