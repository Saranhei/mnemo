// Hojas (bottom sheets en el celular, diálogos en la tablet), confirmaciones y avisos.
// No se usan alert()/confirm() del navegador: en una app instalada se ven fuera de
// lugar y algunos entornos los bloquean.

import { h, icon } from './dom.js';

const layer = () => document.getElementById('overlay-root');
const stack = [];

/**
 * Abre una hoja. `build(close)` devuelve el contenido.
 * @returns {{close: () => void, el: HTMLElement}}
 */
export function openSheet({ title, build, wide = false, onClose }) {
  const previouslyFocused = document.activeElement;
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;

  const close = () => {
    const i = stack.indexOf(entry);
    if (i === -1) return;
    stack.splice(i, 1);
    backdrop.classList.add('is-leaving');
    const done = () => backdrop.remove();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 180);
    document.removeEventListener('keydown', onKey, true);
    onClose?.();
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
  };

  const onKey = (e) => {
    if (stack[stack.length - 1] !== entry) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      trapFocus(e, sheet);
    }
  };

  const sheet = h(
    'section',
    { class: `sheet${wide ? ' sheet--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h(
      'header',
      { class: 'sheet__head' },
      h('h2', { class: 'sheet__title', id: titleId }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onClick: close }, icon('close')),
    ),
    h('div', { class: 'sheet__body' }, build(close)),
  );
  const backdrop = h('div', { class: 'backdrop', onClick: (e) => e.target === backdrop && close() }, sheet);
  const entry = { close };
  stack.push(entry);
  layer().appendChild(backdrop);
  document.addEventListener('keydown', onKey, true);

  requestAnimationFrame(() => {
    const first = sheet.querySelector('[autofocus], input, select, textarea, button:not(.icon-btn)');
    (first ?? sheet.querySelector('button'))?.focus({ preventScroll: true });
  });
  return { close, el: sheet };
}

export const sheetOpen = () => stack.length > 0;

function trapFocus(e, container) {
  const items = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Confirmación dentro de la app. Resuelve `true` si el usuario confirma. */
export function confirmAction({ title, message, confirmLabel, danger = true }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet({
      title,
      onClose: () => !answered && resolve(false),
      build: (close) =>
        h(
          'div',
          { class: 'stack' },
          h('p', { class: 'muted' }, message),
          h(
            'div',
            { class: 'row row--end' },
            h('button', { class: 'btn btn--ghost', type: 'button', onClick: close }, 'Cancelar'),
            h(
              'button',
              {
                class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
                type: 'button',
                onClick: () => {
                  answered = true;
                  resolve(true);
                  close();
                },
              },
              confirmLabel,
            ),
          ),
        ),
    });
  });
}

/** Aviso breve abajo de la pantalla (también lo anuncia el lector de pantalla). */
export function toast(message, { tone = 'info', ms = 3200 } = {}) {
  const region = document.getElementById('toast-root');
  const el = h('div', { class: `toast toast--${tone}`, role: 'status' }, message);
  region.appendChild(el);
  // Como mucho dos avisos a la vez: el más viejo se va.
  while (region.children.length > 2) region.firstElementChild.remove();
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  }, ms);
}
