// Guardado en el dispositivo.
//
// Usa IndexedDB (la base de datos del navegador, con mucha más capacidad que
// localStorage). Si no está disponible (modo privado, navegador viejo) cae a
// localStorage, y si tampoco, a memoria (avisando al usuario que no se guarda).
// Nada sale del dispositivo: no hay servidor.

const DB_NAME = 'mnemo';
const STORE = 'kv';
const STATE_KEY = 'state';
const LS_KEY = 'mnemo.state';

/** @type {'indexeddb' | 'localstorage' | 'memory'} */
let mode = 'memory';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('IndexedDB no disponible'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
  });
  return dbPromise;
}

function idbRequest(mode_, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode_);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

/** Devuelve el estado guardado, o `null` si es la primera vez. */
export async function loadState() {
  try {
    const value = await idbRequest('readonly', (s) => s.get(STATE_KEY));
    mode = 'indexeddb';
    if (value) return value;
    // Migración: si antes se guardó en localStorage, se recupera de ahí.
    return readLocalStorage();
  } catch {
    const ls = readLocalStorage();
    mode = canUseLocalStorage() ? 'localstorage' : 'memory';
    return ls;
  }
}

export async function saveState(state) {
  if (mode === 'indexeddb') {
    try {
      await idbRequest('readwrite', (s) => s.put(state, STATE_KEY));
      return true;
    } catch {
      mode = canUseLocalStorage() ? 'localstorage' : 'memory';
    }
  }
  if (mode === 'localstorage') {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch {
      mode = 'memory';
    }
  }
  return false;
}

export async function clearAll() {
  try {
    await idbRequest('readwrite', (s) => s.delete(STATE_KEY));
  } catch {
    /* sin IndexedDB no hay nada que borrar ahí */
  }
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* idem */
  }
}

export const storageMode = () => mode;

/**
 * Pide al navegador que no borre los datos cuando le falte espacio.
 * En iPhone/iPad, una app agregada a la pantalla de inicio ya los conserva.
 */
export async function requestPersistence() {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate() {
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

function readLocalStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function canUseLocalStorage() {
  try {
    const k = 'mnemo.__test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// ─────────── Preferencias simples (de cada dispositivo, no se sincronizan) ───────────

export function readPref(key, fallback) {
  try {
    const raw = localStorage.getItem(`mnemo.pref.${key}`);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    localStorage.setItem(`mnemo.pref.${key}`, JSON.stringify(value));
  } catch {
    /* preferencia no guardada: no es crítico */
  }
}
