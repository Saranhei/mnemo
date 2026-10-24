// Service worker: hace que la app funcione SIN CONEXIÓN una vez instalada.
//
// Al instalarse guarda todos los archivos de la app en el caché del dispositivo.
// Cada versión publicada tiene su propio caché (VERSION lo calcula scripts/build.mjs
// a partir del contenido), así una actualización llega completa y nunca mezcla
// archivos viejos con nuevos. No guarda ni ve datos del usuario.

const VERSION = '__VERSION__';
const ASSETS = __ASSETS__;
const CACHE = `mnemo-${VERSION}`;
// Trazos de kanji: caché aparte que NO cambia con cada versión de la app, así
// lo que ya se descargó sigue disponible sin conexión después de actualizar.
const STROKES_CACHE = 'mnemo-strokes-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('mnemo-') && k !== CACHE && k !== STROKES_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/strokes/') && !url.pathname.endsWith('/030.json')) {
    event.respondWith(
      caches.open(STROKES_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Navegación: siempre la página de la app desde el caché (funciona sin internet).
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html', { cacheName: CACHE }).then((cached) => cached ?? fetch(request)));
    return;
  }

  event.respondWith(caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((cached) => cached ?? fetch(request)));
});
