// Todo lo que se sabe de un kanji para mostrarlo al practicar: significado (de tu
// tarjeta si la hay; si no, del diccionario), lecturas on/kun, cantidad de trazos y
// una palabra de ejemplo para escuchar.

import * as store from '../data/store.js';
import { parseKanjiExamples } from '../core/practice.js';
import { kanjiInfo, kanjiMeanings } from './dictionary.js';
import { formatKun } from '../core/dictionary.js';

/**
 * @returns {Promise<{meaning: string, meaningLang: string, on: string[], kun: string[], strokes: number | null, example: string, speak: string}>}
 */
export async function kanjiDetails(ch) {
  const card = store.getState().cards.find((c) => !c.deleted && c.kind === 'character' && c.front === ch);
  const info = await kanjiInfo(ch);
  const dict = kanjiMeanings(info);
  const example = card ? parseKanjiExamples(card.example)[0] : null;
  const kunRaw = (info?.kun ?? []).map((r) => r.replace(/^-|-$/g, ''));
  const kun = [...new Set(kunRaw.map(formatKun))];
  return {
    meaning: card?.back || dict.list.slice(0, 3).join(', '),
    meaningLang: card?.back ? 'es' : dict.lang,
    on: info?.on ?? [],
    kun,
    strokes: info?.s ?? null,
    example: example ? `${example.word} (${example.readings[0]}) ${example.meaning}` : '',
    // Para escuchar: la palabra de ejemplo, o la primera lectura kun (sin okurigana), o la on.
    speak: example?.readings[0] ?? kunRaw[0]?.replace('.', '') ?? info?.on?.[0] ?? '',
  };
}
