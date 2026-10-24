// Temporizador Pomodoro como máquina de estados pura.
//
// Clave: se guarda la HORA DE FIN (`endAt`) en vez de restar segundos. El restante
// es `endAt − ahora`, así es correcto aunque el sistema congele la app en segundo
// plano. El estado es un objeto plano que se guarda en el dispositivo, por lo que
// el temporizador sobrevive si iOS cierra la app.

export const PHASES = Object.freeze({
  focus: { label: 'Foco' },
  shortBreak: { label: 'Descanso corto' },
  longBreak: { label: 'Descanso largo' },
});

export const DEFAULT_DURATIONS = Object.freeze({ focusMin: 25, shortMin: 5, longMin: 15, cycles: 4 });

export function initialState() {
  return { phase: 'focus', endAt: null, pausedRemaining: null, completedFocus: 0 };
}

export function durationOf(phase, d) {
  const minutes = phase === 'focus' ? d.focusMin : phase === 'shortBreak' ? d.shortMin : d.longMin;
  return minutes * 60_000;
}

export const isRunning = (s) => s.endAt !== null;
export const isPaused = (s) => s.pausedRemaining !== null;

export function remaining(s, now, d) {
  if (s.endAt !== null) return Math.max(0, s.endAt - now);
  if (s.pausedRemaining !== null) return s.pausedRemaining;
  return durationOf(s.phase, d);
}

/** 0 al empezar la fase, 1 al terminarla. */
export function progress(s, now, d) {
  const total = durationOf(s.phase, d);
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - remaining(s, now, d) / total));
}

export function start(s, now, d) {
  if (s.endAt !== null) return s;
  const total = s.pausedRemaining ?? durationOf(s.phase, d);
  return { ...s, endAt: now + total, pausedRemaining: null };
}

export function pause(s, now) {
  if (s.endAt === null) return s;
  return { ...s, endAt: null, pausedRemaining: Math.max(0, s.endAt - now) };
}

/** Vuelve al comienzo de un bloque de foco; conserva el contador del día. */
export function reset(s) {
  return { ...initialState(), completedFocus: s.completedFocus };
}

/** Pasa a la fase siguiente sin contar el foco como completado. */
export function skip(s, d) {
  return advance(s, d, false);
}

/**
 * Llamado periódicamente. Si la fase terminó, avanza y devuelve cuál terminó.
 * @returns {{state: object, finished: null | 'focus' | 'shortBreak' | 'longBreak'}}
 */
export function tick(s, now, d) {
  if (s.endAt === null || now < s.endAt) return { state: s, finished: null };
  return { state: advance(s, d, true), finished: s.phase };
}

function advance(s, d, countingFocus) {
  let { phase, completedFocus } = s;
  if (phase === 'focus') {
    if (countingFocus) completedFocus += 1;
    const cycles = Math.max(1, d.cycles);
    phase = countingFocus && completedFocus % cycles === 0 ? 'longBreak' : 'shortBreak';
  } else {
    phase = 'focus';
  }
  return { phase, endAt: null, pausedRemaining: null, completedFocus };
}

/** Valida un estado leído del almacenamiento (podría estar corrupto o ser viejo). */
export function restore(raw) {
  const base = initialState();
  if (!raw || typeof raw !== 'object' || !(raw.phase in PHASES)) return base;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    phase: raw.phase,
    endAt: num(raw.endAt),
    pausedRemaining: num(raw.pausedRemaining),
    completedFocus: Math.floor(num(raw.completedFocus) ?? 0),
  };
}

/** "24:59" */
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
