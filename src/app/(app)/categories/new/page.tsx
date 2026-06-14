'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuid } from 'uuid';
import { categoryRepository } from '@/lib/repository/category-repository';
import { useUser } from '@/hooks/use-user';
import type { FieldDef, FieldType } from '@/types/domain';

const FIELD_TYPES: FieldType[] = [
  'text', 'textarea', 'rich', 'number', 'boolean',
  'select', 'multiselect', 'tags', 'list', 'object',
];

interface DraftField extends FieldDef {
  _options?: string; // saisie brute des options (séparées par virgule)
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * SchemaEditor : crée une catégorie personnalisée (no-code). L'utilisateur
 * définit le nom et la liste de champs ; toute fiche de cette catégorie sera
 * ensuite rendue/éditée dynamiquement par FieldRenderer/FieldInput.
 */
export default function NewCategoryPage() {
  const router = useRouter();
  const userId = useUser();

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [fields, setFields] = useState<DraftField[]>([
    { key: 'description', label: 'Description', type: 'rich' },
  ]);
  const [saving, setSaving] = useState(false);

  function updateField(i: number, patch: Partial<DraftField>) {
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }

  async function save() {
    if (!userId || !name.trim()) return;
    setSaving(true);
    const now = new Date().toISOString();
    const slug = slugify(name);
    await categoryRepository.save({
      id: uuid(),
      slug,
      name: name.trim(),
      icon: icon.trim() || null,
      schema: {
        fields: fields
          .filter((f) => f.key.trim() && f.label.trim())
          .map((f) => ({
            key: slugify(f.key),
            label: f.label,
            type: f.type,
            required: f.required,
            options: f._options
              ? f._options.split(',').map((o) => o.trim()).filter(Boolean)
              : undefined,
          })),
      },
      displayTemplate: null,
      defaultTags: [],
      isSystem: false,
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    });
    router.push(`/category/${slug}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="text-xl font-semibold text-zinc-100">Nouvelle catégorie</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Définis un type de contenu et ses champs. Tout est rendu dynamiquement ensuite.
      </p>

      <div className="card mt-4 space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Nom *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Vaisseau, Sortilège maison…" />
          {name && <p className="mt-1 text-xs text-zinc-600">slug : {slugify(name)}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-zinc-500">Icône (nom lucide, optionnel)</label>
          <input className="input" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="ex : rocket" />
        </div>
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Champs</h2>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="card flex flex-wrap items-end gap-2 p-3">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase text-zinc-600">Libellé</label>
              <input className="input" value={f.label} onChange={(e) => updateField(i, { label: e.target.value, key: f.key || e.target.value })} />
            </div>
            <div className="w-36">
              <label className="mb-1 block text-[10px] uppercase text-zinc-600">Type</label>
              <select className="input" value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })}>
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {(f.type === 'select' || f.type === 'multiselect') && (
              <div className="w-full">
                <label className="mb-1 block text-[10px] uppercase text-zinc-600">Options (séparées par des virgules)</label>
                <input className="input" value={f._options ?? ''} onChange={(e) => updateField(i, { _options: e.target.value })} />
              </div>
            )}
            <label className="flex items-center gap-1 text-xs text-zinc-400">
              <input type="checkbox" className="accent-accent" checked={!!f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
              requis
            </label>
            <button className="btn-ghost px-2" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button
          className="btn-ghost text-xs"
          onClick={() => setFields((fs) => [...fs, { key: '', label: '', type: 'text' }])}
        >
          + Ajouter un champ
        </button>
      </div>

      <div className="mt-6 flex justify-end">
        <button className="btn-accent" onClick={save} disabled={!userId || !name.trim() || saving}>
          {saving ? 'Création…' : 'Créer la catégorie'}
        </button>
      </div>
    </div>
  );
}
