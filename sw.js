const CACHE_NAME = 'cine-isaguirre-v4';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS))
      .catch(() => { })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (
    e.request.method !== 'GET' ||
    url.includes('script.google.com') ||
    url.includes('googleapis.com') ||
    url.includes('themoviedb.org') ||
    url.includes('drive.google.com')
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy)).catch(() => { });
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});