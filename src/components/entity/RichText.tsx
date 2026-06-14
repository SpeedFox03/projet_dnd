'use client';

import { Fragment, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/local-db';
import { useWorkspace } from '@/stores/workspace-store';
import { renderRollableText } from '@/components/dice/Rollable';

/** Capture les liens inter-fiches façon Obsidian : [[Nom de la fiche]]. */
const LINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * « Dé-wrappe » le texte extrait des PDF : ceux-ci coupent les lignes en plein
 * milieu des phrases (largeur de colonne du PDF), ce qui affichait le texte dans
 * une étroite colonne. On recolle ces coupures « molles » et on garde les vraies
 * (fin de phrase, puce/numéro, ligne vide) pour que le texte remplisse la largeur.
 */
function reflow(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (out.length === 0) {
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1].trimEnd();
    const keepBreak =
      prev === '' ||
      line.trim() === '' ||
      /[.:!?;»)\]"]$/.test(prev) || // fin de phrase / ponctuation fermante
      /^\s*([-–•*]|\d+[.)])\s/.test(line); // puce ou numéro -> nouvelle ligne
    if (keepBreak) {
      out.push(line);
    } else if (/[-–]$/.test(prev)) {
      // césure de fin de ligne : on recolle sans espace
      out[out.length - 1] = prev.replace(/[-–]$/, '') + line.trimStart();
    } else {
      out[out.length - 1] = `${prev} ${line.trimStart()}`;
    }
  }
  return out.join('\n');
}

/**
 * Rend du texte en convertissant `[[Nom]]` en liens cliquables qui ouvrent
 * la fiche correspondante (résolution locale par nom, insensible à la casse).
 */
export function RichText({ text: rawText }: { text: string }) {
  const text = reflow(rawText);
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
    // Le texte hors liens reste lançable (dés/modificateurs cliquables).
    if (match.index > last)
      parts.push(<Fragment key={i++}>{renderRollableText(text.slice(last, match.index))}</Fragment>);
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
  if (last < text.length)
    parts.push(<Fragment key={i++}>{renderRollableText(text.slice(last))}</Fragment>);

  return <span className="whitespace-pre-wrap leading-relaxed">{parts}</span>;
}
