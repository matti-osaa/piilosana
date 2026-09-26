// wordEngine.js – siirretty App.jsx:stä (vaihe 1a). Sanalistojen lataus, trie, ruudukon luonti, sanojen haku ja pisteytys.

// Word lists are loaded lazily for fast initial page load
// import() splits them into separate chunks loaded in background

class TrieNode{constructor(){this.c={};this.w=false;}}
function buildTrie(words){const root=new TrieNode();for(const word of words){let n=root;for(const ch of word){if(!n.c[ch])n.c[ch]=new TrieNode();n=n.c[ch];}n.w=true;}return root;}

const EMPTY_SET=new Set();
const EMPTY_TRIE=new TrieNode();

// Per-language configuration
const LANG_CONFIG={
  fi:{
    words:EMPTY_SET, trie:EMPTY_TRIE, loaded:false,
    lw:{a:120,i:108,t:87,n:88,e:80,s:79,l:58,o:53,k:51,u:51,"ä":37,m:33,v:25,r:29,j:20,h:19,y:19,p:18,d:10,"ö":4},
    letterValues:{a:1,i:1,n:1,s:1,t:1,e:1,l:2,o:2,k:2,u:4,"ä":2,m:3,v:4,r:2,j:4,h:4,y:4,p:4,d:7,"ö":7},
    flag:"🇫🇮", name:"Suomi", code:"fi",
  },
  en:{
    words:EMPTY_SET, trie:EMPTY_TRIE, loaded:false,
    lw:{e:127,t:91,a:82,o:75,i:70,n:67,s:63,h:61,r:60,d:43,l:40,c:28,u:28,m:24,w:24,f:22,g:20,y:20,p:19,b:15,v:10,k:8,j:2,x:2,q:1,z:1},
    letterValues:{e:1,a:1,i:1,o:1,n:1,r:1,t:1,l:1,s:1,u:1,d:2,g:2,b:3,c:3,m:3,p:3,f:4,h:4,v:4,w:4,y:4,k:5,j:8,x:8,q:10,z:10},
    flag:"🇬🇧", name:"English", code:"en",
  },
  sv:{
    words:EMPTY_SET, trie:EMPTY_TRIE, loaded:false,
    lw:{a:93,e:100,n:82,r:84,s:63,t:76,i:58,l:52,d:45,k:32,o:41,g:33,m:35,v:24,h:21,f:20,u:18,p:17,b:15,"ä":15,"ö":13,c:13,y:7,"å":13,j:7,x:2,z:1,w:1,q:1},
    letterValues:{a:1,e:1,n:1,r:1,s:1,t:1,d:1,i:1,l:1,o:2,g:2,k:2,m:2,h:3,b:3,f:3,u:3,v:3,p:4,c:4,y:4,"ä":4,"å":4,"ö":4,j:7,x:8,z:10,w:10,q:10},
    flag:"🇸🇪", name:"Svenska", code:"sv",
  },
};

// Lazy loaders — each returns a promise, cached after first call
const _wordLoaders={
  fi:()=>import("../words.js").then(m=>{const w=new Set(m.default.split("|"));LANG_CONFIG.fi.words=w;LANG_CONFIG.fi.trie=buildTrie(w);LANG_CONFIG.fi.loaded=true;return w.size;}),
  en:()=>import("../words_en.js").then(m=>{const w=new Set(m.default.split("|"));LANG_CONFIG.en.words=w;LANG_CONFIG.en.trie=buildTrie(w);LANG_CONFIG.en.loaded=true;return w.size;}),
  sv:()=>import("../words_sv.js").then(m=>{const w=new Set(m.default.split("|"));LANG_CONFIG.sv.words=w;LANG_CONFIG.sv.trie=buildTrie(w);LANG_CONFIG.sv.loaded=true;return w.size;}),
};
const _wordPromises={};
function loadWords(langCode){
  if(!_wordPromises[langCode])_wordPromises[langCode]=_wordLoaders[langCode]();
  return _wordPromises[langCode];
}
// Start loading ALL languages immediately in background (fi first as it's largest)
loadWords("fi");loadWords("en");loadWords("sv");

function getLangConf(lang){return LANG_CONFIG[lang]||LANG_CONFIG.fi;}

function randLetterLang(lang,rng){
  const lw=getLangConf(lang).lw;
  const ls=Object.keys(lw),ws=Object.values(lw),tot=ws.reduce((a,b)=>a+b,0);
  let r=(rng?rng():Math.random())*tot;for(let i=0;i<ls.length;i++){r-=ws[i];if(r<=0)return ls[i];}return ls[ls.length-1];
}
function makeGrid(rows,lang='fi',cols,rng){const c=cols||rows;return Array.from({length:rows},()=>Array.from({length:c},()=>randLetterLang(lang,rng)));}

function findWords(grid,trie){
  const sz=grid.length,found=new Set(),dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*sz+c);for(const[dr,dc]of dirs){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<sz&&nc>=0&&nc<sz&&!vis.has(nr*sz+nc))dfs(nr,nc,nx,np,vis);}vis.delete(r*sz+c);}
  for(let r=0;r<sz;r++)for(let c=0;c<sz;c++)dfs(r,c,trie,"",new Set());return found;
}

// Hex grid utilities (6-neighbor hexagonal grid, odd-r offset)
const HEX_DIRS_EVEN=[[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]];
const HEX_DIRS_ODD=[[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
function hexNeighbors(r,c,rows,cols){const dirs=r%2===0?HEX_DIRS_EVEN:HEX_DIRS_ODD;return dirs.map(([dr,dc])=>({r:r+dr,c:c+dc})).filter(n=>n.r>=0&&n.r<rows&&n.c>=0&&n.c<cols);}
function findWordsHex(grid,trie){
  const rows=grid.length,cols=grid[0].length,found=new Set();
  function dfs(r,c,node,path,vis){const ch=grid[r][c],nx=node.c[ch];if(!nx)return;const np=path+ch;if(nx.w&&np.length>=3)found.add(np);vis.add(r*cols+c);for(const n of hexNeighbors(r,c,rows,cols)){if(!vis.has(n.r*cols+n.c))dfs(n.r,n.c,nx,np,vis);}vis.delete(r*cols+c);}
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)dfs(r,c,trie,"",new Set());return found;
}
function adjHex(a,b){const dirs=a.r%2===0?HEX_DIRS_EVEN:HEX_DIRS_ODD;return dirs.some(([dr,dc])=>a.r+dr===b.r&&a.c+dc===b.c);}

function pts(len){if(len<=2)return 0;if(len===3)return 1;if(len===4)return 2;if(len===5)return 4;if(len===6)return 6;if(len===7)return 10;return 14;}

// Letter values and colors are now per-language, resolved in component via lang state
const LETTER_VALUE_COLORS={1:"#88bbcc",2:"#44ccdd",3:"#ffbb44",4:"#ff8833",5:"#ff6655",7:"#ff4466",8:"#ff4466",10:"#ff2244"};
function getLetterValues(lang){return getLangConf(lang).letterValues;}
function ptsLetters(word,lang='fi'){const lv=getLetterValues(lang);let s=0;for(const ch of word)s+=(lv[ch]||1);return s;}
function letterColor(ch,lang='fi'){const lv=getLetterValues(lang);return LETTER_VALUE_COLORS[lv[ch]||1]||"#88bbcc";}

export { TrieNode, buildTrie, EMPTY_SET, EMPTY_TRIE, LANG_CONFIG, _wordLoaders, _wordPromises, loadWords, getLangConf, randLetterLang, makeGrid, findWords, HEX_DIRS_EVEN, HEX_DIRS_ODD, hexNeighbors, findWordsHex, adjHex, pts, LETTER_VALUE_COLORS, getLetterValues, ptsLetters, letterColor };
