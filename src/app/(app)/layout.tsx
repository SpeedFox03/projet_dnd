import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { TabBar } from '@/components/layout/TabBar';
import { StatusBar } from '@/components/layout/StatusBar';

/**
 * Shell "écran MJ" : sidebar + topbar (recherche) + onglets + zone principale
 * + barre de statut. Toutes les pages applicatives s'affichent dans la zone
 * centrale, sous les onglets persistants.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <TabBar />
          <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
