// words.js — kielikohtaiset sanavarastot, triet ja täyssanaston binäärihaku.
//
// Pitää sisäisen LANGS-objektin: jokaiselle kielelle sana-Set + trie +
// kirjaintaajuudet. Tarjoaa myös FULL_WORDS_BUF-puskurin pidempien
// suomenkielisten sanojen binäärihakuun (~24 MB pakattuna).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import WORDS_RAW_FI from "../words.js";
import WORDS_RAW_EN from "../words_en.js";
import WORDS_RAW_SV from "../words_sv.js";

import { buildTrie } from "./game/trie.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Per-language word sets and tries
export const LANGS = {
  fi: {
    words: new Set(WORDS_RAW_FI.split("|")),
    trie: null,
    letterWeights: {
      a: 120, i: 108, t: 87, n: 88, e: 80, s: 79, l: 58, o: 53, k: 51, u: 51,
      "ä": 37, m: 33, v: 25, r: 29, j: 20, h: 19, y: 19, p: 18, d: 10, "ö": 4,
    },
  },
  en: {
    words: new Set(WORDS_RAW_EN.split("|")),
    trie: null,
    letterWeights: {
      e: 127, t: 91, a: 82, o: 75, i: 70, n: 67, s: 63, h: 61, r: 60,
      d: 43, l: 40, c: 28, u: 28, m: 24, w: 24, f: 22, g: 20, y: 20,
      p: 19, b: 15, v: 10, k: 8, j: 2, x: 2, q: 1, z: 1,
    },
  },
  sv: {
    words: new Set(WORDS_RAW_SV.split("|")),
    trie: null,
    letterWeights: {
      a: 93, e: 88, n: 82, r: 73, t: 70, s: 66, i: 58, l: 52, d: 45, o: 41,
      k: 34, g: 33, m: 32, f: 20, v: 20, "ä": 18, u: 18, h: 17, p: 17,
      b: 16, "å": 13, "ö": 13, c: 6, j: 6, y: 6, x: 2, w: 1, z: 1, q: 1,
    },
  },
};

// Build tries on import
for (const lang of Object.keys(LANGS)) {
  LANGS[lang].trie = buildTrie(LANGS[lang].words);
}

export function getLang(lang) {
  return LANGS[lang] || LANGS.fi;
}

export function isLangValid(lang) {
  return !!LANGS[lang];
}

// ===== Full Finnish dictionary buffer (for long word validation) =====

export const FULL_WORDS_BUF = (() => {
  const gzPath = join(REPO_ROOT, "words_fi_full.txt.gz");
  if (existsSync(gzPath)) return gunzipSync(readFileSync(gzPath));
  const fullPath = join(REPO_ROOT, "words_fi_full.txt");
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath);
})();

function bufFindLineStart(buf, pos) {
  while (pos > 0 && buf[pos - 1] !== 10) pos--;
  return pos;
}

function bufGetLine(buf, pos) {
  const start = bufFindLineStart(buf, pos);
  let end = buf.indexOf(10, start);
  if (end === -1) end = buf.length;
  return buf.toString("utf8", start, end);
}

export function hasWordInBuf(buf, word) {
  if (!buf) return false;
  let lo = 0, hi = buf.length - 1;
  while (lo <= hi) {
    let mid = (lo + hi) >>> 1;
    const lineStart = bufFindLineStart(buf, mid);
    const line = bufGetLine(buf, lineStart);
    if (line === word) return true;
    if (line < word) {
      let end = buf.indexOf(10, lineStart);
      lo = end === -1 ? hi + 1 : end + 1;
    } else {
      hi = lineStart - 1;
    }
  }
  return false;
}

export function bufHasPrefix(buf, prefix) {
  if (!buf) return false;
  let lo = 0, hi = buf.length - 1, best = -1;
  while (lo <= hi) {
    let mid = (lo + hi) >>> 1;
    const ls = bufFindLineStart(buf, mid);
    const line = bufGetLine(buf, ls);
    if (line >= prefix) {
      best = ls;
      hi = ls > lo ? ls - 1 : lo - 1;
    } else {
      let e = buf.indexOf(10, ls);
      lo = e === -1 ? hi + 1 : e + 1;
    }
  }
  if (best === -1) return false;
  return bufGetLine(buf, best).startsWith(prefix);
}
