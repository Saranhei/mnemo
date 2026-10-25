// Mini ayudante para crear elementos del DOM de forma segura.
//
// Regla de seguridad de toda la app: el texto del usuario se inserta SIEMPRE como
// nodo de texto (nunca con innerHTML), así una tarjeta con "<script>" se muestra
// tal cual y no se ejecuta.

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate']);

/**
 * h('button', { class: 'btn', onClick: fn, 'aria-label': 'Cerrar' }, 'texto', otroNodo)
 * - `style`: objeto de variables/propiedades CSS → el.style.setProperty (compatible con CSP).
 * - `on*`: listeners.  - strings y números en children → nodos de texto.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (PROPS.has(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ─────────────────────────────── Íconos ───────────────────────────────
// Trazos SVG de 24×24, dibujados con `currentColor`. Datos fijos (no vienen del usuario).

const ICONS = {
  decks: ['M5 9h14v11H5z', 'M7 6h10', 'M9 3h6'],
  timer: ['M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M12 9v4l2.5 2', 'M9.5 2h5'],
  sessions: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3 4v5h5', 'M12 8v4.5l3 1.8'],
  settings: ['M4 7h10', 'M18 7h2', 'M4 17h4', 'M12 17h8', 'M16 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M10 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  book: ['M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z', 'M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5', 'M9 8h7', 'M9 12h5'],
  grid: ['M4 4h16v16H4z', 'M12 4v16', 'M4 12h16'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-4-4'],
  speaker: ['M11 5L6.5 9H3v6h3.5L11 19z', 'M15.5 9a4.5 4.5 0 0 1 0 6', 'M18.5 6a8.5 8.5 0 0 1 0 12'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  share: ['M12 3v12', 'M8 7l4-4 4 4', 'M5 12v8h14v-8'],
  import: ['M12 3v12', 'M8 11l4 4 4-4', 'M5 15v5h14v-5'],
  play: ['M8 5l11 7-11 7z'],
  pause: ['M8 5v14', 'M16 5v14'],
  skip: ['M6 5l9 7-9 7z', 'M18 5v14'],
  reset: ['M3.5 12a8.5 8.5 0 1 0 2.6-6.1', 'M3 4v5h5'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H12'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  sync: ['M20 11a8 8 0 0 0-14.3-4.9L4 8', 'M4 3v5h5', 'M4 13a8 8 0 0 0 14.3 4.9L20 16', 'M20 21v-5h-5'],
  note: ['M5 4h11l3 3v13H5z', 'M9 10h6', 'M9 14h6'],
  practice: ['M4 20l4-1L19 8l-3-3L5 16z', 'M14 7l3 3', 'M4 20h16'],
  pen: ['M12 19l7-7 3 3-7 7z', 'M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z', 'M2 2l7.6 7.6', 'M11 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  mic: ['M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z', 'M19 11a7 7 0 0 1-14 0', 'M12 18v3'],
  headphones: ['M4 18v-5a8 8 0 0 1 16 0v5', 'M20 19a2 2 0 0 1-2 2h-1v-6h3z', 'M4 19a2 2 0 0 0 2 2h1v-6H4z'],
  question: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  next: ['M9 18l6-6-6-6'],
  stop: ['M7 7h10v10H7z'],
  shuffle: ['M16 3h5v5', 'M4 20L21 3', 'M21 16v5h-5', 'M15 15l6 6', 'M4 4l5 5'],
  // Tipos de palabra: la forma refuerza el color (el color nunca va solo).
  noun: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M12 12l8-4.5', 'M12 12v9', 'M12 12L4 7.5'],
  verb: ['M13 2L4.5 13.5H11L10 22l8.5-11.5H12z'],
  adjective: ['M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z'],
  phrase: ['M6 7h4v4c0 3-1.6 5-4 6', 'M14 7h4v4c0 3-1.6 5-4 6'],
  character: ['M5.5 20L12 4l6.5 16', 'M8 14h8'],
  other: ['M12 2.5l8.5 5v9l-8.5 5-8.5-5v-9z'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, { size = 22, label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of ICONS[name] ?? ICONS.other) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}

// ───────────────────────────── Formato ─────────────────────────────

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const languageNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'language' });
  } catch {
    return null;
  }
})();

export function languageName(code) {
  try {
    const name = languageNames?.of(code);
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** "en 3 días", "mañana", "hace 2 horas" */
export function relativeTime(ts, now = Date.now()) {
  const diff = ts - now;
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'ahora';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return rtf.format(Math.round(diff / (30 * 86_400_000)), 'month');
}

export function formatDateTime(ts) {
  return new Date(ts).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export const plural = (n, one, many) => `${n.toLocaleString('es-AR')} ${n === 1 ? one : many}`;
