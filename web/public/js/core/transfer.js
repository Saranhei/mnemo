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
import { KINDS, GENDERS, newDeck, newCard } from './model.js';
import { INITIAL_EASE } from './sm2.js';

export const LIMITS = Object.freeze({
  deckFileBytes: 5 * 1024 * 1024,
  backupFileBytes: 25 * 1024 * 1024,
  cardsPerDeck: 20_000,
  cardsPerBackup: 60_000,
  decksPerBackup: 2_000,
  sessionsPerBackup: 20_000,
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
  if (byteSize > LIMITS.backupFileBytes) throw errors.tooLarge();

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw errors.invalid();
  }
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
  if (cardsIn.length > LIMITS.cardsPerBackup) throw errors.tooMany(LIMITS.cardsPerBackup);
  if (decksIn.length > LIMITS.decksPerBackup || sessionsIn.length > LIMITS.sessionsPerBackup) throw errors.invalid();

  const now = Date.now();
  const decks = decksIn.map((d) => sanitizeRecord(d, now, sanitizeDeckRecord)).filter(Boolean);
  const cards = cardsIn.map((c) => sanitizeRecord(c, now, sanitizeCardRecord)).filter(Boolean);
  const sessions = sessionsIn.map((s) => sanitizeRecord(s, now, sanitizeSessionRecord)).filter(Boolean);
  if (decks.length + cards.length + sessions.length === 0) throw errors.empty();
  return { decks, cards, sessions };
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
