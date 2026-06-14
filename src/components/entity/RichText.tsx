'use client';

import { Fragment, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';

/** Capture les liens inter-fiches façon Obsidian : [[Nom de la fiche]]. */
const LINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Rend du texte en convertissant `[[Nom]]` en liens cliquables qui ouvrent
 * la fiche correspondante (résolution locale par nom, insensible à la casse).
 */
export function RichText({ text }: { text: string }) {
  const router = useRouter();
  const openTab = useWorkspace((s) => s.openTab);

  async function openByName(name: string) {
    const target = await db.entities
      .filter((e) => !e.deletedAt && e.name.toLowerCase() === name.trim().toLowerCase())
      .first();
    if (target) {
      openTab({ entityId: target.id, title: target.name });
      router.push(`/entity/${target.id}`);
    }
  }

  const parts: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(LINK_RE);
  let i = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(<Fragment key={i++}>{text.slice(last, match.index)}</Fragment>);
    const name = match[1];
    parts.push(
      <button
        key={i++}
        type="button"
        className="text-accent hover:underline"
        onClick={() => openByName(name)}
      >
        {name}
      </button>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);

  return <span className="whitespace-pre-wrap leading-relaxed">{parts}</span>;
}
