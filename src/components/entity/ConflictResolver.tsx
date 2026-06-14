'use client';

import { useState } from 'react';
import type { Category, EntityRecord } from '@/types/domain';
import { entityRepository } from '@/lib/repository/entity-repository';
import { upsertInIndex } from '@/lib/search/local-index';
import { db } from '@/lib/db/local-db';
import { DiffView } from './DiffView';

/**
 * S'affiche quand une fiche est en conflit de synchronisation : on présente la
 * version locale et la version distante côte à côte, l'utilisateur tranche.
 */
export function ConflictResolver({
  entity,
  category,
}: {
  entity: EntityRecord;
  category: Category;
}) {
  const [open, setOpen] = useState(false);

  if (entity._syncState !== 'conflict' || !entity._remote) return null;

  async function keepLocal() {
    await entityRepository.resolveKeepLocal(entity.id);
    setOpen(false);
  }
  async function keepRemote() {
    await entityRepository.resolveKeepRemote(entity.id);
    const fresh = await db.entities.get(entity.id);
    if (fresh) upsertInIndex(fresh);
    setOpen(false);
  }

  return (
    <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-red-300">
          ⚠ Conflit de synchronisation : cette fiche a été modifiée ailleurs.
        </span>
        <button className="btn-ghost text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? 'Masquer' : 'Résoudre'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3">
          <DiffView
            left={entity._remote}
            right={entity}
            category={category}
            leftLabel="Version distante"
            rightLabel="Ma version locale"
          />
          <div className="flex gap-2">
            <button className="btn-accent" onClick={keepLocal}>
              Garder ma version
            </button>
            <button className="btn-ghost" onClick={keepRemote}>
              Garder la version distante
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
