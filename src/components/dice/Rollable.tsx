'use client';

import { Fragment } from 'react';
import { useDice } from '@/stores/dice-store';

/**
 * Portion de texte cliquable qui lance une expression de dés.
 * `stopPropagation` pour ne pas déclencher les clics parents (cartes, onglets…).
 */
export function Rollable({
  expr,
  label,
  children,
}: {
  expr: string;
  label?: string;
  children: React.ReactNode;
}) {
  const roll = useDice((s) => s.roll);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        roll(expr, label);
      }}
      className="rounded px-0.5 font-semibold text-accent underline decoration-dotted underline-offset-2 transition-colors hover:bg-accent/20"
      title={`Lancer ${expr.trim()}`}
    >
      {children}
    </button>
  );
}

// Dés "3d8", "1d4 + 2", "d20" OU modificateur seul "+5", "-1".
const TOKEN_RE = /(\d*d\d+(?:\s*[+-]\s*\d+)?|[+-]\s*\d+)/g;

/**
 * Transforme un texte en nœuds React où chaque expression de dés / modificateur
 * devient cliquable (lance le dé). `contextLabel` sert d'étiquette pour les
 * modificateurs seuls (ex. "SAG", "Force"), sinon l'expression brute est utilisée.
 */
export function renderRollableText(text: string, contextLabel?: string): React.ReactNode {
  if (!text) return text;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);
    const isDice = /d\d/.test(raw);
    nodes.push(
      <Rollable key={key++} expr={raw} label={isDice ? raw.trim() : (contextLabel ?? raw.trim())}>
        {raw}
      </Rollable>,
    );
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}
