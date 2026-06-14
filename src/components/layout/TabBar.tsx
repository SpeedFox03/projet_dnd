'use client';

import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/stores/workspace-store';

/**
 * Barre d'onglets façon VS Code. Chaque onglet = une fiche ouverte. Cliquer
 * navigue vers la fiche ; la croix la ferme. Un onglet peut être glissé vers
 * un coin de la zone principale pour créer un split (voir EntityPage).
 */
export function TabBar() {
  const router = useRouter();
  const { tabs, activeId, setActive, closeTab, setDraggingTab } = useWorkspace();

  if (tabs.length === 0) return null;

  function handleClose(entityId: string) {
    const wasActive = entityId === activeId;
    closeTab(entityId);
    if (!wasActive) return;
    // L'onglet actif a été fermé : on navigue vers le suivant pour ne pas
    // laisser sa fiche affichée dans la zone principale.
    const next = useWorkspace.getState().activeId;
    router.push(next ? `/entity/${next}` : '/dashboard');
  }

  return (
    <div className="flex h-9 items-stretch overflow-x-auto border-b border-border bg-bg-soft">
      {tabs.map((tab) => {
        const active = tab.entityId === activeId;
        return (
          <div
            key={tab.entityId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', tab.entityId);
              e.dataTransfer.effectAllowed = 'copy';
              setDraggingTab(true);
            }}
            onDragEnd={() => setDraggingTab(false)}
            className={`group flex max-w-[200px] cursor-pointer items-center gap-2 border-r border-border px-3 text-sm ${
              active ? 'bg-bg text-zinc-100' : 'text-zinc-400 hover:bg-bg-hover'
            }`}
            onClick={() => {
              setActive(tab.entityId);
              router.push(`/entity/${tab.entityId}`);
            }}
          >
            <span className="truncate">{tab.title}</span>
            <button
              className="rounded px-1 text-zinc-600 opacity-0 hover:text-zinc-200 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                handleClose(tab.entityId);
              }}
              aria-label="Fermer l'onglet"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
