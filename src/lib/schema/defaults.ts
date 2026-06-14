/**
 * Valeurs par défaut d'un formulaire de fiche, dérivées du schéma de catégorie
 * et fusionnées avec les données existantes de l'entité.
 */

import type { Category, EntityRecord, FieldDef } from '@/types/domain';

function emptyValue(f: FieldDef): unknown {
  switch (f.type) {
    case 'number':
      return '';
    case 'boolean':
      return false;
    case 'tags':
    case 'multiselect':
    case 'list':
      return [];
    case 'object':
      return {};
    default:
      return '';
  }
}

export interface EntityFormDefaults {
  name: string;
  summary: string;
  tags: string[];
  data: Record<string, unknown>;
}

export function buildDefaults(
  category: Category,
  entity?: Partial<EntityRecord>,
): EntityFormDefaults {
  const data: Record<string, unknown> = {};
  for (const f of category.schema.fields) {
    const existing = entity?.data?.[f.key];
    data[f.key] = existing ?? emptyValue(f);
  }
  return {
    name: entity?.name ?? '',
    summary: entity?.summary ?? '',
    tags: entity?.tags ?? category.defaultTags ?? [],
    data,
  };
}
