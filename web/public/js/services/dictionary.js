// Carga del diccionario sin conexión (public/dict/). Los archivos son grandes
// (~1,7 MB comprimidos), así que se piden recién cuando hacen falta; el service
// worker los guarda para usarlos sin internet.

import { buildIndex, search } from '../core/dictionary.js';

let kanjiPromise = null;
let indexPromise = null;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** @returns {Promise<Record<string, object>>} datos de los kanji (KANJIDIC2). */
export function loadKanjiData() {
  kanjiPromise ??= fetchJson('dict/kanji.json')
    .then((d) => d.kanji ?? {})
    .catch((err) => {
      kanjiPromise = null; // reintentar después (por ejemplo, al volver internet)
      throw err;
    });
  return kanjiPromise;
}

/** Datos de un kanji o null si no está (o no se pudo cargar el diccionario). */
export async function kanjiInfo(ch) {
  try {
    return (await loadKanjiData())[ch] ?? null;
  } catch {
    return null;
  }
}

export function loadWordIndex() {
  indexPromise ??= fetchJson('dict/words.json')
    .then((d) => buildIndex(d.words ?? []))
    .catch((err) => {
      indexPromise = null;
      throw err;
    });
  return indexPromise;
}

export async function searchWords(query, opts) {
  return search(await loadWordIndex(), query, opts);
}

/** Palabras comunes que llevan un kanji (para dar ejemplos). */
export async function wordsWithKanji(ch, limit = 8) {
  const index = await loadWordIndex();
  const out = [];
  for (const entry of index) {
    if (entry.w.c && entry.kanji[0]?.includes(ch)) out.push(entry);
  }
  out.sort((a, b) => a.kanji[0].length - b.kanji[0].length || a.tie - b.tie);
  return out.slice(0, limit).map((e) => e.w);
}

/** Significados para mostrar: en español si hay, si no en inglés. */
export function kanjiMeanings(info) {
  if (!info) return { lang: 'es', list: [] };
  return info.es?.length ? { lang: 'es', list: info.es } : { lang: 'en', list: info.en ?? [] };
}

// ───────────────────── Lecturas (para corregir la pronunciación) ─────────────────────

let readingMap = null;
let kanjiCache = null;

/** Carga en segundo plano lo necesario para `readingsOf` (no hace falta esperar). */
export function preloadReadings() {
  loadWordIndex()
    .then((index) => {
      if (readingMap) return;
      readingMap = new Map();
      for (const entry of index) {
        for (const form of entry.kanji) {
          const list = readingMap.get(form) ?? [];
          list.push(...entry.w.r);
          readingMap.set(form, list);
        }
      }
    })
    .catch(() => {});
  loadKanjiData()
    .then((d) => (kanjiCache = d))
    .catch(() => {});
}

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Cómo se lee un texto con kanji según el diccionario (vacío si no se sabe o no cargó). */
export function readingsOf(text) {
  const out = [...(readingMap?.get(text) ?? [])];
  const info = [...text].length === 1 ? kanjiCache?.[text] : null;
  if (info) out.push(...info.on.map(toHira), ...info.kun.map((r) => r.replace(/[-.]/g, '')));
  return [...new Set(out)];
}
