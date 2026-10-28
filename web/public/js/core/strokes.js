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
const centroid = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const centered = (pts) => {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
};

/** Ángulo (0–180°) entre las direcciones inicio→fin de dos trazos. */
function directionAngle(a, b) {
  const va = { x: a.at(-1).x - a[0].x, y: a.at(-1).y - a[0].y };
  const vb = { x: b.at(-1).x - b[0].x, y: b.at(-1).y - b[0].y };
  const la = Math.hypot(va.x, va.y);
  const lb = Math.hypot(vb.x, vb.y);
  if (la === 0 || lb === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (va.x * vb.x + va.y * vb.y) / (la * lb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

// ───────────────────────── Ajuste al tamaño y lugar de tu letra ─────────────────────────
//
// Nadie escribe del mismo tamaño ni en el mismo lugar que el modelo. Con los trazos que
// ya salieron bien se estima cómo se ve tu letra respecto del modelo (una escala y un
// desplazamiento: tuyo ≈ escala · modelo + desplazamiento) y el trazo siguiente se
// compara después de deshacer ese ajuste. Así un kanji chico, corrido o un poco más
// ancho sigue valiendo, mientras los trazos mantengan sus proporciones entre sí.

export const IDENTITY = Object.freeze({ scale: 1, dx: 0, dy: 0 });

/**
 * @param {{user: {x,y}[], ref: {x,y}[]}[]} pairs trazos aceptados (tuyo y de referencia).
 * @returns {{scale: number, dx: number, dy: number}}
 */
export function estimateTransform(pairs) {
  const u = [];
  const r = [];
  for (const pair of pairs) {
    u.push(...resample(pair.user));
    r.push(...resample(pair.ref));
  }
  if (u.length === 0) return IDENTITY;
  const cu = centroid(u);
  const cr = centroid(r);
  let num = 0;
  let den = 0;
  for (let i = 0; i < u.length; i++) {
    const rx = r[i].x - cr.x;
    const ry = r[i].y - cr.y;
    num += rx * (u[i].x - cu.x) + ry * (u[i].y - cu.y);
    den += rx * rx + ry * ry;
  }
  // Con uno o dos trazos cortos la escala casi no se puede medir: se tira hacia 1.
  const prior = u.length * 40;
  const scale = Math.max(0.45, Math.min(1.8, (num + prior) / (den + prior)));
  return { scale, dx: cu.x - scale * cr.x, dy: cu.y - scale * cr.y };
}

const undo = (pts, t) => pts.map((p) => ({ x: (p.x - t.dx) / t.scale, y: (p.y - t.dy) / t.scale }));

/**
 * ¿El trazo del usuario corresponde al trazo de referencia?
 *
 * Se mira por separado, con márgenes generosos:
 *  - la FORMA (los dos trazos centrados en el mismo punto),
 *  - la DIRECCIÓN general (inicio → fin), para detectar trazos al revés,
 *  - el LUGAR (dónde cae el centro del trazo dentro del carácter),
 *  - el LARGO (ni mucho más corto ni mucho más largo).
 * Un trazo torcido, tembloroso o un poco corrido vale; uno en otro lugar, al revés
 * o de otra forma, no.
 *
 * @param {{x,y}[]} user puntos dibujados (en la cuadrícula de 109 × 109)
 * @param {{x,y}[]} reference puntos del trazo modelo
 * @param {{transform?: {scale,dx,dy}, leniency?: number, later?: {x,y}[][]}} [opts]
 *   transform: cómo es tu letra respecto del modelo (ver estimateTransform).
 *   leniency: multiplica los márgenes (1 = normal; más = más permisivo).
 *   later: trazos que vienen después. Si lo dibujado es claramente uno de esos (misma
 *   forma y mucho más cerca de su lugar), no se acepta: es un error de orden.
 * @returns {{ok: boolean, reversed: boolean, wrongOrder: boolean, distance: number, threshold: number}}
 */
export function compareStroke(user, reference, { transform = null, leniency = 1, later = [] } = {}) {
  const t = transform ?? IDENTITY;
  const u = smooth(resample(undo(user, t)));
  const m = measure(u, resample(reference), strokeLength(reference), { known: Boolean(transform), leniency });
  let wrongOrder = false;
  if (m.ok) {
    for (const other of later) {
      const o = measure(u, resample(other), strokeLength(other), { known: Boolean(transform), leniency });
      // Sin conocer todavía tu letra (primer trazo), solo si la otra forma es mucho mejor.
      const better = transform ? o.shape <= m.shape * 1.3 : o.shape < m.shape * 0.5;
      // Si ya cae casi en su lugar (place chico), no es un error de orden aunque otro trazo esté cerca.
      if (o.ok && m.place > 7 && o.place < m.place * 0.5 && better) {
        wrongOrder = true;
        break;
      }
    }
  }
  return { ok: m.ok && !wrongOrder, reversed: m.reversed, wrongOrder, distance: m.shape, threshold: m.shapeLimit };
}

/** Suaviza el temblor de la mano (promedio con los vecinos) sin mover las puntas. */
function smooth(pts) {
  return pts.map((p, i) => {
    if (i === 0 || i === pts.length - 1) return p;
    const a = pts[i - 1];
    const b = pts[i + 1];
    return { x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
  });
}

function measure(u, r, refLen, { known, leniency }) {
  const userLen = strokeLength(u);
  const short = refLen < 20; // puntos y trazos muy cortos (゛, ふ, 心...)

  // Lugar: sin trazos previos no sabemos cómo es tu letra, así que el margen es más amplio.
  const placeLimit = leniency * (known ? 15 + refLen * 0.1 : short ? 30 : 34 + refLen * 0.1);
  const place = dist(centroid(u), centroid(r));

  // Forma, sin importar dónde está.
  const shapeLimit = leniency * (short ? 9 : 4.5 + refLen * 0.19);
  const shape = meanDistance(centered(u), centered(r));
  const reversedShape = meanDistance(centered(u), centered([...r].reverse()));

  const angle = short ? 0 : directionAngle(u, r);
  const angleLimit = Math.min(70, 32 * leniency);

  const ratio = userLen / Math.max(refLen, 1);
  const ratioOk = short ? ratio > 0.12 && ratio < 5 : ratio > 0.38 && ratio < 2.6;

  const ok = ratioOk && place <= placeLimit && shape <= shapeLimit && angle <= angleLimit;
  const reversed = !ok && !short && place <= placeLimit && angle > 120 && reversedShape <= shapeLimit && reversedShape < shape;
  return { ok, reversed, place, shape, shapeLimit };
}

/** Los primeros `length` de un trazo (para comparar contra la primera parte). */
function prefixOf(points, length) {
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1], points[i]);
    if (acc + d >= length) {
      const t = d ? (length - acc) / d : 0;
      out.push({ x: points[i - 1].x + t * (points[i].x - points[i - 1].x), y: points[i - 1].y + t * (points[i].y - points[i - 1].y) });
      return out;
    }
    acc += d;
    out.push(points[i]);
  }
  return out;
}

/**
 * ¿Lo dibujado es el COMIENZO del trazo de referencia? Pasa cuando alguien levanta el
 * dedo a mitad de un trazo que en japonés va de un solo tirón (la esquina de 口, 日,
 * 月...). En ese caso no se marca error: se espera la otra parte y se juntan.
 */
export function startsLike(user, reference, { transform = null, leniency = 1 } = {}) {
  const t = transform ?? IDENTITY;
  const u = undo(user, t);
  const refLen = strokeLength(reference);
  const userLen = strokeLength(u);
  if (refLen < 25 || userLen < refLen * 0.2 || userLen > refLen * 0.85) return false;
  const prefix = prefixOf(reference, userLen);
  return compareStroke(user, prefix, { transform, leniency: leniency * 1.2 }).ok;
}
