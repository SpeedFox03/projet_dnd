'use client';

/**
 * Réinitialisation locale : on repart de ce qui existe en base (Supabase),
 * SANS les fichiers perso (seed local `info-dnd.generated.json`).
 *
 * Concrètement :
 *   1. on pose le flag « skip seed » pour que les fichiers perso ne soient pas
 *      ré-injectés (ni maintenant, ni aux prochains démarrages) ;
 *   2. on vide entièrement IndexedDB (entités, catégories, outbox, favoris,
 *      campagnes, curseurs de sync) ;
 *   3. on re-tire tout depuis Supabase (les curseurs effacés ⇒ pull complet) ;
 *   4. on reconstruit l'index de recherche.
 *
 * ⚠️ Les mutations locales non encore poussées (outbox) sont perdues : c'est
 *    l'intérêt d'un reset. Le contenu déjà synchronisé revient via le pull.
 */

import { db } from '@/lib/db/local-db';
import { syncEngine } from '@/lib/sync/sync-engine';
import { buildSearchIndex } from '@/lib/search/local-index';
import { favoritesRepository } from '@/lib/repository/favorites-repository';
import { campaignsRepository } from '@/lib/repository/campaigns-repository';
import { SKIP_LOCAL_SEED_KEY } from '@/lib/local-seed/info-dnd-seed';

export async function resetLocal(): Promise<void> {
  // 1. Ne plus ré-injecter les fichiers perso (persistant entre rechargements).
  window.localStorage.setItem(SKIP_LOCAL_SEED_KEY, '1');

  // 2. Vider toutes les tables locales (curseurs de sync inclus ⇒ pull complet).
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  // 3. Re-tirer depuis la base.
  if (navigator.onLine) {
    await syncEngine.syncAll();
    await favoritesRepository.pull();
    await campaignsRepository.pull();
  }

  // 4. Reconstruire l'index de recherche local.
  await buildSearchIndex();
}

/** Réactive les fichiers perso : ils seront re-seedés au prochain démarrage. */
export function enableLocalSeed(): void {
  window.localStorage.removeItem(SKIP_LOCAL_SEED_KEY);
}
