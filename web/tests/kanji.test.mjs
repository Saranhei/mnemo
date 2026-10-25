// Listas de kanji (modelo y copias), búsqueda en el diccionario y notas de Kanji de memoria.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uniqueKanji, newKanjiSet, emptyState } from '../public/js/core/model.js';
import { parseImport, stateToBackup } from '../public/js/core/transfer.js';
import { buildIndex, search, posLabels, kanjiIn, formatKun } from '../public/js/core/dictionary.js';

test('Listas de kanji: solo kanji, sin repetir y en orden', () => {
  assert.equal(uniqueKanji('今日は日本語を勉強します。日本!'), '今日本語勉強');
  assert.equal(uniqueKanji('abc ひらがな'), '');
  const set = newKanjiSet({ name: 'Mis kanji', chars: '猫猫犬' }, 1);
  assert.equal(set.chars, '猫犬');
});

test('Listas de kanji: viajan en la copia y se limpian al importar', () => {
  const state = { ...emptyState(), kanjiSets: [newKanjiSet({ name: 'L3', chars: '一二三' }, Date.now())] };
  const text = JSON.stringify(stateToBackup(state, Date.now()));
  const r = parseImport(text, 'copia.json', text.length);
  assert.equal(r.kind, 'backup');
  assert.equal(r.state.kanjiSets[0].chars, '一二三');

  const evil = JSON.stringify({ app: 'mnemo', type: 'backup', version: 1, kanjiSets: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: '<b>x</b>', chars: '<script>日</script>' + '月'.repeat(10), updatedAt: 1 }] });
  const r2 = parseImport(evil, 'x.json', evil.length);
  assert.equal(r2.state.kanjiSets[0].chars, '日月', 'solo kanji, sin repetir');
});

test('Diccionario: kanji de un texto, categorías y lecturas kun', () => {
  assert.deepEqual(kanjiIn('日本の日本語'), ['日', '本', '語']);
  assert.deepEqual(posLabels(['v1', 'vt']), ['verbo -ru', 'transitivo']);
  assert.deepEqual(posLabels(['adj-i']), ['adjetivo -i']);
  assert.equal(formatKun('ひと.つ'), 'ひと(つ)');
  assert.equal(formatKun('-び'), '〜び');
});

const words = [
  { k: ['猫'], r: ['ねこ'], c: 1, p: ['n'], es: ['gato'], en: ['cat'], f: 1702 },
  { r: ['ジャッキ'], c: 1, p: ['n'], es: ['gato (elevador de automóviles)'], en: ['jack'] },
  { k: ['食べる'], r: ['たべる'], c: 1, p: ['v1', 'vt'], es: ['comer'], en: ['to eat'], f: 400 },
  { k: ['先生'], r: ['せんせい'], c: 1, p: ['n'], es: ['maestro; profesor'], en: ['teacher'], f: 202 },
  { k: ['先制'], r: ['せんせい'], c: 1, p: ['n'], es: ['anticipación'], en: ['initiative'], f: 281 },
  { k: ['犬'], r: ['いぬ'], c: 1, p: ['n'], es: ['perro'], en: ['dog (Canis (lupus) familiaris)'], f: 1300 },
];

test('Diccionario: busca en kanji, kana, romaji y significado', () => {
  const index = buildIndex(words);
  const first = (q) => search(index, q)[0]?.k?.[0] ?? search(index, q)[0]?.r[0];
  assert.equal(first('猫'), '猫');
  assert.equal(first('たべ'), '食べる', 'prefijo en kana');
  assert.equal(first('taberu'), '食べる', 'romaji');
  assert.equal(first('タベル'), '食べる', 'katakana');
  assert.equal(first('comer'), '食べる', 'significado en español');
  assert.equal(first('to eat'), '食べる', 'significado en inglés');
  assert.equal(first('dog'), '犬', 'paréntesis anidados en la glosa');
  assert.equal(first('gato'), '猫', 'la palabra con kanji antes que el préstamo en katakana');
  assert.equal(first('sensei'), '先生', 'desempate por frecuencia de los kanji');
  assert.equal(search(index, 'zzzz').length, 0);
});

test('Diccionario real: los datos generados cargan y encuentran palabras básicas', { skip: !safeRead('public/dict/words.json') }, () => {
  const data = JSON.parse(readFileSync('public/dict/words.json', 'utf8'));
  const index = buildIndex(data.words);
  for (const [q, expected] of [['comer', '食べる'], ['escuela', '学校'], ['gakkou', '学校'], ['perro', '犬'], ['ともだち', '友達']]) {
    assert.ok(search(index, q).slice(0, 3).some((w) => w.k?.[0] === expected), `${q} → ${expected}`);
  }
  const kanji = JSON.parse(readFileSync('public/dict/kanji.json', 'utf8')).kanji;
  assert.ok(kanji['日'].es.includes('día'));
  assert.ok(Object.keys(kanji).length > 2000);
});

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8').length > 0;
  } catch {
    return false;
  }
}
