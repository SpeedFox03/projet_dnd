'use client';

import type { FieldDef } from '@/types/domain';
import { RichText } from './RichText';
import { renderRollableText } from '@/components/dice/Rollable';

/**
 * Rend UNE valeur de champ en lecture seule, selon son `type` déclaré dans le
 * schéma de la catégorie. C'est le coeur de l'affichage dynamique : aucune
 * fiche n'est codée en dur, tout dérive du schéma + des données.
 */
export function FieldRenderer({ field, value }: { field: FieldDef; value: unknown }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return null;
  }

  return (
    <div className="py-2">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {field.label}
      </div>
      <div className="text-sm text-zinc-200">{renderValue(field, value)}</div>
    </div>
  );
}

function renderValue(field: FieldDef, value: unknown): React.ReactNode {
  switch (field.type) {
    case 'image': {
      const src = String(value);
      return (
        <a href={src} target="_blank" rel="noreferrer" className="block">
          <img
            src={src}
            alt={field.label}
            className="max-h-[420px] w-full rounded-md border border-border object-contain"
          />
        </a>
      );
    }

    case 'boolean':
      return value ? 'Oui' : 'Non';

    case 'tags':
    case 'multiselect':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((t) => (
            <span
              key={t}
              className="rounded-full border border-border bg-bg-soft px-2 py-0.5 text-xs text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      );

    case 'list':
      return (
        <ul className="list-disc space-y-1 pl-5">
          {(value as string[]).map((item, i) => (
            <li key={i}>{renderRollableText(String(item))}</li>
          ))}
        </ul>
      );

    case 'object':
      // Ex. caractéristiques d'un monstre : "12 (+1)". Le modificateur devient
      // cliquable -> jet 1d20 + modificateur, étiqueté par la stat (SAG, FOR…).
      return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 rounded bg-bg-soft px-2 py-1">
              <span className="uppercase text-zinc-500">{k}</span>
              <span className="font-medium text-zinc-100">{renderRollableText(String(v), k)}</span>
            </div>
          ))}
        </div>
      );

    case 'rich':
    case 'textarea':
      // Rend les liens [[Fiche]] cliquables (style Obsidian).
      return <RichText text={String(value)} />;

    default:
      return <span>{renderRollableText(String(value))}</span>;
  }
}
