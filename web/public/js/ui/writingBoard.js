// Pizarra de escritura: muestra la guía, anima los trazos y corrige lo dibujado
// trazo por trazo (dedo, mouse o Apple Pencil). La usan "Escritura" (con guía y
// animación) y "Kanji de memoria" (en blanco, más permisiva).
//
// Coordenadas internas: cuadrícula de KanjiVG (109 × 109).

import { compareStroke, estimateTransform, GRID } from '../core/strokes.js';
import { samplePath } from '../services/strokeData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/**
 * @param {HTMLElement} host
 * @param {string[]} strokes trazos de referencia (atributo d de SVG), en orden.
 * @param {object} opts
 * @param {boolean} [opts.guide] mostrar el carácter de fondo.
 * @param {number} [opts.leniency] margen de error (1 = normal).
 * @param {(done: number, total: number) => void} [opts.onProgress] después de cada trazo bien hecho.
 * @param {(message: string) => void} [opts.onMessage] avisos de error.
 * @param {(result: {mistakes: number, hints: number}) => void} opts.onDone al completar el carácter.
 * @param {'tick' | 'none'} [opts.finish] qué mostrar al terminar.
 */
export function createBoard(host, strokes, { guide = false, leniency = 1, onProgress, onMessage, onDone, finish = 'tick' }) {
  const refs = strokes.map((d) => samplePath(d));
  const svg = svgEl('svg', { viewBox: `0 0 ${GRID} ${GRID}`, class: 'board', role: 'img', 'aria-label': `Pizarra de escritura, ${strokes.length} trazos` });
  const gridLayer = svgEl('g', { class: 'board__grid' });
  for (const [x1, y1, x2, y2] of [[54.5, 0, 54.5, 109], [0, 54.5, 109, 54.5]]) gridLayer.appendChild(svgEl('line', { x1, y1, x2, y2 }));
  const guideLayer = svgEl('g', { class: 'board__guide' });
  const doneLayer = svgEl('g', { class: 'board__done' });
  const animLayer = svgEl('g', { class: 'board__anim' });
  const inkLayer = svgEl('g', { class: 'board__ink' });
  const markLayer = svgEl('g', { class: 'board__marks' });
  svg.append(gridLayer, guideLayer, doneLayer, animLayer, inkLayer, markLayer);
  strokes.forEach((d) => guideLayer.appendChild(svgEl('path', { d })));
  guideLayer.style.setProperty('opacity', guide ? '1' : '0');
  host.replaceChildren(svg);

  let current = 0;
  let accepted = []; // trazos que salieron bien: { user, ref } (para ajustarse a tu letra)
  let mistakes = 0;
  let hints = 0;
  let missesOnStroke = 0;
  let penSeen = false;
  let drawing = null;
  let animToken = 0;
  let finished = false;

  const progress = () => onProgress?.(current, strokes.length);

  function toGrid(e) {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  async function animateStroke(layerEl, d, className, duration) {
    const path = svgEl('path', { d, class: className });
    layerEl.appendChild(path);
    const len = path.getTotalLength();
    path.style.setProperty('stroke-dasharray', String(len));
    path.style.setProperty('stroke-dashoffset', String(len));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      path.style.setProperty('stroke-dashoffset', '0');
      return path;
    }
    const anim = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: duration ?? Math.max(280, len * 9), easing: 'ease-in-out', fill: 'forwards' });
    await anim.finished.catch(() => {});
    return path;
  }

  /** Anima todos los trazos en orden, con su número. */
  async function animate({ keep = false } = {}) {
    const token = ++animToken;
    animLayer.replaceChildren();
    for (let i = 0; i < strokes.length; i++) {
      if (token !== animToken) return;
      const p = await animateStroke(animLayer, strokes[i], 'board__anim-stroke');
      if (token !== animToken) return;
      const start = refs[i][0];
      const label = svgEl('text', { x: start.x - 3, y: start.y - 3, class: 'board__num' });
      label.textContent = String(i + 1);
      animLayer.appendChild(label);
      p.classList.add('is-drawn');
    }
    if (token !== animToken || keep) return;
    setTimeout(() => token === animToken && animLayer.replaceChildren(), 900);
  }

  function stopAnimation() {
    animToken += 1;
    animLayer.replaceChildren();
  }

  /** Muestra (animado) el trazo que toca ahora. */
  function hintStroke({ count = true } = {}) {
    if (finished) return;
    if (count) hints += 1;
    const token = ++animToken;
    animLayer.replaceChildren();
    animateStroke(animLayer, strokes[current], 'board__hint-stroke', 700).then(() => {
      setTimeout(() => token === animToken && animLayer.replaceChildren(), 700);
    });
  }

  function complete() {
    finished = true;
    svg.classList.add('is-finished');
    if (finish === 'tick') {
      const big = svgEl('g', { class: 'board__tick' });
      big.append(svgEl('circle', { cx: 92, cy: 17, r: 11 }), svgEl('path', { d: 'M86.5,17.5 l4,4 l7.5,-9' }));
      markLayer.appendChild(big);
    }
    onDone({ mistakes, hints });
  }

  function onDown(e) {
    if (finished || e.button > 0) return;
    if (e.pointerType === 'pen') penSeen = true;
    if (penSeen && e.pointerType === 'touch') return; // rechazo de palma con Apple Pencil
    e.preventDefault();
    stopAnimation();
    svg.setPointerCapture(e.pointerId);
    const p = toGrid(e);
    if (!p) return;
    const line = svgEl('polyline', { class: 'board__ink-stroke', points: `${p.x},${p.y}` });
    inkLayer.appendChild(line);
    drawing = { id: e.pointerId, points: [p], line };
  }

  function onMove(e) {
    if (!drawing || e.pointerId !== drawing.id) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() ?? [e];
    for (const ev of events.length ? events : [e]) {
      const p = toGrid(ev);
      if (p) drawing.points.push(p);
    }
    drawing.line.setAttribute('points', drawing.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  }

  function onUp(e) {
    if (!drawing || e.pointerId !== drawing.id) return;
    const { points, line } = drawing;
    drawing = null;
    if (points.length < 2) points.push({ ...points[0] });
    const result = compareStroke(points, refs[current], {
      transform: accepted.length ? estimateTransform(accepted) : null,
      later: refs.slice(current + 1),
      leniency,
    });
    if (result.ok) {
      accepted.push({ user: points, ref: refs[current] });
      // Tu trazo queda, en verde, con un tick chico al final.
      line.classList.add('is-right');
      doneLayer.appendChild(line);
      const end = points.at(-1);
      const tick = svgEl('path', { d: `M${end.x + 2},${end.y - 1} l2.2,2.4 l4.4,-5`, class: 'board__mini-tick' });
      markLayer.appendChild(tick);
      setTimeout(() => tick.remove(), 700);
      current += 1;
      missesOnStroke = 0;
      progress();
      if (current === strokes.length) complete();
      return;
    }
    mistakes += 1;
    missesOnStroke += 1;
    line.classList.add('is-wrong');
    setTimeout(() => line.remove(), 450);
    onMessage?.(
      result.reversed
        ? `Trazo ${current + 1}: va en la otra dirección.`
        : result.wrongOrder
          ? `Trazo ${current + 1}: ese trazo va después. Fijate el orden.`
          : `Trazo ${current + 1}: no coincide. Fijate el orden y la posición.`,
    );
    if (missesOnStroke >= 2) hintStroke({ count: false });
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', () => {
    drawing?.line.remove();
    drawing = null;
  });
  progress();

  return {
    animate,
    hint: () => hintStroke(),
    /** Muestra el carácter completo (cuando no te acordás). */
    reveal() {
      hints += strokes.length - current;
      return animate({ keep: true });
    },
    setGuide: (on) => guideLayer.style.setProperty('opacity', on ? '1' : '0'),
    get finished() {
      return finished;
    },
    restart() {
      stopAnimation();
      doneLayer.replaceChildren();
      inkLayer.replaceChildren();
      markLayer.replaceChildren();
      current = 0;
      accepted = [];
      mistakes = 0;
      hints = 0;
      missesOnStroke = 0;
      finished = false;
      svg.classList.remove('is-finished');
      progress();
    },
    destroy() {
      stopAnimation();
    },
  };
}
