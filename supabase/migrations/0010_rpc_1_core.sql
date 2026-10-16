-- =====================================================================
-- Internal helpers (not granted to clients)
-- =====================================================================
create function public._require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := (select auth.uid());
begin
  if v is null then raise exception 'not_authenticated'; end if;
  if not public.is_verified() then raise exception 'not_verified'; end if;
  return v;
end $$;

create function public._gen_join_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- 31 unambiguous chars
  v_code text;
  v_b int;
  v_try int := 0;
begin
  loop
    v_code := '';
    while char_length(v_code) < 6 loop
      v_b := get_byte(extensions.gen_random_bytes(1), 0);
      if v_b < 248 then  -- 248 = 31 * 8: rejection sampling, no modulo bias
        v_code := v_code || substr(alphabet, (v_b % 31) + 1, 1);
      end if;
    end loop;
    exit when not exists (select 1 from public.session_secrets where join_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'code_generation_failed'; end if;
  end loop;
  return v_code;
end $$;

create function public._pseudonym(p_session uuid, p_student uuid) returns text
language sql stable security definer set search_path = '' as $$
  select 'Student #' || upper(substr(encode(
    extensions.hmac((p_session::text || p_student::text), s.pseudonym_salt, 'sha256'), 'hex'), 1, 3))
  from public.platform_settings s where s.id
$$;

create function public._audit(p_action text, p_type text, p_target uuid, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log(actor_id, action, target_type, target_id, metadata)
  values ((select auth.uid()), p_action, p_type, p_target, coalesce(p_meta, '{}'))
$$;

create function public._recompute_pulse(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_by_topic jsonb;
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
    joined = excluded.joined, by_topic = excluded.by_topic, updated_at = now();
end $$;

-- =====================================================================
-- Public settings (needed by the register page before login)
-- =====================================================================
create function public.get_public_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('roster_mode', roster_mode, 'ug_regex', ug_regex,
                            'default_doubt_bank_hours', default_doubt_bank_hours)
  from public.platform_settings where id
$$;
grant execute on function public.get_public_settings() to anon, authenticated;

-- =====================================================================
-- Courses
-- =====================================================================
create function public.create_course(p_title text, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_id uuid;
begin
  if not public.has_role('teacher') then raise exception 'permission_denied'; end if;
  insert into public.courses(title, description, owner_id)
  values (btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), v_uid)
  returning id into v_id;
  insert into public.course_members(course_id, user_id, member_role) values (v_id, v_uid, 'teacher');
  return v_id;
end $$;

-- Enrol students by UG number. Returns which numbers matched a verified account.
create function public.enrol_students(p_course uuid, p_ug_numbers text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_enrolled int := 0;
  v_missing text[] := '{}';
  v_ug text; v_norm text; v_uid uuid;
begin
  perform public._require_user();
  if not public.is_course_teacher(p_course) then raise exception 'permission_denied'; end if;
  if coalesce(array_length(p_ug_numbers, 1), 0) > 500 then raise exception 'too_many'; end if;

  foreach v_ug in array coalesce(p_ug_numbers, '{}') loop
    v_norm := upper(btrim(v_ug));
    select p.id into v_uid from public.profiles p
      where p.normalised_ug = v_norm and p.verification = 'verified';
    if v_uid is null then
      v_missing := v_missing || v_norm;
    else
      insert into public.course_members(course_id, user_id, member_role, status)
      values (p_course, v_uid, 'student', 'active')
      on conflict (course_id, user_id) do update set status = 'active'
        where public.course_members.member_role = 'student';
      v_enrolled := v_enrolled + 1;
    end if;
  end loop;
  return jsonb_build_object('enrolled', v_enrolled, 'not_found', to_jsonb(v_missing));
end $$;

create function public.remove_student(p_course uuid, p_student uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_course_teacher(p_course) then raise exception 'permission_denied'; end if;
  update public.course_members set status = 'removed'
   where course_id = p_course and user_id = p_student and member_role = 'student';
end $$;

-- =====================================================================
-- Sessions lifecycle
-- =====================================================================
create function public.create_session(p_course uuid, p_title text, p_scheduled_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_id uuid; v_code text;
begin
  if not public.is_course_teacher(p_course) then raise exception 'permission_denied'; end if;
  insert into public.sessions(course_id, teacher_id, title, scheduled_at)
  values (p_course, v_uid, btrim(p_title), p_scheduled_at) returning id into v_id;
  v_code := public._gen_join_code();
  insert into public.session_secrets(session_id, join_code, expires_at)
  values (v_id, v_code, now() + interval '12 hours');
  insert into public.session_pulse(session_id) values (v_id);
  return jsonb_build_object('id', v_id, 'join_code', v_code);
end $$;

create function public.rotate_join_code(p_session uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  if (select status from public.sessions where id = p_session) = 'ended' then
    raise exception 'session_ended';
  end if;
  v_code := public._gen_join_code();
  insert into public.session_secrets(session_id, join_code, expires_at)
  values (p_session, v_code, now() + interval '12 hours')
  on conflict (session_id) do update set join_code = excluded.join_code, expires_at = excluded.expires_at;
  return v_code;
end $$;

create function public.start_session(p_session uuid, p_expected_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.sessions;
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  update public.sessions set status = 'live', started_at = coalesce(started_at, now()), version = version + 1
   where id = p_session and version = p_expected_version and status = 'scheduled'
  returning * into v_row;
  if not found then raise exception 'already_changed'; end if;
  -- extend the join code window from the moment the lecture actually starts
  update public.session_secrets set expires_at = now() + interval '12 hours' where session_id = p_session;
  return to_jsonb(v_row);
end $$;

create function public.end_session(p_session uuid, p_expected_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.sessions;
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  select * into v_row from public.sessions where id = p_session for update;
  if v_row.status = 'ended' then return to_jsonb(v_row); end if;   -- idempotent
  if v_row.version <> p_expected_version then raise exception 'already_changed'; end if;

  update public.sessions
     set status = 'ended', ended_at = now(), started_at = coalesce(started_at, now()),
         questions_paused = false, qa_window_open = false, version = version + 1
   where id = p_session returning * into v_row;
  update public.polls set status = 'closed' where session_id = p_session and status = 'open';
  update public.activities set closed = true where session_id = p_session;
  update public.topics set ended_at = now() where session_id = p_session and ended_at is null;
  delete from public.session_secrets where session_id = p_session;   -- code is dead after the lecture
  insert into public.pulse_history(session_id, at, understand, partial, lost, topic_id)
  select p_session, now(), understand, partial, lost, v_row.current_topic_id
    from public.session_pulse where session_id = p_session
  on conflict do nothing;
  return to_jsonb(v_row);
end $$;

create function public.set_topic(p_session uuid, p_label text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_topic uuid;
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  if (select status from public.sessions where id = p_session) <> 'live' then
    raise exception 'session_not_live';
  end if;
  update public.topics set ended_at = now() where session_id = p_session and ended_at is null;
  if p_label is null or btrim(p_label) = '' then
    update public.sessions set current_topic_id = null, version = version + 1 where id = p_session;
    return null;
  end if;
  insert into public.topics(session_id, label) values (p_session, btrim(p_label)) returning id into v_topic;
  update public.sessions set current_topic_id = v_topic, version = version + 1 where id = p_session;
  return v_topic;
end $$;

create function public.pause_questions(p_session uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  update public.sessions set questions_paused = p_paused, version = version + 1
   where id = p_session and status = 'live';
  if not found then raise exception 'session_not_live'; end if;
end $$;

create function public.open_qa_window(p_session uuid, p_open boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  update public.sessions set qa_window_open = p_open, version = version + 1
   where id = p_session and status = 'live';
  if not found then raise exception 'session_not_live'; end if;
end $$;

-- =====================================================================
-- Joining
-- =====================================================================
-- IMPORTANT: join failures AFTER the rate-limit check are returned as a payload, not raised.
-- Raising would roll back the rate-limit hit, so failed guesses would never count and the
-- limiter would be useless against join-code brute force.
create function public._join(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_s public.sessions;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_or_expired'); end if;
  if not public.is_course_student(v_s.course_id) then
    return jsonb_build_object('ok', false, 'error', 'not_enrolled');
  end if;
  if v_s.status <> 'live' then return jsonb_build_object('ok', false, 'error', 'session_not_live'); end if;
  insert into public.session_members(session_id, student_id, last_seen_at)
  values (p_session, v_uid, now()) on conflict do nothing;
  perform public._recompute_pulse(p_session);
  return jsonb_build_object('ok', true, 'session_id', p_session);
end $$;

create function public.join_session_by_code(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_sid uuid;
begin
  perform public._require_user();
  perform public.check_rate('join', 10, 60);
  select session_id into v_sid from public.session_secrets
   where join_code = upper(btrim(coalesce(p_code, ''))) and expires_at > now();
  if v_sid is null then return jsonb_build_object('ok', false, 'error', 'invalid_or_expired'); end if;
  return public._join(v_sid);
end $$;

create function public.join_session(p_session uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_user();
  perform public.check_rate('join', 10, 60);
  return public._join(p_session);
end $$;

create function public.heartbeat(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.session_members set last_seen_at = now()
   where session_id = p_session and student_id = (select auth.uid())
     and (last_seen_at is null or last_seen_at < now() - interval '50 seconds');
end $$;

-- =====================================================================
-- Understanding signals and pulse
-- =====================================================================
create function public.set_signal(p_session uuid, p_value public.understanding, p_topic uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_s public.sessions; v_topic uuid; v_old public.understanding_signals;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found or not public.is_session_member(p_session) then raise exception 'not_member'; end if;
  if v_s.status <> 'live' then raise exception 'session_not_live'; end if;
  v_topic := coalesce(p_topic, v_s.current_topic_id);
  if v_topic is not null and not exists
     (select 1 from public.topics where id = v_topic and session_id = p_session) then
    raise exception 'invalid_topic';
  end if;

  select * into v_old from public.understanding_signals
   where session_id = p_session and student_id = v_uid;
  if found and v_old.value = p_value and v_old.topic_id is not distinct from v_topic then
    return;   -- no-op if unchanged
  end if;

  insert into public.understanding_signals(session_id, student_id, topic_id, value)
  values (p_session, v_uid, v_topic, p_value)
  on conflict (session_id, student_id)
  do update set value = excluded.value, topic_id = excluded.topic_id, updated_at = now();
  perform public._recompute_pulse(p_session);
end $$;

-- B3 reveal-after-commit + B4 thresholded counts. Buckets under 3 are returned as null.
create function public.get_pulse_after_commit(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  v_sig public.understanding_signals;
  v_p public.session_pulse;
  v_total int; v_topic_lost int;
begin
  if not public.is_session_member(p_session) then raise exception 'not_member'; end if;
  select * into v_sig from public.understanding_signals where session_id = p_session and student_id = v_uid;
  if not found then return jsonb_build_object('revealed', false); end if;
  select * into v_p from public.session_pulse where session_id = p_session;
  v_total := coalesce(v_p.understand + v_p.partial + v_p.lost, 0);

  v_topic_lost := null;
  if v_sig.topic_id is not null then
    select count(*) into v_topic_lost from public.understanding_signals
     where session_id = p_session and topic_id = v_sig.topic_id and value = 'lost' and student_id <> v_uid;
    if v_topic_lost < 3 then v_topic_lost := null; end if;
  end if;

  return jsonb_build_object(
    'revealed', true,
    'total', v_total,
    'understand', case when v_p.understand >= 3 then v_p.understand end,
    'partial',    case when v_p.partial    >= 3 then v_p.partial    end,
    'lost',       case when v_p.lost       >= 3 then v_p.lost       end,
    'others_lost_on_topic', v_topic_lost);
end $$;

grant execute on function
  public.create_course(text, text), public.enrol_students(uuid, text[]), public.remove_student(uuid, uuid),
  public.create_session(uuid, text, timestamptz), public.rotate_join_code(uuid),
  public.start_session(uuid, int), public.end_session(uuid, int), public.set_topic(uuid, text),
  public.pause_questions(uuid, boolean), public.open_qa_window(uuid, boolean),
  public.join_session_by_code(text), public.join_session(uuid), public.heartbeat(uuid),
  public.set_signal(uuid, public.understanding, uuid), public.get_pulse_after_commit(uuid)
  to authenticated;
