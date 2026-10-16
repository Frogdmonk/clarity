# Clarity — build instructions for Claude Code

Source of truth: `CLASSROOM_PLATFORM_DESIGN_DOC.md` (copy kept in `docs/`).

## Build rules (non-negotiable)

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any` without a comment.
- All authorisation lives in Postgres (RLS + `SECURITY DEFINER` RPCs). UI and middleware are conveniences only.
- Every important write goes through an RPC or server action that re-derives identity from `auth.uid()`.
  Never accept `student_id`, `teacher_id`, `role` or `status` from the client.
- Student text and code are plain text. React text nodes only; never `dangerouslySetInnerHTML`.
- No paid services, no code execution, no AI API. Clustering uses `pg_trgm`.
- Success UI only after the server confirms.
- Never log passwords, tokens, code, notes or message bodies.
- Never claim something works unless it was run. Unrunnable items go in `docs/KNOWN_LIMITATIONS.md` as NOT VERIFIED with the exact command.

## Commands

```
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm check:secrets
pnpm test:db:harness   # DB tests without Docker (PGlite)
supabase start && supabase db reset && supabase test db
pnpm db:types
```

## Phase checklist

- [x] Phase 0 — repo and guardrails
- [~] Phase 1 — implemented + verified on PGlite harness; real `supabase db reset`/pgTAP and generated types still OPEN (see docs/KNOWN_LIMITATIONS.md)
- [~] Phase 2 — auth and shells (written; typecheck/lint/build pass; NOT run against live Supabase)
- [~] Phase 3 — courses, sessions, join
- [~] Phase 4 — student classroom core
- [~] Phase 5 — coding (draft engine)
- [~] Phase 6 — teacher workspace
- [~] Phase 7 — retention layer
- [~] Phase 8 — hardening and deployment

Do not start a phase until the previous phase's exit criteria pass.
