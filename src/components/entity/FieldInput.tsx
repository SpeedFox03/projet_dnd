'use client';

import { useController, type Control } from 'react-hook-form';
import type { FieldDef } from '@/types/domain';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Le formulaire de fiche est dynamique (data dépend de la catégorie) : on
// travaille avec un Control non typé. Alias dédié pour éviter `any` ailleurs.
export type AnyControl = Control<any>;

/**
 * Rend le contrôle d'édition adapté au `type` du champ (déclaré dans le schéma
 * de la catégorie). Symétrique de FieldRenderer, mais en écriture.
 */
export function FieldInput({
  control,
  name,
  field,
}: {
  control: AnyControl;
  name: string;
  field: FieldDef;
}) {
  const { field: f, fieldState } = useController({ control, name });

  return (
    <div className="py-2">
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {field.label}
        {field.required && <span className="ml-1 text-accent">*</span>}
      </label>
      {renderControl(field, f)}
      {field.help && <p className="mt-1 text-xs text-zinc-600">{field.help}</p>}
      {fieldState.error && (
        <p className="mt-1 text-xs text-red-400">{fieldState.error.message as string}</p>
      )}
    </div>
  );
}

function renderControl(field: FieldDef, f: any) {
  switch (field.type) {
    case 'number':
      return (
        <input
          type="number"
          className="input"
          value={f.value ?? ''}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
        />
      );

    case 'boolean':
      return (
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent"
          checked={!!f.value}
          onChange={(e) => f.onChange(e.target.checked)}
        />
      );

    case 'select':
      return (
        <select className="input" value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );

    case 'textarea':
    case 'rich':
      return (
        <textarea
          className="input min-h-[100px] resize-y"
          value={f.value ?? ''}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
        />
      );

    case 'image':
      return (
        <input
          type="url"
          className="input"
          placeholder="/images/..."
          value={f.value ?? ''}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
        />
      );

    case 'tags':
    case 'multiselect':
      return <ChipsInput value={f.value ?? []} onChange={f.onChange} suggestions={field.options} />;

    case 'list':
      return <ListInput value={f.value ?? []} onChange={f.onChange} />;

    case 'object':
      return <ObjectInput value={f.value ?? {}} onChange={f.onChange} />;

    default:
      return (
        <input
          className="input"
          value={f.value ?? ''}
          onChange={(e) => f.onChange(e.target.value)}
          onBlur={f.onBlur}
        />
      );
  }
}

// --- Sous-éditeurs -----------------------------------------------------------

function ChipsInput({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
}) {
  const add = (raw: string) => {
    const v = raw.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
  };
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1.5">
        {value.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full border border-border bg-bg-soft px-2 py-0.5 text-xs text-zinc-300"
          >
            {t}
            <button
              type="button"
              className="text-zinc-500 hover:text-red-400"
              onClick={() => onChange(value.filter((x) => x !== t))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        placeholder="Ajouter… (Entrée)"
        list={suggestions ? 'chip-suggestions' : undefined}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = '';
          }
        }}
      />
      {suggestions && (
        <datalist id="chip-suggestions">
          {suggestions.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function ListInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      {value.map((item, i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input"
            value={item}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost text-xs" onClick={() => onChange([...value, ''])}>
        + Ajouter une ligne
      </button>
    </div>
  );
}

function ObjectInput({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(value);
  const setKey = (oldKey: string, newKey: string) => {
    const next: Record<string, unknown> = {};
    for (const [k, v] of entries) next[k === oldKey ? newKey : k] = v;
    onChange(next);
  };
  const setVal = (k: string, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-1">
      {entries.map(([k, v], i) => (
        <div key={i} className="flex gap-2">
          <input
            className="input w-1/3"
            value={k}
            onChange={(e) => setKey(k, e.target.value)}
            placeholder="clé"
          />
          <input
            className="input"
            value={String(v ?? '')}
            onChange={(e) => setVal(k, e.target.value)}
            placeholder="valeur"
          />
          <button
            type="button"
            className="btn-ghost px-2"
            onClick={() => {
              const next = { ...value };
              delete next[k];
              onChange(next);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-ghost text-xs"
        onClick={() => onChange({ ...value, '': '' })}
      >
        + Ajouter un champ
      </button>
    </div>
  );
}
