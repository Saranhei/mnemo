// Pruebas de los ejercicios de listening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clozeParts, plainTranscript, sentences, compareDictation, comparableChars } from '../public/js/core/listening.js';
import { parseImport, stateToBackup } from '../public/js/core/transfer.js';
import { emptyState, newListening, mergeStates } from '../public/js/core/model.js';

const blanks = (parts) => parts.filter((p) => p.blank);

test('Completar: palabras marcadas entre corchetes, con alternativas', () => {
  const parts = clozeParts('わたしは[がくせい|学生]です。[まいにち]べんきょうします。');
  assert.equal(blanks(parts).length, 2);
  assert.deepEqual(blanks(parts)[0].blank.answers, ['がくせい', '学生']);
  assert.equal(parts[0].text, 'わたしは');
  assert.equal(plainTranscript('わたしは[がくせい|学生]です'), 'わたしはがくせいです');
});

test('Completar: sin marcas, más espacios cuanto más difícil', () => {
  const t = '先週の週末、友だちと京都へ行きました。土曜日の朝、新幹線に乗りました。京都でお寺を見て、写真をたくさん撮りました。';
  const easy = blanks(clozeParts(t, 'easy')).length;
  const medium = blanks(clozeParts(t, 'medium')).length;
  const hard = blanks(clozeParts(t, 'hard')).length;
  assert.ok(easy >= 1 && easy < medium && medium < hard, `${easy} < ${medium} < ${hard}`);
  // El texto reconstruido es el original.
  const rebuilt = clozeParts(t, 'hard').map((p) => p.text ?? p.blank.answers[0]).join('');
  assert.equal(rebuilt, t);
});

test('Frases: corta en 。！？ y saltos de línea', () => {
  assert.deepEqual(sentences('おはよう。げんき？\nはい！'), ['おはよう。', 'げんき？', 'はい！']);
});

test('Dictado: kana, katakana y romaji cuentan igual; vocales largas', () => {
  assert.equal(comparableChars('コーヒー').map((c) => c.ch).join(''), comparableChars('こおひい').map((c) => c.ch).join(''));
  const r = compareDictation('watashi wa gakusee desu', ['わたしはがくせいです。']);
  assert.equal(Math.round(r.score * 100), 100);
});

test('Dictado: marca lo que faltó y usa la lectura si es mejor', () => {
  const r = compareDictation('わたしはです', ['わたしはがくせいです']);
  assert.ok(r.score > 0.5 && r.score < 0.8);
  assert.equal(r.marks.filter((m) => m === false).length, 4); // がくせい
  const k = compareDictation('きょうとへいきました', ['京都へ行きました', 'きょうとへいきました']);
  assert.equal(k.score, 1);
  assert.equal(k.reference, 'きょうとへいきました');
});

test('Dictado: escribir de más no da 100 %', () => {
  const r = compareDictation('あいうえおかきくけこさしすせそ', ['あいうえお']);
  assert.ok(r.score < 1);
});

test('Listening: viaja en la copia (sin el audio) y se limpia', () => {
  const l = newListening({ title: 'Mi día', transcript: 'わたしは[がくせい]です', level: 'easy', language: 'ja', questions: [{ prompt: '¿?', answers: ['はい'], note: '' }] }, Date.now());
  l.mediaId = 'abc-123';
  const backup = stateToBackup({ ...emptyState(), listenings: [l, { id: 'x y', title: '' }] }, Date.now());
  const r = parseImport(JSON.stringify(backup), 'copia.json');
  assert.equal(r.state.listenings.length, 1);
  assert.equal(r.state.listenings[0].level, 'easy');
  assert.equal(mergeStates(emptyState(), r.state).added, 1);
});

test('Listening: archivo de ejercicio con audio', () => {
  const file = {
    app: 'mnemo', type: 'listening', version: 1,
    listening: { title: 'Prueba', level: 'hard', language: 'ja', transcript: 'こんにちは', reading: '', note: '', questions: [] },
    media: { name: 'a.mp3', type: 'audio/mpeg', data: Buffer.from('ID3fake').toString('base64') },
  };
  const r = parseImport(JSON.stringify(file), 'prueba.mnemo-listening.json');
  assert.equal(r.kind, 'listening');
  assert.equal(r.listening.title, 'Prueba');
  assert.equal(r.media.type, 'audio/mpeg');
  const bad = { ...file, media: { ...file.media, type: 'text/html' } };
  assert.equal(parseImport(JSON.stringify(bad), 'x.json').media, null, 'descarta tipos que no son audio/video');
});
