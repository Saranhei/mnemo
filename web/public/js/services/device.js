// Funciones del dispositivo: voz, sonido, pantalla encendida y archivos.
// Todas fallan en silencio si el navegador no las soporta: la app sigue funcionando.

// ─────────────────────────── Pronunciación ───────────────────────────

export const canSpeak = () => 'speechSynthesis' in globalThis;

/** Lee la palabra con una voz del sistema del idioma del mazo (sin internet). */
export function speak(text, languageCode) {
  if (!canSpeak() || !text) return;
  const synth = globalThis.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = languageCode;
  const prefix = languageCode.toLowerCase().split('-')[0];
  const voice =
    synth.getVoices().find((v) => v.lang.toLowerCase() === languageCode.toLowerCase()) ??
    synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(prefix));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  synth.speak(u);
}

// ─────────────────────────────── Sonido ───────────────────────────────
// Campanita generada con Web Audio (sin archivos). iOS exige "desbloquear" el
// audio con un toque del usuario: se hace al apretar Empezar en el Pomodoro.

let audioCtx = null;

export function unlockAudio() {
  try {
    audioCtx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

export function chime() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [880, 1318.5, 1760].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = t0 + i * 0.18;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + 1);
  });
  navigator.vibrate?.([120, 80, 120]);
}

// ─────────────────────── Pantalla siempre encendida ───────────────────────
// En el celular, si la pantalla se apaga el navegador congela la app y el aviso
// del Pomodoro no suena. Mantenerla encendida mientras corre lo evita.

let wakeLock = null;

export async function keepScreenOn(on) {
  try {
    if (on && !wakeLock && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

export const canKeepScreenOn = () => 'wakeLock' in navigator;

// ─────────────────────────────── Archivos ───────────────────────────────

/**
 * Entrega un archivo al usuario:
 * 1. Hoja de compartir del sistema (AirDrop, Archivos, Mail…) si está disponible.
 * 2. Si no, descarga.
 * @returns {Promise<'shared' | 'downloaded' | 'cancelled' | 'unsupported'>}
 */
export async function deliverFile(filename, text, { preview = false } = {}) {
  if (preview) return 'unsupported';
  const file = new File([text], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Otros errores: se intenta la descarga.
    }
  }
  try {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename, rel: 'noopener' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'unsupported';
  }
}

/**
 * Abre el selector de archivos y devuelve { name, size, type, text?, file } o null si se canceló.
 * Con `asText: false` no lee el contenido (para audio y video).
 */
export function pickFile(accept, { maxBytes = 90 * 1024 * 1024, asText = true } = {}) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const info = { name: file.name, size: file.size, type: file.type, file, text: '' };
      // El tamaño se controla ANTES de leer, para no cargar archivos gigantes en memoria.
      if (!asText || file.size > maxBytes) return resolve(info);
      resolve({ ...info, text: await file.text() });
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
