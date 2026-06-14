'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { campaignsRepository } from '@/lib/repository/campaigns-repository';
import { useWorkspace } from '@/stores/workspace-store';
import type { EntityRecord } from '@/types/domain';

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);

  const campaign = useLiveQuery(() => db.campaigns.get(id), [id]);
  const entities = useLiveQuery(async () => {
    const ids = await campaignsRepository.entityIdsOf(id);
    const rows = await db.entities.bulkGet(ids);
    return rows.filter((e): e is EntityRecord => !!e && !e.deletedAt);
  }, [id], []);

  function open(e: EntityRecord) {
    openTab({ entityId: e.id, title: e.name });
    router.push(`/entity/${e.id}`);
  }

  async function toggleOffline() {
    if (campaign) await campaignsRepository.save({ ...campaign, offline: !campaign.offline });
  }

  async function deleteCampaign() {
    if (campaign && confirm(`Supprimer la campagne « ${campaign.name} » ?`)) {
      await campaignsRepository.remove(campaign.id);
      router.push('/dashboard');
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{campaign?.name ?? 'Campagne'}</h1>
          <p className="mt-1 text-sm text-zinc-500">{entities.length} fiche(s)</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400">
            <input type="checkbox" className="accent-accent" checked={!!campaign?.offline} onChange={toggleOffline} />
            Disponible hors ligne
          </label>
          <button className="text-zinc-500 hover:text-red-400" onClick={deleteCampaign}>
            Supprimer
          </button>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-lg border border-border">
        {entities.map((e) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-bg-hover">
            <button onClick={() => open(e)} className="min-w-0 flex-1 text-left">
              <div className="truncate font-medium text-zinc-100">{e.name}</div>
              {e.summary && <div className="truncate text-xs text-zinc-500">{e.summary}</div>}
            </button>
            <button
              className="ml-2 text-xs text-zinc-500 hover:text-red-400"
              onClick={() => campaignsRepository.removeEntity(id, e.id)}
            >
              Retirer
            </button>
          </div>
        ))}
        {entities.length === 0 && (
          <p className="px-4 py-6 text-sm text-zinc-600">
            Aucune fiche. Ajoute-en via le bouton « + Campagne » sur une fiche.
          </p>
        )}
      </div>
    </div>
  );
}
