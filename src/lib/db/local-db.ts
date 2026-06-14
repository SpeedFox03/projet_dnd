/**
 * Base locale (IndexedDB via Dexie) — coeur de l'offline-first.
 *
 * 4 stores :
 *   - categories : schémas (source + perso), lecture seule pour les sources.
 *   - entities   : toutes les fiches consultables hors ligne.
 *   - outbox     : mutations utilisateur en attente de sync.
 *   - meta       : curseurs de sync (last_sync_*), clés/valeurs diverses.
 *
 * Les composants ne touchent PAS Dexie directement : ils passent par le
 * Repository (src/lib/repository) qui orchestre lecture locale + sync.
 */

import Dexie, { type EntityTable, type Table } from 'dexie';
import type {
  Campaign,
  CampaignEntity,
  Category,
  EntityRecord,
  OutboxItem,
} from '@/types/domain';

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface FavoriteRecord {
  entityId: string;
  createdAt: string;
}

class LocalDB extends Dexie {
  categories!: EntityTable<Category, 'id'>;
  entities!: EntityTable<EntityRecord, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;
  favorites!: EntityTable<FavoriteRecord, 'entityId'>;
  campaigns!: EntityTable<Campaign, 'id'>;
  // Clé primaire composite [campaignId, entityId].
  campaignEntities!: Table<CampaignEntity, [string, string]>;

  constructor() {
    super('projet-dnd');

    this.version(1).stores({
      // Index : champs utiles aux requêtes/filtres. Le reste reste hors index.
      categories: 'id, slug, ownerId',
      entities:
        'id, categoryId, ownerId, kind, parentId, updatedAt, *tags, _syncState',
      outbox: 'id, entityId, createdAt',
      meta: 'key',
    });

    // v2 : favoris locaux (sync best-effort vers Supabase).
    this.version(2).stores({
      favorites: 'entityId, createdAt',
    });

    // v3 : campagnes + appartenance (clé composite).
    this.version(3).stores({
      campaigns: 'id, ownerId, updatedAt',
      campaignEntities: '[campaignId+entityId], campaignId, entityId',
    });
  }
}

export const db = new LocalDB();

// --- Helpers meta (curseurs de sync) ---------------------------------------

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export const META_KEYS = {
  lastSyncSource: 'last_sync_source',
  lastSyncUser: 'last_sync_user',
} as const;
