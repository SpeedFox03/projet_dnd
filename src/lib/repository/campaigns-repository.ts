/**
 * Campagnes : local-first (Dexie) + propagation best-effort vers Supabase.
 * Permet de regrouper des fiches (PNJ, lieux, monstres…) par campagne et de
 * marquer une campagne comme « disponible hors ligne ».
 */

import { v4 as uuid } from 'uuid';
import { db } from '@/lib/db/local-db';
import { supabase } from '@/lib/supabase/client';
import { mapCampaignToRow, mapRowToCampaign } from '@/lib/sync/mappers';
import type { Campaign } from '@/types/domain';

export const campaignsRepository = {
  async list(): Promise<Campaign[]> {
    const all = await db.campaigns.toArray();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  },

  async get(id: string): Promise<Campaign | undefined> {
    return db.campaigns.get(id);
  },

  create(ownerId: string, name: string): Campaign {
    const now = new Date().toISOString();
    return { id: uuid(), ownerId, name, description: '', offline: true, createdAt: now, updatedAt: now };
  },

  async save(c: Campaign): Promise<void> {
    const next = { ...c, updatedAt: new Date().toISOString() };
    await db.campaigns.put(next);
    if (navigator.onLine) {
      try {
        await supabase().from('campaigns').upsert(mapCampaignToRow(next));
      } catch {
        /* best-effort */
      }
    }
  },

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.campaigns, db.campaignEntities, async () => {
      await db.campaigns.delete(id);
      await db.campaignEntities.where('campaignId').equals(id).delete();
    });
    if (navigator.onLine) {
      try {
        await supabase().from('campaigns').delete().eq('id', id);
      } catch {
        /* best-effort */
      }
    }
  },

  // --- appartenance des fiches --------------------------------------------

  async addEntity(campaignId: string, entityId: string): Promise<void> {
    await db.campaignEntities.put({ campaignId, entityId, addedAt: new Date().toISOString() });
    if (navigator.onLine) {
      try {
        await supabase()
          .from('campaign_entities')
          .upsert({ campaign_id: campaignId, entity_id: entityId });
      } catch {
        /* best-effort */
      }
    }
  },

  async removeEntity(campaignId: string, entityId: string): Promise<void> {
    await db.campaignEntities.delete([campaignId, entityId]);
    if (navigator.onLine) {
      try {
        await supabase()
          .from('campaign_entities')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('entity_id', entityId);
      } catch {
        /* best-effort */
      }
    }
  },

  async entityIdsOf(campaignId: string): Promise<string[]> {
    const rows = await db.campaignEntities.where('campaignId').equals(campaignId).toArray();
    return rows.map((r) => r.entityId);
  },

  async campaignIdsOf(entityId: string): Promise<string[]> {
    const rows = await db.campaignEntities.where('entityId').equals(entityId).toArray();
    return rows.map((r) => r.campaignId);
  },

  /** Recharge campagnes + appartenances depuis Supabase (à la sync). */
  async pull(): Promise<void> {
    if (!navigator.onLine) return;
    const [{ data: camps }, { data: links }] = await Promise.all([
      supabase().from('campaigns').select('*'),
      supabase().from('campaign_entities').select('campaign_id, entity_id, added_at'),
    ]);
    if (camps) await db.campaigns.bulkPut(camps.map(mapRowToCampaign));
    if (links)
      await db.campaignEntities.bulkPut(
        links.map((l) => ({
          campaignId: l.campaign_id,
          entityId: l.entity_id,
          addedAt: l.added_at ?? new Date().toISOString(),
        })),
      );
  },
};
