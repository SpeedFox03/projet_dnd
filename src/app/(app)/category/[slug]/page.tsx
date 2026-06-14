'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { entityRepository } from '@/lib/repository/entity-repository';
import { upsertInIndex } from '@/lib/search/local-index';
import { useUser } from '@/hooks/use-user';
import { useWorkspace } from '@/stores/workspace-store';
import { CategoryBrowser } from '@/components/category/CategoryBrowser';
import type { EntityRecord } from '@/types/domain';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const userId = useUser();
  const openTab = useWorkspace((s) => s.openTab);

  const category = useLiveQuery(() => db.categories.where('slug').equals(slug).first(), [slug]);
  const entities = useLiveQuery(
    () =>
      category
        ? db.entities
            .where('categoryId')
            .equals(category.id)
            .filter((e) => !e.deletedAt)
            .toArray()
        : [],
    [category?.id],
    [],
  );

  function open(e: EntityRecord) {
    openTab({ entityId: e.id, title: e.name });
    router.push(`/entity/${e.id}`);
  }

  async function createNew() {
    if (!userId || !category) return;
    const blank = entityRepository.blank(category.id, userId);
    await entityRepository.save(blank);
    upsertInIndex(blank);
    openTab({ entityId: blank.id, title: blank.name });
    router.push(`/entity/${blank.id}?edit=1`);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{category?.name ?? slug}</h1>
          <p className="mt-1 text-sm text-zinc-500">{entities.length} fiche(s)</p>
        </div>
        <button className="btn-accent" onClick={createNew} disabled={!userId || !category}>
          + Nouvelle fiche
        </button>
      </div>

      {category ? (
        <CategoryBrowser category={category} entities={entities} onOpen={open} />
      ) : (
        <p className="mt-6 text-sm text-zinc-600">Catégorie introuvable.</p>
      )}
    </div>
  );
}
