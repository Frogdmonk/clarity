# Security checklist

- [x] RLS enabled on every `public` table; default-deny grants (`revoke all` from anon/authenticated, explicit grants only).
- [x] New functions are not executable by anon/authenticated unless explicitly granted (default privileges revoked).
- [x] Identity always from `auth.uid()`; no RPC takes a student/teacher/role/status argument.
- [x] Roles only changeable via `admin_set_role` (admin cannot change own role).
- [x] Teacher notes: no student policy exists; students get a permission error on the events table and 0 rows on notes.
- [x] Anonymity enforced in SQL, not UI (see DECISIONS #1); reveal is audited and the student is told.
- [x] Immutable: `code_snapshots`, `help_request_events`, `audit_log`.
- [x] Rate limits on join, help requests, follow-ups, drafts, submissions, polls.
- [x] CSP with per-request nonce (proxy.ts); X-Frame-Options DENY; no `dangerouslySetInnerHTML` (lint rule is an error; a unit test checks code renders as text).
- [x] Server auth uses `auth.getUser()`; every role layout calls `requireRole` (UI convenience only; Postgres is the authority).
- [x] No service-role key is used by the app.
- [ ] Hosted checks to do on deploy: custom SMTP, leaked-password protection, Realtime public access off, email confirmation on.
- [x] `pnpm check:secrets` greps for committed keys (see script). Run before every release.
- [ ] Not yet done: external review, penetration test, load test.
