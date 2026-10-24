// Pantallas de mazos: lista, detalle y formularios de mazo y tarjeta.

import { h, icon, languageName, relativeTime, plural, clear } from '../ui/dom.js';
import {
  cardFace, kindTile, kindPicker, genderPicker, mixBar, forecastStrip, emptyState, screenHeader, iconButton, field,
} from '../ui/components.js';
import { openSheet, confirmAction, toast } from '../ui/overlays.js';
import * as store from '../data/store.js';
import { liveDecks, deckCards, dueCount, nextDueAt, forecast, kindMix } from '../core/model.js';
import { clean, MAX_NAME } from '../core/sanitize.js';
import { importFlow, exportDeckFlow } from '../ui/transferActions.js';
import { openReview } from './review.js';

export const LANGUAGES = ['ja', 'ko', 'zh-CN', 'zh-TW', 'en', 'de', 'fr', 'it', 'pt-BR', 'ru', 'ar', 'he', 'el', 'hi', 'th', 'tr', 'nl', 'sv', 'pl', 'uk', 'es'];

// ───────────────────────────── Lista de mazos ─────────────────────────────

export function decksView(ctx) {
  const state = store.getState();
  const now = ctx.now();
  const decks = liveDecks(state);
  const totalDue = decks.reduce((n, d) => n + dueCount(state, d.id, now), 0);
  const decksWithDue = decks.filter((d) => dueCount(state, d.id, now) > 0).length;

  const subtitle =
    decks.length === 0
      ? null
      : totalDue === 0
        ? 'Todo repasado por ahora.'
        : `${plural(totalDue, 'tarjeta', 'tarjetas')} para repasar en ${plural(decksWithDue, 'mazo', 'mazos')}.`;

  const onImport = async () => {
    const id = await importFlow(ctx);
    if (id) ctx.navigate('deck', { id });
  };

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: 'Mazos',
      subtitle,
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: onImport }, icon('import', { size: 18 }), 'Importar'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openDeckEditor(ctx) }, icon('plus', { size: 18 }), 'Nuevo mazo'),
      ],
    }),
    decks.length === 0
      ? emptyState({
          title: 'Todavía no hay mazos',
          text: 'Creá uno, por ejemplo "Hiragana" o "Verbos en alemán", o importá un mazo exportado de Anki.',
          action: h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openDeckEditor(ctx) }, 'Crear mi primer mazo'),
        })
      : h('ul', { class: 'deck-list' }, decks.map((d) => deckRow(ctx, d, now))),
  );
}

function deckRow(ctx, deck, now) {
  const state = store.getState();
  const total = deckCards(state, deck.id).length;
  const due = dueCount(state, deck.id, now);
  return h(
    'li',
    {},
    h(
      'button',
      { class: 'deck-row', type: 'button', onClick: () => ctx.navigate('deck', { id: deck.id }) },
      h(
        'span',
        { class: 'deck-row__main' },
        h('span', { class: 'deck-row__name' }, deck.name, deck.example ? h('span', { class: 'tag' }, 'Ejemplo') : null),
        h('span', { class: 'deck-row__meta' }, `${plural(total, 'tarjeta', 'tarjetas')} · ${languageName(deck.languageCode)}`),
        mixBar(kindMix(state, deck.id)),
      ),
      due > 0
        ? h('span', { class: 'due-badge', 'aria-label': `${plural(due, 'tarjeta', 'tarjetas')} para repasar` }, due)
        : h('span', { class: 'done-mark', 'aria-label': 'Al día' }, icon('check', { size: 18 })),
    ),
  );
}

// ───────────────────────────── Detalle del mazo ─────────────────────────────

let searchQuery = '';
let searchDeckId = null;

export function deckView(ctx, { id }) {
  const deck = store.getDeck(id);
  if (!deck) {
    queueMicrotask(() => ctx.navigate('decks'));
    return h('div');
  }
  if (searchDeckId !== id) {
    searchQuery = '';
    searchDeckId = id;
  }

  const state = store.getState();
  const now = ctx.now();
  const cards = deckCards(state, id).sort((a, b) => b.createdAt - a.createdAt);
  const due = dueCount(state, id, now);
  const next = nextDueAt(state, id);

  const listEl = h('ul', { class: 'card-list' });
  const renderList = () => {
    clear(listEl);
    const q = searchQuery.trim().toLocaleLowerCase('es');
    const shown = q ? cards.filter((c) => `${c.front}\n${c.back}\n${c.pronunciation}`.toLocaleLowerCase('es').includes(q)) : cards;
    if (shown.length === 0) {
      listEl.appendChild(h('li', { class: 'muted card-list__empty' }, q ? 'Ninguna tarjeta coincide con la búsqueda.' : 'Este mazo todavía no tiene tarjetas.'));
      return;
    }
    for (const c of shown) listEl.appendChild(cardRow(ctx, deck, c, now));
  };
  renderList();

  const onDelete = async () => {
    const ok = await confirmAction({
      title: `¿Borrar "${deck.name}"?`,
      message: `Se borran también sus ${plural(cards.length, 'tarjeta', 'tarjetas')}. Si sincronizás con otro dispositivo, el borrado también llega allá.`,
      confirmLabel: 'Borrar mazo',
    });
    if (!ok) return;
    store.deleteDeck(id);
    toast('Mazo borrado.');
    ctx.navigate('decks');
  };

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: deck.name,
      subtitle: `${languageName(deck.languageCode)} · ${plural(cards.length, 'tarjeta', 'tarjetas')}`,
      back: { label: 'Mazos', onClick: () => ctx.navigate('decks') },
      actions: [
        iconButton('edit', 'Editar mazo', () => openDeckEditor(ctx, deck)),
        iconButton('share', 'Exportar o compartir mazo', () => exportDeckFlow(ctx, id)),
        iconButton('trash', 'Borrar mazo', onDelete, 'icon-btn--danger'),
      ],
    }),
    h(
      'section',
      { class: 'study-panel' },
      due > 0
        ? h(
            'button',
            { class: 'btn btn--study', type: 'button', onClick: () => openReview(ctx, id) },
            h('span', { class: 'btn--study__count' }, due),
            h('span', {}, due === 1 ? 'tarjeta para repasar' : 'tarjetas para repasar'),
            h('span', { class: 'btn--study__go' }, 'Estudiar'),
          )
        : h(
            'div',
            { class: 'study-done' },
            icon('check', { size: 22 }),
            h('p', {}, cards.length === 0 ? 'Agregá tarjetas para empezar a estudiar.' : `Al día. Próximo repaso ${relativeTime(next, now)}.`),
          ),
      cards.length > 0 ? forecastStrip(forecast(state, id, now), now) : null,
      cards.length > 0 ? mixLegend(kindMix(state, id)) : null,
    ),
    h(
      'div',
      { class: 'list-toolbar' },
      h(
        'label',
        { class: 'search' },
        icon('search', { size: 18 }),
        h('span', { class: 'visually-hidden' }, 'Buscar tarjeta'),
        h('input', {
          class: 'search__input',
          id: 'deck-search',
          type: 'search',
          placeholder: 'Buscar',
          autocomplete: 'off',
          value: searchQuery,
          onInput: (e) => {
            searchQuery = e.target.value;
            renderList();
          },
        }),
      ),
      h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openCardEditor(ctx, { deckId: id }) }, icon('plus', { size: 18 }), 'Tarjeta'),
    ),
    listEl,
  );
}

function mixLegend(mix) {
  return h(
    'div',
    { class: 'mix-legend' },
    mixBar(mix),
    h(
      'ul',
      { class: 'mix-legend__items' },
      Object.entries(mix)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => h('li', {}, kindTile(k, 'sm'), h('span', {}, n))),
    ),
  );
}

function cardRow(ctx, deck, card, now) {
  const when = card.lastReviewedAt === null ? 'Nueva' : card.dueAt <= now ? 'Para hoy' : relativeTime(card.dueAt, now);
  return h(
    'li',
    {},
    h(
      'button',
      { class: 'card-row', type: 'button', onClick: () => openCardEditor(ctx, { deckId: deck.id, card }) },
      kindTile(card.kind),
      h('span', { class: 'card-row__text' }, h('span', { class: 'card-row__front' }, card.front), h('span', { class: 'card-row__back' }, card.back)),
      h('span', { class: `card-row__when${card.dueAt <= now ? ' is-due' : ''}` }, when),
    ),
  );
}

// ───────────────────────────── Formulario de mazo ─────────────────────────────

export function openDeckEditor(ctx, deck = null) {
  openSheet({
    title: deck ? 'Editar mazo' : 'Nuevo mazo',
    build: (close) => {
      const error = h('p', { class: 'field__error', role: 'alert' });
      const name = h('input', { class: 'input', id: 'deck-name', value: deck?.name ?? '', maxlength: MAX_NAME, placeholder: 'Ej. Hiragana', autocomplete: 'off', required: true });
      const lang = h(
        'select',
        { class: 'input', id: 'deck-lang' },
        LANGUAGES.map((code) => h('option', { value: code, selected: (deck?.languageCode ?? 'ja') === code }, languageName(code))),
      );
      const submit = (e) => {
        e.preventDefault();
        const clean_ = clean(name.value, MAX_NAME);
        if (!clean_) {
          error.textContent = 'Poné un nombre para el mazo.';
          name.focus();
          return;
        }
        if (deck) {
          store.updateDeck(deck.id, { name: clean_, languageCode: lang.value });
          close();
        } else {
          const created = store.createDeck({ name: clean_, languageCode: lang.value });
          close();
          ctx.navigate('deck', { id: created.id });
        }
      };
      return h(
        'form',
        { class: 'stack', onSubmit: submit, novalidate: true },
        field({ id: 'deck-name', label: 'Nombre', control: name }),
        field({ id: 'deck-lang', label: 'Idioma que estudiás', hint: 'Se usa para la pronunciación.', control: lang }),
        error,
        h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, deck ? 'Guardar cambios' : 'Crear mazo'),
      );
    },
  });
}

// ───────────────────────────── Formulario de tarjeta ─────────────────────────────

export function openCardEditor(ctx, { deckId, card = null }) {
  const draft = {
    front: card?.front ?? '',
    back: card?.back ?? '',
    pronunciation: card?.pronunciation ?? '',
    example: card?.example ?? '',
    kind: card?.kind ?? 'noun',
    gender: card?.gender ?? null,
  };
  let keepAdding = false;
  let added = 0;

  openSheet({
    title: card ? 'Editar tarjeta' : 'Nueva tarjeta',
    wide: true,
    build: (close) => {
      const preview = h('div', { class: 'editor__preview' });
      const genderSlot = h('div');
      const error = h('p', { class: 'field__error', role: 'alert' });
      const counter = h('p', { class: 'field__hint', role: 'status' });

      const renderPreview = () => {
        clear(preview);
        preview.appendChild(cardFace({ front: draft.front.trim() || 'Palabra', kind: draft.kind, gender: draft.gender }, { size: 'md' }));
      };
      const renderGender = () => {
        clear(genderSlot);
        if (draft.kind === 'noun') genderSlot.appendChild(genderPicker({ value: draft.gender, onChange: (g) => ((draft.gender = g), renderPreview()) }));
      };

      const input = (id, key, label, placeholder, { multiline = false } = {}) => {
        const control = h(multiline ? 'textarea' : 'input', {
          class: 'input',
          id,
          value: draft[key],
          placeholder,
          rows: multiline ? 2 : null,
          autocomplete: 'off',
          autocapitalize: 'off',
          spellcheck: false,
          onInput: (e) => {
            draft[key] = e.target.value;
            if (key === 'front') renderPreview();
          },
        });
        return { control, el: field({ id, label, control }) };
      };

      const front = input('card-front', 'front', 'Palabra o carácter', 'Ej. 猫');
      const back = input('card-back', 'back', 'Significado', 'Ej. gato');
      const pron = input('card-pron', 'pronunciation', 'Pronunciación (opcional)', 'Ej. neko');
      const example = input('card-example', 'example', 'Ejemplo (opcional)', 'Una frase donde se use', { multiline: true });
      front.control.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          back.control.focus();
        }
      });

      const submit = (e) => {
        e.preventDefault();
        const fields = {
          front: clean(draft.front),
          back: clean(draft.back),
          pronunciation: clean(draft.pronunciation),
          example: clean(draft.example),
          kind: draft.kind,
          gender: draft.kind === 'noun' ? draft.gender : null,
        };
        if (!fields.front || !fields.back) {
          error.textContent = 'Completá la palabra y su significado.';
          (fields.front ? back : front).control.focus();
          return;
        }
        error.textContent = '';
        if (card) {
          store.updateCard(card.id, fields);
          close();
          return;
        }
        store.createCard({ ...fields, deckId });
        if (!keepAdding) {
          close();
          toast('Tarjeta agregada.', { tone: 'ok' });
          return;
        }
        added += 1;
        counter.textContent = `${plural(added, 'tarjeta agregada', 'tarjetas agregadas')}.`;
        Object.assign(draft, { front: '', back: '', pronunciation: '', example: '' });
        for (const f of [front, back, pron, example]) f.control.value = '';
        renderPreview();
        front.control.focus();
      };

      const onDelete = async () => {
        const ok = await confirmAction({ title: '¿Borrar la tarjeta?', message: `"${card.front}" se borra de este mazo.`, confirmLabel: 'Borrar' });
        if (!ok) return;
        store.deleteCard(card.id);
        close();
        toast('Tarjeta borrada.');
      };

      renderPreview();
      renderGender();

      return h(
        'form',
        { class: 'editor', onSubmit: submit, novalidate: true },
        preview,
        h(
          'div',
          { class: 'editor__fields' },
          front.el,
          back.el,
          kindPicker({ value: draft.kind, onChange: (k) => ((draft.kind = k), k !== 'noun' && (draft.gender = null), renderPreview(), renderGender()) }),
          genderSlot,
          pron.el,
          example.el,
          card
            ? null
            : h(
                'label',
                { class: 'check' },
                h('input', { type: 'checkbox', id: 'keep-adding', onChange: (e) => (keepAdding = e.target.checked) }),
                'Seguir agregando después de guardar',
              ),
          error,
          counter,
          h(
            'div',
            { class: 'row row--between' },
            card ? h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: onDelete }, icon('trash', { size: 18 }), 'Borrar') : h('span'),
            h('button', { class: 'btn btn--primary', type: 'submit' }, card ? 'Guardar' : 'Agregar tarjeta'),
          ),
        ),
      );
    },
  });
}
