// Escritura: animación del orden de trazos y práctica a mano (dedo o Apple Pencil)
// con corrección trazo por trazo. Conjuntos: kana, tus listas de kanji y los kanji
// de tus mazos.

import { h, icon, plural } from '../../ui/dom.js';
import { screenHeader } from '../../ui/components.js';
import { openLayer, resultPanel } from '../../ui/layer.js';
import { createBoard } from '../../ui/writingBoard.js';
import { kanjiLists, kanjiSources, openNewListSheet, openAddKanjiSheet, openEditListSheet } from '../../ui/kanjiLists.js';
import { readPref, writePref } from '../../data/storage.js';
import { HIRAGANA, HIRAGANA_DAKUTEN, KATAKANA, KATAKANA_DAKUTEN, romajiOfKana, isKanji, kataToHira } from '../../core/japanese.js';
import { shuffle } from '../../core/practice.js';
import { loadStrokes } from '../../services/strokeData.js';
import { kanjiDetails } from '../../services/kanjiDetails.js';
import { sayJapanese } from '../../services/voice.js';

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
  return [
    { id: 'hiragana', label: 'Hiragana', chars: HIRAGANA.map((k) => k.char) },
    { id: 'hiragana-d', label: 'Hiragana ゛゜', chars: HIRAGANA_DAKUTEN.map((k) => k.char) },
    { id: 'katakana', label: 'Katakana', chars: KATAKANA.map((k) => k.char) },
    { id: 'katakana-d', label: 'Katakana ゛゜', chars: KATAKANA_DAKUTEN.map((k) => k.char) },
    ...kanjiSources(),
  ];
}

/** Datos para mostrar de un carácter: lectura, significado y qué decir en voz alta. */
async function characterInfo(ch) {
  if (!isKanji(ch)) {
    const romaji = romajiOfKana(ch);
    return { title: ch, lines: [romaji && `Se lee “${romaji}”`, ch !== kataToHira(ch) ? `Hiragana: ${kataToHira(ch)}` : ''], speak: ch };
  }
  const d = await kanjiDetails(ch);
  return {
    title: ch,
    lines: [d.meaning || 'Kanji', [d.on.join('・'), d.kun.join('・')].filter(Boolean).join('  ／  '), d.example],
    speak: d.speak,
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
  const afterListChange = (list) => {
    if (list?.id) currentSet = `list:${list.id}`;
    ctx.refresh();
  };

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
            class: `set-chip${s.id === currentSet ? ' is-on' : ''}${s.listId ? ' set-chip--list' : ''}`,
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
      h('button', { class: 'set-chip set-chip--add', type: 'button', onClick: () => openNewListSheet({ onDone: afterListChange }) }, icon('plus', { size: 14 }), 'Nueva lista'),
    ),
    set.listId
      ? h(
          'div',
          { class: 'row list-tools' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', id: 'list-add', onClick: () => openAddKanjiSheet(set.listId, { onDone: () => ctx.refresh() }) }, icon('plus', { size: 16 }), 'Agregar kanji'),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => openEditListSheet(set.listId, { onDone: () => ctx.refresh() }) }, icon('edit', { size: 16 }), 'Editar lista'),
        )
      : null,
    set.chars.length
      ? h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openWriting(ctx, set.chars, 0) }, icon('play', { size: 18 }), 'Practicar en orden'),
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => openWriting(ctx, shuffle(set.chars), 0) }, icon('shuffle', { size: 18 }), 'Al azar'),
        )
      : h('p', { class: 'muted' }, 'La lista está vacía: tocá "Agregar kanji" y escribí o pegá los que vas aprendiendo.'),
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
    kanjiLists().length === 0
      ? h('p', { class: 'field__hint' }, 'Tip: con "Nueva lista" armás tus propias listas de kanji y les vas sumando los que aprendés. También podés agregarlos desde el Diccionario.')
      : null,
    h('p', { class: 'field__hint' }, 'Trazos: KanjiVG, © Ulrich Apel y colaboradores, licencia CC BY-SA 3.0.'),
  );
}

// ───────────────────────────── Práctica de un carácter ─────────────────────────────

/** Abre la práctica guiada de escritura (también la usa el Diccionario). */
export function openWriting(ctx, chars, start = 0) {
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
    board = null;
    layer.clear();
    const ch = chars[index];
    layer.setStatus(`${index + 1} de ${chars.length}`);
    layer.setProgress(index / chars.length);

    const status = h('p', { class: 'write__status', role: 'status' }, 'Cargando trazos…');
    const meta = h('div', { class: 'write__meta' });
    const boardHost = h('div', { class: 'write__board' });
    const guideBtn = h('button', { class: `btn btn--ghost${guide ? ' is-on' : ''}`, type: 'button', 'aria-pressed': String(guide) }, icon('eye', { size: 18 }), 'Guía');
    const listenBtn = h('button', { class: 'btn btn--ghost', type: 'button', disabled: true }, icon('speaker', { size: 18 }), 'Escuchar');
    const panel = h(
      'aside',
      { class: 'write__info' },
      h('p', { class: 'write__char', lang: 'ja' }, ch),
      meta,
      status,
      h(
        'div',
        { class: 'write__tools' },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => board?.animate() }, icon('play', { size: 18 }), 'Ver trazos'),
        listenBtn,
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

    const [info, strokes] = await Promise.all([characterInfo(ch), currentLanguage().loadStrokes(ch)]);
    if (chars[index] !== ch || !layer.body.isConnected) return; // el usuario ya pasó a otro
    meta.replaceChildren(...info.lines.filter(Boolean).map((l) => h('p', {}, l)));
    if (info.speak) {
      listenBtn.disabled = false;
      listenBtn.addEventListener('click', () => sayJapanese(info.speak));
      sayJapanese(info.speak);
    }
    if (!strokes) {
      status.textContent = navigator.onLine ? 'No hay datos de trazos para este carácter.' : 'Sin conexión: este kanji todavía no se descargó.';
      return;
    }
    board = createBoard(boardHost, strokes, {
      guide,
      onProgress: (done, total) => {
        status.className = 'write__status';
        status.textContent = done < total ? `Trazo ${done + 1} de ${total}` : '';
      },
      onMessage: (text) => (status.textContent = text),
      onDone: ({ mistakes }) => {
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
