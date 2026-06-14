'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useState } from 'react';
import { db } from '@/lib/db/local-db';
import { syncEngine } from '@/lib/sync/sync-engine';
import { buildSearchIndex } from '@/lib/search/local-index';

/**
 * Expose l'état de sync : nombre de mutations en attente (outbox), conflits,
 * et une action `sync()` manuelle.
 */
export function useSync() {
  const [syncing, setSyncing] = useState(false);

  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const conflicts = useLiveQuery(
    () => db.entities.where('_syncState').equals('conflict').count(),
    [],
    0,
  );

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await syncEngine.syncAll();
      await buildSearchIndex();
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  return { pending, conflicts, syncing, sync };
}
