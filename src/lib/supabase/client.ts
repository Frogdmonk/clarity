"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

let client: SupabaseClient | undefined;

/** Browser singleton. All authorisation is enforced by Postgres, never by this client. */
export function createClient(): SupabaseClient {
  if (!client) {
    const env = getPublicEnv();
    client = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
