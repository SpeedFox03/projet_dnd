'use client';

import { useMemo, useState } from 'react';
import type { Category, EntityRecord, FieldDef } from '@/types/domain';

// Contrôle compact partagé (inputs/selects de la barre d'outils).
const CTRL =
  'rounded-md border border-border bg-bg-soft px-2 py-1 text-xs text-zinc-200 outline-none focus:border-accent max-w-[11rem]';

/**
 * Liste d'une catégorie avec recherche + tri + filtres GÉNÉRÉS dynamiquement
 * depuis le schéma de la catégorie :
 *  - tri par n'importe quel champ texte/nombre/select (PV, CA, FP, niveau…),
 *    tri numérique intelligent (gère "0.25", "1/8" via numeric collation),
 *  - filtres déroulants sur les champs select/texte à faible cardinalité
 *    (type, taille, rareté, école…) + un filtre par tag.
 */
export function CategoryBrowser({
  category,
  entities,
  onOpen,
}: {
  category: Category;
  entities: EntityRecord[];
  onOpen: (e: EntityRecord) => void;
}) {
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('@name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [tag, setTag] = useState('');

  // Champs sur lesquels on peut trier.
  const sortFields = useMemo(
    () => category.schema.fields.filter((f) => ['number', 'text', 'select'].includes(f.type)),
    [category],
  );

  // Champs filtrables = vraies catégories (peu de valeurs, réutilisées, non
  // numériques). Exclut les champs « mesure » (dégâts, prix, portée, poids…).
  const filterFields = useMemo(() => {
    const out: { field: FieldDef; values: string[] }[] = [];
    for (const f of category.schema.fields) {
      if (!['select', 'text', 'tags', 'multiselect'].includes(f.type)) continue;
      const vals = new Set<string>();
      for (const e of entities) {
        const v = e.data[f.key];
        if (typeof v === 'string' && v.trim()) vals.add(v);
      }
      if (vals.size < 2 || vals.size > 20) continue;
      // Les valeurs sont des catégories ? (sinon : mesures type "1d8", "15 gp")
      if (f.type === 'text') {
        const numeric = [...vals].filter((v) => /\d/.test(v)).length;
        if (numeric / vals.size > 0.4) continue;
      }
      out.push({ field: f, values: [...vals].sort((a, b) => a.localeCompare(b, 'fr')) });
    }
    return out;
  }, [category, entities]);

  const tagValues = useMemo(() => {
    const s = new Set<string>();
    for (const e of entities) e.tags.forEach((t) => s.add(t));
    return [...s].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [entities]);

  const view = useMemo(() => {
    let list = entities;
    if (q.trim()) {
      const ql = q.toLowerCase();
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(ql) ||
          (e.summary ?? '').toLowerCase().includes(ql) ||
          JSON.stringify(e.data).toLowerCase().includes(ql),
      );
    }
    for (const [k, val] of Object.entries(filters)) {
      if (val) list = list.filter((e) => String(e.data[k] ?? '') === val);
    }
    if (tag) list = list.filter((e) => e.tags.includes(tag));
    return [...list].sort((a, b) => cmp(a, b, sortKey, sortDir));
  }, [entities, q, filters, tag, sortKey, sortDir]);

  return (
    <div className="mt-4">
      {/* Barre d'outils compacte */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
        <input
          className={`${CTRL} w-48`}
          placeholder="Filtrer…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <span className="ml-1 text-zinc-500">Trier</span>
        <select className={CTRL} value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
          <option value="@name">Nom</option>
          {sortFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          className="rounded-md border border-border px-1.5 py-1 text-zinc-300 hover:bg-bg-hover"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          title={sortDir === 'asc' ? 'Croissant' : 'Décroissant'}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        {filterFields.map(({ field, values }) => (
          <select
            key={field.key}
            className={CTRL}
            value={filters[field.key] ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, [field.key]: e.target.value }))}
          >
            <option value="">{field.label}</option>
            {values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ))}

        {tagValues.length > 1 && (
          <select className={CTRL} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Tag</option>
            {tagValues.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        )}

        {(q || tag || Object.values(filters).some(Boolean)) && (
          <button
            className="text-zinc-500 hover:text-accent"
            onClick={() => {
              setQ('');
              setTag('');
              setFilters({});
            }}
          >
            ✕ Réinitialiser
          </button>
        )}
      </div>

      <p className="mb-2 text-xs text-zinc-500">{view.length} résultat(s)</p>

      <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        {view.map((e) => (
          <button
            key={e.id}
            onClick={() => onOpen(e)}
            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-bg-hover"
          >
            <div className="min-w-0">
              <div className="truncate font-medium text-zinc-100">{e.name}</div>
              {e.summary && <div className="truncate text-xs text-zinc-500">{e.summary}</div>}
            </div>
            {sortKey !== '@name' && (
              <span className="ml-2 shrink-0 rounded bg-bg-soft px-2 py-0.5 text-xs text-accent">
                {String(e.data[sortKey] ?? '—')}
              </span>
            )}
          </button>
        ))}
        {view.length === 0 && (
          <p className="px-4 py-6 text-sm text-zinc-600">Aucun résultat avec ces filtres.</p>
        )}
      </div>
    </div>
  );
}

// --- tri ---------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function cmp(a: EntityRecord, b: EntityRecord, key: string, dir: 'asc' | 'desc'): number {
  const av = key === '@name' ? a.name : a.data[key];
  const bv = key === '@name' ? b.name : b.data[key];
  const an = toNum(av);
  const bn = toNum(bv);
  let r: number;
  if (an != null && bn != null) r = an - bn;
  else if (an != null) r = -1; // valeurs numériques avant les vides
  else if (bn != null) r = 1;
  else r = String(av ?? '').localeCompare(String(bv ?? ''), 'fr', { numeric: true });
  return dir === 'asc' ? r : -r;
}
