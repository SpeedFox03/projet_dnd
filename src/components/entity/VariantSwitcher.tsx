'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { useUser } from '@/hooks/use-user';
import { useWorkspace } from '@/stores/workspace-store';
import type { Category, EntityRecord } from '@/types/domain';
import { DiffView } from './DiffView';

const KIND_BADGE: Record<EntityRecord['kind'], string> = {
  source: 'Source',
  override: 'Ma version',
  variant: 'Variante',
  custom: 'Perso',
};

/**
 * Affiche la « famille » d'une fiche : l'original + l'override perso + les
 * variantes, avec navigation. Permet de comparer à l'original (DiffView).
 * Résout aussi la limite du Sprint 2 : depuis une SOURCE, on signale et on
 * ouvre la version personnalisée si elle existe.
 */
export function VariantSwitcher({
  entity,
  category,
}: {
  entity: EntityRecord;
  category: Category;
}) {
  const router = useRouter();
  const userId = useUser();
  const openTab = useWorkspace((s) => s.openTab);
  const [comparing, setComparing] = useState(false);

  const rootId = entity.parentId ?? entity.id;

  const family = useLiveQuery(
    () =>
      db.entities
        .filter((e) => !e.deletedAt && (e.id === rootId || e.parentId === rootId))
        .toArray(),
    [rootId],
    [],
  );

  const root = family.find((e) => e.id === rootId);
  const myOverride = family.find((e) => e.kind === 'override' && e.ownerId === userId);
  const variants = family.filter((e) => e.kind === 'variant');

  // Rien à afficher si la fiche est isolée (pas de famille).
  if (family.length <= 1 && !myOverride) return null;

  function go(e: EntityRecord) {
    openTab({ entityId: e.id, title: e.name });
    router.push(`/entity/${e.id}`);
  }

  return (
    <div className="border-b border-border bg-bg px-4 py-2">
      {/* Bandeau : depuis l'original, signaler la version perso */}
      {entity.kind === 'source' && myOverride && (
        <div className="mb-2 flex items-center justify-between rounded bg-accent/10 px-3 py-1.5 text-xs">
          <span className="text-accent">Tu as une version personnalisée de cette fiche.</span>
          <button className="font-medium text-accent hover:underline" onClick={() => go(myOverride)}>
            Ouvrir ma version →
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-zinc-500">Versions :</span>
        {[root, myOverride, ...variants].filter(Boolean).map((e) => {
          const item = e as EntityRecord;
          const active = item.id === entity.id;
          return (
            <button
              key={item.id}
              onClick={() => go(item)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${
                active
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-zinc-300 hover:bg-bg-hover'
              }`}
            >
              {item.name}
              <span className="ml-1 text-zinc-600">· {KIND_BADGE[item.kind]}</span>
            </button>
          );
        })}

        {entity.parentId && root && (
          <button
            className="ml-auto text-xs text-zinc-400 hover:text-accent"
            onClick={() => setComparing((v) => !v)}
          >
            {comparing ? 'Fermer la comparaison' : 'Comparer à l’original'}
          </button>
        )}
      </div>

      {comparing && entity.parentId && root && (
        <div className="mt-3">
          <DiffView
            left={root}
            right={entity}
            category={category}
            leftLabel="Version source"
            rightLabel="Cette version"
          />
        </div>
      )}
    </div>
  );
}
