// Modelo de datos: mazos, tarjetas y sesiones de estudio, más las consultas y la
// combinación de datos entre dispositivos (sincronización por archivo).
//
// Todo registro tiene `id` y `updatedAt`. Al borrar algo no se elimina: se marca
// `deleted: true` (una "lápida"), para que al sincronizar con otro dispositivo el
// borrado también se aplique allá. Las lápidas viejas se limpian solas.

import { INITIAL_EASE, DAY } from './sm2.js';

export const KINDS = Object.freeze(['noun', 'verb', 'adjective', 'phrase', 'character', 'other']);
export const KIND_LABEL = Object.freeze({
  noun: 'Sustantivo',
  verb: 'Verbo',
  adjective: 'Adjetivo',
  phrase: 'Frase',
  character: 'Letra / carácter',
  other: 'Otro',
});

export const GENDERS = Object.freeze(['masculine', 'feminine', 'neuter']);
export const GENDER_LABEL = Object.freeze({ masculine: 'Masculino', feminine: 'Femenino', neuter: 'Neutro' });

export const MAX_REVIEW_BATCH = 200;
export const TOMBSTONE_MAX_AGE = 180 * DAY;

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Colecciones que se guardan y se sincronizan. */
export const COLLECTIONS = Object.freeze(['decks', 'cards', 'sessions', 'quizzes', 'listenings']);

export function emptyState() {
  return { decks: [], cards: [], sessions: [], quizzes: [], listenings: [] };
}

/** Completa colecciones que falten (datos guardados por versiones anteriores). */
export function withAllCollections(state) {
  const out = {};
  for (const key of COLLECTIONS) out[key] = Array.isArray(state?.[key]) ? state[key] : [];
  return out;
}

export function newDeck({ name, languageCode }, now) {
  return { id: newId(), name, languageCode, example: false, createdAt: now, updatedAt: now };
}

export function newCard(fields, now) {
  return {
    id: newId(),
    deckId: fields.deckId,
    sessionId: fields.sessionId ?? null,
    front: fields.front,
    back: fields.back,
    pronunciation: fields.pronunciation ?? '',
    example: fields.example ?? '',
    kind: KINDS.includes(fields.kind) ? fields.kind : 'other',
    gender: GENDERS.includes(fields.gender) ? fields.gender : null,
    createdAt: now,
    updatedAt: now,
    // Repaso: una tarjeta nueva vence en el momento de crearse.
    dueAt: now,
    intervalDays: 0,
    ease: INITIAL_EASE,
    repetitions: 0,
    lapses: 0,
    lastReviewedAt: null,
  };
}

export function newSession(now) {
  return { id: newId(), startedAt: now, endedAt: null, pomodoros: 0, updatedAt: now };
}

/**
 * Cuestionario: preguntas que se responden escribiendo.
 * questions: [{ prompt, answers: string[], note }]
 */
export function newQuiz({ name, questions = [] }, now) {
  return { id: newId(), name, questions, createdAt: now, updatedAt: now };
}

/**
 * Ejercicio de listening: audio o video propio (guardado aparte, en el dispositivo)
 * o, si no hay archivo, la voz del sistema leyendo la transcripción.
 */
export function newListening(fields, now) {
  return {
    id: newId(),
    title: fields.title,
    level: fields.level ?? 'medium',
    language: fields.language ?? 'ja',
    transcript: fields.transcript ?? '',
    reading: fields.reading ?? '',
    note: fields.note ?? '',
    questions: fields.questions ?? [],
    mediaId: null,
    mediaName: '',
    mediaType: '',
    example: fields.example === true,
    createdAt: now,
    updatedAt: now,
  };
}

export function tombstone(record, now) {
  return { id: record.id, deleted: true, updatedAt: now };
}

// ───────────────────────────── Consultas ─────────────────────────────

export const live = (list) => list.filter((r) => !r.deleted);

export function liveDecks(state) {
  return live(state.decks).sort((a, b) => b.createdAt - a.createdAt);
}

export function deckCards(state, deckId) {
  return state.cards.filter((c) => !c.deleted && c.deckId === deckId);
}

/** Tarjetas para repasar ahora, la más atrasada primero (máx. 200 por sesión). */
export function dueCards(state, deckId, now, limit = MAX_REVIEW_BATCH) {
  return deckCards(state, deckId)
    .filter((c) => c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, limit);
}

export function dueCount(state, deckId, now) {
  let n = 0;
  for (const c of state.cards) if (!c.deleted && c.deckId === deckId && c.dueAt <= now) n += 1;
  return n;
}

/** Cuándo vence la próxima tarjeta de un mazo (o null si está vacío). */
export function nextDueAt(state, deckId) {
  let min = null;
  for (const c of deckCards(state, deckId)) if (min === null || c.dueAt < min) min = c.dueAt;
  return min;
}

/** Cantidad de tarjetas que vencen cada día de los próximos `days` (hoy incluye las atrasadas). */
export function forecast(state, deckId, now, days = 7) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const base = startOfToday.getTime();
  const counts = new Array(days).fill(0);
  for (const c of deckCards(state, deckId)) {
    const index = c.dueAt <= now ? 0 : Math.floor((c.dueAt - base) / DAY);
    if (index >= 0 && index < days) counts[index] += 1;
  }
  return counts;
}

/** Proporción de cada tipo de palabra en el mazo (para la barra de colores). */
export function kindMix(state, deckId) {
  const mix = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const c of deckCards(state, deckId)) mix[c.kind] += 1;
  return mix;
}

/** La sesión abierta más reciente (puede venir de otro dispositivo). */
export function activeSession(state) {
  return (
    live(state.sessions)
      .filter((s) => s.endedAt === null)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  );
}

export function sessionCards(state, sessionId) {
  return state.cards
    .filter((c) => !c.deleted && c.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// ───────────────────────── Sincronización ─────────────────────────

/**
 * Combina los datos de otro dispositivo con los locales. Por cada registro gana
 * el que tenga `updatedAt` más nuevo (en empate, el local). Incluye los borrados.
 * @returns {{state: object, added: number, updated: number}}
 */
export function mergeStates(local, incoming) {
  let added = 0;
  let updated = 0;
  const result = {};
  for (const key of COLLECTIONS) {
    const byId = new Map((local[key] ?? []).map((r) => [r.id, r]));
    for (const theirs of incoming[key] ?? []) {
      const mine = byId.get(theirs.id);
      if (!mine) {
        byId.set(theirs.id, theirs);
        if (!theirs.deleted) added += 1;
      } else if (theirs.updatedAt > mine.updatedAt) {
        byId.set(theirs.id, theirs);
        updated += 1;
      }
    }
    result[key] = [...byId.values()];
  }
  return { state: result, added, updated };
}

/** Elimina lápidas más viejas que `maxAge` para que los datos no crezcan sin fin. */
export function purgeTombstones(state, now, maxAge = TOMBSTONE_MAX_AGE) {
  const keep = (r) => !r.deleted || now - r.updatedAt < maxAge;
  return Object.fromEntries(COLLECTIONS.map((key) => [key, (state[key] ?? []).filter(keep)]));
}

// ───────────────────────── Datos de ejemplo ─────────────────────────

/** Mazo de ejemplo para el primer uso (marcado como ejemplo; se puede borrar). */
export function exampleState(now) {
  const deck = { ...newDeck({ name: 'Japonés: primeros pasos', languageCode: 'ja' }, now), example: true };
  const rows = [
    ['あ', 'a', 'a', '', 'character'],
    ['い', 'i', 'i', '', 'character'],
    ['猫', 'gato', 'neko', '猫が好きです。 Me gustan los gatos.', 'noun'],
    ['本', 'libro', 'hon', '', 'noun'],
    ['食べる', 'comer', 'taberu', 'パンを食べる。 Como pan.', 'verb'],
    ['大きい', 'grande', 'ookii', '', 'adjective'],
    ['おはようございます', 'buenos días (formal)', 'ohayō gozaimasu', '', 'phrase'],
  ];
  const cards = rows.map(([front, back, pronunciation, example, kind], i) =>
    newCard({ deckId: deck.id, front, back, pronunciation, example, kind }, now + i),
  );
  return { decks: [deck], cards, sessions: [], quizzes: [], listenings: [] };
}
