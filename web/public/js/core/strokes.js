// Comparación de trazos dibujados a mano con los trazos de referencia (KanjiVG).
//
// Todo está en la cuadrícula de KanjiVG (109 × 109). Cada trazo se re-muestrea a
// la misma cantidad de puntos repartidos por igual a lo largo del trazo, y se
// compara punto a punto. Así importa la forma, la posición y la DIRECCIÓN (un
// trazo hecho al revés no cuenta), pero no la velocidad ni la presión.

export const GRID = 109;
const SAMPLES = 32;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function strokeLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/** Reparte `n` puntos equidistantes a lo largo del trazo. */
export function resample(points, n = SAMPLES) {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0] }));
  const total = strokeLength(points);
  if (total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));
  const step = total / (n - 1);
  const out = [{ ...points[0] }];
  let acc = 0;
  let i = 1;
  let prev = points[0];
  while (out.length < n - 1 && i < points.length) {
    const cur = points[i];
    const d = dist(prev, cur);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const p = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(p);
      prev = p;
      acc = 0;
    } else {
      acc += d;
      prev = cur;
      i += 1;
    }
  }
  while (out.length < n) out.push({ ...points.at(-1) });
  return out;
}

const meanDistance = (a, b) => a.reduce((sum, p, i) => sum + dist(p, b[i]), 0) / a.length;

/**
 * ¿El trazo del usuario corresponde al trazo de referencia?
 * @returns {{ok: boolean, reversed: boolean, distance: number, threshold: number}}
 */
export function compareStroke(user, reference, { leniency = 1 } = {}) {
  const u = resample(user);
  const r = resample(reference);
  const refLen = strokeLength(reference);
  const userLen = strokeLength(user);
  const short = refLen < 20; // puntos y trazos muy cortos (゛, ふ, 心...)

  const threshold = leniency * (short ? 12 : Math.min(19, 9 + refLen * 0.12));
  const distance = meanDistance(u, r);
  const reversedDistance = meanDistance(u, [...r].reverse());

  const ratio = userLen / Math.max(refLen, 1);
  const ratioOk = short ? ratio > 0.15 && ratio < 4.5 : ratio > 0.45 && ratio < 2.2;

  const ok = distance <= threshold && ratioOk;
  const reversed = !ok && !short && reversedDistance <= threshold && reversedDistance < distance;
  return { ok, reversed, distance, threshold };
}
