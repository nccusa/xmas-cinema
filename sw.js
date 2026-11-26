// 露天電影院：Service Worker
// 網頁檔一律先抓最新版（網路優先），斷線時才用快取；Supabase 的資料請求完全不經過這裡。
const CACHE = 'xc-20261127c';
const SHELL = ['./', './index.html', './scan.html', './admin.html', './assets/api.js?v=20261120f', './assets/icons.js?v=20261120f',
  './icons/scan-192.png', './icons/admin-192.png', './scan.webmanifest', './admin.webmanifest'];
const CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;           // 資料請求不快取
  if (url.origin === location.origin) {                         // 自己的檔案：網路優先
    e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (CDN.includes(url.hostname)) {                             // 外部函式庫和字型：有快取就先用
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
  }
});
