'use client';

import { useEffect, useState } from 'react';
import { bootstrap } from '@/lib/bootstrap';

/**
 * Lance l'amorçage offline (Dexie/sync/index) avant d'afficher l'app.
 * Affiche un écran de chargement minimal le temps du premier remplissage.
 */
export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootstrap().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Préparation des données…
      </div>
    );
  }
  return <>{children}</>;
}
