// Prueba en navegador de la sección Práctica (iPad horizontal + celular).
//
//   node scripts/serve.mjs dist &
//   node tests/e2e-practice.mjs <carpeta-de-capturas> [archivo-de-mazos.json]
//
// Simula trazos con el mouse sobre la pizarra, responde preguntas, dictado y
// "¿qué escuchaste?". La voz y el reconocimiento no existen en el navegador de
// prueba: se verifica que la app avise y ofrezca las alternativas.

import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  try {
    return require('playwright');
  } catch {
    return require('/opt/npm-tools/node_modules/playwright');
  }
})();

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const OUT = process.argv[2] ?? 'test-results';
const DECKS = process.argv[3];
await mkdir(OUT, { recursive: true });
const problems = [];
const step = (m) => console.log(`  • ${m}`);
const shot = async (page, name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};

/** Dibuja con el mouse los trazos de referencia del carácter (o uno equivocado). */
async function drawStrokes(page, ch, { wrong = false } = {}) {
  const strokes = await page.evaluate(async (c) => {
    const block = (c.codePointAt(0) >> 8).toString(16).padStart(3, '0');
    const data = await (await fetch(`strokes/${block}.json`)).json();
    const svg = document.querySelector('.board');
    const ctm = svg.getScreenCTM();
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svg.appendChild(path);
    const out = data[c].map((d) => {
      path.setAttribute('d', d);
      const len = path.getTotalLength();
      return Array.from({ length: 16 }, (_, i) => {
        const p = path.getPointAtLength((len * i) / 15);
        const s = new DOMPoint(p.x, p.y).matrixTransform(ctm);
        return [s.x, s.y];
      });
    });
    path.remove();
    return out;
  }, ch);
  // Equivocado: empezar por el último trazo (orden incorrecto).
  const list = wrong ? [strokes.at(-1)] : strokes;
  for (const pts of list) {
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x + 1.5, y + 1, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  return strokes.length;
}

const browser = await chromium.launch();

// ─────────────────────────── iPad horizontal ───────────────────────────
console.log('iPad (1180×820)');
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, locale: 'es-AR', colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');

  let genki = null;
  if (DECKS) {
    step('importar mazos');
    await page.locator('.nav__item[data-tab="settings"]').click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar copia o mazo' }).click()]);
    await fc.setFiles(DECKS);
    await page.getByRole('button', { name: 'Combinar' }).click();
    await page.waitForSelector('.toast >> text=Sincronizado');
    genki = JSON.parse(await readFile(DECKS, 'utf8'));
  }

  step('hub de práctica');
  await page.locator('.nav__item[data-tab="practice"]').click();
  await page.waitForSelector('.practice-tile');
  assert.equal(await page.locator('.practice-tile').count(), 6);
  await shot(page, 'p01-ipad-practica');

  step('escritura: あ bien trazada');
  await page.getByRole('button', { name: /Escritura/ }).click();
  await page.waitForSelector('.char-grid');
  await shot(page, 'p02-ipad-escritura-grilla');
  await page.locator('.char-cell').first().click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(2600); // animación inicial
  await shot(page, 'p03-ipad-escritura-animacion');
  const n = await drawStrokes(page, 'あ');
  assert.equal(n, 3);
  await page.waitForSelector('.write__status--ok');
  await page.waitForSelector('.board__tick');
  assert.equal(await page.locator('.board__ink-stroke.is-right').count(), 3, 'los trazos bien hechos quedan en verde');
  await shot(page, 'p04-ipad-escritura-bien');

  step('escritura: pasa sola a い y trazo equivocado');
  await page.waitForFunction(() => document.querySelector('.write__char')?.textContent.includes('い'), null, { timeout: 4000 });
  await page.waitForTimeout(400);
  await drawStrokes(page, 'い', { wrong: true });
  await page.waitForFunction(() => /no coincide|dirección|después/.test(document.querySelector('.write__status')?.textContent ?? ''));
  await shot(page, 'p05-ipad-escritura-mal');
  await page.keyboard.press('Escape');

  if (genki) {
    step('escritura: kanji de un mazo (descarga otro bloque de trazos)');
    await page.locator('.set-chip', { hasText: 'L04 · Kanji' }).click();
    await page.locator('.char-cell', { hasText: '曜' }).click();
    await page.waitForSelector('.board');
    await page.waitForTimeout(400);
    await drawStrokes(page, '曜');
    await page.waitForSelector('.write__status--ok');
    await shot(page, 'p06-ipad-escritura-kanji');
    await page.keyboard.press('Escape');

    step('preguntas: generar desde un mazo y responder');
    await page.getByRole('button', { name: 'Práctica', exact: true }).first().click();
    await page.getByRole('button', { name: /Preguntas/ }).click();
    await page.getByRole('button', { name: 'Desde un mazo', exact: true }).click();
    await page.selectOption('#gen-deck', { label: 'Genki I · L03 · Vocabulario' });
    await page.getByRole('button', { name: 'Generar', exact: true }).click();
    await page.waitForSelector('.question-list');
    await shot(page, 'p07-ipad-cuestionario');
    await page.getByRole('button', { name: 'Practicar', exact: true }).click();
    await page.waitForSelector('.quiz__prompt');
    const prompt = await page.locator('.quiz__prompt').textContent();
    const meaning = prompt.match(/“(.+)”/)[1];
    const card = genki.cards.find((c) => c.back === meaning);
    await page.fill('#quiz-answer', card.pronunciation.split(' · ')[0]); // en romaji
    await page.keyboard.press('Enter');
    await page.waitForSelector('.feedback--ok');
    await shot(page, 'p08-ipad-pregunta-bien');
    await page.keyboard.press('Enter');
    await page.fill('#quiz-answer', 'zzz');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.feedback--bad');
    await shot(page, 'p09-ipad-pregunta-mal');
    await page.keyboard.press('Escape');

    step('¿qué escuchaste?');
    await page.locator('.nav__item[data-tab="practice"]').click();
    await page.getByRole('button', { name: /Qué escuchaste/ }).click();
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await page.waitForSelector('.option');
    await page.keyboard.press('1');
    await page.waitForSelector('.feedback');
    await shot(page, 'p11-ipad-significado');
    await page.keyboard.press('Escape');

    step('pronunciación: corrección con el dictado del teclado');
    await page.getByRole('button', { name: /Pronunciación/ }).click();
    const l7 = await page.$eval('#src-deck', (s) => [...s.options].find((o) => o.text.includes('L07 · Vocabulario')).value);
    await page.selectOption('#src-deck', l7);
    await page.selectOption('#src-count', '0');
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await page.waitForSelector('.word');
    const details = page.locator('.audio__more');
    if (!(await details.getAttribute('open'))) await details.locator('summary').click();
    await page.fill('#speak-typed', 'かぞく');
    await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await page.waitForSelector('.feedback--ok');
    await shot(page, 'p12-ipad-pronunciacion');
    await page.keyboard.press('Escape');
  }

  step('listening: ejemplos, completar, preguntas y dictado completo');
  await page.locator('.nav__item[data-tab="practice"]').click();
  await page.getByRole('button', { name: /Listening/ }).click();
  await page.getByRole('button', { name: 'Agregar ejemplos', exact: true }).click();
  await page.waitForSelector('.quiz-row');
  assert.equal(await page.locator('.quiz-row').count(), 3);
  await shot(page, 'p10-ipad-listening-lista');
  await page.locator('.quiz-row', { hasText: 'わたしの いちにち' }).getByRole('button', { name: 'Practicar' }).click();
  await page.waitForSelector('.cloze__input');
  const blanks = await page.locator('.cloze__input').count();
  assert.equal(blanks, 7);
  await page.fill('#cloze-1', 'okimasu');
  await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
  await page.waitForSelector('.cloze__input.is-right');
  await shot(page, 'p10b-ipad-listening-completar');
  await page.getByRole('tab', { name: 'Preguntas' }).click();
  await page.fill('#lq-0', 'shichiji');
  await page.fill('#lq-1', 'ともだち');
  await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
  await page.waitForSelector('.lq .feedback--ok');
  await shot(page, 'p10c-ipad-listening-preguntas');
  await page.getByRole('tab', { name: 'Dictado completo' }).click();
  await page.fill('#ld-text', 'わたしは まいにち しちじに おきます。あさごはんを たべて');
  await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
  await page.waitForSelector('.diff');
  await shot(page, 'p10d-ipad-listening-dictado');
  await page.keyboard.press('Escape');

  await ctx.close();
}

// ─────────────────────────── Celular ───────────────────────────
console.log('iPhone (390×844), oscuro');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-AR', colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');
  await page.locator('.nav__item[data-tab="practice"]').click();
  await page.waitForSelector('.practice-tile');
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.ok(sw <= iw, `desborde horizontal ${sw} > ${iw}`);
  await shot(page, 'p13-iphone-practica');
  await page.getByRole('button', { name: /Escritura/ }).click();
  await page.locator('.char-cell').nth(5).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(1500);
  await shot(page, 'p14-iphone-escritura');
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.error('\nProblemas en la consola:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\n✔ Práctica sin errores');
