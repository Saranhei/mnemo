// Arma la app para publicar. Sin dependencias: solo Node 20+.
//
//   node scripts/build.mjs
//
// Genera:
//   dist/           → la app web instalable. Es la carpeta que se sube a Netlify,
//                     Cloudflare Pages o GitHub Pages.
//   dist-preview/   → versión de prueba para publicar dentro de Claude (sin
//                     instalación ni modo sin conexión).

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, readdir, copyFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const PREVIEW = join(ROOT, 'dist-preview');

// Archivos que no se guardan al instalar. Los trazos de kanji (6 MB) se guardan
// de a uno a medida que se usan (ver sw.template.js); los de kana sí van siempre.
const NOT_CACHED = [/\.txt$/, /^_headers$/, /^strokes\/(?!030\.json$)/];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const toUrlPath = (p) => relative(PUBLIC, p).split(sep).join('/');

async function copyAll(files, dest) {
  for (const file of files) {
    const target = join(dest, relative(PUBLIC, file));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
  }
}

async function buildDist(files) {
  await rm(DIST, { recursive: true, force: true });
  await copyAll(files, DIST);

  const cached = files.map(toUrlPath).filter((p) => !NOT_CACHED.some((re) => re.test(p))).sort();
  const hash = createHash('sha256');
  for (const p of cached) hash.update(p).update(await readFile(join(PUBLIC, p)));
  const version = hash.digest('hex').slice(0, 12);

  const assets = ['./', ...cached.map((p) => `./${p}`)];
  const template = await readFile(join(ROOT, 'src', 'sw.template.js'), 'utf8');
  const sw = template.replace("'__VERSION__'", JSON.stringify(version)).replace('__ASSETS__', JSON.stringify(assets, null, 2));
  await writeFile(join(DIST, 'sw.js'), sw);
  return { version, count: assets.length };
}

async function buildPreview(files) {
  await rm(PREVIEW, { recursive: true, force: true });
  // La vista previa solo necesita los scripts y las tipografías; el CSS va adentro de la página.
  await copyAll(files.filter((f) => /[\\/](js|fonts)[\\/]/.test(f) && !f.endsWith('.txt')), PREVIEW);

  const html = await readFile(join(PUBLIC, 'index.html'), 'utf8');
  const body = html.match(/<!--APP-->([\s\S]*?)<!--\/APP-->/)?.[1];
  if (!body) throw new Error('index.html no tiene el bloque <!--APP-->');
  const css = (await readFile(join(PUBLIC, 'css', 'app.css'), 'utf8')).replaceAll("url('../fonts/", "url('fonts/");

  const page = [
    '<title>Mnemo</title>',
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<meta name="mnemo-mode" content="preview">',
    `<style>\n${css}\n</style>`,
    body.trim(),
    '<script type="module" src="js/app.js"></script>',
    '',
  ].join('\n');
  await writeFile(join(PREVIEW, 'index.html'), page);
}

const files = await walk(PUBLIC);
const { version, count } = await buildDist(files);
await buildPreview(files);
console.log(`✔ dist/ listo (versión ${version}, ${count} archivos para usar sin conexión)`);
console.log('✔ dist-preview/ listo');
