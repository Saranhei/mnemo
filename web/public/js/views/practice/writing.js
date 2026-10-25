// Escritura: animación del orden de trazos y práctica a mano (dedo o Apple Pencil)
// con corrección trazo por trazo.

import { h, icon, clear, plural } from '../../ui/dom.js';
import { screenHeader } from '../../ui/components.js';
import { openLayer, resultPanel } from '../../ui/layer.js';
import * as store from '../../data/store.js';
import { readPref, writePref } from '../../data/storage.js';
import { liveDecks, deckCards } from '../../core/model.js';
import { HIRAGANA, HIRAGANA_DAKUTEN, KATAKANA, KATAKANA_DAKUTEN, romajiOfKana, isKanji, kataToHira } from '../../core/japanese.js';
import { compareStroke, GRID } from '../../core/strokes.js';
import { charactersFromCards, parseKanjiExamples, shuffle } from '../../core/practice.js';
import { loadStrokes, samplePath } from '../../services/strokeData.js';
import { sayJapanese } from '../../services/voice.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

// ───────────────────────────── Idiomas ─────────────────────────────
// Cada idioma define sus conjuntos de caracteres y de dónde salen los trazos.
// Para sumar otro (chino, coreano...), agregar una entrada acá con su fuente de trazos.

const WRITING_LANGUAGES = [{ code: 'ja', label: 'Japonés', sets: japaneseSets, loadStrokes }];

function currentLanguage() {
  const code = readPref('writeLang', 'ja');
  return WRITING_LANGUAGES.find((l) => l.code === code) ?? WRITING_LANGUAGES[0];
}

// ───────────────────────────── Conjuntos de caracteres ─────────────────────────────

function japaneseSets() {
  const sets = [
    { id: 'hiragana', label: 'Hiragana', chars: HIRAGANA.map((k) => k.char) },
    { id: 'hiragana-d', label: 'Hiragana ゛゜', chars: HIRAGANA_DAKUTEN.map((k) => k.char) },
    { id: 'katakana', label: 'Katakana', chars: KATAKANA.map((k) => k.char) },
    { id: 'katakana-d', label: 'Katakana ゛゜', chars: KATAKANA_DAKUTEN.map((k) => k.char) },
  ];
  const state = store.getState();
  for (const deck of liveDecks(state).filter((d) => d.languageCode.startsWith('ja'))) {
    const chars = charactersFromCards(deckCards(state, deck.id));
    if (chars.length) sets.push({ id: `deck:${deck.id}`, label: deck.name, chars, deck: true });
  }
  return sets;
}

/** Datos para mostrar de un carácter: lectura, significado y qué decir en voz alta. */
function characterInfo(ch) {
  if (!isKanji(ch)) {
    const romaji = romajiOfKana(ch);
    return { title: ch, lines: [romaji && `Se lee “${romaji}”`, ch !== kataToHira(ch) ? `Hiragana: ${kataToHira(ch)}` : ''], speak: ch };
  }
  const card = store
    .getState()
    .cards.find((c) => !c.deleted && c.kind === 'character' && c.front === ch);
  if (!card) return { title: ch, lines: ['Kanji'], speak: '' };
  const example = parseKanjiExamples(card.example)[0];
  return {
    title: ch,
    lines: [card.back, card.pronunciation, example ? `${example.word} (${example.readings[0]}) ${example.meaning}` : ''],
    speak: example?.readings[0] ?? '',
  };
}

const stats = () => readPref('writeStats', {});
function recordResult(ch, mistakes) {
  const all = stats();
  const s = all[ch] ?? { done: 0, perfect: 0 };
  s.done += 1;
  if (mistakes === 0) s.perfect += 1;
  all[ch] = s;
  writePref('writeStats', all);
}

// ───────────────────────────── Pantalla de selección ─────────────────────────────

let currentSet = 'hiragana';

export function writingView(ctx) {
  const language = currentLanguage();
  const sets = language.sets();
  if (!sets.some((s) => s.id === currentSet)) currentSet = sets[0].id;
  const set = sets.find((s) => s.id === currentSet);
  const st = stats();

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: 'Escritura',
      subtitle: 'Tocá un carácter para ver cómo se escribe y practicarlo. Con Apple Pencil, la palma no molesta.',
      back: { label: 'Práctica', onClick: () => ctx.navigate('practice') },
    }),
    h(
      'label',
      { class: 'lang-picker', for: 'write-lang' },
      h('span', { class: 'field__label' }, 'Idioma'),
      h(
        'select',
        {
          class: 'input',
          id: 'write-lang',
          onChange: (e) => {
            writePref('writeLang', e.target.value);
            currentSet = null;
            ctx.refresh();
          },
        },
        WRITING_LANGUAGES.map((l) => h('option', { value: l.code, selected: l.code === language.code }, l.label)),
      ),
    ),
    h(
      'div',
      { class: 'set-chips', role: 'tablist', 'aria-label': 'Conjunto de caracteres' },
      sets.map((s) =>
        h(
          'button',
          {
            class: `set-chip${s.id === currentSet ? ' is-on' : ''}`,
            type: 'button',
            role: 'tab',
            'aria-selected': String(s.id === currentSet),
            onClick: () => {
              currentSet = s.id;
              ctx.refresh();
            },
          },
          s.label,
          h('span', { class: 'set-chip__n' }, s.chars.length),
        ),
      ),
    ),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openWriting(ctx, set.chars, 0) }, icon('play', { size: 18 }), 'Practicar en orden'),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => openWriting(ctx, shuffle(set.chars), 0) }, icon('shuffle', { size: 18 }), 'Al azar'),
    ),
    h(
      'ul',
      { class: 'char-grid' },
      set.chars.map((ch, i) => {
        const s = st[ch];
        return h(
          'li',
          {},
          h(
            'button',
            { class: `char-cell${s?.perfect ? ' is-mastered' : s ? ' is-tried' : ''}`, type: 'button', onClick: () => openWriting(ctx, set.chars, i), 'aria-label': `${ch}${s ? `, practicado ${s.done} veces` : ''}` },
            h('span', { class: 'char-cell__ch', lang: 'ja' }, ch),
            !isKanji(ch) ? h('span', { class: 'char-cell__sub' }, romajiOfKana(ch)) : null,
          ),
        );
      }),
    ),
    h('p', { class: 'field__hint' }, 'Trazos: KanjiVG, © Ulrich Apel y colaboradores, licencia CC BY-SA 3.0.'),
  );
}

// ───────────────────────────── Práctica de un carácter ─────────────────────────────

function openWriting(ctx, chars, start) {
  let index = start;
  let guide = readPref('writeGuide', true);
  let results = { done: 0, perfect: 0 };
  let board = null;
  let advanceTimer = null;
  const cancelAdvance = () => clearTimeout(advanceTimer);

  const layer = openLayer({
    title: 'Escritura',
    onKey: (e) => {
      if (e.target instanceof HTMLElement && e.target.matches('input, textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        board?.animate();
      }
    },
    onClose: () => {
      cancelAdvance();
      board?.destroy();
    },
  });

  const go = (delta) => {
    cancelAdvance();
    const next = index + delta;
    if (next < 0) return;
    if (next >= chars.length) return showSummary();
    index = next;
    show();
  };

  function showSummary() {
    board?.destroy();
    layer.clear();
    layer.setProgress(1);
    layer.body.appendChild(
      resultPanel({
        title: 'Terminaste la serie',
        text: `${plural(results.done, 'carácter', 'caracteres')} completados, ${results.perfect} sin errores.`,
        actions: [
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => ((index = 0), (results = { done: 0, perfect: 0 }), show()) }, 'Repetir'),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => (layer.close(), ctx.refresh()) }, 'Listo'),
        ],
      }),
    );
  }

  async function show() {
    board?.destroy();
    layer.clear();
    const ch = chars[index];
    layer.setStatus(`${index + 1} de ${chars.length}`);
    layer.setProgress(index / chars.length);
    const info = characterInfo(ch);

    const status = h('p', { class: 'write__status', role: 'status' }, 'Cargando trazos…');
    const boardHost = h('div', { class: 'write__board' });
    const guideBtn = h('button', { class: `btn btn--ghost${guide ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(guide) }, icon('eye', { size: 18 }), 'Guía');
    const panel = h(
      'aside',
      { class: 'write__info' },
      h('p', { class: 'write__char', lang: 'ja' }, info.title),
      h('div', { class: 'write__meta' }, info.lines.filter(Boolean).map((l) => h('p', {}, l))),
      status,
      h(
        'div',
        { class: 'write__tools' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => board?.animate() }, icon('play', { size: 18 }), 'Ver trazos'),
        h('button', { class: 'btn btn--ghost', type: 'button', disabled: !info.speak, onClick: () => sayJapanese(info.speak) }, icon('speaker', { size: 18 }), 'Escuchar'),
        guideBtn,
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (cancelAdvance(), board?.restart()) }, icon('reset', { size: 18 }), 'Reintentar'),
      ),
      h(
        'div',
        { class: 'write__nav' },
        h('button', { class: 'btn btn--ghost', type: 'button', disabled: index === 0, onClick: () => go(-1) }, icon('back', { size: 18 }), 'Anterior'),
        h('button', { class: 'btn btn--primary', type: 'button', id: 'write-next', onClick: () => go(1) }, index === chars.length - 1 ? 'Terminar' : 'Siguiente', icon('next', { size: 18 })),
      ),
    );
    layer.body.appendChild(h('div', { class: 'write' }, boardHost, panel));
    guideBtn.addEventListener('click', () => {
      guide = !guide;
      writePref('writeGuide', guide);
      guideBtn.classList.toggle('is-on', guide);
      guideBtn.setAttribute('aria-pressed', String(guide));
      board?.setGuide(guide);
    });

    if (info.speak) sayJapanese(info.speak);
    const strokes = await currentLanguage().loadStrokes(ch);
    if (chars[index] !== ch) return; // el usuario ya pasó a otro
    if (!strokes) {
      status.textContent = navigator.onLine ? 'No hay datos de trazos para este carácter.' : 'Sin conexión: este kanji todavía no se descargó.';
      return;
    }
    board = createBoard(boardHost, strokes, {
      guide,
      onStatus: (t) => (status.textContent = t),
      onDone: (mistakes) => {
        recordResult(ch, mistakes);
        results.done += 1;
        if (mistakes === 0) results.perfect += 1;
        status.textContent = mistakes === 0 ? '¡Perfecto! Sin errores.' : `¡Bien! Con ${plural(mistakes, 'error', 'errores')}.`;
        status.className = `write__status write__status--${mistakes === 0 ? 'ok' : 'warn'}`;
        // Pasa solo al siguiente después de mostrar el tick (se cancela si tocás algo).
        advanceTimer = setTimeout(() => {
          if (chars[index] === ch && layer.body.isConnected) go(1);
        }, 1400);
      },
    });
    board.animate();
  }

  show();
}

// ───────────────────────────── Pizarra ─────────────────────────────

/**
 * Pizarra de escritura: muestra la guía, anima los trazos y corrige lo dibujado.
 * Coordenadas internas: cuadrícula de KanjiVG (109 × 109).
 */
function createBoard(host, strokes, { guide, onStatus, onDone }) {
  const refs = strokes.map((d) => samplePath(d));
  const svg = svgEl('svg', { viewBox: `0 0 ${GRID} ${GRID}`, class: 'board', role: 'img', 'aria-label': `Pizarra de escritura, ${strokes.length} trazos` });
  const gridLayer = svgEl('g', { class: 'board__grid' });
  for (const [x1, y1, x2, y2] of [[54.5, 0, 54.5, 109], [0, 54.5, 109, 54.5]]) gridLayer.appendChild(svgEl('line', { x1, y1, x2, y2 }));
  const guideLayer = svgEl('g', { class: 'board__guide' });
  const doneLayer = svgEl('g', { class: 'board__done' });
  const animLayer = svgEl('g', { class: 'board__anim' });
  const inkLayer = svgEl('g', { class: 'board__ink' });
  svg.append(gridLayer, guideLayer, doneLayer, animLayer, inkLayer);
  strokes.forEach((d) => guideLayer.appendChild(svgEl('path', { d })));
  guideLayer.style.setProperty('opacity', guide ? '1' : '0');
  host.replaceChildren(svg);

  let current = 0;
  let mistakes = 0;
  let missesOnStroke = 0;
  let penSeen = false;
  let drawing = null;
  let animToken = 0;
  let finished = false;

  const status = () => onStatus(finished ? '' : `Trazo ${current + 1} de ${strokes.length}`);

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

  async function animate() {
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
    if (token !== animToken) return;
    setTimeout(() => token === animToken && animLayer.replaceChildren(), 900);
  }

  function stopAnimation() {
    animToken += 1;
    animLayer.replaceChildren();
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
    if (points.length < 2) {
      points.push({ ...points[0] });
    }
    const result = compareStroke(points, refs[current]);
    if (result.ok) {
      // Tu trazo queda, en verde, con un tick chico al final.
      line.classList.add('is-right');
      doneLayer.appendChild(line);
      const end = points.at(-1);
      const tick = svgEl('path', { d: `M${end.x + 2},${end.y - 1} l2.2,2.4 l4.4,-5`, class: 'board__mini-tick' });
      doneLayer.appendChild(tick);
      setTimeout(() => tick.remove(), 700);
      current += 1;
      missesOnStroke = 0;
      if (current === strokes.length) {
        finished = true;
        svg.classList.add('is-finished');
        const big = svgEl('g', { class: 'board__tick' });
        big.append(svgEl('circle', { cx: 92, cy: 17, r: 11 }), svgEl('path', { d: 'M86.5,17.5 l4,4 l7.5,-9' }));
        svg.appendChild(big);
        onDone(mistakes);
      } else status();
    } else {
      mistakes += 1;
      missesOnStroke += 1;
      line.classList.add('is-wrong');
      setTimeout(() => line.remove(), 450);
      onStatus(
        result.reversed
          ? `Trazo ${current + 1}: va en la otra dirección.`
          : `Trazo ${current + 1}: no coincide. Fijate el orden y la posición.`,
      );
      if (missesOnStroke >= 2) {
        const token = ++animToken;
        animLayer.replaceChildren();
        animateStroke(animLayer, strokes[current], 'board__hint-stroke', 700).then(() => {
          setTimeout(() => token === animToken && animLayer.replaceChildren(), 600);
        });
      }
    }
  }

  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', () => {
    drawing?.line.remove();
    drawing = null;
  });
  status();

  return {
    animate,
    setGuide: (on) => guideLayer.style.setProperty('opacity', on ? '1' : '0'),
    restart() {
      stopAnimation();
      doneLayer.replaceChildren();
      inkLayer.replaceChildren();
      current = 0;
      mistakes = 0;
      missesOnStroke = 0;
      finished = false;
      svg.classList.remove('is-finished');
      svg.querySelector('.board__tick')?.remove();
      status();
    },
    destroy() {
      stopAnimation();
    },
  };
}
