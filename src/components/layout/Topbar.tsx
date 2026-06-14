'use client';

import { useRouter } from 'next/navigation';
import { GlobalSearchBar } from './GlobalSearchBar';
import { supabase } from '@/lib/supabase/client';
import { useUi } from '@/stores/ui-store';

export function Topbar() {
  const router = useRouter();
  const toggleSidebar = useUi((s) => s.toggleSidebar);

  async function logout() {
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-2 border-b border-border bg-bg px-3 sm:gap-4 sm:px-4">
      <button
        className="-ml-1 shrink-0 rounded-md p-2 text-zinc-300 hover:bg-bg-hover md:hidden"
        onClick={toggleSidebar}
        aria-label="Ouvrir le menu"
      >
        {/* Icône hamburger */}
        <span className="block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
        <span className="mt-1 block h-0.5 w-5 bg-current" />
      </button>

      <GlobalSearchBar />
      <div className="flex-1" />
      <button className="btn-ghost shrink-0 px-2 sm:px-3" onClick={logout}>
        <span className="hidden sm:inline">Déconnexion</span>
        <span className="sm:hidden" aria-label="Déconnexion" title="Déconnexion">
          ⏻
        </span>
      </button>
    </header>
  );
}
