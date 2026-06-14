'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { EntityView } from '@/components/entity/EntityView';
import { EntityEditor } from '@/components/entity/EntityEditor';
import { EntityActions } from '@/components/entity/EntityActions';
import { VariantSwitcher } from '@/components/entity/VariantSwitcher';
import { ConflictResolver } from '@/components/entity/ConflictResolver';
import { CampaignPicker } from '@/components/entity/CampaignPicker';
import { BacklinksPanel } from '@/components/entity/BacklinksPanel';
import { useWorkspace, type Corner, type SplitCorner } from '@/stores/workspace-store';

function EntityPageInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { panes, draggingTab, openTab, setActive, setPane, clearPanes, setDraggingTab } =
    useWorkspace();

  const entity = useLiveQuery(() => db.entities.get(id), [id]);
  const category = useLiveQuery(
    () => (entity ? db.categories.get(entity.categoryId) : undefined),
    [entity?.categoryId],
  );

  const [editing, setEditing] = useState(false);

  // Ouvre l'éditeur d'emblée si on arrive via ?edit=1 (fork, nouvelle fiche).
  useEffect(() => {
    if (params.get('edit') === '1') setEditing(true);
  }, [params, id]);

  // Garantit l'onglet + le marque actif.
  useEffect(() => {
    if (entity) {
      openTab({ entityId: entity.id, title: entity.name });
      setActive(entity.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity?.id, entity?.name]);

  const hasSplit = Boolean(panes.tr || panes.bl || panes.br);
  const hasBottomRow = Boolean(panes.bl || panes.br);

  // Dépose un onglet glissé dans un coin : tl -> fiche principale (navigation),
  // les autres coins -> panneau split en lecture seule.
  function dropOn(corner: Corner, droppedId: string) {
    setDraggingTab(false);
    if (!droppedId) return;
    if (corner === 'tl') {
      setActive(droppedId);
      router.push(`/entity/${droppedId}`);
    } else {
      setPane(corner, droppedId);
    }
  }

  return (
    <div className="relative h-full overflow-y-auto md:overflow-hidden">
      <div className="flex min-h-full flex-col">
        {/* Rangée du haut : fiche principale (+ coin haut-droite).
            Mobile : empilement vertical ; desktop : côte à côte. */}
        <div className="flex min-w-0 flex-col md:min-h-0 md:flex-1 md:flex-row">
          <div className="flex min-w-0 flex-col md:flex-1 md:overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-soft px-3 py-1.5">
              {entity ? (
                <EntityActions
                  entity={entity}
                  editing={editing}
                  onToggleEdit={() => setEditing((v) => !v)}
                />
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                {entity && <CampaignPicker entityId={entity.id} />}
                {hasSplit && (
                  <button className="text-xs text-zinc-400 hover:text-accent" onClick={clearPanes}>
                    Fermer le split
                  </button>
                )}
              </div>
            </div>

            {entity && category && <ConflictResolver entity={entity} category={category} />}

            {editing && entity && category ? (
              <EntityEditor entity={entity} category={category} onDone={() => setEditing(false)} />
            ) : (
              <>
                {entity && category && <VariantSwitcher entity={entity} category={category} />}
                <EntityView entityId={id} />
                {entity && <BacklinksPanel entity={entity} />}
              </>
            )}
          </div>

          {panes.tr && (
            <SplitPane corner="tr" entityId={panes.tr} onClose={() => setPane('tr', null)} />
          )}
        </div>

        {/* Rangée du bas : coins bas-gauche / bas-droite. */}
        {hasBottomRow && (
          <div className="flex min-w-0 flex-col md:min-h-0 md:flex-1 md:flex-row md:border-t md:border-border">
            {panes.bl && (
              <SplitPane corner="bl" entityId={panes.bl} onClose={() => setPane('bl', null)} />
            )}
            {panes.br && (
              <SplitPane corner="br" entityId={panes.br} onClose={() => setPane('br', null)} />
            )}
          </div>
        )}
      </div>

      {/* Zones de drop : desktop uniquement (le drag HTML5 ne marche pas au tactile). */}
      {draggingTab && (
        <div className="absolute inset-0 z-20 hidden grid-cols-2 grid-rows-2 md:grid">
          <DropZone label="Coin haut-gauche (principal)" onDropId={(d) => dropOn('tl', d)} />
          <DropZone label="Coin haut-droite" onDropId={(d) => dropOn('tr', d)} />
          <DropZone label="Coin bas-gauche" onDropId={(d) => dropOn('bl', d)} />
          <DropZone label="Coin bas-droite" onDropId={(d) => dropOn('br', d)} />
        </div>
      )}
    </div>
  );
}

/** Un panneau split en lecture seule (coins tr/bl/br). */
function SplitPane({
  entityId,
  onClose,
}: {
  corner: SplitCorner;
  entityId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-col border-t border-border md:flex-1 md:overflow-hidden md:border-l md:border-t-0 md:first:border-l-0">
      <div className="flex items-center justify-end border-b border-border bg-bg-soft px-3 py-1">
        <button className="text-xs text-zinc-500 hover:text-zinc-200" onClick={onClose}>
          Fermer le panneau ×
        </button>
      </div>
      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        <EntityView entityId={entityId} />
      </div>
    </div>
  );
}

/** Quadrant de dépôt pour un onglet glissé. */
function DropZone({ label, onDropId }: { label: string; onDropId: (id: string) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDropId(e.dataTransfer.getData('text/plain'));
      }}
      className={`m-2 flex items-center justify-center rounded-lg border-2 border-dashed text-xs transition-colors ${
        over
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-border/70 bg-bg/40 text-zinc-500'
      }`}
    >
      {label}
    </div>
  );
}

export default function EntityPage() {
  return (
    <Suspense>
      <EntityPageInner />
    </Suspense>
  );
}
