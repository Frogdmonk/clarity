import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Keep-alive + health check. Calls a public, read-only RPC so a free-tier Supabase project
 * registers activity. Returns no data from the database and never echoes errors.
 * Point an external free scheduler (or the GitHub Actions workflow) at this URL.
 */
export async function GET() {
  try {
    const env = getPublicEnv();
    const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { error } = await sb.rpc("get_public_settings");
    if (error) return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
