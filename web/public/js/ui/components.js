// Piezas de interfaz reutilizadas por varias pantallas.

import { h, icon, plural } from './dom.js';
import { KINDS, KIND_LABEL, GENDERS, GENDER_LABEL } from '../core/model.js';

const GENDER_LETTER = { masculine: 'M', feminine: 'F', neuter: 'N' };

/** Cara de una tarjeta: fondo del color del tipo, texto grande de alto contraste. */
export function cardFace({ front, kind, gender }, { size = 'lg' } = {}) {
  return h(
    'div',
    { class: `cardface cardface--${size} k-${kind}${gender ? ` g-${gender}` : ''}` },
    h(
      'div',
      { class: 'cardface__tags' },
      h('span', { class: 'cardface__tag' }, icon(kind, { size: 16 }), KIND_LABEL[kind]),
      gender ? genderChip(gender) : null,
    ),
    h('p', { class: 'cardface__text', lang: 'und' }, front),
  );
}

export function genderChip(gender) {
  return h(
    'span',
    { class: `gender-chip g-${gender}` },
    h('span', { class: 'gender-chip__letter', 'aria-hidden': 'true' }, GENDER_LETTER[gender]),
    GENDER_LABEL[gender],
  );
}

/** Cuadradito de color con el ícono del tipo de palabra. */
export function kindTile(kind, size = 'md') {
  return h('span', { class: `kind-tile kind-tile--${size} k-${kind}`, title: KIND_LABEL[kind] }, icon(kind, { size: size === 'sm' ? 15 : 18, label: KIND_LABEL[kind] }));
}

/** Selector de tipo de palabra (grupo de radio con colores). */
export function kindPicker({ value, onChange, name = 'kind' }) {
  return h(
    'fieldset',
    { class: 'chips' },
    h('legend', { class: 'field__label' }, 'Tipo (define el color)'),
    KINDS.map((k) => {
      const id = `${name}-${k}`;
      return h(
        'label',
        { class: `chip k-${k}`, for: id },
        h('input', { type: 'radio', name, id, value: k, checked: value === k, onChange: () => onChange(k) }),
        icon(k, { size: 16 }),
        KIND_LABEL[k],
      );
    }),
  );
}

export function genderPicker({ value, onChange, name = 'gender' }) {
  const options = [[null, 'Sin género'], ...GENDERS.map((g) => [g, GENDER_LABEL[g]])];
  return h(
    'fieldset',
    { class: 'chips' },
    h('legend', { class: 'field__label' }, 'Género gramatical (opcional)'),
    options.map(([g, label]) => {
      const id = `${name}-${g ?? 'none'}`;
      return h(
        'label',
        { class: `chip${g ? ` g-${g}` : ''}`, for: id },
        h('input', { type: 'radio', name, id, value: g ?? '', checked: value === g, onChange: () => onChange(g) }),
        g ? h('span', { class: 'gender-chip__letter', 'aria-hidden': 'true' }, GENDER_LETTER[g]) : null,
        label,
      );
    }),
  );
}

/** Barra fina con la proporción de cada tipo de palabra del mazo. */
export function mixBar(mix) {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (total === 0) return h('div', { class: 'mixbar mixbar--empty', 'aria-hidden': 'true' });
  const summary = KINDS.filter((k) => mix[k] > 0)
    .map((k) => `${mix[k]} ${KIND_LABEL[k].toLowerCase()}`)
    .join(', ');
  return h(
    'div',
    { class: 'mixbar', role: 'img', 'aria-label': `Composición: ${summary}` },
    KINDS.filter((k) => mix[k] > 0).map((k) => h('span', { class: `mixbar__seg k-${k}`, style: { '--share': String(mix[k] / total) } })),
  );
}

/** Próximos 7 días: cuántas tarjetas vencen cada día. */
export function forecastStrip(counts, now) {
  const max = Math.max(1, ...counts);
  const day = new Date(now);
  const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
  return h(
    'div',
    { class: 'forecast' },
    h('p', { class: 'eyebrow' }, 'Próximos 7 días'),
    h(
      'ol',
      { class: 'forecast__bars' },
      counts.map((n, i) => {
        const d = new Date(day);
        d.setDate(day.getDate() + i);
        const label = i === 0 ? 'Hoy' : fmt.format(d).replace('.', '');
        return h(
          'li',
          { class: 'forecast__day', 'aria-label': `${label}: ${plural(n, 'tarjeta', 'tarjetas')}` },
          h('span', { class: 'forecast__n' }, n),
          h('span', { class: 'forecast__track' }, h('span', { class: `forecast__bar${i === 0 ? ' is-today' : ''}`, style: { '--h': String(n / max) } })),
          h('span', { class: 'forecast__label' }, label),
        );
      }),
    ),
  );
}

export function emptyState({ title, text, action }) {
  return h('div', { class: 'empty' }, h('p', { class: 'empty__title' }, title), h('p', { class: 'muted' }, text), action ?? null);
}

/** Encabezado de pantalla: título grande y acciones a la derecha. */
export function screenHeader({ title, subtitle, back, actions = [] }) {
  return h(
    'header',
    { class: 'screen-head' },
    back
      ? h('button', { class: 'back-link', type: 'button', onClick: back.onClick }, icon('back', { size: 18 }), back.label)
      : null,
    h(
      'div',
      { class: 'screen-head__row' },
      h('div', { class: 'screen-head__titles' }, h('h1', { class: 'screen-title', tabindex: '-1' }, title), subtitle ? h('p', { class: 'muted' }, subtitle) : null),
      actions.length ? h('div', { class: 'screen-head__actions' }, actions) : null,
    ),
  );
}

export function iconButton(name, label, onClick, extraClass = '') {
  return h('button', { class: `icon-btn ${extraClass}`.trim(), type: 'button', 'aria-label': label, title: label, onClick }, icon(name));
}

export function field({ id, label, hint, control }) {
  return h(
    'div',
    { class: 'field' },
    h('label', { class: 'field__label', for: id }, label),
    control,
    hint ? h('p', { class: 'field__hint', id: `${id}-hint` }, hint) : null,
  );
}

export function toggle({ id, label, hint, checked, onChange }) {
  return h(
    'div',
    { class: 'toggle-row' },
    h('div', { class: 'toggle-row__text' }, h('label', { for: id }, label), hint ? h('p', { class: 'field__hint' }, hint) : null),
    h('input', { class: 'switch', type: 'checkbox', role: 'switch', id, checked, onChange: (e) => onChange(e.target.checked) }),
  );
}

export function stepper({ id, label, value, min, max, step = 1, unit, onChange }) {
  const out = h('output', { class: 'stepper__value', id, 'aria-live': 'polite' }, `${value} ${unit}`);
  let current = value;
  const set = (v) => {
    current = Math.min(max, Math.max(min, v));
    out.textContent = `${current} ${unit}`;
    dec.disabled = current <= min;
    inc.disabled = current >= max;
    onChange(current);
  };
  const dec = h('button', { class: 'stepper__btn', type: 'button', 'aria-label': `Menos ${label.toLowerCase()}`, disabled: value <= min, onClick: () => set(current - step) }, '−');
  const inc = h('button', { class: 'stepper__btn', type: 'button', 'aria-label': `Más ${label.toLowerCase()}`, disabled: value >= max, onClick: () => set(current + step) }, '+');
  return h('div', { class: 'stepper-row' }, h('span', { class: 'stepper-row__label' }, label), h('div', { class: 'stepper' }, dec, out, inc));
}
