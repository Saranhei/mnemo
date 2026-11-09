// Capa a pantalla completa para las prácticas (misma estructura que el repaso).
// Vive fuera de la pantalla principal: si los datos cambian mientras practicás
// (por ejemplo, termina un Pomodoro), la práctica no se reinicia.

import { h, icon, clear } from './dom.js';
import { sheetOpen } from './overlays.js';

// Gesto "atrás" (Android, deslizar desde el borde en Safari, botón atrás del
// navegador): cierra la capa abierta en vez de salir de la app. Cada capa agrega
// una entrada al historial; al cerrarla con la ✕ se saca esa entrada.
const open = [];
let backPending = 0; // history.back() es asíncrono: lo que se abra mientras tanto espera
const queued = [];
addEventListener('popstate', (e) => {
  if (backPending > 0) {
    backPending -= 1;
    if (backPending === 0) queued.splice(0).forEach((push) => push());
    return;
  }
  // Se cierran las capas abiertas después de la entrada a la que se volvió.
  const token = e.state?.mnemoLayer;
  while (open.length && open.at(-1).token !== token) open.at(-1).close({ fromHistory: true });
});
// Al recargar con una capa abierta, la entrada actual queda marcada: se limpia.
try {
  if (history.state?.mnemoLayer) history.replaceState({ ...history.state, mnemoLayer: undefined }, '');
} catch {
  /* sin historial */
}

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

  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;
  const push = () => {
    if (closed) return;
    try {
      history.pushState({ ...(history.state ?? {}), mnemoLayer: token }, '');
    } catch {
      /* sin historial (vista previa): la capa funciona igual */
    }
  };
  if (backPending) queued.push(push);
  else push();

  function close({ fromHistory = false } = {}) {
    if (closed) return;
    closed = true;
    open.splice(open.indexOf(entry), 1);
    if (!fromHistory && history.state?.mnemoLayer === token) {
      backPending += 1;
      history.back();
    }
    document.removeEventListener('keydown', keyHandler);
    document.documentElement.classList.remove('is-locked');
    globalThis.speechSynthesis?.cancel();
    layer.remove();
    onClose?.();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }

  const entry = { close, token };
  open.push(entry);

  return {
    body,
    close: () => close(),
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
