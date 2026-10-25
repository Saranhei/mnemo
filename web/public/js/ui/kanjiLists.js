// Listas de kanji propias: crear, sumar kanji a medida que se aprenden, editar y
// elegir a qué lista agregar uno desde el diccionario. Las usan Escritura, Kanji de
// memoria y Diccionario.

import { h, icon, plural } from './dom.js';
import { field } from './components.js';
import { openSheet, confirmAction, toast } from './overlays.js';
import * as store from '../data/store.js';
import { live, liveDecks, deckCards, uniqueKanji } from '../core/model.js';
import { clean, MAX_NAME } from '../core/sanitize.js';
import { charactersFromCards } from '../core/practice.js';
import { isKanji } from '../core/japanese.js';

/** Listas propias, más nuevas primero. */
export const kanjiLists = () => live(store.getState().kanjiSets ?? []).sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * Todas las fuentes de kanji para practicar: tus listas y los kanji de tus mazos.
 * @returns {{id: string, label: string, chars: string[], listId?: string}[]}
 */
export function kanjiSources() {
  const state = store.getState();
  const out = kanjiLists().map((l) => ({ id: `list:${l.id}`, label: l.name, chars: [...l.chars], listId: l.id }));
  for (const deck of liveDecks(state).filter((d) => d.languageCode.startsWith('ja'))) {
    const chars = charactersFromCards(deckCards(state, deck.id)).filter(isKanji);
    if (chars.length) out.push({ id: `deck:${deck.id}`, label: deck.name, chars });
  }
  return out;
}

const charsArea = (id, value = '') =>
  h('textarea', {
    class: 'input input--kanji',
    id,
    rows: 3,
    lang: 'ja',
    value,
    autocomplete: 'off',
    spellcheck: false,
    placeholder: '日本語学生先生…',
  });

function countHint(area, hint, base = '') {
  const update = () => {
    const n = [...uniqueKanji(area.value)].length;
    hint.textContent = `${n ? plural(n, 'kanji', 'kanji') : 'Ningún kanji todavía'}. ${base}`.trim();
  };
  area.addEventListener('input', update);
  update();
}

/** Crea una lista nueva (opcionalmente con kanji ya cargados). */
export function openNewListSheet({ chars = '', onDone } = {}) {
  openSheet({
    title: 'Nueva lista de kanji',
    build: (close) => {
      const name = h('input', { class: 'input', id: 'kl-name', maxlength: MAX_NAME, placeholder: 'Por ejemplo: Mis kanji, Genki L5', autofocus: true });
      const area = charsArea('kl-chars', chars);
      const hint = h('p', { class: 'field__hint', role: 'status' });
      countHint(area, hint, 'Podés pegar un texto: se quedan solo los kanji, sin repetir.');
      const save = (e) => {
        e.preventDefault();
        const list = store.createKanjiSet({ name: clean(name.value, MAX_NAME) || 'Mis kanji', chars: area.value });
        toast(`Lista "${list.name}" creada con ${plural([...list.chars].length, 'kanji', 'kanji')}.`, { tone: 'ok' });
        close();
        onDone?.(list);
      };
      return h(
        'form',
        { class: 'stack', onSubmit: save },
        field({ id: 'kl-name', label: 'Nombre', control: name }),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'kl-chars' }, 'Kanji'), area, hint),
        h('button', { class: 'btn btn--primary', type: 'submit' }, icon('check', { size: 18 }), 'Crear lista'),
      );
    },
  });
}

/** Suma kanji a una lista existente. */
export function openAddKanjiSheet(listId, { onDone } = {}) {
  const list = store.getKanjiSet(listId);
  if (!list) return;
  openSheet({
    title: `Agregar a "${list.name}"`,
    build: (close) => {
      const area = charsArea('kl-add');
      area.autofocus = true;
      const hint = h('p', { class: 'field__hint', role: 'status' });
      countHint(area, hint, 'Los que ya están en la lista no se repiten.');
      const save = (e) => {
        e.preventDefault();
        const added = store.addToKanjiSet(listId, area.value);
        toast(added ? `Agregados: ${plural(added, 'kanji nuevo', 'kanji nuevos')}.` : 'Esos kanji ya estaban en la lista.', { tone: added ? 'ok' : 'info' });
        close();
        onDone?.();
      };
      return h(
        'form',
        { class: 'stack', onSubmit: save },
        h('p', { class: 'muted' }, 'Escribí o pegá los kanji que aprendiste (con el teclado japonés o copiándolos del diccionario).'),
        area,
        hint,
        h('button', { class: 'btn btn--primary', type: 'submit' }, icon('plus', { size: 18 }), 'Agregar'),
      );
    },
  });
}

/** Renombrar, editar los kanji o borrar la lista. */
export function openEditListSheet(listId, { onDone } = {}) {
  const list = store.getKanjiSet(listId);
  if (!list) return;
  openSheet({
    title: 'Editar lista',
    build: (close) => {
      const name = h('input', { class: 'input', id: 'kl-edit-name', maxlength: MAX_NAME, value: list.name });
      const area = charsArea('kl-edit-chars', list.chars);
      const hint = h('p', { class: 'field__hint', role: 'status' });
      countHint(area, hint, 'Borrá los que quieras sacar.');
      const save = (e) => {
        e.preventDefault();
        store.updateKanjiSet(listId, { name: clean(name.value, MAX_NAME) || list.name, chars: area.value });
        close();
        onDone?.();
      };
      const remove = async () => {
        const ok = await confirmAction({ title: '¿Borrar la lista?', message: `Se borra "${list.name}". Las estadísticas de práctica de cada kanji se conservan.`, confirmLabel: 'Borrar lista' });
        if (!ok) return;
        store.deleteKanjiSet(listId);
        close();
        onDone?.({ deleted: true });
      };
      return h(
        'form',
        { class: 'stack', onSubmit: save },
        field({ id: 'kl-edit-name', label: 'Nombre', control: name }),
        h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'kl-edit-chars' }, 'Kanji'), area, hint),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'submit' }, icon('check', { size: 18 }), 'Guardar'),
          h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: remove }, icon('trash', { size: 18 }), 'Borrar lista'),
        ),
      );
    },
  });
}

/** Elegir a qué lista sumar uno o varios kanji (desde el diccionario). */
export function openPickListSheet(chars, { onDone } = {}) {
  const text = uniqueKanji(chars);
  if (!text) return;
  const lists = kanjiLists();
  if (lists.length === 0) {
    openNewListSheet({ chars: text, onDone });
    return;
  }
  openSheet({
    title: `Agregar ${text} a…`,
    build: (close) =>
      h(
        'div',
        { class: 'stack' },
        h(
          'ul',
          { class: 'pick-list' },
          lists.map((l) => {
            const has = [...text].every((ch) => l.chars.includes(ch));
            return h(
              'li',
              {},
              h(
                'button',
                {
                  class: 'pick-list__item',
                  type: 'button',
                  disabled: has,
                  onClick: () => {
                    store.addToKanjiSet(l.id, text);
                    toast(`Agregado a "${l.name}".`, { tone: 'ok' });
                    close();
                    onDone?.(l);
                  },
                },
                h('span', { class: 'pick-list__name' }, l.name),
                h('span', { class: 'pick-list__meta' }, has ? 'Ya está' : plural([...l.chars].length, 'kanji', 'kanji')),
              ),
            );
          }),
        ),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), openNewListSheet({ chars: text, onDone })) }, icon('plus', { size: 18 }), 'Nueva lista'),
      ),
  });
}
