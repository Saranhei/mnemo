// Voz: japonés hablado (síntesis), reconocimiento de voz y grabación.
//
// Privacidad: el reconocimiento de voz lo hace el navegador (Apple o Google) y
// puede enviar el audio a sus servidores. La grabación de "grabarme y comparar"
// queda solo en la memoria del dispositivo y se descarta al salir.

// ───────────────────────────── Síntesis ─────────────────────────────

export function japaneseVoice() {
  if (!('speechSynthesis' in globalThis)) return null;
  const voices = speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'ja-JP' && v.localService) ?? voices.find((v) => v.lang.replace('_', '-').startsWith('ja')) ?? null;
}

/** Las voces se cargan de forma asíncrona en algunos navegadores. */
export function voicesReady(timeout = 1500) {
  if (!('speechSynthesis' in globalThis)) return Promise.resolve(false);
  if (speechSynthesis.getVoices().length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices().length > 0);
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeout);
  });
}

/** Lee texto en japonés. Devuelve una promesa que termina al terminar de hablar. */
export function sayJapanese(text, { rate = 0.9 } = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in globalThis) || !text) return resolve(false);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    const voice = japaneseVoice();
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
  });
}

// ───────────────────────────── Reconocimiento ─────────────────────────────

const Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;

export const canRecognize = () => Boolean(Recognition);

/**
 * Escucha una frase en japonés.
 * @returns {Promise<{alternatives: string[]} | {error: string}>}
 */
export function listenOnce({ timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    if (!Recognition) return resolve({ error: 'unsupported' });
    const rec = new Recognition();
    rec.lang = 'ja-JP';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        rec.abort();
      } catch {
        /* ya estaba detenido */
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish({ error: 'no-speech' }), timeout);
    rec.onresult = (e) => {
      const result = e.results[0];
      const alternatives = Array.from({ length: result.length }, (_, i) => result[i].transcript);
      finish({ alternatives });
    };
    rec.onerror = (e) => finish({ error: e.error || 'error' });
    rec.onend = () => finish({ error: 'no-speech' });
    try {
      rec.start();
    } catch {
      finish({ error: 'error' });
    }
  });
}

export function recognitionErrorMessage(code) {
  return (
    {
      'not-allowed': 'No hay permiso para usar el micrófono. Activalo en los ajustes del navegador.',
      'service-not-allowed': 'El reconocimiento de voz está desactivado. En iPhone/iPad: Ajustes → General → Teclado → Activar dictado.',
      'no-speech': 'No te escuché. Probá de nuevo, un poco más cerca del micrófono.',
      network: 'El reconocimiento de voz necesita internet.',
      'audio-capture': 'No encontré un micrófono.',
      unsupported: 'Este navegador no reconoce voz.',
    }[code] ?? 'No se pudo usar el reconocimiento de voz.'
  );
}

// ───────────────────────────── Grabación ─────────────────────────────

export const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);

/**
 * Empieza a grabar. Devuelve un objeto con stop(): Promise<string> (URL del audio).
 * El audio nunca sale del dispositivo.
 */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.addEventListener('dataavailable', (e) => e.data.size && chunks.push(e.data));
  recorder.start();
  return {
    stop: () =>
      new Promise((resolve) => {
        recorder.addEventListener(
          'stop',
          () => {
            stream.getTracks().forEach((t) => t.stop());
            resolve(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' })));
          },
          { once: true },
        );
        recorder.stop();
      }),
  };
}

/** ¿La app está abierta como app instalada (pantalla de inicio)? */
export const isInstalledApp = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
