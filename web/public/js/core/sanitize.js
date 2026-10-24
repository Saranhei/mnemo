// Limpieza de todo texto que entra a la app (formularios e importaciones).
//
// Por qué: los archivos importados son datos no confiables. Limitar largos evita
// archivos que agoten memoria o el almacenamiento, y quitar caracteres de control
// evita texto invisible o que altere la dirección del texto en pantalla.
// La app nunca interpreta texto como HTML: siempre se inserta con textContent.

export const MAX_FIELD = 1000;
export const MAX_NAME = 100;

// Caracteres de control (salvo \n), marcas de sobreescritura/aislamiento bidireccional
// y BOM. Se conservan ZWJ/ZWNJ (U+200C/D), necesarios en emojis, persa, hindi, etc.
const UNSAFE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]/g;

/** Recorta espacios, quita caracteres peligrosos y limita el largo (en caracteres, no bytes). */
export function clean(text, max = MAX_FIELD) {
  if (typeof text !== 'string') return '';
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(UNSAFE, '')
    .trim();
  return truncate(normalized, max);
}

/** Corta sin partir un emoji o carácter fuera del plano básico en dos. */
export function truncate(text, max) {
  if (text.length <= max) return text;
  return Array.from(text).slice(0, max).join('').trimEnd();
}

/** Quita etiquetas HTML simples de las exportaciones de Anki (`<b>`, `<br>`, etc.). */
export function stripHTML(text) {
  return String(text)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]{1,200}>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Identificadores aceptados en archivos importados. */
export function isValidId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** Número finito dentro de un rango; si no, el valor por defecto. */
export function clampNumber(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Fecha en milisegundos entre 2000 y 2100; si no, el valor por defecto. */
export function clampDate(value, fallback) {
  return clampNumber(value, 946684800000, 4102444800000, fallback);
}

/** Nombre de archivo sin caracteres de ruta ni símbolos. */
export function fileSafeName(name) {
  const filtered = String(name)
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .trim()
    .replace(/\s+/g, ' ');
  return filtered ? truncate(filtered, 60) : 'mazo';
}
