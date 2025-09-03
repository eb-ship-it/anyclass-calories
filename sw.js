// Версию меняй при каждом релизе, чтобы сервис-воркер обновился
const CACHE_NAME = 'anyclass-v10';

self.addEventListener('install', (event) => {
  // сразу активируем новый SW
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // чистим старые кэши
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

// Сеть-первым: берём свежие файлы из сети, кэш только как оффлайн-резерв
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // Положим копию ответа в кэш (на случай оффлайна)
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)) // если сеть недоступна — из кэша
  );
});
