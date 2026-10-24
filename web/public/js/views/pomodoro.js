// Pomodoro + sesión de estudio con anotación rápida de palabras.

import { h, icon, clear, formatTime, plural } from '../ui/dom.js';
import { screenHeader, kindTile } from '../ui/components.js';
import { toast } from '../ui/overlays.js';
import * as store from '../data/store.js';
import * as pomo from '../services/pomodoroController.js';
import * as P from '../core/pomodoro.js';
import { activeSession, sessionCards, liveDecks, KINDS, KIND_LABEL } from '../core/model.js';
import { clean } from '../core/sanitize.js';
import { readPref, writePref } from '../data/storage.js';

const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;
const SVG_NS = 'http://www.w3.org/2000/svg';

// Borrador de la anotación rápida: sobrevive a que la pantalla se redibuje.
const draft = { front: '', back: '', kind: readPref('quickKind', 'noun') };

export function pomodoroView(ctx) {
  const session = activeSession(store.getState());
  return h(
    'div',
    { class: 'screen screen--pomodoro' },
    screenHeader({ title: 'Pomodoro', subtitle: 'Bloques de foco con descansos. Anotá palabras mientras estudiás.' }),
    h('div', { class: 'pomo-layout' }, clockPanel(ctx), session ? sessionPanel(ctx, session) : noSessionPanel()),
  );
}

// ───────────────────────────── Reloj ─────────────────────────────

function clockPanel(ctx) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 240');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('aria-hidden', 'true');
  const track = document.createElementNS(SVG_NS, 'circle');
  const arc = document.createElementNS(SVG_NS, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '120');
    c.setAttribute('cy', '120');
    c.setAttribute('r', String(RING_R));
    c.setAttribute('fill', 'none');
  }
  track.setAttribute('class', 'ring__track');
  arc.setAttribute('class', 'ring__arc');
  arc.setAttribute('stroke-dasharray', String(RING_C));
  arc.setAttribute('transform', 'rotate(-90 120 120)');
  svg.append(track, arc);

  const phaseEl = h('p', { class: 'clock__phase' });
  const timeEl = h('p', { class: 'clock__time', role: 'timer', 'aria-live': 'off' });
  const countEl = h('p', { class: 'clock__count' });
  const mainLabel = h('span');
  const mainIcon = h('span', { class: 'btn__icon' });
  const mainBtn = h('button', { class: 'btn btn--phase btn--tall', type: 'button', id: 'pomo-main', onClick: () => toggle() }, mainIcon, mainLabel);

  const toggle = () => {
    const s = pomo.getState();
    if (P.isRunning(s)) {
      pomo.pause();
      return;
    }
    // Empezar un bloque de foco sin sesión abierta crea una sesión automáticamente.
    if (s.phase === 'focus' && !activeSession(store.getState())) {
      store.startSession();
      toast('Sesión de estudio iniciada.');
    }
    pomo.start();
  };

  const panel = h(
    'section',
    { class: 'clock' },
    h('div', { class: 'clock__dial' }, svg, h('div', { class: 'clock__center' }, phaseEl, timeEl, countEl)),
    h(
      'div',
      { class: 'clock__controls' },
      h('button', { class: 'icon-btn icon-btn--lg', type: 'button', 'aria-label': 'Reiniciar bloque', title: 'Reiniciar', onClick: () => pomo.reset() }, icon('reset')),
      mainBtn,
      h('button', { class: 'icon-btn icon-btn--lg', type: 'button', 'aria-label': 'Saltar a la fase siguiente', title: 'Saltar', onClick: () => pomo.skip() }, icon('skip')),
    ),
    h('p', { class: 'field__hint clock__hint' }, 'Dejá la app abierta: en el celular, las apps web se pausan en segundo plano. La pantalla se mantiene encendida mientras corre.'),
  );

  let lastIconState = null;
  const update = (now) => {
    const s = pomo.getState();
    const d = pomo.getDurations();
    panel.dataset.phase = s.phase;
    phaseEl.textContent = P.PHASES[s.phase].label;
    timeEl.textContent = P.formatClock(P.remaining(s, now, d));
    countEl.textContent = `${plural(s.completedFocus, 'bloque completado', 'bloques completados')}`;
    arc.setAttribute('stroke-dashoffset', String(RING_C * (1 - P.progress(s, now, d))));
    const running = P.isRunning(s);
    const iconState = running ? 'pause' : 'play';
    if (iconState !== lastIconState) {
      clear(mainIcon);
      mainIcon.appendChild(icon(iconState, { size: 20 }));
      lastIconState = iconState;
    }
    mainLabel.textContent = running ? 'Pausar' : P.isPaused(s) ? 'Seguir' : 'Empezar';
  };
  update(ctx.now());
  ctx.onTick(update);
  return panel;
}

// ───────────────────────────── Sesión ─────────────────────────────

function noSessionPanel() {
  return h(
    'section',
    { class: 'panel session-panel session-panel--empty' },
    h('h2', { class: 'panel__title' }, 'Sesión de estudio'),
    h('p', { class: 'muted' }, 'Una sesión junta los bloques que hacés y las palabras que anotás mientras estudiás. Las palabras quedan como tarjetas listas para repasar.'),
    h('button', { class: 'btn btn--primary', type: 'button', onClick: () => store.startSession() }, icon('note', { size: 18 }), 'Empezar sesión'),
  );
}

function sessionPanel(ctx, session) {
  const words = sessionCards(store.getState(), session.id).reverse();
  return h(
    'section',
    { class: 'panel session-panel' },
    h(
      'div',
      { class: 'row row--between' },
      h(
        'div',
        {},
        h('h2', { class: 'panel__title' }, 'Sesión en curso'),
        h('p', { class: 'muted' }, `Desde las ${formatTime(session.startedAt)} · ${plural(words.length, 'palabra', 'palabras')} · ${plural(session.pomodoros, 'bloque', 'bloques')}`),
      ),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (store.endSession(session.id), toast('Sesión terminada. La encontrás en Sesiones.')) }, 'Terminar'),
    ),
    quickNote(ctx, session),
    words.length
      ? h(
          'ul',
          { class: 'noted' },
          words.map((c) => h('li', { class: 'noted__item' }, kindTile(c.kind, 'sm'), h('span', { class: 'noted__front' }, c.front), h('span', { class: 'noted__back' }, c.back))),
        )
      : null,
  );
}

function quickNote(ctx, session) {
  const decks = liveDecks(store.getState());
  const savedDeck = readPref('quickDeck', '');
  const deckSelect = h(
    'select',
    { class: 'input', id: 'qn-deck', onChange: (e) => writePref('quickDeck', e.target.value) },
    h('option', { value: '' }, 'Anotaciones (se crea sola)'),
    decks.filter((d) => d.name !== 'Anotaciones').map((d) => h('option', { value: d.id, selected: d.id === savedDeck }, d.name)),
  );

  const kindSelect = h(
    'div',
    { class: 'kind-row', role: 'radiogroup', 'aria-label': 'Tipo de palabra' },
    KINDS.map((k) =>
      h(
        'button',
        {
          class: `kind-pick k-${k}${draft.kind === k ? ' is-on' : ''}`,
          type: 'button',
          role: 'radio',
          'aria-checked': String(draft.kind === k),
          'aria-label': KIND_LABEL[k],
          title: KIND_LABEL[k],
          onClick: (e) => {
            draft.kind = k;
            writePref('quickKind', k);
            for (const b of kindSelect.children) {
              const on = b === e.currentTarget;
              b.classList.toggle('is-on', on);
              b.setAttribute('aria-checked', String(on));
            }
          },
        },
        icon(k, { size: 18 }),
      ),
    ),
  );

  const front = h('input', { class: 'input', id: 'qn-front', placeholder: 'Palabra', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, value: draft.front, onInput: (e) => (draft.front = e.target.value), enterkeyhint: 'next' });
  const back = h('input', { class: 'input', id: 'qn-back', placeholder: 'Significado', autocomplete: 'off', value: draft.back, onInput: (e) => (draft.back = e.target.value), enterkeyhint: 'done' });
  front.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      back.focus();
    }
  });

  const submit = (e) => {
    e.preventDefault();
    const f = clean(draft.front);
    const b = clean(draft.back);
    if (!f || !b) {
      (f ? back : front).focus();
      return;
    }
    const deckId = store.getDeck(deckSelect.value)?.id ?? store.inboxDeck().id;
    draft.front = '';
    draft.back = '';
    ctx.focusAfterRender('qn-front');
    store.createCard({ deckId, sessionId: session.id, front: f, back: b, kind: draft.kind });
  };

  return h(
    'form',
    { class: 'quicknote', onSubmit: submit, novalidate: true },
    h('p', { class: 'eyebrow' }, 'Anotar palabra'),
    h('div', { class: 'quicknote__grid' }, front, back),
    kindSelect,
    h('div', { class: 'quicknote__foot' }, h('label', { class: 'visually-hidden', for: 'qn-deck' }, 'Mazo'), deckSelect, h('button', { class: 'btn btn--primary', type: 'submit' }, icon('plus', { size: 18 }), 'Anotar')),
  );
}
