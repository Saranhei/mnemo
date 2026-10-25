// Kanji de memoria: se muestra el significado y las lecturas, y hay que escribir el
// kanji en una cuadrícula en blanco, sin guía. La corrección es trazo por trazo pero
// más permisiva que en Escritura (vale torcido, chico o corrido). Al final, un
// resumen con la precisión y cómo salió cada kanji.

import { h, icon, plural } from '../../ui/dom.js';
import { field } from '../../ui/components.js';
import { openSheet, toast } from '../../ui/overlays.js';
import { openLayer, resultPanel } from '../../ui/layer.js';
import { createBoard } from '../../ui/writingBoard.js';
import { kanjiSources, openNewListSheet } from '../../ui/kanjiLists.js';
import { readPref, writePref } from '../../data/storage.js';
import { shuffle } from '../../core/practice.js';
import { loadStrokes } from '../../services/strokeData.js';
import { kanjiDetails } from '../../services/kanjiDetails.js';
import { sayJapanese } from '../../services/voice.js';

const LENIENCY = 1.25;
const ADVANCE_MS = 1300;

// ───────────────────────────── Estadísticas ─────────────────────────────

const recallStats = () => readPref('recallStats', {});

/** Qué tanto cuesta un kanji (0 = sale siempre perfecto, 1 = nunca). Los nuevos quedan al medio. */
export function difficulty(stat) {
  if (!stat || !stat.n) return 0.5;
  return 1 - stat.perfect / stat.n;
}

function record(ch, grade) {
  const all = recallStats();
  const s = all[ch] ?? { n: 0, perfect: 0 };
  s.n += 1;
  if (grade === 'perfect') s.perfect += 1;
  s.last = grade;
  all[ch] = s;
  writePref('recallStats', all);
}

/**
 * Nota de un kanji: perfecto (sin errores ni pistas), bien (algún error), con ayuda
 * (pidió pistas o no se acordó).
 */
export function gradeOf({ mistakes, hints }) {
  if (hints > 0) return 'helped';
  return mistakes === 0 ? 'perfect' : 'good';
}

const GRADE = {
  perfect: { mark: '◎', label: 'Perfecto' },
  good: { mark: '○', label: 'Bien, con errores' },
  helped: { mark: '△', label: 'Con ayuda' },
};

// ───────────────────────────── Elegir qué practicar ─────────────────────────────

export function openRecallSheet(ctx) {
  const sources = kanjiSources();
  if (sources.length === 0) {
    toast('Primero armá una lista de kanji (o importá un mazo con kanji).');
    openNewListSheet({ onDone: () => openRecallSheet(ctx) });
    return;
  }
  openSheet({
    title: 'Kanji de memoria',
    build: (close) => {
      const saved = readPref('recall.source', '');
      const srcSel = h(
        'select',
        { class: 'input', id: 'recall-src' },
        sources.map((s) => h('option', { value: s.id, selected: s.id === saved }, `${s.label} (${s.chars.length})`)),
      );
      const countSel = h(
        'select',
        { class: 'input', id: 'recall-count' },
        [10, 20, 0].map((n) => h('option', { value: n, selected: n === readPref('recall.count', 10) }, n ? `${n}` : 'Todos')),
      );
      const orderSel = h(
        'select',
        { class: 'input', id: 'recall-order' },
        [
          ['hard', 'Primero los que más me cuestan'],
          ['random', 'Al azar'],
          ['list', 'En el orden de la lista'],
        ].map(([v, label]) => h('option', { value: v, selected: v === readPref('recall.order', 'hard') }, label)),
      );
      const start = (e) => {
        e.preventDefault();
        const src = sources.find((s) => s.id === srcSel.value);
        const n = Number(countSel.value);
        const order = orderSel.value;
        writePref('recall.source', src.id);
        writePref('recall.count', n);
        writePref('recall.order', order);
        const st = recallStats();
        let chars = order === 'list' ? [...src.chars] : shuffle(src.chars);
        if (order === 'hard') chars = chars.sort((a, b) => difficulty(st[b]) - difficulty(st[a]));
        if (n) chars = chars.slice(0, n);
        close();
        runRecall(ctx, chars);
      };
      return h(
        'form',
        { class: 'stack', novalidate: true, onSubmit: start },
        h('p', { class: 'muted' }, 'Te muestro el significado y las lecturas; vos escribís el kanji sin guía. Vale aunque salga torcido o chico, siempre que los trazos vayan en orden.'),
        field({ id: 'recall-src', label: 'Kanji de', control: srcSel }),
        field({ id: 'recall-count', label: 'Cantidad', control: countSel }),
        field({ id: 'recall-order', label: 'Orden', control: orderSel }),
        h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('play', { size: 18 }), 'Empezar'),
      );
    },
  });
}

// ───────────────────────────── Práctica ─────────────────────────────

function readingChips(list, cls) {
  return list.map((r) => h('span', { class: `reading-chip ${cls}`, lang: 'ja' }, r));
}

export function runRecall(ctx, chars) {
  let index = 0;
  let board = null;
  let advanceTimer = null;
  const results = []; // { ch, grade, strokes, mistakes, hints, meaning }
  const cancelAdvance = () => clearTimeout(advanceTimer);

  const layer = openLayer({
    title: 'Kanji de memoria',
    onKey: (e) => {
      if (e.key === 'ArrowRight') next();
    },
    onClose: () => {
      cancelAdvance();
      board?.destroy();
    },
  });

  function next() {
    cancelAdvance();
    index += 1;
    if (index >= chars.length) showSummary();
    else show();
  }

  async function show() {
    board?.destroy();
    board = null;
    layer.clear();
    const ch = chars[index];
    layer.setStatus(`${index + 1} de ${chars.length}`);
    layer.setProgress(index / chars.length);

    const meaning = h('p', { class: 'recall__meaning' }, '…');
    const readings = h('div', { class: 'recall__readings' });
    const status = h('p', { class: 'write__status', role: 'status' });
    const answer = h('p', { class: 'recall__answer', lang: 'ja', hidden: true }, ch);
    const boardHost = h('div', { class: 'write__board' });
    const hintBtn = h('button', { class: 'btn btn--ghost', type: 'button', id: 'recall-hint' }, icon('question', { size: 18 }), 'Pista');
    const revealBtn = h('button', { class: 'btn btn--ghost', type: 'button', id: 'recall-reveal' }, icon('eye', { size: 18 }), 'No me acuerdo');
    const listenBtn = h('button', { class: 'btn btn--ghost', type: 'button', disabled: true }, icon('speaker', { size: 18 }), 'Escuchar');
    const nextBtn = h('button', { class: 'btn btn--primary', type: 'button', id: 'recall-next', onClick: next }, index === chars.length - 1 ? 'Terminar' : 'Saltar', icon('next', { size: 18 }));

    layer.body.appendChild(
      h(
        'div',
        { class: 'write write--recall' },
        boardHost,
        h(
          'aside',
          { class: 'write__info' },
          h('div', { class: 'recall__prompt' }, meaning, readings, answer),
          status,
          h(
            'div',
            { class: 'write__tools' },
            hintBtn,
            revealBtn,
            listenBtn,
            h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => !board?.finished && (board?.restart(), (answer.hidden = true)) }, icon('reset', { size: 18 }), 'Borrar'),
          ),
          h('div', { class: 'write__nav write__nav--single' }, nextBtn),
        ),
      ),
    );

    const [d, strokes] = await Promise.all([kanjiDetails(ch), loadStrokes(ch)]);
    if (chars[index] !== ch || !layer.body.isConnected) return;
    meaning.textContent = d.meaning || '(sin significado cargado)';
    if (d.meaningLang === 'en') meaning.append(' ', h('span', { class: 'tag' }, 'EN'));
    readings.replaceChildren(...readingChips(d.on, 'reading-chip--on'), ...readingChips(d.kun, 'reading-chip--kun'));
    if (d.speak) {
      listenBtn.disabled = false;
      listenBtn.addEventListener('click', () => sayJapanese(d.speak));
    }
    if (!strokes) {
      status.textContent = navigator.onLine ? 'No hay datos de trazos para este kanji.' : 'Sin conexión: este kanji todavía no se descargó.';
      answer.hidden = false;
      return;
    }

    board = createBoard(boardHost, strokes, {
      leniency: LENIENCY,
      finish: 'none',
      onProgress: (done) => {
        status.className = 'write__status';
        status.textContent = done ? `Trazos: ${done}` : 'Escribí el kanji.';
      },
      onMessage: (text) => (status.textContent = text),
      onDone: (r) => {
        const grade = gradeOf(r);
        record(ch, grade);
        results.push({ ch, grade, strokes: strokes.length, mistakes: r.mistakes, hints: r.hints, meaning: d.meaning });
        answer.hidden = false;
        status.textContent = `${GRADE[grade].mark} ${GRADE[grade].label}`;
        status.className = `write__status write__status--${grade === 'perfect' ? 'ok' : grade === 'good' ? 'warn' : 'bad'}`;
        stamp(boardHost, grade);
        nextBtn.firstChild.textContent = index === chars.length - 1 ? 'Terminar' : 'Siguiente';
        advanceTimer = setTimeout(() => {
          if (chars[index] === ch && layer.body.isConnected) next();
        }, ADVANCE_MS);
      },
    });
    hintBtn.addEventListener('click', () => board?.hint());
    revealBtn.addEventListener('click', async () => {
      if (!board || board.finished) return;
      answer.hidden = false;
      status.textContent = 'Así se escribe. Copialo trazo por trazo para seguir.';
      await board.reveal();
    });
  }

  function showSummary() {
    board?.destroy();
    layer.clear();
    layer.setProgress(1);
    const total = results.reduce((s, r) => s + r.strokes, 0);
    const misses = results.reduce((s, r) => s + r.mistakes + r.hints, 0);
    const accuracy = total ? Math.round((total / (total + misses)) * 1000) / 10 : 0;
    const perfect = results.filter((r) => r.grade === 'perfect').length;
    const toRepeat = results.filter((r) => r.grade !== 'perfect').map((r) => r.ch);
    layer.body.append(
      resultPanel({
        title: results.length ? `${String(accuracy).replace('.', ',')} % de precisión` : 'Sin kanji escritos',
        text: `${plural(results.length, 'kanji escrito', 'kanji escritos')}, ${perfect} perfectos.`,
        tone: accuracy >= 85 || !results.length ? 'good' : 'retry',
        actions: [
          toRepeat.length
            ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (layer.close(), runRecall(ctx, shuffle(toRepeat))) }, `Repetir los que costaron (${toRepeat.length})`)
            : null,
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => layer.close() }, 'Listo'),
        ],
      }),
      h(
        'ul',
        { class: 'recall-summary' },
        results.map((r) =>
          h(
            'li',
            { class: `recall-summary__row is-${r.grade}` },
            h('span', { class: 'recall-summary__ch', lang: 'ja' }, r.ch),
            h('span', { class: 'recall-summary__meaning' }, r.meaning),
            h('span', { class: 'recall-summary__mark', title: GRADE[r.grade].label, 'aria-label': GRADE[r.grade].label }, GRADE[r.grade].mark),
          ),
        ),
      ),
    );
  }

  show();
}

/** Sello sobre la pizarra al terminar (como el hanko de las apps japonesas). */
function stamp(host, grade) {
  const el = h('span', { class: `recall-stamp recall-stamp--${grade}`, 'aria-hidden': 'true' }, GRADE[grade].mark);
  host.classList.add('has-stamp');
  host.appendChild(el);
}
