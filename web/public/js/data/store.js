// Estado de la app en memoria + acciones que lo modifican.
//
// Todas las modificaciones pasan por las funciones de este archivo: ponen
// `updatedAt` (necesario para sincronizar), avisan a la interfaz y programan el
// guardado. Las vistas nunca tocan el estado directamente.

import * as M from '../core/model.js';
import { schedule } from '../core/sm2.js';
import { insertDeckExport } from '../core/transfer.js';
import { loadState, saveState, clearAll } from './storage.js';

let state = M.emptyState();
const listeners = new Set();
let saveTimer = null;
let saving = Promise.resolve();
let lastSaveOk = true;

export const getState = () => state;
export const lastSaveSucceeded = () => lastSaveOk;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Guarda enseguida (los cambios del mismo momento se agrupan en una sola escritura),
// así nada se pierde si el usuario cierra la app justo después de un cambio.
function commit() {
  for (const fn of listeners) fn(state);
  if (saveTimer === null) saveTimer = setTimeout(flush, 0);
}

/** Guarda ya (se llama también al pasar la app a segundo plano). */
export function flush() {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  saving = saving.then(async () => {
    lastSaveOk = await saveState(state);
  });
  return saving;
}

/** Carga los datos. La primera vez crea un mazo de ejemplo. */
export async function init(now = Date.now()) {
  const saved = await loadState();
  if (saved && Array.isArray(saved.decks)) {
    state = M.purgeTombstones(M.withAllCollections(saved), now);
    return { firstRun: false };
  }
  state = M.exampleState(now);
  await flush();
  return { firstRun: true };
}

const findLive = (list, id) => list.find((r) => r.id === id && !r.deleted) ?? null;
export const getDeck = (id) => findLive(state.decks, id);
export const getCard = (id) => findLive(state.cards, id);
export const getSession = (id) => findLive(state.sessions, id);
export const getQuiz = (id) => findLive(state.quizzes, id);

// ───────────────────────────── Mazos ─────────────────────────────

export function createDeck(fields, now = Date.now()) {
  const deck = M.newDeck(fields, now);
  state.decks.push(deck);
  commit();
  return deck;
}

export function updateDeck(id, fields, now = Date.now()) {
  const deck = getDeck(id);
  if (!deck) return;
  Object.assign(deck, fields, { updatedAt: now });
  commit();
}

/** Borra el mazo y sus tarjetas (como lápidas, para que el borrado viaje al sincronizar). */
export function deleteDeck(id, now = Date.now()) {
  state.decks = state.decks.map((d) => (d.id === id ? M.tombstone(d, now) : d));
  state.cards = state.cards.map((c) => (c.deckId === id && !c.deleted ? M.tombstone(c, now) : c));
  commit();
}

// ──────────────────────────── Tarjetas ────────────────────────────

export function createCard(fields, now = Date.now()) {
  const card = M.newCard(fields, now);
  state.cards.push(card);
  commit();
  return card;
}

export function updateCard(id, fields, now = Date.now()) {
  const card = getCard(id);
  if (!card) return;
  Object.assign(card, fields, { updatedAt: now });
  commit();
}

export function deleteCard(id, now = Date.now()) {
  state.cards = state.cards.map((c) => (c.id === id ? M.tombstone(c, now) : c));
  commit();
}

/**
 * Registra un repaso. Devuelve una copia de la tarjeta anterior para poder deshacer.
 * @param {'again'|'hard'|'good'|'easy'} grade
 */
export function rateCard(id, grade, now = Date.now()) {
  const card = getCard(id);
  if (!card) return null;
  const before = { ...card };
  const next = schedule(card, grade, now);
  Object.assign(card, {
    dueAt: next.dueAt,
    intervalDays: next.intervalDays,
    ease: next.ease,
    repetitions: next.repetitions,
    lapses: next.lapses,
    lastReviewedAt: now,
    updatedAt: now,
  });
  commit();
  return before;
}

/** Deshace un repaso volviendo a la copia anterior (con fecha nueva para que sincronice). */
export function restoreCard(snapshot, now = Date.now()) {
  const card = getCard(snapshot.id);
  if (!card) return;
  Object.assign(card, snapshot, { updatedAt: now });
  commit();
}

// ──────────────────────────── Sesiones ────────────────────────────

export function startSession(now = Date.now()) {
  const session = M.newSession(now);
  state.sessions.push(session);
  commit();
  return session;
}

export function endSession(id, now = Date.now()) {
  const s = getSession(id);
  if (!s || s.endedAt !== null) return;
  Object.assign(s, { endedAt: now, updatedAt: now });
  commit();
}

export function addPomodoro(id, now = Date.now()) {
  const s = getSession(id);
  if (!s) return;
  Object.assign(s, { pomodoros: s.pomodoros + 1, updatedAt: now });
  commit();
}

/** Borra la sesión; sus palabras siguen en sus mazos. */
export function deleteSession(id, now = Date.now()) {
  state.sessions = state.sessions.map((s) => (s.id === id ? M.tombstone(s, now) : s));
  commit();
}

/** Mazo destino de las anotaciones rápidas: el elegido o "Anotaciones" (se crea si no existe). */
export function inboxDeck(now = Date.now()) {
  const existing = M.live(state.decks).find((d) => d.name === 'Anotaciones');
  return existing ?? createDeck({ name: 'Anotaciones', languageCode: 'en' }, now);
}

// ──────────────────────────── Cuestionarios ────────────────────────────

export function createQuiz(fields, now = Date.now()) {
  const quiz = M.newQuiz(fields, now);
  state.quizzes.push(quiz);
  commit();
  return quiz;
}

export function updateQuiz(id, fields, now = Date.now()) {
  const quiz = getQuiz(id);
  if (!quiz) return;
  Object.assign(quiz, fields, { updatedAt: now });
  commit();
}

export function deleteQuiz(id, now = Date.now()) {
  state.quizzes = state.quizzes.map((q) => (q.id === id ? M.tombstone(q, now) : q));
  commit();
}

// ─────────────────────────── Importar / sincronizar ───────────────────────────

export function importDeck(exp, now = Date.now()) {
  const id = insertDeckExport(state, exp, now);
  commit();
  return id;
}

export function mergeBackup(incoming) {
  const { state: merged, added, updated } = M.mergeStates(state, incoming);
  state = merged;
  commit();
  return { added, updated };
}

export async function resetAll() {
  await clearAll();
  state = M.emptyState();
  commit();
  await flush();
}
