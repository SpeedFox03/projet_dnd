'use client';

import { db, getMeta, setMeta } from '@/lib/db/local-db';
import type { Category, EntityRecord } from '@/types/domain';

const SEED_META_KEY = 'info_dnd_seed_version';
const SEED_URL = '/data/info-dnd.generated.json';

/**
 * Flag localStorage : quand présent, le seed local (fichiers perso) est ignoré.
 * Posé par `resetLocal()` pour ne garder QUE le contenu de la base Supabase.
 */
export const SKIP_LOCAL_SEED_KEY = 'dnd:skipLocalSeed';

export function isLocalSeedSkipped(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.localStorage.getItem(SKIP_LOCAL_SEED_KEY) === '1'
  );
}

interface InfoDndPayload {
  version: string;
  categories: Category[];
  entities: EntityRecord[];
}

let running: Promise<void> | null = null;

export function seedInfoDnd(): Promise<void> {
  running ??= doSeed().finally(() => {
    running = null;
  });
  return running;
}

async function doSeed(): Promise<void> {
  // L'utilisateur a réinitialisé en « base de données seule » : pas de fichiers perso.
  if (isLocalSeedSkipped()) return;

  const res = await fetch(SEED_URL, { cache: 'no-store' });
  if (!res.ok) return;

  const payload = (await res.json()) as InfoDndPayload;
  if (!payload.version || !payload.categories?.length) return;

  const current = await getMeta<string>(SEED_META_KEY);
  if (current === payload.version) return;

  await db.transaction('rw', db.categories, db.entities, db.meta, async () => {
    await db.entities
      .filter((e) => e.ownerId == null && (e.kind === 'source' || e.visibility === 'official'))
      .delete();
    await db.categories.filter((c) => c.ownerId == null && c.isSystem).delete();

    await db.categories.bulkPut(payload.categories);
    await db.entities.bulkPut(payload.entities.map((e) => ({ ...e, _syncState: 'synced' })));
    await setMeta(SEED_META_KEY, payload.version);
  });
}
