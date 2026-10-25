// Importación y exportación.
//
// Formatos:
// - Mazo (.json): el mismo que exporta la app nativa de iPhone/iPad/Mac
//   `{ version, name, languageCode, cards: [{front, back, pronunciation, example, kind, gender}] }`.
//   Solo palabras, sin progreso: quien lo importa empieza de cero.
// - Copia completa (.json): `{ app: "mnemo", type: "backup", version, exportedAt, decks, cards, sessions }`.
//   Incluye progreso y sesiones. Se usa para pasar todo de un dispositivo a otro:
//   al importarla se COMBINA con lo que ya hay (ver mergeStates).
// - Anki (.txt/.tsv): "Exportar notas como texto plano", una tarjeta por línea,
//   `frente<TAB>reverso[<TAB>pronunciación<TAB>ejemplo]`. Las líneas con `#` se ignoran.
//
// Todo lo importado se trata como NO CONFIABLE: se limitan tamaños y cantidades,
// se validan ids, números y fechas, y se limpia cada texto.

import { clean, stripHTML, isValidId, clampNumber, clampDate, MAX_NAME, fileSafeName } from './sanitize.js';
import { KINDS, GENDERS, newDeck, newCard, uniqueKanji } from './model.js';
import { INITIAL_EASE } from './sm2.js';

export const LIMITS = Object.freeze({
  deckFileBytes: 5 * 1024 * 1024,
  backupFileBytes: 25 * 1024 * 1024,
  cardsPerDeck: 20_000,
  cardsPerBackup: 60_000,
  decksPerBackup: 2_000,
  sessionsPerBackup: 20_000,
  quizzesPerBackup: 2_000,
  listeningsPerBackup: 2_000,
  kanjiSetsPerBackup: 1_000,
  kanjiPerSet: 3_000,
  listeningFileBytes: 90 * 1024 * 1024,
  mediaBytes: 60 * 1024 * 1024,
  transcriptChars: 20_000,
  questionsPerQuiz: 2_000,
  answersPerQuestion: 20,
});

export const DECK_FORMAT_VERSION = 1;
export const BACKUP_FORMAT_VERSION = 1;

export class TransferError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const errors = {
  tooLarge: () => new TransferError('tooLarge', 'El archivo es demasiado grande.'),
  invalid: () => new TransferError('invalid', 'El archivo no tiene un formato válido.'),
  empty: () => new TransferError('empty', 'El archivo no contiene tarjetas.'),
  tooMany: (max) =>
    new TransferError('tooMany', `El archivo tiene demasiadas tarjetas (máximo ${max.toLocaleString('es-AR')}).`),
  version: (v) => new TransferError('version', `El archivo es de una versión más nueva de Mnemo (v${v}).`),
  type: () =>
    new TransferError('type', 'Tipo de archivo no soportado. Usá .json (de Mnemo) o .txt/.tsv exportado de Anki.'),
};

// ───────────────────────────── Importar ─────────────────────────────

/**
 * Interpreta el contenido de un archivo elegido por el usuario.
 * @returns {{kind:'deck', deck:object} | {kind:'backup', state:object}}
 */
export function parseImport(text, filename, byteSize = text.length) {
  const ext = String(filename).toLowerCase().split('.').pop();
  if (ext === 'txt' || ext === 'tsv') {
    if (byteSize > LIMITS.deckFileBytes) throw errors.tooLarge();
    const base = String(filename).replace(/\.(txt|tsv)$/i, '');
    return { kind: 'deck', deck: parseTabSeparated(text, base) };
  }
  if (ext !== 'json') throw errors.type();
  if (byteSize > LIMITS.listeningFileBytes) throw errors.tooLarge();

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw errors.invalid();
  }
  if (raw && raw.app === 'mnemo' && raw.type === 'listening') {
    return { kind: 'listening', ...sanitizeListeningFile(raw) };
  }
  if (byteSize > LIMITS.backupFileBytes) throw errors.tooLarge();
  if (raw && raw.app === 'mnemo' && raw.type === 'backup') {
    return { kind: 'backup', state: sanitizeBackup(raw) };
  }
  if (byteSize > LIMITS.deckFileBytes) throw errors.tooLarge();
  return { kind: 'deck', deck: sanitizeDeckExport(raw) };
}

export function parseTabSeparated(text, deckName) {
  const cards = [];
  for (const line of String(text).split(/\r\n|\n|\r/)) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t').map(stripHTML);
    if (cols.length < 2) continue;
    cards.push({
      front: cols[0],
      back: cols[1],
      pronunciation: cols[2] ?? '',
      example: cols[3] ?? '',
      kind: 'other',
      gender: null,
    });
    if (cards.length > LIMITS.cardsPerDeck) throw errors.tooMany(LIMITS.cardsPerDeck);
  }
  return sanitizeDeckExport({ version: DECK_FORMAT_VERSION, name: deckName, languageCode: 'en', cards });
}

export function sanitizeDeckExport(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) throw errors.invalid();
  const version = typeof raw.version === 'number' ? raw.version : DECK_FORMAT_VERSION;
  if (version > DECK_FORMAT_VERSION) throw errors.version(version);
  if (raw.cards.length > LIMITS.cardsPerDeck) throw errors.tooMany(LIMITS.cardsPerDeck);

  const cards = [];
  for (const c of raw.cards) {
    if (!c || typeof c !== 'object') continue;
    const front = clean(c.front);
    const back = clean(c.back);
    if (!front || !back) continue;
    cards.push({
      front,
      back,
      pronunciation: clean(c.pronunciation),
      example: clean(c.example),
      kind: KINDS.includes(c.kind) ? c.kind : 'other',
      gender: GENDERS.includes(c.gender) ? c.gender : null,
    });
  }
  if (cards.length === 0) throw errors.empty();

  const name = clean(raw.name, MAX_NAME) || 'Mazo importado';
  const languageCode = sanitizeLanguage(raw.languageCode);
  return { version: DECK_FORMAT_VERSION, name, languageCode, cards };
}

export function sanitizeBackup(raw) {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > BACKUP_FORMAT_VERSION) throw errors.version(version);
  const list = (v) => (Array.isArray(v) ? v : []);
  const decksIn = list(raw.decks);
  const cardsIn = list(raw.cards);
  const sessionsIn = list(raw.sessions);
  const quizzesIn = list(raw.quizzes);
  const listeningsIn = list(raw.listenings);
  const kanjiSetsIn = list(raw.kanjiSets);
  if (listeningsIn.length > LIMITS.listeningsPerBackup || kanjiSetsIn.length > LIMITS.kanjiSetsPerBackup) throw errors.invalid();
  if (cardsIn.length > LIMITS.cardsPerBackup) throw errors.tooMany(LIMITS.cardsPerBackup);
  if (decksIn.length > LIMITS.decksPerBackup || sessionsIn.length > LIMITS.sessionsPerBackup || quizzesIn.length > LIMITS.quizzesPerBackup) {
    throw errors.invalid();
  }

  const now = Date.now();
  const decks = decksIn.map((d) => sanitizeRecord(d, now, sanitizeDeckRecord)).filter(Boolean);
  const cards = cardsIn.map((c) => sanitizeRecord(c, now, sanitizeCardRecord)).filter(Boolean);
  const sessions = sessionsIn.map((s) => sanitizeRecord(s, now, sanitizeSessionRecord)).filter(Boolean);
  const quizzes = quizzesIn.map((q) => sanitizeRecord(q, now, sanitizeQuizRecord)).filter(Boolean);
  const listenings = listeningsIn.map((l) => sanitizeRecord(l, now, sanitizeListeningRecord)).filter(Boolean);
  const kanjiSets = kanjiSetsIn.map((k) => sanitizeRecord(k, now, sanitizeKanjiSetRecord)).filter(Boolean);
  if (decks.length + cards.length + sessions.length + quizzes.length + listenings.length + kanjiSets.length === 0) throw errors.empty();
  return { decks, cards, sessions, quizzes, listenings, kanjiSets };
}

function sanitizeKanjiSetRecord(k, updatedAt, now) {
  const name = clean(k.name, MAX_NAME);
  if (!name) return null;
  const chars = [...uniqueKanji(typeof k.chars === 'string' ? k.chars : '')].slice(0, LIMITS.kanjiPerSet).join('');
  return { id: k.id, name, chars, createdAt: clampDate(k.createdAt, now), updatedAt };
}

const LEVEL_IDS = ['easy', 'medium', 'hard'];
const MEDIA_TYPE = /^(audio|video)\/[a-z0-9.+-]{1,40}$/i;

/** Campos de contenido de un ejercicio de listening (sin ids ni archivo). */
function sanitizeListeningContent(l) {
  const title = clean(l.title, MAX_NAME);
  if (!title) return null;
  return {
    title,
    level: LEVEL_IDS.includes(l.level) ? l.level : 'medium',
    language: sanitizeLanguage(l.language ?? 'ja'),
    transcript: clean(l.transcript, LIMITS.transcriptChars),
    reading: clean(l.reading, LIMITS.transcriptChars),
    note: clean(l.note),
    questions: sanitizeQuestions(l.questions),
  };
}

function sanitizeListeningRecord(l, updatedAt, now) {
  const content = sanitizeListeningContent(l);
  if (!content) return null;
  const hasMedia = isValidId(l.mediaId);
  return {
    id: l.id,
    ...content,
    mediaId: hasMedia ? l.mediaId : null,
    mediaName: hasMedia ? clean(l.mediaName, 200) : '',
    mediaType: hasMedia && MEDIA_TYPE.test(l.mediaType ?? '') ? l.mediaType : '',
    example: l.example === true,
    createdAt: clampDate(l.createdAt, now),
    updatedAt,
  };
}

/**
 * Archivo de un ejercicio compartido: { app, type: "listening", version, listening, media }.
 * media = { name, type, data (base64) } o null. Solo se aceptan audio y video.
 */
function sanitizeListeningFile(raw) {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > 1) throw errors.version(version);
  const listening = sanitizeListeningContent(raw.listening ?? {});
  if (!listening) throw errors.invalid();
  const m = raw.media;
  const media =
    m && typeof m === 'object' && typeof m.data === 'string' && MEDIA_TYPE.test(m.type ?? '') && /^[A-Za-z0-9+/=\s]+$/.test(m.data.slice(0, 2000))
      ? { name: clean(m.name, 200) || 'audio', type: m.type, data: m.data }
      : null;
  if (media && media.data.length * 0.75 > LIMITS.mediaBytes) throw errors.tooLarge();
  return { listening, media };
}

export function listeningToFile(listening, media) {
  const { title, level, language, transcript, reading, note, questions } = listening;
  return { app: 'mnemo', type: 'listening', version: 1, listening: { title, level, language, transcript, reading, note, questions }, media };
}

export function listeningFileName(title) {
  return `${fileSafeName(title)}.mnemo-listening.json`;
}

function sanitizeQuizRecord(q, updatedAt, now) {
  const name = clean(q.name, MAX_NAME);
  if (!name) return null;
  return { id: q.id, name, questions: sanitizeQuestions(q.questions), createdAt: clampDate(q.createdAt, now), updatedAt };
}

/** Limpia una lista de preguntas: { prompt, answers[], note }. Descarta las incompletas. */
export function sanitizeQuestions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const q of list.slice(0, LIMITS.questionsPerQuiz)) {
    if (!q || typeof q !== 'object') continue;
    const prompt = clean(q.prompt);
    const answers = (Array.isArray(q.answers) ? q.answers : [])
      .slice(0, LIMITS.answersPerQuestion)
      .map((a) => clean(a, 200))
      .filter((a, i, all) => a && all.indexOf(a) === i);
    if (!prompt || answers.length === 0) continue;
    out.push({ prompt, answers, note: clean(q.note) });
  }
  return out;
}

/**
 * Preguntas en texto: una por línea, `pregunta<TAB>respuesta1 / respuesta2[<TAB>nota]`.
 * Las líneas que empiezan con # se ignoran.
 */
export function parseQuestionsText(text) {
  const rows = [];
  for (const line of String(text).split(/\r\n|\n|\r/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [prompt, answers = '', note = ''] = line.split('\t');
    rows.push({ prompt, answers: answers.split(/\s*[／/]\s*/), note });
    if (rows.length > LIMITS.questionsPerQuiz) throw errors.tooMany(LIMITS.questionsPerQuiz);
  }
  const questions = sanitizeQuestions(rows);
  if (questions.length === 0) throw new TransferError('empty', 'No encontré preguntas. Usá una por línea: pregunta, TAB, respuestas separadas por /.');
  return questions;
}

function sanitizeRecord(r, now, sanitizeLive) {
  if (!r || typeof r !== 'object' || !isValidId(r.id)) return null;
  const updatedAt = clampDate(r.updatedAt, now);
  if (r.deleted === true) return { id: r.id, deleted: true, updatedAt };
  return sanitizeLive(r, updatedAt, now);
}

function sanitizeDeckRecord(d, updatedAt, now) {
  const name = clean(d.name, MAX_NAME);
  if (!name) return null;
  return {
    id: d.id,
    name,
    languageCode: sanitizeLanguage(d.languageCode),
    example: d.example === true,
    createdAt: clampDate(d.createdAt, now),
    updatedAt,
  };
}

function sanitizeCardRecord(c, updatedAt, now) {
  const front = clean(c.front);
  const back = clean(c.back);
  if (!front || !back || !isValidId(c.deckId)) return null;
  return {
    id: c.id,
    deckId: c.deckId,
    sessionId: isValidId(c.sessionId) ? c.sessionId : null,
    front,
    back,
    pronunciation: clean(c.pronunciation),
    example: clean(c.example),
    kind: KINDS.includes(c.kind) ? c.kind : 'other',
    gender: GENDERS.includes(c.gender) ? c.gender : null,
    createdAt: clampDate(c.createdAt, now),
    updatedAt,
    dueAt: clampDate(c.dueAt, now),
    intervalDays: clampNumber(c.intervalDays, 0, 3650, 0),
    ease: clampNumber(c.ease, 1.3, 5, INITIAL_EASE),
    repetitions: Math.floor(clampNumber(c.repetitions, 0, 1e6, 0)),
    lapses: Math.floor(clampNumber(c.lapses, 0, 1e6, 0)),
    lastReviewedAt: c.lastReviewedAt == null ? null : clampDate(c.lastReviewedAt, null),
  };
}

function sanitizeSessionRecord(s, updatedAt, now) {
  return {
    id: s.id,
    startedAt: clampDate(s.startedAt, now),
    endedAt: s.endedAt == null ? null : clampDate(s.endedAt, null),
    pomodoros: Math.floor(clampNumber(s.pomodoros, 0, 10_000, 0)),
    updatedAt,
  };
}

function sanitizeLanguage(code) {
  const c = clean(String(code ?? ''), 20);
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(c) ? c : 'en';
}

/** Agrega un mazo importado (ya validado) como mazo nuevo. Devuelve el id del mazo. */
export function insertDeckExport(state, exp, now) {
  const deck = newDeck({ name: exp.name, languageCode: exp.languageCode }, now);
  state.decks.push(deck);
  exp.cards.forEach((c, i) => state.cards.push(newCard({ ...c, deckId: deck.id }, now + i)));
  return deck.id;
}

// ───────────────────────────── Exportar ─────────────────────────────

export function deckToExport(state, deckId) {
  const deck = state.decks.find((d) => d.id === deckId && !d.deleted);
  if (!deck) throw errors.invalid();
  const cards = state.cards
    .filter((c) => !c.deleted && c.deckId === deckId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(({ front, back, pronunciation, example, kind, gender }) => ({
      front,
      back,
      pronunciation,
      example,
      kind,
      gender,
    }));
  return { version: DECK_FORMAT_VERSION, name: deck.name, languageCode: deck.languageCode, cards };
}

export function stateToBackup(state, now) {
  return {
    app: 'mnemo',
    type: 'backup',
    version: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    decks: state.decks,
    cards: state.cards,
    sessions: state.sessions,
    quizzes: state.quizzes ?? [],
    listenings: state.listenings ?? [],
    kanjiSets: state.kanjiSets ?? [],
  };
}

export function deckFileName(deckName) {
  return `${fileSafeName(deckName)}.mnemo.json`;
}

export function backupFileName(now) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `mnemo-copia-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}
