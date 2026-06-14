/**
 * Amorçage offline-first, exécuté une fois côté client au montage de l'app.
 *
 * 1. Si en ligne : sync (catégories + sources + contenu user).
 * 2. Construit l'index de recherche local depuis Dexie.
 * 3. Branche les écouteurs online/offline pour re-synchroniser à la reconnexion.
 *
 * Tolérant au hors-ligne : si la sync échoue (pas de réseau), on continue avec
 * les données déjà présentes dans Dexie.
 */

import { syncEngine } from '@/lib/sync/sync-engine';
import { buildSearchIndex } from '@/lib/search/local-index';
import { favoritesRepository } from '@/lib/repository/favorites-repository';
import { campaignsRepository } from '@/lib/repository/campaigns-repository';
import { seedInfoDnd } from '@/lib/local-seed/info-dnd-seed';

let started = false;

export async function bootstrap(): Promise<void> {
  if (started) return;
  started = true;

  // 1. Seed LOCAL d'abord : le JSON bundlé contient déjà tout le contenu source
  //    (et les couvertures). C'est quasi instantané -> l'app s'affiche vite avec
  //    ses données et ses images, sans attendre la sync réseau (qui peut durer
  //    plusieurs dizaines de secondes sur le premier pull).
  await seedInfoDnd();
  await buildSearchIndex();

  // 2. Sync réseau en ARRIÈRE-PLAN : contenu utilisateur + mises à jour.
  //    On n'attend pas : l'UI est déjà utilisable. Dexie/useLiveQuery met à jour
  //    l'affichage au fur et à mesure que les données arrivent.
  if (navigator.onLine) {
    void syncInBackground();
  }

  // Re-sync automatique au retour du réseau.
  window.addEventListener('online', () => {
    void syncInBackground();
  });
}

async function syncInBackground(): Promise<void> {
  try {
    await syncEngine.syncAll();
    await favoritesRepository.pull();
    await campaignsRepository.pull();
    await buildSearchIndex();
  } catch (e) {
    console.warn('[bootstrap] sync arrière-plan échouée, mode local:', e);
  }
}
