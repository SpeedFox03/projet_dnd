'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { searchLocal } from '@/lib/search/local-index';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityRecord } from '@/types/domain';

function SearchInner() {
  const router = useRouter();
  const params = useSearchParams();
  const openTab = useWorkspace((s) => s.openTab);
  const initial = params.get('q') ?? '';

  const [q, setQ] = useState(initial);
  const [catId, setCatId] = useState('');
  const [results, setResults] = useState<EntityRecord[]>([]);

  const categories = useLiveQuery(
    () => db.categories.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))),
    [],
    [],
  );
  const catName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of categories) m[c.id] = c.name;
    return m;
  }, [categories]);

  useEffect(() => {
    let active = true;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    // On élargit la recherche puis on filtre par catégorie si demandé.
    const ids = searchLocal(q).map((h) => h.id);
    db.entities.bulkGet(ids).then((rows) => {
      if (!active) return;
      const filtered = rows.filter(
        (r): r is EntityRecord => !!r && !r.deletedAt && (!catId || r.categoryId === catId),
      );
      setResults(filtered);
    });
    return () => {
      active = false;
    };
  }, [q, catId]);

  function open(e: EntityRecord) {
    openTab({ entityId: e.id, title: e.name });
    router.push(`/entity/${e.id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="flex gap-2">
        <input
          autoFocus
          className="input text-base"
          placeholder="Recherche globale…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input max-w-[12rem] py-1.5"
          value={catId}
          onChange={(e) => setCatId(e.target.value)}
        >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{results.length} résultat(s)</p>

      <div className="mt-3 space-y-1">
        {results.map((e) => (
          <button
            key={e.id}
            onClick={() => open(e)}
            className="flex w-full items-center justify-between rounded-md border border-border bg-bg-panel px-4 py-2.5 text-left hover:border-accent/50"
          >
            <div className="min-w-0">
              <div className="truncate text-zinc-100">{e.name}</div>
              {e.summary && <div className="truncate text-xs text-zinc-500">{e.summary}</div>}
            </div>
            <span className="ml-2 shrink-0 text-xs text-zinc-500">{catName[e.categoryId] ?? e.kind}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchInner />
    </Suspense>
  );
}
