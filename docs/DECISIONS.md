# Decisions

## Phase 0 — dependency versions (checked 2026-10-16)
- Next 16.4.2, React 19.3.1, @supabase/ssr 0.12.7, supabase-js 2.118.0, zod 4.6.7, Vitest 5.0.5, ESLint 10.12.0.
- TypeScript pinned to **6.0.3**, not 7.0.2: `typescript-eslint` 8.71.2 (pulled in by eslint-config-next) refuses TS >= 6.1, so lint crashes on 7.x. Revisit when typescript-eslint supports TS 7.
- `next build` auto-edited tsconfig (jsx: react-jsx, allowJs). Accepted.

## Phase 1 — deviations from the design doc (and why)

1. **Teachers never SELECT `help_requests`, `help_request_messages`, `help_request_events`, `code_drafts` or `code_snapshots` directly.**
   The doc's policy list gave teachers table-level SELECT. Those rows carry `student_id` / `sender_id`, so a teacher could
   de-anonymise `masked`/`strict` requests with a plain query. Teachers use `teacher_requests_for_session`,
   `teacher_request_thread`, `get_student_draft(request_id)` and `get_request_snapshot` instead; these key everything by
   request id and never return identity for anonymous rows. Tests 13a-13c cover this.
2. **Join failures after the rate-limit check are returned as `{ok:false,error}` instead of raised.** A raised exception rolls
   back the rate-limit increment, so failed guesses would never count and brute-force protection would do nothing.
   `rate_limited` itself is still raised. Test J3/J4 cover this. (Found while writing tests, not by inspection.)
3. **Join code**: 6 chars from a 31-char unambiguous alphabet, rejection-sampled (no modulo bias), 12 h TTL, stored in
   `session_secrets` (teacher-only), destroyed on `end_session`. Membership/enrolment is still enforced.
4. **Pulse realtime hint is throttled to ~1/s in the trigger.** A throttled-out hint could leave a teacher UI stale, so the
   client MUST also resync `session_pulse` on a slow timer (5 s) and on reconnect (Phase 4/6 requirement).
5. **Realtime producer `_rt_send` swallows failures (raises a WARNING).** A realtime outage must not roll back a student's
   question. It calls `realtime.send(jsonb,text,text,boolean)`; the Supabase docs I fetched on 2026-10-16 document
   `broadcast_changes` and the `realtime.messages` policy shape but NOT `realtime.send`'s signature — see KNOWN_LIMITATIONS.
6. **Doubt Bank**: `create_help_request` on an `ended` session is allowed for enrolled students until
   `ended_at + doubt_bank_hours` (session setting, else course setting, else 48 h), and flagged `is_doubt_bank`.
7. **Pseudonym salt** lives in `platform_settings.pseudonym_salt`; that table has no policies and no grants.
8. **No dev seed in migrations.** The doc put seed data in migration 0013 behind a GUC. Migrations also run against production,
   so seeds belong in `supabase/seed.sql` (local `db reset` only). Not written yet (Phase 2 needs it).
9. `handle_new_user` cannot write an audit row on duplicate-UG signup (the raised exception rolls it back). The doc's
   "admin-only audit row" is therefore not delivered; the signup error stays generic.
10. Realtime payload for pulse carries only `updated_at`; clients refetch (ADR 1: Postgres is the source of truth).
11. **Native `<dialog>`** instead of Radix/shadcn: fewer dependencies, built-in focus trapping and Escape handling.
12. **Untyped Supabase client** until `pnpm db:types` can run against a real stack; row types live in `src/lib/types.ts`.
13. **Teacher code view is a read-only `<pre>`**, not CodeMirror: nothing to execute, nothing to inject, cheaper on phones.
14. **Teacher notes** are written directly to `help_request_notes` under RLS (teacher-only select/insert), not through an RPC.
15. **Activities and course settings** are written by teachers directly under RLS (column grants limit `courses` updates to title, description, settings).
16. **Pulse-dip alert (T2)** is computed client-side from the aggregate pulse (>=30% lost with >=5 responses); it is advice, not a security control.
17. **Next-class suggestions (T6)** are rule-based on aggregates; no AI.
18. **Dev seed**: no `seed.sql` is shipped. Bootstrap steps are in `DEPLOYMENT.md`; seeded auth users could not be verified without GoTrue.

