// Algoritmo de repetición espaciada basado en SM-2 (SuperMemo 2, Wozniak 1987),
// el mismo en el que se basa Anki, adaptado a 4 botones. Es la misma lógica que la
// versión nativa (Mnemo/Services/SM2Scheduler.swift).
//
// | Botón    | Facilidad (ease) | Próximo intervalo                                   |
// |----------|------------------|-----------------------------------------------------|
// | Otra vez | −0.20            | 10 minutos; vuelve a empezar                        |
// | Difícil  | −0.15            | 1 día si es nueva; si no, intervalo × 1.2           |
// | Bien     | igual            | 1 día → 6 días → intervalo × ease                   |
// | Fácil    | +0.15            | 4 días si es nueva; si no, intervalo × ease × 1.3   |
//
// Funciones puras: reciben `now` (milisegundos), así los tests son deterministas.

export const DAY = 86_400_000;
export const INITIAL_EASE = 2.5;

export const DEFAULTS = Object.freeze({
  minimumEase: 1.3,
  relearnDelay: 10 * 60_000,
  hardMultiplier: 1.2,
  easyBonus: 1.3,
  maximumIntervalDays: 3650,
});

export const GRADES = Object.freeze([
  { id: 'again', label: 'Otra vez', key: '1' },
  { id: 'hard', label: 'Difícil', key: '2' },
  { id: 'good', label: 'Bien', key: '3' },
  { id: 'easy', label: 'Fácil', key: '4' },
]);

/**
 * @param {{intervalDays:number, ease:number, repetitions:number, lapses:number, dueAt:number}} state
 * @param {'again'|'hard'|'good'|'easy'} grade
 * @param {number} now
 */
export function schedule(state, grade, now, opts = DEFAULTS) {
  const next = { ...state };

  switch (grade) {
    case 'again':
      next.repetitions = 0;
      next.lapses = state.lapses + 1;
      next.ease = Math.max(opts.minimumEase, round2(state.ease - 0.2));
      next.intervalDays = 0;
      next.dueAt = now + opts.relearnDelay;
      return next;

    case 'hard':
      next.ease = Math.max(opts.minimumEase, round2(state.ease - 0.15));
      next.intervalDays = state.repetitions === 0 ? 1 : state.intervalDays * opts.hardMultiplier;
      break;

    case 'good':
      if (state.repetitions === 0) next.intervalDays = 1;
      else if (state.repetitions === 1) next.intervalDays = 6;
      else next.intervalDays = state.intervalDays * state.ease;
      break;

    case 'easy':
      next.ease = round2(state.ease + 0.15);
      next.intervalDays = state.repetitions === 0 ? 4 : state.intervalDays * state.ease * opts.easyBonus;
      break;

    default:
      throw new Error(`Calificación desconocida: ${grade}`);
  }

  next.repetitions = state.repetitions + 1;
  next.intervalDays = Math.min(opts.maximumIntervalDays, Math.max(1, Math.round(next.intervalDays)));
  next.dueAt = now + next.intervalDays * DAY;
  return next;
}

/** Texto corto para debajo de cada botón ("10 min", "6 d", "2 meses"). */
export function previewLabel(state, grade, now) {
  return formatInterval(schedule(state, grade, now).dueAt - now);
}

export function formatInterval(ms) {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const days = ms / DAY;
  if (days < 1) return `${Math.round(minutes / 60)} h`;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  }
  return `${(days / 365).toFixed(1).replace('.', ',')} años`;
}

// Evita arrastrar errores de coma flotante (2.5 − 0.2 = 2.3000000000000003).
function round2(n) {
  return Math.round(n * 100) / 100;
}
