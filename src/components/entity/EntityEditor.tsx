'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Category, EntityRecord, FieldDef } from '@/types/domain';
import { buildFormSchema } from '@/lib/schema/build-zod';
import { buildDefaults, type EntityFormDefaults } from '@/lib/schema/defaults';
import { entityRepository } from '@/lib/repository/entity-repository';
import { upsertInIndex } from '@/lib/search/local-index';
import { debounce } from '@/lib/utils/debounce';
import { FieldInput, type AnyControl } from './FieldInput';

/**
 * Édition complète d'une fiche, pilotée par le schéma de catégorie.
 * - Validation via Zod généré depuis la catégorie.
 * - Autosave LOCAL débounced (Dexie + index) -> jamais de perte hors ligne.
 * La synchronisation cloud se fait ensuite via l'outbox (bouton « Synchroniser »).
 */
export function EntityEditor({
  entity,
  category,
  onDone,
}: {
  entity: EntityRecord;
  category: Category;
  onDone?: () => void;
}) {
  const schema = useMemo(() => buildFormSchema(category.schema), [category]);
  const defaults = useMemo<EntityFormDefaults>(
    () => buildDefaults(category, entity),
    [category, entity.id],
  );

  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<EntityFormDefaults>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: defaults,
  });

  // Control non typé pour les FieldInput dynamiques (cf. AnyControl).
  const ctrl = control as unknown as AnyControl;

  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Persiste localement les valeurs courantes (appelé en autosave + au submit).
  const persist = useRef(
    debounce((values: EntityFormDefaults) => {
      const updated: EntityRecord = {
        ...entity,
        name: values.name || 'Sans titre',
        summary: values.summary ?? '',
        tags: values.tags ?? [],
        data: { ...entity.data, ...coerceData(category.schema.fields, values.data) },
      };
      entityRepository.save(updated).then((saved) => {
        upsertInIndex(saved);
        setSavedAt(new Date().toLocaleTimeString());
      });
    }, 600),
  ).current;

  // Autosave : on observe le formulaire et on persiste à chaque changement.
  useEffect(() => {
    const sub = watch((values) => persist(values as EntityFormDefaults));
    return () => {
      sub.unsubscribe();
      persist.cancel();
    };
  }, [watch, persist]);

  const grouped = groupFields(category.schema.fields, category.schema.groups);

  return (
    <form
      onSubmit={handleSubmit((v) => {
        persist.cancel();
        persist(v);
        onDone?.();
      })}
      className="px-4 py-5 sm:px-8 sm:py-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-accent">Édition — {category.name}</h2>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {savedAt && <span>Enregistré localement à {savedAt}</span>}
          <button type="submit" className="btn-accent">
            Terminer
          </button>
        </div>
      </div>

      <p className="mb-4 rounded-md border border-border bg-bg-soft px-3 py-2 text-xs text-zinc-500">
        🎲 Astuce : entourez un jet de <code className="text-accent">{'{ }'}</code> pour le rendre
        cliquable — ex. <code className="text-accent">{'{1d8+4}'}</code>,{' '}
        <code className="text-accent">{'{+5}'}</code>, <code className="text-accent">{'{-2}'}</code>.
        Les dés <code className="text-accent">3d8</code> et modificateurs{' '}
        <code className="text-accent">+5</code> sont aussi détectés automatiquement.
      </p>

      {/* Champs de tête (communs à toutes les catégories) */}
      <div className="card mb-4 space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Nom *</label>
          <input className="input" {...register('name')} />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Résumé</label>
          <input className="input" {...register('summary')} />
        </div>
        <FieldInput
          control={ctrl}
          name="tags"
          field={{ key: 'tags', label: 'Tags', type: 'tags' }}
        />
      </div>

      {/* Champs spécifiques à la catégorie, regroupés par section */}
      <div className="space-y-4">
        {grouped.map(({ group, fields }) => (
          <section key={group?.key ?? '_'} className="card p-4">
            {group && <h3 className="mb-2 text-sm font-semibold text-accent">{group.label}</h3>}
            {fields.map((field) => (
              <FieldInput key={field.key} control={ctrl} name={`data.${field.key}`} field={field} />
            ))}
          </section>
        ))}
      </div>
    </form>
  );
}

// --- helpers ----------------------------------------------------------------

/** Convertit les champs numériques (saisis en texte) en nombres pour le stockage. */
function coerceData(fields: FieldDef[], data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) {
    if (f.type === 'number') {
      const v = data[f.key];
      out[f.key] = v === '' || v == null ? undefined : Number(v);
    }
  }
  return out;
}

function groupFields(
  fields: FieldDef[],
  groups?: { key: string; label: string }[],
): { group?: { key: string; label: string }; fields: FieldDef[] }[] {
  if (!groups?.length) return [{ fields }];
  const result: { group?: { key: string; label: string }; fields: FieldDef[] }[] = [];
  const ungrouped = fields.filter((f) => !f.group);
  if (ungrouped.length) result.push({ fields: ungrouped });
  for (const g of groups) {
    const gf = fields.filter((f) => f.group === g.key);
    if (gf.length) result.push({ group: g, fields: gf });
  }
  return result;
}
