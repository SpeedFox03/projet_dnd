/**
 * SyncEngine — couche de synchronisation offline-first.
 *
 * Deux flux séparés (cf. ARCHITECTURE.md §E) :
 *   1. pullSource()  : contenu officiel en LECTURE SEULE → delta par updatedAt.
 *   2. pushOutbox() + pullUser() : contenu utilisateur, bidirectionnel.
 *
 * Concurrence optimiste : chaque upsert envoie `baseRev`. Le serveur n'applique
 * que si rev_serveur === baseRev, sinon on marque l'entité en conflit.
 *
 * ⚠️ Interface volontairement isolée : si le volume l'exige, on remplace
 *    l'implémentation par PowerSync sans toucher au reste de l'app.
 */

import { supabase } from '@/lib/supabase/client';
import { db, getMeta, setMeta, META_KEYS } from '@/lib/db/local-db';
import type { EntityRecord } from '@/types/domain';
import { mapRowToEntity, mapEntityToRow, mapRowToCategory } from './mappers';

export interface SyncReport {
  pulledSource: number;
  pulledUser: number;
  pushed: number;
  conflicts: number;
  errors: number;
}

export class SyncEngine {
  private running = false;

  /** Sync complète (appelée au boot, à la reconnexion, périodiquement). */
  async syncAll(): Promise<SyncReport> {
    if (this.running) return EMPTY_REPORT;
    this.running = true;
    try {
      const report = { ...EMPTY_REPORT };
      // L'ordre compte : on pousse nos modifs avant de re-tirer.
      await this.pullCategories();
      Object.assign(report, await this.pullSource());
      report.pushed = await this.pushOutbox();
      Object.assign(report, await this.pullUser());
      return report;
    } finally {
      this.running = false;
    }
  }

  // --- Catégories (globales + perso) : pull complet (volume faible) --------
  async pullCategories(): Promise<void> {
    const { data, error } = await supabase().from('categories').select('*');
    if (error) throw error;
    if (data?.length) {
      await db.categories.bulkPut(data.map(mapRowToCategory));
    }
  }

  // --- Flux 1 : sources (pull-only) ----------------------------------------
  // Pagination complète : ramène TOUT le contenu officiel nouveau (peut dépasser
  // largement 1000 lignes après l'import SRD).
  async pullSource(): Promise<Partial<SyncReport>> {
    const since = (await getMeta<string>(META_KEYS.lastSyncSource)) ?? EPOCH;
    const PAGE = 1000;
    let from = 0;
    let total = 0;
    let maxUpdated = since;

    for (;;) {
      const { data, error } = await supabase()
        .from('entities')
        .select('*')
        .eq('visibility', 'official')
        .gt('updated_at', since)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);

      if (error) throw error;
      if (!data?.length) break;

      await db.entities.bulkPut(data.map(mapRowToEntity));
      total += data.length;
      maxUpdated = data[data.length - 1].updated_at;
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (total > 0) await setMeta(META_KEYS.lastSyncSource, maxUpdated);
    return { pulledSource: total };
  }

  // --- Flux 2a : push de l'outbox ------------------------------------------
  async pushOutbox(): Promise<number> {
    const items = await db.outbox.orderBy('createdAt').toArray();
    let pushed = 0;

    for (const item of items) {
      try {
        if (item.op === 'delete') {
          await supabase().from('entities').delete().eq('id', item.entityId);
        } else {
          // RPC côté serveur qui vérifie baseRev et snapshot la version.
          const { error } = await supabase().rpc('upsert_entity', {
            p_entity: mapEntityToRow(item.payload as EntityRecord),
            p_base_rev: item.baseRev,
          });
          if (error?.code === 'P0001' /* conflit applicatif */) {
            await this.markConflict(item.entityId);
            await db.outbox.delete(item.id);
            continue;
          }
          if (error) throw error;
        }
        await db.outbox.delete(item.id);
        await this.markSynced(item.entityId);
        pushed++;
      } catch (e) {
        await db.outbox.update(item.id, {
          attempts: (item.attempts ?? 0) + 1,
          lastError: String(e),
        });
        await this.markError(item.entityId);
      }
    }
    return pushed;
  }

  // --- Flux 2b : pull des entités utilisateur ------------------------------
  async pullUser(): Promise<Partial<SyncReport>> {
    const since = (await getMeta<string>(META_KEYS.lastSyncUser)) ?? EPOCH;
    const { data, error } = await supabase()
      .from('entities')
      .select('*')
      .neq('visibility', 'official')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
      .limit(1000);

    if (error) throw error;
    if (data?.length) {
      // On ne réécrit pas une entité encore présente dans l'outbox (pending).
      const pending = new Set((await db.outbox.toArray()).map((o) => o.entityId));
      const fresh = data.filter((r) => !pending.has(r.id)).map(mapRowToEntity);
      await db.entities.bulkPut(fresh);
      await setMeta(META_KEYS.lastSyncUser, data[data.length - 1].updated_at);
    }
    return { pulledUser: data?.length ?? 0 };
  }

  private markSynced(id: string) {
    return db.entities.update(id, { _syncState: 'synced', _remote: null });
  }
  /** Récupère la version distante et la conserve pour la résolution manuelle. */
  private async markConflict(id: string) {
    const { data } = await supabase().from('entities').select('*').eq('id', id).maybeSingle();
    await db.entities.update(id, {
      _syncState: 'conflict',
      _remote: data ? mapRowToEntity(data) : null,
    });
  }
  private markError(id: string) {
    return db.entities.update(id, { _syncState: 'error' });
  }
}

const EPOCH = '1970-01-01T00:00:00Z';
const EMPTY_REPORT: SyncReport = {
  pulledSource: 0,
  pulledUser: 0,
  pushed: 0,
  conflicts: 0,
  errors: 0,
};

export const syncEngine = new SyncEngine();
