# Known limitations / NOT VERIFIED

Nothing below has been run unless it says so. "Verified" means: executed in the build sandbox, output seen.

## Verified in the build sandbox
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (unit tests: validation, diff, draft saver state machine, backoff, CSV, copy,
  join-code parsing, plain-text rendering), `pnpm build` (with placeholder Supabase env values).
- `pnpm test:db:harness`: all migrations applied to PGlite (real Postgres in WASM) with stubs for `auth`, roles and
  `realtime.messages`; 165 SQL assertions pass (`supabase/tests/01_security.test.sql`, `02_behaviour.test.sql`).

## NOT VERIFIED (could not be run here)
- **The UI against a live Supabase project.** No page has been exercised in a browser against real Auth/PostgREST/Realtime.
  Run: `supabase start && supabase db reset`, copy keys into `.env.local`, `pnpm dev`, then walk the flow in
  `docs/DEPLOYMENT.md` ("Smoke test"). Expect to find and fix integration bugs on first run.
- **Real Supabase stack for the DB.** `supabase db reset && supabase test db` (real pgTAP, GoTrue triggers on `auth.users`).
- **`realtime.send` signature.** `_rt_send` assumes `realtime.send(payload jsonb, event text, topic text, private boolean)`.
  If wrong, events degrade to a WARNING and clients fall back to polling (still correct, slower).
  Check: `select realtime.send('{}'::jsonb, 'test', 'user:x:inbox', true);`
- **Realtime private-channel policies** (migration 0011) were tested only against a stubbed `realtime.messages`.
  Dashboard: Realtime -> Settings -> disable "Allow public access".
- **Generated DB types** (`pnpm db:types`) not produced. The browser/server clients are untyped; row shapes are declared
  in `src/lib/types.ts` and cast at two boundaries (`must<T>` in `queries.ts`, `call<T>` in `rpc.ts`).
- **`supabase/config.toml`** is hand-written and minimal.
- **Playwright specs** (`e2e/`) exist but have not been run; the full round-trip is `test.fixme`.
- **Accessibility** has been designed for (labels, focus, live regions, non-colour cues, 44px targets) but no axe or screen
  reader run has happened.
- **Load/k6**: not written or run. Concurrency limits are untested.
- **GitHub Actions** workflows are unexecuted.
- **QR scanning** uses `BarcodeDetector` (Chromium-based browsers, Android). Not available in Safari/Firefox; the code field is the fallback.
- **PWA / service worker**: caches static assets only. Authenticated pages are not available offline.

## Design limits (by choice)
- Offline: drafts are kept in IndexedDB and synced when back online; the notebook has a read-only cached copy. A cold start
  while offline shows the browser's offline page.
- `pagehide` relies on the IndexedDB copy rather than a keepalive request.
- No Radix/shadcn: native `<dialog>` is used. Fonts are system fonts (nothing to download or license).
- CSP uses a per-request nonce for scripts; `style-src` keeps `'unsafe-inline'` (CodeMirror and Next inject styles).
- Teacher "merge clusters" exists as an RPC (`merge_clusters`) but has no UI yet.
- Admin user list shows name/UG/status/role (emails live in `auth.users`, not exposed).
- Rate limits and thresholds (e.g. pulse hidden below 3 responses) are fixed in SQL.
