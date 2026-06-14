'use client';

import { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { campaignsRepository } from '@/lib/repository/campaigns-repository';
import { useUser } from '@/hooks/use-user';

/**
 * Bouton « Campagnes » : ajoute/retire la fiche d'une campagne (cases à cocher),
 * avec création rapide d'une nouvelle campagne.
 */
export function CampaignPicker({ entityId }: { entityId: string }) {
  const userId = useUser();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const campaigns = useLiveQuery(() => campaignsRepository.list(), [], []);
  const memberIds = useLiveQuery(
    () => db.campaignEntities.where('entityId').equals(entityId).toArray().then((r) => r.map((x) => x.campaignId)),
    [entityId],
    [] as string[],
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function toggle(campaignId: string, isMember: boolean) {
    if (isMember) await campaignsRepository.removeEntity(campaignId, entityId);
    else await campaignsRepository.addEntity(campaignId, entityId);
  }

  async function createAndAdd() {
    if (!userId || !newName.trim()) return;
    const c = campaignsRepository.create(userId, newName.trim());
    await campaignsRepository.save(c);
    await campaignsRepository.addEntity(c.id, entityId);
    setNewName('');
  }

  return (
    <div ref={boxRef} className="relative">
      <button className="text-xs text-zinc-400 hover:text-accent" onClick={() => setOpen((v) => !v)}>
        + Campagne
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-60 rounded-md border border-border bg-bg-panel p-2 shadow-xl">
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {campaigns.map((c) => {
              const isMember = memberIds.includes(c.id);
              return (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-bg-hover">
                  <input type="checkbox" className="accent-accent" checked={isMember} onChange={() => toggle(c.id, isMember)} />
                  <span className="truncate text-zinc-200">{c.name}</span>
                </label>
              );
            })}
            {campaigns.length === 0 && <p className="px-2 py-1 text-xs text-zinc-600">Aucune campagne.</p>}
          </div>
          <div className="mt-2 flex gap-1 border-t border-border pt-2">
            <input
              className="input py-1 text-xs"
              placeholder="Nouvelle campagne…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
            />
            <button className="btn-accent px-2 py-1 text-xs" onClick={createAndAdd}>
              +
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
