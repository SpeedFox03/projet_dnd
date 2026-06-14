'use client';

import { Fragment } from 'react';
import { useDice } from '@/stores/dice-store';
import { isRollable } from '@/lib/dice/roll';

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

interface RollableOptions {
  /** Étiquette pour les modificateurs seuls (ex. "SAG", "Force"). */
  contextLabel?: string;
  /** Autorise le `-N` nu (contextes structurés : caractéristiques). */
  allowBareNegative?: boolean;
}

/**
 * Transforme un texte en nœuds React où les jets de dés deviennent cliquables :
 *  - `{ ... }`  -> syntaxe EXPLICITE (ex. `{1d8+4}`, `{+5}`, `{-2}`), affichée
 *                 sans les accolades. À privilégier dans les fiches perso.
 *  - `NdM(±K)`  -> dés détectés automatiquement (ex. `3d8`, `1d6+2`).
 *  - `+N`       -> modificateur détecté automatiquement (jet 1d20 + N).
 *  - `-N` nu    -> détecté UNIQUEMENT si `allowBareNegative` (sinon ambigu :
 *                 plages "1-5", listes "- 3 potions"…). Sinon, utiliser `{-N}`.
 */
export function renderRollableText(text: string, opts: RollableOptions = {}): React.ReactNode {
  if (!text) return text;
  const { contextLabel, allowBareNegative } = opts;
  const sign = allowBareNegative ? '[+-]' : '\\+';
  const re = new RegExp(`(\\{[^}]+\\}|\\d*d\\d+(?:\\s*[+-]\\s*\\d+)?|${sign}\\s*\\d+)`, 'g');

  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    if (m.index > last) nodes.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>);

    if (raw.startsWith('{')) {
      // Syntaxe explicite : on retire les accolades pour l'affichage.
      const inner = raw.slice(1, -1).trim();
      if (isRollable(inner)) {
        nodes.push(
          <Rollable key={key++} expr={inner} label={contextLabel ?? inner}>
            {inner}
          </Rollable>,
        );
      } else {
        nodes.push(<Fragment key={key++}>{inner}</Fragment>);
      }
    } else {
      const isDice = /d\d/.test(raw);
      nodes.push(
        <Rollable key={key++} expr={raw} label={isDice ? raw.trim() : (contextLabel ?? raw.trim())}>
          {raw}
        </Rollable>,
      );
    }
    last = m.index + raw.length;
  }
  if (last < text.length) nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return nodes;
}
