// Controla el Pomodoro de la app: guarda su estado en el dispositivo, suena al
// terminar cada fase, mantiene la pantalla encendida y suma los bloques de foco a
// la sesión de estudio abierta.

import * as P from '../core/pomodoro.js';
import { readPref, writePref } from '../data/storage.js';
import * as store from '../data/store.js';
import { activeSession } from '../core/model.js';
import { chime, unlockAudio, keepScreenOn } from './device.js';

const listeners = new Set();
let state = P.restore(readPref('pomodoro', null));
let durations = sanitizeDurations(readPref('durations', P.DEFAULT_DURATIONS));
let onPhaseEnd = () => {};

export const getState = () => state;
export const getDurations = () => durations;
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

/** La app registra acá qué hacer al terminar una fase (avisos en pantalla). */
export function setPhaseEndHandler(fn) {
  onPhaseEnd = fn;
}

export function setDurations(partial) {
  durations = sanitizeDurations({ ...durations, ...partial });
  writePref('durations', durations);
  emit();
}

export function start(now = Date.now()) {
  unlockAudio();
  state = P.start(state, now, durations);
  save();
}

export function pause(now = Date.now()) {
  state = P.pause(state, now);
  save();
}

export function skip() {
  state = P.skip(state, durations);
  save();
}

export function reset() {
  state = P.reset(state);
  save();
}

/** Llamado cada segundo por la app y al volver a primer plano. */
export function tick(now = Date.now()) {
  const { state: next, finished } = P.tick(state, now, durations);
  if (finished) {
    state = next;
    save();
    if (finished === 'focus') {
      const session = activeSession(store.getState());
      if (session) store.addPomodoro(session.id, now);
    }
    if (readPref('sound', true)) chime();
    onPhaseEnd(finished, state.phase);
  } else {
    emit();
  }
}

export function syncScreenLock() {
  keepScreenOn(P.isRunning(state) && readPref('keepAwake', true));
}

function save() {
  writePref('pomodoro', state);
  syncScreenLock();
  emit();
}

function emit() {
  for (const fn of listeners) fn(state);
}

function sanitizeDurations(d) {
  const n = (v, min, max, fallback) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  const def = P.DEFAULT_DURATIONS;
  return {
    focusMin: n(d?.focusMin, 5, 90, def.focusMin),
    shortMin: n(d?.shortMin, 1, 30, def.shortMin),
    longMin: n(d?.longMin, 5, 60, def.longMin),
    cycles: n(d?.cycles, 2, 8, def.cycles),
  };
}
