'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { searchLocal } from '@/lib/search/local-index';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityRecord } from '@/types/domain';

/**
 * Barre de recherche globale (façon moteur de recherche), présente en
 * permanence dans la topbar. Interroge l'index MiniSearch local -> résultats
 * instantanés, hors ligne. Un filtre par catégorie permet de restreindre.
 * Entrée ouvre la recherche complète ; cliquer un résultat ouvre la fiche.
 */
export function GlobalSearchBar() {
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);
  const [q, setQ] = useState('');
  const [catId, setCatId] = useState('');
  const [hits, setHits] = useState<EntityRecord[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const categories = useLiveQuery(
    () => db.categories.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))),
    [],
    [],
  );

  useEffect(() => {
    let active = true;
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ids = searchLocal(q).map((h) => h.id);
    db.entities.bulkGet(ids).then((rows) => {
      if (!active) return;
      const filtered = rows.filter(
        (r): r is EntityRecord => !!r && !r.deletedAt && (!catId || r.categoryId === catId),
      );
      setHits(filtered.slice(0, 8));
    });
    return () => {
      active = false;
    };
  }, [q, catId]);

  // Ferme le menu au clic extérieur.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function go(entity: EntityRecord) {
    openTab({ entityId: entity.id, title: entity.name });
    router.push(`/entity/${entity.id}`);
    setOpen(false);
    setQ('');
  }

  function submit() {
    const params = new URLSearchParams({ q });
    if (catId) params.set('cat', catId);
    router.push(`/search?${params.toString()}`);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative flex w-full max-w-2xl items-center gap-2">
      <input
        className="input"
        placeholder="Rechercher monstres, sorts, objets, notes…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />

      <select
        className="input hidden w-40 shrink-0 py-2 sm:block"
        value={catId}
        onChange={(e) => setCatId(e.target.value)}
        title="Filtrer par catégorie"
      >
        <option value="">Toutes catégories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {open && hits.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-bg-panel shadow-xl">
          {hits.map((h) => (
            <button
              key={h.id}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg-hover"
              onClick={() => go(h)}
            >
              <span className="truncate text-zinc-100">{h.name}</span>
              <span className="ml-2 shrink-0 text-xs text-zinc-500">{h.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
