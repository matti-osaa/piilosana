// ShapeBoard – piirtää minkä tahansa boards.js:n laudan (neliö, kolmio,
// viisikulmio, tähti, vinoneliö). Kuusikulmio käyttää yhä App.jsx:n omaa
// piirtoa. Solut sijoitetaan absoluuttisesti laudan yksiköistä prosenteiksi
// ja leikataan clip-pathilla oikean muotoisiksi.
//
// Props:
//   board          getBoard(shape)
//   grid           kirjaimet grid[r][c]
//   gRef           ref laudan containeriin (App käyttää osumatestiin + popuppeihin)
//   S, isLight     teema
//   sel            valitut solut [{r,c}]
//   state          "play" | "ending" | "scramble"
//   eatenCells     Set lineaarisia indeksejä, ending = lopetusanimaation määrittely
//   scrambleGrid, scrambleStep, settledCells   sekoitusanimaatio
//   letterMult, letterColor(letter), letterValue(letter)
//   dropKey
//   onPointerDownAt(x,y), onTouchMoveAt(x,y)
import { useMemo } from "react";

// Siirtää monikulmion sivuja sisäänpäin matkan d (toimii myös koverille kulmille).
function insetPoly(poly, d) {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n]; area += x0 * y1 - x1 * y0; }
  const sign = area > 0 ? 1 : -1;
  const lines = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * sign, ny = (dx / len) * sign; // sisänormaali
    lines.push({ px: x0 + nx * d, py: y0 + ny * d, dx, dy });
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const det = a.dx * b.dy - a.dy * b.dx;
    if (Math.abs(det) < 1e-9) { out.push([b.px, b.py]); continue; }
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det;
    out.push([a.px + a.dx * t, a.py + a.dy * t]);
  }
  return out;
}

function inradius(cell) {
  let m = Infinity;
  const p = cell.poly;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length];
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1;
    let t = ((cell.cx - x0) * dx + (cell.cy - y0) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    m = Math.min(m, Math.hypot(cell.cx - (x0 + t * dx), cell.cy - (y0 + t * dy)));
  }
  return m;
}

export function ShapeBoard({
  board, grid, gRef, S, isLight, sel, state, eatenCells, ending,
  scrambleGrid, scrambleStep, settledCells,
  letterMult, letterColor, letterValue, dropKey,
  onPointerDownAt, onTouchMoveAt,
}) {
  // Geometria lasketaan kerran per lauta
  const geo = useMemo(() => {
    const gap = board.W * 0.006, rim = board.W * 0.013;
    return board.cells.map((cell) => {
      const w = cell.x1 - cell.x0, h = cell.y1 - cell.y0;
      const toClip = (poly) => `polygon(${poly.map(([x, y]) => `${(((x - cell.x0) / w) * 100).toFixed(2)}% ${(((y - cell.y0) / h) * 100).toFixed(2)}%`).join(",")})`;
      return {
        left: (cell.x0 / board.W) * 100, top: (cell.y0 / board.H) * 100,
        width: (w / board.W) * 100, height: (h / board.H) * 100,
        rimClip: toClip(insetPoly(cell.poly, gap)),
        faceClip: toClip(insetPoly(cell.poly, gap + rim)),
        lx: ((cell.cx - cell.x0) / w) * 100, ly: ((cell.cy - cell.y0) / h) * 100,
        font: (inradius(cell) / board.W) * 100 * 0.82,
      };
    });
  }, [board]);

  const total = board.cells.length;
  const isScrambling = state === "scramble" || (state === "ending" && scrambleGrid);

  return (
    <div
      ref={gRef}
      onMouseDown={(e) => { e.preventDefault(); onPointerDownAt(e.clientX, e.clientY); }}
      onTouchStart={(e) => { onPointerDownAt(e.touches[0].clientX, e.touches[0].clientY); }}
      onTouchMove={(e) => { e.preventDefault(); onTouchMoveAt(e.touches[0].clientX, e.touches[0].clientY); }}
      style={{
        position: "relative", width: "100%", aspectRatio: `${board.W} / ${board.H}`,
        touchAction: "none", userSelect: "none", WebkitUserSelect: "none", margin: "2px 0",
      }}
    >
      {board.cells.map((cell) => {
        const g = geo[cell.i];
        const letter = grid[cell.r]?.[cell.c] ?? "";
        const selIdx = sel.findIndex((p) => p.r === cell.r && p.c === cell.c);
        const s = selIdx >= 0;
        const last = s && selIdx === sel.length - 1;
        const eaten = eatenCells.has(cell.i);
        const endAnim = eaten && ending ? ending.cellAnim(cell.i, total) : "none";
        const endColor = eaten && ending ? ending.cellColor(cell.i) : null;
        const settled = state === "scramble" && (scrambleStep > cell.i || settledCells.has(cell.i));
        const showScramble = isScrambling && !settled && scrambleGrid;
        const displayLetter = showScramble ? (scrambleGrid[cell.r]?.[cell.c] || letter) : letter;
        const scrambleColor = showScramble ? `hsl(${(cell.i * 37 + scrambleStep * 73) % 360},70%,65%)` : null;
        const rimBg = eaten ? "transparent"
          : s ? `linear-gradient(${120 + selIdx * 60}deg, #00ffaa, #44bbff, #aa66ff, #ff66aa, #ffaa44, #00ffaa)`
          : isLight ? "linear-gradient(180deg, #ece8e2 0%, #d4cec6 100%)"
          : `linear-gradient(175deg, ${S.cellBorder || S.border} 0%, #111111 100%)`;
        const faceBg = eaten ? (S.gridBg || "#111133")
          : isLight ? (s ? `linear-gradient(160deg, ${S.cell} 0%, ${S.dark} 100%)` : "radial-gradient(ellipse 80% 75% at 48% 45%, #ffffff 0%, #faf8f5 45%, #e8e4de 85%, #ddd8d0 100%)")
          : s ? `linear-gradient(${160 + selIdx * 30}deg, ${S.cell}ee 0%, ${S.dark || S.cell}dd 100%)`
          : `radial-gradient(ellipse at 40% 35%, ${S.cell} 0%, ${S.cell}dd 40%, ${S.dark || S.cell}bb 100%)`;
        const textColor = eaten ? (endColor || "transparent")
          : scrambleColor || (s ? (isLight ? S.green : "#ffffff")
          : letterMult ? letterColor(letter) : (S.cellText || (S.cellGradient ? "#e6eef8" : "#22ccaa")));
        return (
          <div
            key={`${cell.i}-${dropKey}`}
            data-c={`${cell.r},${cell.c}`}
            style={{
              position: "absolute", left: `${g.left}%`, top: `${g.top}%`, width: `${g.width}%`, height: `${g.height}%`,
              zIndex: s ? 10 : 0, pointerEvents: "none",
              transition: "transform 0.12s ease-out",
              transform: s ? (last ? "scale(0.94)" : "scale(0.96)") : "none",
              animation: eaten ? endAnim : (isScrambling && settled ? "pop 0.2s ease" : "none"),
              filter: eaten ? "none" : s ? `drop-shadow(0 0 6px ${S.green}aa)` : `drop-shadow(0 2px 2px ${isLight ? "#00000022" : "#00000066"})`,
              "--ex": `${(cell.cx - board.W / 2) * 30}px`, "--ey": `${(cell.cy - board.H / 2) * 30}px`,
            }}
          >
            <div style={{
              position: "absolute", inset: 0, clipPath: g.rimClip, background: rimBg,
              backgroundSize: s ? "300% 100%" : "100% 100%",
              animation: s ? "hexPrismatic 6s linear infinite" : "none",
            }} />
            <div style={{ position: "absolute", inset: 0, clipPath: g.faceClip, background: faceBg, transition: "background 0.2s ease" }} />
            {!eaten && <div style={{
              position: "absolute", inset: 0, clipPath: g.faceClip, pointerEvents: "none",
              background: isLight
                ? "radial-gradient(ellipse 50% 40% at 38% 30%, #ffffffcc 0%, transparent 65%)"
                : "radial-gradient(ellipse at 35% 28%, #ffffff22 0%, transparent 50%)",
            }} />}
            {!eaten && (
              <span style={{
                position: "absolute", left: `${g.lx}%`, top: `${g.ly}%`, transform: "translate(-50%,-50%)",
                fontSize: `clamp(11px, ${g.font.toFixed(2)}cqw, 40px)`, lineHeight: 1,
                fontFamily: S.letterFont, fontWeight: "500", textTransform: "uppercase",
                color: textColor,
                textShadow: s ? `0 0 8px ${S.green}99, 0 1px 2px #000000cc` : (isLight ? "0 1px 0 #ffffff88" : "0 1px 2px #000000aa"),
              }}>
                {displayLetter}
                {letterMult && !isScrambling && (
                  <span style={{ position: "absolute", left: "100%", top: "60%", fontSize: "0.35em", fontFamily: "'Press Start 2P',monospace", opacity: 0.8 }}>
                    {letterValue(letter)}
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Pieni muotokuvake valitsimeen (SVG). shape: SHAPES tai "random".
export function ShapeIcon({ shape, color, size = 22 }) {
  const P = {
    square: "4,4 20,4 20,20 4,20",
    hex: "12,2 21,7 21,17 12,22 3,17 3,7",
    triangle: "12,3 22,21 2,21",
    pentagon: "12,2 22,9.5 18,21 6,21 2,9.5",
    star: "12,1 14.8,9.2 23,12 14.8,14.8 12,23 9.2,14.8 1,12 9.2,9.2",
    diamond: "12,1 22,12 12,23 2,12",
  };
  if (shape === "random") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke={color} strokeWidth="2" />
        <circle cx="8.5" cy="8.5" r="1.6" fill={color} /><circle cx="15.5" cy="15.5" r="1.6" fill={color} />
        <circle cx="12" cy="12" r="1.6" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <polygon points={P[shape] || P.hex} fill={`${color}33`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export const SHAPE_NAMES = {
  fi: { random: "Satunnainen", hex: "Kuusikulmio", square: "Neliö", triangle: "Kolmio", pentagon: "Viisikulmio", star: "Tähti", diamond: "Vinoneliö" },
  en: { random: "Random", hex: "Hexagon", square: "Square", triangle: "Triangle", pentagon: "Pentagon", star: "Star", diamond: "Diamond" },
  sv: { random: "Slumpad", hex: "Hexagon", square: "Kvadrat", triangle: "Triangel", pentagon: "Pentagon", star: "Stjärna", diamond: "Romb" },
};
