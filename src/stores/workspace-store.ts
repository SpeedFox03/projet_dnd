/**
 * État de l'espace de travail MJ : onglets de fiches ouvertes + panneaux split.
 * Inspiré de VS Code. Persiste dans le localStorage pour retrouver sa session.
 *
 * Les onglets sont identifiés par `entityId` (une fiche = un onglet).
 *
 * Disposition du split : jusqu'à 4 fiches, une par coin de la zone principale.
 *   - Le coin haut-gauche (`tl`) affiche toujours la fiche routée/active.
 *   - Les 3 autres coins (`tr`, `bl`, `br`) sont alimentés par glisser-déposer
 *     d'un onglet, et rendus en lecture seule.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OpenTab {
  entityId: string;
  title: string;
}

/** Coins disponibles pour le split. `tl` = fiche principale (routée). */
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type SplitCorner = 'tr' | 'bl' | 'br';

interface WorkspaceState {
  tabs: OpenTab[];
  activeId: string | null;
  /** Fiches affichées dans les coins secondaires (split). */
  panes: Record<SplitCorner, string | null>;
  /** Vrai pendant le glisser d'un onglet (affiche les zones de drop). */
  draggingTab: boolean;

  openTab: (tab: OpenTab) => void;
  closeTab: (entityId: string) => void;
  setActive: (entityId: string) => void;
  renameTab: (entityId: string, title: string) => void;

  setPane: (corner: SplitCorner, entityId: string | null) => void;
  clearPanes: () => void;
  setDraggingTab: (dragging: boolean) => void;
}

const EMPTY_PANES: Record<SplitCorner, string | null> = { tr: null, bl: null, br: null };

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeId: null,
      panes: { ...EMPTY_PANES },
      draggingTab: false,

      openTab: (tab) => {
        const exists = get().tabs.some((t) => t.entityId === tab.entityId);
        set((s) => ({
          tabs: exists ? s.tabs : [...s.tabs, tab],
          activeId: tab.entityId,
        }));
      },

      closeTab: (entityId) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => t.entityId !== entityId);
          const activeId =
            s.activeId === entityId ? (tabs.at(-1)?.entityId ?? null) : s.activeId;
          // Retire la fiche fermée des éventuels panneaux split.
          const panes = { ...s.panes };
          for (const corner of Object.keys(panes) as SplitCorner[]) {
            if (panes[corner] === entityId) panes[corner] = null;
          }
          return { tabs, activeId, panes };
        }),

      setActive: (entityId) => set({ activeId: entityId }),
      renameTab: (entityId, title) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.entityId === entityId ? { ...t, title } : t)),
        })),

      setPane: (corner, entityId) =>
        set((s) => ({ panes: { ...s.panes, [corner]: entityId } })),
      clearPanes: () => set({ panes: { ...EMPTY_PANES } }),
      setDraggingTab: (dragging) => set({ draggingTab: dragging }),
    }),
    {
      name: 'mj-workspace',
      version: 2,
      // Ne persiste pas l'état transitoire de drag.
      partialize: (s) => ({
        tabs: s.tabs,
        activeId: s.activeId,
        panes: s.panes,
      }),
      // v1 -> v2 : `splitId` (panneau unique) remplacé par `panes` (4 coins).
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<WorkspaceState> & { splitId?: string | null };
        if (version < 2) {
          const splitId = state.splitId ?? null;
          state.panes = { ...EMPTY_PANES, tr: splitId };
          delete state.splitId;
        }
        return state as WorkspaceState;
      },
    },
  ),
);
