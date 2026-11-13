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
const pagesBefore = await page.locator('.nb-page').count();
await page.getByRole('button', { name: 'Opciones de la página' }).click();
await page.locator('label.paper-opt', { hasText: 'Cornell' }).click();
await page.getByRole('button', { name: 'Agregar al final' }).click();
await page.waitForTimeout(300);
assert.equal(await page.locator('.nb-page').count(), pagesBefore + 1);
step('página nueva');
await page.waitForTimeout(800);

// Guardado: al volver a abrir, todo sigue.
const saved = await inkCount();
await page.reload();
await page.getByRole('button', { name: 'Cuadernos' }).first().click();
await page.getByRole('button', { name: /^Abrir Japonés/ }).click();
await page.waitForTimeout(800);
assert.equal(await inkCount(), saved, 'quedó guardado');
assert.equal(await page.locator('.nb-page').count(), pagesBefore + 1);
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

// Hoja nueva al llegar al final: en el PDF, rayada; en un cuaderno, con la misma plantilla.
const toEnd = async () => {
  await page.locator('.nb-scroller').evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(300);
  await page.mouse.move(600, 500);
  await page.mouse.wheel(0, 300); // seguir "bajando" cuando ya no hay más
  await page.waitForTimeout(700);
};
if (PDF) {
  await page.getByRole('button', { name: /^Abrir An Integrated/ }).click();
  await page.waitForTimeout(1300);
  const n0 = await page.locator('.nb-page').count();
  await toEnd();
  assert.equal(await page.locator('.nb-page').count(), n0 + 1, 'al final del PDF se agrega una hoja');
  assert.ok((await page.locator('.nb-page').last().locator('.nb-page__svg > g:nth-child(2) > line').count()) > 10, 'la hoja nueva es rayada');
  await toEnd();
  assert.equal(await page.locator('.nb-page').count(), n0 + 1, 'no se apilan hojas vacías');
  step('final del PDF: hoja rayada nueva, sin apilar vacías');
  // Tirar con el dedo estando al final: agrega otra aunque la última esté vacía.
  await page.waitForTimeout(400);
  {
    const x = 600;
    const y = 600;
    await ptr('pointerdown', 61, 'touch', x, y);
    for (let i = 1; i <= 10; i++) await ptr('pointermove', 61, 'touch', x, y - i * 20);
    await ptr('pointerup', 61, 'touch', x, y - 200);
  }
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.nb-page').count(), n0 + 2, 'tirar al final agrega una hoja');
  step('tirar con el dedo al final agrega otra hoja');
  // Ir a una página por número.
  await page.getByRole('button', { name: /^Ver páginas/ }).click();
  await page.fill('#nb-goto', '3');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  assert.match(await page.locator('.nb-pill').textContent(), /^3 \//, 'fue a la página 3');
  const top = await page.locator('.nb-page').nth(2).evaluate((el) => Math.round(el.getBoundingClientRect().top - el.closest('.nb-scroller').getBoundingClientRect().top));
  assert.ok(Math.abs(top) < 40, `la página 3 queda arriba (${top})`);
  await page.fill('#nb-goto', '999');
  await page.getByRole('button', { name: 'Ir', exact: true }).click();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.nb-pill').textContent(), /^(\d+) \/ \1$/, 'un número de más lleva a la última');
  await page.getByRole('button', { name: 'Páginas y marcadores' }).click();
  step('ir a la página N');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
}
await page.getByRole('button', { name: /^Abrir Japonés/ }).click();
await page.waitForTimeout(1300);
{
  const n0 = await page.locator('.nb-page').count();
  // La última es Cornell: se escribe y se baja hasta el final.
  await page.locator('.nb-page').last().evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  await tool('Lapicera');
  await draw(n0 - 1, [[200, 100], [400, 120]]);
  assert.equal(await inkCount(n0 - 1), 1);
  await toEnd();
  assert.equal(await page.locator('.nb-page').count(), n0 + 1, 'hoja nueva al final');
  assert.ok(await page.locator('.nb-page').last().locator('text').count(), 'misma plantilla (Cornell, con sus títulos)');
  step('final del cuaderno: hoja nueva con la misma plantilla');
}
await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

// Plantilla desde una imagen.
if (IMG) {
  await page.getByRole('button', { name: 'Nuevo cuaderno' }).click();
  await page.fill('#nb-name', 'Con plantilla');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Desde imagen' }).click();
  await (await chooser).setFiles(IMG);
  await page.waitForSelector('.paper-opt__img');
  await page.getByRole('button', { name: 'Crear cuaderno' }).click();
  await page.waitForSelector('.nb-page');
  await page.waitForTimeout(600);
  assert.ok(await page.locator('.nb-page').first().locator('g > image[href^="blob:"]').count(), 'la hoja usa la imagen');
  const ratio = await page.locator('.nb-page').first().evaluate((el) => el.clientHeight / el.clientWidth);
  assert.ok(Math.abs(ratio - 500 / 800) < 0.02, `toma la proporción de la imagen (${ratio})`);
  await shot(page, 'nb-05b-plantilla-imagen');
  step('plantilla desde una imagen');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  assert.ok(await page.locator('.nb-cover .nb-thumb').count(), 'tapa con la imagen');
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
assert.ok(covers.every((c) => c[0]), 'las tapas entran en su lugar');
await shot(page, 'nb-08-lista-ipad');

// ─── Pantalla táctil (como iPad/Android): toques medidos con eventos táctiles ───
{
  const tctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push(e.message));
  await tp.goto(BASE);
  await tp.getByRole('button', { name: 'Cuadernos' }).first().click();
  await tp.getByRole('button', { name: 'Nuevo cuaderno' }).click();
  await tp.getByRole('button', { name: 'Crear cuaderno' }).click();
  await tp.waitForSelector('.nb-page');
  await tp.waitForTimeout(500);
  const ink = () => tp.locator('.nb-page').first().locator('.nb-page__svg > g:nth-child(4) > *').count();
  const box = await tp.locator('.nb-page__svg').first().boundingBox();
  const pen = async (x, y) => tp.evaluate(([x, y]) => {
    const fire = (type, cx, cy) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent(type, { pointerId: 5, pointerType: 'pen', clientX: cx, clientY: cy, pressure: 0.6, bubbles: true, cancelable: true, buttons: 1 }));
    fire('pointerdown', x, y);
    for (let i = 1; i < 8; i++) fire('pointermove', x + i * 10, y + i * 3);
    fire('pointerup', x + 80, y + 24);
  }, [x, y]);
  // Toque con N dedos: Pointer Events + Touch Events, como manda Safari.
  const fingers = (pts) => tp.evaluate((pts) => {
    const target = document.elementFromPoint(pts[0][0], pts[0][1]);
    const touches = pts.map(([x, y], i) => new Touch({ identifier: 100 + i, target, clientX: x, clientY: y }));
    pts.forEach(([x, y], i) => {
      target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 100 + i, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: 1 }));
      target.dispatchEvent(new TouchEvent('touchstart', { touches: touches.slice(0, i + 1), changedTouches: [touches[i]], bubbles: true, cancelable: true }));
    });
    pts.forEach(([x, y], i) => {
      // iOS a veces cancela los punteros en gestos de varios dedos: el toque igual cuenta.
      target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 100 + i, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
      target.dispatchEvent(new TouchEvent('touchend', { touches: touches.slice(i + 1), changedTouches: [touches[i]], bubbles: true, cancelable: true }));
    });
  }, pts);
  const cx = box.x + box.width * 0.3;
  const cy = box.y + box.width * 0.3;
  await pen(cx, cy);
  await pen(cx, cy + 60);
  assert.equal(await ink(), 2);
  await fingers([[cx, cy + 200], [cx + 90, cy + 200]]);
  assert.equal(await ink(), 1, 'tocar con dos dedos deshace (táctil)');
  await fingers([[cx, cy + 200], [cx + 60, cy + 200], [cx + 120, cy + 200]]);
  assert.equal(await ink(), 2, 'tres dedos rehacen (táctil)');
  step('pantalla táctil: 2 dedos deshace, 3 rehace aunque el sistema cancele los punteros');
  const blocked = await tp.evaluate(([x, y]) => {
    const target = document.elementFromPoint(x, y);
    const touch = new Touch({ identifier: 300, target, clientX: x, clientY: y });
    Object.defineProperty(touch, 'touchType', { value: 'stylus' }); // Chromium no lo tiene; Safari sí
    const ev = new TouchEvent('touchstart', { touches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    target.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [touch], bubbles: true, cancelable: true }));
    return ev.defaultPrevented;
  }, [cx, cy]);
  assert.ok(blocked, 'el Pencil no inicia selección de texto');
  assert.ok((await tp.locator('.nb-zoom__label').boundingBox()).width <= 1, 'sin número de zoom a la vista');
  step('el Pencil no selecciona texto; sin número de zoom');

  // Botón de cambio rápido: lapicera ↔ goma.
  await tp.getByRole('button', { name: 'Goma', exact: true }).click();
  await tp.getByRole('button', { name: 'Cambiar a Lapicera' }).click();
  assert.equal(await tp.locator('.nb-tool.is-on').getAttribute('aria-label'), 'Lapicera');
  await tp.getByRole('button', { name: 'Cambiar a Goma' }).click();
  assert.equal(await tp.locator('.nb-tool.is-on').getAttribute('aria-label'), 'Goma');
  step('botón de cambio rápido lapicera ↔ goma');

  // Stickers con el dedo: cada toque pega uno más.
  await tp.getByRole('button', { name: 'Stickers', exact: true }).click();
  await tp.getByRole('button', { name: 'Gatito' }).click();
  await fingers([[cx + 300, cy + 100]]);
  await fingers([[cx + 300, cy + 260]]);
  await tp.waitForTimeout(200);
  assert.equal(await ink(), 4, 'dos stickers con el dedo');
  step('stickers con toques del dedo');

  // Mover: borrar un sticker no deja el recuadro.
  await tp.getByRole('button', { name: 'Mover y cambiar tamaño' }).click();
  const st = await tp.locator('.nb-page').first().locator('.nb-page__svg > g:nth-child(4) > g').last().boundingBox();
  await tp.mouse.click(st.x + st.width / 2, st.y + st.height / 2);
  assert.ok(await tp.locator('.nb-page').first().locator('.nb-page__svg > g:nth-child(6) > *').count(), 'recuadro visible');
  await tp.keyboard.press('Delete');
  assert.equal(await ink(), 3);
  assert.equal(await tp.locator('.nb-page').first().locator('.nb-page__svg > g:nth-child(6) > *').count(), 0, 'sin recuadro vacío');
  step('borrar un sticker quita el recuadro');

  // Post-it: se pega, se agranda con la manito y se escribe encima.
  await tp.getByRole('button', { name: 'Stickers', exact: true }).click();
  await tp.getByRole('button', { name: 'Post-it' }).first().click();
  const n1 = await ink();
  await fingers([[cx + 420, cy + 120]]);
  await tp.waitForTimeout(200);
  assert.equal(await ink(), n1 + 1, 'post-it pegado');
  await tp.getByRole('button', { name: 'Mover y cambiar tamaño' }).click();
  const note = await tp.locator('.nb-note').last().boundingBox();
  await tp.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  const handle = await tp.locator('.nb-handle').boundingBox();
  await tp.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await tp.mouse.down();
  await tp.mouse.move(handle.x + 120, handle.y + 40, { steps: 6 });
  await tp.mouse.up();
  const note2 = await tp.locator('.nb-note').last().boundingBox();
  assert.ok(note2.width > note.width + 60 && note2.height > note.height + 10, 'post-it agrandado (ancho y alto libres)');
  step('post-it: pegar y cambiar el tamaño');

  // Panel de páginas con número y banderitas.
  await tp.getByRole('button', { name: 'Páginas y marcadores' }).click();
  assert.ok(await tp.locator('.nb-side').isVisible());
  assert.match(await tp.locator('.nb-side__title').textContent(), /^Página 1 de \d+$/);
  assert.match(await tp.locator('.nb-pill').textContent(), /^1 \/ \d+$/);
  await tp.getByRole('button', { name: 'Marcar la página 1' }).click();
  await tp.fill('#nb-mark-title', 'Lección 3 · verbos');
  await tp.getByRole('button', { name: 'Guardar' }).click();
  await tp.waitForTimeout(300);
  assert.equal((await tp.locator('.nb-flag').first().textContent()).trim(), 'Lección 3 · verbos');
  assert.equal(await tp.locator('.nb-side__mark').first().textContent(), 'Lección 3 · verbos');
  await tp.getByRole('button', { name: 'Marcadas' }).click();
  assert.equal(await tp.locator('.nb-side__row').count(), 1, 'filtro de marcadas');
  await tp.screenshot({ path: join(OUT, 'nb-10-panel.png') });
  step('panel de páginas, número y banderitas');
  // Queda guardado.
  await tp.reload();
  await tp.getByRole('button', { name: 'Cuadernos' }).first().click();
  await tp.locator('.nb-cover').last().click();
  await tp.waitForTimeout(700);
  assert.equal((await tp.locator('.nb-flag').first().textContent()).trim(), 'Lección 3 · verbos');
  assert.ok(await tp.locator('.nb-note').count(), 'post-it guardado');
  step('marcador y post-it guardados');
  await tp.screenshot({ path: join(OUT, 'nb-09-tactil.png') });
  await tctx.close();
}

await browser.close();
if (errors.length) {
  console.log('Errores en la página:', errors);
  process.exit(1);
}
console.log('✔ cuadernos OK');
