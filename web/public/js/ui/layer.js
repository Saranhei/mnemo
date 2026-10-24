// Capa a pantalla completa para las prácticas (misma estructura que el repaso).
// Vive fuera de la pantalla principal: si los datos cambian mientras practicás
// (por ejemplo, termina un Pomodoro), la práctica no se reinicia.

import { h, icon, clear } from './dom.js';
import { sheetOpen } from './overlays.js';

/**
 * @param {{title: string, onKey?: (e: KeyboardEvent) => void, onClose?: () => void}} opts
 * @returns {{body: HTMLElement, setStatus: (t: string) => void, setProgress: (p: number) => void, close: () => void, clear: () => void}}
 */
export function openLayer({ title, onKey, onClose }) {
  const body = h('div', { class: 'review__body layer__body' });
  const status = h('span', { class: 'review__counter' });
  const progress = h('div', { class: 'review__progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' });

  const keyHandler = (e) => {
    if (sheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    onKey?.(e);
  };

  const layer = h(
    'div',
    { class: 'review layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h(
      'header',
      { class: 'review__bar' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', title: 'Cerrar (Esc)', onClick: () => close() }, icon('close')),
      h('div', { class: 'review__title' }, h('span', { class: 'review__deck' }, title), status),
      h('span', { class: 'layer__spacer' }),
    ),
    progress,
    body,
  );

  const previousFocus = document.activeElement;
  document.getElementById('overlay-root').appendChild(layer);
  document.documentElement.classList.add('is-locked');
  document.addEventListener('keydown', keyHandler);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', keyHandler);
    document.documentElement.classList.remove('is-locked');
    globalThis.speechSynthesis?.cancel();
    layer.remove();
    onClose?.();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }

  return {
    body,
    close,
    clear: () => clear(body),
    setStatus: (t) => (status.textContent = t),
    setProgress: (p) => {
      progress.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
      progress.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    },
  };
}

/** Pantalla final con resultado. */
export function resultPanel({ title, text, tone = 'good', actions = [] }) {
  return h(
    'div',
    { class: 'finished' },
    h('div', { class: `finished__mark finished__mark--${tone}` }, icon(tone === 'good' ? 'check' : 'reset', { size: 40 })),
    h('h2', { class: 'finished__title' }, title),
    text ? h('p', { class: 'muted' }, text) : null,
    h('div', { class: 'row row--center' }, actions),
  );
}

/** Mensaje de corrección (bien / mal) que anuncia el lector de pantalla. */
export function feedback({ ok, title, lines = [] }) {
  return h(
    'div',
    { class: `feedback feedback--${ok ? 'ok' : 'bad'}`, role: 'status' },
    h('p', { class: 'feedback__title' }, icon(ok ? 'check' : 'close', { size: 20 }), title),
    lines.filter(Boolean).map((l) => h('p', { class: 'feedback__line' }, l)),
  );
}
