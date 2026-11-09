// Prueba en navegador de los Cuadernos: crear, escribir, borrar, deshacer, stickers,
// cintas, imágenes, páginas nuevas, PDF importado y que todo quede guardado.
//
//   node scripts/serve.mjs dist &
//   node tests/e2e-notebooks.mjs <carpeta-de-capturas> <archivo.pdf> <imagen.png>

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
const [OUT = 'test-results', PDF, IMG] = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const step = (m) => console.log(`  • ${m}`);
const errors = [];
const shot = async (page, name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

async function draw(pageIndex, pts) {
  const box = await page.locator('.nb-page__svg').nth(pageIndex).boundingBox();
  const at = ([x, y]) => [box.x + (x / 1000) * box.width, box.y + (y / 1000) * box.width];
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) await page.mouse.move(...at(p), { steps: 6 });
  await page.mouse.up();
}
const inkCount = (i = 0) => page.locator('.nb-page').nth(i).locator('.nb-page__svg > g:nth-child(4) > *').count();
const tool = (label) => page.getByRole('button', { name: label, exact: true }).click();

await page.goto(BASE);
await page.getByRole('button', { name: 'Cuadernos' }).first().click();
step('pantalla de cuadernos');
await shot(page, 'nb-01-vacio');

await page.getByRole('button', { name: 'Nuevo cuaderno' }).click();
await page.fill('#nb-name', 'Japonés · clase');
await page.locator('label.paper-opt', { hasText: 'Genkō yōshi' }).click();
await shot(page, 'nb-02-nuevo');
await page.getByRole('button', { name: 'Crear cuaderno' }).click();
await page.waitForSelector('.nb-page');
step('editor abierto');

await tool('Lapicera');
await draw(0, [[120, 150], [300, 180], [420, 260], [500, 400]]);
await draw(0, [[150, 500], [600, 520]]);
assert.equal(await inkCount(), 2, 'dos trazos');
await tool('Resaltador');
await draw(0, [[100, 520], [700, 520]]);
assert.equal(await inkCount(), 3);
await tool('Deshacer');
assert.equal(await inkCount(), 2, 'deshacer');
await tool('Rehacer');
assert.equal(await inkCount(), 3, 'rehacer');
await tool('Goma');
await draw(0, [[300, 470], [300, 560]]);
assert.ok((await inkCount()) < 3, 'la goma borra');
step('lapicera, resaltador, deshacer y goma');

const afterErase = await inkCount();
await tool('Cinta');
await draw(0, [[600, 100], [900, 140]]);
assert.equal(await inkCount(), afterErase + 1, 'cinta');
await tool('Stickers');
await page.getByRole('button', { name: 'Corazón' }).click().catch(() => page.locator('.nb-sticker').nth(1).click());
await draw(0, [[800, 420], [800, 420]]);
const afterDeco = await inkCount();
assert.equal(afterDeco, afterErase + 2, 'sticker');
step('cinta y sticker');

if (IMG) {
  const chooser = page.waitForEvent('filechooser');
  await tool('Agregar imagen');
  await (await chooser).setFiles(IMG);
  await page.waitForSelector('.nb-page image');
  step('imagen agregada');
}
await shot(page, 'nb-03-editor');

// Entrada simulada como en el iPad: Pencil, dedos y gestos.
const ptr = (type, id, kind, x, y, extra = {}) => page.evaluate(([type, id, kind, x, y, extra]) => {
  const target = document.elementFromPoint(x, y);
  target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: kind, clientX: x, clientY: y, pressure: kind === 'pen' ? 0.7 : 0.5, bubbles: true, cancelable: true, isPrimary: id === 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...extra }));
}, [type, id, kind, x, y, extra]);
const svgBox = await page.locator('.nb-page__svg').first().boundingBox();
const P = (fx, fy) => [svgBox.x + svgBox.width * fx, svgBox.y + svgBox.width * fy];
await tool('Lapicera');
let before = await inkCount();
{
  const [x, y] = P(0.2, 0.62);
  await ptr('pointerdown', 7, 'pen', x, y);
  for (let i = 1; i <= 10; i++) await ptr('pointermove', 7, 'pen', x + i * 12, y + i * 4);
  await ptr('pointerup', 7, 'pen', x + 120, y + 40);
}
assert.equal(await inkCount(), before + 1, 'el Pencil escribe');
step('Apple Pencil (simulado) escribe');

// Un dedo desplaza (no escribe).
before = await inkCount();
const scrollTop0 = await page.locator('.nb-scroller').evaluate((el) => el.scrollTop);
{
  const [x, y] = P(0.5, 0.5);
  await ptr('pointerdown', 11, 'touch', x, y);
  for (let i = 1; i <= 6; i++) await ptr('pointermove', 11, 'touch', x, y - i * 30);
  await ptr('pointerup', 11, 'touch', x, y - 180);
}
await page.waitForTimeout(400);
assert.equal(await inkCount(), before, 'el dedo no escribe');
assert.ok((await page.locator('.nb-scroller').evaluate((el) => el.scrollTop)) > scrollTop0 + 100, 'el dedo desplaza');
step('un dedo desplaza la hoja');
await page.locator('.nb-scroller').evaluate((el) => (el.scrollTop = 0));

// Dos dedos tocan = deshacer.
{
  const [x, y] = P(0.4, 0.4);
  await ptr('pointerdown', 21, 'touch', x, y);
  await ptr('pointerdown', 22, 'touch', x + 80, y);
  await ptr('pointerup', 21, 'touch', x, y);
  await ptr('pointerup', 22, 'touch', x + 80, y);
}
assert.equal(await inkCount(), before - 1, 'dos dedos deshacen');
{
  const [x, y] = P(0.4, 0.4);
  for (const id of [31, 32, 33]) await ptr('pointerdown', id, 'touch', x + id, y);
  for (const id of [31, 32, 33]) await ptr('pointerup', id, 'touch', x + id, y);
}
assert.equal(await inkCount(), before, 'tres dedos rehacen');
step('toque con 2 dedos deshace, con 3 rehace');

// Pellizcar = zoom.
{
  const [x, y] = P(0.5, 0.3);
  await ptr('pointerdown', 41, 'touch', x - 50, y);
  await ptr('pointerdown', 42, 'touch', x + 50, y);
  for (let i = 1; i <= 8; i++) {
    await ptr('pointermove', 41, 'touch', x - 50 - i * 10, y);
    await ptr('pointermove', 42, 'touch', x + 50 + i * 10, y);
  }
  await ptr('pointerup', 41, 'touch', x - 130, y);
  await ptr('pointerup', 42, 'touch', x + 130, y);
}
const zoomText = await page.locator('.nb-zoom__label').textContent();
assert.ok(parseInt(zoomText, 10) >= 170, `pellizco agranda (${zoomText})`);
assert.equal(await inkCount(), before, 'pellizcar no escribe ni deshace');
step(`pellizco: zoom ${zoomText}`);
await page.getByRole('button', { name: 'Alejar' }).click();
for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Alejar' }).click();
for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Acercar' }).click();
assert.equal(await page.locator('.nb-zoom__label').textContent(), '100 %');
await page.locator('.nb-scroller').evaluate((el) => (el.scrollTop = 0));

// Rueda de colores.
await page.getByRole('button', { name: 'Rueda de colores' }).click();
await page.fill('.cw__hex', '#12a4b6');
await shot(page, 'nb-03b-rueda');
await page.getByRole('button', { name: 'Usar este color' }).click();
await page.waitForTimeout(300);
assert.equal(await page.locator('.nb-color.is-on').getAttribute('data-c'), '#12a4b6');
await draw(0, [[300, 160], [500, 190]]);
assert.equal(await page.locator('.nb-page').first().locator('.nb-page__svg > g:nth-child(4) > *').last().getAttribute('fill'), '#12a4b6');
step('rueda de colores');

// Sticker y cinta propios.
if (IMG) {
  await tool('Stickers');
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Agregar sticker' }).click();
  await (await chooser).setFiles(IMG);
  await page.waitForSelector('.nb-sticker__img');
  const imgs0 = await page.locator('.nb-page').first().locator('image').count();
  await draw(0, [[250, 300], [250, 300]]);
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.nb-page').first().locator('image').count(), imgs0 + 1, 'sticker propio');
  await tool('Cinta');
  chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Agregar diseño de cinta' }).click();
  await (await chooser).setFiles(IMG);
  await page.waitForSelector('.nb-tape__img');
  before = await inkCount();
  await draw(0, [[100, 200], [450, 230]]);
  await page.waitForTimeout(400);
  assert.equal(await inkCount(), before + 1, 'cinta propia');
  assert.ok(await page.locator('.nb-page').first().locator('pattern image[href^="blob:"]').count(), 'la cinta usa la imagen');
  step('sticker y cinta propios');
  await tool('Lapicera');
}
await shot(page, 'nb-03c-propios');

// Página nueva con otra hoja.
await page.getByRole('button', { name: 'Páginas', exact: true }).click();
await page.locator('label.paper-opt', { hasText: 'Cornell' }).click();
await page.getByRole('button', { name: 'Agregar al final' }).click();
await page.waitForTimeout(300);
assert.equal(await page.locator('.nb-page').count(), 2);
step('página nueva');
await page.waitForTimeout(800);

// Guardado: al volver a abrir, todo sigue.
const saved = await inkCount();
await page.reload();
await page.getByRole('button', { name: 'Cuadernos' }).first().click();
await page.getByRole('button', { name: /^Abrir Japonés/ }).click();
await page.waitForTimeout(800);
assert.equal(await inkCount(), saved, 'quedó guardado');
assert.equal(await page.locator('.nb-page').count(), 2);
step('persiste al recargar');
// Gesto "atrás" (Android / Safari): cierra el cuaderno.
await page.goBack();
await page.waitForTimeout(300);
assert.equal(await page.locator('.nb-layer').count(), 0, 'atrás cierra el cuaderno');
step('gesto atrás cierra el cuaderno');
await shot(page, 'nb-04-lista');

if (PDF) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar PDF' }).click();
  await (await chooser).setFiles(PDF);
  await page.waitForSelector('.nb-page__pdf:not([hidden])', { timeout: 20000 }).catch(async (e) => { console.log(errors); await shot(page, 'debug-pdf'); throw e; });
  await tool('Lapicera');
  await draw(0, [[100, 100], [400, 300]]);
  assert.equal(await inkCount(), 1);
  step('PDF importado y anotado');
  await shot(page, 'nb-05-pdf');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
}

// Celular
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: /^Abrir Japonés/ }).click();
await page.waitForTimeout(500);
await shot(page, 'nb-06-celular');
await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
await shot(page, 'nb-07-celular-lista');
// Las tapas no se pisan (nombre largo).
await page.setViewportSize({ width: 1180, height: 820 });
const covers = await page.locator('.nb-cover').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); const t = e.closest('li').getBoundingClientRect(); return [r.right <= t.right + 1 && r.width > 50, r.left, r.right, t.left, t.right]; }));
console.log(covers);
assert.ok(covers.every((c) => c[0]), 'las tapas entran en su lugar');
await shot(page, 'nb-08-lista-ipad');

await browser.close();
if (errors.length) {
  console.log('Errores en la página:', errors);
  process.exit(1);
}
console.log('✔ cuadernos OK');
