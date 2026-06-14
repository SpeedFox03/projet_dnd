'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityRecord } from '@/types/domain';

/**
 * Rétroliens (backlinks) : liste les fiches qui mentionnent celle-ci via un
 * lien [[Nom]]. Recherche locale dans le contenu sérialisé.
 */
export function BacklinksPanel({ entity }: { entity: EntityRecord }) {
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);

  const backlinks = useLiveQuery(async () => {
    const needle = `[[${entity.name.toLowerCase()}]]`;
    const all = await db.entities.filter((e) => !e.deletedAt && e.id !== entity.id).toArray();
    return all.filter((e) => JSON.stringify(e.data).toLowerCase().includes(needle));
  }, [entity.id, entity.name], []);

  if (!backlinks.length) return null;

  function go(e: EntityRecord) {
    openTab({ entityId: e.id, title: e.name });
    router.push(`/entity/${e.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-8">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Mentionnée dans ({backlinks.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {backlinks.map((e) => (
          <button
            key={e.id}
            onClick={() => go(e)}
            className="rounded-md border border-border bg-bg-soft px-2.5 py-1 text-xs text-zinc-300 hover:border-accent/50"
          >
            {e.name}
          </button>
        ))}
      </div>
    </div>
  );
}
