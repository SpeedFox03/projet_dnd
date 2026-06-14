'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

/** Renvoie l'id de l'utilisateur courant (ou null), réactif à l'auth. */
export function useUser(): string | null {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase();
    client.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = client.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user?.id ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return userId;
}
