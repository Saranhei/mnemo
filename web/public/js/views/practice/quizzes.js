// Preguntas: cuestionarios por unidad que se responden escribiendo.

import { h, icon, plural, clear } from '../../ui/dom.js';
import { screenHeader, emptyState, iconButton, field } from '../../ui/components.js';
import { openSheet, confirmAction, toast } from '../../ui/overlays.js';
import { openLayer, resultPanel, feedback } from '../../ui/layer.js';
import * as store from '../../data/store.js';
import { live, liveDecks, deckCards } from '../../core/model.js';
import { clean, MAX_NAME } from '../../core/sanitize.js';
import { matchesAnswer } from '../../core/japanese.js';
import { itemsFromCards, acceptedForms, shuffle } from '../../core/practice.js';
import { parseQuestionsText, sanitizeQuestions, TransferError } from '../../core/transfer.js';
import { pickFile } from '../../services/device.js';

// ───────────────────────────── Lista ─────────────────────────────

export function quizzesView(ctx) {
  const quizzes = live(store.getState().quizzes).sort((a, b) => b.updatedAt - a.updatedAt);
  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: 'Preguntas',
      subtitle: 'Cuestionarios por unidad. Respondés escribiendo, en kana, kanji o romaji.',
      back: { label: 'Práctica', onClick: () => ctx.navigate('practice') },
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => openGenerateSheet(ctx) }, icon('decks', { size: 18 }), 'Desde un mazo'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openQuizNameSheet(ctx) }, icon('plus', { size: 18 }), 'Nuevo'),
      ],
    }),
    quizzes.length === 0
      ? emptyState({
          title: 'Todavía no hay cuestionarios',
          text: 'Creá uno por unidad (por ejemplo "Genki L3") y cargale preguntas, o generalo desde un mazo en un toque.',
          action: h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openGenerateSheet(ctx) }, 'Generar desde un mazo'),
        })
      : h(
          'ul',
          { class: 'deck-list' },
          quizzes.map((q) =>
            h(
              'li',
              { class: 'quiz-row' },
              h(
                'button',
                { class: 'quiz-row__main', type: 'button', onClick: () => ctx.navigate('quiz', { id: q.id }) },
                h('span', { class: 'deck-row__name' }, q.name),
                h('span', { class: 'deck-row__meta' }, plural(q.questions.length, 'pregunta', 'preguntas')),
              ),
              h('button', { class: 'btn btn--primary', type: 'button', disabled: q.questions.length === 0, onClick: () => runQuiz(ctx, q.id) }, icon('play', { size: 18 }), 'Practicar'),
            ),
          ),
        ),
  );
}

function openQuizNameSheet(ctx, quiz = null) {
  openSheet({
    title: quiz ? 'Renombrar cuestionario' : 'Nuevo cuestionario',
    build: (close) => {
      const input = h('input', { class: 'input', id: 'quiz-name', value: quiz?.name ?? '', maxlength: MAX_NAME, placeholder: 'Ej. Genki L3 · verbos', autocomplete: 'off' });
      const error = h('p', { class: 'field__error', role: 'alert' });
      return h(
        'form',
        {
          class: 'stack',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            const name = clean(input.value, MAX_NAME);
            if (!name) return void (error.textContent = 'Poné un nombre.');
            if (quiz) store.updateQuiz(quiz.id, { name });
            else {
              const q = store.createQuiz({ name });
              close();
              ctx.navigate('quiz', { id: q.id });
              return;
            }
            close();
          },
        },
        field({ id: 'quiz-name', label: 'Nombre', control: input }),
        error,
        h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, quiz ? 'Guardar' : 'Crear'),
      );
    },
  });
}

// ───────────────────────────── Generar desde un mazo ─────────────────────────────

function openGenerateSheet(ctx) {
  const decks = liveDecks(store.getState()).filter((d) => deckCards(store.getState(), d.id).length > 0);
  if (decks.length === 0) return toast('Primero creá o importá un mazo con tarjetas.');
  openSheet({
    title: 'Generar desde un mazo',
    build: (close) => {
      const deckSel = h('select', { class: 'input', id: 'gen-deck' }, decks.map((d) => h('option', { value: d.id }, d.name)));
      const dir = h(
        'fieldset',
        { class: 'chips' },
        h('legend', { class: 'field__label' }, '¿Qué tenés que escribir?'),
        [
          ['es-ja', 'La palabra en japonés'],
          ['ja-es', 'El significado en español'],
        ].map(([value, label], i) =>
          h('label', { class: 'chip', for: `gen-${value}` }, h('input', { type: 'radio', name: 'gen-dir', id: `gen-${value}`, value, checked: i === 0 }), label),
        ),
      );
      return h(
        'form',
        {
          class: 'stack',
          novalidate: true,
          onSubmit: (e) => {
            e.preventDefault();
            const deck = store.getDeck(deckSel.value);
            const direction = dir.querySelector('input:checked').value;
            const questions = questionsFromDeck(deck, direction);
            if (questions.length === 0) return toast('Ese mazo no tiene tarjetas que sirvan para preguntas.');
            const q = store.createQuiz({ name: `${deck.name} · ${direction === 'es-ja' ? 'escribir en japonés' : 'significados'}`.slice(0, MAX_NAME), questions });
            close();
            toast(`Cuestionario creado con ${plural(questions.length, 'pregunta', 'preguntas')}.`, { tone: 'ok' });
            ctx.navigate('quiz', { id: q.id });
          },
        },
        field({ id: 'gen-deck', label: 'Mazo', control: deckSel }),
        dir,
        h('p', { class: 'field__hint' }, 'Después podés editar, borrar o agregar preguntas.'),
        h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Generar'),
      );
    },
  });
}

function questionsFromDeck(deck, direction) {
  const cards = deckCards(store.getState(), deck.id).sort((a, b) => a.createdAt - b.createdAt);
  const out = [];
  if (direction === 'ja-es') {
    for (const c of cards) out.push({ prompt: `¿Qué significa ${c.front}?`, answers: [c.back], note: c.pronunciation });
  } else {
    for (const item of itemsFromCards(cards.filter((c) => c.kind !== 'character'))) {
      out.push({ prompt: `¿Cómo se dice “${item.meaning}” en japonés?`, answers: acceptedForms(item), note: '' });
    }
    for (const c of cards.filter((x) => x.kind === 'character')) {
      out.push({ prompt: `¿Qué kanji significa “${c.back}”?`, answers: [c.front], note: c.pronunciation });
    }
  }
  return sanitizeQuestions(out);
}

// ───────────────────────────── Editor ─────────────────────────────

export function quizView(ctx, { id }) {
  const quiz = store.getQuiz(id);
  if (!quiz) {
    queueMicrotask(() => ctx.navigate('quizzes'));
    return h('div');
  }

  const onDelete = async () => {
    const ok = await confirmAction({ title: `¿Borrar "${quiz.name}"?`, message: `Se borran sus ${plural(quiz.questions.length, 'pregunta', 'preguntas')}.`, confirmLabel: 'Borrar' });
    if (!ok) return;
    store.deleteQuiz(id);
    toast('Cuestionario borrado.');
    ctx.navigate('quizzes');
  };

  return h(
    'div',
    { class: 'screen' },
    screenHeader({
      title: quiz.name,
      subtitle: plural(quiz.questions.length, 'pregunta', 'preguntas'),
      back: { label: 'Preguntas', onClick: () => ctx.navigate('quizzes') },
      actions: [
        iconButton('edit', 'Renombrar', () => openQuizNameSheet(ctx, quiz)),
        iconButton('trash', 'Borrar cuestionario', onDelete, 'icon-btn--danger'),
      ],
    }),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn btn--primary', type: 'button', disabled: quiz.questions.length === 0, onClick: () => runQuiz(ctx, id) }, icon('play', { size: 18 }), 'Practicar'),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => openQuestionSheet(quiz) }, icon('plus', { size: 18 }), 'Pregunta'),
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => openImportSheet(quiz) }, icon('import', { size: 18 }), 'Importar texto'),
    ),
    quiz.questions.length === 0
      ? h('p', { class: 'muted' }, 'Agregá preguntas de a una o importá varias juntas desde un texto.')
      : h(
          'ol',
          { class: 'card-list question-list' },
          quiz.questions.map((q, i) =>
            h(
              'li',
              {},
              h(
                'button',
                { class: 'card-row', type: 'button', onClick: () => openQuestionSheet(quiz, i) },
                h('span', { class: 'question-list__n' }, i + 1),
                h('span', { class: 'card-row__text' }, h('span', { class: 'question-list__prompt' }, q.prompt), h('span', { class: 'card-row__back', lang: 'ja' }, q.answers.join(' / '))),
                icon('edit', { size: 18 }),
              ),
            ),
          ),
        ),
  );
}

function openQuestionSheet(quiz, index = null) {
  const existing = index === null ? null : quiz.questions[index];
  openSheet({
    title: existing ? 'Editar pregunta' : 'Nueva pregunta',
    build: (close) => {
      const prompt = h('textarea', { class: 'input', id: 'q-prompt', rows: 2, value: existing?.prompt ?? '', placeholder: '¿Cómo se dice "biblioteca"?' });
      const answers = h('textarea', { class: 'input', id: 'q-answers', rows: 3, lang: 'ja', value: existing?.answers.join('\n') ?? '', placeholder: 'としょかん\n図書館' });
      const note = h('input', { class: 'input', id: 'q-note', value: existing?.note ?? '', placeholder: 'Opcional: explicación que se muestra después' });
      const error = h('p', { class: 'field__error', role: 'alert' });
      const save = (e) => {
        e.preventDefault();
        const [q] = sanitizeQuestions([{ prompt: prompt.value, answers: answers.value.split('\n'), note: note.value }]);
        if (!q) return void (error.textContent = 'Completá la pregunta y al menos una respuesta.');
        const questions = [...quiz.questions];
        if (existing) questions[index] = q;
        else questions.push(q);
        store.updateQuiz(quiz.id, { questions });
        if (existing) return close();
        prompt.value = '';
        answers.value = '';
        note.value = '';
        error.textContent = '';
        toast('Pregunta agregada.', { tone: 'ok' });
        quiz = store.getQuiz(quiz.id);
        prompt.focus();
      };
      const remove = async () => {
        const questions = quiz.questions.filter((_, i) => i !== index);
        store.updateQuiz(quiz.id, { questions });
        close();
      };
      return h(
        'form',
        { class: 'stack', novalidate: true, onSubmit: save },
        field({ id: 'q-prompt', label: 'Pregunta', control: prompt }),
        field({ id: 'q-answers', label: 'Respuestas correctas (una por línea)', hint: 'Se acepta cualquiera. Da igual hiragana, katakana o romaji, y las tildes en español.', control: answers }),
        field({ id: 'q-note', label: 'Nota', control: note }),
        error,
        h(
          'div',
          { class: 'row row--between' },
          existing ? h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: remove }, icon('trash', { size: 18 }), 'Borrar') : h('span'),
          h('button', { class: 'btn btn--primary', type: 'submit' }, existing ? 'Guardar' : 'Agregar'),
        ),
      );
    },
  });
}

function openImportSheet(quiz) {
  openSheet({
    title: 'Importar preguntas',
    build: (close) => {
      const area = h('textarea', { class: 'input input--mono', id: 'q-import', rows: 8, placeholder: '¿Cómo se dice "comer"?\tたべる / taberu\n¿Qué significa 学校?\tescuela' });
      const error = h('p', { class: 'field__error', role: 'alert' });
      const add = (text) => {
        try {
          const questions = parseQuestionsText(text);
          const current = store.getQuiz(quiz.id);
          store.updateQuiz(quiz.id, { questions: [...current.questions, ...questions] });
          close();
          toast(`Se agregaron ${plural(questions.length, 'pregunta', 'preguntas')}.`, { tone: 'ok' });
        } catch (err) {
          error.textContent = err instanceof TransferError ? err.message : 'No se pudo leer el texto.';
        }
      };
      return h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, 'Una pregunta por línea: la pregunta, una tabulación y las respuestas separadas por "/". Opcional: otra tabulación y una nota. Sirve copiar dos columnas de una planilla.'),
        area,
        error,
        h(
          'div',
          { class: 'row row--between' },
          h(
            'button',
            {
              class: 'btn btn--ghost',
              type: 'button',
              onClick: async () => {
                const file = await pickFile('.txt,.tsv,text/plain,text/tab-separated-values');
                if (file) add(file.text);
              },
            },
            icon('import', { size: 18 }),
            'Desde un archivo',
          ),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => add(area.value) }, 'Agregar'),
        ),
      );
    },
  });
}

// ───────────────────────────── Responder ─────────────────────────────

export function runQuiz(ctx, id) {
  const quiz = store.getQuiz(id);
  if (!quiz || quiz.questions.length === 0) return;
  const total = quiz.questions.length;
  let queue = shuffle(quiz.questions.map((q, i) => ({ ...q, i })));
  const firstTry = new Map();
  let answered = false;

  const layer = openLayer({ title: quiz.name });

  function show() {
    layer.clear();
    const done = firstTry.size;
    layer.setStatus(`${done} de ${total}`);
    layer.setProgress(done / total);
    const q = queue[0];
    if (!q) return finish();
    answered = false;

    const input = h('input', {
      class: 'input input--answer',
      id: 'quiz-answer',
      lang: 'ja',
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      enterkeyhint: 'done',
      placeholder: 'Tu respuesta',
      'aria-label': 'Tu respuesta',
    });
    const fb = h('div', { class: 'quiz__feedback' });
    const checkBtn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Comprobar');
    const giveUp = h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => grade(false, true) }, 'No sé');

    function grade(ok, gaveUp = false) {
      answered = true;
      if (!firstTry.has(q.i)) firstTry.set(q.i, ok);
      queue.shift();
      if (!ok) queue.push(q); // vuelve a aparecer al final
      input.disabled = true;
      clear(fb);
      fb.appendChild(
        feedback({
          ok,
          title: ok ? '¡Correcto!' : gaveUp ? 'La respuesta era:' : 'No es esa. La respuesta era:',
          lines: [!ok || q.answers.length > 1 ? q.answers.join(' / ') : '', q.note],
        }),
      );
      checkBtn.textContent = 'Siguiente';
      giveUp.hidden = true;
      checkBtn.focus({ preventScroll: true });
    }

    const form = h(
      'form',
      {
        class: 'quiz',
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          if (answered) return show();
          if (!input.value.trim()) return input.focus();
          grade(matchesAnswer(input.value, q.answers));
        },
      },
      h('p', { class: 'quiz__prompt' }, q.prompt),
      input,
      h('div', { class: 'row' }, checkBtn, giveUp),
      fb,
    );
    layer.body.appendChild(form);
    requestAnimationFrame(() => input.focus({ preventScroll: true }));
  }

  function finish() {
    const right = [...firstTry.values()].filter(Boolean).length;
    const missed = quiz.questions.filter((_, i) => firstTry.get(i) === false);
    layer.setProgress(1);
    layer.setStatus(`${right} de ${total} a la primera`);
    layer.body.appendChild(
      resultPanel({
        title: right === total ? '¡Todas bien!' : 'Terminaste',
        tone: right >= total * 0.7 ? 'good' : 'retry',
        text: `${right} de ${total} correctas a la primera.`,
        actions: [
          h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (layer.close(), runQuiz(ctx, id)) }, 'Repetir'),
          h('button', { class: 'btn btn--primary', type: 'button', onClick: () => layer.close() }, 'Listo'),
        ],
      }),
    );
    if (missed.length) {
      layer.body.appendChild(
        h('div', { class: 'missed' }, h('p', { class: 'eyebrow' }, 'Para repasar'), h('ul', {}, missed.map((q) => h('li', {}, h('span', {}, q.prompt), h('strong', { lang: 'ja' }, q.answers[0]))))),
      );
    }
  }

  show();
}
