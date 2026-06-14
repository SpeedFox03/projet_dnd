/**
 * Favoris : local-first (Dexie) + propagation best-effort vers Supabase quand
 * en ligne. La table Supabase `favorites` est protégée par RLS (user = auth.uid()).
 */

import { db } from '@/lib/db/local-db';
import { supabase } from '@/lib/supabase/client';

export const favoritesRepository = {
  async toggle(entityId: string, userId: string): Promise<boolean> {
    const existing = await db.favorites.get(entityId);
    if (existing) {
      await db.favorites.delete(entityId);
      void this.remoteRemove(entityId, userId);
      return false;
    }
    await db.favorites.put({ entityId, createdAt: new Date().toISOString() });
    void this.remoteAdd(entityId, userId);
    return true;
  },

  async remoteAdd(entityId: string, userId: string) {
    if (!navigator.onLine) return;
    try {
      await supabase().from('favorites').upsert({ entity_id: entityId, user_id: userId });
    } catch {
      /* best-effort : sera renvoyé à la prochaine sync */
    }
  },

  async remoteRemove(entityId: string, userId: string) {
    if (!navigator.onLine) return;
    try {
      await supabase()
        .from('favorites')
        .delete()
        .eq('entity_id', entityId)
        .eq('user_id', userId);
    } catch {
      /* best-effort */
    }
  },

  /** Recharge les favoris depuis Supabase (appelé à la sync). */
  async pull(): Promise<void> {
    if (!navigator.onLine) return;
    const { data, error } = await supabase().from('favorites').select('entity_id, created_at');
    if (error || !data) return;
    await db.favorites.bulkPut(
      data.map((r) => ({ entityId: r.entity_id, createdAt: r.created_at })),
    );
  },
};
