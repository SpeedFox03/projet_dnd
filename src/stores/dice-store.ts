/**
 * Dernier lancer de dés, affiché dans un toast flottant (DiceResult).
 * Non persisté : c'est une interaction éphémère.
 */

import { create } from 'zustand';
import { rollExpression, type RollResult } from '@/lib/dice/roll';

export interface DiceRoll {
  id: number;
  /** Libellé de contexte (ex. "SAG", "Dés de vie", "Attaque"). */
  label: string;
  result: RollResult;
}

interface DiceState {
  current: DiceRoll | null;
  /** Lance `raw` (ex. "3d8", "+5") et affiche le résultat. */
  roll: (raw: string, label?: string) => void;
  dismiss: () => void;
}

let counter = 0;

export const useDice = create<DiceState>((set) => ({
  current: null,
  roll: (raw, label) => {
    const result = rollExpression(raw);
    if (!result) return;
    counter += 1;
    set({ current: { id: counter, label: label ?? result.expression, result } });
  },
  dismiss: () => set({ current: null }),
}));
