// Historial de sesiones de estudio y palabras anotadas en cada una.

import { h, icon, formatDateTime, formatTime, plural } from '../ui/dom.js';
import { screenHeader, kindTile, emptyState } from '../ui/components.js';
import { confirmAction, toast } from '../ui/overlays.js';
import * as store from '../data/store.js';
import { live, sessionCards } from '../core/model.js';

export function sessionsView(ctx) {
  const state = store.getState();
  const sessions = live(state.sessions).sort((a, b) => b.startedAt - a.startedAt);
  return h(
    'div',
    { class: 'screen' },
    screenHeader({ title: 'Sesiones', subtitle: 'Lo que estudiaste y las palabras que anotaste en cada sesión.' }),
    h(
      'aside',
      { class: 'callout' },
      icon('sync', { size: 20 }),
      h(
        'p',
        {},
        '¿Anotaste palabras en otro dispositivo? Allá: ',
        h('strong', {}, 'Ajustes → Exportar copia'),
        ', mandala por AirDrop, y acá: ',
        h('button', { class: 'link-btn', type: 'button', onClick: () => ctx.navigate('settings') }, 'Importar'),
        '.',
      ),
    ),
    sessions.length === 0
      ? emptyState({
          title: 'Sin sesiones todavía',
          text: 'Empezá una desde Pomodoro: se crea sola al arrancar el primer bloque de foco.',
          action: h('button', { class: 'btn btn--primary', type: 'button', onClick: () => ctx.navigate('pomodoro') }, 'Ir al Pomodoro'),
        })
      : h(
          'ul',
          { class: 'session-list' },
          sessions.map((s) => {
            const words = sessionCards(state, s.id).length;
            return h(
              'li',
              {},
              h(
                'button',
                { class: 'session-row', type: 'button', onClick: () => ctx.navigate('session', { id: s.id }) },
                h('span', { class: 'session-row__main' }, h('span', { class: 'session-row__date' }, formatDateTime(s.startedAt)), h('span', { class: 'muted' }, `${plural(words, 'palabra', 'palabras')} · ${plural(s.pomodoros, 'bloque', 'bloques')}`)),
                s.endedAt === null ? h('span', { class: 'live-tag' }, 'En curso') : null,
              ),
            );
          }),
        ),
  );
}

export function sessionView(ctx, { id }) {
  const s = store.getSession(id);
  if (!s) {
    queueMicrotask(() => ctx.navigate('sessions'));
    return h('div');
  }
  const words = sessionCards(store.getState(), id);

  const onDelete = async () => {
    const ok = await confirmAction({
      title: '¿Borrar la sesión?',
      message: 'Las palabras anotadas NO se borran: siguen en sus mazos.',
      confirmLabel: 'Borrar sesión',
    });
    if (!ok) return;
    store.deleteSession(id);
    toast('Sesión borrada.');
    ctx.navigate('sessions');
  };

  const duration = s.endedAt ? Math.max(1, Math.round((s.endedAt - s.startedAt) / 60_000)) : null;

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: formatDateTime(s.startedAt),
      subtitle: s.endedAt === null ? 'En curso' : `Terminó a las ${formatTime(s.endedAt)} · ${plural(duration, 'minuto', 'minutos')}`,
      back: { label: 'Sesiones', onClick: () => ctx.navigate('sessions') },
      actions: [h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': 'Borrar sesión', title: 'Borrar sesión', onClick: onDelete }, icon('trash'))],
    }),
    h(
      'dl',
      { class: 'facts' },
      h('div', {}, h('dt', {}, 'Palabras'), h('dd', {}, words.length)),
      h('div', {}, h('dt', {}, 'Bloques de foco'), h('dd', {}, s.pomodoros)),
    ),
    s.endedAt === null
      ? h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => ctx.navigate('pomodoro') }, 'Seguir anotando'),
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => store.endSession(id) }, 'Terminar sesión'),
        )
      : null,
    h('h2', { class: 'section-title' }, 'Palabras anotadas'),
    words.length === 0
      ? h('p', { class: 'muted' }, 'En esta sesión no se anotaron palabras.')
      : h(
          'ul',
          { class: 'card-list' },
          words.map((c) =>
            h(
              'li',
              { class: 'card-row card-row--static' },
              kindTile(c.kind),
              h('span', { class: 'card-row__text' }, h('span', { class: 'card-row__front' }, c.front), h('span', { class: 'card-row__back' }, c.back)),
              h('span', { class: 'card-row__when' }, store.getDeck(c.deckId)?.name ?? 'Sin mazo'),
            ),
          ),
        ),
  );
}
