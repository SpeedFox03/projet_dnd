'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchLocal } from '@/lib/search/local-index';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityRecord } from '@/types/domain';

/**
 * Barre de recherche globale (façon moteur de recherche). Interroge l'index
 * MiniSearch local -> résultats instantanés, hors ligne. Entrée ouvre la
 * recherche complète ; cliquer un résultat ouvre la fiche en onglet.
 */
export function GlobalSearchBar() {
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<EntityRecord[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ids = searchLocal(q).slice(0, 8).map((h) => h.id);
    db.entities.bulkGet(ids).then((rows) => {
      if (active) setHits(rows.filter((r): r is EntityRecord => !!r));
    });
    return () => {
      active = false;
    };
  }, [q]);

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

  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
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
          if (e.key === 'Enter') {
            router.push(`/search?q=${encodeURIComponent(q)}`);
            setOpen(false);
          }
        }}
      />

      {open && hits.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-bg-panel shadow-xl">
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
