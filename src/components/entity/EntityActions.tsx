'use client';

import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { entityRepository } from '@/lib/repository/entity-repository';
import { favoritesRepository } from '@/lib/repository/favorites-repository';
import { upsertInIndex } from '@/lib/search/local-index';
import { useUser } from '@/hooks/use-user';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityKind, EntityRecord } from '@/types/domain';

/**
 * Barre d'actions d'une fiche. Implémente le modèle source/override/variante :
 *  - une SOURCE officielle n'est pas éditable directement -> « Personnaliser »
 *    crée un override perso (copy-on-write) qu'on édite à la place.
 *  - une fiche perso est éditable, duplicable, et restaurable si c'est un override.
 */
export function EntityActions({
  entity,
  editing,
  onToggleEdit,
}: {
  entity: EntityRecord;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const router = useRouter();
  const userId = useUser();
  const openTab = useWorkspace((s) => s.openTab);

  const isFav = useLiveQuery(() => db.favorites.get(entity.id), [entity.id]);
  const isSource = entity.ownerId == null;

  async function fork(kind: Exclude<EntityKind, 'source'>, suffix: string) {
    if (!userId) return;
    const created = await entityRepository.fork(entity, userId, kind, {
      name: kind === 'override' ? entity.name : `${entity.name} ${suffix}`,
    });
    upsertInIndex(created);
    openTab({ entityId: created.id, title: created.name });
    router.push(`/entity/${created.id}?edit=1`);
  }

  async function restore() {
    await entityRepository.restoreOriginal(entity.id);
    if (entity.parentId) router.push(`/entity/${entity.parentId}`);
    else router.push('/dashboard');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="text-xs text-zinc-400 hover:text-accent"
        onClick={() => userId && favoritesRepository.toggle(entity.id, userId)}
        title="Favori"
      >
        {isFav ? '★ Favori' : '☆ Favori'}
      </button>

      <span className="text-zinc-700">|</span>

      {isSource ? (
        <>
          <Action onClick={() => fork('override', '')} label="Personnaliser" />
          <Action onClick={() => fork('variant', '(variante)')} label="Créer une variante" />
          <Action onClick={() => fork('custom', '(copie)')} label="Dupliquer" />
        </>
      ) : (
        <>
          <Action onClick={onToggleEdit} label={editing ? 'Lecture' : 'Modifier'} primary />
          <Action onClick={() => fork('variant', '(variante)')} label="Créer une variante" />
          <Action onClick={() => fork('custom', '(copie)')} label="Dupliquer" />
          {entity.kind === 'override' && (
            <Action onClick={restore} label="Restaurer l'original" />
          )}
        </>
      )}
    </div>
  );
}

function Action({
  onClick,
  label,
  primary,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs ${primary ? 'text-accent hover:underline' : 'text-zinc-400 hover:text-accent'}`}
    >
      {label}
    </button>
  );
}
