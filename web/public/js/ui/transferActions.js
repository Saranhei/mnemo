// Flujos de importar, exportar y sincronizar (con sus mensajes al usuario).

import { h, icon, plural } from './dom.js';
import { openSheet, confirmAction, toast } from './overlays.js';
import * as store from '../data/store.js';
import {
  parseImport, deckToExport, stateToBackup, deckFileName, backupFileName, TransferError, LIMITS, listeningToFile, listeningFileName,
} from '../core/transfer.js';
import { live } from '../core/model.js';
import { deliverFile, pickFile } from '../services/device.js';
import { putMedia } from '../data/storage.js';
import { newId } from '../core/model.js';

const ACCEPT = '.json,.txt,.tsv,application/json,text/plain,text/tab-separated-values';

/**
 * Importa un mazo (Mnemo o Anki), un ejercicio de listening o una copia completa.
 * @returns {Promise<{route: string, id: string} | null>} a dónde ir después, si corresponde.
 */
export async function importFlow(ctx) {
  const file = await pickFile(ACCEPT);
  if (!file) return null;
  try {
    if (file.size > LIMITS.listeningFileBytes) throw new TransferError('tooLarge', 'El archivo es demasiado grande.');
    const result = parseImport(file.text, file.name, file.size);

    if (result.kind === 'deck') {
      const id = store.importDeck(result.deck);
      toast(`Importado "${result.deck.name}": ${plural(result.deck.cards.length, 'tarjeta', 'tarjetas')}.`, { tone: 'ok' });
      return { route: 'deck', id };
    }

    if (result.kind === 'listening') {
      const id = await saveImportedListening(result);
      toast(`Importado el ejercicio "${result.listening.title}".`, { tone: 'ok' });
      return { route: 'listening-edit', id };
    }

    const s = result.state;
    const ok = await confirmAction({
      title: 'Combinar copia',
      message: `La copia trae ${describeBackup(s)}. Se suma a lo que ya tenés: de cada cosa queda la versión más reciente. No se pierde nada de este dispositivo que sea más nuevo.`,
      confirmLabel: 'Combinar',
      danger: false,
    });
    if (!ok) return null;
    const { added, updated } = store.mergeBackup(s);
    toast(
      added + updated === 0
        ? 'Ya estaba todo sincronizado.'
        : `Sincronizado: ${plural(added, 'registro nuevo', 'registros nuevos')}, ${plural(updated, 'actualizado', 'actualizados')}.`,
      { tone: 'ok' },
    );
    ctx.refresh();
    return null;
  } catch (err) {
    toast(err instanceof TransferError ? err.message : 'No se pudo leer el archivo.', { tone: 'error', ms: 5000 });
    return null;
  }
}

/** "3 mazos, 120 tarjetas y 12 listas de kanji" (solo lo que trae). */
function describeBackup(s) {
  const parts = [
    [live(s.decks).length, 'mazo', 'mazos'],
    [live(s.cards).length, 'tarjeta', 'tarjetas'],
    [live(s.sessions).length, 'sesión', 'sesiones'],
    [live(s.quizzes ?? []).length, 'cuestionario', 'cuestionarios'],
    [live(s.listenings ?? []).length, 'ejercicio de listening', 'ejercicios de listening'],
    [live(s.kanjiSets ?? []).length, 'lista de kanji', 'listas de kanji'],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => plural(n, one, many));
  if (parts.length === 0) return 'solo registros borrados';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

export async function exportDeckFlow(ctx, deckId) {
  const exp = deckToExport(store.getState(), deckId);
  await deliver(ctx, deckFileName(exp.name), JSON.stringify(exp, null, 2), 'Mazo exportado.');
}

export async function exportBackupFlow(ctx) {
  const now = Date.now();
  const backup = stateToBackup(store.getState(), now);
  await deliver(ctx, backupFileName(now), JSON.stringify(backup), 'Copia lista. Abrila en el otro dispositivo con "Importar".');
}

/** Crea el ejercicio y guarda su audio (que viene en base64) en el dispositivo. */
export async function saveImportedListening({ listening, media }) {
  const created = store.createListening(listening);
  if (media) {
    const binary = atob(media.data.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const mediaId = newId();
    await putMedia(mediaId, new Blob([bytes], { type: media.type }));
    store.updateListening(created.id, { mediaId, mediaName: media.name, mediaType: media.type });
  }
  return created.id;
}

/** Comparte un ejercicio con su audio adentro (para pasarlo a otro dispositivo o a alguien). */
export async function exportListeningFlow(ctx, listening, blob) {
  let media = null;
  if (blob) {
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    media = { name: listening.mediaName || 'audio', type: listening.mediaType || blob.type, data };
  }
  await deliver(ctx, listeningFileName(listening.title), JSON.stringify(listeningToFile(listening, media)), 'Ejercicio exportado.');
}

async function deliver(ctx, filename, text, doneMessage) {
  const result = await deliverFile(filename, text, { preview: ctx.preview });
  if (result === 'shared' || result === 'downloaded') toast(doneMessage, { tone: 'ok' });
  else if (result === 'unsupported') copySheet(filename, text);
}

/** Plan B cuando no se puede compartir ni descargar: copiar el contenido. */
function copySheet(filename, text) {
  openSheet({
    title: 'Copiar datos',
    build: () => {
      const area = h('textarea', { class: 'input input--mono', id: 'copy-area', rows: 8, readonly: true, value: text });
      const status = h('p', { class: 'field__hint', role: 'status' });
      const copy = async () => {
        try {
          await navigator.clipboard.writeText(text);
          status.textContent = 'Copiado. Pegalo en un archivo de texto y guardalo como .json.';
        } catch {
          area.focus();
          area.select();
          status.textContent = 'Seleccioné el texto: copialo con el menú del sistema.';
        }
      };
      return h(
        'div',
        { class: 'stack' },
        h('p', { class: 'muted' }, `En esta vista no se pueden descargar archivos. Copiá el contenido y guardalo como "${filename}".`),
        area,
        h('button', { class: 'btn btn--primary', type: 'button', onClick: copy }, icon('check', { size: 18 }), 'Copiar'),
        status,
      );
    },
  });
}
