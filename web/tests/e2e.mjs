// Prueba de punta a punta en un navegador real (Chromium), a tamaño iPhone y iPad.
//
//   node scripts/serve.mjs dist &      (en otra terminal)
//   node tests/e2e.mjs [carpeta-de-capturas]
//
// Requiere Playwright instalado (npm i -D playwright). Recorre: mazos, alta de
// tarjeta, repaso con deshacer, Pomodoro con anotación, sesiones, exportar copia,
// importar (copia y Anki), persistencia al recargar y modo sin conexión.

import { createRequire } from 'node:module';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
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
await mkdir(OUT, { recursive: true });

const problems = [];
const browser = await chromium.launch();

async function newPage(opts) {
  const context = await browser.newContext({ locale: 'es-AR', acceptDownloads: true, ...opts });
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  return { context, page };
}

async function noHorizontalScroll(page, where) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `${where}: la página se desplaza en horizontal (${sw} > ${iw})`);
}

const shot = async (page, name) => {
  await page.waitForTimeout(350); // deja terminar las animaciones de entrada
  await page.screenshot({ path: join(OUT, `${name}.png`) });
};
const step = (msg) => console.log(`  • ${msg}`);

// ─────────────────────────── iPhone, tema claro ───────────────────────────
console.log('iPhone (390×844), claro');
{
  const { context, page } = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');
  step('primer uso: mazo de ejemplo');
  assert.equal(await page.locator('.deck-row').count(), 1);
  await noHorizontalScroll(page, 'mazos');
  await shot(page, '01-iphone-mazos');

  step('detalle del mazo');
  await page.locator('.deck-row').first().click();
  await page.waitForSelector('.btn--study');
  await noHorizontalScroll(page, 'detalle');
  await shot(page, '02-iphone-mazo');

  step('nueva tarjeta con género');
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.fill('#card-front', 'Hund');
  await page.fill('#card-back', 'perro');
  await page.locator('label[for="gender-masculine"]').click();
  await shot(page, '03-iphone-editor');
  await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
  await page.waitForSelector('.backdrop', { state: 'detached' });
  assert.equal(await page.locator('.card-row').count(), 8);

  step('XSS: el texto se muestra tal cual');
  await page.getByRole('button', { name: 'Tarjeta', exact: true }).click();
  await page.fill('#card-front', '<img src=x onerror=alert(1)>');
  await page.fill('#card-back', 'prueba');
  await page.getByRole('button', { name: 'Agregar tarjeta' }).click();
  await page.waitForSelector('.backdrop', { state: 'detached' });
  assert.equal(await page.locator('.card-row img').count(), 0);
  assert.ok((await page.locator('.card-row__front').allTextContents()).includes('<img src=x onerror=alert(1)>'));

  step('repaso: mostrar, calificar, deshacer');
  await page.locator('.btn--study').click();
  await page.waitForSelector('.review__card');
  await shot(page, '04-iphone-repaso-frente');
  await page.keyboard.press('Space');
  await page.waitForSelector('.grades');
  await shot(page, '05-iphone-repaso-respuesta');
  const before = await page.locator('.review__counter').textContent();
  await page.keyboard.press('3');
  await page.waitForFunction((b) => document.querySelector('.review__counter')?.textContent !== b, before);
  await page.keyboard.press('z');
  await page.waitForSelector('.grades');
  assert.match(await page.locator('.review__counter').textContent(), /^0 hechas/);
  await page.keyboard.press('1');
  for (let i = 0; i < 40 && (await page.locator('.finished').count()) === 0; i++) {
    if (await page.locator('#reveal-btn').count()) await page.locator('#reveal-btn').click();
    await page.locator('.grade--good').click();
  }
  await page.waitForSelector('.finished');
  await shot(page, '06-iphone-repaso-fin');
  await page.getByRole('button', { name: 'Volver al mazo' }).click();
  await page.waitForSelector('.study-done');

  step('pomodoro + anotación rápida');
  await page.locator('.nav__item[data-tab="pomodoro"]').click();
  await page.waitForSelector('.clock');
  await page.locator('#pomo-main').click();
  await page.waitForTimeout(2200);
  const t = await page.locator('.clock__time').textContent();
  assert.notEqual(t, '25:00', 'el reloj no avanzó');
  assert.match(await page.locator('.nav__item[data-tab="pomodoro"] .nav__label').textContent(), /^\d\d:\d\d$/);
  await page.fill('#qn-front', 'Katze');
  await page.press('#qn-front', 'Enter');
  await page.fill('#qn-back', 'gato');
  await page.press('#qn-back', 'Enter');
  await page.waitForSelector('.noted__item');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'qn-front', 'el foco vuelve a "Palabra"');
  await noHorizontalScroll(page, 'pomodoro');
  await shot(page, '07-iphone-pomodoro');
  await page.locator('#pomo-main').click();

  step('sesiones');
  await page.locator('.nav__item[data-tab="sessions"]').click();
  await page.waitForSelector('.session-row');
  await shot(page, '08-iphone-sesiones');
  await page.locator('.session-row').first().click();
  await page.waitForSelector('.facts');
  assert.ok((await page.locator('.card-row__front').allTextContents()).includes('Katze'));

  step('exportar copia completa');
  await page.locator('.nav__item[data-tab="settings"]').click();
  await page.waitForSelector('.settings-section');
  await noHorizontalScroll(page, 'ajustes');
  await shot(page, '09-iphone-ajustes');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()]);
  const backupPath = join(OUT, 'copia.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.app, 'mnemo');
  assert.ok(backup.cards.some((c) => c.front === 'Katze'));

  step('importar la misma copia: nada que sincronizar');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar copia o mazo' }).click()]);
  await chooser.setFiles(backupPath);
  await page.getByRole('button', { name: 'Combinar' }).click();
  await page.waitForSelector('.toast >> text=Ya estaba todo sincronizado');

  step('importar mazo de Anki');
  const ankiPath = join(OUT, 'Coreano.txt');
  await writeFile(ankiPath, '#separator:tab\n안녕하세요\thola\tannyeonghaseyo\n감사합니다\tgracias\tgamsahamnida\n');
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Importar copia o mazo' }).click()]);
  await chooser2.setFiles(ankiPath);
  await page.waitForSelector('h1 >> text=Coreano');
  assert.equal(await page.locator('.card-row').count(), 2);

  step('los datos sobreviven a recargar');
  await page.reload();
  await page.locator('.nav__item[data-tab="decks"]').click();
  await page.waitForSelector('.deck-row');
  assert.equal(await page.locator('.deck-row').count(), 3); // ejemplo, Anotaciones, Coreano

  step('modo sin conexión (service worker)');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.deck-row');
  await context.setOffline(false);
  await context.close();
}

// ─────────────────────────── iPad, tema oscuro ───────────────────────────
console.log('iPad (1024×1366), oscuro');
{
  const { context, page } = await newPage({ viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await page.goto(BASE);
  await page.waitForSelector('.deck-row');
  await noHorizontalScroll(page, 'ipad mazos');
  await shot(page, '10-ipad-mazos-oscuro');
  await page.locator('.deck-row').first().click();
  await page.waitForSelector('.btn--study');
  await shot(page, '11-ipad-mazo-oscuro');
  await page.locator('.card-row').nth(2).click();
  await page.waitForSelector('.editor');
  await shot(page, '12-ipad-editor-oscuro');
  await page.keyboard.press('Escape');
  await page.locator('.btn--study').click();
  await page.waitForSelector('.review__card');
  await page.keyboard.press('Space');
  await shot(page, '13-ipad-repaso-oscuro');
  await page.keyboard.press('Escape');
  await page.locator('.nav__item[data-tab="pomodoro"]').click();
  await page.waitForSelector('.clock');
  await shot(page, '14-ipad-pomodoro-oscuro');
  await context.close();
}

await browser.close();
if (problems.length) {
  console.error('\nProblemas en la consola del navegador:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\n✔ Prueba completa sin errores');
