// Práctica: punto de entrada a los seis ejercicios.

import { h, icon } from '../../ui/dom.js';
import { screenHeader } from '../../ui/components.js';
import { openSourceSheet } from './audio.js';
import { openRecallSheet } from './kanjiRecall.js';

const MODES = [
  { id: 'write', icon: 'pen', title: 'Escritura', text: 'Mirá la animación del orden de trazos de cada kana y kanji, escuchá cómo se lee y escribilo con el dedo o el Apple Pencil. Te marca cada trazo bien o mal.', tone: 'k-character' },
  { id: 'recall', icon: 'grid', title: 'Kanji de memoria', text: 'Ves el significado y las lecturas, y escribís el kanji sin guía. Vale aunque salga torcido. Con tus listas o los kanji de tus mazos.', tone: 'k-noun' },
  { id: 'quizzes', icon: 'question', title: 'Preguntas', text: 'Cuestionarios por unidad que respondés escribiendo. Los cargás vos o los generás desde un mazo.', tone: 'k-other' },
  { id: 'speak', icon: 'mic', title: 'Pronunciación', text: 'Escuchá el modelo, decí la palabra y fijate si se entendió. También podés grabarte y comparar.', tone: 'k-verb' },
  { id: 'listening', icon: 'headphones', title: 'Listening', text: 'Textos con audio (tuyo o la voz del sistema): completá espacios, respondé preguntas o escribí todo siguiendo el audio lento.', tone: 'k-phrase' },
  { id: 'meaning', icon: 'headphones', title: '¿Qué escuchaste?', text: 'Escuchá una palabra y elegí qué significa entre cuatro opciones.', tone: 'k-adjective' },
];

export function practiceView(ctx) {
  const open = (id) => {
    if (id === 'recall') return openRecallSheet(ctx);
    return ['write', 'quizzes', 'listening'].includes(id) ? ctx.navigate(id) : openSourceSheet(ctx, id);
  };
  return h(
    'div',
    { class: 'screen screen--wide' },
    screenHeader({ title: 'Práctica', subtitle: 'Escritura, kanji de memoria, preguntas, pronunciación y comprensión auditiva.' }),
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
