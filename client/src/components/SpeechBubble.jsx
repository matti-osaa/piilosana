// SpeechBubble – sarjakuvamainen puhekupla joka elävöittää alkuvalikkoa.
//
// Render-tyylin haku: paksu musta reuna, valkoinen tausta, halftone-pisteet
// kuplan oikeassa alanurkassa varjon tilalla, häntä osoittaa alas-vasemmalle
// (kohti komponenttia jonka yläpuolella tämä on).
//
// Props:
//   text     näytettävä viesti (max ~60 merkkiä)
//   color    häntä-osoittavan elementin tausta-color (vapaaehtoinen, default vihreä)
//   onClick  vapaaehtoinen klikkauskäsittelijä (esim. arvotaan uusi viesti)
//
// Käyttö esim:
//   <SpeechBubble text="Pystytkö parhaaseen kastiin?" />

export function SpeechBubble({ text, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        display: "inline-block",
        margin: "8px auto 16px",
        cursor: onClick ? "pointer" : "default",
        animation: "bubblePop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        maxWidth: "min(90%, 380px)",
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 320 100"
        width="100%"
        style={{ display: "block", overflow: "visible" }}
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

        {/* Halftone-varjo (näkyy vain kuplan alaoikealla) */}
        <g clipPath="url(#bubbleClip)">
          <rect x="180" y="40" width="140" height="50" fill="url(#halftone)" />
        </g>

        {/* Itse kupla: paksu musta reuna, valkoinen sisus */}
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

        {/* Teksti */}
        <text
          x="160"
          y="48"
          textAnchor="middle"
          fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
          fontWeight="800"
          fontSize="17"
          fill="#1a1a22"
          style={{ pointerEvents: "none" }}
        >
          {text}
        </text>
      </svg>

      <style>{`
        @keyframes bubblePop {
          0%   { transform: scale(0.6) rotate(-3deg); opacity: 0; }
          70%  { transform: scale(1.05) rotate(1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
