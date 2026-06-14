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

  if (navigator.onLine) {
    try {
      await syncEngine.syncAll();
      await favoritesRepository.pull();
      await campaignsRepository.pull();
    } catch (e) {
      console.warn('[bootstrap] sync initiale échouée, mode local:', e);
    }
  }

  await seedInfoDnd();
  await buildSearchIndex();

  // Re-sync automatique au retour du réseau.
  window.addEventListener('online', () => {
    syncEngine
      .syncAll()
      .then(() => buildSearchIndex())
      .catch((e) => console.warn('[sync online]', e));
  });
}
