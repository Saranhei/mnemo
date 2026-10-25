// Prueba en navegador de listas de kanji, escritura con letra propia, Kanji de memoria
// y Diccionario.
//
//   node scripts/serve.mjs dist &
//   node tests/e2e-kanji.mjs <carpeta-de-capturas> [listas-de-kanji.json]

import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
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
const LISTS = process.argv[3];
await mkdir(OUT, { recursive: true });
const problems = [];
const step = (m) => console.log(`  • ${m}`);
const shot = async (page, name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};

/**
 * Dibuja el carácter "a mano": más chico, corrido, un poco girado y con temblor
 * (como escribe una persona, no como el modelo).
 */
async function drawByHand(page, ch, { scale = 0.62, dx = 14, dy = -8, rot = 0.07, wobble = 1.2 } = {}) {
  const strokes = await page.evaluate(
    async ({ c, scale, dx, dy, rot, wobble }) => {
      const block = (c.codePointAt(0) >> 8).toString(16).padStart(3, '0');
      const data = await (await fetch(`strokes/${block}.json`)).json();
      const svg = document.querySelector('.board');
      const ctm = svg.getScreenCTM();
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
      const out = data[c].map((d) => {
        path.setAttribute('d', d);
        const len = path.getTotalLength();
        return Array.from({ length: 18 }, (_, i) => {
          const p = path.getPointAtLength((len * i) / 17);
          const x = p.x - 54.5;
          const y = p.y - 54.5;
          const gx = 54.5 + scale * (Math.cos(rot) * x - Math.sin(rot) * y) + dx + rand() * wobble;
          const gy = 54.5 + scale * (Math.sin(rot) * x + Math.cos(rot) * y) + dy + rand() * wobble;
          const s = new DOMPoint(gx, gy).matrixTransform(ctm);
          return [s.x, s.y];
        });
      });
      path.remove();
      return out;
    },
    { c: ch, scale, dx, dy, rot, wobble },
  );
  for (const pts of strokes) {
    await page.mouse.move(pts[0][0], pts[0][1]);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(50);
  }
  return strokes.length;
}

const browser = await chromium.launch();

console.log('iPad (1180×820)');
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true, locale: 'es-AR', colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');

  if (LISTS) {
    step('importar listas de kanji');
    await page.locator('.nav__item[data-tab="settings"]').click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar copia o mazo' }).click()]);
    await fc.setFiles(LISTS);
    await page.waitForSelector('text=listas de kanji');
    await page.getByRole('button', { name: 'Combinar' }).click();
    await page.waitForSelector('.toast >> text=Sincronizado');
  }

  step('escritura: nueva lista y agregar kanji');
  await page.locator('.nav__item[data-tab="practice"]').click();
  await page.getByRole('button', { name: /Escritura/ }).click();
  await page.getByRole('button', { name: 'Nueva lista' }).click();
  await page.fill('#kl-name', 'Mis kanji');
  await page.fill('#kl-chars', '今日は日本語を勉強します');
  await page.waitForSelector('text=6 kanji');
  await page.getByRole('button', { name: 'Crear lista' }).click();
  await page.waitForSelector('.set-chip.is-on >> text=Mis kanji');
  assert.equal(await page.locator('.char-cell').count(), 6);
  await page.locator('#list-add').click();
  await page.fill('#kl-add', '猫 日');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.waitForSelector('.toast >> text=1 kanji nuevo');
  assert.equal(await page.locator('.char-cell').count(), 7);
  await shot(page, 'k01-ipad-mis-kanji');

  step('escritura: 日 chico, corrido y torcido igual vale');
  await page.locator('.char-cell', { hasText: '日' }).click();
  await page.waitForSelector('.board');
  await page.waitForTimeout(400);
  await drawByHand(page, '日');
  await page.waitForSelector('.write__status--ok, .write__status--warn');
  await shot(page, 'k02-ipad-escritura-a-mano');
  await page.keyboard.press('Escape');

  step('kanji de memoria');
  await page.getByRole('button', { name: 'Práctica', exact: true }).first().click();
  await page.getByRole('button', { name: /Kanji de memoria/ }).click();
  if (LISTS) await page.selectOption('#recall-src', { label: 'Genki I · L03 · Kanji (15)' });
  await page.selectOption('#recall-order', 'list');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await page.waitForSelector('.board');
  await page.waitForFunction(() => document.querySelector('.recall__meaning')?.textContent !== '…');
  await shot(page, 'k03-ipad-memoria-pregunta');
  const first = await page.locator('.recall__answer').textContent();
  await drawByHand(page, first.trim(), { scale: 0.75, dx: -6, dy: 10, rot: -0.08 });
  await page.waitForSelector('.recall-stamp');
  await shot(page, 'k04-ipad-memoria-sello');
  await page.waitForFunction((ch) => document.querySelector('.recall__answer')?.textContent.trim() !== ch, first.trim(), { timeout: 4000 });
  await page.waitForSelector('.board');
  step('kanji de memoria: no me acuerdo → se muestra y se copia');
  const second = (await page.locator('.recall__answer').textContent()).trim();
  await page.waitForFunction(() => document.querySelector('.recall__meaning')?.textContent !== '…');
  await page.locator('#recall-reveal').click();
  await page.waitForTimeout(1600);
  await drawByHand(page, second, { scale: 1, dx: 0, dy: 0, rot: 0 });
  await page.waitForSelector('.recall-stamp--helped');
  await shot(page, 'k05-ipad-memoria-ayuda');
  await page.keyboard.press('Escape');

  step('diccionario: buscar por significado y por romaji');
  await page.locator('.nav__item[data-tab="dictionary"]').click();
  await page.waitForSelector('#dict-q');
  await page.fill('#dict-q', 'comer');
  await page.waitForSelector('.dict-word >> text=食べる', { timeout: 15000 });
  await shot(page, 'k06-ipad-diccionario-comer');
  await page.fill('#dict-q', 'nihongo');
  await page.waitForSelector('.dict-word >> text=日本語');
  await page.fill('#dict-q', '日本');
  await page.waitForSelector('.dict-kanji__card');
  assert.equal(await page.locator('.dict-kanji__card').count(), 2);
  await shot(page, 'k07-ipad-diccionario-kanji');

  step('diccionario: palabra → tarjeta en un mazo');
  await page.locator('.dict-word', { hasText: '日本' }).first().click();
  await page.waitForSelector('.dict-detail__word');
  await shot(page, 'k08-ipad-palabra');
  await page.getByRole('button', { name: 'Agregar a un mazo' }).click();
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await page.waitForSelector('.toast >> text=agregada');

  step('diccionario: kanji → mis kanji');
  await page.fill('#dict-q', '学校');
  await page.waitForSelector('.dict-kanji__card >> text=校');
  await page.locator('.dict-kanji__card', { hasText: '校' }).click();
  await page.waitForSelector('.dict-kanji-detail__ch');
  await page.waitForSelector('.dict-examples__word');
  await shot(page, 'k09-ipad-kanji-detalle');
  await page.locator('#dict-add-kanji').click();
  await page.locator('.pick-list__item', { hasText: 'Mis kanji' }).click();
  await page.waitForSelector('.toast >> text=Agregado a "Mis kanji"');
  await ctx.close();
}

console.log('iPhone (390×844), oscuro');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-AR', colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');
  assert.equal(await page.locator('.nav__item').count(), 6);
  await page.locator('.nav__item[data-tab="dictionary"]').click();
  await page.fill('#dict-q', 'gato');
  await page.waitForSelector('.dict-word >> text=猫', { timeout: 15000 });
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  assert.ok(sw <= iw, `desborde horizontal ${sw} > ${iw}`);
  await shot(page, 'k10-iphone-diccionario');
  await page.locator('.dict-word', { hasText: '猫' }).first().click();
  await page.waitForSelector('.dict-detail__word');
  await shot(page, 'k11-iphone-palabra');
  await ctx.close();
}

await browser.close();
if (problems.length) {
  console.error('\nProblemas en la consola:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\n✔ Kanji y diccionario sin errores');
