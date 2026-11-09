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
import { live, newId, newPage, PAPERS, PAPER_COLORS, NOTEBOOK_COLORS } from '../core/model.js';
import { clean, MAX_NAME } from '../core/sanitize.js';
import { PAGE_W, TOOLS, addPoint, penOutline, centerline, touches, itemBox } from '../core/ink.js';
import { NOTEBOOK_LIMITS, notebookFileName } from '../core/notebookFile.js';
import { pickFile, deliverFile } from '../services/device.js';
import { openPdf, pdfInfo, renderPdfPage } from '../services/pdf.js';
import { svg, drawPaper, PAPER_LABEL, TAPES, tapeShape, STICKERS, stickerShape, stickerPreview, paperPreview } from '../ui/paper.js';

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
                h('span', { class: 'nb-cover__paper' }, paperPreview(nb.pdfMediaId ? 'blank' : nb.paper, nb.paperColor)),
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

function paperPicker(name, value, bg, onPick) {
  return h(
    'div',
    { class: 'paper-picker', role: 'radiogroup', 'aria-label': 'Tipo de hoja' },
    PAPERS.map((p) =>
      h(
        'label',
        { class: 'paper-opt', for: `${name}-${p}` },
        h('input', { type: 'radio', name, id: `${name}-${p}`, value: p, checked: p === value, onChange: () => onPick(p) }),
        paperPreview(p, bg),
        h('span', {}, PAPER_LABEL[p]),
      ),
    ),
  );
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
          onSubmit: (e) => {
            e.preventDefault();
            writePref('nb.paper', paper);
            const nb = store.createNotebook({ name: clean(name.value, MAX_NAME) || 'Cuaderno', paper, paperColor, color });
            close();
            openNotebook(ctx, nb.id);
          },
        },
        field({ id: 'nb-name', label: 'Nombre', control: name }),
        h('p', { class: 'field__label' }, 'Hoja'),
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
  const pages = [];
  for (const p of nb.pages) {
    const ink = await getInk(p.id);
    for (const item of ink) {
      if (item.t === 'img' && !images[item.m]) {
        const blob = await getMedia(item.m);
        if (blob) images[item.m] = { type: blob.type || 'image/jpeg', data: await toBase64(blob) };
      }
    }
    pages.push({ pdfPage: p.pdfPage, ratio: p.ratio, paper: p.paper, ink });
  }
  let pdf = null;
  if (nb.pdfMediaId) {
    const blob = await getMedia(nb.pdfMediaId);
    if (blob && blob.size <= NOTEBOOK_LIMITS.embedPdfBytes) pdf = { name: nb.pdfName, data: await toBase64(blob) };
    else if (blob) toast('El PDF es muy grande para incluirlo: en el otro dispositivo te va a pedir que elijas el mismo PDF.', { ms: 7000 });
  }
  const file = { app: 'mnemo', type: 'notebook', version: 1, notebook: { name: nb.name, paper: nb.paper, paperColor: nb.paperColor, color: nb.color, pdfName: nb.pdfName, pages }, pdf, images };
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
    const page = { id: newId(), pdfPage: pdfMediaId ? p.pdfPage : null, ratio: p.ratio, ...(p.paper ? { paper: p.paper } : {}) };
    const ink = p.ink.map((item) => (item.t === 'img' ? { ...item, m: mediaMap[item.m] } : item)).filter((i) => i.t !== 'img' || i.m);
    if (ink.length) await putInk(page.id, ink);
    pages.push(page);
  }
  store.updateNotebook(nb.id, { pages, pdfMediaId, pdfName: pdfMedia?.name ?? '' });
  return nb.id;
}

// ───────────────────────────── Editor ─────────────────────────────

const prefs = () => ({
  tool: readPref('nb.tool', 'pen'),
  penColor: readPref('nb.penColor', INK_COLORS[0]),
  hlColor: readPref('nb.hlColor', HL_COLORS[0]),
  tapeColor: readPref('nb.tapeColor', TAPE_COLORS[0]),
  tape: readPref('nb.tape', 'stripes'),
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
  const scroller = h('div', { class: 'nb-scroller' });
  const pagesHost = h('div', { class: 'nb-pages' });
  scroller.appendChild(pagesHost);
  layer.body.append(bar, scroller);

  // El Apple Pencil en Safari, sin esto, a veces desplaza la página en vez de escribir.
  scroller.addEventListener('touchstart', (e) => {
    if (opt.tool === 'select') return;
    if ([...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault();
  }, { passive: false });
  scroller.addEventListener('touchmove', (e) => {
    if ([...e.touches].some((t) => t.touchType === 'stylus') && opt.tool !== 'select') e.preventDefault();
  }, { passive: false });

  function savePref(k, v) {
    opt[k] = v;
    writePref(`nb.${k}`, v);
  }

  function setTool(t) {
    savePref('tool', t);
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
    const custom = h('input', { type: 'color', class: 'nb-color-custom', value: opt[key], 'aria-label': 'Otro color', title: 'Otro color' });
    const mark = () => {
      for (const b of row.querySelectorAll('[data-c]')) b.classList.toggle('is-on', b.dataset.c === opt[key]);
    };
    for (const c of colors) row.appendChild(h('button', { class: 'nb-color', type: 'button', dataset: { c }, style: { '--sw': c }, 'aria-label': `Color ${c}`, onClick: () => (savePref(key, c), mark()) }));
    custom.addEventListener('input', () => (savePref(key, custom.value), mark()));
    row.appendChild(custom);
    mark();
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
      const kinds = h('div', { class: 'nb-tapes' }, TAPES.map((t) => h('button', { class: `nb-tape${opt.tape === t.id ? ' is-on' : ''}`, type: 'button', dataset: { k: t.id }, 'aria-label': `Cinta ${t.label}`, title: t.label, onClick: () => {
        savePref('tape', t.id);
        for (const b of kinds.children) b.classList.toggle('is-on', b.dataset.k === t.id);
      } }, t.label)));
      options.append(colorRow(TAPE_COLORS, 'tapeColor'), kinds);
    } else if (opt.tool === 'sticker') {
      options.append(h('p', { class: 'nb-hint' }, 'Tocá un sticker y después el lugar de la hoja.'),
        h('div', { class: 'nb-stickers' }, Object.entries(STICKERS).map(([k, s]) => h('button', { class: `nb-sticker${opt.sticker === k ? ' is-on' : ''}`, type: 'button', 'aria-label': s.label, title: s.label, onClick: (e) => {
          opt.sticker = k;
          for (const b of e.currentTarget.parentNode.children) b.classList.toggle('is-on', b === e.currentTarget);
        } }, stickerPreview(k, 34)))));
      opt.sticker ??= 'star';
      options.querySelector('.nb-sticker')?.classList.toggle('is-on', opt.sticker === 'star');
    } else if (opt.tool === 'eraser') options.append(h('p', { class: 'nb-hint' }, 'Pasá la goma por un trazo, cinta o sticker para borrarlo.'));
    else if (opt.tool === 'select') options.append(h('p', { class: 'nb-hint' }, 'Tocá una imagen o sticker para moverlo; la esquina cambia el tamaño. Con el dedo se desplaza la hoja.'));
    options.appendChild(toggle({ id: 'nb-finger', label: 'Escribir con el dedo', checked: opt.finger, onChange: (v) => (savePref('finger', v), applyTouchMode()) }));
  }

  function applyTouchMode() {
    const drawWithFinger = opt.finger && opt.tool !== 'select';
    scroller.classList.toggle('is-finger', drawWithFinger);
  }

  function setZoom(z) {
    const zoom = Math.max(0.5, Math.min(3, Math.round(z * 4) / 4));
    const anchor = currentPageId;
    savePref('zoom', zoom);
    pagesHost.style.setProperty('--zoom', String(zoom));
    zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
    for (const p of pages.values()) p.resized();
    pages.get(anchor)?.el.scrollIntoView({ block: 'start' });
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
        let paper = nb.pages[idx]?.paper ?? nb.paper;
        const host = h('div', {});
        host.appendChild(paperPicker('np-paper', paper, nb.paperColor, (p) => (paper = p)));
        return h('div', { class: 'stack' },
          h('p', { class: 'field__label' }, 'Hoja para la página nueva'),
          host,
          h('div', { class: 'row row--wrap' },
            h('button', { class: 'btn btn--primary', type: 'button', onClick: () => (close(), insertPage(idx + 1, paper)) }, icon('plus', { size: 18 }), 'Agregar página después de esta'),
            h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), insertPage(nb.pages.length, paper)) }, 'Agregar al final'),
            nb.pages[idx] && !nb.pages[idx].pdfPage
              ? h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => (close(), changePaper(idx, paper)) }, 'Usar esta hoja en la página actual')
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

  function insertPage(at, paper) {
    const page = newPage({ paper: paper === nb.paper ? null : paper, ratio: 1.414 });
    nb.pages.splice(at, 0, page);
    store.updateNotebook(nb.id, { pages: nb.pages });
    const ctl = mountPage(page, at);
    const next = pagesHost.children[at];
    pagesHost.insertBefore(ctl.el, next ?? null);
    renumber();
    ctl.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function changePaper(idx, paper) {
    const page = nb.pages[idx];
    if (paper === nb.paper) delete page.paper;
    else page.paper = paper;
    store.updateNotebook(nb.id, { pages: nb.pages });
    pages.get(page.id)?.drawBackground();
  }

  async function removePage(idx) {
    const [page] = nb.pages.splice(idx, 1);
    store.updateNotebook(nb.id, { pages: nb.pages });
    const ctl = pages.get(page.id);
    for (const item of ctl?.items ?? []) if (item.t === 'img') await deleteMedia(item.m);
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
        drawPaper(paperG, page.pdfPage ? 'blank' : page.paper ?? nb.paper, H, page.pdfPage ? 'transparent' : nb.paperColor);
      },
      async load() {
        if (ctl.loaded) return ctl.ready;
        ctl.loaded = true;
        ctl.ready = (async () => {
          ctl.items = await getInk(page.id);
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
      if (item.t === 'tape') return tapeShape(item, defs);
      if (item.t === 'st') return stickerShape(item);
      if (item.t === 'img') {
        const image = svg('image', { x: item.x, y: item.y, width: item.w, height: item.h, preserveAspectRatio: 'xMidYMid meet' });
        const cached = ctl.imageUrls.get(item.m);
        if (cached) image.setAttribute('href', cached);
        else getMedia(item.m).then((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          ctl.imageUrls.set(item.m, url);
          image.setAttribute('href', url);
        });
        return image;
      }
      return null;
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
      if (!ctl.loaded) return;
      if (opt.tool === 'select') return startSelect(e);
      if (!accepts(e)) return;
      e.preventDefault();
      s.setPointerCapture(e.pointerId);
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
        paintLive();
      } else if (opt.tool === 'eraser') {
        drawing = { id: e.pointerId, kind: 'erase', before, removed: 0 };
        eraseAt(pt);
      } else if (opt.tool === 'tape') {
        const item = { t: 'tape', k: opt.tape, c: opt.tapeColor, w: 40, p: [pt.x, pt.y, 0, pt.x + 1, pt.y, 0] };
        drawing = { id: e.pointerId, kind: 'tape', item, before };
        paintTape();
      } else if (opt.tool === 'sticker') {
        ctl.items.push({ t: 'st', k: opt.sticker ?? 'star', x: Math.round(pt.x), y: Math.round(pt.y), s: 110, r: 0 });
        ctl.redraw();
        ctl.save();
        record(ctl, before);
      }
    });

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
    s.addEventListener('pointercancel', (e) => {
      if (drawing?.kind === 'stroke') liveG.replaceChildren();
      if (drawing && e.pointerId === drawing.id) drawing = null;
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
      liveG.replaceChildren(tapeShape(drawing.item, defs));
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
          return deleteSelected();
        }
        if (Math.hypot(pt.x - (b.x + b.w), pt.y - (b.y + b.h)) < 30) {
          e.preventDefault();
          s.setPointerCapture(e.pointerId);
          drawing = { id: e.pointerId, kind: 'resize', start: pt, box: b, orig: { ...ctl.items[selected.index] }, before: ctl.items.slice() };
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
          s.setPointerCapture(e.pointerId);
          drawing = { id: e.pointerId, kind: 'move', start: pt, orig: { ...ctl.items[i] }, before: ctl.items.slice() };
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
  pagesHost.style.setProperty('--zoom', String(opt.zoom));
  zoomLabel.textContent = `${Math.round(opt.zoom * 100)} %`;
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
}

/** Achica una imagen a 1600 px como máximo (las fotos del celular pesan mucho). */
async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const hh = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = hh;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, hh);
  bitmap.close?.();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.86));
  canvas.width = 0;
  return { blob, width: w, height: hh };
}
