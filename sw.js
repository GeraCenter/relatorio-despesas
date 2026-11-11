// Guarda o site no aparelho para abrir sem internet. Ao publicar versão nova, mude o número abaixo.
const CACHE = 'relatorio-despesas-2.7.0';
const FILES = ['./', 'index.html', 'app.js', 'store.js', 'config.js', 'manifest.webmanifest',
  'lib/firebase-app-compat.js', 'lib/firebase-auth-compat.js', 'lib/firebase-firestore-compat.js',
  'lib/jspdf.umd.min.js', 'lib/jspdf.plugin.autotable.min.js', 'lib/pdf.min.js', 'lib/pdf.worker.min.js',
  'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'fonts/barlow-semi-condensed-latin-500-normal.woff2', 'fonts/barlow-semi-condensed-latin-600-normal.woff2', 'fonts/barlow-semi-condensed-latin-700-normal.woff2',
  'fonts/public-sans-latin-400-normal.woff2', 'fonts/public-sans-latin-500-normal.woff2', 'fonts/public-sans-latin-600-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// rede primeiro (pega a versão nova quando houver internet); sem internet usa a cópia guardada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
