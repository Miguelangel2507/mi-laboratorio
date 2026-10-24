/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// La app avisa cuando hay versión nueva y el usuario decide cuándo aplicarla.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

// iOS exige mostrar siempre una notificación al recibir un push; si no, retira el permiso.
self.addEventListener('push', (event) => {
  let p: PushPayload = {};
  try { p = event.data?.json() ?? {}; } catch { p = { body: event.data?.text() }; }
  event.waitUntil(
    self.registration.showNotification(p.title || 'Mi Patrimonio', {
      body: p.body || '',
      icon: 'icon-192.png',
      tag: p.tag,
      data: { url: p.url || '#/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) || '#/', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) { await w.focus(); await w.navigate(target); return; }
    }
    await self.clients.openWindow(target);
  })());
});
