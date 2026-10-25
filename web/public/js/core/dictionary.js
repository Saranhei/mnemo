// Búsqueda en el diccionario sin conexión (datos de JMdict / KANJIDIC2 en public/dict/).
//
// Se puede buscar como uno escribe: en kanji (食べる), kana (たべる / タベル), romaji
// (taberu) o por significado en español o inglés (comer, to eat). Los resultados
// se ordenan por qué tan bien coinciden y, a igual coincidencia, primero las palabras
// comunes. No hay red de por medio: todo pasa en el dispositivo.

import { japaneseKey, spanishKey, isKanji, hasKana, hasKanji } from './japanese.js';

/** Etiquetas en español de las categorías gramaticales más frecuentes de JMdict. */
const POS_LABEL = [
  [/^v1/, 'verbo -ru'],
  [/^v5/, 'verbo -u'],
  [/^vk$/, 'verbo irregular (くる)'],
  [/^vs/, 'verbo する'],
  [/^vz$/, 'verbo -zuru'],
  [/^adj-i$/, 'adjetivo -i'],
  [/^adj-ix$/, 'adjetivo -i (いい)'],
  [/^adj-na$/, 'adjetivo -na'],
  [/^adj-no$/, 'sustantivo + の'],
  [/^adj-t$/, 'adjetivo -taru'],
  [/^adj-f$/, 'prenominal'],
  [/^adv/, 'adverbio'],
  [/^n-suf$/, 'sufijo'],
  [/^n-pref$/, 'prefijo'],
  [/^n/, 'sustantivo'],
  [/^pn$/, 'pronombre'],
  [/^prt$/, 'partícula'],
  [/^conj$/, 'conjunción'],
  [/^int$/, 'interjección'],
  [/^exp$/, 'expresión'],
  [/^ctr$/, 'contador'],
  [/^aux/, 'auxiliar'],
  [/^suf$/, 'sufijo'],
  [/^pref$/, 'prefijo'],
  [/^num$/, 'número'],
  [/^cop$/, 'cópula'],
];

export function posLabels(codes = []) {
  const out = [];
  for (const code of codes) {
    if (code === 'vt') out.push('transitivo');
    else if (code === 'vi') out.push('intransitivo');
    else {
      const label = POS_LABEL.find(([re]) => re.test(code))?.[1];
      if (label) out.push(label);
    }
  }
  return [...new Set(out)];
}

/** Separa las glosas de las acepciones ("comer; tragar" → ["comer", "tragar"]) en claves comparables. */
const stripParens = (text) => {
  let s = text;
  for (let prev = ''; prev !== s; ) [prev, s] = [s, s.replace(/\([^()]*\)/g, ' ')];
  return s;
};

/**
 * Claves de las glosas, con su "distancia" al principio de la entrada: la primera
 * glosa de la primera acepción es lo que más se usa ("gato" → 猫 antes que ジャッキ).
 */
function glossKeys(senses = []) {
  const keys = [];
  senses.forEach((sense, si) => {
    const glosses = sense.split('; ');
    glosses.forEach((g, gi) => {
      const key = spanishKey(stripParens(g));
      if (key) keys.push({ key, rank: si * 2 + gi + (glosses.length > 1 ? 1 : 0) + (g.includes('(') ? 1 : 0) });
    });
  });
  return keys;
}

/** Prepara las palabras para buscar rápido (se hace una vez, al cargar el diccionario). */
export function buildIndex(words) {
  return words.map((w) => ({
    w,
    kanji: w.k ?? [],
    kana: w.r.map(japaneseKey),
    es: glossKeys(w.es),
    en: glossKeys(w.en),
    // Desempate: palabras con kanji más frecuentes primero; las solo katakana (préstamos), después.
    tie: Math.min(3, (w.f ?? 0) / 300) + (!w.k && /^[ァ-ヺー・]+$/.test(w.r[0]) ? 4 : 0),
  }));
}

const isLatin = (q) => /^[a-z0-9\s'’-]+$/i.test(q);

function formScore(forms, q) {
  let best = Infinity;
  for (const f of forms) {
    if (f === q) return 0;
    if (f.startsWith(q)) best = Math.min(best, 20 + (f.length - q.length));
    else if (q.length > 1 && f.includes(q)) best = Math.min(best, 45 + f.length);
  }
  return best;
}

function meaningScore(keys, q, base) {
  let best = Infinity;
  for (const { key: k, rank } of keys) {
    if (k === q || k === `to ${q}`) best = Math.min(best, base + rank);
    const at = ` ${k} `.indexOf(` ${q} `);
    if (at === 0) best = Math.min(best, base + 8 + rank + (k.length - q.length) / 4);
    else if (at > 0) best = Math.min(best, base + 18 + rank + k.length / 4);
  }
  return best;
}

/**
 * @param {ReturnType<typeof buildIndex>} index
 * @param {string} query
 * @returns {object[]} las palabras (formato de words.json), mejores primero.
 */
export function search(index, query, { limit = 60 } = {}) {
  const raw = String(query ?? '').normalize('NFKC').trim();
  if (!raw) return [];
  const latin = isLatin(raw);
  const japanese = hasKana(raw) || hasKanji(raw);
  const kanaQ = latin || hasKana(raw) ? japaneseKey(raw) : '';
  const meaningQ = latin || !japanese ? spanishKey(raw) : '';
  // Romaji que no se pudo pasar entero a kana (por ejemplo "gato" sí, "xyz" no) no busca en kana.
  const kanaOk = kanaQ && !/[a-z]/.test(kanaQ);

  const results = [];
  for (const entry of index) {
    let score = Infinity;
    if (japanese) score = Math.min(score, formScore(entry.kanji, raw));
    if (kanaOk) score = Math.min(score, formScore(entry.kana, kanaQ) + (latin ? 2 : 0));
    if (meaningQ && meaningQ.length > 1) {
      score = Math.min(score, meaningScore(entry.es, meaningQ, 1), meaningScore(entry.en, meaningQ, 4));
    }
    if (score === Infinity) continue;
    if (entry.w.c) score -= 6;
    score += entry.tie;
    results.push({ score, w: entry.w });
  }
  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit).map((r) => r.w);
}

/** Los kanji que aparecen en un texto, sin repetir (para mostrarlos aparte en la búsqueda). */
export function kanjiIn(text) {
  return [...new Set([...String(text ?? '')].filter(isKanji))];
}

/** Lectura kun como se suele escribir: "ひと.つ" → "ひと(つ)", "-び" → "〜び". */
export function formatKun(reading) {
  return String(reading).replace(/^-/, '〜').replace(/-$/, '〜').replace(/\.(.+)$/, '($1)');
}
