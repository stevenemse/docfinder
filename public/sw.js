// ==============================================================================
// Service Worker DocFinder — minimal et sûr
//  - App shell : cache-first pour /assets/* (fichiers hashés par Vite, immuables)
//  - Navigations : network-first, fallback sur le cache (consultation hors ligne)
//  - API Supabase + Storage : TOUJOURS le réseau — aucune donnée perso en cache
// ==============================================================================
const CACHE = 'docfinder-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST API → réseau seul, on n'intercepte pas

  const url = new URL(req.url);

  // API Supabase / Storage / Edge Functions : jamais caché
  if (url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/functions/')) return;

  // Assets immuables (hash Vite) : cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
      )
    );
    return;
  }

  // Navigations : network-first avec fallback hors ligne
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
  }
});
