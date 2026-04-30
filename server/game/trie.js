// Trie — sanaston nopea hakurakenne pelilogiikkaa varten.
//
// Pieni TrieNode + buildTrie. Käytetään ruudukon sanan etsintään
// (findWords/Hex), missä DFS kävelee solmuja ja katkaisee aikaisin
// jos ei ole olemassa edes prefiksiä.

export class TrieNode {
  constructor() {
    this.c = {};
    this.w = false;
  }
}

export function buildTrie(words) {
  const root = new TrieNode();
  for (const word of words) {
    let n = root;
    for (const ch of word) {
      if (!n.c[ch]) n.c[ch] = new TrieNode();
      n = n.c[ch];
    }
    n.w = true;
  }
  return root;
}
