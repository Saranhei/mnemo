// Rueda de colores propia: tono alrededor, intensidad hacia el borde y un control de
// brillo. Se usa en vez de <input type="color"> porque en iPhone/iPad y Android ese
// selector cambia mucho según el sistema (y en algunos no aparece la rueda).
// También acepta un código #rrggbb y recuerda los últimos colores elegidos.

import { h } from './dom.js';
import { openSheet } from './overlays.js';
import { readPref, writePref } from '../data/storage.js';

const RECENT_KEY = 'colors.recent';
const MAX_RECENT = 10;
const HEX = /^#[0-9a-f]{6}$/i;

export function hsvToHex(hue, sat, val) {
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return Math.round((val - val * sat * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { h: hue, s: max ? d / max : 0, v: max };
}

/** Últimos colores elegidos en la rueda (los más nuevos primero). */
export const recentColors = () => {
  const list = readPref(RECENT_KEY, []);
  return Array.isArray(list) ? list.filter((c) => HEX.test(c)).slice(0, MAX_RECENT) : [];
};

function remember(color) {
  writePref(RECENT_KEY, [color, ...recentColors().filter((c) => c !== color)].slice(0, MAX_RECENT));
}

/**
 * Abre la rueda. @param {string} initial color de partida (#rrggbb)
 * @returns {Promise<string | null>} el color elegido o null si se canceló.
 */
export function pickColor(initial = '#3457d5', { title = 'Elegí un color' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title,
      onClose: () => resolve(result),
      build: (close) => {
        let { h: hue, s: sat, v: val } = hexToHsv(HEX.test(initial) ? initial : '#3457d5');
        const SIZE = 260;
        const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
        const wheel = h('canvas', { class: 'cw__wheel', width: SIZE * dpr, height: SIZE * dpr, role: 'img', 'aria-label': 'Rueda de colores: tocá o arrastrá para elegir' });
        const knob = h('span', { class: 'cw__knob', 'aria-hidden': 'true' });
        const brightness = h('input', { class: 'cw__range', type: 'range', min: 5, max: 100, value: Math.round(val * 100), 'aria-label': 'Brillo' });
        const hex = h('input', { class: 'input cw__hex', maxlength: 7, spellcheck: false, autocapitalize: 'off', 'aria-label': 'Código del color' });
        const swatch = h('span', { class: 'cw__swatch', 'aria-hidden': 'true' });

        const paintWheel = () => {
          const ctx = wheel.getContext('2d');
          const n = SIZE * dpr;
          const img = ctx.createImageData(n, n);
          const r0 = n / 2;
          for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
              const dx = x - r0;
              const dy = y - r0;
              const dist = Math.hypot(dx, dy) / r0;
              const i = (y * n + x) * 4;
              if (dist > 1) continue;
              const c = parseInt(hsvToHex((Math.atan2(dy, dx) * 180) / Math.PI + 360, Math.min(1, dist), val).slice(1), 16);
              img.data[i] = (c >> 16) & 255;
              img.data[i + 1] = (c >> 8) & 255;
              img.data[i + 2] = c & 255;
              img.data[i + 3] = dist > 0.985 ? Math.round(255 * (1 - dist) / 0.015) : 255;
            }
          }
          ctx.putImageData(img, 0, 0);
        };
        const update = ({ fromHex = false, repaint = false } = {}) => {
          const color = hsvToHex(hue, sat, val);
          swatch.style.background = color;
          if (!fromHex) hex.value = color;
          const a = (hue * Math.PI) / 180;
          knob.style.left = `${50 + Math.cos(a) * sat * 50}%`;
          knob.style.top = `${50 + Math.sin(a) * sat * 50}%`;
          knob.style.background = color;
          brightness.style.setProperty('--hue', hsvToHex(hue, sat, 1));
          if (repaint) paintWheel();
        };
        const pick = (e) => {
          const r = wheel.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
          sat = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
          update();
        };
        const host = h('div', { class: 'cw__host' }, wheel, knob);
        host.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          host.setPointerCapture(e.pointerId);
          pick(e);
        });
        host.addEventListener('pointermove', (e) => {
          if (host.hasPointerCapture(e.pointerId)) pick(e);
        });
        brightness.addEventListener('input', () => {
          val = Number(brightness.value) / 100;
          update({ repaint: true });
        });
        hex.addEventListener('input', () => {
          const v = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`;
          if (!HEX.test(v)) return;
          ({ h: hue, s: sat, v: val } = hexToHsv(v));
          brightness.value = String(Math.round(val * 100));
          update({ fromHex: true, repaint: true });
        });
        update({ repaint: true });

        const recent = recentColors();
        return h(
          'div',
          { class: 'cw' },
          host,
          h('label', { class: 'cw__row' }, h('span', { class: 'field__label' }, 'Brillo'), brightness),
          h('div', { class: 'cw__row' }, swatch, hex),
          recent.length
            ? h('div', { class: 'cw__recent' }, h('span', { class: 'field__label' }, 'Últimos'),
                h('div', { class: 'cw__dots' }, recent.map((c) => h('button', { class: 'nb-color', type: 'button', style: { '--sw': c }, 'aria-label': `Usar ${c}`, onClick: () => {
                  ({ h: hue, s: sat, v: val } = hexToHsv(c));
                  brightness.value = String(Math.round(val * 100));
                  update({ repaint: true });
                } }))))
            : null,
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => {
            result = hsvToHex(hue, sat, val);
            remember(result);
            close();
          } }, 'Usar este color'),
        );
      },
    });
  });
}
