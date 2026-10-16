-- Teacher: roster of their own course (names are visible to the teacher who enrolled the students).
create function public.teacher_course_roster(p_course uuid)
returns table (user_id uuid, full_name text, ug_number text, status public.enrol_status)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_user();
  if not public.is_course_teacher(p_course) then raise exception 'permission_denied'; end if;
  return query
  select m.user_id, p.full_name, p.ug_number, m.status
    from public.course_members m join public.profiles p on p.id = m.user_id
   where m.course_id = p_course and m.member_role = 'student'
   order by p.full_name;
end $$;

create function public.teacher_session_stats(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  return jsonb_build_object(
    'joined', (select count(*) from public.session_members where session_id = p_session),
    'connected', (select count(*) from public.session_members
                   where session_id = p_session and last_seen_at > now() - interval '2 minutes'),
    'enrolled', (select count(*) from public.course_members m join public.sessions s on s.course_id = m.course_id
                  where s.id = p_session and m.member_role = 'student' and m.status = 'active'));
end $$;

-- Doubt Bank across all of a teacher's sessions. Same identity masking as the live queue.
create function public.teacher_doubt_bank()
returns table (
  request_id uuid, session_id uuid, session_title text, course_title text, display_name text,
  is_anonymous boolean, category public.request_category, message text, status public.request_status,
  has_code boolean, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_user();
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;
  return query
  select r.id, r.session_id, s.title, c.title,
         case when (not r.is_anonymous or r.anon_policy = 'identified' or r.identity_revealed)
              then p.full_name else public._pseudonym(r.session_id, r.student_id) end,
         r.is_anonymous, r.category, r.message, r.status, (r.snapshot_id is not null), r.created_at
    from public.help_requests r
    join public.sessions s on s.id = r.session_id
    join public.courses c on c.id = s.course_id
    join public.profiles p on p.id = r.student_id
   where r.is_doubt_bank and public.is_course_teacher(s.course_id)
   order by (r.status = 'handled'), r.created_at;
end $$;

create function public.admin_update_settings(p_roster_mode boolean, p_ug_regex text, p_doubt_bank_hours int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  begin
    perform '' ~ p_ug_regex;   -- reject invalid regular expressions up front
  exception when others then raise exception 'invalid_input';
  end;
  if p_doubt_bank_hours not between 1 and 720 then raise exception 'invalid_input'; end if;
  update public.platform_settings
     set roster_mode = p_roster_mode, ug_regex = p_ug_regex,
         default_doubt_bank_hours = p_doubt_bank_hours, updated_at = now() where id;
  perform public._audit('update_settings', 'settings', null,
    jsonb_build_object('roster_mode', p_roster_mode, 'ug_regex', p_ug_regex, 'doubt_bank_hours', p_doubt_bank_hours));
end $$;

create function public.admin_list_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  return (select jsonb_build_object('roster_mode', roster_mode, 'ug_regex', ug_regex,
                                    'doubt_bank_hours', default_doubt_bank_hours) from public.platform_settings where id);
end $$;

-- Pulse timeline sampled lazily (no cron on the free tier): at most one row per 30 s while signals change.
create or replace function public._recompute_pulse(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_by_topic jsonb; v_topic uuid; v_p public.session_pulse;
begin
  perform pg_advisory_xact_lock(hashtextextended('pulse:' || p_session::text, 0));

  select coalesce(jsonb_object_agg(t.topic_id, t.counts), '{}'::jsonb) into v_by_topic
  from (
    select coalesce(topic_id::text, 'none') as topic_id,
           jsonb_build_object(
             'understand', count(*) filter (where value = 'understand'),
             'partial',    count(*) filter (where value = 'partial'),
             'lost',       count(*) filter (where value = 'lost')) as counts
    from public.understanding_signals where session_id = p_session
    group by topic_id) t;

  insert into public.session_pulse(session_id, understand, partial, lost, joined, by_topic, updated_at)
  select p_session,
         count(*) filter (where value = 'understand'),
         count(*) filter (where value = 'partial'),
         count(*) filter (where value = 'lost'),
         (select count(*) from public.session_members where session_id = p_session),
         v_by_topic, now()
  from public.understanding_signals where session_id = p_session
  on conflict (session_id) do update set
    understand = excluded.understand, partial = excluded.partial, lost = excluded.lost,
    joined = excluded.joined, by_topic = excluded.by_topic, updated_at = now()
  returning * into v_p;

  if not exists (select 1 from public.pulse_history
                  where session_id = p_session and at > now() - interval '30 seconds') then
    select current_topic_id into v_topic from public.sessions where id = p_session;
    insert into public.pulse_history(session_id, at, understand, partial, lost, topic_id)
    values (p_session, now(), v_p.understand, v_p.partial, v_p.lost, v_topic)
    on conflict do nothing;
  end if;
end $$;

grant execute on function
  public.teacher_course_roster(uuid), public.teacher_session_stats(uuid), public.teacher_doubt_bank(),
  public.admin_update_settings(boolean, text, int), public.admin_list_settings()
  to authenticated;
