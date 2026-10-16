-- Functions are not callable by default: every RPC/helper must be granted explicitly.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ============ Helper functions (STABLE SECURITY DEFINER, empty search_path) ============
create function public.auth_uid() returns uuid
language sql stable set search_path = '' as $$ select auth.uid() $$;

create function public.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = (select auth.uid()) and p.verification = 'verified')
$$;

create function public.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = (select auth.uid()) and ur.role = r and p.verification = 'verified')
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('admin')
$$;

create function public.is_course_teacher(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role('teacher') and exists (
    select 1 from public.courses c
    where c.id = cid and (
      c.owner_id = (select auth.uid())
      or exists (select 1 from public.course_members m
                 where m.course_id = c.id and m.user_id = (select auth.uid())
                   and m.member_role = 'teacher' and m.status = 'active')))
$$;

create function public.is_course_student(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_verified() and exists (
    select 1 from public.course_members m
    where m.course_id = cid and m.user_id = (select auth.uid())
      and m.member_role = 'student' and m.status = 'active')
$$;

create function public.is_session_teacher(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.sessions s
                 where s.id = sid and public.is_course_teacher(s.course_id))
$$;

create function public.is_session_member(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_members sm
    join public.sessions s on s.id = sm.session_id
    where sm.session_id = sid and sm.student_id = (select auth.uid())
      and public.is_course_student(s.course_id))
$$;

create function public.is_request_teacher(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.help_requests r
                 where r.id = rid and public.is_session_teacher(r.session_id))
$$;

create function public.is_poll_teacher(pid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.polls p
                 where p.id = pid and public.is_session_teacher(p.session_id))
$$;

create function public.is_activity_teacher(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.activities a
                 where a.id = aid and public.is_session_teacher(a.session_id))
$$;

create function public.is_activity_member(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.activities a
                 where a.id = aid and public.is_session_member(a.session_id))
$$;

revoke all on function
  public.auth_uid(), public.is_verified(), public.has_role(public.app_role), public.is_admin(),
  public.is_course_teacher(uuid), public.is_course_student(uuid), public.is_session_teacher(uuid),
  public.is_session_member(uuid), public.is_request_teacher(uuid), public.is_poll_teacher(uuid),
  public.is_activity_teacher(uuid), public.is_activity_member(uuid)
  from public, anon;
grant execute on function
  public.auth_uid(), public.is_verified(), public.has_role(public.app_role), public.is_admin(),
  public.is_course_teacher(uuid), public.is_course_student(uuid), public.is_session_teacher(uuid),
  public.is_session_member(uuid), public.is_request_teacher(uuid), public.is_poll_teacher(uuid),
  public.is_activity_teacher(uuid), public.is_activity_member(uuid)
  to authenticated;

-- ============ Baseline grants: deny everything, then allow explicitly ============
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- ============ Enable RLS on every table ============
alter table public.platform_settings      enable row level security;
alter table public.profiles               enable row level security;
alter table public.user_roles             enable row level security;
alter table public.roster_entries         enable row level security;
alter table public.courses                enable row level security;
alter table public.course_members         enable row level security;
alter table public.sessions               enable row level security;
alter table public.session_secrets        enable row level security;
alter table public.session_members        enable row level security;
alter table public.topics                 enable row level security;
alter table public.activities             enable row level security;
alter table public.code_drafts            enable row level security;
alter table public.code_snapshots         enable row level security;
alter table public.clusters               enable row level security;
alter table public.help_requests          enable row level security;
alter table public.help_request_messages  enable row level security;
alter table public.help_request_notes     enable row level security;
alter table public.help_request_events    enable row level security;
alter table public.understanding_signals  enable row level security;
alter table public.session_pulse          enable row level security;
alter table public.pulse_history          enable row level security;
alter table public.polls                  enable row level security;
alter table public.poll_responses         enable row level security;
alter table public.notebook_entries       enable row level security;
alter table public.exit_tickets           enable row level security;
alter table public.rate_limits            enable row level security;
alter table public.audit_log              enable row level security;

-- platform_settings, rate_limits: no policies and no grants (RPC/service only).

-- ============ profiles ============
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select public.auth_uid()));
create policy profiles_select_admin on public.profiles for select to authenticated
  using ((select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select public.auth_uid())) with check (id = (select public.auth_uid()));

-- ============ user_roles / roster ============
grant select on public.user_roles to authenticated;
create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = (select public.auth_uid()));
create policy user_roles_select_admin on public.user_roles for select to authenticated
  using ((select public.is_admin()));

grant select on public.roster_entries to authenticated;
create policy roster_select_admin on public.roster_entries for select to authenticated
  using ((select public.is_admin()));

-- ============ courses / members ============
grant select on public.courses to authenticated;
grant update (title, description, settings) on public.courses to authenticated;
create policy courses_select on public.courses for select to authenticated
  using (public.is_course_teacher(id) or public.is_course_student(id) or (select public.is_admin()));
create policy courses_update_teacher on public.courses for update to authenticated
  using (public.is_course_teacher(id)) with check (public.is_course_teacher(id));

grant select on public.course_members to authenticated;
create policy course_members_select_own on public.course_members for select to authenticated
  using (user_id = (select public.auth_uid()));
create policy course_members_select_teacher on public.course_members for select to authenticated
  using (public.is_course_teacher(course_id) or (select public.is_admin()));

-- ============ sessions ============
grant select on public.sessions to authenticated;
create policy sessions_select on public.sessions for select to authenticated
  using (public.is_course_teacher(course_id) or public.is_course_student(course_id)
         or (select public.is_admin()));

grant select on public.session_secrets to authenticated;
create policy session_secrets_teacher on public.session_secrets for select to authenticated
  using (public.is_session_teacher(session_id));

grant select on public.session_members to authenticated;
create policy session_members_own on public.session_members for select to authenticated
  using (student_id = (select public.auth_uid()));
create policy session_members_teacher on public.session_members for select to authenticated
  using (public.is_session_teacher(session_id));

grant select on public.topics to authenticated;
create policy topics_select on public.topics for select to authenticated
  using (public.is_session_teacher(session_id) or public.is_session_member(session_id));

-- ============ activities / code ============
grant select, insert, update, delete on public.activities to authenticated;
create policy activities_select on public.activities for select to authenticated
  using (public.is_session_teacher(session_id) or public.is_session_member(session_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.is_session_teacher(session_id) and created_by = (select public.auth_uid()));
create policy activities_update on public.activities for update to authenticated
  using (public.is_session_teacher(session_id)) with check (public.is_session_teacher(session_id));
create policy activities_delete on public.activities for delete to authenticated
  using (public.is_session_teacher(session_id));

-- Drafts and snapshots: students read own; writes only via RPC.
-- Teachers read code ONLY via RPC keyed by request id (keeps masked/strict anonymity honest).
grant select on public.code_drafts to authenticated;
create policy code_drafts_own on public.code_drafts for select to authenticated
  using (student_id = (select public.auth_uid()));

grant select on public.code_snapshots to authenticated;
create policy code_snapshots_own on public.code_snapshots for select to authenticated
  using (student_id = (select public.auth_uid()));

-- ============ help requests ============
-- Students: own rows. Teachers: NO direct table access (they use teacher_* RPCs which
-- never return student identity for anonymous rows).
grant select on public.help_requests to authenticated;
create policy hr_select_own on public.help_requests for select to authenticated
  using (student_id = (select public.auth_uid()));

grant select on public.help_request_messages to authenticated;
create policy hrm_select_own on public.help_request_messages for select to authenticated
  using (exists (select 1 from public.help_requests r
                 where r.id = request_id and r.student_id = (select public.auth_uid())));

-- Teacher-only notes. NO student policy exists, ever.
grant select, insert, update on public.help_request_notes to authenticated;
create policy hrn_select on public.help_request_notes for select to authenticated
  using (teacher_id = (select public.auth_uid()) and public.is_request_teacher(request_id));
create policy hrn_insert on public.help_request_notes for insert to authenticated
  with check (teacher_id = (select public.auth_uid()) and public.is_request_teacher(request_id));
create policy hrn_update on public.help_request_notes for update to authenticated
  using (teacher_id = (select public.auth_uid()) and public.is_request_teacher(request_id))
  with check (teacher_id = (select public.auth_uid()) and public.is_request_teacher(request_id));

-- help_request_events: no direct access (timeline served via RPC).

grant select on public.clusters to authenticated;
create policy clusters_teacher on public.clusters for select to authenticated
  using (public.is_session_teacher(session_id));

-- ============ signals / pulse / polls ============
grant select on public.understanding_signals to authenticated;
create policy signals_own on public.understanding_signals for select to authenticated
  using (student_id = (select public.auth_uid()));

grant select on public.session_pulse to authenticated;
create policy pulse_teacher on public.session_pulse for select to authenticated
  using (public.is_session_teacher(session_id));

grant select on public.pulse_history to authenticated;
create policy pulse_history_teacher on public.pulse_history for select to authenticated
  using (public.is_session_teacher(session_id));

-- Polls: teachers directly; students via RPC get_session_polls (hides `correct` until reveal).
grant select on public.polls to authenticated;
create policy polls_teacher on public.polls for select to authenticated
  using (public.is_session_teacher(session_id));

grant select on public.poll_responses to authenticated;
create policy poll_responses_own on public.poll_responses for select to authenticated
  using (student_id = (select public.auth_uid()));
create policy poll_responses_teacher on public.poll_responses for select to authenticated
  using (public.is_poll_teacher(poll_id));

-- ============ notebook / exit tickets ============
grant select, insert, update, delete on public.notebook_entries to authenticated;
create policy notebook_select on public.notebook_entries for select to authenticated
  using (student_id = (select public.auth_uid()));
create policy notebook_insert on public.notebook_entries for insert to authenticated
  with check (student_id = (select public.auth_uid()) and public.is_course_student(course_id));
create policy notebook_update on public.notebook_entries for update to authenticated
  using (student_id = (select public.auth_uid()))
  with check (student_id = (select public.auth_uid()));
create policy notebook_delete on public.notebook_entries for delete to authenticated
  using (student_id = (select public.auth_uid()));

grant select on public.exit_tickets to authenticated;
create policy exit_own on public.exit_tickets for select to authenticated
  using (student_id = (select public.auth_uid()));
create policy exit_teacher on public.exit_tickets for select to authenticated
  using (public.is_session_teacher(session_id));

-- ============ audit ============
grant select on public.audit_log to authenticated;
create policy audit_admin on public.audit_log for select to authenticated
  using ((select public.is_admin()));
