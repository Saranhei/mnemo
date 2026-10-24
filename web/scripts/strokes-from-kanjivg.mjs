// Genera los datos de trazos de la app a partir de KanjiVG.
//
//   git clone --depth 1 https://github.com/KanjiVG/kanjivg.git /tmp/kanjivg
//   node scripts/strokes-from-kanjivg.mjs /tmp/kanjivg
//
// Salida: public/strokes/<bloque>.json, un archivo por cada bloque de 256 códigos
// Unicode (030.json = kana, 4e0.json, 4e1.json... = kanji). Cada archivo es
// { "猫": ["M...", "M...", ...] } con los trazos en orden.
//
// Los datos de KanjiVG son © Ulrich Apel y colaboradores, licencia CC BY-SA 3.0.
// Los archivos generados mantienen esa licencia (ver public/strokes/LICENSE.txt).

import { readdir, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Uso: node scripts/strokes-from-kanjivg.mjs <carpeta de kanjivg>');
  process.exit(1);
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'strokes');

const wanted = (cp) =>
  (cp >= 0x3041 && cp <= 0x3096) || // hiragana
  (cp >= 0x30a1 && cp <= 0x30fa) || // katakana
  cp === 0x30fc || // ー
  cp === 0x3005 || // 々
  (cp >= 0x4e00 && cp <= 0x9fff); // kanji

const blocks = new Map();
let count = 0;
for (const file of await readdir(join(source, 'kanji'))) {
  const m = file.match(/^([0-9a-f]{5})\.svg$/); // sin variantes (-Kaisho, etc.)
  if (!m) continue;
  const cp = parseInt(m[1], 16);
  if (!wanted(cp)) continue;
  const svg = await readFile(join(source, 'kanji', file), 'utf8');
  const strokes = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((x) => x[1].replace(/\s+/g, ' ').trim());
  if (strokes.length === 0) continue;
  const block = (cp >> 8).toString(16).padStart(3, '0');
  if (!blocks.has(block)) blocks.set(block, {});
  blocks.get(block)[String.fromCodePoint(cp)] = strokes;
  count += 1;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
let bytes = 0;
for (const [block, data] of [...blocks].sort()) {
  const json = JSON.stringify(data);
  bytes += json.length;
  await writeFile(join(OUT, `${block}.json`), json);
}
await copyFile(join(source, 'COPYING'), join(OUT, 'LICENSE.txt'));
console.log(`✔ ${count} caracteres en ${blocks.size} archivos (${(bytes / 1024 / 1024).toFixed(1)} MB) → public/strokes/`);
