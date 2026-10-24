// Flujos de importar, exportar y sincronizar (con sus mensajes al usuario).

import { h, icon, plural } from './dom.js';
import { openSheet, confirmAction, toast } from './overlays.js';
import * as store from '../data/store.js';
import { parseImport, deckToExport, stateToBackup, deckFileName, backupFileName, TransferError, LIMITS } from '../core/transfer.js';
import { live } from '../core/model.js';
import { deliverFile, pickFile } from '../services/device.js';

const ACCEPT = '.json,.txt,.tsv,application/json,text/plain,text/tab-separated-values';

/** Importa un mazo (Mnemo o Anki) o una copia completa. Devuelve el id del mazo si se creó uno. */
export async function importFlow(ctx) {
  const file = await pickFile(ACCEPT);
  if (!file) return null;
  try {
    if (file.size > LIMITS.backupFileBytes) throw new TransferError('tooLarge', 'El archivo es demasiado grande.');
    const result = parseImport(file.text, file.name, file.size);

    if (result.kind === 'deck') {
      const id = store.importDeck(result.deck);
      toast(`Importado "${result.deck.name}": ${plural(result.deck.cards.length, 'tarjeta', 'tarjetas')}.`, { tone: 'ok' });
      return id;
    }

    const s = result.state;
    const ok = await confirmAction({
      title: 'Combinar copia',
      message: `La copia trae ${plural(live(s.decks).length, 'mazo', 'mazos')}, ${plural(live(s.cards).length, 'tarjeta', 'tarjetas')} y ${plural(live(s.sessions).length, 'sesión', 'sesiones')}. Se suma a lo que ya tenés: de cada tarjeta queda la versión más reciente. No se pierde nada de este dispositivo que sea más nuevo.`,
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

export async function exportDeckFlow(ctx, deckId) {
  const exp = deckToExport(store.getState(), deckId);
  await deliver(ctx, deckFileName(exp.name), JSON.stringify(exp, null, 2), 'Mazo exportado.');
}

export async function exportBackupFlow(ctx) {
  const now = Date.now();
  const backup = stateToBackup(store.getState(), now);
  await deliver(ctx, backupFileName(now), JSON.stringify(backup), 'Copia lista. Abrila en el otro dispositivo con "Importar".');
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
