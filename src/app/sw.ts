/// <reference lib="webworker" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, Serwist } from 'serwist';

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
    ...defaultCache,
  ],
});

serwist.addEventListeners();
