-- =====================================================================
-- Draft engine: one mutable CAS-guarded draft + immutable snapshots
-- =====================================================================
create function public.save_draft(p_activity uuid, p_code text, p_base_rev int, p_device text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  v_a public.activities;
  v_d public.code_drafts;
  v_last public.code_snapshots;
  v_rev int;
begin
  if p_code is null or char_length(p_code) > 100000 then raise exception 'too_large'; end if;
  select * into v_a from public.activities where id = p_activity;
  if not found or not public.is_activity_member(p_activity) then raise exception 'permission_denied'; end if;
  if v_a.closed then raise exception 'activity_closed'; end if;
  perform public.check_rate('draft', 40, 60);

  select * into v_d from public.code_drafts where activity_id = p_activity and student_id = v_uid for update;
  if not found then
    insert into public.code_drafts(activity_id, student_id, code, rev, device_id)
    values (p_activity, v_uid, p_code, 1, p_device);
    v_rev := 1;
  elsif v_d.rev <> p_base_rev then
    return jsonb_build_object('conflict', true,
      'server', jsonb_build_object('code', v_d.code, 'rev', v_d.rev,
                                   'saved_at', v_d.saved_at, 'device_id', v_d.device_id));
  else
    v_rev := v_d.rev + 1;
    update public.code_drafts
       set code = p_code, rev = v_rev, device_id = p_device, saved_at = now()
     where activity_id = p_activity and student_id = v_uid;
  end if;

  -- Autosave snapshot: at most one per minute, only for a meaningful change
  select * into v_last from public.code_snapshots
   where activity_id = p_activity and student_id = v_uid order by version desc limit 1;
  if not found
     or (v_last.created_at < now() - interval '60 seconds' and v_last.code is distinct from p_code
         and (abs(char_length(p_code) - char_length(v_last.code)) >= 20
              or v_last.created_at < now() - interval '300 seconds')) then
    insert into public.code_snapshots(activity_id, student_id, version, kind, code)
    values (p_activity, v_uid, public._next_snapshot_version(p_activity, v_uid), 'autosave', p_code);
  end if;

  return jsonb_build_object('conflict', false, 'rev', v_rev, 'saved_at', now());
end $$;

create function public.submit_code(p_activity uuid, p_code text, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  v_a public.activities;
  v_ver int; v_existing public.code_snapshots; v_created timestamptz;
begin
  if p_idempotency_key is null then raise exception 'invalid_request'; end if;
  if p_code is null or char_length(p_code) > 100000 then raise exception 'too_large'; end if;
  select * into v_a from public.activities where id = p_activity;
  if not found or not public.is_activity_member(p_activity) then raise exception 'permission_denied'; end if;

  v_ver := public._next_snapshot_version(p_activity, v_uid);   -- takes the advisory lock
  select * into v_existing from public.code_snapshots
   where student_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('version', v_existing.version, 'created_at', v_existing.created_at, 'duplicate', true);
  end if;

  if v_a.closed then raise exception 'activity_closed'; end if;
  if v_a.due_at is not null and now() > v_a.due_at then raise exception 'deadline_passed'; end if;
  perform public.check_rate('submit', 10, 60);

  insert into public.code_snapshots(activity_id, student_id, version, kind, code, idempotency_key)
  values (p_activity, v_uid, v_ver, 'submission', p_code, p_idempotency_key)
  returning created_at into v_created;
  return jsonb_build_object('version', v_ver, 'created_at', v_created, 'duplicate', false);
end $$;

-- Teacher views of a student's code are keyed by REQUEST id so anonymity is preserved.
create function public.get_student_draft(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_r public.help_requests; v_d public.code_drafts; v_snaps jsonb;
begin
  perform public._require_user();
  select * into v_r from public.help_requests where id = p_request;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;
  if v_r.activity_id is null then return jsonb_build_object('has_code', false); end if;

  select * into v_d from public.code_drafts where activity_id = v_r.activity_id and student_id = v_r.student_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'version', s.version, 'kind', s.kind,
                                               'created_at', s.created_at) order by s.version desc), '[]')
    into v_snaps
    from (select * from public.code_snapshots
           where activity_id = v_r.activity_id and student_id = v_r.student_id
           order by version desc limit 20) s;

  return jsonb_build_object(
    'has_code', true,
    'request_snapshot_id', v_r.snapshot_id,
    'draft', case when v_d.activity_id is null then null
                  else jsonb_build_object('code', v_d.code, 'rev', v_d.rev, 'saved_at', v_d.saved_at) end,
    'snapshots', v_snaps);
end $$;

create function public.get_request_snapshot(p_request uuid, p_snapshot uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_r public.help_requests; v_s public.code_snapshots;
begin
  perform public._require_user();
  select * into v_r from public.help_requests where id = p_request;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;
  select * into v_s from public.code_snapshots
   where id = p_snapshot and activity_id = v_r.activity_id and student_id = v_r.student_id;
  if not found then raise exception 'not_found'; end if;
  return jsonb_build_object('id', v_s.id, 'version', v_s.version, 'kind', v_s.kind,
                            'code', v_s.code, 'created_at', v_s.created_at);
end $$;

-- Submissions are inherently identified (a graded-style hand-in, not a help request).
create function public.list_activity_submissions(p_activity uuid)
returns table (student_id uuid, full_name text, latest_version int, submitted_at timestamptz, attempts int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_user();
  if not public.is_activity_teacher(p_activity) then raise exception 'permission_denied'; end if;
  return query
  select s.student_id, p.full_name, max(s.version), max(s.created_at), count(*)::int
    from public.code_snapshots s join public.profiles p on p.id = s.student_id
   where s.activity_id = p_activity and s.kind = 'submission'
   group by s.student_id, p.full_name order by p.full_name;
end $$;

-- =====================================================================
-- Polls (B12)
-- =====================================================================
create function public.create_poll(
  p_session uuid, p_question text, p_kind text, p_options jsonb default '[]',
  p_correct jsonb default null, p_allow_change boolean default false, p_require_confidence boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_id uuid;
begin
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  insert into public.polls(session_id, question, kind, options, correct, allow_change, require_confidence, created_by)
  values (p_session, btrim(p_question), p_kind, coalesce(p_options, '[]'), p_correct,
          p_allow_change, p_require_confidence, v_uid)
  returning id into v_id;
  return v_id;
end $$;

create function public._set_poll_status(p_poll uuid, p_to text, p_from text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.polls;
begin
  perform public._require_user();
  select * into v_p from public.polls where id = p_poll for update;
  if not found or not public.is_session_teacher(v_p.session_id) then raise exception 'permission_denied'; end if;
  if not (v_p.status = any (p_from)) then raise exception 'invalid_transition'; end if;
  if p_to = 'open' and (select status from public.sessions where id = v_p.session_id) <> 'live' then
    raise exception 'session_not_live';
  end if;
  update public.polls set status = p_to where id = p_poll;
end $$;

create function public.open_poll(p_poll uuid) returns void
language sql security definer set search_path = '' as $$
  select public._set_poll_status(p_poll, 'open', array['draft'])
$$;
create function public.close_poll(p_poll uuid) returns void
language sql security definer set search_path = '' as $$
  select public._set_poll_status(p_poll, 'closed', array['open'])
$$;
create function public.reveal_poll(p_poll uuid) returns void
language sql security definer set search_path = '' as $$
  select public._set_poll_status(p_poll, 'revealed', array['open', 'closed'])
$$;

create function public.respond_poll(p_poll uuid, p_response jsonb, p_confidence smallint default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_p public.polls;
begin
  select * into v_p from public.polls where id = p_poll;
  if not found or not public.is_session_member(v_p.session_id) then raise exception 'not_member'; end if;
  if v_p.status <> 'open' then raise exception 'poll_closed'; end if;
  if v_p.require_confidence and p_confidence is null then raise exception 'confidence_required'; end if;
  perform public.check_rate('poll', 30, 60);
  if exists (select 1 from public.poll_responses where poll_id = p_poll and student_id = v_uid)
     and not v_p.allow_change then
    raise exception 'already_responded';
  end if;
  insert into public.poll_responses(poll_id, student_id, response, confidence)
  values (p_poll, v_uid, p_response, p_confidence)
  on conflict (poll_id, student_id)
  do update set response = excluded.response, confidence = excluded.confidence, updated_at = now();
end $$;

create function public.get_session_polls(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_teacher boolean;
begin
  v_teacher := public.is_session_teacher(p_session);
  if not v_teacher and not public.is_session_member(p_session) then raise exception 'not_member'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'question', p.question, 'kind', p.kind, 'options', p.options, 'status', p.status,
      'allow_change', p.allow_change, 'require_confidence', p.require_confidence,
      'correct', case when v_teacher or p.status = 'revealed' then p.correct end,
      'my_response', (select jsonb_build_object('response', r.response, 'confidence', r.confidence)
                        from public.poll_responses r where r.poll_id = p.id and r.student_id = v_uid)
    ) order by p.created_at)
    from public.polls p
    where p.session_id = p_session and (v_teacher or p.status <> 'draft')), '[]');
end $$;

create function public.poll_results(p_poll uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_p public.polls; v_counts jsonb; v_total int; v_conf jsonb;
begin
  perform public._require_user();
  select * into v_p from public.polls where id = p_poll;
  if not found then raise exception 'not_found'; end if;
  if not (public.is_session_teacher(v_p.session_id)
          or (public.is_session_member(v_p.session_id) and v_p.status = 'revealed')) then
    raise exception 'permission_denied';
  end if;
  select count(*) into v_total from public.poll_responses where poll_id = p_poll;
  select coalesce(jsonb_object_agg(k, n), '{}') into v_counts
    from (select response::text as k, count(*) as n from public.poll_responses
           where poll_id = p_poll group by response::text) t;
  select coalesce(jsonb_object_agg(k, n), '{}') into v_conf
    from (select confidence::text as k, count(*) as n from public.poll_responses
           where poll_id = p_poll and confidence is not null group by confidence) t;
  return jsonb_build_object('total', v_total, 'counts', v_counts, 'confidence', v_conf);
end $$;

-- =====================================================================
-- Exit ticket (B13)
-- =====================================================================
create function public.submit_exit_ticket(p_session uuid, p_muddiest text, p_confidence smallint)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_s public.sessions;
begin
  select * into v_s from public.sessions where id = p_session;
  if not found or not public.is_session_member(p_session) then raise exception 'not_member'; end if;
  if v_s.status = 'scheduled'
     or (v_s.status = 'ended' and now() > v_s.ended_at + interval '2 hours') then
    raise exception 'session_not_live';
  end if;
  insert into public.exit_tickets(session_id, student_id, muddiest, confidence)
  values (p_session, v_uid, nullif(btrim(coalesce(p_muddiest, '')), ''), p_confidence)
  on conflict do nothing;
end $$;

grant execute on function
  public.save_draft(uuid, text, int, text), public.submit_code(uuid, text, uuid),
  public.get_student_draft(uuid), public.get_request_snapshot(uuid, uuid),
  public.list_activity_submissions(uuid),
  public.create_poll(uuid, text, text, jsonb, jsonb, boolean, boolean),
  public.open_poll(uuid), public.close_poll(uuid), public.reveal_poll(uuid),
  public.respond_poll(uuid, jsonb, smallint), public.get_session_polls(uuid),
  public.poll_results(uuid), public.submit_exit_ticket(uuid, text, smallint)
  to authenticated;
