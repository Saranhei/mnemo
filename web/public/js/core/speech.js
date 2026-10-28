// Corrección de lo que reconoce el micrófono al practicar pronunciación.
//
// El reconocimiento de voz escribe lo que cree que dijiste, y en japonés hay muchas
// palabras que suenan igual: si decís ほん bien, puede escribir 本, ホン, 翻 o 盆. Además,
// a quien está aprendiendo le suele salir la ん final suave ("hô(n)") o una vocal un
// poco larga. Por eso se acepta:
//   1. lo mismo que al escribir (kana, kanji o romaji de la tarjeta),
//   2. otra palabra que se LEE igual (con el diccionario),
//   3. la misma pronunciación con vocales largas/cortas mezcladas (ほおん = ほん),
// y "casi" cuando difiere en un solo sonido (ほ en vez de ほん): cuenta como bien, pero
// se avisa qué sonido marcar más.

import { matchesAnswer, japaneseKey, romajiOfKana, kataToHira } from './japanese.js';

const SMALL = { ゃ: 'ya', ゅ: 'yu', ょ: 'yo', ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o' };

/**
 * Sonidos en romaji simple, para comparar pronunciaciones: きょう → "kyo".
 * Devuelve "" si el texto no es solo kana (por ejemplo, si tiene kanji).
 */
export function soundKey(text) {
  const kana = japaneseKey(text);
  if (!/^[ぁ-ゖー]+$/.test(kana)) return '';
  let out = '';
  for (const ch of kana) {
    if (SMALL[ch]) {
      // き + ょ → kyo; ふ + ぁ → fa (se reemplaza la vocal de la sílaba anterior)
      out = out.replace(SMALL[ch].startsWith('y') ? /i$/ : /[aeiou]$/, '') + SMALL[ch];
      continue;
    }
    if (ch === 'っ') {
      out += '·'; // pausa: se ignora más abajo
      continue;
    }
    if (ch === 'ん') {
      out += 'N';
      continue;
    }
    out += romajiOfKana(ch) || (ch === 'ー' ? '' : romajiOfKana(kataToHira(ch)));
  }
  return out
    .replace(/·/g, '')
    .replace(/([aeiou])\1+/g, '$1') // vocales largas = cortas
    .replace(/ou/g, 'o')
    .replace(/ei/g, 'e');
}

function editDistance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * @param {string[]} alternatives lo que entendió el reconocimiento (mejor primero).
 * @param {string[]} accepted formas válidas de la palabra (kana, kanji, romaji).
 * @param {{readingsOf?: (text: string) => string[]}} [opts] lecturas en kana de lo
 *   reconocido (por ejemplo, del diccionario: 翻 → ["ほん"]).
 * @returns {{ok: boolean, near: boolean, heard: string, reading: string}}
 */
export function judgeSpoken(alternatives, accepted, { readingsOf = () => [] } = {}) {
  const heardList = alternatives.map((a) => String(a ?? '').trim()).filter(Boolean);
  if (heardList.length === 0) return { ok: false, near: false, heard: '', reading: '' };
  const targets = accepted.map(soundKey).filter(Boolean);

  // 1) Igual que al escribir.
  for (const heard of heardList) if (matchesAnswer(heard, accepted)) return { ok: true, near: false, heard, reading: '' };

  // 2 y 3) Por cómo suena (lo reconocido o su lectura según el diccionario).
  const sounding = heardList.flatMap((heard) => [heard, ...readingsOf(heard)].map((form) => ({ heard, form, key: soundKey(form) })));
  for (const s of sounding) {
    if (s.key && targets.includes(s.key)) return { ok: true, near: false, heard: s.heard, reading: s.form !== s.heard ? s.form : '' };
  }

  // "Casi": un solo sonido distinto (palabras de 2 sílabas o más).
  for (const s of sounding) {
    if (!s.key) continue;
    for (const t of targets) {
      if (t.length >= 3 && editDistance(s.key, t) === 1) return { ok: true, near: true, heard: s.heard, reading: s.form !== s.heard ? s.form : '' };
    }
  }
  return { ok: false, near: false, heard: heardList[0], reading: '' };
}
