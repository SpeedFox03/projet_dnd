/**
 * Index de recherche local (MiniSearch) — recherche full-text instantanée,
 * 100% hors ligne, reconstruit depuis Dexie. C'est l'index utilisé par défaut
 * dans l'UI ; Postgres FTS sert de repli/recherche serveur (v2).
 */

import MiniSearch from 'minisearch';
import { db } from '@/lib/db/local-db';
import type { EntityRecord } from '@/types/domain';

interface IndexedDoc {
  id: string;
  name: string;
  summary: string;
  tags: string;
  body: string;
  categoryId: string;
  kind: string;
}

let mini: MiniSearch<IndexedDoc> | null = null;

function toDoc(e: EntityRecord): IndexedDoc {
  return {
    id: e.id,
    name: e.name,
    summary: e.summary ?? '',
    tags: e.tags.join(' '),
    body: JSON.stringify(e.data),
    categoryId: e.categoryId,
    kind: e.kind,
  };
}

/** (Re)construit l'index complet depuis Dexie. À appeler au boot. */
export async function buildSearchIndex(): Promise<void> {
  const all = await db.entities.filter((e) => !e.deletedAt).toArray();
  mini = new MiniSearch<IndexedDoc>({
    fields: ['name', 'summary', 'tags', 'body'],
    storeFields: ['categoryId', 'kind'],
    searchOptions: {
      boost: { name: 4, summary: 2, tags: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  mini.addAll(all.map(toDoc));
}

/** Mise à jour incrémentale après une édition. */
export function upsertInIndex(entity: EntityRecord): void {
  if (!mini) return;
  const doc = toDoc(entity);
  if (mini.has(entity.id)) mini.replace(doc);
  else mini.add(doc);
}

export function removeFromIndex(id: string): void {
  if (mini?.has(id)) mini.discard(id);
}

export interface LocalSearchHit {
  id: string;
  score: number;
  categoryId: string;
  kind: string;
}

export function searchLocal(query: string): LocalSearchHit[] {
  if (!mini || !query.trim()) return [];
  return mini.search(query).map((r) => ({
    id: r.id as string,
    score: r.score,
    categoryId: (r as unknown as IndexedDoc).categoryId,
    kind: (r as unknown as IndexedDoc).kind,
  }));
}
