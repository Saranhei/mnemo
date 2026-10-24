// Tests de la lógica (sin navegador). Correr con:  npm test   (o  node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { schedule, formatInterval, previewLabel, DAY, DEFAULTS } from '../public/js/core/sm2.js';
import * as P from '../public/js/core/pomodoro.js';
import { clean, stripHTML, fileSafeName, MAX_FIELD } from '../public/js/core/sanitize.js';
import {
  newCard, newDeck, emptyState, dueCards, mergeStates, purgeTombstones, tombstone, forecast, activeSession, newSession,
} from '../public/js/core/model.js';
import {
  parseImport, parseTabSeparated, sanitizeDeckExport, stateToBackup, deckToExport, insertDeckExport, TransferError,
} from '../public/js/core/transfer.js';

const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);
const fresh = { intervalDays: 0, ease: 2.5, repetitions: 0, lapses: 0, dueAt: NOW };

// ───────────────────────────── SM-2 ─────────────────────────────

test('SM-2: "Bien" en una tarjeta nueva la programa para mañana', () => {
  const next = schedule(fresh, 'good', NOW);
  assert.equal(next.intervalDays, 1);
  assert.equal(next.repetitions, 1);
  assert.equal(next.dueAt, NOW + DAY);
  assert.equal(next.ease, 2.5);
});

test('SM-2: "Bien" sucesivo → 1, 6, 15 días', () => {
  const a = schedule(fresh, 'good', NOW);
  const b = schedule(a, 'good', NOW);
  const c = schedule(b, 'good', NOW);
  assert.deepEqual([a.intervalDays, b.intervalDays, c.intervalDays], [1, 6, 15]);
});

test('SM-2: "Otra vez" reinicia y la muestra en 10 minutos', () => {
  const learned = schedule(schedule(fresh, 'good', NOW), 'good', NOW);
  const failed = schedule(learned, 'again', NOW);
  assert.equal(failed.repetitions, 0);
  assert.equal(failed.lapses, 1);
  assert.equal(failed.ease, 2.3);
  assert.equal(failed.dueAt, NOW + 10 * 60_000);
});

test('SM-2: la facilidad nunca baja de 1.3', () => {
  let s = fresh;
  for (let i = 0; i < 20; i++) s = schedule(s, 'again', NOW);
  assert.equal(s.ease, 1.3);
});

test('SM-2: "Fácil" avanza más que "Bien"', () => {
  const good = schedule(fresh, 'good', NOW);
  const easy = schedule(fresh, 'easy', NOW);
  assert.ok(easy.intervalDays > good.intervalDays);
  assert.ok(easy.ease > good.ease);
});

test('SM-2: el intervalo tiene tope de 10 años', () => {
  const huge = { intervalDays: 3000, ease: 3, repetitions: 10, lapses: 0, dueAt: NOW };
  assert.equal(schedule(huge, 'easy', NOW).intervalDays, DEFAULTS.maximumIntervalDays);
});

test('SM-2: etiquetas de intervalo en español', () => {
  assert.equal(formatInterval(10 * 60_000), '10 min');
  assert.equal(formatInterval(3 * 3_600_000), '3 h');
  assert.equal(formatInterval(DAY), '1 d');
  assert.equal(formatInterval(30 * DAY), '1 mes');
  assert.equal(formatInterval(60 * DAY), '2 meses');
  assert.equal(formatInterval(547 * DAY), '1,5 años');
  assert.equal(previewLabel(fresh, 'again', NOW), '10 min');
});

test('SM-2: calificación inválida falla', () => {
  assert.throws(() => schedule(fresh, 'genial', NOW));
});

// ─────────────────────────── Pomodoro ───────────────────────────

const D = { focusMin: 1, shortMin: 0.5, longMin: 2, cycles: 2 }; // 60 s, 30 s, 120 s

test('Pomodoro: el restante sale de la hora de fin', () => {
  const s = P.start(P.initialState(), NOW, D);
  assert.equal(P.remaining(s, NOW + 20_000, D), 40_000);
  assert.equal(P.progress(s, NOW + 30_000, D), 0.5);
});

test('Pomodoro: pausar congela el restante y seguir lo retoma', () => {
  let s = P.start(P.initialState(), NOW, D);
  s = P.pause(s, NOW + 15_000);
  assert.ok(P.isPaused(s));
  assert.equal(P.remaining(s, NOW + 999_999, D), 45_000);
  s = P.start(s, NOW + 100_000, D);
  assert.equal(P.remaining(s, NOW + 110_000, D), 35_000);
});

test('Pomodoro: foco → descanso corto → foco → descanso largo', () => {
  let s = P.start(P.initialState(), NOW, D);
  let r = P.tick(s, NOW + 60_000, D);
  assert.equal(r.finished, 'focus');
  assert.equal(r.state.phase, 'shortBreak');
  assert.equal(r.state.completedFocus, 1);

  s = P.start(r.state, NOW, D);
  r = P.tick(s, NOW + 30_000, D);
  assert.equal(r.state.phase, 'focus');

  s = P.start(r.state, NOW, D);
  r = P.tick(s, NOW + 60_000, D);
  assert.equal(r.state.phase, 'longBreak');
  assert.equal(r.state.completedFocus, 2);
});

test('Pomodoro: no termina antes de tiempo; saltar no cuenta', () => {
  const s = P.start(P.initialState(), NOW, D);
  assert.equal(P.tick(s, NOW + 59_000, D).finished, null);
  const skipped = P.skip(P.initialState(), D);
  assert.equal(skipped.phase, 'shortBreak');
  assert.equal(skipped.completedFocus, 0);
});

test('Pomodoro: restaurar descarta datos corruptos', () => {
  assert.deepEqual(P.restore({ phase: 'hackeado', endAt: 5 }), P.initialState());
  assert.equal(P.restore({ phase: 'focus', endAt: 'x', completedFocus: -3 }).endAt, null);
  assert.equal(P.formatClock(25 * 60_000), '25:00');
  assert.equal(P.formatClock(61_500), '01:02');
});

// ─────────────────────────── Sanitización ───────────────────────────

test('Sanitización: quita controles y overrides bidi, conserva ZWJ y saltos', () => {
  assert.equal(clean('  hola\u0007‮ mundo \n'), 'hola mundo');
  assert.equal(clean('a\nb'), 'a\nb');
  assert.equal(clean('👩‍💻'), '👩‍💻');
  assert.equal(clean(42), '');
  assert.equal(clean('a'.repeat(5000)).length, MAX_FIELD);
  assert.equal(stripHTML('<b>gato</b><br>felino &amp; más'), 'gato\nfelino & más');
});

test('Sanitización: nombres de archivo seguros', () => {
  assert.equal(fileSafeName('../../etc/passwd'), 'etcpasswd');
  assert.equal(fileSafeName('///'), 'mazo');
  assert.equal(fileSafeName('Japonés N5'), 'Japonés N5');
});

// ─────────────────────────── Modelo ───────────────────────────

test('Modelo: vencidas ordenadas, sin borradas, con tope', () => {
  const st = emptyState();
  const deck = newDeck({ name: 'X', languageCode: 'ja' }, NOW);
  st.decks.push(deck);
  const a = { ...newCard({ deckId: deck.id, front: 'a', back: 'a' }, NOW), dueAt: NOW - 5000 };
  const b = { ...newCard({ deckId: deck.id, front: 'b', back: 'b' }, NOW), dueAt: NOW - 9000 };
  const c = { ...newCard({ deckId: deck.id, front: 'c', back: 'c' }, NOW), dueAt: NOW + DAY };
  const d = { ...newCard({ deckId: deck.id, front: 'd', back: 'd' }, NOW), deleted: true, dueAt: 0 };
  st.cards.push(a, b, c, d);
  assert.deepEqual(dueCards(st, deck.id, NOW).map((x) => x.front), ['b', 'a']);
  assert.equal(dueCards(st, deck.id, NOW, 1).length, 1);
  const f = forecast(st, deck.id, NOW, 7);
  assert.equal(f[0], 2);
  assert.equal(f.reduce((x, y) => x + y, 0), 3);
});

test('Modelo: la sesión activa es la abierta más reciente', () => {
  const st = emptyState();
  const old = newSession(NOW - 1000);
  const recent = newSession(NOW);
  const closed = { ...newSession(NOW + 1), endedAt: NOW + 2 };
  st.sessions.push(old, recent, closed);
  assert.equal(activeSession(st).id, recent.id);
});

test('Sincronización: gana el más nuevo y los borrados viajan', () => {
  const deck = newDeck({ name: 'Mazo', languageCode: 'de' }, NOW);
  const card = newCard({ deckId: deck.id, front: 'Hund', back: 'perro' }, NOW);
  const local = { decks: [deck], cards: [card], sessions: [] };

  const editedThere = { ...card, back: 'perro (m)', updatedAt: NOW + 10 };
  const newThere = newCard({ deckId: deck.id, front: 'Katze', back: 'gato' }, NOW + 5);
  const deckDeletedEarlier = { ...tombstone(deck, NOW - 10) };
  const incoming = { decks: [deckDeletedEarlier], cards: [editedThere, newThere], sessions: [] };

  const { state, added, updated } = mergeStates(local, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.equal(state.cards.find((c) => c.id === card.id).back, 'perro (m)');
  assert.equal(state.decks[0].deleted, undefined, 'el borrado viejo no pisa el mazo más nuevo');

  const laterDelete = { decks: [tombstone(deck, NOW + 100)], cards: [], sessions: [] };
  assert.equal(mergeStates(state, laterDelete).state.decks[0].deleted, true);
});

test('Sincronización: combinar dos veces no cambia nada (idempotente)', () => {
  const deck = newDeck({ name: 'M', languageCode: 'ko' }, NOW);
  const a = { decks: [deck], cards: [], sessions: [] };
  const once = mergeStates(a, a);
  assert.equal(once.added + once.updated, 0);
});

test('Sincronización: limpia lápidas viejas', () => {
  const st = { decks: [{ id: 'a', deleted: true, updatedAt: NOW - 400 * DAY }, { id: 'b', deleted: true, updatedAt: NOW }], cards: [], sessions: [] };
  assert.deepEqual(purgeTombstones(st, NOW).decks.map((d) => d.id), ['b']);
});

// ─────────────────────────── Importación ───────────────────────────

test('Importación: formato de texto de Anki', () => {
  const text = '#separator:tab\n#html:true\n犬\tperro\tinu\n猫\t<b>gato</b><br>felino\nlínea sin tab\n';
  const deck = parseTabSeparated(text, 'Japonés');
  assert.equal(deck.cards.length, 2);
  assert.equal(deck.cards[0].pronunciation, 'inu');
  assert.equal(deck.cards[1].back, 'gato\nfelino');
});

test('Importación: un mazo exportado por la app nativa', () => {
  const json = JSON.stringify({
    version: 1, name: 'Alemán', languageCode: 'de',
    cards: [{ front: 'Hund', back: 'perro', pronunciation: '', example: '', kind: 'noun', gender: 'masculine' }],
  });
  const r = parseImport(json, 'Aleman.mnemo.json');
  assert.equal(r.kind, 'deck');
  assert.equal(r.deck.cards[0].gender, 'masculine');
});

test('Importación: limpia campos, descarta vacías y valores desconocidos', () => {
  const r = sanitizeDeckExport({
    version: 1, name: '  Mazo\u0007 ', languageCode: 'ja<script>',
    cards: [
      { front: ' 猫 ', back: 'x'.repeat(4000), kind: 'inventado', gender: 'otro' },
      { front: '   ', back: 'vacía' },
      'basura',
    ],
  });
  assert.equal(r.name, 'Mazo');
  assert.equal(r.languageCode, 'en');
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].front, '猫');
  assert.equal(r.cards[0].back.length, MAX_FIELD);
  assert.equal(r.cards[0].kind, 'other');
  assert.equal(r.cards[0].gender, null);
});

test('Importación: rechaza basura, versiones futuras, tipos raros y vacíos', () => {
  assert.throws(() => parseImport('no soy json', 'a.json'), TransferError);
  assert.throws(() => parseImport(JSON.stringify({ version: 99, name: 'x', cards: [{ front: 'a', back: 'b' }] }), 'a.json'), /versión más nueva/);
  assert.throws(() => parseImport('x', 'virus.exe'), /no soportado/);
  assert.throws(() => parseTabSeparated('#solo encabezado', 'x'), /no contiene/);
  assert.throws(() => parseImport('x', 'a.txt', 6 * 1024 * 1024), /demasiado grande/);
});

test('Importación: copia completa con ids y números maliciosos', () => {
  const deck = newDeck({ name: 'M', languageCode: 'es' }, NOW);
  const card = newCard({ deckId: deck.id, front: 'a', back: 'b' }, NOW);
  const backup = stateToBackup({ decks: [deck], cards: [card], sessions: [] }, NOW);
  backup.cards.push({ ...card, id: '../../x' });
  backup.cards.push({ ...card, id: 'ok-2', ease: 1e9, intervalDays: -5, dueAt: 'mañana' });
  const r = parseImport(JSON.stringify(backup), 'copia.json');
  assert.equal(r.kind, 'backup');
  assert.equal(r.state.cards.length, 2, 'descarta el id con caracteres de ruta');
  const weird = r.state.cards.find((c) => c.id === 'ok-2');
  assert.equal(weird.ease, 5);
  assert.equal(weird.intervalDays, 0);
  assert.equal(typeof weird.dueAt, 'number');
});

test('Exportación: ida y vuelta de un mazo conserva el contenido', () => {
  const st = emptyState();
  const id = insertDeckExport(st, { name: 'Coreano', languageCode: 'ko', cards: [{ front: '안녕', back: 'hola', pronunciation: 'annyeong', example: '', kind: 'phrase', gender: null }] }, NOW);
  const exp = deckToExport(st, id);
  const again = sanitizeDeckExport(JSON.parse(JSON.stringify(exp)));
  assert.deepEqual(again, exp);
});
