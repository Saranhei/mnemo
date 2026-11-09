// Tinta de los cuadernos: cómo se guarda un trazo, cómo se dibuja con grosor según
// la presión del Apple Pencil y cómo se borra.
//
// Coordenadas de página: el ancho de toda página mide 1000 unidades (el alto depende
// de la proporción de la hoja). Así los trazos quedan en su lugar con cualquier zoom
// o tamaño de pantalla.
//
// Un trazo: { t: 'pen' | 'hl', c: color, w: grosor en unidades, p: [x, y, presión, x, y, presión, …] }
// Además de trazos, una página puede tener:
//   cinta:   { t: 'tape', k: diseño, c: color, w: ancho, p: [x1, y1, 0, x2, y2, 0] }
//   sticker: { t: 'st', k: nombre, x, y, s: tamaño, r: giro }
//   imagen:  { t: 'img', m: id del archivo en el dispositivo, x, y, w, h, u?: 1 si es un sticker propio }
//   cinta con diseño propio: como la cinta, más m (imagen del diseño) y a (ancho/alto de la imagen)

export const PAGE_W = 1000;
export const MAX_POINTS = 4000; // por trazo (un trazo larguísimo se corta)

export const TOOLS = Object.freeze({
  pen: { label: 'Lapicera', widths: [2.2, 3.6, 6] },
  hl: { label: 'Resaltador', widths: [14, 22, 32] },
  tape: { label: 'Cinta', widths: [26, 40, 60] },
});

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

/** Agrega un punto si se movió lo suficiente (descarta el ruido de puntos repetidos). */
export function addPoint(stroke, x, y, pressure) {
  const p = stroke.p;
  const n = p.length;
  if (n >= MAX_POINTS * 3) return false;
  if (n >= 3) {
    const dx = x - p[n - 3];
    const dy = y - p[n - 2];
    if (dx * dx + dy * dy < 0.36) return false; // menos de 0,6 unidades
  }
  p.push(round1(x), round1(y), round2(pressure > 0 ? Math.min(1, pressure) : 0.5));
  return true;
}

/** Suaviza la presión (el Pencil la reporta con saltos) con un promedio móvil. */
function smoothedPressures(p) {
  const n = p.length / 3;
  const out = new Array(n);
  let acc = p[2];
  for (let i = 0; i < n; i++) {
    acc = acc * 0.6 + p[i * 3 + 2] * 0.4;
    out[i] = acc;
  }
  return out;
}

/**
 * Contorno relleno de un trazo de lapicera, más ancho donde se apretó más.
 * @returns {string} atributo `d` de un <path> SVG (con relleno, sin borde).
 */
export function penOutline(stroke) {
  const p = stroke.p;
  const n = p.length / 3;
  const base = stroke.w;
  if (n === 0) return '';
  const width = (pr) => base * (0.45 + pr * 0.9);
  const pres = smoothedPressures(p);
  if (n === 1) {
    const r = width(pres[0]) / 2;
    const x = p[0];
    const y = p[1];
    return `M${x - r},${y}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
  }
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    // Dirección: entre el punto anterior y el siguiente (más suave en las curvas).
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = p[b * 3] - p[a * 3];
    let dy = p[b * 3 + 1] - p[a * 3 + 1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const half = width(pres[i]) / 2;
    left.push(round1(x - dy * half), round1(y + dx * half));
    right.push(round1(x + dy * half), round1(y - dx * half));
  }
  const capR = width(pres[n - 1]) / 2;
  const startR = width(pres[0]) / 2;
  let d = `M${left[0]},${left[1]}`;
  for (let i = 2; i < left.length; i += 2) d += `L${left[i]},${left[i + 1]}`;
  // Punta redondeada al final y al principio.
  d += `A${round1(capR)},${round1(capR)} 0 0,1 ${right[right.length - 2]},${right[right.length - 1]}`;
  for (let i = right.length - 4; i >= 0; i -= 2) d += `L${right[i]},${right[i + 1]}`;
  d += `A${round1(startR)},${round1(startR)} 0 0,1 ${left[0]},${left[1]}Z`;
  return d;
}

/** Línea central (para el resaltador, de ancho fijo). */
export function centerline(stroke) {
  const p = stroke.p;
  if (p.length < 3) return '';
  let d = `M${p[0]},${p[1]}`;
  if (p.length === 3) return `${d}L${p[0] + 0.1},${p[1]}`;
  for (let i = 3; i < p.length; i += 3) d += `L${p[i]},${p[i + 1]}`;
  return d;
}

/** Distancia de un punto a un segmento. */
function segDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Caja de un sticker o imagen: { x, y, w, h } (x, y = esquina superior izquierda). */
export function itemBox(item) {
  if (item.t === 'st') return { x: item.x - item.s / 2, y: item.y - item.s / 2, w: item.s, h: item.s };
  if (item.t === 'img') return { x: item.x, y: item.y, w: item.w, h: item.h };
  return null;
}

/** ¿La goma (círculo de radio r en x, y) toca el trazo, cinta o sticker? (las fotos no se borran con la goma; los stickers propios sí) */
export function touches(stroke, x, y, r) {
  if (stroke.t === 'img' && !stroke.u) return false;
  if (stroke.t === 'st' || stroke.t === 'img') {
    const b = itemBox(stroke);
    return x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r;
  }
  const p = stroke.p;
  const reach = r + stroke.w / 2;
  if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= reach;
  for (let i = 3; i < p.length; i += 3) {
    if (segDistance(x, y, p[i - 3], p[i - 2], p[i], p[i + 1]) <= reach) return true;
  }
  return false;
}

const num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const NAME = /^[a-z]{1,20}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Limpia lo que viene de un archivo (no se confía en lo importado).
 * @param {(id: string) => string | null} [mapMedia] traduce ids de imágenes del archivo.
 */
export function sanitizeStrokes(list, maxStrokes = 20000, mapMedia = (id) => id) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list.slice(0, maxStrokes)) {
    if (!s || typeof s !== 'object') continue;
    if (s.t === 'st') {
      if (NAME.test(s.k ?? '')) out.push({ t: 'st', k: s.k, x: num(s.x, -500, 1500), y: num(s.y, -500, 5000), s: num(s.s, 20, 600, 100), r: num(s.r, -360, 360) });
      continue;
    }
    if (s.t === 'img') {
      const m = typeof s.m === 'string' ? mapMedia(s.m) : null;
      if (m) out.push({ t: 'img', m, x: num(s.x, -500, 1500), y: num(s.y, -500, 5000), w: num(s.w, 10, 2000, 300), h: num(s.h, 10, 3000, 200), ...(s.u ? { u: 1 } : {}) });
      continue;
    }
    if (!Array.isArray(s.p)) continue;
    if (s.t === 'tape') {
      const p = s.p.slice(0, 6).map((v) => num(v, -500, 5000));
      const tape = { t: 'tape', k: NAME.test(s.k ?? '') ? s.k : 'plain', c: COLOR.test(s.c ?? '') ? s.c : '#ff9f1c', w: num(s.w, 10, 120, 40), p };
      if (typeof s.m === 'string') {
        const m = mapMedia(s.m);
        if (!m) continue; // diseño propio cuya imagen no vino en el archivo
        Object.assign(tape, { k: 'img', m, a: num(s.a, 0.1, 20, 4) });
      }
      if (p.length === 6) out.push(tape);
      continue;
    }
    const t = s.t === 'hl' ? 'hl' : 'pen';
    const c = typeof s.c === 'string' && /^#[0-9a-f]{6}$/i.test(s.c) ? s.c : '#1b1a24';
    const w = Number.isFinite(s.w) ? Math.min(60, Math.max(0.5, s.w)) : 3;
    const p = s.p.slice(0, MAX_POINTS * 3).map((v) => (Number.isFinite(v) ? Math.max(-100, Math.min(100000, v)) : 0));
    p.length -= p.length % 3;
    if (p.length) out.push({ t, c, w, p });
  }
  return out;
}
