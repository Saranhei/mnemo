// Listening: ejercicios con audio o video propio (o la voz del sistema) y su
// transcripción. Tres formas de practicar: completar espacios, responder
// preguntas y dictado completo siguiendo el audio lento.

import { h, icon, clear, plural } from '../../ui/dom.js';
import { screenHeader, emptyState, iconButton, field } from '../../ui/components.js';
import { confirmAction, toast } from '../../ui/overlays.js';
import { openLayer, feedback } from '../../ui/layer.js';
import * as store from '../../data/store.js';
import { putMedia, getMedia, deleteMedia, storageMode } from '../../data/storage.js';
import { live, newId } from '../../core/model.js';
import { clean, MAX_NAME } from '../../core/sanitize.js';
import { matchesAnswer } from '../../core/japanese.js';
import { LEVELS, clozeParts, plainTranscript, sentences, compareDictation } from '../../core/listening.js';
import { sanitizeQuestions, parseQuestionsText, TransferError, LIMITS } from '../../core/transfer.js';
import { pickFile } from '../../services/device.js';
import { say, voicesReady, voiceFor } from '../../services/voice.js';
import { exportListeningFlow } from '../../ui/transferActions.js';
import { LANGUAGES } from '../decks.js';
import { languageName } from '../../ui/dom.js';
import { exampleListenings } from './listeningExamples.js';

const MEDIA_ACCEPT = 'audio/*,video/*,.mp3,.m4a,.aac,.wav,.ogg,.mp4,.mov,.m4v,.webm';
const isMedia = (file) => /^(audio|video)\//.test(file.type) || /\.(mp3|m4a|aac|wav|ogg|mp4|mov|m4v|webm)$/i.test(file.name);
const mediaTypeOf = (file) =>
  file.type ||
  ({ mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm' }[
    file.name.split('.').pop().toLowerCase()
  ] ?? 'audio/mpeg');

const questionsToText = (qs) => qs.map((q) => [q.prompt, q.answers.join(' / '), q.note].filter((x, i) => i < 2 || x).join('\t')).join('\n');

// ───────────────────────────── Lista ─────────────────────────────

export function listeningListView(ctx) {
  const items = live(store.getState().listenings).sort((a, b) => b.updatedAt - a.updatedAt);
  const addExamples = () => {
    for (const ex of exampleListenings()) store.createListening(ex);
    toast('Agregué 3 ejercicios de ejemplo (fácil, medio y difícil).', { tone: 'ok' });
  };
  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: 'Listening',
      subtitle: 'Textos con audio para completar espacios, responder preguntas o escribir siguiendo el audio lento.',
      back: { label: 'Práctica', onClick: () => ctx.navigate('practice') },
      actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => newExercise(ctx) }, icon('plus', { size: 18 }), 'Nuevo ejercicio')],
    }),
    items.length === 0
      ? emptyState({
          title: 'Todavía no hay ejercicios',
          text: 'Subí un audio o video (mp3, m4a, mp4, mov) con su transcripción. Sin audio, la app lee el texto con la voz del sistema.',
          action: h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'button', onClick: () => newExercise(ctx) }, 'Crear uno'), h('button', { class: 'btn btn--ghost', type: 'button', onClick: addExamples }, 'Agregar ejemplos')),
        })
      : h(
          'ul',
          { class: 'deck-list' },
          items.map((l) =>
            h(
              'li',
              { class: 'quiz-row' },
              h(
                'button',
                { class: 'quiz-row__main', type: 'button', onClick: () => ctx.navigate('listening-edit', { id: l.id }) },
                h('span', { class: 'deck-row__name' }, l.title, l.example ? h('span', { class: 'tag' }, 'Ejemplo') : null),
                h(
                  'span',
                  { class: 'deck-row__meta' },
                  h('span', { class: `level-pill level-pill--${l.level}` }, LEVELS[l.level].label),
                  ` ${l.mediaId ? (l.mediaType.startsWith('video') ? 'Video' : 'Audio') : 'Voz del sistema'} · ${plural(l.questions.length, 'pregunta', 'preguntas')}`,
                ),
              ),
              h('button', { class: 'btn btn--primary', type: 'button', disabled: !plainTranscript(l.transcript).trim(), onClick: () => runListening(ctx, l.id) }, icon('play', { size: 18 }), 'Practicar'),
            ),
          ),
        ),
    items.length > 0 && !items.some((l) => l.example) ? h('button', { class: 'link-btn', type: 'button', onClick: addExamples }, 'Agregar ejercicios de ejemplo') : null,
  );
}

function newExercise(ctx) {
  const l = store.createListening({ title: 'Ejercicio nuevo', level: 'medium', language: 'ja' });
  ctx.navigate('listening-edit', { id: l.id });
}

// ───────────────────────────── Editor ─────────────────────────────

export function listeningEditView(ctx, { id }) {
  const l = store.getListening(id);
  if (!l) {
    queueMicrotask(() => ctx.navigate('listening'));
    return h('div');
  }
  const saveField = (key, value) => store.updateListening(id, { [key]: value });

  const title = h('input', { class: 'input', id: 'ls-title', value: l.title, maxlength: MAX_NAME, onChange: (e) => saveField('title', clean(e.target.value, MAX_NAME) || 'Sin título') });
  const level = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': 'Nivel' },
    Object.entries(LEVELS).map(([key, v]) =>
      h('label', { class: 'segmented__opt', for: `ls-level-${key}` }, h('input', { type: 'radio', name: 'ls-level', id: `ls-level-${key}`, value: key, checked: l.level === key, onChange: () => saveField('level', key) }), v.label),
    ),
  );
  const language = h(
    'select',
    { class: 'input', id: 'ls-lang', onChange: (e) => saveField('language', e.target.value) },
    LANGUAGES.map((code) => h('option', { value: code, selected: code === l.language }, languageName(code))),
  );

  const mediaInfo = h('div', { class: 'media-box' });
  const renderMedia = () => {
    clear(mediaInfo);
    const cur = store.getListening(id);
    if (cur.mediaId) {
      mediaInfo.append(
        h('span', { class: 'media-box__icon' }, icon(cur.mediaType.startsWith('video') ? 'eye' : 'headphones', { size: 22 })),
        h('span', { class: 'media-box__name' }, cur.mediaName || 'Archivo'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: uploadMedia }, 'Cambiar'),
        h('button', { class: 'btn btn--ghost btn--sm btn--danger-text', type: 'button', onClick: removeMedia }, 'Quitar'),
      );
    } else {
      mediaInfo.append(
        h('span', { class: 'media-box__icon' }, icon('speaker', { size: 22 })),
        h('span', { class: 'media-box__name muted' }, 'Sin archivo: se usa la voz del sistema.'),
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: uploadMedia }, icon('import', { size: 16 }), 'Subir audio o video'),
      );
    }
  };
  async function uploadMedia() {
    if (storageMode() !== 'indexeddb') return toast('Este navegador no permite guardar archivos (¿modo privado?).', { tone: 'error' });
    const file = await pickFile(MEDIA_ACCEPT, { asText: false });
    if (!file) return;
    if (!isMedia(file)) return toast('Ese archivo no es de audio ni de video.', { tone: 'error' });
    if (file.size > LIMITS.mediaBytes) return toast(`El archivo pesa más de ${LIMITS.mediaBytes / 1024 / 1024} MB.`, { tone: 'error' });
    try {
      const cur = store.getListening(id);
      const mediaId = newId();
      await putMedia(mediaId, file.file);
      if (cur.mediaId) await deleteMedia(cur.mediaId);
      store.updateListening(id, { mediaId, mediaName: clean(file.name, 200), mediaType: mediaTypeOf(file) });
      toast('Archivo guardado en este dispositivo.', { tone: 'ok' });
    } catch {
      toast('No se pudo guardar el archivo (¿falta espacio?).', { tone: 'error' });
    }
  }
  async function removeMedia() {
    const cur = store.getListening(id);
    if (cur.mediaId) await deleteMedia(cur.mediaId);
    store.updateListening(id, { mediaId: null, mediaName: '', mediaType: '' });
  }
  renderMedia();

  const transcript = h('textarea', {
    class: 'input input--transcript',
    id: 'ls-transcript',
    rows: 7,
    lang: l.language,
    value: l.transcript,
    placeholder: '先週の週末、友だちと[京都|きょうと]へ行きました。',
    onChange: (e) => saveField('transcript', clean(e.target.value, LIMITS.transcriptChars)),
  });
  const reading = h('textarea', {
    class: 'input',
    id: 'ls-reading',
    rows: 3,
    lang: l.language,
    value: l.reading,
    placeholder: 'せんしゅうのしゅうまつ、ともだちときょうとへいきました。',
    onChange: (e) => saveField('reading', clean(e.target.value, LIMITS.transcriptChars)),
  });
  const qError = h('p', { class: 'field__error', role: 'alert' });
  const questions = h('textarea', {
    class: 'input input--mono',
    id: 'ls-questions',
    rows: 4,
    value: questionsToText(l.questions),
    placeholder: '¿Adónde fueron?\t京都 / きょうと\n¿En qué viajaron?\t新幹線 / しんかんせん',
    onChange: (e) => {
      try {
        const qs = e.target.value.trim() ? parseQuestionsText(e.target.value) : [];
        qError.textContent = '';
        saveField('questions', qs);
      } catch (err) {
        qError.textContent = err instanceof TransferError ? err.message : 'No se pudieron leer las preguntas.';
      }
    },
  });
  const note = h('textarea', { class: 'input', id: 'ls-note', rows: 2, value: l.note, placeholder: 'Opcional: notas o recomendaciones', onChange: (e) => saveField('note', clean(e.target.value)) });

  const onDelete = async () => {
    const ok = await confirmAction({ title: `¿Borrar "${l.title}"?`, message: 'Se borra el ejercicio y su archivo de audio de este dispositivo.', confirmLabel: 'Borrar' });
    if (!ok) return;
    store.deleteListening(id);
    ctx.navigate('listening');
  };
  const onExport = async () => {
    const cur = store.getListening(id);
    exportListeningFlow(ctx, cur, cur.mediaId ? await getMedia(cur.mediaId) : null);
  };

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: l.title,
      subtitle: 'Los cambios se guardan solos.',
      back: { label: 'Listening', onClick: () => ctx.navigate('listening') },
      actions: [
        iconButton('share', 'Exportar ejercicio (con el audio)', onExport),
        iconButton('trash', 'Borrar ejercicio', onDelete, 'icon-btn--danger'),
      ],
    }),
    h('button', { class: 'btn btn--primary', type: 'button', onClick: () => runListening(ctx, id) }, icon('play', { size: 18 }), 'Practicar'),
    h(
      'section',
      { class: 'panel stack' },
      field({ id: 'ls-title', label: 'Título', control: title }),
      h('div', { class: 'row row--between' }, h('div', { class: 'stack stack--tight' }, h('span', { class: 'field__label' }, 'Nivel'), level), h('div', { class: 'stack stack--tight lang-col' }, h('label', { class: 'field__label', for: 'ls-lang' }, 'Idioma'), language)),
      h('p', { class: 'field__hint' }, 'El nivel decide cuántos espacios hay que completar cuando no los marcás vos (fácil: pocos, difícil: muchos).'),
      h('div', { class: 'stack stack--tight' }, h('span', { class: 'field__label' }, 'Audio o video'), mediaInfo),
      h('p', { class: 'field__hint' }, `mp3, m4a, wav, mp4 o mov, hasta ${LIMITS.mediaBytes / 1024 / 1024} MB. El archivo queda solo en este dispositivo; para pasarlo a otro, usá Exportar.`),
    ),
    h(
      'section',
      { class: 'panel stack' },
      field({ id: 'ls-transcript', label: 'Transcripción', hint: 'Para elegir vos los espacios a completar, poné las palabras entre corchetes: 私は[学生]です. Otra respuesta válida va después de |: [学生|がくせい].', control: transcript }),
      field({ id: 'ls-reading', label: 'Lectura en kana (opcional)', hint: 'Si la transcripción tiene kanji, sirve para corregir el dictado escrito en kana.', control: reading }),
      field({ id: 'ls-questions', label: 'Preguntas de comprensión (opcional)', hint: 'Una por línea: pregunta, tabulación y respuestas separadas por /.', control: questions }),
      qError,
      field({ id: 'ls-note', label: 'Notas', control: note }),
    ),
  );
}

// ───────────────────────────── Reproductor ─────────────────────────────

/**
 * Reproduce el archivo del ejercicio o, si no tiene, la voz del sistema frase por frase.
 * @returns {Promise<{el: HTMLElement, destroy: () => void}>}
 */
async function createPlayer(listening, { defaultRate = 1 } = {}) {
  const blob = listening.mediaId ? await getMedia(listening.mediaId) : null;
  let rate = defaultRate;
  const speedRow = h('div', { class: 'segmented speed', role: 'radiogroup', 'aria-label': 'Velocidad' });
  const setSpeed = (r) => {
    rate = r;
    for (const b of speedRow.children) b.classList.toggle('is-on', Number(b.dataset.rate) === r);
    if (media) media.playbackRate = r;
  };
  for (const r of [0.5, 0.75, 1]) {
    speedRow.appendChild(h('button', { class: 'speed__opt', type: 'button', dataset: { rate: String(r) }, onClick: () => setSpeed(r) }, `${String(r).replace('.', ',')}×`));
  }

  let media = null;
  let url = null;
  const wrap = h('div', { class: 'player' });

  if (blob) {
    url = URL.createObjectURL(blob);
    media = h(listening.mediaType.startsWith('video') ? 'video' : 'audio', { class: 'player__media', controls: true, preload: 'metadata', playsinline: true, src: url });
    media.preservesPitch = true;
    wrap.append(
      media,
      h(
        'div',
        { class: 'player__row' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => (media.currentTime = Math.max(0, media.currentTime - 5)) }, '−5 s'),
        speedRow,
      ),
    );
  } else {
    const list = sentences(listening.transcript);
    let index = 0;
    let playing = false;
    const counter = h('span', { class: 'player__counter' });
    const playBtn = h('button', { class: 'btn btn--big-play btn--play-sm', type: 'button', 'aria-label': 'Reproducir' }, icon('play', { size: 24 }));
    const update = () => {
      counter.textContent = `Frase ${Math.min(index + 1, list.length)} de ${list.length}`;
      clear(playBtn);
      playBtn.appendChild(icon(playing ? 'pause' : 'play', { size: 24 }));
      playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    };
    const ttsRate = () => ({ 0.5: 0.5, 0.75: 0.7, 1: 0.95 })[rate];
    const playFrom = async (i, onlyOne = false) => {
      playing = true;
      for (index = i; index < list.length && playing; index++) {
        update();
        await say(list[index], { language: listening.language, rate: ttsRate() });
        if (onlyOne) break;
      }
      if (index >= list.length) index = 0;
      playing = false;
      update();
    };
    const stop = () => {
      playing = false;
      globalThis.speechSynthesis?.cancel();
      update();
    };
    playBtn.addEventListener('click', () => (playing ? stop() : playFrom(index)));
    wrap.append(
      h(
        'div',
        { class: 'player__row' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Frase anterior', onClick: () => (stop(), playFrom(Math.max(0, index - 1), true)) }, icon('back')),
        playBtn,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Repetir esta frase', onClick: () => (stop(), playFrom(index, true)) }, icon('reset')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Frase siguiente', onClick: () => (stop(), playFrom(Math.min(list.length - 1, index + 1), true)) }, icon('next')),
        counter,
      ),
      h('div', { class: 'player__row' }, h('span', { class: 'field__hint' }, listening.mediaId ? 'El audio de este ejercicio no está en este dispositivo: se usa la voz del sistema.' : 'Voz del sistema'), speedRow),
    );
    update();
    voicesReady().then(() => {
      if (!voiceFor(listening.language)) wrap.prepend(h('p', { class: 'callout callout--warn' }, `No hay una voz de ${languageName(listening.language)} instalada. En iPhone/iPad: Ajustes → Accesibilidad → Contenido leído → Voces.`));
    });
  }
  setSpeed(defaultRate);
  return {
    el: wrap,
    destroy: () => {
      media?.pause();
      globalThis.speechSynthesis?.cancel();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

// ───────────────────────────── Practicar ─────────────────────────────

const RUN_MODES = [
  { id: 'cloze', label: 'Completar espacios' },
  { id: 'questions', label: 'Preguntas' },
  { id: 'dictation', label: 'Dictado completo' },
];

export async function runListening(ctx, id) {
  const l = store.getListening(id);
  if (!l) return;
  let player = null;
  const layer = openLayer({ title: l.title, onClose: () => player?.destroy() });
  layer.setProgress(0);
  layer.setStatus(LEVELS[l.level].label);

  const modes = RUN_MODES.filter((m) => m.id !== 'questions' || l.questions.length > 0);
  let mode = modes[0].id;
  const content = h('div', { class: 'listen__content' });
  const tabs = h(
    'div',
    { class: 'set-chips listen__tabs', role: 'tablist', 'aria-label': 'Ejercicio' },
    modes.map((m) =>
      h('button', { class: `set-chip${m.id === mode ? ' is-on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(m.id === mode), dataset: { mode: m.id }, onClick: () => selectMode(m.id) }, m.label),
    ),
  );
  const selectMode = (m) => {
    mode = m;
    for (const t of tabs.children) {
      t.classList.toggle('is-on', t.dataset.mode === m);
      t.setAttribute('aria-selected', String(t.dataset.mode === m));
    }
    clear(content);
    layer.setProgress(0);
    content.appendChild({ cloze: clozeMode, questions: questionsMode, dictation: dictationMode }[m](l, layer));
  };

  player = await createPlayer(l, { defaultRate: 0.75 });
  layer.body.append(h('div', { class: 'listen' }, player.el, tabs, l.note ? h('p', { class: 'callout' }, l.note) : null, content));
  selectMode(mode);
}

function clozeMode(l, layer) {
  const parts = clozeParts(l.transcript, l.level, l.language);
  const inputs = [];
  const text = h(
    'div',
    { class: 'cloze', lang: l.language },
    parts.map((p, i) => {
      if (p.text !== undefined) return h('span', {}, p.text);
      const size = Math.max(2, Math.min(14, [...p.blank.answers[0]].length + 1));
      const input = h('input', { class: 'cloze__input', id: `cloze-${i}`, lang: l.language, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, size, 'aria-label': `Espacio ${inputs.length + 1}` });
      input.style.setProperty('--w', `${size * 1.15}em`);
      inputs.push({ input, answers: p.blank.answers });
      return input;
    }),
  );
  const result = h('div', { class: 'quiz__feedback' });
  const check = () => {
    let ok = 0;
    for (const { input, answers } of inputs) {
      const right = matchesAnswer(input.value, answers);
      if (right) ok += 1;
      input.classList.toggle('is-right', right);
      input.classList.toggle('is-wrong', !right);
      input.title = right ? '' : `Era: ${answers.join(' / ')}`;
      if (!right) input.placeholder = answers[0];
    }
    clear(result);
    result.appendChild(
      feedback({
        ok: ok === inputs.length,
        title: `${ok} de ${inputs.length} bien`,
        lines: [ok < inputs.length ? 'Los espacios en rojo muestran la respuesta como pista: borrá y escribila.' : '¡Completaste todo!'],
      }),
    );
    layer.setProgress(inputs.length ? ok / inputs.length : 1);
  };
  return h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: (e) => (e.preventDefault(), check()) },
    h('p', { class: 'muted' }, `Escuchá y completá ${plural(inputs.length, 'espacio', 'espacios')}. Vale kana, kanji o romaji.`),
    text,
    h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Comprobar')),
    result,
  );
}

function questionsMode(l, layer) {
  const rows = l.questions.map((q, i) => {
    const input = h('input', { class: 'input', id: `lq-${i}`, lang: l.language, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Tu respuesta' });
    const fb = h('div', {});
    return { q, input, fb, el: h('li', { class: 'lq' }, h('label', { class: 'lq__prompt', for: `lq-${i}` }, q.prompt), input, fb) };
  });
  const summary = h('div', { class: 'quiz__feedback' });
  const check = () => {
    let ok = 0;
    for (const r of rows) {
      const right = matchesAnswer(r.input.value, r.q.answers);
      if (right) ok += 1;
      clear(r.fb);
      r.fb.appendChild(feedback({ ok: right, title: right ? 'Bien' : 'Respuesta:', lines: [right ? '' : r.q.answers.join(' / '), r.q.note] }));
    }
    clear(summary);
    summary.appendChild(feedback({ ok: ok === rows.length, title: `${ok} de ${rows.length} bien`, lines: [] }));
    layer.setProgress(ok / rows.length);
  };
  return h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: (e) => (e.preventDefault(), check()) },
    h('ol', { class: 'lq-list' }, rows.map((r) => r.el)),
    h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Comprobar')),
    summary,
  );
}

function dictationMode(l, layer) {
  const area = h('textarea', { class: 'input input--transcript', id: 'ld-text', rows: 6, lang: l.language, autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: 'Escribí todo lo que escuchás (kana, kanji o romaji). Usá la velocidad 0,5× y repetí las frases que necesites.' });
  const result = h('div', { class: 'quiz__feedback' });
  const check = () => {
    if (!area.value.trim()) return area.focus();
    const r = compareDictation(area.value, [l.transcript, l.reading]);
    const pct = Math.round(r.score * 100);
    clear(result);
    result.append(
      feedback({ ok: pct >= 90, title: `${pct} % del texto`, lines: [pct >= 90 ? '¡Muy bien!' : 'En rojo, lo que faltó o no coincide.'] }),
      h(
        'p',
        { class: 'diff', lang: l.language },
        [...r.reference].map((ch, i) => (r.marks[i] === false ? h('mark', { class: 'diff__miss' }, ch) : ch)),
      ),
    );
    layer.setProgress(r.score);
  };
  return h(
    'form',
    { class: 'stack', novalidate: true, onSubmit: (e) => (e.preventDefault(), check()) },
    area,
    h('div', { class: 'row' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Comprobar'), h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => {
      clear(result);
      result.appendChild(h('p', { class: 'diff', lang: l.language }, plainTranscript(l.transcript)));
    } }, 'Ver transcripción')),
    result,
  );
}
