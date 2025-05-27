const APP_VERSION = '1.0.0';
const CACHE_NAME = `inventcount-v${APP_VERSION}`;
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './html5-qrcode.min.js'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
  console.log(`[ServiceWorker] Install (v${APP_VERSION})`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', event => {
  console.log(`[ServiceWorker] Activate (v${APP_VERSION})`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// fetch時にキャッシュ優先、なければネットワーク
self.addEventListener('fetch', event => {
  // API通信などはネットワーク優先にしたい場合はここで分岐可能
  event.respondWith(
    caches.match(event.request).then(response => {
      // キャッシュにあれば返す
      if (response) return response;
      // なければネットワーク
      return fetch(event.request).catch(() => {
        // オフライン時のフォールバック
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// オプション：Service Workerのバージョン問い合わせ対応
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: APP_VERSION });
  }
});
