// Repaso estilo Anki, a pantalla completa:
// 1. Se muestra el frente. 2. El usuario intenta recordar y toca "Mostrar respuesta"
// (o barra espaciadora). 3. Califica del 1 al 4; SM-2 calcula el próximo repaso.
// "Otra vez" vuelve a poner la tarjeta al final de la cola. Se puede deshacer.

import { h, icon, clear, plural, relativeTime } from '../ui/dom.js';
import { cardFace } from '../ui/components.js';
import { sheetOpen } from '../ui/overlays.js';
import * as store from '../data/store.js';
import { dueCards, nextDueAt } from '../core/model.js';
import { GRADES, previewLabel } from '../core/sm2.js';
import { speak, canSpeak } from '../services/device.js';

export function openReview(ctx, deckId) {
  const deck = store.getDeck(deckId);
  if (!deck) return;

  const session = {
    queue: dueCards(store.getState(), deckId, ctx.now()).map((c) => c.id),
    revealed: false,
    reviewed: 0,
    tally: { again: 0, hard: 0, good: 0, easy: 0 },
    history: [],
  };
  const total = session.queue.length;

  const body = h('div', { class: 'review__body' });
  const progressBar = h('div', { class: 'review__progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total) });
  const counter = h('span', { class: 'review__counter' });
  const undoBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Deshacer último repaso', title: 'Deshacer (Z)', onClick: () => undo() }, icon('undo'));

  const layer = h(
    'div',
    { class: 'review', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Repaso: ${deck.name}` },
    h(
      'header',
      { class: 'review__bar' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar repaso', title: 'Cerrar (Esc)', onClick: () => close() }, icon('close')),
      h('div', { class: 'review__title' }, h('span', { class: 'review__deck' }, deck.name), counter),
      undoBtn,
    ),
    progressBar,
    body,
  );

  const previousFocus = document.activeElement;
  document.getElementById('overlay-root').appendChild(layer);
  document.documentElement.classList.add('is-locked');
  document.addEventListener('keydown', onKey);
  render();

  function currentCard() {
    while (session.queue.length) {
      const card = store.getCard(session.queue[0]);
      if (card) return card;
      session.queue.shift(); // la borraron (por ejemplo, desde otro dispositivo)
    }
    return null;
  }

  function render() {
    clear(body);
    const done = session.reviewed;
    const remaining = session.queue.length;
    counter.textContent = remaining ? `${done} hechas · ${remaining} por ver` : `${done} hechas`;
    progressBar.style.setProperty('--p', String(total ? Math.min(1, done / Math.max(total, done + remaining)) : 1));
    progressBar.setAttribute('aria-valuenow', String(done));
    undoBtn.disabled = session.history.length === 0;

    const card = currentCard();
    if (!card) return renderFinished();

    const face = cardFace(card, { size: 'lg' });
    face.classList.add('review__card');
    if (!session.revealed) {
      face.setAttribute('role', 'button');
      face.setAttribute('tabindex', '0');
      face.setAttribute('aria-label', `${card.front}. Tocá para ver la respuesta`);
      face.addEventListener('click', reveal);
    }
    body.appendChild(h('div', { class: 'review__stage' }, face, session.revealed ? answer(card) : null));

    body.appendChild(
      session.revealed
        ? gradeButtons(card)
        : h(
            'div',
            { class: 'review__actions' },
            h('button', { class: 'btn btn--primary btn--block btn--tall', type: 'button', id: 'reveal-btn', onClick: reveal }, 'Mostrar respuesta', h('kbd', { class: 'kbd' }, 'Espacio')),
          ),
    );
    // Al mostrar la respuesta el foco va al grupo (no a un botón) para que la tecla
    // que reveló no califique por accidente.
    const focusTarget = body.querySelector(session.revealed ? '.grades' : '#reveal-btn');
    focusTarget?.focus({ preventScroll: true });
  }

  function answer(card) {
    return h(
      'div',
      { class: `answer k-${card.kind}` },
      h(
        'div',
        { class: 'answer__head' },
        h('p', { class: 'answer__back', lang: 'es' }, card.back),
        canSpeak()
          ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Escuchar pronunciación', title: 'Escuchar (P)', onClick: () => speak(card.front, deck.languageCode) }, icon('speaker'))
          : null,
      ),
      card.pronunciation ? h('p', { class: 'answer__pron' }, card.pronunciation) : null,
      card.example ? h('p', { class: 'answer__example' }, card.example) : null,
    );
  }

  function gradeButtons(card) {
    const now = ctx.now();
    return h(
      'div',
      { class: 'grades', role: 'group', tabindex: '-1', 'aria-label': '¿Qué tan bien la recordaste? Teclas 1 a 4' },
      GRADES.map((g) =>
        h(
          'button',
          { class: `grade grade--${g.id}`, type: 'button', onClick: () => rate(g.id), 'aria-keyshortcuts': g.key },
          h('span', { class: 'grade__label' }, g.label),
          h('span', { class: 'grade__when' }, previewLabel(card, g.id, now)),
          h('kbd', { class: 'kbd grade__key' }, g.key),
        ),
      ),
    );
  }

  function renderFinished() {
    const next = nextDueAt(store.getState(), deckId);
    const now = ctx.now();
    const tally = GRADES.filter((g) => session.tally[g.id] > 0).map((g) =>
      h('li', { class: `tally__item grade--${g.id}` }, h('span', { class: 'tally__n' }, session.tally[g.id]), g.label),
    );
    body.appendChild(
      h(
        'div',
        { class: 'finished' },
        h('div', { class: 'finished__mark' }, icon('check', { size: 40 })),
        h('h2', { class: 'finished__title' }, session.reviewed ? 'Listo por ahora' : 'No hay tarjetas para repasar'),
        h(
          'p',
          { class: 'muted' },
          session.reviewed ? `Repasaste ${plural(session.reviewed, 'tarjeta', 'tarjetas')}.` : '',
          next ? ` Próximo repaso de este mazo ${relativeTime(next, now)}.` : '',
        ),
        tally.length ? h('ul', { class: 'tally' }, tally) : null,
        h('button', { class: 'btn btn--primary', type: 'button', id: 'finish-btn', onClick: close }, 'Volver al mazo'),
      ),
    );
    body.querySelector('#finish-btn')?.focus({ preventScroll: true });
  }

  function reveal() {
    if (session.revealed || !currentCard()) return;
    session.revealed = true;
    render();
  }

  function rate(grade) {
    const card = currentCard();
    if (!card || !session.revealed) return;
    const snapshot = store.rateCard(card.id, grade, ctx.now());
    session.history.push({ snapshot, queue: [...session.queue], reviewed: session.reviewed, tally: { ...session.tally } });
    session.queue.shift();
    if (grade === 'again') session.queue.push(card.id);
    session.reviewed += 1;
    session.tally[grade] += 1;
    session.revealed = false;
    render();
  }

  function undo() {
    const last = session.history.pop();
    if (!last) return;
    store.restoreCard(last.snapshot);
    session.queue = last.queue;
    session.reviewed = last.reviewed;
    session.tally = last.tally;
    session.revealed = true;
    render();
  }

  function onKey(e) {
    if (sheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof HTMLElement && e.target.matches('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (key === 'escape') return (e.preventDefault(), close());
    if (key === 'z' || key === 'u') return (e.preventDefault(), undo());
    if (!session.revealed && (key === ' ' || key === 'enter')) return (e.preventDefault(), reveal());
    if (session.revealed) {
      const grade = GRADES.find((g) => g.key === key);
      if (grade) return (e.preventDefault(), rate(grade.id));
      if (key === 'p') {
        const card = currentCard();
        if (card) speak(card.front, deck.languageCode);
      }
    }
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    document.documentElement.classList.remove('is-locked');
    layer.remove();
    ctx.refresh();
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  }
}
