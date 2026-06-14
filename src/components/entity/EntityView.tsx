'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import type { Category, EntityRecord, FieldDef } from '@/types/domain';
import { FieldRenderer } from './FieldRenderer';

const KIND_LABEL: Record<EntityRecord['kind'], string> = {
  source: 'Source officielle',
  custom: 'Perso',
  variant: 'Variante',
  override: 'Modifiée',
};

/**
 * Affiche une fiche complète en lecture, entièrement pilotée par le schéma de
 * sa catégorie. Réactif : se met à jour si la donnée locale change (édition/sync).
 */
export function EntityView({ entityId }: { entityId: string }) {
  const entity = useLiveQuery(() => db.entities.get(entityId), [entityId]);
  const category = useLiveQuery(
    () => (entity ? db.categories.get(entity.categoryId) : undefined),
    [entity?.categoryId],
  );

  if (!entity) {
    return <div className="p-6 text-sm text-zinc-500">Fiche introuvable hors ligne.</div>;
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-6">
      <header className="mb-6 border-b border-border pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded bg-bg-soft px-2 py-0.5 text-xs text-zinc-400">
            {category?.name ?? '…'}
          </span>
          <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {KIND_LABEL[entity.kind]}
          </span>
          {entity.license && (
            <span className="text-xs text-zinc-600">{entity.license}</span>
          )}
        </div>
        <h1 className="text-2xl font-semibold text-zinc-50">{entity.name}</h1>
        {entity.summary && <p className="mt-1 text-zinc-400">{entity.summary}</p>}
        {entity.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {entity.tags.map((t) => (
              <span key={t} className="rounded-full border border-border px-2 py-0.5 text-xs text-zinc-400">
                #{t}
              </span>
            ))}
          </div>
        )}
      </header>

      {category ? (
        <FieldGroups category={category} entity={entity} />
      ) : (
        <p className="text-sm text-zinc-500">Schéma de catégorie indisponible.</p>
      )}
    </article>
  );
}

/** Rend les champs regroupés par section (selon `schema.groups`). */
function FieldGroups({ category, entity }: { category: Category; entity: EntityRecord }) {
  const { fields, groups } = category.schema;

  // Sans groupes définis : on rend tout à plat.
  if (!groups?.length) {
    return <FieldList fields={fields} data={entity.data} />;
  }

  // Champs sans groupe -> section implicite en tête.
  const ungrouped = fields.filter((f) => !f.group);

  return (
    <div className="space-y-6">
      {ungrouped.length > 0 && <FieldList fields={ungrouped} data={entity.data} />}
      {groups.map((g) => {
        const groupFields = fields.filter((f) => f.group === g.key);
        if (!groupFields.length) return null;
        return (
          <section key={g.key} className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-accent">{g.label}</h2>
            <FieldList fields={groupFields} data={entity.data} />
          </section>
        );
      })}
    </div>
  );
}

function FieldList({ fields, data }: { fields: FieldDef[]; data: Record<string, unknown> }) {
  return (
    <div className="divide-y divide-border/50">
      {fields.map((f) => (
        <FieldRenderer key={f.key} field={f} value={data[f.key]} />
      ))}
    </div>
  );
}
