/**
 * Import generated info_dnd content into Supabase.
 *
 * Prerequisites:
 *   1. node scripts/build-info-dnd.mjs
 *   2. .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   node scripts/import-info-dnd.mjs
 */

import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

const env = parseEnv(await readFile('.env.local', 'utf8'));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans .env.local');
  process.exit(1);
}

const payload = JSON.parse(await readFile('public/data/info-dnd.generated.json', 'utf8'));
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const toCategoryRow = (c) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description ?? null,
  icon: c.icon ?? null,
  schema: c.schema,
  display_template: c.displayTemplate ?? null,
  default_tags: c.defaultTags ?? [],
  is_system: c.isSystem,
  owner_id: c.ownerId,
});

const toEntityRow = (e) => ({
  id: e.id,
  category_id: e.categoryId,
  owner_id: e.ownerId,
  kind: e.kind,
  visibility: e.visibility,
  parent_id: e.parentId,
  name: e.name,
  summary: e.summary ?? null,
  data: e.data ?? {},
  patch: e.patch ?? null,
  tags: e.tags ?? [],
  license: e.license ?? null,
  source_name: e.sourceName ?? null,
  rev: e.rev ?? 1,
  is_default_variant: e.isDefaultVariant ?? false,
  deleted_at: e.deletedAt ?? null,
});

async function must(label, promise) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

// Vide entièrement entities puis categories.
// parent_id est ON DELETE SET NULL + la contrainte derived_has_parent interdit
// d'orphaner un variant/override : on supprime donc les entités "feuilles"
// (non référencées comme parent) par vagues, jusqu'à vider la table.
async function clearAllContent() {
  let removed = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    const { data: all, error } = await supabase.from('entities').select('id, parent_id');
    if (error) throw new Error(`scan entities: ${error.message}`);
    if (!all.length) break;
    const referenced = new Set(all.map((r) => r.parent_id).filter(Boolean));
    const leaves = all.filter((r) => !referenced.has(r.id)).map((r) => r.id);
    if (!leaves.length) throw new Error('cycle de parent_id détecté, suppression impossible');
    for (const ids of chunk(leaves, 500)) {
      // FK entity_versions / campaign_entities / favorites sont ON DELETE CASCADE.
      await must('delete entities', supabase.from('entities').delete().in('id', ids));
      removed += ids.length;
    }
  }
  // category_id (entities -> categories) est ON DELETE RESTRICT : ok, entities vidée.
  await must('delete categories', supabase.from('categories').delete().not('id', 'is', null));
  return removed;
}

async function run() {
  console.log(`Import info_dnd ${payload.version} -> ${SUPABASE_URL}`);

  // 1. Reset complet de l'ancien contenu.
  const removed = await clearAllContent();
  console.log(`  reset: ${removed} entités supprimées`);

  // 2. Catégories.
  await must(
    'insert categories',
    supabase.from('categories').insert(payload.categories.map(toCategoryRow)),
  );

  // 3. Entités, par lots.
  const rows = payload.entities.map(toEntityRow);
  let done = 0;
  for (const batch of chunk(rows, 250)) {
    await must('insert entities', supabase.from('entities').insert(batch));
    done += batch.length;
    process.stdout.write(`  insert ${done}/${rows.length}\r`);
  }
  process.stdout.write('\n');

  console.log(`Terminé: ${payload.categories.length} catégories, ${rows.length} fiches.`);
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
