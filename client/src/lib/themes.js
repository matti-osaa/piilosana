// themes.js – siirretty App.jsx:stä (vaihe 1a). Värit ja teemat.

const fontCSS=`@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700&family=Montserrat:wght@700;800&display=swap');`;

// ============================================
// THEMES
// ============================================
const MODERN_BASE={
  font:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  cellRadius:"10px",btnRadius:"10px",
  cellShadow:"inset 0 1px 4px #00000060, 0 2px 8px #00000030",
  btnShadow:"0 4px 16px #00000040",
  cellGradient:true,
  panelRadius:"12px",panelShadow:"0 8px 32px #00000055",
  titleFont:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
  gridGap:"6px",
  letterFont:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
};
const THEMES={
  light:{
    name:"VAALEA",nameEn:"LIGHT",nameSv:"LJUS",
    bg:"#faf8f4",green:"#2d6a4f",yellow:"#7a6408",red:"#c0392b",purple:"#6c5ce7",
    dark:"#f0ece4",border:"#d4cbbf",cell:"#ffffff",cellBorder:"#e0d8ce",
    gridBg:"#f5f0e8",textMuted:"#8b7e6e",textSoft:"#5c4f3d",
    inputBg:"#ffffff",
    cellText:"#6b6050",cellTextSel:"#ffffff",
    btnYellowBg:"#8b7209",btnYellowShadow:"#5c4b06",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 3px #00000012, 0 1px 4px #00000008",
    panelShadow:"0 4px 16px #00000012",
    flavor:"ivory",
  },
  dark:{
    name:"TUMMA",nameEn:"DARK",nameSv:"MÖRK",
    bg:"#12101a",green:"#b39ddb",yellow:"#f0c674",red:"#ef5350",purple:"#ce93d8",
    dark:"#1c1828",border:"#342e48",cell:"#1c1828",cellBorder:"#3e3658",
    gridBg:"#0e0c16",textMuted:"#7e6fa0",textSoft:"#c4b5e0",
    inputBg:"#0e0c16",
    ...MODERN_BASE,
    flavor:"velvet",
  },
  pink:{
    name:"PINK DREAM",nameEn:"PINK DREAM",nameSv:"PINK DREAM",
    bg:"#fff0f5",green:"#d6336c",yellow:"#e64980",red:"#c2255c",purple:"#be4bdb",
    dark:"#ffe0ec",border:"#f0a0c0",cell:"#fff5f8",cellBorder:"#f5b8d0",
    gridBg:"#ffe8f0",textMuted:"#d0709a",textSoft:"#b03060",
    inputBg:"#fff5f8",
    cellText:"#b05078",cellTextSel:"#ffffff",
    btnYellowBg:"#e64980",btnYellowShadow:"#c2255c",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 3px #ff80b020, 0 1px 4px #ff80b010",
    panelShadow:"0 4px 16px #ff80b018",
    flavor:"dream",
  },
  electric:{
    name:"ELECTRIC BLUE",nameEn:"ELECTRIC BLUE",nameSv:"ELECTRIC BLUE",
    bg:"#000814",green:"#00f0ff",yellow:"#7dff3a",red:"#ff2050",purple:"#6090ff",
    dark:"#001228",border:"#0050aa",cell:"#001030",cellBorder:"#0060cc",
    gridBg:"#000610",textMuted:"#2890dd",textSoft:"#50d0ff",
    inputBg:"#000a18",
    ...MODERN_BASE,
    cellShadow:"inset 0 1px 4px #00a0ff30, 0 2px 8px #00a0ff15",
    panelShadow:"0 8px 32px #0080ff20",
    flavor:"electric",
  },
  retro:{
    name:"RETRO",nameEn:"RETRO",nameSv:"RETRO",
    bg:"#0a0a1a",green:"#00ff88",yellow:"#ffcc00",red:"#ff4444",purple:"#ff66ff",
    dark:"#0d0d22",border:"#334",cell:"#1a1a3a",cellBorder:"#2a2a4a",
    font:"'Press Start 2P',monospace",
    gridBg:"#111133",textMuted:"#556",textSoft:"#88ccaa",
    inputBg:"#0d0d22",
    flavor:"retro",
  },
};
function getTheme(id){
  const t=THEMES[id]||THEMES.dark;
  return {
    cellRadius:"0px",btnRadius:"0px",cellShadow:"none",btnShadow:"none",
    cellGradient:false,panelRadius:"0px",panelShadow:"none",
    titleFont:t.font,gridGap:"0px",letterFont:"'VT323',monospace",
    ...t
  };
}

export { fontCSS, MODERN_BASE, THEMES, getTheme };
