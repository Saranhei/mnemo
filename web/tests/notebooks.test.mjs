// Pruebas de los cuadernos: tinta, goma y archivo para compartir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPoint, penOutline, centerline, touches, itemBox, sanitizeStrokes, MAX_POINTS } from '../public/js/core/ink.js';
import { sanitizeNotebookFile, notebookFileName, NotebookFileError } from '../public/js/core/notebookFile.js';
import { parseImport } from '../public/js/core/transfer.js';
import { newNotebook, newPage, emptyState, mergeStates, PAPERS } from '../public/js/core/model.js';

const stroke = (pts, t = 'pen') => {
  const s = { t, c: '#000000', w: 4, p: [] };
  for (const [x, y, pr = 0.5] of pts) addPoint(s, x, y, pr);
  return s;
};

test('Tinta: descarta puntos repetidos y respeta el máximo', () => {
  const s = stroke([[10, 10], [10.1, 10], [20, 10]]);
  assert.equal(s.p.length, 6);
  const big = { t: 'pen', c: '#000000', w: 3, p: [] };
  for (let i = 0; i < MAX_POINTS + 50; i++) addPoint(big, i, 0, 0.5);
  assert.equal(big.p.length, MAX_POINTS * 3);
});

test('Lapicera: contorno cerrado, más ancho con más presión', () => {
  assert.match(penOutline(stroke([[5, 5]])), /^M.*Z$/);
  const width = (pr) => {
    const d = penOutline(stroke([[0, 50, pr], [50, 50, pr], [100, 50, pr]]));
    const ys = [...d.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((m) => Number(m[2]));
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(width(1) > width(0.1) * 1.5, `${width(1)} > ${width(0.1)}`);
  assert.equal(centerline(stroke([[0, 0], [10, 0]], 'hl')), 'M0,0L10,0');
});

test('Goma: toca trazos, cintas y stickers; nunca imágenes', () => {
  const s = stroke([[0, 0], [100, 0]]);
  assert.ok(touches(s, 50, 5, 4));
  assert.ok(!touches(s, 50, 30, 4));
  const tape = { t: 'tape', k: 'plain', c: '#ff0000', w: 40, p: [0, 100, 0, 200, 100, 0] };
  assert.ok(touches(tape, 100, 115, 2));
  const st = { t: 'st', k: 'star', x: 300, y: 300, s: 100, r: 0 };
  assert.deepEqual(itemBox(st), { x: 250, y: 250, w: 100, h: 100 });
  assert.ok(touches(st, 340, 340, 1));
  assert.ok(!touches({ t: 'img', m: 'a', x: 0, y: 0, w: 500, h: 500 }, 10, 10, 50));
});

test('Limpieza de trazos importados', () => {
  const out = sanitizeStrokes([
    { t: 'pen', c: 'red; background:url(x)', w: 999, p: [1, 2, 0.5, 'x', 4, 1, 7] },
    { t: 'hl', c: '#ffee00', w: 20, p: [0, 0, 1] },
    { t: 'st', k: '<script>', x: 1, y: 1, s: 1 },
    { t: 'st', k: 'heart', x: 1e9, y: 10, s: 1 },
    { t: 'img', m: 'desconocida', x: 0, y: 0, w: 10, h: 10 },
    { t: 'img', m: 'ok', x: 0, y: 0, w: 10, h: 10 },
    { t: 'tape', k: 'stripes', c: '#123456', w: 40, p: [0, 0, 0, 10, 10, 0] },
    null,
  ], 100, (id) => (id === 'ok' ? 'nuevo' : null));
  assert.deepEqual(out.map((s) => s.t), ['pen', 'hl', 'st', 'img', 'tape']);
  assert.equal(out[0].c, '#1b1a24');
  assert.equal(out[0].w, 60);
  assert.equal(out[0].p.length, 6);
  assert.equal(out[2].x, 1500);
  assert.equal(out[2].s, 20);
  assert.equal(out[3].m, 'nuevo');
});

test('Cuaderno nuevo: hojas y PDF', () => {
  const nb = newNotebook({ name: 'Clase', paper: 'genko', pages: 2 }, 1);
  assert.equal(nb.paper, 'genko');
  assert.equal(nb.pages.length, 2);
  assert.equal(newNotebook({ name: 'x', paper: 'raro' }, 1).paper, 'lined-m');
  const pdf = newNotebook({ name: 'Libro', pdf: { mediaId: 'm', name: 'libro.pdf', pageCount: 3, ratio: 1.3 } }, 1);
  assert.deepEqual(pdf.pages.map((p) => p.pdfPage), [1, 2, 3]);
  assert.equal(pdf.pages[0].ratio, 1.3);
  assert.equal(newPage({ paper: 'cornell' }).paper, 'cornell');
  assert.equal(newPage({ paper: 'nada' }).paper, undefined);
  assert.ok(PAPERS.includes('margin') && PAPERS.includes('dots-s') && PAPERS.includes('grid-l'));
});

test('Los cuadernos se sincronizan como el resto', () => {
  const a = { ...emptyState(), notebooks: [newNotebook({ name: 'A' }, 1)] };
  const b = { ...emptyState(), notebooks: [{ ...a.notebooks[0], name: 'A2', updatedAt: 5 }] };
  assert.equal(mergeStates(a, b).state.notebooks[0].name, 'A2');
});

const file = (over = {}) => ({
  app: 'mnemo', type: 'notebook', version: 1,
  notebook: { name: 'Notas <b>', paper: 'grid-s', paperColor: '#ffffff', color: '#7b4dd8', pages: [{ pdfPage: null, ratio: 1.414, ink: [{ t: 'img', m: 'i1', x: 0, y: 0, w: 10, h: 10 }] }] },
  pdf: null,
  images: { i1: { type: 'image/png', data: 'iVBORw0KGgo=' }, mal: { type: 'text/html', data: 'PGI+' } },
  ...over,
});

test('Archivo de cuaderno: se valida todo', () => {
  const r = sanitizeNotebookFile(file());
  assert.equal(r.notebook.name, 'Notas <b>'); // se muestra siempre como texto, nunca como HTML
  assert.deepEqual(Object.keys(r.images), ['i1']);
  assert.equal(r.notebook.pages[0].ink.length, 1);
  assert.equal(r.needsPdf, false);
  assert.throws(() => sanitizeNotebookFile(file({ version: 9 })), NotebookFileError);
  assert.throws(() => sanitizeNotebookFile(file({ notebook: { pages: [] } })), NotebookFileError);
  const sinPdf = sanitizeNotebookFile(file({ notebook: { name: 'Libro', pdfName: 'libro.pdf', pages: [{ pdfPage: 1, ratio: 1.3, ink: [] }] } }));
  assert.equal(sinPdf.needsPdf, true);
  assert.equal(notebookFileName('Japonés: clase 1/2'), 'Japonés clase 12.mnemo-notebook.json');
});

test('Importar reconoce un cuaderno', () => {
  const text = JSON.stringify(file());
  const r = parseImport(text, 'x.mnemo-notebook.json', text.length);
  assert.equal(r.kind, 'notebook');
  assert.equal(r.notebook.paper, 'grid-s');
});
