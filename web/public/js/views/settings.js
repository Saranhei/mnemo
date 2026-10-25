// Ajustes: Pomodoro, sincronización entre dispositivos, apariencia, datos y colores.

import { h, icon, plural } from '../ui/dom.js';
import { screenHeader, stepper, toggle, kindTile, genderChip } from '../ui/components.js';
import { confirmAction, toast } from '../ui/overlays.js';
import * as store from '../data/store.js';
import * as pomo from '../services/pomodoroController.js';
import { readPref, writePref, storageMode, storageEstimate } from '../data/storage.js';
import { canKeepScreenOn } from '../services/device.js';
import { importFlow, exportBackupFlow } from '../ui/transferActions.js';
import { KINDS, KIND_LABEL, GENDERS, live } from '../core/model.js';

export function settingsView(ctx) {
  const d = pomo.getDurations();
  const state = store.getState();

  return h(
    'div',
    { class: 'screen' },
    screenHeader({ title: 'Ajustes' }),

    section(
      'Sincronizar entre dispositivos',
      h(
        'ol',
        { class: 'steps' },
        h('li', {}, 'En el dispositivo donde anotaste, tocá ', h('strong', {}, 'Exportar copia'), ' y mandala por AirDrop (o guardala en iCloud Drive).'),
        h('li', {}, 'En el otro, tocá ', h('strong', {}, 'Importar'), ' y elegí el archivo. Se combina con lo que ya hay: de cada tarjeta queda la versión más nueva.'),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => exportBackupFlow(ctx) }, icon('share', { size: 18 }), 'Exportar copia'),
        h(
          'button',
          {
            class: 'btn btn--ghost',
            type: 'button',
            onClick: async () => {
              const next = await importFlow(ctx);
              if (next) ctx.navigate(next.route, { id: next.id });
            },
          },
          icon('import', { size: 18 }),
          'Importar copia o mazo',
        ),
      ),
      h('p', { class: 'field__hint' }, `Acá hay ${plural(live(state.decks).length, 'mazo', 'mazos')}, ${plural(live(state.cards).length, 'tarjeta', 'tarjetas')} y ${plural(live(state.sessions).length, 'sesión', 'sesiones')}. También importa mazos .txt de Anki y .json de la app de Mac.`),
    ),

    section(
      'Pomodoro',
      stepper({ id: 'set-focus', label: 'Foco', value: d.focusMin, min: 5, max: 90, step: 5, unit: 'min', onChange: (v) => pomo.setDurations({ focusMin: v }) }),
      stepper({ id: 'set-short', label: 'Descanso corto', value: d.shortMin, min: 1, max: 30, unit: 'min', onChange: (v) => pomo.setDurations({ shortMin: v }) }),
      stepper({ id: 'set-long', label: 'Descanso largo', value: d.longMin, min: 5, max: 60, step: 5, unit: 'min', onChange: (v) => pomo.setDurations({ longMin: v }) }),
      stepper({ id: 'set-cycles', label: 'Descanso largo cada', value: d.cycles, min: 2, max: 8, unit: 'bloques', onChange: (v) => pomo.setDurations({ cycles: v }) }),
      toggle({ id: 'set-sound', label: 'Sonar al terminar cada fase', checked: readPref('sound', true), onChange: (v) => writePref('sound', v) }),
      canKeepScreenOn()
        ? toggle({
            id: 'set-awake',
            label: 'Mantener la pantalla encendida',
            hint: 'Mientras corre el temporizador. Así el aviso suena a tiempo.',
            checked: readPref('keepAwake', true),
            onChange: (v) => (writePref('keepAwake', v), pomo.syncScreenLock()),
          })
        : null,
    ),

    ctx.preview ? null : section('Apariencia', themePicker()),

    section(
      'Colores de las tarjetas',
      h('p', { class: 'muted' }, 'Cada tipo de palabra tiene siempre el mismo color. Esa constancia es lo que ayuda a recordar: el color funciona como una pista más, junto con el ícono y el texto.'),
      h('ul', { class: 'legend' }, KINDS.map((k) => h('li', {}, kindTile(k), KIND_LABEL[k]))),
      h('ul', { class: 'legend legend--inline' }, GENDERS.map((g) => h('li', {}, genderChip(g)))),
    ),

    section('Datos en este dispositivo', storageInfo(), dangerZone(ctx)),

    h('p', { class: 'field__hint about' }, 'Mnemo web · tus datos no salen de tus dispositivos: no hay cuentas ni servidores.'),
  );
}

function section(title, ...children) {
  return h('section', { class: 'panel settings-section' }, h('h2', { class: 'panel__title' }, title), ...children);
}

function themePicker() {
  const current = readPref('theme', 'system');
  const options = [
    ['system', 'Sistema'],
    ['light', 'Claro'],
    ['dark', 'Oscuro'],
  ];
  return h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Tema' },
    options.map(([value, label]) =>
      h(
        'label',
        { class: 'segmented__opt', for: `theme-${value}` },
        h('input', {
          type: 'radio',
          name: 'theme',
          id: `theme-${value}`,
          value,
          checked: current === value,
          onChange: () => {
            writePref('theme', value);
            applyTheme(value);
          },
        }),
        label,
      ),
    ),
  );
}

export function applyTheme(value) {
  const root = document.documentElement;
  if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
  else root.removeAttribute('data-theme');
}

function storageInfo() {
  const modeText = {
    indexeddb: 'Guardado en el dispositivo.',
    localstorage: 'Guardado en el dispositivo (modo básico).',
    memory: 'No se puede guardar en este navegador (¿modo privado?). Exportá una copia antes de cerrar.',
  }[storageMode()];
  const usage = h('p', { class: 'field__hint' });
  storageEstimate().then(({ usage: u }) => {
    if (u) usage.textContent = `Ocupa unos ${(u / 1024 / 1024).toFixed(1).replace('.', ',')} MB.`;
  });
  return h('div', { class: 'stack stack--tight' }, h('p', {}, modeText), usage);
}

function dangerZone(ctx) {
  return h(
    'button',
    {
      class: 'btn btn--ghost btn--danger-text',
      type: 'button',
      onClick: async () => {
        const ok = await confirmAction({
          title: '¿Borrar todos los datos?',
          message: 'Se borran todos los mazos, tarjetas y sesiones de ESTE dispositivo. Si querés conservarlos, exportá una copia antes.',
          confirmLabel: 'Borrar todo',
        });
        if (!ok) return;
        await store.resetAll();
        toast('Datos borrados.');
        ctx.navigate('decks');
      },
    },
    icon('trash', { size: 18 }),
    'Borrar todos los datos de este dispositivo',
  );
}
