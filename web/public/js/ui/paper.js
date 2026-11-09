// Dibujos fijos de los cuadernos: hojas (rayas, cuadrícula, puntos, genkō yōshi,
// Cornell), cintas decorativas y stickers. Todo es SVG en coordenadas de página
// (1000 unidades de ancho), así se ve nítido con cualquier zoom. Diseños propios.

const NS = 'http://www.w3.org/2000/svg';
export const svg = (tag, attrs = {}, ...children) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const c of children) if (c) el.appendChild(c);
  return el;
};

export const PAPER_LABEL = {
  blank: 'Lisa',
  'lined-s': 'Rayas finas',
  'lined-m': 'Rayas',
  'lined-l': 'Rayas anchas',
  'grid-s': 'Cuadrícula chica',
  'grid-m': 'Cuadrícula',
  'grid-l': 'Cuadrícula grande',
  'dots-s': 'Puntos chicos',
  'dots-m': 'Puntos',
  'dots-l': 'Puntos grandes',
  genko: 'Genkō yōshi',
  margin: 'Rayas con margen',
  cornell: 'Cornell',
};

const SIZE = { s: 26, m: 36, l: 50 };
const dark = (bg) => bg === '#25252d';

/**
 * Dibuja la hoja dentro de un <g>.
 * @param {string} paper tipo de hoja (ver PAPERS en core/model.js)
 * @param {number} h alto de la página en unidades
 * @param {string} bg color del papel
 */
export function drawPaper(g, paper, h, bg) {
  g.replaceChildren();
  const ink = dark(bg) ? '#5b5d70' : '#c9cfe0';
  const strong = dark(bg) ? '#8a6f78' : '#e9a3ad';
  g.appendChild(svg('rect', { x: 0, y: 0, width: 1000, height: h, fill: bg }));
  const [kind, size] = paper.split('-');
  const step = SIZE[size] ?? 36;
  const id = `pp-${paper}-${Math.random().toString(36).slice(2, 7)}`;
  const pattern = (w, hh, ...children) => {
    const p = svg('pattern', { id, width: w, height: hh, patternUnits: 'userSpaceOnUse' }, ...children);
    g.appendChild(svg('defs', {}, p));
  };
  const lines = (x0, y0, x1) => {
    for (let y = y0; y < h - 20; y += step) g.appendChild(svg('line', { x1: x0, y1: y, x2: x1, y2: y, stroke: ink, 'stroke-width': 1.2 }));
  };

  if (kind === 'lined') lines(0, 90, 1000);
  else if (kind === 'grid') {
    pattern(step, step, svg('path', { d: `M${step} 0V${step}M0 ${step}H${step}`, stroke: ink, 'stroke-width': 1, fill: 'none' }));
    g.appendChild(svg('rect', { x: 0, y: 0, width: 1000, height: h, fill: `url(#${id})` }));
  } else if (kind === 'dots') {
    pattern(step, step, svg('circle', { cx: step / 2, cy: step / 2, r: size === 'l' ? 2.4 : 1.8, fill: ink }));
    g.appendChild(svg('rect', { x: 0, y: 0, width: 1000, height: h, fill: `url(#${id})` }));
  } else if (kind === 'margin') {
    lines(0, 90, 1000);
    g.appendChild(svg('line', { x1: 130, y1: 0, x2: 130, y2: h, stroke: strong, 'stroke-width': 1.6 }));
  } else if (kind === 'cornell') {
    // Columna de pistas a la izquierda, notas a la derecha y resumen abajo.
    const bottom = h * 0.78;
    for (let y = 90; y < bottom - 10; y += 36) g.appendChild(svg('line', { x1: 0, y1: y, x2: 1000, y2: y, stroke: ink, 'stroke-width': 1.2 }));
    g.appendChild(svg('line', { x1: 300, y1: 60, x2: 300, y2: bottom, stroke: strong, 'stroke-width': 1.8 }));
    g.appendChild(svg('line', { x1: 0, y1: bottom, x2: 1000, y2: bottom, stroke: strong, 'stroke-width': 1.8 }));
    g.appendChild(svg('line', { x1: 0, y1: 60, x2: 1000, y2: 60, stroke: strong, 'stroke-width': 1.8 }));
    const label = (x, y, t) => {
      const el = svg('text', { x, y, fill: strong, 'font-size': 18, 'font-family': 'system-ui, sans-serif' });
      el.textContent = t;
      g.appendChild(el);
    };
    label(24, 44, 'Tema / fecha');
    label(24, 84, 'Pistas');
    label(324, 84, 'Notas');
    label(24, bottom + 30, 'Resumen');
  } else if (kind === 'genko') {
    // Genkō yōshi: columnas verticales de cuadros (de derecha a izquierda), con un
    // espacio entre columnas para la furigana.
    const cell = 46;
    const gap = 16;
    const top = 70;
    const rows = Math.floor((h - top - 50) / cell);
    const cols = Math.floor((1000 - 60) / (cell + gap));
    const width = cols * (cell + gap) - gap;
    const x0 = (1000 - width) / 2;
    const frame = svg('g', { stroke: strong, 'stroke-width': 1.1, fill: 'none' });
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cell + gap);
      frame.appendChild(svg('rect', { x, y: top, width: cell, height: rows * cell }));
      for (let r = 1; r < rows; r++) frame.appendChild(svg('line', { x1: x, y1: top + r * cell, x2: x + cell, y2: top + r * cell }));
    }
    g.appendChild(frame);
  }
}

// ─────────────────────────── Cintas (washi tape) ───────────────────────────

/** Vista previa de una cinta para la paleta. */
export function tapePreview(k, c) {
  const s = svg('svg', { viewBox: '0 0 80 24', width: 64, height: 19, 'aria-hidden': 'true' });
  const defs = svg('defs');
  s.append(defs, tapeShape({ k, c, w: 22, p: [2, 12, 0, 78, 12, 0] }, defs));
  return s;
}

export const TAPES = [
  { id: 'plain', label: 'Lisa' },
  { id: 'stripes', label: 'Rayada' },
  { id: 'dots', label: 'Lunares' },
  { id: 'check', label: 'Cuadros' },
  { id: 'hearts', label: 'Corazones' },
  { id: 'stars', label: 'Estrellas' },
  { id: 'zigzag', label: 'Zigzag' },
  { id: 'gingham', label: 'Vichy' },
];

/** Defs de los patrones de cinta para un color (se agregan una vez por página y color). */
export function tapeDefs(defs, k, c) {
  const id = `tape-${k}-${c.slice(1)}`;
  if (defs.querySelector(`#${id}`)) return id;
  let p;
  if (k === 'stripes') p = svg('pattern', { id, width: 16, height: 16, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, svg('rect', { width: 16, height: 16, fill: c, 'fill-opacity': 0.45 }), svg('rect', { width: 7, height: 16, fill: '#ffffff', 'fill-opacity': 0.55 }));
  else if (k === 'dots') p = svg('pattern', { id, width: 18, height: 18, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 18, height: 18, fill: c, 'fill-opacity': 0.45 }), svg('circle', { cx: 9, cy: 9, r: 3.5, fill: '#ffffff', 'fill-opacity': 0.75 }));
  else if (k === 'check') p = svg('pattern', { id, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 20, height: 20, fill: c, 'fill-opacity': 0.3 }), svg('rect', { width: 10, height: 10, fill: c, 'fill-opacity': 0.35 }), svg('rect', { x: 10, y: 10, width: 10, height: 10, fill: c, 'fill-opacity': 0.35 }));
  else if (k === 'hearts') p = svg('pattern', { id, width: 24, height: 20, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 24, height: 20, fill: c, 'fill-opacity': 0.45 }), svg('path', { d: 'M12 15c-4-3-6-5-6-7.5a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 2.5-2 4.5-6 7.5z', fill: '#ffffff', 'fill-opacity': 0.8 }));
  else if (k === 'stars') p = svg('pattern', { id, width: 26, height: 20, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 26, height: 20, fill: c, 'fill-opacity': 0.45 }), svg('path', { d: 'M13 3l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z', fill: '#ffffff', 'fill-opacity': 0.8 }));
  else if (k === 'zigzag') p = svg('pattern', { id, width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 20, height: 20, fill: c, 'fill-opacity': 0.45 }), svg('path', { d: 'M0 13l5-6 5 6 5-6 5 6', fill: 'none', stroke: '#ffffff', 'stroke-width': 2.5, 'stroke-opacity': 0.85 }));
  else if (k === 'gingham') p = svg('pattern', { id, width: 16, height: 16, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 16, height: 16, fill: '#ffffff', 'fill-opacity': 0.35 }), svg('rect', { width: 8, height: 16, fill: c, 'fill-opacity': 0.35 }), svg('rect', { width: 16, height: 8, fill: c, 'fill-opacity': 0.35 }));
  else p = svg('pattern', { id, width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, svg('rect', { width: 10, height: 10, fill: c, 'fill-opacity': 0.5 }));
  defs.appendChild(p);
  return id;
}

/** Diseño propio: la imagen se repite a lo largo de la cinta. `url` es la imagen (blob:). */
export function tapeImageDefs(defs, item, url) {
  const id = `tapeimg-${item.m}-${Math.round(item.w)}`;
  let p = defs.querySelector(`#${CSS.escape(id)}`);
  if (!p) {
    const tw = item.w * item.a;
    p = svg('pattern', { id, width: tw, height: item.w, y: -item.w / 2, patternUnits: 'userSpaceOnUse' }, svg('image', { width: tw, height: item.w, preserveAspectRatio: 'none', opacity: 0.88 }));
    defs.appendChild(p);
  }
  if (url) p.firstChild.setAttribute('href', url);
  return id;
}

/** Cinta recta entre dos puntos, con bordes dentados como la de papel. */
export function tapeShape(item, defs, fillId = null) {
  const [x1, y1, , x2, y2] = item.p;
  const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const w = item.w;
  const tooth = 5;
  let d = `M0 ${-w / 2}H${len}`;
  for (let y = -w / 2; y < w / 2; y += tooth * 2) d += `L${len - tooth} ${Math.min(w / 2, y + tooth)}L${len} ${Math.min(w / 2, y + tooth * 2)}`;
  d += `H0`;
  for (let y = w / 2; y > -w / 2; y -= tooth * 2) d += `L${tooth} ${Math.max(-w / 2, y - tooth)}L0 ${Math.max(-w / 2, y - tooth * 2)}`;
  d += 'Z';
  return svg('path', { d, fill: `url(#${fillId ?? tapeDefs(defs, item.k, item.c)})`, transform: `translate(${x1} ${y1}) rotate(${ang})` });
}

// ─────────────────────────── Stickers ───────────────────────────
// Cada sticker se dibuja en una caja de 100 × 100 y se escala.

const star = (fill) => svg('path', { d: 'M50 6l12.6 27.4 29.8 3.4-22.2 20.2 6.2 29.4L50 71.6 23.6 86.4l6.2-29.4L7.6 36.8l29.8-3.4z', fill, stroke: '#3b2a10', 'stroke-width': 3, 'stroke-linejoin': 'round' });

export const STICKERS = {
  star: { label: 'Estrella', draw: () => [star('#ffd23f')] },
  heart: { label: 'Corazón', draw: () => [svg('path', { d: 'M50 88C20 66 6 50 6 32a20 20 0 0 1 44-10 20 20 0 0 1 44 10c0 18-14 34-44 56z', fill: '#ff6b81', stroke: '#7a1f33', 'stroke-width': 3, 'stroke-linejoin': 'round' })] },
  check: { label: 'Bien', draw: () => [svg('circle', { cx: 50, cy: 50, r: 44, fill: '#3ddc97', stroke: '#14573a', 'stroke-width': 3 }), svg('path', { d: 'M28 52l15 15 30-34', fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })] },
  sakura: {
    label: 'Flor de cerezo',
    draw: () => {
      const g = svg('g', {});
      for (let i = 0; i < 5; i++) g.appendChild(svg('path', { d: 'M50 50C38 38 36 18 46 8l4 6 4-6c10 10 8 30-4 42z', fill: '#ffc2d4', stroke: '#c2507a', 'stroke-width': 2.5, transform: `rotate(${i * 72} 50 50)` }));
      g.appendChild(svg('circle', { cx: 50, cy: 50, r: 7, fill: '#ffd23f' }));
      return [g];
    },
  },
  hanko: {
    label: 'Sello よくできました',
    draw: () => {
      const t = svg('text', { x: 50, y: 58, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 700, fill: '#d0302f', 'font-family': 'system-ui, sans-serif' });
      t.textContent = 'よくできました';
      return [svg('circle', { cx: 50, cy: 50, r: 44, fill: 'none', stroke: '#d0302f', 'stroke-width': 5 }), svg('circle', { cx: 50, cy: 50, r: 37, fill: 'none', stroke: '#d0302f', 'stroke-width': 1.5 }), t];
    },
  },
  ganbare: {
    label: 'がんばれ',
    draw: () => {
      const t = svg('text', { x: 50, y: 60, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#ffffff', 'font-family': 'system-ui, sans-serif' });
      t.textContent = 'がんばれ';
      return [svg('rect', { x: 4, y: 26, width: 92, height: 48, rx: 24, fill: '#7b4dd8', stroke: '#3a2270', 'stroke-width': 3 }), t];
    },
  },
  bulb: { label: 'Idea', draw: () => [svg('path', { d: 'M50 8a30 30 0 0 0-18 54c4 4 6 8 6 14h24c0-6 2-10 6-14A30 30 0 0 0 50 8z', fill: '#fff3a3', stroke: '#6b5a10', 'stroke-width': 3 }), svg('rect', { x: 38, y: 80, width: 24, height: 12, rx: 3, fill: '#9aa0b4', stroke: '#4a4f60', 'stroke-width': 3 })] },
  pin: { label: 'Importante', draw: () => [svg('circle', { cx: 50, cy: 34, r: 24, fill: '#ff5d73', stroke: '#7a1f33', 'stroke-width': 3 }), svg('path', { d: 'M50 58v36', stroke: '#4a4f60', 'stroke-width': 5, 'stroke-linecap': 'round' }), svg('circle', { cx: 42, cy: 26, r: 6, fill: '#fff', 'fill-opacity': 0.6 })] },
  arrow: { label: 'Flecha', draw: () => [svg('path', { d: 'M8 42h56V22l28 28-28 28V58H8z', fill: '#4cc9f0', stroke: '#145a70', 'stroke-width': 3, 'stroke-linejoin': 'round' })] },
  question: {
    label: 'Duda',
    draw: () => {
      const t = svg('text', { x: 50, y: 66, 'text-anchor': 'middle', 'font-size': 48, 'font-weight': 800, fill: '#ffffff', 'font-family': 'system-ui, sans-serif' });
      t.textContent = '?';
      return [svg('path', { d: 'M50 8c24 0 42 15 42 34S74 76 50 76c-5 0-10-1-14-2L16 90l5-20C12 63 8 53 8 42 8 23 26 8 50 8z', fill: '#ff9f1c', stroke: '#6b3f05', 'stroke-width': 3 }), t];
    },
  },
};

/** Sticker colocado: { t: 'st', k, x, y, s (tamaño en unidades), r (giro en grados) }. */
export function stickerShape(item) {
  const def = STICKERS[item.k] ?? STICKERS.star;
  return svg('g', { transform: `translate(${item.x} ${item.y}) rotate(${item.r ?? 0}) scale(${item.s / 100}) translate(-50 -50)` }, ...def.draw());
}

/** Vista previa de un sticker para la paleta. */
export function stickerPreview(k, size = 44) {
  return svg('svg', { viewBox: '0 0 100 100', width: size, height: size, 'aria-hidden': 'true' }, ...STICKERS[k].draw());
}

/** Vista previa chica de una hoja (para elegir el tipo). */
export function paperPreview(paper, bg = '#ffffff') {
  const s = svg('svg', { viewBox: '0 0 1000 1414', class: 'paper-preview', 'aria-hidden': 'true' });
  const g = svg('g', {});
  s.appendChild(g);
  drawPaper(g, paper, 1414, bg);
  return s;
}
