// Ejercicios de listening: texto con espacios a completar, división en frases y
// comparación de un dictado completo con la transcripción.

import { kataToHira, romajiToHiragana } from './japanese.js';

export const LEVELS = Object.freeze({
  easy: { label: 'Fácil', every: 7 },
  medium: { label: 'Medio', every: 4 },
  hard: { label: 'Difícil', every: 2 },
});

// ───────────────────────────── Espacios a completar ─────────────────────────────

/**
 * Divide la transcripción en partes de texto y espacios a completar.
 * Si el texto marca palabras entre corchetes ("私は[学生|がくせい]です") se usan
 * esas (lo que va después de | son otras respuestas válidas). Si no marca nada,
 * se eligen palabras según el nivel: más espacios cuanto más difícil.
 * @returns {{text?: string, blank?: {answers: string[]}}[]}
 */
export function clozeParts(transcript, level = 'medium', language = 'ja') {
  const text = String(transcript ?? '');
  if (/\[[^\]]+\]/.test(text)) return markedParts(text);
  return autoParts(text, LEVELS[level]?.every ?? 4, language);
}

function markedParts(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]/g)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const answers = m[1].split('|').map((a) => a.trim()).filter(Boolean);
    parts.push({ blank: { answers } });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

function autoParts(text, every, language) {
  const segments = segmentWords(text, language);
  const parts = [];
  let candidate = 0;
  for (const seg of segments) {
    const usable = seg.isWordLike && /[\p{L}\p{N}]/u.test(seg.segment) && seg.segment.trim().length > 0;
    if (usable) {
      candidate += 1;
      if (candidate % every === 0) {
        parts.push({ blank: { answers: [seg.segment] } });
        continue;
      }
    }
    const prev = parts.at(-1);
    if (prev?.text !== undefined) prev.text += seg.segment;
    else parts.push({ text: seg.segment });
  }
  return parts;
}

function segmentWords(text, language) {
  if (globalThis.Intl?.Segmenter) {
    return [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)];
  }
  // Respaldo sin Segmenter: palabras separadas por espacios (sirve poco en japonés).
  return text.split(/(\s+)/).map((segment) => ({ segment, isWordLike: /\S/.test(segment) }));
}

/** Transcripción sin las marcas de corchetes: "私は[学生|がくせい]です" → "私は学生です". */
export function plainTranscript(transcript) {
  return String(transcript ?? '').replace(/\[([^\]|]+)(\|[^\]]*)?\]/g, '$1');
}

// ───────────────────────────── Frases ─────────────────────────────

/** Divide un texto en frases para leerlas de a una (voz del sistema). */
export function sentences(text) {
  return plainTranscript(text)
    .split(/(?<=[。！？!?\n])|(?<=\.\s)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ───────────────────────────── Dictado completo ─────────────────────────────

const SKIP = /[\s。、．，,.!！?？「」『』（）()［］[\]・〜~…:：;；'"`’”“\-‐–—_/／]/;
const VOWEL = (() => {
  const rows = { a: 'あかさたなはまやらわがざだばぱぁゃ', i: 'いきしちにひみりぎじぢびぴぃ', u: 'うくすつぬふむゆるぐずづぶぷぅゅ', e: 'えけせてねへめれげぜでべぺぇ', o: 'おこそとのほもよろをごぞどぼぽぉょ' };
  const map = new Map();
  for (const [v, chars] of Object.entries(rows)) for (const c of chars) map.set(c, v);
  return map;
})();
const VOWEL_KANA = { a: 'あ', i: 'い', u: 'う', e: 'え', o: 'お' };

/**
 * Convierte un texto en una lista de caracteres comparables, recordando de qué
 * carácter original salió cada uno. Unifica katakana/hiragana, mayúsculas,
 * ancho completo, tildes y vocales largas; ignora espacios y puntuación.
 */
export function comparableChars(text, { fromRomaji = false } = {}) {
  let source = String(text ?? '');
  if (fromRomaji && /[a-z]/i.test(source)) {
    // Partículas escritas sueltas en romaji: "wa" = は, "e" = へ, "o" = を.
    const PARTICLE = { wa: 'は', e: 'へ', o: 'を' };
    source = source.replace(/[a-z'-]+/gi, (m) => PARTICLE[m.toLowerCase()] ?? romajiToHiragana(m));
  }
  const out = [];
  [...source].forEach((original, index) => {
    let ch = kataToHira(original.normalize('NFKC').toLowerCase());
    ch = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
    for (const c of ch) {
      if (SKIP.test(c)) continue;
      const prevVowel = VOWEL.get(out.at(-1)?.ch);
      let n = c;
      if (c === 'ー' && prevVowel) n = VOWEL_KANA[prevVowel];
      else if (c === 'う' && prevVowel === 'o') n = 'お';
      else if (c === 'い' && prevVowel === 'e') n = 'え';
      out.push({ ch: n, index });
    }
  });
  return out;
}

/** Subsecuencia común más larga: qué posiciones de `a` aparecen en `b` en orden. */
function lcsMatches(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].ch === b[j].ch ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Set();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i].ch === b[j].ch) {
      matched.add(i);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }
  return { matched, length: dp[0][0] };
}

export const MAX_DICTATION_CHARS = 3000;

/**
 * Compara lo escrito con la transcripción (y con la lectura en kana si existe,
 * porque se puede escribir en kana algo que el texto tiene en kanji).
 * @returns {{score: number, reference: string, marks: boolean[]}}
 *   marks[i] = el carácter i de `reference` fue escrito bien.
 */
export function compareDictation(input, references) {
  const user = comparableChars(String(input).slice(0, MAX_DICTATION_CHARS), { fromRomaji: true });
  let best = null;
  for (const raw of references.filter(Boolean)) {
    const reference = plainTranscript(raw).slice(0, MAX_DICTATION_CHARS);
    const ref = comparableChars(reference);
    if (ref.length === 0) continue;
    const { matched, length } = lcsMatches(ref, user);
    // Penaliza lo que sobra (escribir mucho de más no debe dar 100 %).
    const extra = Math.max(0, user.length - length);
    const score = Math.max(0, (length - extra * 0.5) / ref.length);
    if (!best || score > best.score) {
      const marks = [...reference].map(() => null);
      ref.forEach((c, k) => {
        marks[c.index] = (marks[c.index] ?? true) && matched.has(k);
      });
      best = { score, reference, marks };
    }
  }
  return best ?? { score: 0, reference: '', marks: [] };
}
