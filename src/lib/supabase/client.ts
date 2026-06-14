/**
 * Client Supabase côté navigateur (singleton).
 * Utilisé par le SyncEngine et l'auth. Jamais appelé directement par l'UI
 * pour les données de contenu (passer par le Repository).
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

// Singleton pratique pour le code client.
let _client: ReturnType<typeof createClient> | null = null;
export function supabase() {
  if (!_client) _client = createClient();
  return _client;
}
