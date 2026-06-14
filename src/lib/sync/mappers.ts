/**
 * Conversion entre les lignes Postgres (snake_case) et les objets de domaine
 * (camelCase). Centralisé ici pour que le reste du code ignore le format DB.
 */

import type { Campaign, Category, EntityRecord } from '@/types/domain';

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapRowToCampaign(row: any): Campaign {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    offline: row.offline ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCampaignToRow(c: Campaign): Record<string, unknown> {
  return {
    id: c.id,
    owner_id: c.ownerId,
    name: c.name,
    description: c.description ?? null,
    offline: c.offline,
  };
}

export function mapRowToCategory(row: any): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    schema: row.schema ?? { fields: [] },
    displayTemplate: row.display_template ?? null,
    defaultTags: row.default_tags ?? [],
    isSystem: row.is_system ?? false,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRowToEntity(row: any): EntityRecord {
  return {
    id: row.id,
    categoryId: row.category_id,
    ownerId: row.owner_id,
    kind: row.kind,
    visibility: row.visibility,
    parentId: row.parent_id,
    name: row.name,
    summary: row.summary,
    data: row.data ?? {},
    patch: row.patch ?? null,
    tags: row.tags ?? [],
    license: row.license,
    sourceName: row.source_name,
    rev: row.rev,
    isDefaultVariant: row.is_default_variant ?? false,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _syncState: 'synced',
  };
}

export function mapCategoryToRow(c: Category): Record<string, unknown> {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description ?? null,
    icon: c.icon ?? null,
    schema: c.schema,
    display_template: c.displayTemplate ?? null,
    default_tags: c.defaultTags,
    is_system: c.isSystem,
    owner_id: c.ownerId,
  };
}

/** Pour l'envoi : on n'expose que les colonnes que l'utilisateur peut écrire. */
export function mapEntityToRow(e: EntityRecord): Record<string, unknown> {
  return {
    id: e.id,
    category_id: e.categoryId,
    owner_id: e.ownerId,
    kind: e.kind,
    visibility: e.visibility,
    parent_id: e.parentId,
    name: e.name,
    summary: e.summary ?? null,
    data: e.data,
    patch: e.patch ?? null,
    tags: e.tags,
    license: e.license ?? null,
    source_name: e.sourceName ?? null,
    is_default_variant: e.isDefaultVariant,
    deleted_at: e.deletedAt ?? null,
  };
}
