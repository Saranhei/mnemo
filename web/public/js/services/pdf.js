// PDF de los cuadernos, con pdf.js (Mozilla, licencia Apache 2.0), incluido en la
// propia app (public/vendor/): no se pide nada a otros sitios y funciona sin conexión
// una vez descargado. Se carga recién cuando hace falta, porque pesa ~1,8 MB.

const BASE = new URL('../../vendor/pdfjs-4.10.38/', import.meta.url);
let libPromise = null;

function lib() {
  libPromise ??= import(new URL('pdf.min.js', BASE).href).then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.js', BASE).href;
    return pdfjs;
  });
  return libPromise;
}

/** Abre un PDF guardado en el dispositivo (Blob o ArrayBuffer). */
export async function openPdf(data) {
  const pdfjs = await lib();
  const bytes = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data);
  return pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false, // la política de seguridad de la app no permite eval
    cMapUrl: new URL('cmaps/', BASE).href, // necesarios para muchos PDF en japonés
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', BASE).href,
  }).promise;
}

/** Cantidad de páginas y proporción (alto/ancho) de la primera. */
export async function pdfInfo(doc) {
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  return { pageCount: doc.numPages, ratio: vp.height / vp.width };
}

/**
 * Dibuja una página en un canvas de `cssWidth` px de ancho (con la densidad de la
 * pantalla, pero con un tope para no gastar demasiada memoria en el iPhone).
 * @returns {Promise<{ratio: number, cancel: () => void}>}
 */
export async function renderPdfPage(doc, pageNumber, canvas, cssWidth) {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const scale = Math.min((cssWidth * dpr) / base.width, 2400 / base.width);
  const vp = page.getViewport({ scale });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  await task.promise.catch((err) => {
    if (err?.name !== 'RenderingCancelledException') throw err;
  });
  page.cleanup();
  return { ratio: base.height / base.width };
}
