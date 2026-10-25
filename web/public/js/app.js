// Arranque de la app: carga los datos, dibuja la navegación y la pantalla actual,
// mueve el reloj del Pomodoro y registra el modo sin conexión.

import { h, icon, clear } from './ui/dom.js';
import { toast } from './ui/overlays.js';
import * as store from './data/store.js';
import { readPref, writePref, requestPersistence } from './data/storage.js';
import * as pomo from './services/pomodoroController.js';
import * as P from './core/pomodoro.js';
import { decksView, deckView } from './views/decks.js';
import { pomodoroView } from './views/pomodoro.js';
import { sessionsView, sessionView } from './views/sessions.js';
import { settingsView, applyTheme } from './views/settings.js';
import { practiceView } from './views/practice/index.js';
import { writingView } from './views/practice/writing.js';
import { quizzesView, quizView } from './views/practice/quizzes.js';
import { listeningListView, listeningEditView } from './views/practice/listening.js';
import { dictionaryView } from './views/dictionary.js';

// "preview": versión de prueba publicada dentro de Claude (sin instalación ni descargas).
const PREVIEW = document.querySelector('meta[name="mnemo-mode"]')?.content === 'preview';

const TABS = [
  { id: 'decks', label: 'Mazos', icon: 'decks', routes: ['decks', 'deck'] },
  { id: 'practice', label: 'Práctica', icon: 'practice', routes: ['practice', 'write', 'quizzes', 'quiz', 'listening', 'listening-edit'] },
  { id: 'dictionary', label: 'Diccionario', icon: 'book', routes: ['dictionary'] },
  { id: 'pomodoro', label: 'Pomodoro', icon: 'timer', routes: ['pomodoro'] },
  { id: 'sessions', label: 'Sesiones', icon: 'sessions', routes: ['sessions', 'session'] },
  { id: 'settings', label: 'Ajustes', icon: 'settings', routes: ['settings'] },
];

const VIEWS = {
  dictionary: dictionaryView,
  decks: decksView,
  deck: deckView,
  practice: practiceView,
  write: writingView,
  quizzes: quizzesView,
  quiz: quizView,
  listening: listeningListView,
  'listening-edit': listeningEditView,
  pomodoro: pomodoroView,
  sessions: sessionsView,
  session: sessionView,
  settings: settingsView,
};

let route = { name: readPref('lastTab', 'decks'), params: {} };
if (!TABS.some((t) => t.id === route.name)) route = { name: 'decks', params: {} };

let tickers = [];
let pendingFocus = null;
const main = document.getElementById('main');
const nav = document.getElementById('nav');

const ctx = {
  preview: PREVIEW,
  now: () => Date.now(),
  navigate(name, params = {}) {
    route = { name, params };
    const tab = TABS.find((t) => t.routes.includes(name));
    if (tab && tab.id === name) writePref('lastTab', name);
    render({ scrollTop: true });
  },
  refresh: () => render(),
  /** Las vistas registran funciones que se llaman cada segundo (reloj del Pomodoro). */
  onTick: (fn) => tickers.push(fn),
  focusAfterRender: (id) => (pendingFocus = id),
};

function render({ scrollTop = false } = {}) {
  // Conserva el foco y el cursor si la pantalla se redibuja mientras el usuario escribe.
  const active = document.activeElement;
  const keepFocus = pendingFocus ?? (active?.id && main.contains(active) ? active.id : null);
  const selection = active && 'selectionStart' in active && active.id === keepFocus ? [active.selectionStart, active.selectionEnd] : null;
  pendingFocus = null;

  tickers = [];
  clear(main);
  main.appendChild((VIEWS[route.name] ?? decksView)(ctx, route.params));
  renderNav();
  if (scrollTop) window.scrollTo({ top: 0 });

  if (keepFocus) {
    const el = document.getElementById(keepFocus);
    if (el) {
      el.focus({ preventScroll: true });
      if (selection && 'setSelectionRange' in el) {
        try {
          el.setSelectionRange(...selection);
        } catch {
          /* algunos tipos de input no permiten selección */
        }
      }
    }
  } else if (scrollTop) {
    main.querySelector('h1')?.focus({ preventScroll: true });
  }
}

function renderNav() {
  clear(nav);
  const s = pomo.getState();
  const now = Date.now();
  for (const tab of TABS) {
    const current = tab.routes.includes(route.name);
    const running = tab.id === 'pomodoro' && P.isRunning(s);
    nav.appendChild(
      h(
        'button',
        {
          class: `nav__item${current ? ' is-current' : ''}${running ? ' is-running' : ''}`,
          type: 'button',
          'aria-current': current ? 'page' : null,
          dataset: { tab: tab.id, phase: s.phase },
          onClick: () => ctx.navigate(tab.id),
        },
        icon(tab.icon),
        h('span', { class: 'nav__label' }, running ? P.formatClock(P.remaining(s, now, pomo.getDurations())) : tab.label),
      ),
    );
  }
}

function updateNavTimer(now) {
  const btn = nav.querySelector('[data-tab="pomodoro"]');
  const s = pomo.getState();
  const running = P.isRunning(s);
  if (!btn) return;
  btn.classList.toggle('is-running', running);
  btn.dataset.phase = s.phase;
  btn.querySelector('.nav__label').textContent = running ? P.formatClock(P.remaining(s, now, pomo.getDurations())) : 'Pomodoro';
}

// ───────────────────────────── Reloj global ─────────────────────────────

// pomo.tick avisa a los suscriptores (abajo), que actualizan el reloj y la barra.
function tick() {
  pomo.tick(Date.now());
}

pomo.subscribe(() => {
  const now = Date.now();
  for (const fn of tickers) fn(now);
  updateNavTimer(now);
});

pomo.setPhaseEndHandler((finished, nextPhase) => {
  const msg =
    finished === 'focus'
      ? `Terminó el bloque de foco. Ahora: ${P.PHASES[nextPhase].label.toLowerCase()}.`
      : 'Terminó el descanso. ¿Seguimos?';
  toast(msg, { tone: 'ok', ms: 6000 });
});

// ───────────────────────────── Arranque ─────────────────────────────

async function boot() {
  if (!PREVIEW) applyTheme(readPref('theme', 'system'));
  document.documentElement.classList.toggle('is-preview', PREVIEW);

  const { firstRun } = await store.init();
  store.subscribe(() => render());

  render();
  pomo.tick(Date.now()); // si una fase terminó con la app cerrada, se procesa ahora
  pomo.syncScreenLock();
  setInterval(tick, 1000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      store.flush();
    } else {
      tick();
      pomo.syncScreenLock();
      render();
    }
  });
  window.addEventListener('pagehide', () => store.flush());

  if (PREVIEW) showPreviewBanner();
  else {
    registerServiceWorker();
    showInstallHint();
    requestPersistence();
  }
  if (firstRun) toast('Te dejé un mazo de ejemplo para probar. Podés borrarlo cuando quieras.', { ms: 6000 });
  if (!store.lastSaveSucceeded()) toast('No se pudieron guardar los datos en este navegador.', { tone: 'error', ms: 6000 });
}

function showPreviewBanner() {
  document.getElementById('banner-root').appendChild(
    h('div', { class: 'banner' }, h('p', {}, h('strong', {}, 'Vista de prueba. '), 'Los datos quedan solo en este navegador y pueden borrarse. Para usarla de verdad, instalá la versión web en tu iPhone o iPad.')),
  );
}

// ─────────────────────── Instalación y modo sin conexión ───────────────────────

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let reloading = false;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Hay una versión nueva instalada: se recarga para usarla completa.
    if (!hadController || reloading) return;
    reloading = true;
    store.flush().then(() => location.reload());
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* sin modo sin conexión; la app funciona igual con internet */
  });
}

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function showInstallHint() {
  if (isStandalone() || readPref('installHintDismissed', false)) return;
  const root = document.getElementById('banner-root');
  const dismiss = () => {
    writePref('installHintDismissed', true);
    clear(root);
  };
  const isApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  let deferredPrompt = null;
  const installBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'button', hidden: true, onClick: async () => {
    deferredPrompt?.prompt();
    await deferredPrompt?.userChoice;
    dismiss();
  } }, 'Instalar');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });

  if (!isApple && !('onbeforeinstallprompt' in window)) return;
  root.appendChild(
    h(
      'div',
      { class: 'banner banner--install' },
      icon('import', { size: 20 }),
      h(
        'p',
        {},
        isApple
          ? ['Instalala como app: en Safari tocá ', h('strong', {}, 'Compartir'), ' y después ', h('strong', {}, 'Agregar a pantalla de inicio'), '.']
          : 'Instalala como app para usarla sin conexión y a pantalla completa.',
      ),
      installBtn,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar aviso', onClick: dismiss }, icon('close')),
    ),
  );
}

boot().catch((err) => {
  console.error(err);
  clear(main);
  main.appendChild(h('div', { class: 'screen' }, h('h1', { class: 'screen-title' }, 'No se pudo abrir Mnemo'), h('p', { class: 'muted' }, 'Recargá la página. Si sigue pasando, puede que el navegador esté bloqueando el almacenamiento.')));
});
