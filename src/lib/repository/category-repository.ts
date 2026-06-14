/**
 * Accès aux catégories (schémas). Lecture locale (Dexie) prioritaire.
 */

import { db } from '@/lib/db/local-db';
import { supabase } from '@/lib/supabase/client';
import { mapCategoryToRow } from '@/lib/sync/mappers';
import type { Category } from '@/types/domain';

export const categoryRepository = {
  async all(): Promise<Category[]> {
    // `name` non indexé : tri en mémoire.
    const cats = await db.categories.toArray();
    return cats.sort((a, b) => a.name.localeCompare(b.name));
  },
  async get(id: string): Promise<Category | undefined> {
    return db.categories.get(id);
  },
  async getBySlug(slug: string): Promise<Category | undefined> {
    return db.categories.where('slug').equals(slug).first();
  },

  /** Sauvegarde locale + propagation best-effort vers Supabase. */
  async save(category: Category): Promise<void> {
    await db.categories.put(category);
    if (navigator.onLine) {
      try {
        await supabase().from('categories').upsert(mapCategoryToRow(category));
      } catch {
        /* sera renvoyé à la prochaine sync (pullCategories) */
      }
    }
  },
};
