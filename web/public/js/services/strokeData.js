// Carga los trazos de un carácter (datos de KanjiVG) y los convierte en puntos.
//
// Los datos están en public/strokes/<bloque>.json (un archivo por cada 256
// códigos Unicode). Se piden solo cuando hacen falta y quedan en memoria; el
// service worker además los guarda para usarlos sin conexión.

const SVG_NS = 'http://www.w3.org/2000/svg';
const blocks = new Map();

const blockOf = (ch) => (ch.codePointAt(0) >> 8).toString(16).padStart(3, '0');

/** @returns {Promise<string[] | null>} los trazos (atributo d de SVG) o null si no hay datos. */
export async function loadStrokes(ch) {
  const block = blockOf(ch);
  if (!blocks.has(block)) {
    blocks.set(
      block,
      fetch(`strokes/${block}.json`)
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => {
          blocks.delete(block); // reintentar la próxima vez (por ejemplo, al volver internet)
          return {};
        }),
    );
  }
  const data = await blocks.get(block);
  return Array.isArray(data?.[ch]) ? data[ch] : null;
}

let measurer = null;

/** Puntos a lo largo de un trazo SVG (en la cuadrícula de 109 × 109). */
export function samplePath(d, count = 48) {
  if (!measurer) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.setProperty('position', 'absolute');
    measurer = document.createElementNS(SVG_NS, 'path');
    svg.appendChild(measurer);
    document.body.appendChild(svg);
  }
  measurer.setAttribute('d', d);
  const len = measurer.getTotalLength();
  return Array.from({ length: count }, (_, i) => {
    const p = measurer.getPointAtLength((len * i) / (count - 1));
    return { x: p.x, y: p.y };
  });
}
