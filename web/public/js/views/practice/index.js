// Práctica: punto de entrada a los cinco ejercicios.

import { h, icon } from '../../ui/dom.js';
import { screenHeader } from '../../ui/components.js';
import { openSourceSheet } from './audio.js';

const MODES = [
  { id: 'write', icon: 'pen', title: 'Escritura', text: 'Mirá la animación del orden de trazos de cada kana y kanji, escuchá cómo se lee y escribilo con el dedo o el Apple Pencil. Te marca cada trazo bien o mal.', tone: 'k-character' },
  { id: 'quizzes', icon: 'question', title: 'Preguntas', text: 'Cuestionarios por unidad que respondés escribiendo. Los cargás vos o los generás desde un mazo.', tone: 'k-noun' },
  { id: 'speak', icon: 'mic', title: 'Pronunciación', text: 'Escuchá el modelo, decí la palabra y fijate si se entendió. También podés grabarte y comparar.', tone: 'k-verb' },
  { id: 'dictation', icon: 'headphones', title: 'Dictado', text: 'Escuchá una palabra en japonés y escribí lo que oíste, en kana o romaji.', tone: 'k-phrase' },
  { id: 'meaning', icon: 'headphones', title: '¿Qué escuchaste?', text: 'Escuchá una palabra y elegí qué significa entre cuatro opciones.', tone: 'k-adjective' },
];

export function practiceView(ctx) {
  const open = (id) => (id === 'write' || id === 'quizzes' ? ctx.navigate(id) : openSourceSheet(ctx, id));
  return h(
    'div',
    { class: 'screen screen--wide' },
    screenHeader({ title: 'Práctica', subtitle: 'Escritura, preguntas, pronunciación y comprensión auditiva con tus mazos.' }),
    h(
      'ul',
      { class: 'practice-grid' },
      MODES.map((m) =>
        h(
          'li',
          {},
          h(
            'button',
            { class: `practice-tile ${m.tone}`, type: 'button', onClick: () => open(m.id) },
            h('span', { class: 'practice-tile__icon' }, icon(m.icon, { size: 26 })),
            h('span', { class: 'practice-tile__title' }, m.title),
            h('span', { class: 'practice-tile__text' }, m.text),
          ),
        ),
      ),
    ),
  );
}
