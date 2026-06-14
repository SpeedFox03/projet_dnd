/**
 * Types de domaine partagés (DB <-> app).
 * Le modèle repose sur des catégories "schématisées" : chaque catégorie décrit
 * ses champs, et chaque entité stocke ses valeurs dans `data` (JSONB côté DB).
 */

export type EntityKind = 'source' | 'custom' | 'variant' | 'override';
export type Visibility = 'official' | 'public' | 'private';

/** État de synchronisation local (jamais persisté côté serveur). */
export type SyncState = 'synced' | 'pending' | 'conflict' | 'error';

// ---------------------------------------------------------------------------
// Schéma dynamique des catégories
// ---------------------------------------------------------------------------

export type FieldType =
  | 'text'
  | 'textarea'
  | 'rich'        // éditeur riche / markdown
  | 'image'       // URL d'image (couverture, carte, aide visuelle)
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'tags'
  | 'list'        // liste de chaînes (ex: actions)
  | 'object';     // sous-objet libre (ex: caractéristiques)

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];     // pour select / multiselect
  group?: string;         // clé d'un FieldGroup
  computed?: string;      // expression (v2) pour champs calculés
  help?: string;
}

export interface FieldGroup {
  key: string;
  label: string;
}

export interface CategorySchema {
  fields: FieldDef[];
  groups?: FieldGroup[];
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  schema: CategorySchema;
  displayTemplate?: unknown | null;
  defaultTags: string[];
  isSystem: boolean;
  ownerId: string | null;     // null = catégorie globale
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Entités
// ---------------------------------------------------------------------------

/** Valeurs de champs d'une entité (conformes au schéma de sa catégorie). */
export type EntityData = Record<string, unknown>;

export interface EntityRecord {
  id: string;
  categoryId: string;
  ownerId: string | null;       // null = contenu source officiel
  kind: EntityKind;
  visibility: Visibility;
  parentId: string | null;      // source d'une variante / d'un override
  name: string;
  summary?: string | null;
  data: EntityData;
  patch?: EntityData | null;    // diff vs parent (overrides)
  tags: string[];
  license?: string | null;
  sourceName?: string | null;
  rev: number;                  // concurrence optimiste
  isDefaultVariant: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  // --- métadonnées locales (Dexie uniquement, non envoyées telles quelles) ---
  _syncState?: SyncState;
  _localUpdatedAt?: string;
  /** Version distante conservée lors d'un conflit, pour la résolution manuelle. */
  _remote?: EntityRecord | null;
}

// ---------------------------------------------------------------------------
// Campagnes
// ---------------------------------------------------------------------------

export interface Campaign {
  id: string;
  ownerId: string;
  name: string;
  description?: string | null;
  offline: boolean;        // préchargée hors ligne ?
  createdAt: string;
  updatedAt: string;
}

export interface CampaignEntity {
  campaignId: string;
  entityId: string;
  addedAt: string;
}

// ---------------------------------------------------------------------------
// Outbox (file de mutations en attente de sync)
// ---------------------------------------------------------------------------

export type OutboxOp = 'upsert' | 'delete';

export interface OutboxItem {
  id: string;               // uuid de l'opération
  op: OutboxOp;
  entityId: string;
  baseRev: number;          // rev sur laquelle la modif est basée (détection conflit)
  payload?: Partial<EntityRecord>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

export interface SearchFilters {
  categorySlug?: string;
  tags?: string[];
  campaignId?: string;
  favoritesOnly?: boolean;
  kind?: EntityKind;
  ownerScope?: 'all' | 'mine' | 'official';
}

export interface SearchResult {
  entity: EntityRecord;
  category: Category;
  score: number;
}
