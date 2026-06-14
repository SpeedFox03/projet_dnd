'use client';

import { useRouter } from 'next/navigation';
import { GlobalSearchBar } from './GlobalSearchBar';
import { supabase } from '@/lib/supabase/client';

export function Topbar() {
  const router = useRouter();

  async function logout() {
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-bg px-4">
      <GlobalSearchBar />
      <div className="flex-1" />
      <button className="btn-ghost" onClick={logout}>
        Déconnexion
      </button>
    </header>
  );
}
