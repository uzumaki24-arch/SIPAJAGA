/* Service worker SIPAJAGA: app shell offline + data jadwal network-first. */
"use strict";
const VERSION = "sipajaga-v1.1.0";
const SCOPE = self.registration.scope;
const SHELL = [
  "./",
  "./index.html",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./assets/logo.svg",
  "./assets/style.css",
  "./assets/store.js",
  "./assets/app.js",
  "./data/jadwal.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/maskable-icon-512.png"
];
const abs = p => new URL(p, SCOPE).toString();

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => Promise.allSettled(SHELL.map(p => cache.add(abs(p)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, timeout = 2500) {
  const cache = await caches.open(VERSION);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout))
    ]);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request).catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match(abs("./index.html"))) ||
          new Response("SIPAJAGA sedang offline dan halaman belum tersimpan.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      })
    );
    return;
  }
  if (url.pathname.endsWith("/data/jadwal.json")) {
    event.respondWith(networkFirst(request).catch(() => new Response("[]", { status: 503 })));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", event => {
  let payload = { title: "SIPAJAGA", body: "Ada pembaruan jadwal jaga.", url: "./" };
  try {
    if (event.data) payload = Object.assign(payload, event.data.json());
  } catch (_) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: abs("./assets/icons/icon-192.png"),
      badge: abs("./assets/icons/icon-192.png"),
      data: { url: payload.url },
      tag: "sipajaga-jadwal"
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const found = list.find(c => c.url.includes(new URL(target, SCOPE).pathname));
      if (found) return found.focus();
      return self.clients.openWindow(abs(target));
    })
  );
});
