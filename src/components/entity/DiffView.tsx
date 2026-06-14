'use client';

import type { Category, EntityRecord, FieldDef } from '@/types/domain';

/**
 * Compare deux fiches champ par champ (selon le schéma de catégorie).
 * Utilisé pour « comparer source / version perso » et pour la résolution
 * de conflits (mien vs distant). Les différences sont surlignées.
 */
export function DiffView({
  left,
  right,
  category,
  leftLabel = 'Version source',
  rightLabel = 'Version modifiée',
}: {
  left: EntityRecord;
  right: EntityRecord;
  category: Category;
  leftLabel?: string;
  rightLabel?: string;
}) {
  // Champs de tête + champs de la catégorie.
  const rows: { key: string; label: string }[] = [
    { key: '@name', label: 'Nom' },
    { key: '@summary', label: 'Résumé' },
    { key: '@tags', label: 'Tags' },
    ...category.schema.fields.map((f: FieldDef) => ({ key: f.key, label: f.label })),
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-2 border-b border-border bg-bg-soft text-xs font-semibold">
        <div className="px-3 py-2 text-zinc-400">{leftLabel}</div>
        <div className="border-l border-border px-3 py-2 text-accent">{rightLabel}</div>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((r) => {
          const lv = pick(left, r.key);
          const rv = pick(right, r.key);
          const differ = stringify(lv) !== stringify(rv);
          if (!present(lv) && !present(rv)) return null;
          return (
            <div key={r.key} className="grid grid-cols-2 text-sm">
              <Cell value={lv} differ={differ} side="left" label={r.label} />
              <Cell value={rv} differ={differ} side="right" label={r.label} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cell({
  value,
  differ,
  side,
  label,
}: {
  value: unknown;
  differ: boolean;
  side: 'left' | 'right';
  label: string;
}) {
  return (
    <div
      className={`px-3 py-2 ${side === 'right' ? 'border-l border-border' : ''} ${
        differ ? (side === 'right' ? 'bg-accent/10' : 'bg-red-500/5') : ''
      }`}
    >
      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-zinc-600">{label}</div>
      <div className="whitespace-pre-wrap text-zinc-200">{stringify(value) || '—'}</div>
    </div>
  );
}

function pick(e: EntityRecord, key: string): unknown {
  if (key === '@name') return e.name;
  if (key === '@summary') return e.summary;
  if (key === '@tags') return e.tags;
  return e.data?.[key];
}

function present(v: unknown): boolean {
  return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
}

function stringify(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
