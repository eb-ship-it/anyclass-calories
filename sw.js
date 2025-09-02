const CACHE = 'ac-calories-v4';
const CORE = [
  '/',
  '/index.html',
  '/script.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Установка: кешируем «оболочку» приложения
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

// Активация: чистим старые кеши
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Запросы: cache-first для статики своего домена, сеть — для остального
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // не трогаем НЕ-GET и запросы на чужие домены (например, твой вебхук)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
