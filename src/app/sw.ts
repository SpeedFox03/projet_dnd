/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheableResponsePlugin, NetworkFirst, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Precache du shell de l'app + cache runtime par défaut. Les DONNÉES restent
// gérées par Dexie/IndexedDB (offline-first applicatif), pas par le SW.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Le seed de contenu (/data/*.json) doit toujours refléter le dernier
    // déploiement : réseau d'abord, cache seulement en secours hors ligne.
    // Sinon un ancien JSON resterait servi par le SW (couvertures manquantes…).
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/data/'),
      handler: new NetworkFirst({ cacheName: 'app-data' }),
    },
    // Images locales (/images/*) : réseau d'abord -> toujours le vrai fichier.
    // Sans cette règle, le cache runtime par défaut servait le shell HTML à la
    // place du PNG (content-type text/html) -> <img> vide. On ne met en cache
    // que les vraies réponses 200 (CacheableResponsePlugin), cache en secours
    // hors ligne. cacheName neuf pour abandonner toute entrée empoisonnée.
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/images/'),
      handler: new NetworkFirst({
        cacheName: 'app-images-v2',
        plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
