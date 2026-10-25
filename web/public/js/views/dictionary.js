// Diccionario japonés–español (y español/inglés–japonés) sin conexión.
//
// Busca en kanji, kana, romaji o por significado. Cada palabra se puede escuchar,
// agregar como tarjeta a un mazo o abrir en Takoboto / Jisho; cada kanji muestra su
// significado, lecturas y palabras de ejemplo, y se puede practicar o sumar a tus listas.

import { h, icon, clear, plural } from '../ui/dom.js';
import { screenHeader, field } from '../ui/components.js';
import { openSheet, toast } from '../ui/overlays.js';
import { openPickListSheet } from '../ui/kanjiLists.js';
import * as store from '../data/store.js';
import { readPref, writePref } from '../data/storage.js';
import { liveDecks } from '../core/model.js';
import { posLabels, kanjiIn, formatKun } from '../core/dictionary.js';
import { loadWordIndex, searchWords, loadKanjiData, kanjiMeanings, wordsWithKanji } from '../services/dictionary.js';
import { sayJapanese } from '../services/voice.js';
import { openWriting } from './practice/writing.js';

const EXTERNAL = [
  { label: 'Takoboto', url: (q) => `https://takoboto.jp/?q=${encodeURIComponent(q)}` },
  { label: 'Jisho', url: (q) => `https://jisho.org/search/${encodeURIComponent(q)}` },
];

const SUGGESTIONS = ['comer', 'taberu', '学校', 'ともだち', 'casa', '日'];

let lastQuery = '';

export function dictionaryView(ctx) {
  const input = h('input', {
    class: 'input input--search',
    id: 'dict-q',
    type: 'search',
    value: lastQuery,
    placeholder: 'Kanji, kana, romaji o significado',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterkeyhint: 'search',
    'aria-label': 'Buscar en el diccionario',
  });
  const status = h('p', { class: 'field__hint', role: 'status' });
  const kanjiHost = h('div', { class: 'dict-kanji' });
  const results = h('ul', { class: 'dict-results' });
  const intro = h(
    'div',
    { class: 'dict-intro' },
    h('p', { class: 'muted' }, 'Probá con:'),
    h(
      'div',
      { class: 'set-chips' },
      SUGGESTIONS.map((s) => h('button', { class: 'set-chip', type: 'button', onClick: () => ((input.value = s), run()) }, s)),
    ),
  );

  let token = 0;
  let timer = null;
  async function run() {
    const q = input.value.trim();
    lastQuery = q;
    const my = ++token;
    intro.hidden = Boolean(q);
    if (!q) {
      clear(results);
      clear(kanjiHost);
      status.textContent = '';
      return;
    }
    status.textContent = 'Buscando…';
    try {
      const [words, kanjiData] = await Promise.all([searchWords(q), loadKanjiData()]);
      if (my !== token) return;
      renderKanji(kanjiIn(q), kanjiData);
      clear(results);
      results.append(...words.map(wordRow));
      status.textContent = words.length ? '' : 'No encontré nada. Probá con otra forma (por ejemplo, el verbo en infinitivo: "comer", "taberu").';
    } catch {
      if (my !== token) return;
      status.textContent = navigator.onLine
        ? 'No se pudo cargar el diccionario. Probá de nuevo en un rato.'
        : 'Sin conexión: el diccionario se descarga la primera vez que lo usás con internet; después funciona sin conexión.';
    }
  }

  function renderKanji(chars, data) {
    clear(kanjiHost);
    for (const ch of chars.slice(0, 8)) {
      const info = data[ch];
      if (!info) continue;
      const m = kanjiMeanings(info);
      kanjiHost.appendChild(
        h(
          'button',
          { class: 'dict-kanji__card', type: 'button', onClick: () => openKanjiSheet(ctx, ch) },
          h('span', { class: 'dict-kanji__ch', lang: 'ja' }, ch),
          h('span', { class: 'dict-kanji__meaning' }, m.list.slice(0, 3).join(', ')),
          h('span', { class: 'dict-kanji__readings', lang: 'ja' }, [info.on.slice(0, 2).join('・'), info.kun.slice(0, 2).map(formatKun).join('・')].filter(Boolean).join(' ／ ')),
        ),
      );
    }
  }

  function wordRow(w) {
    const main = w.k?.[0] ?? w.r[0];
    const meanings = w.es?.length ? w.es : w.en ?? [];
    return h(
      'li',
      {},
      h(
        'button',
        { class: 'dict-word', type: 'button', onClick: () => openWordSheet(ctx, w) },
        h(
          'span',
          { class: 'dict-word__head' },
          h('span', { class: 'dict-word__main', lang: 'ja' }, main),
          w.k ? h('span', { class: 'dict-word__reading', lang: 'ja' }, w.r[0]) : null,
          w.c ? h('span', { class: 'tag tag--common' }, 'común') : null,
          !w.es?.length ? h('span', { class: 'tag' }, 'EN') : null,
        ),
        h('span', { class: 'dict-word__meaning' }, meanings.slice(0, 3).join(' · ')),
      ),
    );
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 160);
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && (clearTimeout(timer), run()));

  // Empezar a cargar el diccionario en cuanto se abre la pantalla.
  if (!readPref('dictLoadedOnce', false)) status.textContent = 'Preparando el diccionario (la primera vez tarda unos segundos)…';
  loadWordIndex()
    .then(() => {
      writePref('dictLoadedOnce', true);
      if (!input.value.trim() && status.textContent.startsWith('Preparando')) status.textContent = '';
    })
    .catch(() => {});
  if (lastQuery) queueMicrotask(run);
  requestAnimationFrame(() => input.focus({ preventScroll: true }));

  return h(
    'div',
    { class: 'screen' },
    screenHeader({ title: 'Diccionario', subtitle: 'Japonés ⇄ español. Funciona sin conexión.' }),
    h('div', { class: 'dict-search' }, icon('search', { size: 20 }), input),
    status,
    intro,
    kanjiHost,
    results,
    h(
      'p',
      { class: 'field__hint about' },
      'Datos: JMdict y KANJIDIC2, © EDRDG, licencia CC BY-SA 4.0. Algunas palabras solo tienen traducción al inglés (marcadas "EN").',
    ),
  );
}

// ───────────────────────────── Detalle de una palabra ─────────────────────────────

function kindOf(pos = []) {
  if (pos.some((p) => p.startsWith('v'))) return 'verb';
  if (pos.some((p) => p.startsWith('adj'))) return 'adjective';
  if (pos.some((p) => p === 'exp' || p === 'int')) return 'phrase';
  if (pos.some((p) => p.startsWith('n') || p === 'pn')) return 'noun';
  return 'other';
}

function externalLinks(q) {
  return h(
    'div',
    { class: 'row dict-external' },
    EXTERNAL.map((x) =>
      h('a', { class: 'btn btn--ghost btn--sm', href: x.url(q), target: '_blank', rel: 'noopener noreferrer' }, x.label, icon('next', { size: 14 })),
    ),
  );
}

function openWordSheet(ctx, w) {
  const main = w.k?.[0] ?? w.r[0];
  openSheet({
    title: main,
    wide: true,
    build: (close) =>
      h(
        'div',
        { class: 'stack dict-detail' },
        h(
          'div',
          { class: 'dict-detail__head' },
          h('p', { class: 'dict-detail__word', lang: 'ja' }, main),
          h('p', { class: 'dict-detail__reading', lang: 'ja' }, w.r.join('・')),
          w.k?.length > 1 ? h('p', { class: 'field__hint', lang: 'ja' }, `También: ${w.k.slice(1).join('、')}`) : null,
          h('p', { class: 'field__hint' }, [...posLabels(w.p), w.c ? 'palabra común' : ''].filter(Boolean).join(' · ')),
        ),
        w.es?.length ? h('ol', { class: 'dict-senses' }, w.es.map((s) => h('li', {}, s))) : null,
        w.en?.length
          ? h('details', { class: 'dict-en', open: !w.es?.length }, h('summary', {}, 'En inglés'), h('ol', { class: 'dict-senses' }, w.en.map((s) => h('li', {}, s))))
          : null,
        kanjiIn(main).length
          ? h(
              'div',
              { class: 'stack stack--tight' },
              h('p', { class: 'field__label' }, 'Kanji'),
              h(
                'div',
                { class: 'set-chips' },
                kanjiIn(main).map((ch) => h('button', { class: 'set-chip set-chip--kanji', type: 'button', lang: 'ja', onClick: () => (close(), openKanjiSheet(ctx, ch)) }, ch)),
              ),
            )
          : null,
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => sayJapanese(w.r[0]) }, icon('speaker', { size: 18 }), 'Escuchar'),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => (close(), openAddCardSheet(w)) }, icon('plus', { size: 18 }), 'Agregar a un mazo'),
        ),
        externalLinks(main),
      ),
  });
}

function openAddCardSheet(w) {
  const decks = liveDecks(store.getState());
  if (decks.length === 0) return toast('Primero creá un mazo en la pestaña Mazos.');
  const main = w.k?.[0] ?? w.r[0];
  openSheet({
    title: 'Agregar tarjeta',
    build: (close) => {
      const saved = readPref('dict.deck', '');
      const deckSel = h('select', { class: 'input', id: 'dict-deck' }, decks.map((d) => h('option', { value: d.id, selected: d.id === saved }, d.name)));
      const back = h('input', { class: 'input', id: 'dict-back', value: (w.es?.[0] ?? w.en?.[0] ?? '').slice(0, 200) });
      return h(
        'form',
        {
          class: 'stack',
          onSubmit: (e) => {
            e.preventDefault();
            writePref('dict.deck', deckSel.value);
            store.createCard({
              deckId: deckSel.value,
              front: main,
              back: back.value.trim() || main,
              pronunciation: w.k ? w.r[0] : '',
              kind: kindOf(w.p),
            });
            toast(`Tarjeta "${main}" agregada.`, { tone: 'ok' });
            close();
          },
        },
        h('p', { class: 'dict-detail__word', lang: 'ja' }, main, w.k ? h('span', { class: 'dict-word__reading' }, ` ${w.r[0]}`) : null),
        field({ id: 'dict-deck', label: 'Mazo', control: deckSel }),
        field({ id: 'dict-back', label: 'Significado (podés acortarlo)', control: back }),
        h('button', { class: 'btn btn--primary', type: 'submit' }, icon('check', { size: 18 }), 'Agregar'),
      );
    },
  });
}

// ───────────────────────────── Detalle de un kanji ─────────────────────────────

export async function openKanjiSheet(ctx, ch) {
  let data;
  try {
    data = await loadKanjiData();
  } catch {
    return toast('No se pudo cargar el diccionario de kanji.');
  }
  const info = data[ch];
  if (!info) return toast(`No tengo datos de ${ch}.`);
  const m = kanjiMeanings(info);
  const examples = h('ul', { class: 'dict-examples' }, h('li', { class: 'muted' }, 'Buscando palabras…'));
  wordsWithKanji(ch)
    .then((words) => {
      clear(examples);
      examples.append(
        ...words.map((w) =>
          h(
            'li',
            {},
            h('span', { class: 'dict-examples__word', lang: 'ja' }, w.k[0]),
            h('span', { class: 'dict-examples__reading', lang: 'ja' }, w.r[0]),
            h('span', { class: 'dict-examples__meaning' }, (w.es?.[0] ?? w.en?.[0] ?? '').split('; ')[0]),
          ),
        ),
      );
      if (!words.length) examples.append(h('li', { class: 'muted' }, 'Sin palabras comunes con este kanji.'));
    })
    .catch(() => clear(examples));

  const facts = [
    plural(info.s, 'trazo', 'trazos'),
    info.j ? `JLPT N${info.j === 4 ? 5 : info.j === 3 ? 4 : info.j === 2 ? 3 : 1}${info.j === 2 ? '–N2' : ''}` : '',
    info.g ? (info.g <= 6 ? `${info.g}.º grado` : 'jōyō') : '',
  ].filter(Boolean);

  openSheet({
    title: `Kanji ${ch}`,
    wide: true,
    build: (close) =>
      h(
        'div',
        { class: 'stack dict-detail' },
        h(
          'div',
          { class: 'dict-kanji-detail' },
          h('p', { class: 'dict-kanji-detail__ch', lang: 'ja' }, ch),
          h(
            'div',
            { class: 'stack stack--tight' },
            h('p', { class: 'dict-kanji-detail__meaning' }, m.list.join(', '), m.lang === 'en' ? h('span', { class: 'tag' }, 'EN') : null),
            info.on.length ? h('p', {}, h('span', { class: 'field__label' }, 'On: '), h('span', { lang: 'ja' }, info.on.join('・'))) : null,
            info.kun.length ? h('p', {}, h('span', { class: 'field__label' }, 'Kun: '), h('span', { lang: 'ja' }, info.kun.map(formatKun).join('・'))) : null,
            h('p', { class: 'field__hint' }, facts.join(' · ')),
          ),
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => (close(), openWriting(ctx, [ch], 0)) }, icon('pen', { size: 18 }), 'Practicar escritura'),
          h('button', { class: 'btn btn--ghost', type: 'button', id: 'dict-add-kanji', onClick: () => (close(), openPickListSheet(ch)) }, icon('plus', { size: 18 }), 'Agregar a mis kanji'),
        ),
        h('p', { class: 'field__label' }, 'Palabras con este kanji'),
        examples,
        externalLinks(ch),
      ),
  });
}
