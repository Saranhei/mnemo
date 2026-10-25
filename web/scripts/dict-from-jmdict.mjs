// Genera el diccionario sin conexión (public/dict/) a partir de jmdict-simplified.
//
//   node scripts/dict-from-jmdict.mjs <jmdict-eng-common.json> <jmdict-spa.json> <kanjidic2-all.json>
//
// Fuentes: JMdict y KANJIDIC2, © Electronic Dictionary Research and Development
// Group (EDRDG), licencia CC BY-SA 4.0, en el formato JSON de jmdict-simplified
// (https://github.com/scriptin/jmdict-simplified).
//
// Salida (compacta, se carga solo al abrir el diccionario):
//   words.json  → { date, words: [{ k: [kanji], r: [kana], c: 0|1, p: [pos], es: [acepción], en: [acepción] }] }
//   kanji.json  → { date, kanji: { 字: { s, g, j, f, on: [], kun: [], es: [], en: [] } } }

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [engPath, spaPath, kanjiPath] = process.argv.slice(2);
if (!engPath || !spaPath || !kanjiPath) {
  console.error('Uso: node scripts/dict-from-jmdict.mjs <jmdict-eng-common.json> <jmdict-spa.json> <kanjidic2-all.json>');
  process.exit(1);
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'dict');

// Formas que solo sirven para buscar o son raras/irregulares: no se muestran.
const HIDDEN_FORM = new Set(['sK', 'sk', 'rK', 'rk', 'iK', 'ik', 'oK', 'ok', 'io']);
const MAX_SENSES = 6;
const MAX_GLOSSES = 5;

const eng = JSON.parse(await readFile(engPath, 'utf8'));
const spa = JSON.parse(await readFile(spaPath, 'utf8'));
const kanjidic = JSON.parse(await readFile(kanjiPath, 'utf8'));

const forms = (list) => {
  const visible = list.filter((f) => !f.tags.some((t) => HIDDEN_FORM.has(t)));
  return (visible.length ? visible : list).slice(0, 4).map((f) => f.text);
};
const senses = (word, lang) =>
  word.sense
    .map((s) => s.gloss.filter((g) => g.lang === lang).slice(0, MAX_GLOSSES).map((g) => g.text).join('; '))
    .filter(Boolean)
    .slice(0, MAX_SENSES);
const isCommon = (w) => w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);

const byId = new Map();
for (const w of eng.words) {
  byId.set(w.id, { k: forms(w.kanji), r: forms(w.kana), c: isCommon(w) ? 1 : 0, p: w.sense[0]?.partOfSpeech ?? [], es: [], en: senses(w, 'eng') });
}
for (const w of spa.words) {
  const es = senses(w, 'spa');
  if (!es.length) continue;
  const entry = byId.get(w.id);
  if (entry) entry.es = es;
  else byId.set(w.id, { k: forms(w.kanji), r: forms(w.kana), c: isCommon(w) ? 1 : 0, p: w.sense[0]?.partOfSpeech ?? [], es, en: [] });
}
const kanjiFreq = new Map(kanjidic.characters.map((c) => [c.literal, c.misc.frequency ?? 2600]));
// Comunes primero (así los resultados salen en un orden útil sin más cálculo).
const words = [...byId.values()].sort((a, b) => b.c - a.c);
for (const w of words) {
  // Qué tan raros son sus kanji (suma de su puesto de frecuencia): sirve para desempatar resultados.
  const chars = [...(w.k[0] ?? '')].filter((ch) => kanjiFreq.has(ch));
  if (chars.length) w.f = chars.reduce((sum, ch) => sum + kanjiFreq.get(ch), 0);
  if (!w.k.length) delete w.k;
  if (!w.es.length) delete w.es;
  if (!w.en.length) delete w.en;
  if (!w.c) delete w.c;
}

const kanji = {};
for (const ch of kanjidic.characters) {
  const m = ch.misc;
  if (!m.grade && !m.jlptLevel && !m.frequency) continue; // fuera de los de uso habitual
  const groups = ch.readingMeaning?.groups ?? [];
  const readings = groups.flatMap((g) => g.readings);
  const meanings = groups.flatMap((g) => g.meanings);
  const entry = {
    s: m.strokeCounts[0],
    on: readings.filter((r) => r.type === 'ja_on').map((r) => r.value),
    kun: readings.filter((r) => r.type === 'ja_kun').map((r) => r.value),
    es: meanings.filter((x) => x.lang === 'es').map((x) => x.value).slice(0, 6),
    en: meanings.filter((x) => x.lang === 'en').map((x) => x.value).slice(0, 6),
  };
  if (m.grade) entry.g = m.grade;
  if (m.jlptLevel) entry.j = m.jlptLevel; // nivel del JLPT viejo (4 = el más fácil)
  if (m.frequency) entry.f = m.frequency;
  kanji[ch.literal] = entry;
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'words.json'), JSON.stringify({ date: eng.dictDate, words }));
await writeFile(join(OUT, 'kanji.json'), JSON.stringify({ date: kanjidic.dictDate, kanji }));
await writeFile(
  join(OUT, 'LICENSE.txt'),
  `Diccionario de Mnemo\n\nDatos de JMdict y KANJIDIC2 (versión ${eng.dictDate}), © Electronic Dictionary\nResearch and Development Group (EDRDG), usados bajo la licencia Creative Commons\nAttribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).\nhttps://www.edrdg.org/edrdg/licence.html\n\nConvertidos a JSON por jmdict-simplified (https://github.com/scriptin/jmdict-simplified)\ny compactados por scripts/dict-from-jmdict.mjs (se quitaron campos y se combinaron\nlas glosas en inglés y en español). Este archivo derivado se distribuye bajo la\nmisma licencia CC BY-SA 4.0.\n`,
);
console.log(`✔ ${words.length} palabras, ${Object.keys(kanji).length} kanji → public/dict/`);
