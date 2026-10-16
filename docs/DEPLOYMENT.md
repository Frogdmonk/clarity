# Deployment (free tier)

Stack: Supabase (Postgres, Auth, Realtime) + Vercel (Next.js). Verify current free-tier terms on deploy day (`FREE_TIER.md`).

## 1. Supabase project
1. Create a project. Note the URL, `anon` key (Project Settings -> API).
2. Apply migrations: `supabase link --project-ref <ref> && supabase db push`.
3. Auth -> URL Configuration: Site URL = your Vercel URL; add `<url>/auth/confirm` and `<url>/auth/callback` as redirect URLs.
4. Auth -> Providers -> Email: keep "Confirm email" ON. Set a minimum password length of 10.
5. Realtime -> Settings: **disable "Allow public access"** (private channels only).
6. Run the realtime check from `KNOWN_LIMITATIONS.md` in the SQL editor.

## 2. First admin
Register normally in the app, then in the SQL editor (once):
```sql
update public.profiles   set verification = 'verified' where ug_number = '<your UG number>';
update public.user_roles set role = 'admin'
 where user_id = (select id from public.profiles where ug_number = '<your UG number>');
```
Sign out and in. After that, manage everyone from /admin.

## 3. Vercel
1. Import the repo. Environment variables (Production + Preview):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`.
2. **Do not add the service-role key** unless you add code that needs it; the app does not.
3. Deploy. Visit `/api/health` -> `{"ok":true}`.

## 4. Keep-alive
Free Supabase projects pause after inactivity. Set the GitHub secret `HEALTH_URL=https://<app>/api/health`;
`.github/workflows/keepalive.yml` pings it every 3 days.

## 5. Smoke test (do this before any real class)
1. Register a teacher and a student (two browsers). Approve both in /admin; promote the teacher.
2. Teacher: create course -> add the student's UG number -> create session -> Start. Open Presenter view.
3. Student: join by code (and via QR on Android Chrome). Tap Following / Lost; check the teacher pulse moves.
4. Student: ask a question (try anonymous). Teacher: reply, mark handled. Student: confirm "cleared", save to notebook.
5. Teacher: create a coding activity. Student: type code, go offline, reconnect, confirm it syncs; submit.
6. Teacher: end session; check the summary and Doubt Bank.
7. Confirm a student cannot open /teacher or /admin, and that masked/strict anonymity hides names in the teacher queue.

## Local development
```
supabase start && supabase db reset
cp .env.example .env.local   # paste URL + anon key from `supabase status`
pnpm install && pnpm dev
```
Local email goes to Inbucket (http://127.0.0.1:54324).
