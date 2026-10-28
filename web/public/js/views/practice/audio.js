// Pronunciación (micrófono) y "¿Qué escuchaste?" (palabras sueltas).
// Los ejercicios con textos largos están en listening.js.

import { h, icon, clear } from '../../ui/dom.js';
import { field } from '../../ui/components.js';
import { openSheet, toast } from '../../ui/overlays.js';
import { openLayer, resultPanel, feedback } from '../../ui/layer.js';
import * as store from '../../data/store.js';
import { readPref, writePref } from '../../data/storage.js';
import { liveDecks, deckCards } from '../../core/model.js';
import { judgeSpoken, soundKey } from '../../core/speech.js';
import { preloadReadings, readingsOf } from '../../services/dictionary.js';
import { itemsFromCards, speechText, acceptedForms, pickDistractors, shuffle, readingHint } from '../../core/practice.js';
import {
  sayJapanese, voicesReady, japaneseVoice, canRecognize, listenOnce, recognitionErrorMessage, canRecord, startRecording, isInstalledApp,
} from '../../services/voice.js';

export const MODES = {
  speak: { title: 'Pronunciación', needs: (i) => i.readings.length > 0 || i.kanji },
  meaning: { title: '¿Qué escuchaste?', needs: (i) => (i.readings.length > 0 || i.kanji) && i.meaning },
};

// ───────────────────────────── Elegir qué practicar ─────────────────────────────

export function openSourceSheet(ctx, mode) {
  const state = store.getState();
  const sources = liveDecks(state)
    .map((d) => ({ deck: d, items: itemsFromCards(deckCards(state, d.id)).filter(MODES[mode].needs) }))
    .filter((s) => s.items.length > 0);
  if (sources.length === 0) return toast('Necesitás un mazo con palabras en japonés (con su lectura en kana).');
  const minItems = mode === 'meaning' ? 4 : 1;

  openSheet({
    title: MODES[mode].title,
    build: (close) => {
      const saved = readPref(`source.${mode}`, '');
      const deckSel = h(
        'select',
        { class: 'input', id: 'src-deck' },
        sources.map((s) => h('option', { value: s.deck.id, selected: s.deck.id === saved }, `${s.deck.name} (${s.items.length})`)),
      );
      const countSel = h('select', { class: 'input', id: 'src-count' }, [10, 20, 0].map((n) => h('option', { value: n, selected: n === readPref('source.count', 10) }, n ? `${n} al azar` : 'Todas, en orden')));
      return h(
        'form',
        {
          class: 'stack',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            const src = sources.find((s) => s.deck.id === deckSel.value);
            if (src.items.length < minItems) return toast(`Ese mazo tiene muy pocas palabras para este ejercicio (mínimo ${minItems}).`);
            const n = Number(countSel.value);
            writePref(`source.${mode}`, src.deck.id);
            writePref('source.count', n);
            const items = n ? shuffle(src.items).slice(0, n) : src.items;
            close();
            const run = { speak: runSpeak, meaning: runMeaning }[mode];
            run(ctx, src.deck, items, src.items);
          },
        },
        field({ id: 'src-deck', label: 'Mazo', control: deckSel }),
        field({ id: 'src-count', label: 'Cantidad', control: countSel }),
        mode === 'speak'
          ? h('p', { class: 'field__hint' }, 'El reconocimiento de voz lo hace tu navegador (Apple o Google) y puede enviar el audio a sus servidores. La opción "Grabarme" no envía nada.')
          : null,
        h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, icon('play', { size: 18 }), 'Empezar'),
      );
    },
  });
}

/** Avisa si el dispositivo no tiene una voz japonesa. */
async function voiceWarning(layer) {
  await voicesReady();
  if (japaneseVoice()) return;
  layer.body.prepend(
    h(
      'div',
      { class: 'callout callout--warn' },
      icon('speaker', { size: 20 }),
      h('p', {}, 'No encontré una voz japonesa. En iPhone/iPad: Ajustes → Accesibilidad → Contenido leído → Voces → Japonés, y descargá una (por ejemplo, Kyoko).'),
    ),
  );
}

function scoreRunner(ctx, { title, items, renderItem }) {
  let index = 0;
  let right = 0;
  const layer = openLayer({ title, onKey: (e) => current?.onKey?.(e) });
  let current = null;

  function next(ok) {
    if (ok) right += 1;
    index += 1;
    show();
  }

  function show() {
    layer.clear();
    layer.setStatus(`${index} de ${items.length} · ${right} bien`);
    layer.setProgress(index / items.length);
    if (index >= items.length) {
      current = null;
      layer.body.appendChild(
        resultPanel({
          title: right === items.length ? '¡Perfecto!' : 'Terminaste',
          tone: right >= items.length * 0.7 ? 'good' : 'retry',
          text: `${right} de ${items.length} bien.`,
          actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => layer.close() }, 'Listo')],
        }),
      );
      return;
    }
    current = renderItem(items[index], { body: layer.body, next });
  }

  voiceWarning(layer);
  show();
  return layer;
}

const wordBlock = (item, { showMeaning = true, showReading = true } = {}) =>
  h(
    'div',
    { class: 'word' },
    h('p', { class: 'word__main', lang: 'ja' }, item.kanji || item.display),
    showReading && readingHint({ ...item, display: item.kanji || item.display }) ? h('p', { class: 'word__reading', lang: 'ja' }, readingHint({ ...item, display: item.kanji || item.display })) : null,
    showMeaning ? h('p', { class: 'word__meaning' }, item.meaning) : null,
  );

const nextButton = (onClick, label = 'Siguiente') =>
  h('button', { class: 'btn btn--primary', type: 'button', id: 'audio-next', onClick }, label, icon('next', { size: 18 }));

// ───────────────────────────── Pronunciación ─────────────────────────────

/** Nota de pronunciación para mostrar: bien, casi (con qué marcar más) o no. */
function spokenFeedback(judged, item, source) {
  const heard = judged.heard ? `${source}: ${judged.heard}${judged.reading ? ` (se lee ${judged.reading})` : ''}` : '';
  if (!judged.ok) return { ok: false, title: 'No se entendió igual', lines: [heard || `${source}: —`] };
  if (!judged.near) return { ok: true, title: '¡Se entendió bien!', lines: [heard] };
  const target = acceptedForms(item).map(soundKey).find(Boolean) ?? '';
  const heardKey = soundKey(judged.reading || judged.heard);
  const tip = target.endsWith('N') && !heardKey.endsWith('N') ? 'Marcá un poco más la ん del final.' : 'Marcá un poco más cada sonido.';
  return { ok: true, title: '¡Casi! Se entendió muy parecido', lines: [heard, tip] };
}

function runSpeak(ctx, deck, items) {
  preloadReadings();
  scoreRunner(ctx, {
    title: `Pronunciación · ${deck.name}`,
    items,
    renderItem: (item, { body, next }) => {
      const result = h('div', { class: 'audio__result' });
      const actions = h('div', { class: 'audio__next' });

      const grade = (ok, title, lines = []) => {
        clear(result);
        result.appendChild(feedback({ ok, title, lines }));
        // Cada intento nuevo reemplaza la nota del anterior.
        clear(actions);
        actions.appendChild(nextButton(() => next(ok)));
        document.getElementById('audio-next')?.focus({ preventScroll: true });
      };


      // 1) Reconocimiento de voz del navegador (Safari, Chrome)
      const micBtn = h('button', { class: 'btn btn--mic', type: 'button' }, icon('mic', { size: 22 }), 'Decirlo');
      micBtn.addEventListener('click', async () => {
        micBtn.disabled = true;
        micBtn.classList.add('is-listening');
        micBtn.lastChild.textContent = 'Escuchando…';
        const r = await listenOnce();
        micBtn.disabled = false;
        micBtn.classList.remove('is-listening');
        micBtn.lastChild.textContent = 'Decirlo';
        if (r.error) {
          clear(result);
          result.appendChild(h('p', { class: 'field__error' }, recognitionErrorMessage(r.error)));
          return;
        }
        const f = spokenFeedback(judgeSpoken(r.alternatives, acceptedForms(item), { readingsOf }), item, 'Escuché');
        grade(f.ok, f.title, f.lines);
      });

      // 2) Dictado con el micrófono del teclado (sirve también en la app instalada)
      const typed = h('input', { class: 'input', id: 'speak-typed', lang: 'ja', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Tocá acá y usá el micrófono del teclado' });
      const typedForm = h(
        'form',
        {
          class: 'audio__alt',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            if (!typed.value.trim()) return typed.focus();
            const f = spokenFeedback(judgeSpoken([typed.value], acceptedForms(item), { readingsOf }), item, 'El dictado escribió');
            grade(f.ok, f.title, f.lines);
          },
        },
        h('label', { class: 'field__label', for: 'speak-typed' }, 'Con el dictado del teclado'),
        h('div', { class: 'row row--nowrap' }, typed, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Comprobar')),
      );

      // 3) Grabarme y comparar (nada sale del dispositivo)
      const player = h('audio', { class: 'audio__player', controls: true, hidden: true });
      const recBtn = h('button', { class: 'btn btn--ghost', type: 'button', hidden: !canRecord() }, icon('mic', { size: 18 }), 'Grabarme');
      const selfGrade = h(
        'div',
        { class: 'row', hidden: true },
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => grade(true, 'Bien, según vos') }, icon('check', { size: 18 }), 'Me salió bien'),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => grade(false, 'A repetirla') }, icon('reset', { size: 18 }), 'Repetir'),
      );
      let recording = null;
      recBtn.addEventListener('click', async () => {
        try {
          if (!recording) {
            recording = await startRecording();
            recBtn.classList.add('is-listening');
            recBtn.lastChild.textContent = 'Detener';
            return;
          }
          const url = await recording.stop();
          recording = null;
          recBtn.classList.remove('is-listening');
          recBtn.lastChild.textContent = 'Grabarme de nuevo';
          if (player.src) URL.revokeObjectURL(player.src);
          player.src = url;
          player.hidden = false;
          selfGrade.hidden = false;
          player.play().catch(() => {});
        } catch {
          recording = null;
          toast('No se pudo usar el micrófono. Revisá el permiso en los ajustes del navegador.', { tone: 'error' });
        }
      });

      const installedNote =
        !canRecognize() && isInstalledApp()
          ? h('p', { class: 'field__hint' }, 'En la app instalada, Apple no permite el reconocimiento automático. Usá el dictado del teclado o abrí Mnemo en Safari para la corrección automática.')
          : null;

      body.append(
        h(
          'div',
          { class: 'audio' },
          wordBlock(item),
          h(
            'div',
            { class: 'row row--center' },
            h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => sayJapanese(speechText(item)) }, icon('speaker', { size: 18 }), 'Escuchar modelo'),
            canRecognize() ? micBtn : null,
          ),
          result,
          actions,
          h(
            'details',
            { class: 'audio__more', open: !canRecognize() },
            h('summary', {}, 'Otras formas de practicar'),
            installedNote,
            typedForm,
            h('div', { class: 'stack stack--tight' }, h('p', { class: 'field__label' }, 'Grabarme y comparar con el modelo'), h('div', { class: 'row' }, recBtn), player, selfGrade),
          ),
        ),
      );
      return {
        onKey: (e) => {
          if (e.target instanceof HTMLElement && e.target.matches('input')) return;
          if (e.key.toLowerCase() === 'p') sayJapanese(speechText(item));
        },
      };
    },
  });
}

// ───────────────────────────── ¿Qué escuchaste? ─────────────────────────────

function runMeaning(ctx, deck, items, pool) {
  scoreRunner(ctx, {
    title: `¿Qué escuchaste? · ${deck.name}`,
    items,
    renderItem: (item, { body, next }) => {
      const options = shuffle([item, ...pickDistractors(pool, item, 3)]);
      const fb = h('div', { class: 'quiz__feedback' });
      let answered = null;
      const play = () => sayJapanese(speechText(item));

      const choose = (opt, btn) => {
        if (answered !== null) return;
        answered = opt.id === item.id;
        for (const b of grid.children) {
          b.disabled = true;
          if (b.dataset.id === item.id) b.classList.add('is-right');
        }
        if (!answered) btn.classList.add('is-wrong');
        fb.append(feedback({ ok: answered, title: answered ? '¡Correcto!' : 'Era otra:', lines: [] }), wordBlock(item), nextButton(() => next(answered)));
        document.getElementById('audio-next')?.focus({ preventScroll: true });
      };

      const grid = h(
        'div',
        { class: 'options' },
        options.map((opt, i) => {
          const btn = h('button', { class: 'option', type: 'button', dataset: { id: opt.id } }, h('span', { class: 'option__key' }, i + 1), opt.meaning);
          btn.addEventListener('click', () => choose(opt, btn));
          return btn;
        }),
      );

      body.append(
        h(
          'div',
          { class: 'audio' },
          h('div', { class: 'row row--center' }, h('button', { class: 'btn btn--big-play', type: 'button', 'aria-label': 'Escuchar de nuevo', onClick: play }, icon('speaker', { size: 30 }))),
          h('p', { class: 'muted audio__hint' }, '¿Qué significa la palabra que escuchaste?'),
          grid,
          fb,
        ),
      );
      setTimeout(play, 250);
      return {
        onKey: (e) => {
          const n = Number(e.key);
          if (n >= 1 && n <= options.length) choose(options[n - 1], grid.children[n - 1]);
          else if (e.key.toLowerCase() === 'p') play();
        },
      };
    },
  });
}
