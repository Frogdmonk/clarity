-- Additional indexes for hot paths
create index if not exists hr_session_student_open on public.help_requests(session_id, student_id)
  where status in ('open', 'in_progress', 'reopened');
create index if not exists hr_activity_student on public.help_requests(activity_id, student_id)
  where activity_id is not null;
create index if not exists signals_session_topic on public.understanding_signals(session_id, topic_id);
create index if not exists poll_responses_poll on public.poll_responses(poll_id);
create index if not exists notebook_tags on public.notebook_entries using gin (tags);
create index if not exists notebook_body_trgm on public.notebook_entries
  using gin ((title || ' ' || body) extensions.gin_trgm_ops);
create index if not exists audit_actor on public.audit_log(actor_id, created_at desc);
create index if not exists session_members_seen on public.session_members(session_id, last_seen_at);
