// Arma los "ítems de práctica" (palabra, lectura, kanji, significado) a partir de
// las tarjetas de un mazo, para pronunciación, dictado y comprensión auditiva.

import { isKanaOnly, hasKana, hasKanji, isKanji, kataToHira } from './japanese.js';

const stripDecoration = (s) =>
  String(s)
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[〜~…]|\.\.\./g, '')
    .trim();

/** "kazoku · 家族" → { romaji: "kazoku", kanji: "家族" } */
function splitPronunciation(pron) {
  const parts = String(pron ?? '').split('·').map((p) => p.trim()).filter(Boolean);
  return {
    romaji: parts.find((p) => /^[\x20-\x7E]+$/.test(p)) ?? '',
    kanji: parts.find((p) => hasKanji(p)) ?? '',
    kana: parts.find((p) => isKanaOnly(stripDecoration(p))) ?? '',
  };
}

/** Palabras de ejemplo de una tarjeta de kanji: "一時 (いちじ) la una · 一つ (ひとつ) uno". */
export function parseKanjiExamples(text) {
  const out = [];
  const re = /([^\s·()（）]+)\s*[（(]([ぁ-ゖァ-ヺー／/]+)[)）]\s*([^·]*)/g;
  for (const m of String(text ?? '').matchAll(re)) {
    out.push({ word: m[1], readings: m[2].split(/[／/]/), meaning: m[3].trim() });
  }
  return out;
}

/**
 * @returns {{id:string, display:string, kanji:string, readings:string[], meaning:string, romaji:string}[]}
 */
export function itemsFromCards(cards) {
  const items = [];
  for (const card of cards) {
    if (card.kind === 'character') {
      parseKanjiExamples(card.example).forEach((ex, i) => {
        items.push({ id: `${card.id}:${i}`, display: ex.word, kanji: ex.word, readings: ex.readings, meaning: ex.meaning, romaji: '' });
      });
      continue;
    }
    const front = stripDecoration(card.front);
    const pron = splitPronunciation(card.pronunciation);
    const frontAlternatives = front.split(/[／/]/).map((s) => s.trim()).filter(Boolean);
    let readings = [];
    let kanji = pron.kanji;
    if (frontAlternatives.every(isKanaOnly)) {
      readings = frontAlternatives;
    } else {
      kanji = kanji || front;
      if (pron.kana) readings = [stripDecoration(pron.kana)];
    }
    items.push({
      id: card.id,
      display: card.front,
      kanji: stripDecoration(kanji),
      readings,
      meaning: card.back,
      romaji: pron.romaji,
    });
  }
  return items;
}

/** Texto a leer en voz alta: la lectura en kana si existe (más fiable), si no lo escrito. */
export function speechText(item) {
  return item.readings[0] || item.kanji || item.display;
}

/** Respuestas aceptadas al escribir lo que se escuchó o lo que se dijo. */
export function acceptedForms(item) {
  return [...item.readings, item.kanji, stripDecoration(item.display)].filter(Boolean);
}

/** Kanji y kana distintos que aparecen en las tarjetas (para practicar escritura). */
export function charactersFromCards(cards) {
  const seen = new Set();
  for (const card of cards) {
    for (const ch of String(card.front)) {
      if (isKanji(ch) && ch !== '々') seen.add(ch);
    }
  }
  return [...seen];
}

/** Elige `count` distractores distintos del correcto (por significado). */
export function pickDistractors(items, correct, count = 3, random = Math.random) {
  const pool = items.filter((i) => i.id !== correct.id && i.meaning && i.meaning !== correct.meaning);
  const unique = [...new Map(pool.map((i) => [i.meaning, i])).values()];
  return shuffle(unique, random).slice(0, count);
}

export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Para mostrar: ¿el ítem tiene una lectura en kana distinta de lo escrito? */
export function readingHint(item) {
  const r = item.readings.join(' / ');
  return r && kataToHira(r) !== kataToHira(item.display) && hasKana(r) ? r : '';
}
