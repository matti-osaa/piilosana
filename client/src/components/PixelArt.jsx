// PixelArt.jsx – siirretty App.jsx:stä (vaihe 1a).

// Pixel art flags (9x6 grids)
const FLAG_PIXELS={
  fi:[
    "WWWBWWWWW",
    "WWWBWWWWW",
    "BBBBBBBBB",
    "BBBBBBBBB",
    "WWWBWWWWW",
    "WWWBWWWWW",
  ],
  en:[
    "BBBBRRRRRR",
    "BBBBWWWWWW",
    "BBBBRRRRRR",
    "WWWWWWWWWW",
    "RRRRRRRRRR",
    "WWWWWWWWWW",
  ],
  sv:[
    "BBBYBBBBB",
    "BBBYBBBBB",
    "YYYYYYYYY",
    "YYYYYYYYY",
    "BBBYBBBBB",
    "BBBYBBBBB",
  ],
};
const FLAG_COLS={fi:9,en:10,sv:9};
const FLAG_COLORS={W:"#ffffff",B:"#003580",R:"#cc2244",Y:"#ffcc00"};
function PixelFlag({lang,size=2}){
  const rows=FLAG_PIXELS[lang]||FLAG_PIXELS.fi;
  const cols=FLAG_COLS[lang]||9;
  const numRows=rows.length;
  return(
    <div style={{display:"inline-grid",gridTemplateColumns:`repeat(${cols},${size}px)`,gridTemplateRows:`repeat(${numRows},${size}px)`,gap:0,imageRendering:"pixelated",border:"1px solid #556",flexShrink:0}}>
      {rows.map((row,r)=>Array.from(row).map((ch,c)=>(
        <div key={r*cols+c} style={{width:size,height:size,background:FLAG_COLORS[ch]||"#000"}}/>
      )))}
    </div>
  );
}

// Pixel art icons (each row is a string, . = transparent, letter = color key)
const ICON_PIXELS={
  gear:{ // 19x19 multi-shaded pixel art gear (8 teeth, center hole)
    cols:19,
    rows:[
      "...................",
      ".........W.........",
      "........WWW........",
      "....WW..WhB..BB....",
      "...WWBW.WhB.BBBB...",
      "...WBhBWWhBBBlBB...",
      "....WBhhBBBllBB....",
      ".....WhBB.BBlB.....",
      "..WWWWBB...BBBBBB..",
      ".WWhhhB.....BdddBB.",
      "..WBBBBB...BBBBBB..",
      ".....BlBB.BBdB.....",
      "....BBllBBBddBB....",
      "...BBlBBBdBBBdBB...",
      "...BBBB.BdB.BBBB...",
      "....BB..BdB..BB....",
      "........BBB........",
      ".........B.........",
      "...................",
    ],
    colors:{B:"outline",W:"highlight",h:"light",l:"mid",d:"dark"},
  },
  swords:{ // 13x13 crossed swords with guards and handles
    cols:13,
    rows:[
      "S...........S",
      ".S.........S.",
      "..S.......S..",
      "...S.....S...",
      "....S...S....",
      ".....S.S.....",
      "......S......",
      ".....S.S.....",
      "....S...S....",
      "...GS...SG...",
      "..GGG...GGG..",
      "...H.....H...",
      "...H.....H...",
    ],
    colors:{S:"currentColor",G:"#ccaa44",H:"#aa7733"},
  },
  arrow:{ // 9x11 down arrow
    cols:9,
    rows:[
      "...A.A...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      "...AAA...",
      ".A.AAA.A.",
      ".AAAAAAA.",
      "..AAAAA..",
      "...AAA...",
      "....A....",
    ],
    colors:{A:"currentColor"},
  },
  infinity:{ // 11x7 infinity
    cols:11,
    rows:[
      "..II...II..",
      ".I..I.I..I.",
      "I....I....I",
      "I....I....I",
      "I....I....I",
      ".I..I.I..I.",
      "..II...II..",
    ],
    colors:{I:"currentColor"},
  },
  refresh:{ // 11x11 circular arrows with arrowheads
    cols:11,
    rows:[
      "...RRRRR...",
      "..R.....R..",
      ".R.......R.",
      "R.....RRRRR",
      "R......RRR.",
      "R.......R..",
      "..R.......R",
      ".RRR......R",
      "RRRRR.....R",
      ".R.......R.",
      "..R.....R..",
      "...RRRRR...",
    ],
    colors:{R:"currentColor"},
  },
  share:{ // 9x9 share nodes with lines
    cols:9,
    rows:[
      "......SS.",
      "......SS.",
      "....SS...",
      "..SS.....",
      "..SS.....",
      "....SS...",
      "......SS.",
      "......SS.",
      ".........",
    ],
    colors:{S:"currentColor"},
  },
  musicOn:{ // 9x9 music note
    cols:9,
    rows:[
      "...MMMMMM",
      "...M....M",
      "...M....M",
      "...M....M",
      "...M..MMM",
      "..MM..M..",
      ".MMM..M..",
      "..M..MM..",
      "......M..",
    ],
    colors:{M:"currentColor"},
  },
  musicOff:{ // 9x9 music note with slash
    cols:9,
    rows:[
      "X..MMMMMM",
      ".X.m....m",
      "..Xm....m",
      "...X....m",
      "...mX.mmm",
      "..mm.Xm..",
      ".mmm..X..",
      "..m...mX.",
      "......m.X",
    ],
    colors:{M:"currentColor",m:"mid",X:"currentColor"},
  },
  stop:{ // 7x7 stop square
    cols:7,
    rows:[
      "SSSSSSS",
      "SSSSSSS",
      "SS...SS",
      "SS...SS",
      "SS...SS",
      "SSSSSSS",
      "SSSSSSS",
    ],
    colors:{S:"currentColor"},
  },
  person:{ // 9x9 compact person/user icon
    cols:9,
    rows:[
      "...PPP...",
      "..PPPPP..",
      "..PPPPP..",
      "...PPP...",
      ".PPPPPPP.",
      "PPPPPPPPP",
      "PP.PPP.PP",
      "...PPP...",
      "..PP.PP..",
    ],
    colors:{P:"currentColor"},
  },
};

// ============================================
// ACHIEVEMENT BADGE PIXEL ART (11x11 each)
// ============================================
const BADGE_PIXELS={
  star:{
    cols:9,rows:[
      "....*....",
      "...***...",
      "...***...",
      "*********",
      ".******.*",
      "..*****!.",
      "...*.*...",
      "..**.**!.",
      ".**...**.",
    ],colors:{"*":"currentColor","!":"currentColor"},
  },
  flame:{ // fire/streak
    cols:11,rows:[
      ".....*.....",
      "....**.....",
      "...**F*....",
      "..**FFF*...",
      "..*FFFFF*..",
      "..*FFFFF*..",
      ".*FFFFFFF*.",
      ".*FFFFFFF*.",
      ".*FFFFFFF*.",
      "..*FFFFF*..",
      "...***.*...",
    ],colors:{"*":"#ff4400",F:"currentColor"},
  },
  diamond:{
    cols:9,rows:[
      "....*....",
      "...*D*...",
      "..*DDD*..",
      ".*DDDDD*.",
      "*DDDDDDD*",
      ".*DDDDD*.",
      "..*DDD*..",
      "...*D*...",
      "....*....",
    ],colors:{"*":"outline",D:"currentColor"},
  },
  crown:{ // king crown
    cols:11,rows:[
      ".*...*...*.",
      ".*...*...*.",
      ".**.***..**",
      ".***.***..*",
      ".**GGGGG**.",
      ".*GGGGGGG*.",
      ".*GGGGGGG*.",
      ".*GGGGGGG*.",
      ".**GGGGG**.",
      "...........",
      "...........",
    ],colors:{"*":"currentColor",G:"#ffcc00"},
  },
  scroll:{ // word scroll
    cols:11,rows:[
      "..********.",
      ".*SSSSSS**.",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".*SSSSSS*.*",
      ".**SSSSSS*.",
      "..********.",
      "...........",
    ],colors:{"*":"outline",S:"currentColor"},
  },
  trophy:{ // trophy cup
    cols:11,rows:[
      "...........",
      ".**GGGGG**.",
      "*.*GGGGG*.*",
      "*.*GGGGG*.*",
      "**.*GGG*..*",
      "...*GGG*...",
      "....*G*....",
      "....*G*....",
      "...*GGG*...",
      "..*GGGGG*..",
      "...........",
    ],colors:{"*":"outline",G:"currentColor"},
  },
  bolt:{ // lightning bolt speed
    cols:11,rows:[
      ".....****..",
      "....**.....",
      "...**......",
      "..**.......",
      ".********.*",
      "...........",
      ".*********.",
      ".......**.*",
      "......**...",
      ".....**....",
      "...**......",
    ],colors:{"*":"currentColor"},
  },
  sword:{ // arena sword
    cols:11,rows:[
      ".........*.",
      "........*..",
      ".......*...",
      "......*....",
      ".....*.....",
      "....*......",
      "..G*.......",
      ".GG........",
      "..G*.......",
      "...H.......",
      "...H.......",
    ],colors:{"*":"currentColor",G:"#ccaa44",H:"#aa7733"},
  },
};

const SHADE_MAP={outline:0.4,dark:0.55,mid:0.7,light:0.85,highlight:1.0};
function ModernIcon({icon,color="currentColor",size=2,style={}}){
  const s=size*8;
  const icons={
    gear:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    trophy:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,
    person:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    arrow:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7-7 7 7"/></svg>,
    infinity:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z"/></svg>,
    refresh:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
    share:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
    musicOn:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>,
    musicOff:<svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" opacity="0.3"/><circle cx="6" cy="18" r="3" opacity="0.3"/><circle cx="18" cy="16" r="3" opacity="0.3"/><line x1="2" y1="2" x2="22" y2="22" strokeWidth="2.5"/></svg>,
  };
  return <span style={{display:"inline-flex",alignItems:"center",verticalAlign:"middle",flexShrink:0,...style}}>{icons[icon]||null}</span>;
}
function PixelIcon({icon,color="currentColor",size=2,style={},badge=false}){
  const data=badge?BADGE_PIXELS[icon]:ICON_PIXELS[icon];
  if(!data)return null;
  const {cols,rows,colors}=data;
  const resolveColor=(ch)=>{
    if(ch===".")return"transparent";
    const v=colors[ch];
    if(v==="currentColor")return color;
    if(SHADE_MAP[v]!==undefined)return color;// shade handled via opacity
    return v;
  };
  const resolveOpacity=(ch)=>{
    if(ch===".")return 1;
    const v=colors[ch];
    return SHADE_MAP[v]!==undefined?SHADE_MAP[v]:1;
  };
  return(
    <div style={{display:"inline-grid",gridTemplateColumns:`repeat(${cols},${size}px)`,gridTemplateRows:`repeat(${rows.length},${size}px)`,
      gap:0,imageRendering:"pixelated",flexShrink:0,verticalAlign:"middle",transition:"filter 2s ease",...style}}>
      {rows.map((row,r)=>Array.from(row).map((ch,c)=>(
        <div key={r*cols+c} style={{width:size,height:size,
          background:resolveColor(ch),opacity:resolveOpacity(ch),transition:"background 2s ease"}}/>
      )))}
    </div>
  );
}

export { FLAG_PIXELS, FLAG_COLS, FLAG_COLORS, PixelFlag, ICON_PIXELS, BADGE_PIXELS, SHADE_MAP, ModernIcon, PixelIcon };
