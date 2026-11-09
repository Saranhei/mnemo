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

// Página nueva con otra hoja.
await page.getByRole('button', { name: 'Páginas', exact: true }).click();
await page.locator('label.paper-opt', { hasText: 'Cornell' }).click();
await page.getByRole('button', { name: 'Agregar al final' }).click();
await page.waitForTimeout(300);
assert.equal(await page.locator('.nb-page').count(), 2);
step('página nueva');
await page.waitForTimeout(800);

// Guardado: al volver a abrir, todo sigue.
await page.reload();
await page.getByRole('button', { name: 'Cuadernos' }).first().click();
await page.getByRole('button', { name: /^Abrir Japonés/ }).click();
await page.waitForTimeout(800);
assert.equal(await inkCount(), afterDeco, 'quedó guardado');
assert.equal(await page.locator('.nb-page').count(), 2);
step('persiste al recargar');
await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
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

await browser.close();
if (errors.length) {
  console.log('Errores en la página:', errors);
  process.exit(1);
}
console.log('✔ cuadernos OK');
