-- =====================================================================
-- Realtime authorization (private Broadcast channels)
-- Topics:  session:{sid}:public | session:{sid}:teacher | user:{uid}:inbox
-- RLS is already enabled on realtime.messages by Supabase; do NOT enable it here.
-- =====================================================================

create function public._topic_uuid(p_topic text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_topic, ':', 2)::uuid;
exception when others then
  return null;
end $$;
grant execute on function public._topic_uuid(text) to authenticated;

create policy "session public channel: members and teachers can receive"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'session'
    and split_part((select realtime.topic()), ':', 3) = 'public'
    and (public.is_session_teacher(public._topic_uuid((select realtime.topic())))
         or public.is_session_member(public._topic_uuid((select realtime.topic()))))
  );

create policy "session teacher channel: teachers of that session only"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'session'
    and split_part((select realtime.topic()), ':', 3) = 'teacher'
    and public.is_session_teacher(public._topic_uuid((select realtime.topic())))
  );

create policy "user inbox: that user only"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and split_part((select realtime.topic()), ':', 1) = 'user'
    and split_part((select realtime.topic()), ':', 3) = 'inbox'
    and public._topic_uuid((select realtime.topic())) = (select auth.uid())
  );
-- No INSERT policies: clients cannot broadcast. Only database triggers publish.

-- =====================================================================
-- Producers. A realtime failure must never roll back a user's write.
-- Payloads stay tiny: ids, status, version. Never code, notes or message bodies.
-- =====================================================================
create function public._rt_send(p_topic text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;   -- realtime not installed (e.g. plain Postgres test harness)
  end if;
  execute 'select realtime.send($1, $2, $3, true)' using p_payload, p_event, p_topic;
exception when others then
  raise warning 'realtime send failed: %', sqlstate;
end $$;

create function public._trg_sessions_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._rt_send('session:' || new.id || ':public', 'session_state', jsonb_build_object(
    'status', new.status, 'qa_window_open', new.qa_window_open,
    'questions_paused', new.questions_paused, 'topic_id', new.current_topic_id, 'version', new.version));
  return null;
end $$;
create trigger sessions_rt after update on public.sessions
  for each row when (old.version is distinct from new.version) execute function public._trg_sessions_rt();

-- Pulse hint throttled to at most ~1 per second; clients also resync on a slow timer.
create function public._trg_pulse_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.updated_at > now() - interval '1 second' then return null; end if;
  perform public._rt_send('session:' || new.session_id || ':teacher', 'pulse',
                          jsonb_build_object('updated_at', new.updated_at));
  return null;
end $$;
create trigger pulse_rt after insert or update on public.session_pulse
  for each row execute function public._trg_pulse_rt();

create function public._trg_request_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public._rt_send('session:' || new.session_id || ':teacher', 'request_new',
                            jsonb_build_object('request_id', new.id));
  else
    perform public._rt_send('session:' || new.session_id || ':teacher', 'request_changed',
      jsonb_build_object('request_id', new.id, 'status', new.status, 'updated_at', new.updated_at));
    if old.status is distinct from new.status then
      perform public._rt_send('user:' || new.student_id || ':inbox', 'status',
        jsonb_build_object('request_id', new.id, 'status', new.status));
    end if;
  end if;
  return null;
end $$;
create trigger request_rt after insert or update on public.help_requests
  for each row execute function public._trg_request_rt();

create function public._trg_message_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_r public.help_requests;
begin
  select * into v_r from public.help_requests where id = new.request_id;
  if new.sender_id is not null and new.sender_id = v_r.student_id then
    perform public._rt_send('session:' || v_r.session_id || ':teacher', 'request_changed',
      jsonb_build_object('request_id', v_r.id, 'status', v_r.status, 'updated_at', now()));
  else
    perform public._rt_send('user:' || v_r.student_id || ':inbox', 'reply',
      jsonb_build_object('request_id', v_r.id, 'message_id', new.id));
  end if;
  return null;
end $$;
create trigger message_rt after insert on public.help_request_messages
  for each row execute function public._trg_message_rt();

create function public._trg_event_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_student uuid;
begin
  if new.event_type in ('reveal_identity', 'cluster_addressed') then
    select student_id into v_student from public.help_requests where id = new.request_id;
    perform public._rt_send('user:' || v_student || ':inbox',
      case new.event_type when 'reveal_identity' then 'identity_revealed' else 'addressed' end,
      jsonb_build_object('request_id', new.request_id));
  end if;
  return null;
end $$;
create trigger event_rt after insert on public.help_request_events
  for each row execute function public._trg_event_rt();

create function public._trg_poll_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'draft' then
    perform public._rt_send('session:' || new.session_id || ':public', 'poll_state',
                            jsonb_build_object('poll_id', new.id, 'status', new.status));
  end if;
  return null;
end $$;
create trigger poll_rt after insert or update of status on public.polls
  for each row execute function public._trg_poll_rt();

-- "Newer draft available" hint to the teacher, throttled to one per 10 s per draft.
create function public._trg_draft_rt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_r record;
begin
  if old.saved_at > now() - interval '10 seconds' then return null; end if;
  for v_r in
    select id, session_id from public.help_requests
     where student_id = new.student_id and activity_id = new.activity_id
       and status in ('open', 'in_progress', 'reopened')
  loop
    perform public._rt_send('session:' || v_r.session_id || ':teacher', 'draft_newer',
                            jsonb_build_object('request_id', v_r.id, 'rev', new.rev));
  end loop;
  return null;
end $$;
create trigger draft_rt after update on public.code_drafts
  for each row execute function public._trg_draft_rt();
