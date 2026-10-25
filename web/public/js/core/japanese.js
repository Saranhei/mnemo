// Utilidades de japonés: tablas de kana, conversión de romaji y comparación
// tolerante de respuestas (para preguntas, dictado y pronunciación).

// ───────────────────────────── Tablas de kana ─────────────────────────────
// [kana, romaji]. Filas en el orden tradicional (a, ka, sa, ta, na...).

const H_BASIC = 'あ a い i う u え e お o か ka き ki く ku け ke こ ko さ sa し shi す su せ se そ so た ta ち chi つ tsu て te と to な na に ni ぬ nu ね ne の no は ha ひ hi ふ fu へ he ほ ho ま ma み mi む mu め me も mo や ya ゆ yu よ yo ら ra り ri る ru れ re ろ ro わ wa を wo ん n';
const H_DAKUTEN = 'が ga ぎ gi ぐ gu げ ge ご go ざ za じ ji ず zu ぜ ze ぞ zo だ da ぢ ji づ zu で de ど do ば ba び bi ぶ bu べ be ぼ bo ぱ pa ぴ pi ぷ pu ぺ pe ぽ po';

function pairs(spec) {
  const parts = spec.split(' ');
  const out = [];
  for (let i = 0; i < parts.length; i += 2) out.push({ char: parts[i], romaji: parts[i + 1] });
  return out;
}

export const HIRAGANA = pairs(H_BASIC);
export const HIRAGANA_DAKUTEN = pairs(H_DAKUTEN);
export const KATAKANA = HIRAGANA.map(({ char, romaji }) => ({ char: hiraToKata(char), romaji }));
export const KATAKANA_DAKUTEN = HIRAGANA_DAKUTEN.map(({ char, romaji }) => ({ char: hiraToKata(char), romaji }));

const KANA_ROMAJI = new Map([...HIRAGANA, ...HIRAGANA_DAKUTEN, ...KATAKANA, ...KATAKANA_DAKUTEN].map((k) => [k.char, k.romaji]));
export const romajiOfKana = (char) => KANA_ROMAJI.get(char) ?? '';

// ───────────────────────────── Clasificación ─────────────────────────────

export const isHiragana = (ch) => /[ぁ-ゖゝゞ]/.test(ch);
export const isKatakana = (ch) => /[ァ-ヺヽヾ]/.test(ch);
export const isKanji = (ch) => /[㐀-䶿一-鿿豈-﫿々]/.test(ch);
export const hasKanji = (s) => [...String(s)].some(isKanji);
export const hasKana = (s) => /[ぁ-ゖァ-ヺ]/.test(String(s));
/** Solo kana (y la marca de vocal larga). */
export const isKanaOnly = (s) => /^[ぁ-ゖァ-ヺーー]+$/.test(String(s));

export function kataToHira(s) {
  return String(s).replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function hiraToKata(s) {
  return String(s).replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

// ───────────────────────────── Romaji → hiragana ─────────────────────────────

const ROMAJI = {
  a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お',
  ka: 'か', ki: 'き', ku: 'く', ke: 'け', ko: 'こ', kya: 'きゃ', kyu: 'きゅ', kyo: 'きょ',
  ga: 'が', gi: 'ぎ', gu: 'ぐ', ge: 'げ', go: 'ご', gya: 'ぎゃ', gyu: 'ぎゅ', gyo: 'ぎょ',
  sa: 'さ', si: 'し', shi: 'し', su: 'す', se: 'せ', so: 'そ', sha: 'しゃ', shu: 'しゅ', she: 'しぇ', sho: 'しょ', sya: 'しゃ', syu: 'しゅ', syo: 'しょ',
  za: 'ざ', zi: 'じ', ji: 'じ', zu: 'ず', ze: 'ぜ', zo: 'ぞ', ja: 'じゃ', ju: 'じゅ', je: 'じぇ', jo: 'じょ', jya: 'じゃ', jyu: 'じゅ', jyo: 'じょ', zya: 'じゃ', zyu: 'じゅ', zyo: 'じょ',
  ta: 'た', ti: 'ち', chi: 'ち', tu: 'つ', tsu: 'つ', te: 'て', to: 'と', cha: 'ちゃ', chu: 'ちゅ', che: 'ちぇ', cho: 'ちょ', tya: 'ちゃ', tyu: 'ちゅ', tyo: 'ちょ',
  da: 'だ', di: 'ぢ', du: 'づ', de: 'で', do: 'ど',
  na: 'な', ni: 'に', nu: 'ぬ', ne: 'ね', no: 'の', nya: 'にゃ', nyu: 'にゅ', nyo: 'にょ',
  ha: 'は', hi: 'ひ', hu: 'ふ', fu: 'ふ', he: 'へ', ho: 'ほ', hya: 'ひゃ', hyu: 'ひゅ', hyo: 'ひょ', fa: 'ふぁ', fi: 'ふぃ', fe: 'ふぇ', fo: 'ふぉ',
  ba: 'ば', bi: 'び', bu: 'ぶ', be: 'べ', bo: 'ぼ', bya: 'びゃ', byu: 'びゅ', byo: 'びょ',
  pa: 'ぱ', pi: 'ぴ', pu: 'ぷ', pe: 'ぺ', po: 'ぽ', pya: 'ぴゃ', pyu: 'ぴゅ', pyo: 'ぴょ',
  ma: 'ま', mi: 'み', mu: 'む', me: 'め', mo: 'も', mya: 'みゃ', myu: 'みゅ', myo: 'みょ',
  ya: 'や', yu: 'ゆ', yo: 'よ',
  ra: 'ら', ri: 'り', ru: 'る', re: 'れ', ro: 'ろ', rya: 'りゃ', ryu: 'りゅ', ryo: 'りょ',
  wa: 'わ', wi: 'うぃ', we: 'うぇ', wo: 'を',
  va: 'ゔぁ', vi: 'ゔぃ', vu: 'ゔ', ve: 'ゔぇ', vo: 'ゔぉ',
  ti_: 'てぃ', thi: 'てぃ', dhi: 'でぃ',
  xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', xtsu: 'っ', xtu: 'っ',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', ltsu: 'っ', ltu: 'っ',
  '-': 'ー',
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

/** Convierte romaji (Hepburn o estilo teclado) a hiragana. Lo que no reconoce lo deja igual. */
export function romajiToHiragana(input) {
  const s = String(input).toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    // Consonante doble (kk, tt, ss, tch...) → っ
    if (c !== 'n' && /[bcdfghjkmpqrstvwxyz]/.test(c) && (next === c || (c === 't' && next === 'c'))) {
      out += 'っ';
      i += 1;
      continue;
    }
    // ん: "nn", "n'", o n seguida de consonante (que no sea y) o al final
    if (c === 'n') {
      if (next === 'n') {
        // "konnichiha", "minna": la segunda n empieza la sílaba siguiente.
        const after = s[i + 2];
        out += 'ん';
        i += after !== undefined && (VOWELS.has(after) || after === 'y') ? 1 : 2;
        continue;
      }
      if (next === "'") {
        out += 'ん';
        i += 2;
        continue;
      }
      if (next === undefined || (!VOWELS.has(next) && next !== 'y')) {
        out += 'ん';
        i += 1;
        continue;
      }
    }
    let matched = false;
    for (const len of [4, 3, 2, 1]) {
      const chunk = s.slice(i, i + len);
      if (Object.hasOwn(ROMAJI, chunk)) {
        out += ROMAJI[chunk];
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += c;
      i += 1;
    }
  }
  return out;
}

// ───────────────────────────── Comparación tolerante ─────────────────────────────

const VOWEL_OF = (() => {
  const map = new Map();
  for (const { char, romaji } of [...HIRAGANA, ...HIRAGANA_DAKUTEN]) map.set(char, romaji.at(-1));
  for (const [k, v] of Object.entries({ ゃ: 'a', ゅ: 'u', ょ: 'o', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' })) map.set(k, v);
  return map;
})();
const VOWEL_KANA = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };

const PUNCTUATION = /[\s。、．，,.!！?？「」『』（）()［］[\]・〜~…:：;；'"`’”“\-‐–—_/／]/g;

/**
 * Clave para comparar texto en japonés sin importar la forma de escribirlo:
 * romaji → hiragana, katakana → hiragana, sin espacios ni puntuación, y con las
 * vocales largas unificadas (コーヒー = こおひい = "koohii"; せんせい = "sensee";
 * とうきょう = "tookyoo").
 */
export function japaneseKey(text) {
  let s = String(text).normalize('NFKC').toLowerCase().trim();
  if (/[a-z]/.test(s)) s = s.replace(/[a-z'-]+/g, (m) => romajiToHiragana(m));
  s = kataToHira(s).replace(PUNCTUATION, '');
  let out = '';
  for (const ch of s) {
    const prevVowel = VOWEL_OF.get(out.at(-1));
    if (ch === 'ー' && prevVowel) out += VOWEL_KANA[prevVowel];
    else if (ch === 'う' && prevVowel === 'o') out += 'お';
    else if (ch === 'い' && prevVowel === 'e') out += 'え';
    else out += ch;
  }
  return out;
}

/** Clave para comparar texto en español: sin tildes, mayúsculas ni puntuación. */
export function spanishKey(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!.,;:()"'«»…]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KANJI_DIGITS = { 〇: '0', 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9', 十: '10' };
const digitsVariant = (s) => s.replace(/[〇一二三四五六七八九十]/g, (c) => KANJI_DIGITS[c]);

/**
 * Variantes aceptables de una respuesta: "すき（な）" acepta "すきな" y "すき";
 * "comer; tomar" acepta cada significado; "〜さん" acepta "さん".
 */
export function answerVariants(answer) {
  const base = String(answer).trim();
  const out = new Set();
  const pieces = [base, ...base.split(/\s*[;；／]\s*/)];
  for (const piece of pieces) {
    if (!piece) continue;
    out.add(piece.replace(/[（(]([^）)]*)[）)]/g, '$1'));
    out.add(piece.replace(/\s*[（(][^）)]*[）)]\s*/g, ' ').trim());
  }
  return [...out].filter(Boolean);
}

/** ¿La respuesta escrita coincide con alguna de las aceptadas? */
/** En romaji, las partículas sueltas "wa", "e" y "o" se escriben は, へ y を. */
const ROMAJI_PARTICLE = { wa: 'は', e: 'へ', o: 'を' };
function romajiParticles(text) {
  return text.replace(/(^|\s)(wa|e|o)(?=\s|$)/gi, (_, sp, p) => sp + ROMAJI_PARTICLE[p.toLowerCase()]);
}

export function matchesAnswer(input, accepted) {
  const raw = String(input ?? '').trim();
  if (!raw) return false;
  const inJa = japaneseKey(raw);
  const inEs = spanishKey(raw);
  const inDigits = japaneseKey(digitsVariant(raw.normalize('NFKC')));
  const inParticles = japaneseKey(romajiParticles(raw));
  for (const answer of accepted) {
    for (const v of answerVariants(answer)) {
      const ja = japaneseKey(v);
      if (ja && (ja === inJa || ja === inParticles || japaneseKey(digitsVariant(v)) === inDigits)) return true;
      if (spanishKey(v) && spanishKey(v) === inEs) return true;
    }
  }
  return false;
}
