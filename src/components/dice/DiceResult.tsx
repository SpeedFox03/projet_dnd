'use client';

import { useEffect } from 'react';
import { useDice } from '@/stores/dice-store';

/**
 * Toast flottant affichant le dernier lancer : total + détail des dés.
 * Se ferme au clic ou après quelques secondes. Rendu global (layout app).
 */
export function DiceResult() {
  const { current, dismiss } = useDice();

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(dismiss, 7000);
    return () => clearTimeout(t);
  }, [current, dismiss]);

  if (!current) return null;
  const { label, result } = current;

  return (
    <button
      type="button"
      onClick={dismiss}
      className="fixed bottom-10 right-3 z-50 w-60 cursor-pointer rounded-lg border border-border bg-bg-panel p-3 text-left shadow-2xl sm:right-4"
      title="Fermer"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {label}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600">{result.expression}</span>
      </div>

      <div className="mt-1 text-3xl font-bold text-accent">{result.total}</div>

      <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-400">
        {result.groups.map((g, gi) => (
          <span key={gi} className="flex flex-wrap items-center gap-1">
            {g.rolls.map((r, ri) => (
              <span
                key={ri}
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded border px-1 ${
                  g.sides === 20 && r === 20
                    ? 'border-green-500/60 text-green-400'
                    : g.sides === 20 && r === 1
                      ? 'border-red-500/60 text-red-400'
                      : 'border-border text-zinc-200'
                }`}
              >
                {r}
              </span>
            ))}
          </span>
        ))}
        {result.modifier !== 0 && (
          <span className="text-zinc-500">
            {result.modifier > 0 ? `+ ${result.modifier}` : `− ${Math.abs(result.modifier)}`}
          </span>
        )}
      </div>
    </button>
  );
}
