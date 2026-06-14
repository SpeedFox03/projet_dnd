/**
 * État d'interface transitoire (non persisté) : ouverture du tiroir latéral
 * sur mobile. Sur desktop (md+) la sidebar est toujours visible et cet état
 * est ignoré par le CSS.
 */

import { create } from 'zustand';

interface UiState {
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
}

export const useUi = create<UiState>((set) => ({
  sidebarOpen: false,
  openSidebar: () => set({ sidebarOpen: true }),
  closeSidebar: () => set({ sidebarOpen: false }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));
