create function public._next_snapshot_version(p_activity uuid, p_student uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_activity::text || p_student::text, 0));
  select coalesce(max(version), 0) + 1 into v from public.code_snapshots
   where activity_id = p_activity and student_id = p_student;
  return v;
end $$;

create function public._request_event(p_request uuid, p_type text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.help_request_events(request_id, actor_id, event_type, metadata)
  values (p_request, (select auth.uid()), p_type, coalesce(p_meta, '{}'))
$$;

-- =====================================================================
-- Create a help request (live or Doubt Bank)
-- =====================================================================
create function public.create_help_request(
  p_session uuid,
  p_category public.request_category,
  p_message text,
  p_idempotency_key uuid,
  p_activity uuid default null,
  p_topic uuid default null,
  p_is_anonymous boolean default false,
  p_is_blocked boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  v_s public.sessions;
  v_course public.courses;
  v_existing public.help_requests;
  v_policy public.anon_mode;
  v_doubt boolean := false;
  v_hours int;
  v_topic uuid;
  v_snap uuid;
  v_cluster uuid;
  v_req public.help_requests;
  v_pos int;
  v_others int;
  v_label text;
  v_draft public.code_drafts;
begin
  if p_idempotency_key is null then raise exception 'invalid_request'; end if;

  select * into v_existing from public.help_requests
   where student_id = v_uid and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('duplicate', true,
      'request', jsonb_build_object('id', v_existing.id, 'status', v_existing.status,
                                    'created_at', v_existing.created_at));
  end if;

  select * into v_s from public.sessions where id = p_session;
  if not found then raise exception 'session_not_found'; end if;
  select * into v_course from public.courses where id = v_s.course_id;

  if v_s.status = 'live' then
    if not public.is_session_member(p_session) then raise exception 'not_member'; end if;
    if v_s.questions_paused then raise exception 'paused'; end if;
  elsif v_s.status = 'ended' then
    v_hours := coalesce((v_s.settings ->> 'doubt_bank_hours')::int,
                        (v_course.settings ->> 'doubt_bank_hours')::int, 48);
    if now() > v_s.ended_at + make_interval(hours => v_hours) then raise exception 'session_ended'; end if;
    if not public.is_course_student(v_s.course_id) then raise exception 'not_enrolled'; end if;
    v_doubt := true;
  else
    raise exception 'session_not_live';
  end if;

  perform public.check_rate('help:' || p_session::text, 5, 600);
  perform public.check_rate('help_day', 20, 86400);

  if (select count(*) from public.help_requests
       where student_id = v_uid and session_id = p_session
         and status in ('open', 'in_progress', 'reopened')) >= 3 then
    raise exception 'too_many_open';
  end if;

  v_topic := coalesce(p_topic, case when v_s.status = 'live' then v_s.current_topic_id end);
  if v_topic is not null and not exists
     (select 1 from public.topics where id = v_topic and session_id = p_session) then
    raise exception 'invalid_topic';
  end if;
  if p_activity is not null and not exists
     (select 1 from public.activities where id = p_activity and session_id = p_session) then
    raise exception 'invalid_activity';
  end if;

  v_policy := coalesce(v_s.settings ->> 'anonymity_mode', v_course.settings ->> 'anonymity_mode', 'masked')::public.anon_mode;

  -- Snapshot of the code at the moment of asking
  if p_activity is not null then
    select * into v_draft from public.code_drafts where activity_id = p_activity and student_id = v_uid;
    if found then
      insert into public.code_snapshots(activity_id, student_id, version, kind, code)
      values (p_activity, v_uid, public._next_snapshot_version(p_activity, v_uid), 'request', v_draft.code)
      returning id into v_snap;
    end if;
  end if;

  -- Free clustering: pg_trgm similarity inside the same topic/activity, last 90 minutes
  select r.cluster_id into v_cluster
    from public.help_requests r
   where r.session_id = p_session and r.cluster_id is not null
     and r.status in ('open', 'in_progress', 'reopened')
     and r.created_at > now() - interval '90 minutes'
     and ((p_activity is not null and r.activity_id = p_activity)
          or (v_topic is not null and r.topic_id = v_topic))
     and extensions.similarity(r.message, p_message) > 0.35
   order by extensions.similarity(r.message, p_message) desc
   limit 1;

  if v_cluster is null then
    v_label := (select t.label from public.topics t where t.id = v_topic);
    if v_label is null then
      v_label := array_to_string((string_to_array(btrim(p_message), ' '))[1:6], ' ');
    end if;
    insert into public.clusters(session_id, label) values (p_session, left(v_label, 160))
    returning id into v_cluster;
  end if;

  begin
    insert into public.help_requests(
      session_id, student_id, activity_id, topic_id, snapshot_id, category, message,
      is_anonymous, anon_policy, is_doubt_bank, is_blocked, cluster_id, idempotency_key)
    values (
      p_session, v_uid, p_activity, v_topic, v_snap, p_category, btrim(p_message),
      (p_is_anonymous and v_policy <> 'identified'), v_policy, v_doubt, p_is_blocked, v_cluster,
      p_idempotency_key)
    returning * into v_req;
  exception when unique_violation then
    select * into v_existing from public.help_requests
     where student_id = v_uid and idempotency_key = p_idempotency_key;
    return jsonb_build_object('duplicate', true,
      'request', jsonb_build_object('id', v_existing.id, 'status', v_existing.status,
                                    'created_at', v_existing.created_at));
  end;

  select count(*) into v_pos from public.help_requests r
   where r.session_id = p_session and r.status in ('open', 'reopened')
     and r.is_doubt_bank = v_doubt and r.created_at <= v_req.created_at;
  select count(*) - 1 into v_others from public.help_requests where cluster_id = v_cluster;

  insert into public.help_request_messages(request_id, sender_id, body, kind)
  values (v_req.id, null,
          case when v_doubt
               then 'Received. Your teacher will see this in the Doubt Bank.'
               else format('Received. Position %s in the queue. Your teacher reviews questions at the next pause.', v_pos)
          end, 'system');
  perform public._request_event(v_req.id, 'created', jsonb_build_object('category', p_category));

  return jsonb_build_object(
    'duplicate', false,
    'request', jsonb_build_object('id', v_req.id, 'status', v_req.status, 'created_at', v_req.created_at),
    'queue_position', v_pos,
    'similar_count', case when v_others >= 3 then v_others end);
end $$;

-- =====================================================================
-- Thread actions
-- =====================================================================
create function public.add_follow_up(p_request uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_r public.help_requests;
begin
  select * into v_r from public.help_requests where id = p_request and student_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  perform public.check_rate('followup', 20, 600);
  insert into public.help_request_messages(request_id, sender_id, body, kind)
  values (p_request, v_uid, btrim(p_body), 'follow_up');
  update public.help_requests
     set status = case when status = 'handled' then 'reopened'::public.request_status else status end,
         student_confirmed = case when status = 'handled' then null else student_confirmed end,
         updated_at = now()
   where id = p_request;
  perform public._request_event(p_request, 'follow_up');
end $$;

create function public.reply_to_request(p_request uuid, p_body text, p_kind text default 'reply')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_r public.help_requests; v_msg uuid;
begin
  if p_kind not in ('reply', 'hint', 'guiding_question') then raise exception 'invalid_kind'; end if;
  select * into v_r from public.help_requests where id = p_request for update;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;
  insert into public.help_request_messages(request_id, sender_id, body, kind)
  values (p_request, v_uid, btrim(p_body), p_kind) returning id into v_msg;
  update public.help_requests
     set status = case when status in ('open', 'reopened') then 'in_progress'::public.request_status else status end,
         updated_at = now()
   where id = p_request;
  perform public._request_event(p_request, 'reply', jsonb_build_object('kind', p_kind));
  return v_msg;
end $$;

create function public.set_request_status(
  p_request uuid, p_to public.request_status, p_expected public.request_status
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_r public.help_requests;
begin
  select * into v_r from public.help_requests where id = p_request for update;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;
  if v_r.status <> p_expected then
    raise exception 'already_changed' using detail = v_r.status::text;
  end if;
  if not ((v_r.status, p_to) in (
      ('open', 'in_progress'), ('open', 'handled'), ('in_progress', 'handled'),
      ('handled', 'reopened'), ('reopened', 'in_progress'), ('reopened', 'handled'))) then
    raise exception 'invalid_transition';
  end if;
  update public.help_requests
     set status = p_to,
         handled_by = case when p_to = 'handled' then v_uid else handled_by end,
         handled_at = case when p_to = 'handled' then now() when p_to = 'reopened' then null else handled_at end,
         student_confirmed = case when p_to = 'handled' then null else student_confirmed end,
         updated_at = now()
   where id = p_request returning * into v_r;
  perform public._request_event(p_request, 'status_changed',
    jsonb_build_object('from', p_expected, 'to', p_to));
  return jsonb_build_object('id', v_r.id, 'status', v_r.status, 'updated_at', v_r.updated_at,
                            'handled_at', v_r.handled_at);
end $$;

create function public.confirm_resolution(p_request uuid, p_outcome text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_r public.help_requests;
begin
  if p_outcome not in ('cleared', 'partly', 'not_cleared') then raise exception 'invalid_outcome'; end if;
  select * into v_r from public.help_requests where id = p_request and student_id = v_uid for update;
  if not found then raise exception 'not_found'; end if;
  if v_r.status <> 'handled' then raise exception 'invalid_state'; end if;
  update public.help_requests
     set student_confirmed = p_outcome,
         status = case when p_outcome = 'not_cleared' then 'reopened'::public.request_status else status end,
         handled_at = case when p_outcome = 'not_cleared' then null else handled_at end,
         updated_at = now()
   where id = p_request;
  perform public._request_event(p_request, 'resolution_confirmed', jsonb_build_object('outcome', p_outcome));
end $$;

create function public.reveal_identity(p_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_r public.help_requests;
begin
  perform public._require_user();
  select * into v_r from public.help_requests where id = p_request for update;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;
  if v_r.anon_policy = 'strict' and v_r.is_anonymous then raise exception 'strict_mode'; end if;
  if not v_r.is_anonymous or v_r.anon_policy = 'identified' or v_r.identity_revealed then return; end if;
  update public.help_requests set identity_revealed = true, updated_at = now() where id = p_request;
  perform public._audit('reveal_identity', 'help_request', p_request);
  perform public._request_event(p_request, 'reveal_identity');
  insert into public.help_request_messages(request_id, sender_id, body, kind)
  values (p_request, null, 'Your teacher chose to see your name for this question.', 'system');
end $$;

-- =====================================================================
-- Clusters (B8 / B9)
-- =====================================================================
create function public.address_cluster(p_cluster uuid, p_note text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public._require_user();
  v_c public.clusters; v_impact boolean; v_n int; v_r record; v_affected int := 0;
begin
  select * into v_c from public.clusters where id = p_cluster for update;
  if not found or not public.is_session_teacher(v_c.session_id) then raise exception 'permission_denied'; end if;
  if p_note is null or char_length(btrim(p_note)) not between 1 and 500 then raise exception 'invalid_note'; end if;

  select coalesce((c.settings #>> '{behaviour,impact_messages}')::boolean, true) into v_impact
    from public.sessions s join public.courses c on c.id = s.course_id where s.id = v_c.session_id;
  select count(*) into v_n from public.help_requests
   where cluster_id = p_cluster and status in ('open', 'in_progress', 'reopened');

  update public.clusters set addressed_at = now(), addressed_note = btrim(p_note) where id = p_cluster;

  for v_r in
    select id from public.help_requests
     where cluster_id = p_cluster and status in ('open', 'in_progress', 'reopened') for update
  loop
    insert into public.help_request_messages(request_id, sender_id, body, kind)
    values (v_r.id, null, 'Addressed in class: ' || btrim(p_note), 'system');
    if v_impact and v_n - 1 >= 3 then
      insert into public.help_request_messages(request_id, sender_id, body, kind)
      values (v_r.id, null, format('Your question helped %s classmates.', v_n - 1), 'system');
    end if;
    update public.help_requests
       set status = 'handled', handled_by = v_uid, handled_at = now(), updated_at = now()
     where id = v_r.id;
    perform public._request_event(v_r.id, 'cluster_addressed');
    v_affected := v_affected + 1;
  end loop;
  return v_affected;
end $$;

create function public.merge_clusters(p_from uuid, p_into uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.clusters; v_b public.clusters;
begin
  perform public._require_user();
  select * into v_a from public.clusters where id = p_from;
  select * into v_b from public.clusters where id = p_into;
  if v_a.id is null or v_b.id is null or v_a.session_id <> v_b.session_id
     or not public.is_session_teacher(v_a.session_id) then
    raise exception 'permission_denied';
  end if;
  update public.help_requests set cluster_id = p_into where cluster_id = p_from;
  delete from public.clusters where id = p_from;
end $$;

-- =====================================================================
-- Teacher reads. These NEVER return student identity for masked/strict anonymous rows.
-- =====================================================================
create function public.teacher_requests_for_session(p_session uuid)
returns table (
  request_id uuid, display_name text, student_id uuid, ug_number text,
  is_anonymous boolean, identity_revealed boolean, anon_policy public.anon_mode,
  category public.request_category, message text, status public.request_status,
  priority smallint, is_blocked boolean, is_doubt_bank boolean,
  topic_id uuid, activity_id uuid, cluster_id uuid, has_code boolean,
  student_confirmed text, created_at timestamptz, updated_at timestamptz, handled_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_user();
  if not public.is_session_teacher(p_session) then raise exception 'permission_denied'; end if;
  return query
  select r.id,
         case when (not r.is_anonymous or r.anon_policy = 'identified' or r.identity_revealed)
              then p.full_name else public._pseudonym(r.session_id, r.student_id) end,
         case when (not r.is_anonymous or r.anon_policy = 'identified' or r.identity_revealed)
              then r.student_id end,
         case when (not r.is_anonymous or r.anon_policy = 'identified' or r.identity_revealed)
              then p.ug_number end,
         r.is_anonymous, r.identity_revealed, r.anon_policy,
         r.category, r.message, r.status, r.priority, r.is_blocked, r.is_doubt_bank,
         r.topic_id, r.activity_id, r.cluster_id, (r.snapshot_id is not null),
         r.student_confirmed, r.created_at, r.updated_at, r.handled_at
    from public.help_requests r
    join public.profiles p on p.id = r.student_id
   where r.session_id = p_session
   order by r.created_at;
end $$;

create function public.teacher_request_thread(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_r public.help_requests; v_msgs jsonb; v_events jsonb;
begin
  select * into v_r from public.help_requests where id = p_request;
  if not found or not public.is_session_teacher(v_r.session_id) then raise exception 'permission_denied'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'from', case when m.kind = 'system' then 'system'
                        when m.sender_id = v_r.student_id then 'student' else 'teacher' end,
           'mine', (m.sender_id = v_uid),
           'kind', m.kind, 'body', m.body, 'created_at', m.created_at) order by m.created_at), '[]')
    into v_msgs from public.help_request_messages m where m.request_id = p_request;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type, 'created_at', e.created_at,
           'metadata', e.metadata) order by e.created_at), '[]')
    into v_events from public.help_request_events e where e.request_id = p_request;

  return jsonb_build_object('messages', v_msgs, 'events', v_events);
end $$;

grant execute on function
  public.create_help_request(uuid, public.request_category, text, uuid, uuid, uuid, boolean, boolean),
  public.add_follow_up(uuid, text), public.reply_to_request(uuid, text, text),
  public.set_request_status(uuid, public.request_status, public.request_status),
  public.confirm_resolution(uuid, text), public.reveal_identity(uuid),
  public.address_cluster(uuid, text), public.merge_clusters(uuid, uuid),
  public.teacher_requests_for_session(uuid), public.teacher_request_thread(uuid)
  to authenticated;
