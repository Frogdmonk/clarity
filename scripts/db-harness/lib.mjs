// Applies supabase/migrations to an in-process Postgres (PGlite) with minimal stubs for the
// Supabase-provided pieces (auth schema, roles, realtime.messages). Needs no Docker.
// It is a safety net, NOT a replacement for `supabase db reset && supabase test db`.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../..');
const MIG = path.join(ROOT, 'supabase/migrations');
export const TESTS = path.join(ROOT, 'supabase/tests');

export async function freshDb() {
  const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
  await db.exec(fs.readFileSync(path.join(here, 'stubs.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(here, 'tap_shim.sql'), 'utf8'));
  await db.exec('set search_path = "$user", public, extensions');
  const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'));
    } catch (e) {
      throw new Error(`MIGRATION FAILED ${f}: ${e.message}`);
    }
  }
  return { db, files };
}
