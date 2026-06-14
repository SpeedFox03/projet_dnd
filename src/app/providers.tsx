'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BootstrapGate } from '@/components/system/BootstrapGate';

/**
 * Providers globaux côté client : TanStack Query + amorçage offline (Dexie/sync).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BootstrapGate>{children}</BootstrapGate>
    </QueryClientProvider>
  );
}
