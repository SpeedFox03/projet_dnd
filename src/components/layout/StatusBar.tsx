'use client';

import { useState } from 'react';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useSync } from '@/hooks/use-sync';
import { resetLocal } from '@/lib/db/reset-local';

/**
 * Barre de statut basse : réseau + état de synchronisation (en attente,
 * conflits) + bouton de sync manuelle + reset local.
 */
export function StatusBar() {
  const online = useOnlineStatus();
  const { pending, conflicts, syncing, sync } = useSync();
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    const ok = window.confirm(
      'Réinitialiser les données locales ?\n\n' +
        "Tout le contenu local sera effacé et remplacé par ce qui se trouve en base de données. " +
        'Les fichiers perso (seed local) ne seront plus chargés, et les modifications ' +
        'non encore synchronisées seront perdues.',
    );
    if (!ok) return;

    setResetting(true);
    try {
      await resetLocal();
    } catch (e) {
      console.error('[reset local]', e);
      window.alert('Échec de la réinitialisation. Voir la console.');
    } finally {
      setResetting(false);
    }
  }

  const busy = syncing || resetting;

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-bg-soft px-3 text-xs text-zinc-400">
      <div className="flex items-center gap-3">
        <Dot color={online ? '#3fb950' : '#8b8b8b'} />
        <span>{online ? 'En ligne' : 'Hors ligne'}</span>
        {conflicts > 0 && <span className="text-red-400">⚠ {conflicts} conflit(s)</span>}
      </div>

      <div className="flex items-center gap-3">
        {pending > 0 ? (
          <span className="text-amber-400">{pending} en attente</span>
        ) : (
          <span className="text-zinc-500">Synchronisé</span>
        )}
        <button
          className="rounded px-2 py-0.5 hover:bg-bg-hover disabled:opacity-50"
          onClick={handleReset}
          disabled={busy || !online}
          title="Vider le local et ne garder que le contenu de la base (sans fichiers perso)"
        >
          {resetting ? 'Reset…' : 'Reset local'}
        </button>
        <button
          className="rounded px-2 py-0.5 hover:bg-bg-hover disabled:opacity-50"
          onClick={sync}
          disabled={busy || !online}
        >
          {syncing ? 'Sync…' : 'Synchroniser'}
        </button>
      </div>
    </footer>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}
