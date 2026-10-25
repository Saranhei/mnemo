// Pruebas de la lógica de práctica: romaji, corrección de respuestas, trazos e ítems.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  romajiToHiragana, japaneseKey, matchesAnswer, answerVariants, HIRAGANA, KATAKANA, HIRAGANA_DAKUTEN, kataToHira,
} from '../public/js/core/japanese.js';
import { resample, compareStroke, strokeLength } from '../public/js/core/strokes.js';
import { itemsFromCards, parseKanjiExamples, acceptedForms, pickDistractors, charactersFromCards } from '../public/js/core/practice.js';

// ─────────────────────────── Kana y romaji ───────────────────────────

test('Tablas: 46 kana básicos y 25 con tenten/maru en cada silabario', () => {
  assert.equal(HIRAGANA.length, 46);
  assert.equal(KATAKANA.length, 46);
  assert.equal(HIRAGANA_DAKUTEN.length, 25);
  assert.equal(KATAKANA[0].char, 'ア');
});

test('Romaji → hiragana (Hepburn, teclado, dobles, ん)', () => {
  const cases = {
    neko: 'ねこ', shinbun: 'しんぶん', sinbun: 'しんぶん', gakkou: 'がっこう', kitte: 'きって',
    konnichiha: 'こんにちは', "kin'en": 'きんえん', ryokou: 'りょこう', chotto: 'ちょっと',
    matcha: 'まっちゃ', tsukue: 'つくえ', 'ko-hi-': 'こーひー', hon: 'ほん', densha: 'でんしゃ',
  };
  for (const [r, h] of Object.entries(cases)) assert.equal(romajiToHiragana(r), h, r);
});

test('Clave japonesa: katakana, romaji y vocales largas se unifican', () => {
  assert.equal(japaneseKey('コーヒー'), japaneseKey('koohii'));
  assert.equal(japaneseKey('せんせい'), japaneseKey('sensee'));
  assert.equal(japaneseKey('とうきょう'), japaneseKey('tookyoo'));
  assert.equal(japaneseKey('ねこ。'), japaneseKey(' ネコ '));
  assert.equal(kataToHira('ジーンズ'), 'じーんず');
});

test('Respuestas: variantes con paréntesis, varios significados y 〜', () => {
  assert.deepEqual(answerVariants('すき（な）').sort(), ['すき', 'すきな'].sort());
  assert.ok(matchesAnswer('suki', ['すき（な）']));
  assert.ok(matchesAnswer('すきな', ['すき（な）']));
  assert.ok(matchesAnswer('watashi wa gakusei desu', ['わたしはがくせいです']), 'partícula wa en romaji');
  assert.ok(matchesAnswer('wa', ['は']));
  assert.ok(!matchesAnswer('wa', ['わ', 'を'].slice(1)));
  assert.ok(matchesAnswer('Comer', ['comer; tomar']));
  assert.ok(matchesAnswer('tomar', ['comer; tomar']));
  assert.ok(matchesAnswer('estación', ['estacion']));
  assert.ok(matchesAnswer('1時', ['一時']));
  assert.ok(!matchesAnswer('いぬ', ['ねこ']));
  assert.ok(!matchesAnswer('', ['ねこ']));
});

// ─────────────────────────── Trazos ───────────────────────────

const line = (x1, y1, x2, y2, n = 20) =>
  Array.from({ length: n }, (_, i) => ({ x: x1 + ((x2 - x1) * i) / (n - 1), y: y1 + ((y2 - y1) * i) / (n - 1) }));
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (pts, amount) => pts.map((p) => ({ x: p.x + (rand() - 0.5) * 2 * amount, y: p.y + (rand() - 0.5) * 2 * amount }));

test('Trazos: re-muestreo uniforme conserva largo y extremos', () => {
  const r = resample(line(0, 0, 100, 0, 5), 11);
  assert.equal(r.length, 11);
  assert.equal(Math.round(r[5].x), 50);
  assert.equal(Math.round(strokeLength(r)), 100);
});

test('Trazos: acepta un trazo parecido aunque tiemble', () => {
  const ref = line(20, 30, 90, 30);
  assert.ok(compareStroke(jitter(line(22, 33, 88, 31), 3), ref).ok);
});

test('Trazos: rechaza un trazo en otro lugar, al revés o de otra forma', () => {
  const ref = line(20, 30, 90, 30);
  assert.equal(compareStroke(line(20, 75, 90, 75), ref).ok, false, 'lejos');
  const rev = compareStroke(line(90, 30, 20, 30), ref);
  assert.equal(rev.ok, false);
  assert.equal(rev.reversed, true, 'detecta la dirección contraria');
  assert.equal(compareStroke(line(55, 10, 55, 100), ref).ok, false, 'vertical en vez de horizontal');
  assert.equal(compareStroke(line(20, 30, 40, 30), ref).ok, false, 'demasiado corto');
});

test('Trazos: puntos cortos (como en ふ o ゛) son tolerantes', () => {
  const ref = line(50, 50, 54, 57, 5);
  assert.ok(compareStroke(line(48, 49, 55, 58, 5), ref).ok);
  assert.equal(compareStroke(line(80, 80, 84, 87, 5), ref).ok, false);
});

// ─────────────────────────── Ítems de práctica ───────────────────────────

const genkiNoun = { id: 'a', kind: 'noun', front: 'かぞく', back: 'familia', pronunciation: 'kazoku · 家族', example: '' };
const genkiDup = { id: 'b', kind: 'adjective', front: 'あつい（暑い）', back: 'caluroso', pronunciation: 'atsui · 暑い', example: '' };
const userKanjiFront = { id: 'c', kind: 'noun', front: '猫', back: 'gato', pronunciation: 'ねこ', example: '' };
const nanNani = { id: 'd', kind: 'other', front: 'なん／なに', back: 'qué', pronunciation: 'nan/nani · 何', example: '' };
const kanjiCard = { id: 'e', kind: 'character', front: '一', back: 'uno', pronunciation: '', example: '一時 (いちじ) la una · 一つ (ひとつ) uno' };

test('Ítems: tarjetas de vocabulario, de kanji y creadas a mano', () => {
  const items = itemsFromCards([genkiNoun, genkiDup, userKanjiFront, nanNani, kanjiCard]);
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual(by.a.readings, ['かぞく']);
  assert.equal(by.a.kanji, '家族');
  assert.deepEqual(by.b.readings, ['あつい']);
  assert.equal(by.c.kanji, '猫');
  assert.deepEqual(by.c.readings, ['ねこ']);
  assert.deepEqual(by.d.readings, ['なん', 'なに']);
  assert.equal(by['e:0'].display, '一時');
  assert.deepEqual(by['e:1'].readings, ['ひとつ']);
  assert.ok(matchesAnswer('kazoku', acceptedForms(by.a)));
  assert.ok(matchesAnswer('家族', acceptedForms(by.a)));
});

test('Ítems: ejemplos de kanji, distractores y caracteres de un mazo', () => {
  assert.equal(parseKanjiExamples('日本 (にほん) Japón · 二日 (ふつか) el día dos').length, 2);
  const items = itemsFromCards([genkiNoun, genkiDup, userKanjiFront, nanNani]);
  const d = pickDistractors(items, items[0], 3, () => 0.3);
  assert.equal(d.length, 3);
  assert.ok(d.every((x) => x.meaning !== items[0].meaning));
  assert.deepEqual(charactersFromCards([userKanjiFront, kanjiCard, { front: '時々' }]).sort(), ['一', '時', '猫'].sort());
});

// ─────────────────────────── Cuestionarios ───────────────────────────
import { parseQuestionsText, parseImport, stateToBackup, sanitizeQuestions } from '../public/js/core/transfer.js';
import { newQuiz, mergeStates, emptyState } from '../public/js/core/model.js';

test('Cuestionarios: texto con TAB, varias respuestas y nota', () => {
  const qs = parseQuestionsText('# Lección 3\n¿Cómo se dice "comer"?\tたべる / taberu\tVerbo -ru\nsin respuesta\t\n');
  assert.equal(qs.length, 1);
  assert.deepEqual(qs[0].answers, ['たべる', 'taberu']);
  assert.equal(qs[0].note, 'Verbo -ru');
  assert.throws(() => parseQuestionsText('# nada'), /No encontré preguntas/);
});

test('Cuestionarios: viajan en la copia y se limpian', () => {
  const quiz = newQuiz({ name: 'L3', questions: [{ prompt: '¿Hoy?', answers: ['きょう'], note: '' }] }, Date.now());
  const backup = stateToBackup({ ...emptyState(), quizzes: [quiz, { id: '../x', name: 'malo', questions: [] }] }, Date.now());
  const r = parseImport(JSON.stringify(backup), 'copia.json');
  assert.equal(r.state.quizzes.length, 1);
  assert.equal(mergeStates(emptyState(), r.state).added, 1);
  assert.equal(sanitizeQuestions([{ prompt: 'x', answers: ['a'.repeat(500)] }])[0].answers[0].length, 200);
});
