'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';

export default function DashboardPage() {
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);

  const recent = useLiveQuery(
    () => db.entities.orderBy('updatedAt').reverse().filter((e) => !e.deletedAt).limit(12).toArray(),
    [],
    [],
  );
  const campaignEntities = useLiveQuery(async () => {
    const category = await db.categories.where('slug').equals('campaign').first();
    if (!category) return [];
    return db.entities
      .where('categoryId')
      .equals(category.id)
      .filter((e) => !e.deletedAt)
      .toArray();
  }, [], []);
  const total = useLiveQuery(() => db.entities.filter((e) => !e.deletedAt).count(), [], 0);

  function open(id: string, title: string) {
    openTab({ entityId: id, title });
    router.push(`/entity/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-6">
      <h1 className="text-xl font-semibold text-zinc-100">Tableau de bord</h1>
      <p className="mt-1 text-sm text-zinc-500">{total} fiche(s) disponibles hors ligne.</p>

      {campaignEntities.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Campagnes
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {campaignEntities.map((e) => (
              <button
                key={e.id}
                onClick={() => open(e.id, e.name)}
                className="group overflow-hidden rounded-lg border border-border bg-bg-soft text-left transition-colors hover:border-accent/50"
              >
                {typeof e.data.coverImage === 'string' && e.data.coverImage && (
                  <img
                    src={e.data.coverImage}
                    alt=""
                    className="h-36 w-full border-b border-border object-cover object-top opacity-90 transition-opacity group-hover:opacity-100"
                  />
                )}
                <div className="p-3">
                  <div className="truncate font-medium text-zinc-100">{e.name}</div>
                  <div className="mt-1 truncate text-xs text-zinc-500">{e.summary ?? 'Campagne'}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Récents
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {recent.map((e) => (
          <button
            key={e.id}
            onClick={() => open(e.id, e.name)}
            className="card p-3 text-left transition-colors hover:border-accent/50"
          >
            <div className="truncate font-medium text-zinc-100">{e.name}</div>
            <div className="mt-1 truncate text-xs text-zinc-500">{e.summary ?? e.kind}</div>
          </button>
        ))}
        {recent.length === 0 && (
          <p className="text-sm text-zinc-600">Rien encore. Synchronise ou crée une fiche.</p>
        )}
      </div>
    </div>
  );
}
