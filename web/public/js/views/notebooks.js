// Cuadernos: notas a mano con Apple Pencil (o con el dedo), sobre hojas lisas,
// rayadas, cuadriculadas, de puntos, genkō yōshi o Cornell, o sobre un PDF importado.
// Herramientas: lapicera con presión, resaltador, goma, cintas, stickers e imágenes.
//
// Dónde se guarda cada cosa (todo en el dispositivo):
//  - metadatos y lista de páginas → estado de la app (store.notebooks)
//  - trazos y elementos de cada página → IndexedDB, almacén "ink" (clave: id de página)
//  - PDF e imágenes → IndexedDB, almacén "media"

import { h, icon, clear, plural } from '../ui/dom.js';
import { screenHeader, emptyState, field, toggle } from '../ui/components.js';
import { openSheet, confirmAction, toast } from '../ui/overlays.js';
import { openLayer } from '../ui/layer.js';
import * as store from '../data/store.js';
import { readPref, writePref, getInk, putInk, putMedia, getMedia, deleteMedia, deleteInk } from '../data/storage.js';
import { live, newId, PAPERS, PAPER_COLORS, NOTEBOOK_COLORS } from '../core/model.js';
import { clean, MAX_NAME } from '../core/sanitize.js';
import { PAGE_W, TOOLS, addPoint, penOutline, centerline, touches, itemBox } from '../core/ink.js';
import { NOTEBOOK_LIMITS, notebookFileName } from '../core/notebookFile.js';
import { pickFile, deliverFile } from '../services/device.js';
import { openPdf, pdfInfo, renderPdfPage } from '../services/pdf.js';
import { svg, drawPaper, PAPER_LABEL, TAPES, tapeShape, tapeImageDefs, tapePreview, STICKERS, stickerShape, stickerPreview, paperPreview } from '../ui/paper.js';
import { pickColor, recentColors } from '../ui/colorWheel.js';

const INK_COLORS = ['#1b1a24', '#3457d5', '#d0302f', '#1f8a5b', '#7b4dd8', '#ff9f1c'];
const HL_COLORS = ['#ffe14d', '#7df0b4', '#7cd4ff', '#ff9ec2', '#ffb35c', '#c7a6ff'];
const TAPE_COLORS = ['#ff9ec2', '#7cd4ff', '#ffd23f', '#7df0b4', '#c7a6ff', '#ff9f1c'];

// ───────────────────────────── Lista de cuadernos ─────────────────────────────

export function notebooksView(ctx) {
  const items = live(store.getState().notebooks ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
  return h(
    'div',
    { class: 'screen screen--wide' },
    screenHeader({
      title: 'Cuadernos',
      subtitle: 'Tomá notas a mano con el Apple Pencil o escribí sobre tus PDF.',
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => importPdfFlow(ctx) }, icon('import', { size: 18 }), 'Importar PDF'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => newNotebookSheet(ctx) }, icon('plus', { size: 18 }), 'Nuevo cuaderno'),
      ],
    }),
    items.length === 0
      ? emptyState({
          title: 'Todavía no hay cuadernos',
          text: 'Creá uno con la hoja que prefieras (rayada, cuadriculada, genkō yōshi…) o importá un PDF para escribir encima.',
        })
      : h(
          'ul',
          { class: 'nb-grid' },
          items.map((nb) =>
            h(
              'li',
              { class: 'nb-tile' },
              h(
                'button',
                { class: 'nb-cover', type: 'button', style: { '--nb': nb.color }, onClick: () => openNotebook(ctx, nb.id), 'aria-label': `Abrir ${nb.name}` },
                h('span', { class: 'nb-cover__paper' }, nb.bg && !nb.pdfMediaId ? mediaImg(nb.bg) : paperPreview(nb.pdfMediaId ? 'blank' : nb.paper, nb.paperColor)),
                nb.pdfMediaId ? h('span', { class: 'nb-cover__badge' }, 'PDF') : null,
              ),
              h(
                'div',
                { class: 'nb-tile__row' },
                h('div', { class: 'nb-tile__text' }, h('p', { class: 'nb-tile__name' }, nb.name), h('p', { class: 'nb-tile__meta' }, plural(nb.pages.length, 'página', 'páginas'))),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Opciones de ${nb.name}`, onClick: () => notebookMenu(ctx, nb.id) }, icon('more')),
              ),
            ),
          ),
        ),
  );
}

/** Miniatura de una imagen guardada en el dispositivo. */
function mediaImg(id, cls = 'nb-thumb') {
  const img = h('img', { class: cls, alt: '', draggable: 'false' });
  libUrl(id).then((url) => url && (img.src = url));
  return img;
}

/**
 * Elección de plantilla. Valores: un tipo de hoja ('lined-m'…), 'u:<id>' (imagen de
 * "Mis plantillas") o 'm:<id>' (la imagen que ya usa este cuaderno, en `current`).
 * Incluye "Desde imagen" para sumar una foto o PDF exportado como imagen.
 */
function paperPicker(name, value, bg, onPick, { current = null } = {}) {
  const host = h('div', { class: 'paper-picker', role: 'radiogroup', 'aria-label': 'Plantilla de la hoja' });
  const opt_ = (val, preview, label, extra = null) =>
    h('label', { class: 'paper-opt', for: `${name}-${val}` },
      h('input', { type: 'radio', name, id: `${name}-${val}`, value: val, checked: val === value, onChange: () => ((value = val), onPick(val)) }),
      preview, h('span', {}, label), extra);
  const draw = () => {
    const own = libList('paper');
    host.replaceChildren(
      ...(current ? [opt_(current, mediaImg(current.slice(2), 'paper-opt__img'), 'Como esta')] : []),
      ...PAPERS.map((p) => opt_(p, paperPreview(p, bg), PAPER_LABEL[p])),
      ...own.map((x) => opt_(`u:${x.id}`, mediaImg(x.id, 'paper-opt__img'), 'Mi plantilla',
        h('button', { class: 'nb-own__x', type: 'button', 'aria-label': 'Quitar de mis plantillas', onClick: async (e) => {
          e.preventDefault();
          if (!(await removeFromLibrary('paper', x.id))) return;
          if (value === `u:${x.id}`) {
            value = PAPERS[0];
            onPick(value);
          }
          draw();
        } }, '×'))),
      h('button', { class: 'paper-opt paper-opt--add', type: 'button', onClick: async () => {
        const id = await addToLibrary('paper');
        if (!id) return;
        value = `u:${id}`;
        onPick(value);
        draw();
      } }, h('span', { class: 'paper-opt__plus' }, icon('image', { size: 26 })), h('span', {}, 'Desde imagen')),
    );
  };
  draw();
  return host;
}

/** Proporción (alto/ancho) de una plantilla con imagen; null si es una hoja común. */
async function templateRatio(tpl) {
  if (tpl.startsWith('u:')) {
    const x = libList('paper').find((y) => y.id === tpl.slice(2));
    return x ? 1 / x.a : null;
  }
  return null;
}

function swatches(name, colors, value, onPick, label) {
  return h(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': label },
    colors.map((c, i) =>
      h(
        'label',
        { class: 'swatch', for: `${name}-${i}`, style: { '--sw': c } },
        h('input', { type: 'radio', name, id: `${name}-${i}`, value: c, checked: c === value, onChange: () => onPick(c), 'aria-label': c }),
      ),
    ),
  );
}

function newNotebookSheet(ctx) {
  openSheet({
    title: 'Nuevo cuaderno',
    wide: true,
    build: (close) => {
      let paper = readPref('nb.paper', 'lined-m');
      if (paper.startsWith('u:') && !libList('paper').some((x) => `u:${x.id}` === paper)) paper = 'lined-m';
      let paperColor = PAPER_COLORS[0];
      let color = NOTEBOOK_COLORS[0];
      const name = h('input', { class: 'input', id: 'nb-name', maxlength: MAX_NAME, placeholder: 'Por ejemplo: Japonés · Clase de los martes', autofocus: true });
      const pickerHost = h('div', {});
      const drawPicker = () => pickerHost.replaceChildren(paperPicker('nb-paper', paper, paperColor, (p) => (paper = p)));
      drawPicker();
      return h(
        'form',
        {
          class: 'stack',
          onSubmit: async (e) => {
            e.preventDefault();
            writePref('nb.paper', paper);
            let fields = { paper };
            if (paper.startsWith('u:')) {
              const bg = await copyMedia(paper.slice(2));
              fields = bg ? { paper: 'blank', bg, bgRatio: await templateRatio(paper) } : { paper: 'lined-m' };
            }
            const nb = store.createNotebook({ name: clean(name.value, MAX_NAME) || 'Cuaderno', paperColor, color, ...fields });
            close();
            openNotebook(ctx, nb.id);
          },
        },
        field({ id: 'nb-name', label: 'Nombre', control: name }),
        h('p', { class: 'field__label' }, 'Plantilla'),
        pickerHost,
        h('div', { class: 'row row--wrap' },
          h('div', { class: 'stack stack--tight' }, h('p', { class: 'field__label' }, 'Color del papel'), swatches('nb-pc', PAPER_COLORS, paperColor, (c) => ((paperColor = c), drawPicker()), 'Color del papel')),
          h('div', { class: 'stack stack--tight' }, h('p', { class: 'field__label' }, 'Color de tapa'), swatches('nb-cc', NOTEBOOK_COLORS, color, (c) => (color = c), 'Color de tapa')),
        ),
        h('button', { class: 'btn btn--primary', type: 'submit' }, icon('check', { size: 18 }), 'Crear cuaderno'),
      );
    },
  });
}

async function importPdfFlow(ctx) {
  const file = await pickFile('.pdf,application/pdf', { asText: false });
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') return toast('Elegí un archivo PDF.', { tone: 'error' });
  if (file.size > NOTEBOOK_LIMITS.pdfBytes) return toast('El PDF es demasiado grande (máximo 200 MB).', { tone: 'error' });
  if (file.size > 60 * 1024 * 1024) toast('Es un PDF grande: puede tardar un poco y andar más lento en el iPhone.', { ms: 5000 });
  toast('Abriendo el PDF…');
  try {
    const doc = await openPdf(file.file);
    const info = await pdfInfo(doc);
    doc.destroy();
    const mediaId = newId();
    await putMedia(mediaId, new Blob([file.file], { type: 'application/pdf' }));
    const nb = store.createNotebook({
      name: clean(file.name.replace(/\.pdf$/i, ''), MAX_NAME) || 'PDF',
      paper: 'blank',
      pdf: { mediaId, name: file.name, pageCount: info.pageCount, ratio: info.ratio },
    });
    toast(`Importado: ${plural(info.pageCount, 'página', 'páginas')}.`, { tone: 'ok' });
    openNotebook(ctx, nb.id);
  } catch (err) {
    console.error(err);
    toast(err?.name === 'PasswordException' ? 'El PDF tiene contraseña: no se puede abrir.' : 'No se pudo abrir el PDF (puede estar dañado o sin lugar en el dispositivo).', { tone: 'error', ms: 6000 });
  }
}

function notebookMenu(ctx, id) {
  const nb = store.getNotebook(id);
  if (!nb) return;
  openSheet({
    title: nb.name,
    build: (close) => {
      const name = h('input', { class: 'input', id: 'nb-rename', maxlength: MAX_NAME, value: nb.name });
      return h(
        'div',
        { class: 'stack' },
        h('form', { class: 'row row--nowrap', onSubmit: (e) => (e.preventDefault(), store.updateNotebook(id, { name: clean(name.value, MAX_NAME) || nb.name }), close()) },
          name, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Renombrar')),
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), exportNotebook(ctx, id)) }, icon('share', { size: 18 }), 'Exportar para otro dispositivo'),
        h('button', {
          class: 'btn btn--ghost btn--danger-text',
          type: 'button',
          onClick: async () => {
            const ok = await confirmAction({ title: '¿Borrar el cuaderno?', message: `Se borra "${nb.name}" con todas sus páginas, notas e imágenes de este dispositivo. No se puede deshacer.`, confirmLabel: 'Borrar cuaderno' });
            if (!ok) return;
            close();
            await store.deleteNotebook(id);
            toast('Cuaderno borrado.');
          },
        }, icon('trash', { size: 18 }), 'Borrar cuaderno'),
      );
    },
  });
}

// ───────────────────────── Exportar / importar un cuaderno ─────────────────────────

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

async function exportNotebook(ctx, id) {
  const nb = store.getNotebook(id);
  if (!nb) return;
  toast('Preparando el archivo…');
  const images = {};
  const addImage = async (id) => {
    if (images[id]) return;
    const blob = await getMedia(id);
    if (blob) images[id] = { type: blob.type || 'image/jpeg', data: await toBase64(blob) };
  };
  const pages = [];
  for (const p of nb.pages) {
    const ink = await getInk(p.id);
    for (const item of ink) {
      if (item.m && !images[item.m]) {
        const blob = await getMedia(item.m);
        if (blob) images[item.m] = { type: blob.type || 'image/jpeg', data: await toBase64(blob) };
      }
    }
    if (p.bg) await addImage(p.bg);
    pages.push({ pdfPage: p.pdfPage, ratio: p.ratio, paper: p.paper, bg: p.bg, ink });
  }
  if (nb.bg) await addImage(nb.bg);
  let pdf = null;
  if (nb.pdfMediaId) {
    const blob = await getMedia(nb.pdfMediaId);
    if (blob && blob.size <= NOTEBOOK_LIMITS.embedPdfBytes) pdf = { name: nb.pdfName, data: await toBase64(blob) };
    else if (blob) toast('El PDF es muy grande para incluirlo: en el otro dispositivo te va a pedir que elijas el mismo PDF.', { ms: 7000 });
  }
  const file = { app: 'mnemo', type: 'notebook', version: 1, notebook: { name: nb.name, paper: nb.paper, paperColor: nb.paperColor, color: nb.color, pdfName: nb.pdfName, bg: nb.bg ?? null, pages }, pdf, images };
  const result = await deliverFile(notebookFileName(nb.name), JSON.stringify(file), { preview: ctx.preview });
  if (result === 'shared' || result === 'downloaded') toast('Cuaderno exportado. Abrilo en el otro dispositivo con Ajustes → Importar.', { tone: 'ok', ms: 5000 });
}

const fromBase64 = (data, type) => {
  const bin = atob(data.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
};

/** Guarda un cuaderno importado (ya validado por core/notebookFile.js). @returns id o null */
export async function saveImportedNotebook({ notebook, pdf, needsPdf, images }) {
  let pdfMedia = null;
  if (pdf) pdfMedia = { blob: fromBase64(pdf.data, 'application/pdf'), name: pdf.name };
  else if (needsPdf) {
    const ok = await confirmAction({ title: 'Falta el PDF', message: `Este cuaderno escribe sobre "${notebook.pdfName || 'un PDF'}", que no viene en el archivo. Elegí ese mismo PDF para continuar.`, confirmLabel: 'Elegir PDF', danger: false });
    if (!ok) return null;
    const file = await pickFile('.pdf,application/pdf', { asText: false });
    if (!file) return null;
    pdfMedia = { blob: file.file, name: file.name };
  }
  const mediaMap = {};
  for (const [oldId, img] of Object.entries(images)) {
    const mid = newId();
    await putMedia(mid, fromBase64(img.data, img.type));
    mediaMap[oldId] = mid;
  }
  let pdfMediaId = null;
  if (pdfMedia) {
    pdfMediaId = newId();
    await putMedia(pdfMediaId, pdfMedia.blob);
  }
  const nb = store.createNotebook({ name: notebook.name, paper: notebook.paper, paperColor: notebook.paperColor, color: notebook.color });
  const pages = [];
  for (const p of notebook.pages) {
    const page = { id: newId(), pdfPage: pdfMediaId ? p.pdfPage : null, ratio: p.ratio, ...(p.paper ? { paper: p.paper } : {}), ...(p.bg && mediaMap[p.bg] ? { bg: mediaMap[p.bg] } : {}) };
    const ink = p.ink.map((item) => (item.m ? { ...item, m: mediaMap[item.m] } : item)).filter((i) => !('m' in i) || i.m);
    if (ink.length) await putInk(page.id, ink);
    pages.push(page);
  }
  store.updateNotebook(nb.id, { pages, pdfMediaId, pdfName: pdfMedia?.name ?? '', ...(notebook.bg && mediaMap[notebook.bg] ? { bg: mediaMap[notebook.bg] } : {}) });
  return nb.id;
}

// ─────────────────── Stickers y cintas propios (biblioteca) ───────────────────
// Las imágenes que el usuario agrega como sticker o diseño de cinta quedan en este
// dispositivo (almacén "media"); la lista, en las preferencias. Al usarlas en una
// página se guarda una copia aparte, así borrar de la biblioteca no rompe notas.

const LIB = { sticker: 'nb.myStickers', tape: 'nb.myTapes', paper: 'nb.myPapers' };
const libList = (kind) => {
  const list = readPref(LIB[kind], []);
  return Array.isArray(list) ? list.filter((x) => typeof x?.id === 'string' && Number.isFinite(x.a)) : [];
};

async function addToLibrary(kind) {
  const file = await pickFile('image/*', { asText: false, maxBytes: 30 * 1024 * 1024 });
  if (!file) return null;
  if (!/^image\//.test(file.type)) {
    toast('Elegí una imagen (PNG con fondo transparente queda mejor).', { tone: 'error' });
    return null;
  }
  try {
    // Las plantillas de hoja necesitan más resolución; los stickers, fondo transparente.
    const { blob, width, height } = kind === 'paper' ? await shrinkImage(file.file, 2200) : await shrinkImage(file.file, 600, true);
    const id = newId();
    await putMedia(id, blob);
    writePref(LIB[kind], [...libList(kind), { id, a: Math.round((width / height) * 1000) / 1000 }]);
    toast({ sticker: 'Sticker agregado.', tape: 'Diseño de cinta agregado.', paper: 'Plantilla agregada.' }[kind], { tone: 'ok' });
    return id;
  } catch (err) {
    console.error(err);
    toast('No se pudo usar esa imagen.', { tone: 'error' });
    return null;
  }
}

async function removeFromLibrary(kind, id) {
  const ok = await confirmAction({ title: { sticker: '¿Quitar este sticker?', tape: '¿Quitar este diseño de cinta?', paper: '¿Quitar esta plantilla?' }[kind], message: 'Se quita de tu colección. Lo que ya usaste en los cuadernos queda.', confirmLabel: 'Quitar' });
  if (!ok) return false;
  writePref(LIB[kind], libList(kind).filter((x) => x.id !== id));
  await deleteMedia(id);
  return true;
}

const libUrls = new Map();
async function libUrl(id) {
  if (libUrls.has(id)) return libUrls.get(id);
  const blob = await getMedia(id);
  const url = blob ? URL.createObjectURL(blob) : '';
  libUrls.set(id, url);
  return url;
}

/** Copia una imagen de la biblioteca para usarla en una página. */
async function copyMedia(id) {
  const blob = await getMedia(id);
  if (!blob) return null;
  const mid = newId();
  await putMedia(mid, blob);
  return mid;
}

// ───────────────────────────── Editor ─────────────────────────────

const prefs = () => ({
  tool: readPref('nb.tool', 'pen'),
  penColor: readPref('nb.penColor', INK_COLORS[0]),
  hlColor: readPref('nb.hlColor', HL_COLORS[0]),
  tapeColor: readPref('nb.tapeColor', TAPE_COLORS[0]),
  tape: readPref('nb.tape', 'stripes'),
  tapeW: readPref('nb.tapeW', 1),
  sticker: readPref('nb.sticker', 'star'),
  penW: readPref('nb.penW', 1),
  hlW: readPref('nb.hlW', 1),
  finger: readPref('nb.finger', false),
  zoom: readPref('nb.zoom', 1),
});

/** Abre un cuaderno a pantalla completa. */
export function openNotebook(ctx, id) {
  const nb = store.getNotebook(id);
  if (!nb) return;
  const opt = prefs();
  let pdfDoc = null;
  let pdfLoading = null;
  let penSeen = false;
  let checkEnd = () => {};
  // "Tirar" hacia arriba estando al final: agrega una hoja aunque la última esté vacía.
  let pull = 0;
  const atBottom = () => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  const PULL_TO_ADD = 110;
  function pullBy(amount) {
    pull = Math.max(0, pull + amount);
    pagesHost.style.transition = 'none';
    pagesHost.style.transform = pull ? `translateY(${-Math.min(pull, 160) * 0.45}px)` : '';
    if (pull >= PULL_TO_ADD) {
      releasePull();
      checkEnd({ force: true });
    }
  }
  function releasePull() {
    if (!pull) return;
    pull = 0;
    pagesHost.style.transition = 'transform 0.25s ease';
    pagesHost.style.transform = '';
  }
  // Entrada: Pencil/lápiz escribe; dedos desplazan, pellizcan para zoom y tocan con
  // dos dedos para deshacer (tres para rehacer), como en GoodNotes y Procreate.
  const input = { touches: new Map(), penDown: 0, cancelActive: null };
  const pages = new Map(); // id de página → controlador
  const history = []; // { pageId, before, after }
  const future = [];
  let selected = null; // { page, index }
  let observer = null;
  let currentPageId = nb.pages[0]?.id;

  const layer = openLayer({
    title: nb.name,
    onKey: (e) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selected) deleteSelected();
    },
    onClose: () => {
      document.removeEventListener('keydown', shortcuts);
      removeEventListener('resize', fitBase);
      observer?.disconnect();
      for (const p of pages.values()) p.flush();
      pdfDoc?.destroy();
    },
  });
  layer.body.classList.add('nb-layer');
  // ⌘Z / ⌘⇧Z (teclado del iPad o de la Mac).
  function shortcuts(e) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target?.closest?.('input, textarea')) return;
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  }
  document.addEventListener('keydown', shortcuts);

  const getPdf = () => {
    if (!nb.pdfMediaId) return Promise.resolve(null);
    pdfLoading ??= getMedia(nb.pdfMediaId).then((blob) => (blob ? openPdf(blob) : null)).then((doc) => (pdfDoc = doc)).catch((err) => {
      console.error(err);
      toast('No se pudo abrir el PDF de este cuaderno.', { tone: 'error' });
      return null;
    });
    return pdfLoading;
  };

  // ─── Barra de herramientas ───
  const toolBtn = (id, iconName, label) =>
    h('button', { class: `nb-tool${opt.tool === id ? ' is-on' : ''}`, type: 'button', dataset: { tool: id }, 'aria-pressed': String(opt.tool === id), title: label, 'aria-label': label, onClick: () => setTool(id) }, icon(iconName, { size: 22 }));
  const tools = h('div', { class: 'nb-tools', role: 'toolbar', 'aria-label': 'Herramientas' },
    toolBtn('pen', 'pen', 'Lapicera'),
    toolBtn('hl', 'highlighter', 'Resaltador'),
    toolBtn('eraser', 'eraser', 'Goma'),
    toolBtn('tape', 'tape', 'Cinta'),
    toolBtn('sticker', 'sticker', 'Stickers'),
    toolBtn('select', 'hand', 'Mover y cambiar tamaño'),
    h('button', { class: 'nb-tool', type: 'button', title: 'Agregar imagen', 'aria-label': 'Agregar imagen', onClick: addImage }, icon('image', { size: 22 })),
  );
  const options = h('div', { class: 'nb-options' });
  const undoBtn = h('button', { class: 'nb-tool', type: 'button', title: 'Deshacer', 'aria-label': 'Deshacer', onClick: () => undo() }, icon('undo', { size: 20 }));
  const redoBtn = h('button', { class: 'nb-tool nb-tool--flip', type: 'button', title: 'Rehacer', 'aria-label': 'Rehacer', onClick: () => redo() }, icon('undo', { size: 20 }));
  const zoomLabel = h('span', { class: 'nb-zoom__label' });
  const bar = h('div', { class: 'nb-bar' },
    tools,
    options,
    h('div', { class: 'nb-bar__end' },
      undoBtn, redoBtn,
      h('div', { class: 'nb-zoom' },
        h('button', { class: 'nb-tool', type: 'button', 'aria-label': 'Alejar', onClick: () => setZoom(opt.zoom - 0.25) }, icon('minus', { size: 18 })),
        zoomLabel,
        h('button', { class: 'nb-tool', type: 'button', 'aria-label': 'Acercar', onClick: () => setZoom(opt.zoom + 0.25) }, icon('plus', { size: 18 })),
      ),
      h('button', { class: 'nb-tool', type: 'button', title: 'Páginas', 'aria-label': 'Páginas', onClick: pageMenu }, icon('more', { size: 22 })),
    ),
  );
  // Cambio rápido entre las dos últimas herramientas (por ejemplo, lapicera ↔ goma).
  // Safari no le avisa a las páginas web el doble toque del Apple Pencil, así que
  // este botón, a mano del pulgar, cumple esa función.
  const TOOL_INFO = { pen: ['pen', 'Lapicera'], hl: ['highlighter', 'Resaltador'], eraser: ['eraser', 'Goma'], tape: ['tape', 'Cinta'], sticker: ['sticker', 'Stickers'], select: ['hand', 'Mover'] };
  opt.prevTool = readPref('nb.prevTool', opt.tool === 'eraser' ? 'pen' : 'eraser');
  const swap = h('button', { class: 'nb-swap', type: 'button', onClick: () => setTool(TOOL_INFO[opt.prevTool] ? opt.prevTool : 'pen') });
  function updateSwap() {
    const [ic, label] = TOOL_INFO[opt.prevTool] ?? TOOL_INFO.pen;
    swap.replaceChildren(icon(ic, { size: 24 }));
    swap.setAttribute('aria-label', `Cambiar a ${label}`);
    swap.title = `Cambiar a ${label}`;
  }
  updateSwap();
  const scroller = h('div', { class: 'nb-scroller' });
  const pagesHost = h('div', { class: 'nb-pages' });
  // Al llegar al final se agrega una hoja nueva (con la plantilla de la última), si
  // la última ya tiene algo (notas o una página del PDF): así no se apilan hojas vacías.
  const endZone = h('div', { class: 'nb-end', 'aria-hidden': 'true' });
  scroller.append(pagesHost, endZone);
  layer.body.append(bar, scroller, swap);

  setupGestures();

  function savePref(k, v) {
    opt[k] = v;
    writePref(`nb.${k}`, v);
  }

  function setTool(t) {
    if (t !== opt.tool) savePref('prevTool', opt.tool);
    savePref('tool', t);
    updateSwap();
    for (const b of tools.querySelectorAll('[data-tool]')) {
      b.classList.toggle('is-on', b.dataset.tool === t);
      b.setAttribute('aria-pressed', String(b.dataset.tool === t));
    }
    clearSelection();
    drawOptions();
    applyTouchMode();
  }

  function colorRow(colors, key) {
    const row = h('div', { class: 'nb-colors', role: 'radiogroup', 'aria-label': 'Color' });
    const draw = () => {
      // Los propios: el actual (si no es de la paleta) y los últimos de la rueda.
      const extra = [opt[key], ...recentColors()].filter((c, i, all) => !colors.includes(c) && all.indexOf(c) === i).slice(0, 3);
      row.replaceChildren(
        ...[...colors, ...extra].map((c) => h('button', { class: `nb-color${c === opt[key] ? ' is-on' : ''}`, type: 'button', dataset: { c }, style: { '--sw': c }, 'aria-label': `Color ${c}`, onClick: () => (savePref(key, c), draw()) })),
        h('button', { class: 'nb-color-wheel', type: 'button', 'aria-label': 'Rueda de colores', title: 'Rueda de colores', onClick: async () => {
          const c = await pickColor(opt[key]);
          if (c) {
            savePref(key, c);
            draw();
          }
        } }),
      );
    };
    draw();
    return row;
  }

  function widthRow(key, tool) {
    const row = h('div', { class: 'nb-widths', role: 'radiogroup', 'aria-label': 'Grosor' });
    TOOLS[tool].widths.forEach((w, i) => {
      row.appendChild(h('button', { class: `nb-width${opt[key] === i ? ' is-on' : ''}`, type: 'button', 'aria-label': ['Fino', 'Medio', 'Grueso'][i], onClick: (e) => {
        savePref(key, i);
        for (const b of row.children) b.classList.toggle('is-on', b === e.currentTarget);
      } }, h('span', { style: { '--d': `${4 + i * 4}px` } })));
    });
    return row;
  }

  function drawOptions() {
    clear(options);
    if (opt.tool === 'pen') options.append(colorRow(INK_COLORS, 'penColor'), widthRow('penW', 'pen'));
    else if (opt.tool === 'hl') options.append(colorRow(HL_COLORS, 'hlColor'), widthRow('hlW', 'hl'));
    else if (opt.tool === 'tape') {
      const custom = opt.tape.startsWith('u:');
      options.append(custom ? h('span', {}) : colorRow(TAPE_COLORS, 'tapeColor'), widthRow('tapeW', 'tape'), libraryRow('tape'));
    } else if (opt.tool === 'sticker') {
      options.append(libraryRow('sticker'));
    }
    options.appendChild(toggle({ id: 'nb-finger', label: 'Escribir con el dedo', checked: opt.finger, onChange: (v) => (savePref('finger', v), applyTouchMode()) }));
  }

  function applyTouchMode() {
    if (opt.finger) penSeen = false;
  }

  /** Paleta de cintas o stickers: los de la app, los propios y "Agregar". */
  function libraryRow(kind) {
    const key = kind === 'tape' ? 'tape' : 'sticker';
    const row = h('div', { class: kind === 'tape' ? 'nb-tapes' : 'nb-stickers', role: 'radiogroup', 'aria-label': kind === 'tape' ? 'Diseño de cinta' : 'Stickers' });
    const choose = (id) => {
      savePref(key, id);
      if (kind === 'tape') drawOptions();
      else for (const b of row.querySelectorAll('[data-k]')) b.classList.toggle('is-on', b.dataset.k === id);
    };
    const cls = kind === 'tape' ? 'nb-tape' : 'nb-sticker';
    const builtIn = kind === 'tape'
      ? TAPES.map((t) => h('button', { class: `${cls}${opt.tape === t.id ? ' is-on' : ''}`, type: 'button', dataset: { k: t.id }, 'aria-label': `Cinta ${t.label}`, title: t.label, onClick: () => choose(t.id) }, tapePreview(t.id, opt.tapeColor)))
      : Object.entries(STICKERS).map(([k, st]) => h('button', { class: `${cls}${opt.sticker === k ? ' is-on' : ''}`, type: 'button', dataset: { k }, 'aria-label': st.label, title: st.label, onClick: () => choose(k) }, stickerPreview(k, 34)));
    const own = libList(kind).map((x) => {
      const k = `u:${x.id}`;
      const img = h('img', { alt: '', class: kind === 'tape' ? 'nb-tape__img' : 'nb-sticker__img', draggable: 'false' });
      libUrl(x.id).then((url) => url && (img.src = url));
      return h('span', { class: 'nb-own' },
        h('button', { class: `${cls}${opt[key] === k ? ' is-on' : ''}`, type: 'button', dataset: { k }, 'aria-label': kind === 'tape' ? 'Cinta propia' : 'Sticker propio', onClick: () => choose(k) }, img),
        h('button', { class: 'nb-own__x', type: 'button', 'aria-label': 'Quitar de mi colección', onClick: async () => {
          if (!(await removeFromLibrary(kind, x.id))) return;
          if (opt[key] === k) savePref(key, kind === 'tape' ? 'stripes' : 'star');
          drawOptions();
        } }, '×'),
      );
    });
    const add = h('button', { class: `${cls} nb-add`, type: 'button', title: kind === 'tape' ? 'Agregar un diseño de cinta (una imagen)' : 'Agregar un sticker (una imagen)', 'aria-label': kind === 'tape' ? 'Agregar diseño de cinta' : 'Agregar sticker', onClick: async () => {
      const id = await addToLibrary(kind);
      if (id) {
        savePref(key, `u:${id}`);
        drawOptions();
      }
    } }, icon('plus', { size: 18 }));
    row.append(...builtIn, ...own, add);
    return row;
  }

  const ZMIN = 0.5;
  const ZMAX = 4;
  let rerenderTimer = null;
  /** Cambia el zoom dejando el punto (fx, fy) de las páginas debajo de (cx, cy) en la pantalla. */
  function applyZoom(z, anchor) {
    const zoom = Math.max(ZMIN, Math.min(ZMAX, z));
    const r0 = pagesHost.getBoundingClientRect();
    const a = anchor ?? (() => {
      const sr = scroller.getBoundingClientRect();
      const cx = sr.left + sr.width / 2;
      const cy = sr.top + sr.height / 2;
      return { fx: (cx - r0.left) / r0.width, fy: (cy - r0.top) / r0.height, cx, cy };
    })();
    opt.zoom = zoom;
    pagesHost.style.setProperty('--zoom', String(zoom));
    zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
    const r1 = pagesHost.getBoundingClientRect();
    scroller.scrollLeft += r1.left + a.fx * r1.width - a.cx;
    scroller.scrollTop += r1.top + a.fy * r1.height - a.cy;
    // Los PDF se vuelven a dibujar con la nitidez nueva cuando el zoom se queda quieto.
    clearTimeout(rerenderTimer);
    rerenderTimer = setTimeout(() => {
      writePref('nb.zoom', opt.zoom);
      for (const p of pages.values()) p.resized();
    }, 250);
    return a;
  }
  function setZoom(z) {
    applyZoom(Math.round(z * 4) / 4);
  }
  function fitBase() {
    const w = scroller.clientWidth;
    if (w) pagesHost.style.setProperty('--base', `${Math.min(w - 28, 900)}px`);
  }

  // ─── Gestos ───
  function setupGestures() {
    const t = input.touches;
    let gesture = null; // { kind: 'pan' | 'pinch', ... }
    let tap = null; // { start, max, moved }
    let palm = false; // el Pencil apoyó mientras había dedos: se ignoran hasta levantarlos
    let inertia = 0;
    const stopInertia = () => cancelAnimationFrame(inertia);
    const pts = () => [...t.values()];
    const startGesture = () => {
      const p = pts();
      if (p.length >= 2) {
        const [a, b] = p;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const r = pagesHost.getBoundingClientRect();
        gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: opt.zoom, fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height };
      } else if (p.length === 1) gesture = { kind: 'pan', x: p[0].x, y: p[0].y, vx: 0, vy: 0, t: performance.now() };
      else gesture = null;
    };

    scroller.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') {
        input.penDown += 1;
        stopInertia();
        if (t.size) palm = true;
        gesture = null;
        return;
      }
      if (e.pointerType !== 'touch') return;
      stopInertia();
      t.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, claimed: Boolean(e.nbClaimed) });
      if (t.size === 1) tap = { start: performance.now(), max: 1, moved: 0 };
      else if (tap) tap.max = Math.max(tap.max, t.size);
      if (input.penDown || palm) return;
      if (t.size >= 2) {
        input.cancelActive?.();
        input.cancelActive = null;
        startGesture();
      } else if (!e.nbClaimed) startGesture();
    });

    scroller.addEventListener('pointermove', (e) => {
      const p = t.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (tap) tap.moved = Math.max(tap.moved, Math.hypot(p.x - p.x0, p.y - p.y0));
      if (!gesture || palm || input.penDown) return;
      if (gesture.kind === 'pan') {
        const now = performance.now();
        const dx = p.x - gesture.x;
        const dy = p.y - gesture.y;
        scroller.scrollLeft -= dx;
        scroller.scrollTop -= dy;
        if (dy < 0) {
          if (atBottom()) pullBy(-dy);
          checkEnd();
        } else if (pull) pullBy(-dy);
        const dt = Math.max(1, now - gesture.t);
        gesture.vx = gesture.vx * 0.6 + (dx / dt) * 0.4;
        gesture.vy = gesture.vy * 0.6 + (dy / dt) * 0.4;
        Object.assign(gesture, { x: p.x, y: p.y, t: now });
      } else if (gesture.kind === 'pinch' && t.size >= 2) {
        const [a, b] = pts();
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        applyZoom(gesture.z0 * (d / gesture.d0), { fx: gesture.fx, fy: gesture.fy, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 });
      }
    });

    const up = (e) => {
      if (e.pointerType === 'pen') {
        input.penDown = Math.max(0, input.penDown - 1);
        return;
      }
      if (!t.delete(e.pointerId)) return;
      if (t.size === 0) {
        releasePull();
        // Sin eventos táctiles (algunos navegadores de escritorio): toques con Pointer Events.
        if (!HAS_TOUCH && tap && !palm) handleTap(tap.max, performance.now() - tap.start, tap.moved, e.clientX, e.clientY);
        if (gesture?.kind === 'pan' && performance.now() - gesture.t < 60) glide(gesture.vx * 16, gesture.vy * 16);
        gesture = null;
        tap = null;
        palm = false;
      } else if (!palm && !input.penDown) startGesture(); // de pellizcar a desplazar con el dedo que queda
    };
    scroller.addEventListener('pointerup', up);
    scroller.addEventListener('pointercancel', up);

    // Toques rápidos: con dos dedos deshace, con tres rehace, con uno pega el sticker
    // elegido. En iPhone/iPad y Android se miden con los eventos táctiles, que el
    // sistema entrega completos aunque cancele los de puntero en gestos de varios dedos.
    const HAS_TOUCH = 'ontouchstart' in globalThis;
    let tt = null;
    const fingers = (list) => [...list].filter((x) => x.touchType !== 'stylus');
    scroller.addEventListener('touchstart', (e) => {
      const now = fingers(e.touches);
      if (now.length >= 2) e.preventDefault(); // que el sistema no lo tome como gesto propio
      if (!fingers(e.changedTouches).length || input.penDown) return;
      tt ??= { start: performance.now(), max: 0, moved: 0, pos: new Map() };
      tt.max = Math.max(tt.max, now.length);
      for (const x of fingers(e.changedTouches)) tt.pos.set(x.identifier, [x.clientX, x.clientY]);
    }, { passive: false });
    scroller.addEventListener('touchmove', (e) => {
      if (fingers(e.touches).length >= 2) e.preventDefault();
      if (!tt) return;
      for (const x of fingers(e.changedTouches)) {
        const p0 = tt.pos.get(x.identifier);
        if (p0) tt.moved = Math.max(tt.moved, Math.hypot(x.clientX - p0[0], x.clientY - p0[1]));
      }
    }, { passive: false });
    const touchEnd = (e) => {
      if (!tt || fingers(e.touches).length) return;
      const last = fingers(e.changedTouches)[0];
      const d = tt;
      tt = null;
      if (input.penDown || !last) return;
      handleTap(d.max, performance.now() - d.start, d.moved, last.clientX, last.clientY);
    };
    scroller.addEventListener('touchend', touchEnd);
    scroller.addEventListener('touchcancel', touchEnd);

    function handleTap(count, ms, moved, x, y) {
      if (ms > 450 || moved > 24) return;
      if (count === 2) undo();
      else if (count >= 3) redo();
      else if (count === 1 && opt.tool === 'sticker' && !(opt.finger && !penSeen)) {
        const el = document.elementFromPoint(x, y)?.closest('.nb-page');
        pages.get(el?.dataset.id)?.placeStickerAt(x, y);
      }
    }

    // Envión al soltar (como el desplazamiento del sistema).
    function glide(vx, vy) {
      const step = () => {
        if (Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3) return;
        scroller.scrollLeft -= vx;
        scroller.scrollTop -= vy;
        vx *= 0.94;
        vy *= 0.94;
        inertia = requestAnimationFrame(step);
      };
      inertia = requestAnimationFrame(step);
    }

    // Pellizco en el trackpad (Mac, iPad con teclado) y Ctrl + rueda.
    scroller.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = pagesHost.getBoundingClientRect();
      applyZoom(opt.zoom * Math.exp(-e.deltaY * 0.01), { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, cx: e.clientX, cy: e.clientY });
    }, { passive: false });
    // Safari: que el pellizco no agrande toda la app.
    for (const ev of ['gesturestart', 'gesturechange']) scroller.addEventListener(ev, (e) => e.preventDefault());
    // Sin menú de "copiar/lupa" al mantener apretado.
    scroller.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('resize', fitBase);
  }

  // ─── Historial (deshacer / rehacer) ───
  function record(page, before) {
    history.push({ pageId: page.id, before, after: page.items.slice() });
    if (history.length > 200) history.shift();
    future.length = 0;
    updateHistoryButtons();
  }
  function undo() {
    const h_ = history.pop();
    if (!h_) return;
    future.push(h_);
    pages.get(h_.pageId)?.setItems(h_.before.slice());
    updateHistoryButtons();
  }
  function redo() {
    const h_ = future.pop();
    if (!h_) return;
    history.push(h_);
    pages.get(h_.pageId)?.setItems(h_.after.slice());
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    undoBtn.disabled = history.length === 0;
    redoBtn.disabled = future.length === 0;
  }

  // ─── Selección (imágenes y stickers) ───
  function clearSelection() {
    if (!selected) return;
    selected.page.drawSelection(null);
    selected = null;
  }
  function deleteSelected() {
    if (!selected) return;
    const { page, index } = selected;
    const before = page.items.slice();
    page.items.splice(index, 1);
    selected = null;
    page.drawSelection(null);
    page.redraw();
    page.save();
    record(page, before);
  }

  async function addImage() {
    const file = await pickFile('image/*', { asText: false, maxBytes: 30 * 1024 * 1024 });
    if (!file) return;
    if (!/^image\//.test(file.type)) return toast('Elegí una imagen.', { tone: 'error' });
    try {
      const { blob, width, height } = await shrinkImage(file.file);
      const mid = newId();
      await putMedia(mid, blob);
      const page = pages.get(currentPageId) ?? [...pages.values()][0];
      await page.ready;
      const w = 520;
      const hh = Math.round((w * height) / width);
      const before = page.items.slice();
      page.items.push({ t: 'img', m: mid, x: (PAGE_W - w) / 2, y: Math.max(40, page.visibleTop() + 60), w, h: hh });
      page.redraw();
      page.save();
      record(page, before);
      setTool('select');
      selected = { page, index: page.items.length - 1 };
      page.drawSelection(page.items.at(-1));
    } catch (err) {
      console.error(err);
      toast('No se pudo agregar la imagen.', { tone: 'error' });
    }
  }

  function pageMenu() {
    const idx = Math.max(0, nb.pages.findIndex((p) => p.id === currentPageId));
    openSheet({
      title: `Página ${idx + 1} de ${nb.pages.length}`,
      wide: true,
      build: (close) => {
        // Por defecto, la misma plantilla que esta página (o la última que no es del PDF).
        let paper = templateAt(idx);
        const host = h('div', {});
        host.appendChild(paperPicker('np-paper', paper, nb.paperColor, (p) => (paper = p), { current: paper.startsWith('m:') ? paper : null }));
        return h('div', { class: 'stack' },
          h('p', { class: 'field__label' }, 'Plantilla para la página nueva'),
          host,
          h('div', { class: 'row row--wrap' },
            h('button', { class: 'btn btn--primary', type: 'button', onClick: () => (close(), insertPage(idx + 1, paper)) }, icon('plus', { size: 18 }), 'Agregar página después de esta'),
            h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), insertPage(nb.pages.length, paper)) }, 'Agregar al final'),
            nb.pages[idx] && !nb.pages[idx].pdfPage
              ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), changePaper(idx, paper)) }, 'Usar esta plantilla en la página actual')
              : null,
          ),
          h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', disabled: nb.pages.length <= 1, onClick: async () => {
            const ok = await confirmAction({ title: `¿Borrar la página ${idx + 1}?`, message: 'Se borran sus notas. No se puede deshacer.', confirmLabel: 'Borrar página' });
            if (!ok) return;
            close();
            removePage(idx);
          } }, icon('trash', { size: 18 }), 'Borrar esta página'),
        );
      },
    });
  }

  /** Plantilla de una página (o de la más cercana hacia atrás que no sea del PDF). */
  function templateAt(idx) {
    for (let i = Math.min(idx, nb.pages.length - 1); i >= 0; i--) {
      const p = nb.pages[i];
      if (p.pdfPage) continue;
      if (p.bg) return `m:${p.bg}`;
      if (p.paper) return p.paper;
      return nb.bg ? `m:${nb.bg}` : nb.paper;
    }
    // Cuaderno de PDF sin páginas propias todavía: hoja rayada.
    return nb.pdfMediaId ? 'lined-m' : nb.bg ? `m:${nb.bg}` : nb.paper;
  }

  /** Aplica una plantilla a una página (datos, no dibujo). */
  async function applyTemplate(page, tpl, { isNew = false } = {}) {
    let bg = null;
    if (tpl.startsWith('u:')) {
      bg = await copyMedia(tpl.slice(2));
      if (!bg) tpl = 'lined-m';
      else if (isNew) page.ratio = (await templateRatio(tpl)) ?? page.ratio;
    } else if (tpl.startsWith('m:')) {
      bg = tpl.slice(2);
      if (isNew) page.ratio = nb.pages.find((p) => p.bg === bg)?.ratio ?? (bg === nb.bg ? nb.pages.find((p) => !p.pdfPage && !p.paper)?.ratio : null) ?? page.ratio;
    }
    delete page.paper;
    delete page.bg;
    if (bg) {
      if (bg !== nb.bg) page.bg = bg;
    } else if (tpl !== nb.paper || nb.bg) page.paper = tpl;
  }

  async function insertPage(at, tpl, { scroll = true } = {}) {
    const page = { id: newId(), pdfPage: null, ratio: nb.pdfMediaId ? (nb.pages.find((p) => p.pdfPage)?.ratio ?? 1.414) : 1.414 };
    await applyTemplate(page, tpl, { isNew: true });
    nb.pages.splice(at, 0, page);
    store.updateNotebook(nb.id, { pages: nb.pages });
    const ctl = mountPage(page, at);
    const next = pagesHost.children[at];
    pagesHost.insertBefore(ctl.el, next ?? null);
    renumber();
    if (scroll) ctl.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return ctl;
  }

  async function changePaper(idx, tpl) {
    const page = nb.pages[idx];
    await applyTemplate(page, tpl);
    store.updateNotebook(nb.id, { pages: nb.pages });
    pages.get(page.id)?.drawBackground();
  }

  async function removePage(idx) {
    const [page] = nb.pages.splice(idx, 1);
    store.updateNotebook(nb.id, { pages: nb.pages });
    const ctl = pages.get(page.id);
    for (const item of ctl?.items ?? []) if (item.m) await deleteMedia(item.m);
    ctl?.el.remove();
    pages.delete(page.id);
    await deleteInk([page.id]);
    renumber();
  }

  function renumber() {
    nb.pages.forEach((p, i) => pages.get(p.id)?.setNumber(i + 1));
  }

  // ─── Una página ───
  function mountPage(page, index) {
    const ratio = page.ratio || 1.414;
    const H = PAGE_W * ratio;
    const el = h('section', { class: 'nb-page', dataset: { id: page.id }, style: { '--ratio': String(ratio) }, 'aria-label': `Página ${index + 1}` });
    const num = h('span', { class: 'nb-page__num' }, String(index + 1));
    const canvas = h('canvas', { class: 'nb-page__pdf', hidden: true });
    const s = svg('svg', { class: 'nb-page__svg', viewBox: `0 0 ${PAGE_W} ${H}`, preserveAspectRatio: 'none' });
    const defs = svg('defs');
    const paperG = svg('g');
    const imgG = svg('g');
    const inkG = svg('g');
    const liveG = svg('g');
    const selG = svg('g');
    s.append(defs, paperG, imgG, inkG, liveG, selG);
    el.append(canvas, s, num);

    const ctl = {
      id: page.id,
      el,
      items: [],
      loaded: false,
      pdfRendered: 0,
      saveTimer: null,
      imageUrls: new Map(),
      ready: null,
      setNumber: (n) => {
        num.textContent = String(n);
        el.setAttribute('aria-label', `Página ${n}`);
      },
      drawBackground() {
        const H = PAGE_W * (page.ratio || 1.414);
        const bg = page.pdfPage ? null : page.bg ?? (page.paper ? null : nb.bg);
        if (bg) {
          // Plantilla hecha con una imagen: llena la hoja (se recorta si no coincide la proporción).
          const image = svg('image', { x: 0, y: 0, width: PAGE_W, height: H, preserveAspectRatio: 'xMidYMid slice' });
          paperG.replaceChildren(svg('rect', { width: PAGE_W, height: H, fill: nb.paperColor }), image);
          mediaUrl(bg).then((url) => url && image.setAttribute('href', url));
          return;
        }
        drawPaper(paperG, page.pdfPage ? 'blank' : page.paper ?? nb.paper, H, page.pdfPage ? 'transparent' : nb.paperColor);
      },
      async load() {
        if (ctl.loaded) return ctl.ready;
        ctl.loaded = true;
        ctl.ready = (async () => {
          const stored = await getInk(page.id);
          ctl.items = [...stored, ...ctl.items]; // por si se escribió antes de terminar de cargar
          ctl.redraw();
        })();
        return ctl.ready;
      },
      async renderPdf() {
        if (!page.pdfPage) return;
        const width = el.clientWidth;
        if (!width || Math.abs(ctl.pdfRendered - width) < 40) return;
        const doc = await getPdf();
        if (!doc) return;
        ctl.pdfRendered = width;
        try {
          await renderPdfPage(doc, page.pdfPage, canvas, width);
          canvas.hidden = false;
        } catch (err) {
          console.error(err);
        }
      },
      releasePdf() {
        if (!ctl.pdfRendered) return;
        canvas.width = 0;
        canvas.height = 0;
        canvas.hidden = true;
        ctl.pdfRendered = 0;
      },
      resized() {
        if (ctl.pdfRendered) {
          ctl.pdfRendered = 0;
          ctl.renderPdf();
        }
      },
      redraw() {
        defs.replaceChildren();
        imgG.replaceChildren();
        inkG.replaceChildren();
        for (const item of ctl.items) {
          const node = itemNode(item);
          if (node) (item.t === 'img' ? imgG : inkG).appendChild(node);
        }
      },
      setItems(items) {
        ctl.items = items;
        clearSelection();
        ctl.redraw();
        ctl.save();
      },
      save() {
        clearTimeout(ctl.saveTimer);
        ctl.saveTimer = setTimeout(() => ctl.flush(), 300);
      },
      flush() {
        if (ctl.saveTimer === null) return;
        clearTimeout(ctl.saveTimer);
        ctl.saveTimer = null;
        putInk(page.id, ctl.items).catch(() => toast('No se pudieron guardar las notas (¿sin lugar en el dispositivo?).', { tone: 'error' }));
        if (nb.updatedAt < Date.now() - 60000) store.updateNotebook(nb.id, {}); // fecha de última edición, sin escribir de más
      },
      visibleTop() {
        const r = el.getBoundingClientRect();
        const sr = scroller.getBoundingClientRect();
        return Math.max(0, ((sr.top - r.top) / r.width) * PAGE_W);
      },
      drawSelection(item) {
        selG.replaceChildren();
        if (!item) return;
        const b = itemBox(item);
        selG.append(
          svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: '#3457d5', 'stroke-width': 2, 'stroke-dasharray': '8 6' }),
          svg('circle', { cx: b.x + b.w, cy: b.y + b.h, r: 14, fill: '#3457d5', stroke: '#fff', 'stroke-width': 3, class: 'nb-handle' }),
        );
        const del = svg('g', { class: 'nb-del', transform: `translate(${b.x + b.w} ${b.y})` }, svg('circle', { r: 16, fill: '#d0302f', stroke: '#fff', 'stroke-width': 3 }), svg('path', { d: 'M-6 -6L6 6M6 -6L-6 6', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' }));
        selG.appendChild(del);
      },
    };

    function itemNode(item) {
      if (item.t === 'pen') return svg('path', { d: penOutline(item), fill: item.c });
      if (item.t === 'hl') return svg('path', { d: centerline(item), fill: 'none', stroke: item.c, 'stroke-width': item.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-opacity': 0.42, class: 'nb-hl' });
      if (item.t === 'tape' && item.m) {
        const fill = tapeImageDefs(defs, item, ctl.imageUrls.get(item.m));
        if (!ctl.imageUrls.has(item.m)) mediaUrl(item.m).then((url) => url && tapeImageDefs(defs, item, url));
        return tapeShape(item, defs, fill);
      }
      if (item.t === 'tape') return tapeShape(item, defs);
      if (item.t === 'st') return stickerShape(item);
      if (item.t === 'img') {
        const image = svg('image', { x: item.x, y: item.y, width: item.w, height: item.h, preserveAspectRatio: 'xMidYMid meet' });
        const cached = ctl.imageUrls.get(item.m);
        if (cached) image.setAttribute('href', cached);
        else mediaUrl(item.m).then((url) => url && image.setAttribute('href', url));
        return image;
      }
      return null;
    }
    async function mediaUrl(id) {
      if (ctl.imageUrls.has(id)) return ctl.imageUrls.get(id);
      const blob = await getMedia(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      ctl.imageUrls.set(id, url);
      return url;
    }

    // ─── Dibujo ───
    let drawing = null;
    const toPage = (e) => {
      const ctm = s.getScreenCTM();
      if (!ctm) return null;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y, p: e.pointerType === 'pen' ? e.pressure : 0.5 };
    };
    const accepts = (e) => {
      if (e.pointerType === 'pen') {
        penSeen = true;
        return true;
      }
      if (e.pointerType === 'mouse') return e.button === 0;
      // Dedo: solo si está activado "Escribir con el dedo" (y nunca si se está usando el Pencil: palma).
      return opt.finger && !penSeen;
    };

    s.addEventListener('pointerdown', (e) => {
      currentPageId = page.id;
      if (!ctl.loaded) ctl.load();
      // Otro dedo ya apoyado: es un gesto (zoom, deshacer), no un trazo.
      if (e.pointerType === 'touch' && (input.touches.size > 0 || input.penDown)) return;
      if (opt.tool === 'select') return startSelect(e);
      if (!accepts(e)) return;
      e.preventDefault();
      e.nbClaimed = true;
      try {
        s.setPointerCapture(e.pointerId);
      } catch {
        /* algunos navegadores no capturan el lápiz: se dibuja igual */
      }
      const pt = toPage(e);
      if (!pt) return;
      clearSelection();
      const before = ctl.items.slice();
      if (opt.tool === 'pen' || opt.tool === 'hl') {
        const stroke = opt.tool === 'pen'
          ? { t: 'pen', c: opt.penColor, w: TOOLS.pen.widths[opt.penW] ?? 3.6, p: [] }
          : { t: 'hl', c: opt.hlColor, w: TOOLS.hl.widths[opt.hlW] ?? 22, p: [] };
        addPoint(stroke, pt.x, pt.y, pt.p);
        const path = svg('path', {});
        liveG.appendChild(path);
        drawing = { id: e.pointerId, kind: 'stroke', stroke, path, before };
        input.cancelActive = cancelDrawing;
        paintLive();
      } else if (opt.tool === 'eraser') {
        drawing = { id: e.pointerId, kind: 'erase', before, removed: 0 };
        eraseAt(pt);
      } else if (opt.tool === 'tape') {
        const item = { t: 'tape', k: opt.tape, c: opt.tapeColor, w: TOOLS.tape.widths[opt.tapeW] ?? 40, p: [pt.x, pt.y, 0, pt.x + 1, pt.y, 0] };
        const own = opt.tape.startsWith('u:') ? libList('tape').find((x) => `u:${x.id}` === opt.tape) : null;
        if (own) Object.assign(item, { k: 'img', m: tapeMedia(own.id), a: own.a });
        drawing = { id: e.pointerId, kind: 'tape', item, before };
        input.cancelActive = cancelDrawing;
        paintTape();
      } else if (opt.tool === 'sticker') {
        placeSticker(pt, before);
      }
    });

    function placeSticker(pt, before = ctl.items.slice()) {
      const own = opt.sticker.startsWith('u:') ? libList('sticker').find((x) => `u:${x.id}` === opt.sticker) : null;
      if (own) return placeOwnSticker(own, pt, before);
      ctl.items.push({ t: 'st', k: STICKERS[opt.sticker] ? opt.sticker : 'star', x: Math.round(pt.x), y: Math.round(pt.y), s: 110, r: 0 });
      ctl.redraw();
      ctl.save();
      record(ctl, before);
    }
    /** Pegar con un toque del dedo (el dedo no dibuja: se detecta el toque aparte). */
    ctl.placeStickerAt = async (x, y) => {
      await ctl.load();
      const pt = toPage({ clientX: x, clientY: y, pointerType: 'touch' });
      if (pt) placeSticker(pt);
    };

    /** Un sticker propio es una imagen chica que se borra con la goma. */
    async function placeOwnSticker(own, pt, before) {
      const mid = await copyMedia(own.id);
      if (!mid) return toast('Ese sticker ya no está en el dispositivo.', { tone: 'error' });
      const w = 150;
      const hh = Math.round(w / own.a);
      ctl.items.push({ t: 'img', u: 1, m: mid, x: Math.round(pt.x - w / 2), y: Math.round(pt.y - hh / 2), w, h: hh });
      ctl.redraw();
      ctl.save();
      record(ctl, before);
    }

    /** Copia del diseño de cinta para esta página (una sola vez por página y diseño). */
    const tapeCopies = new Map();
    function tapeMedia(libId) {
      if (!tapeCopies.has(libId)) {
        const mid = newId();
        tapeCopies.set(libId, mid);
        getMedia(libId).then((blob) => blob && putMedia(mid, blob)).then(() => ctl.redraw());
      }
      return tapeCopies.get(libId);
    }

    function cancelDrawing() {
      if (!drawing) return;
      const d = drawing;
      drawing = null;
      liveG.replaceChildren();
      if (d.kind === 'erase' || d.kind === 'move' || d.kind === 'resize') {
        ctl.items = d.before;
        ctl.redraw();
        if (selected?.page === ctl) ctl.drawSelection(ctl.items[selected.index]);
      }
    }

    s.addEventListener('pointermove', (e) => {
      if (!drawing || e.pointerId !== drawing.id) return;
      e.preventDefault();
      const events = e.getCoalescedEvents?.() ?? [];
      for (const ev of events.length ? events : [e]) {
        const pt = toPage(ev);
        if (!pt) continue;
        if (drawing.kind === 'stroke') addPoint(drawing.stroke, pt.x, pt.y, pt.p);
        else if (drawing.kind === 'erase') eraseAt(pt);
        else if (drawing.kind === 'tape') {
          drawing.item.p[3] = pt.x;
          drawing.item.p[4] = pt.y;
        } else if (drawing.kind === 'move' || drawing.kind === 'resize') moveSelected(pt);
      }
      if (drawing.kind === 'stroke') paintLive();
      if (drawing.kind === 'tape') paintTape();
    });

    const finish = (e) => {
      if (!drawing || e.pointerId !== drawing.id) return;
      const d = drawing;
      drawing = null;
      input.cancelActive = null;
      liveG.replaceChildren();
      if (d.kind === 'stroke') {
        ctl.items.push(d.stroke);
        inkG.appendChild(itemNode(d.stroke));
        ctl.save();
        record(ctl, d.before);
      } else if (d.kind === 'erase') {
        if (d.removed) {
          ctl.save();
          record(ctl, d.before);
        }
      } else if (d.kind === 'tape') {
        const [x1, y1, , x2, y2] = d.item.p;
        if (Math.hypot(x2 - x1, y2 - y1) > 12) {
          d.item.p = d.item.p.map((v) => Math.round(v * 10) / 10);
          ctl.items.push(d.item);
          ctl.redraw();
          ctl.save();
          record(ctl, d.before);
        }
      } else if (d.kind === 'move' || d.kind === 'resize') {
        ctl.save();
        record(ctl, d.before);
      }
    };
    s.addEventListener('pointerup', finish);
    // Si el sistema cancela el toque (por ejemplo, un gesto de iPadOS), el trazo ya
    // hecho se guarda igual en vez de perderse.
    s.addEventListener('pointercancel', (e) => {
      if (!drawing || e.pointerId !== drawing.id) return;
      if (drawing.kind === 'stroke' && drawing.stroke.p.length > 3) finish(e);
      else cancelDrawing();
      input.cancelActive = null;
    });

    function paintLive() {
      const st = drawing.stroke;
      if (st.t === 'pen') {
        drawing.path.setAttribute('d', penOutline(st));
        drawing.path.setAttribute('fill', st.c);
      } else {
        drawing.path.setAttribute('d', centerline(st));
        drawing.path.setAttribute('fill', 'none');
        drawing.path.setAttribute('stroke', st.c);
        drawing.path.setAttribute('stroke-width', st.w);
        drawing.path.setAttribute('stroke-linecap', 'round');
        drawing.path.setAttribute('stroke-linejoin', 'round');
        drawing.path.setAttribute('stroke-opacity', '0.42');
        drawing.path.setAttribute('class', 'nb-hl');
      }
    }
    function paintTape() {
      liveG.replaceChildren(itemNode(drawing.item));
    }
    function eraseAt(pt) {
      const r = 12;
      const keep = ctl.items.filter((it) => !touches(it, pt.x, pt.y, r));
      if (keep.length !== ctl.items.length) {
        drawing.removed += ctl.items.length - keep.length;
        ctl.items = keep;
        ctl.redraw();
      }
    }

    // ─── Mover / redimensionar ───
    function startSelect(e) {
      const pt = toPage(e);
      if (!pt) return;
      // ¿Tocó el botón de borrar o la esquina de la selección actual?
      if (selected?.page === ctl) {
        const b = itemBox(ctl.items[selected.index]);
        if (Math.hypot(pt.x - (b.x + b.w), pt.y - b.y) < 26) {
          e.preventDefault();
          e.nbClaimed = true;
          return deleteSelected();
        }
        if (Math.hypot(pt.x - (b.x + b.w), pt.y - (b.y + b.h)) < 30) {
          e.preventDefault();
          e.nbClaimed = true;
          s.setPointerCapture(e.pointerId);
          drawing = { id: e.pointerId, kind: 'resize', start: pt, box: b, orig: { ...ctl.items[selected.index] }, before: ctl.items.slice() };
          input.cancelActive = cancelDrawing;
          return;
        }
      }
      for (let i = ctl.items.length - 1; i >= 0; i--) {
        const b = itemBox(ctl.items[i]);
        if (b && pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h) {
          e.preventDefault();
          if (selected && selected.page !== ctl) clearSelection();
          selected = { page: ctl, index: i };
          ctl.drawSelection(ctl.items[i]);
          e.nbClaimed = true;
          s.setPointerCapture(e.pointerId);
          drawing = { id: e.pointerId, kind: 'move', start: pt, orig: { ...ctl.items[i] }, before: ctl.items.slice() };
          input.cancelActive = cancelDrawing;
          return;
        }
      }
      clearSelection();
    }
    function moveSelected(pt) {
      const i = selected.index;
      const o = drawing.orig;
      const dx = pt.x - drawing.start.x;
      const dy = pt.y - drawing.start.y;
      let next;
      if (drawing.kind === 'move') next = { ...o, x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
      else if (o.t === 'img') {
        const w = Math.max(60, drawing.box.w + dx);
        next = { ...o, w: Math.round(w), h: Math.round((w * o.h) / o.w) };
      } else next = { ...o, s: Math.round(Math.max(30, Math.min(500, o.s + Math.max(dx, dy) * 2))) };
      ctl.items[i] = next;
      ctl.redraw();
      ctl.drawSelection(next);
    }

    ctl.drawBackground();
    pages.set(page.id, ctl);
    return ctl;
  }

  // ─── Armado ───
  opt.zoom = Math.max(ZMIN, Math.min(ZMAX, Number(opt.zoom) || 1));
  pagesHost.style.setProperty('--zoom', String(opt.zoom));
  zoomLabel.textContent = `${Math.round(opt.zoom * 100)} %`;
  fitBase();
  requestAnimationFrame(fitBase);
  nb.pages.forEach((p, i) => pagesHost.appendChild(mountPage(p, i).el));
  drawOptions();
  applyTouchMode();
  updateHistoryButtons();

  // Solo se cargan las páginas cerca de la pantalla; los PDF lejanos se liberan
  // (cada página de PDF dibujada ocupa varios MB de memoria).
  observer = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const ctl = pages.get(en.target.dataset.id);
        if (!ctl) continue;
        if (en.isIntersecting) {
          ctl.load();
          ctl.renderPdf();
        } else ctl.releasePdf();
      }
    },
    { root: scroller, rootMargin: '1200px 0px' },
  );
  const visible = new IntersectionObserver(
    (entries) => {
      for (const en of entries) if (en.isIntersecting) currentPageId = en.target.dataset.id;
    },
    { root: scroller, threshold: 0.5 },
  );
  for (const ctl of pages.values()) {
    observer.observe(ctl.el);
    visible.observe(ctl.el);
  }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.dataset?.id) {
      observer.observe(n);
      visible.observe(n);
    }
  });
  mo.observe(pagesHost, { childList: true });

  // Al bajar hasta el final (desplazando, con la rueda o "empujando" con el dedo
  // cuando ya no hay más para bajar) se agrega una hoja.
  let appending = false;
  const openedAt = performance.now();
  checkEnd = async ({ force = false } = {}) => {
    if (appending || (!force && performance.now() - openedAt < 1000)) return;
    const er = endZone.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    if (er.top > sr.bottom - er.height * 0.5) return;
    const last = nb.pages.at(-1);
    const ctl = last && pages.get(last.id);
    if (!ctl) return;
    appending = true;
    try {
      await ctl.load();
      // Llegar al final agrega una hoja si la última tiene algo; "tirar" la agrega siempre.
      if (!force && !last.pdfPage && ctl.items.length === 0) return;
      const added = await insertPage(nb.pages.length, templateAt(nb.pages.length - 1), { scroll: false });
      if (force) added.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      appending = false;
    }
  };
  scroller.addEventListener('scroll', () => checkEnd(), { passive: true });
  let wheelPull = 0;
  let wheelTimer = null;
  scroller.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.deltaY <= 0) return;
    checkEnd();
    if (!atBottom()) return;
    wheelPull += e.deltaY;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => (wheelPull = 0), 400);
    if (wheelPull > 500) {
      wheelPull = 0;
      checkEnd({ force: true });
    }
  }, { passive: true });
}

/** Abre una imagen para dibujarla en un canvas (con respaldo para Safari viejos). */
async function decodeImage(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { width: img.naturalWidth, height: img.naturalHeight, img, close: () => {} };
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}

/** Achica una imagen (las fotos del celular pesan mucho). `keepAlpha`: siempre PNG, para stickers con fondo transparente. */
async function shrinkImage(file, max = 1600, keepAlpha = false) {
  const bitmap = await decodeImage(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const hh = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  canvas.getContext('2d').drawImage(bitmap.img ?? bitmap, 0, 0, w, hh);
  bitmap.close?.();
  const type = keepAlpha || /png|webp|gif/.test(file.type) ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.86));
  canvas.width = 0;
  return { blob, width: w, height: hh };
}
