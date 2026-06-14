'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/local-db';
import { useUi } from '@/stores/ui-store';

/**
 * Barre latérale : navigation principale + catégories + favoris + campagnes.
 * Sur desktop (md+) elle est statique. Sur mobile, c'est un tiroir off-canvas
 * piloté par `useUi` (bouton hamburger dans la Topbar), avec backdrop.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, closeSidebar } = useUi();

  // `name` n'est pas indexé dans Dexie : on trie en mémoire (peu d'éléments).
  const categories = useLiveQuery(
    () => db.categories.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))),
    [],
    [],
  );
  const campaigns = useLiveQuery(
    () => db.campaigns.toArray().then((c) => c.sort((a, b) => a.name.localeCompare(b.name))),
    [],
    [],
  );
  // Favoris : plus récents en tête, résolus en fiches pour afficher leur nom.
  const favorites = useLiveQuery(
    async () => {
      const favs = await db.favorites.orderBy('createdAt').reverse().toArray();
      const entities = await db.entities.bulkGet(favs.map((f) => f.entityId));
      return entities.filter((e): e is NonNullable<typeof e> => Boolean(e));
    },
    [],
    [],
  );

  return (
    <>
      {/* Backdrop mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeSidebar}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-full w-72 max-w-[85vw] shrink-0 flex-col border-r border-border bg-bg-soft transition-transform duration-200 ease-out md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:shadow-none ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link
            href="/dashboard"
            onClick={closeSidebar}
            className="text-lg font-semibold text-zinc-100"
          >
            Bible du MJ
          </Link>
          <button
            className="rounded p-1 text-zinc-400 hover:bg-bg-hover hover:text-zinc-100 md:hidden"
            onClick={closeSidebar}
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>

        <nav className="px-2">
          <NavLink href="/dashboard" active={pathname === '/dashboard'} onNavigate={closeSidebar}>
            Tableau de bord
          </NavLink>
          <NavLink href="/search" active={pathname.startsWith('/search')} onNavigate={closeSidebar}>
            Recherche
          </NavLink>
        </nav>

        <div className="mt-1 flex-1 overflow-y-auto pb-4">
          <div className="mt-3 flex items-center justify-between px-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Catégories
            </span>
            <Link
              href="/categories/new"
              onClick={closeSidebar}
              className="text-xs text-zinc-500 hover:text-accent"
              title="Nouvelle catégorie"
            >
              +
            </Link>
          </div>
          <nav className="mt-1 px-2">
            {categories.map((c) => {
              const href = `/category/${c.slug}`;
              return (
                <NavLink key={c.id} href={href} active={pathname === href} onNavigate={closeSidebar}>
                  {c.name}
                </NavLink>
              );
            })}
            {categories.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-600">Aucune catégorie synchronisée.</p>
            )}
          </nav>

          <div className="mt-4 px-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Favoris
            </span>
          </div>
          <nav className="mt-1 px-2">
            {favorites.map((e) => {
              const href = `/entity/${e.id}`;
              return (
                <NavLink key={e.id} href={href} active={pathname === href} onNavigate={closeSidebar}>
                  <span className="mr-1 text-accent">★</span>
                  {e.name}
                </NavLink>
              );
            })}
            {favorites.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-600">Aucun favori.</p>
            )}
          </nav>

          <div className="mt-4 px-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Campagnes
            </span>
          </div>
          <nav className="mt-1 px-2">
            {campaigns.map((c) => {
              const href = `/campaign/${c.id}`;
              return (
                <NavLink key={c.id} href={href} active={pathname === href} onNavigate={closeSidebar}>
                  {c.name}
                </NavLink>
              );
            })}
            {campaigns.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-600">Aucune campagne.</p>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`block rounded-md px-2 py-2 text-sm transition-colors md:py-1.5 ${
        active ? 'bg-bg-hover text-accent' : 'text-zinc-300 hover:bg-bg-hover'
      }`}
    >
      {children}
    </Link>
  );
}
