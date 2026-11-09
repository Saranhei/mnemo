// Archivo para compartir un cuaderno: { app, type: "notebook", version, notebook, pdf, images }.
//   notebook = { name, paper, paperColor, color, bg?, pages: [{ pdfPage, ratio, paper?, bg?, ink: [...] }] }
//   (bg = plantilla hecha con una imagen; es un id de `images`)
//   pdf      = { name, data (base64) } o null (si era muy grande, se pide elegirlo al importar)
//   images   = { id: { type, data (base64) } }
// Todo se valida: tipos de archivo, tamaños, cantidades y trazos.

import { clean, MAX_NAME } from './sanitize.js';
import { PAPERS, PAPER_COLORS, NOTEBOOK_COLORS } from './model.js';
import { sanitizeStrokes } from './ink.js';

export const NOTEBOOK_LIMITS = Object.freeze({
  pages: 2000,
  embedPdfBytes: 40 * 1024 * 1024, // más grande: se exporta sin el PDF
  pdfBytes: 200 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  images: 500,
});

const IMAGE_TYPE = /^image\/(png|jpeg|webp|gif)$/;
const BASE64 = /^[A-Za-z0-9+/=\s]+$/;

export class NotebookFileError extends Error {}

export function sanitizeNotebookFile(raw) {
  const version = typeof raw.version === 'number' ? raw.version : 1;
  if (version > 1) throw new NotebookFileError('Este cuaderno es de una versión más nueva de Mnemo. Actualizá la app.');
  const nb = raw.notebook ?? {};
  const name = clean(nb.name, MAX_NAME) || 'Cuaderno importado';
  const pagesIn = Array.isArray(nb.pages) ? nb.pages.slice(0, NOTEBOOK_LIMITS.pages) : [];
  if (pagesIn.length === 0) throw new NotebookFileError('El cuaderno no tiene páginas.');

  const images = {};
  const imgIn = raw.images && typeof raw.images === 'object' ? Object.entries(raw.images).slice(0, NOTEBOOK_LIMITS.images) : [];
  for (const [id, img] of imgIn) {
    if (!/^[\w-]{1,64}$/.test(id) || !img || !IMAGE_TYPE.test(img.type ?? '') || typeof img.data !== 'string') continue;
    if (!BASE64.test(img.data.slice(0, 2000)) || img.data.length * 0.75 > NOTEBOOK_LIMITS.imageBytes) continue;
    images[id] = { type: img.type, data: img.data };
  }
  const pdf =
    raw.pdf && typeof raw.pdf.data === 'string' && BASE64.test(raw.pdf.data.slice(0, 2000)) && raw.pdf.data.length * 0.75 <= NOTEBOOK_LIMITS.pdfBytes
      ? { name: clean(raw.pdf.name, 200) || 'documento.pdf', data: raw.pdf.data }
      : null;
  const pdfName = clean(nb.pdfName ?? raw.pdf?.name, 200);
  const usesPdf = pagesIn.some((p) => Number.isInteger(p?.pdfPage) && p.pdfPage > 0);

  const pages = pagesIn.map((p) => ({
    pdfPage: usesPdf && Number.isInteger(p?.pdfPage) && p.pdfPage > 0 && p.pdfPage < 100000 ? p.pdfPage : null,
    ratio: Number.isFinite(p?.ratio) ? Math.max(0.3, Math.min(4, p.ratio)) : 1.414,
    paper: PAPERS.includes(p?.paper) ? p.paper : undefined,
    bg: typeof p?.bg === 'string' && images[p.bg] ? p.bg : undefined,
    ink: sanitizeStrokes(p?.ink, 20000, (id) => (images[id] ? id : null)),
  }));
  return {
    notebook: {
      name,
      paper: PAPERS.includes(nb.paper) ? nb.paper : 'lined-m',
      paperColor: PAPER_COLORS.includes(nb.paperColor) ? nb.paperColor : PAPER_COLORS[0],
      color: NOTEBOOK_COLORS.includes(nb.color) ? nb.color : NOTEBOOK_COLORS[0],
      pdfName,
      bg: typeof nb.bg === 'string' && images[nb.bg] ? nb.bg : null,
      pages,
    },
    pdf,
    needsPdf: usesPdf && !pdf,
    images,
  };
}

export function notebookFileName(name) {
  return `${String(name).replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'cuaderno'}.mnemo-notebook.json`;
}
