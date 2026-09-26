// gridMechanics.js – siirretty App.jsx:stä (vaihe 1a). Pelitilojen ruudukkomekaniikat: painovoima, rotaatio, shakki, pommi/mysteeri.
import { randLetterLang } from "./wordEngine.js";

// Client-side gravity: remove cells, drop letters down, fill new from top
function applyGravityClient(grid,removedCells,lang='fi'){
  const sz=grid.length;
  const ng=grid.map(row=>[...row]);
  for(const{r,c}of removedCells)ng[r][c]=null;
  for(let c=0;c<sz;c++){
    const letters=[];
    for(let r=sz-1;r>=0;r--){if(ng[r][c]!==null)letters.push(ng[r][c]);}
    for(let r=sz-1;r>=0;r--){
      const idx=sz-1-r;
      ng[r][c]=idx<letters.length?letters[idx]:randLetterLang(lang);
    }
  }
  return ng;
}

// Rotate grid: shift a row left/right or column up/down (wrap-around)
function rotateRow(grid,row,dir){// dir: 1=right, -1=left
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let c=0;c<sz;c++){ng[row][(c+dir+sz)%sz]=grid[row][c];}
  return ng;
}
function rotateCol(grid,col,dir){// dir: 1=down, -1=up
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let r=0;r<sz;r++){ng[(r+dir+sz)%sz][col]=grid[r][col];}
  return ng;
}

// Chess piece movement rules
const CHESS_PIECES=["pawn","rook","bishop","knight","queen"];
const CHESS_EMOJI={pawn:"♟",rook:"♜",bishop:"♝",knight:"♞",queen:"♛"};
const CHESS_NAMES={
  fi:{pawn:"sotilas",rook:"torni",bishop:"lähetti",knight:"ratsu",queen:"kuningatar"},
  en:{pawn:"pawn",rook:"rook",bishop:"bishop",knight:"knight",queen:"queen"},
  sv:{pawn:"bonde",rook:"torn",bishop:"löpare",knight:"springare",queen:"dam"},
};
const CHESS_MULT={pawn:1.5,rook:1,bishop:1.5,knight:2,queen:1};
function chessValidMoves(piece,r,c,sz){
  const moves=[];
  if(piece==="knight"){
    for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]){
      const nr=r+dr,nc=c+dc;
      if(nr>=0&&nr<sz&&nc>=0&&nc<sz)moves.push({r:nr,c:nc});
    }
  }else if(piece==="rook"){
    for(let i=0;i<sz;i++){if(i!==r)moves.push({r:i,c});if(i!==c)moves.push({r,c:i});}
  }else if(piece==="bishop"){
    for(let d=1;d<sz;d++){
      if(r-d>=0&&c-d>=0)moves.push({r:r-d,c:c-d});
      if(r-d>=0&&c+d<sz)moves.push({r:r-d,c:c+d});
      if(r+d<sz&&c-d>=0)moves.push({r:r+d,c:c-d});
      if(r+d<sz&&c+d<sz)moves.push({r:r+d,c:c+d});
    }
  }else if(piece==="queen"){
    for(let i=0;i<sz;i++){if(i!==r)moves.push({r:i,c});if(i!==c)moves.push({r,c:i});}
    for(let d=1;d<sz;d++){
      if(r-d>=0&&c-d>=0)moves.push({r:r-d,c:c-d});
      if(r-d>=0&&c+d<sz)moves.push({r:r-d,c:c+d});
      if(r+d<sz&&c-d>=0)moves.push({r:r+d,c:c-d});
      if(r+d<sz&&c+d<sz)moves.push({r:r+d,c:c+d});
    }
  }else if(piece==="pawn"){
    // Pawn: forward (up) + diagonal captures (up-left, up-right)
    if(r-1>=0)moves.push({r:r-1,c});
    if(r-1>=0&&c-1>=0)moves.push({r:r-1,c:c-1});
    if(r-1>=0&&c+1<sz)moves.push({r:r-1,c:c+1});
  }
  return moves;
}
function randomChessPiece(){return CHESS_PIECES[Math.floor(Math.random()*CHESS_PIECES.length)];}

// Theme word categories
const WORD_THEMES={
  fi:[
    {name:"Eläimet",emoji:"🐾",words:["kissa","koira","karhu","hirvi","lintu","orava","kettu","jänis","susi","kotka","hauki","ahven","sorsa","tikka","haukka"]},
    {name:"Ruoka",emoji:"🍽️",words:["leipä","juusto","kakku","liha","kala","riisi","pasta","keitto","salaatti","peruna","tomaatti","sipuli","porkkana","omena","marja"]},
    {name:"Luonto",emoji:"🌿",words:["metsä","järvi","joki","puu","kukka","taivas","pilvi","sade","tuuli","lumi","kallio","niitty","suo","lahti","saari"]},
    {name:"Koti",emoji:"🏠",words:["tuoli","pöytä","sänky","ovi","ikkuna","lattia","seinä","katto","lampu","peili","matto","tyyny","lakana","hylly","kaappi"]},
    {name:"Keho",emoji:"🫀",words:["käsi","jalka","pää","silmä","korva","nenä","suu","sormi","polvi","olka","rinta","selkä","vatsa","sydän","luut"]},
  ],
  en:[
    {name:"Animals",emoji:"🐾",words:["cat","dog","bear","bird","fish","deer","wolf","fox","hawk","eagle","snake","mouse","frog","duck","owl"]},
    {name:"Food",emoji:"🍽️",words:["bread","cheese","cake","meat","fish","rice","pasta","soup","salad","apple","grape","lemon","peach","plum","corn"]},
    {name:"Nature",emoji:"🌿",words:["tree","lake","river","cloud","rain","wind","snow","rock","hill","field","leaf","bloom","shore","wave","sand"]},
    {name:"Home",emoji:"🏠",words:["chair","table","bed","door","wall","floor","lamp","shelf","desk","couch","rug","towel","plate","glass","cup"]},
    {name:"Body",emoji:"🫀",words:["hand","foot","head","eye","ear","nose","mouth","arm","leg","knee","back","neck","chest","heart","bone"]},
  ],
  sv:[
    {name:"Djur",emoji:"🐾",words:["katt","hund","björn","fågel","fisk","rådjur","varg","räv","hök","örn","orm","mus","groda","anka","uggla"]},
    {name:"Mat",emoji:"🍽️",words:["bröd","ost","kaka","kött","fisk","ris","soppa","sallad","äpple","druva","citron","majs","plommon","päron","banan"]},
    {name:"Natur",emoji:"🌿",words:["träd","sjö","flod","moln","regn","vind","snö","sten","kulle","fält","löv","strand","våg","sand","skog"]},
    {name:"Hem",emoji:"🏠",words:["stol","bord","säng","dörr","vägg","golv","lampa","hylla","soffa","matta","kudde","glas","kopp","skål","fat"]},
    {name:"Kropp",emoji:"🫀",words:["hand","fot","huvud","öga","öra","näsa","mun","arm","ben","knä","rygg","nacke","bröst","hjärta","blod"]},
  ],
};

// Pick random mystery cell
function pickMysteryCell(sz){return{r:Math.floor(Math.random()*sz),c:Math.floor(Math.random()*sz)};}

// Pick random bomb cell
function pickBombCell(sz){return{r:Math.floor(Math.random()*sz),c:Math.floor(Math.random()*sz)};}

// Scramble a section of the grid (for bomb explosion)
function scrambleArea(grid,centerR,centerC,radius,lang){
  const sz=grid.length;const ng=grid.map(r=>[...r]);
  for(let r=Math.max(0,centerR-radius);r<=Math.min(sz-1,centerR+radius);r++){
    for(let c=Math.max(0,centerC-radius);c<=Math.min(sz-1,centerC+radius);c++){
      ng[r][c]=randLetterLang(lang);
    }
  }
  return ng;
}

export { applyGravityClient, rotateRow, rotateCol, CHESS_PIECES, CHESS_EMOJI, CHESS_NAMES, CHESS_MULT, chessValidMoves, randomChessPiece, WORD_THEMES, pickMysteryCell, pickBombCell, scrambleArea };
