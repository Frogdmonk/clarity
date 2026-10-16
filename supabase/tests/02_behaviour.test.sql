-- RPC behaviour: happy paths and stable failure codes. Run with: supabase test db
begin;
select plan(85);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  if uid is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;
create temp table ctx(k text primary key, v text);
grant all on ctx to public;
create function pg_temp.c(p_k text) returns text language sql as $$ select v from ctx where k = p_k $$;
create function pg_temp.s(n int) returns uuid language sql as $$
  select ('c' || n || '000000-0000-0000-0000-000000000001')::uuid $$;

insert into auth.users(id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'adm@x.test', '{"full_name":"Admin One"}'),
  ('b1000000-0000-0000-0000-000000000001', 't1@x.test',  '{"full_name":"Teacher One"}'),
  (pg_temp.s(1), 's1@x.test', '{"full_name":"Student One","ug_number":"UG/24/00001"}'),
  (pg_temp.s(2), 's2@x.test', '{"full_name":"Student Two","ug_number":"UG/24/00002"}'),
  (pg_temp.s(3), 's3@x.test', '{"full_name":"Student Three","ug_number":"UG/24/00003"}'),
  (pg_temp.s(4), 's4@x.test', '{"full_name":"Student Four","ug_number":"UG/24/00004"}'),
  (pg_temp.s(5), 's5@x.test', '{"full_name":"Student Five","ug_number":"UG/24/00005"}'),
  (pg_temp.s(6), 's6@x.test', '{"full_name":"Student Six","ug_number":"UG/24/00006"}');
update public.user_roles set role = 'admin'   where user_id = 'a0000000-0000-0000-0000-000000000001';
update public.user_roles set role = 'teacher' where user_id = 'b1000000-0000-0000-0000-000000000001';

select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into ctx values ('c1', public.create_course('DSA')::text);
select is((public.enrol_students(pg_temp.c('c1')::uuid,
  array['UG/24/00001','UG/24/00002','UG/24/00003','UG/24/00004','UG/24/00005','UG/24/00099'])) ->> 'enrolled', '5',
  'T1. enrol_students enrols known verified students');
select is((public.enrol_students(pg_temp.c('c1')::uuid, array['UG/24/00099'])) -> 'not_found' ->> 0, 'UG/24/00099',
  'T2. unknown UG numbers are reported back, not silently ignored');
insert into ctx select 's1', (public.create_session(pg_temp.c('c1')::uuid, 'Lecture 1')) ->> 'id';
insert into ctx select 'code', (select join_code from public.session_secrets where session_id = pg_temp.c('s1')::uuid);
select ok(pg_temp.c('code') ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'T3. join code is 6 unambiguous characters');
select public.start_session(pg_temp.c('s1')::uuid, 0);
select throws_ok(format($f$select public.start_session('%s', 0)$f$, pg_temp.c('s1')), 'already_changed',
  'T5. starting twice / with a stale version -> already_changed');
select public.set_topic(pg_temp.c('s1')::uuid, 'Pointers');

-- ------------------------------------------------ join + rate limit (S5)
select pg_temp.act_as(pg_temp.s(5));
select is((public.join_session_by_code(pg_temp.c('code'))) ->> 'ok', 'true', 'J1. valid code joins');
select is((public.join_session_by_code(pg_temp.c('code'))) ->> 'ok', 'true', 'J2. joining twice is idempotent');
select lives_ok($q$do $d$ begin for i in 1..8 loop perform public.join_session_by_code('BAD' || i); end loop; end $d$$q$,
  'J3. failed guesses return a payload and keep counting');
select throws_ok($$select public.join_session_by_code('BADXXX')$$, 'rate_limited',
  'J4. 11th attempt in a minute -> rate_limited (failed guesses count)');
select is((select count(*) from public.session_members where session_id = pg_temp.c('s1')::uuid), 1::bigint,
  'J5. only S5 is a member so far');

select pg_temp.act_as(pg_temp.s(1)); select public.join_session(pg_temp.c('s1')::uuid);
select pg_temp.act_as(pg_temp.s(2)); select public.join_session(pg_temp.c('s1')::uuid);
select pg_temp.act_as(pg_temp.s(3)); select public.join_session(pg_temp.c('s1')::uuid);
select pg_temp.act_as(pg_temp.s(4)); select public.join_session(pg_temp.c('s1')::uuid);

-- ------------------------------------------------ pulse: reveal-after-commit + thresholds
select pg_temp.act_as(pg_temp.s(1));
select is((public.get_pulse_after_commit(pg_temp.c('s1')::uuid)) ->> 'revealed', 'false',
  'P1. no pulse is revealed before the student has sent a signal');
select public.set_signal(pg_temp.c('s1')::uuid, 'lost');
select pg_temp.act_as(pg_temp.s(2)); select public.set_signal(pg_temp.c('s1')::uuid, 'lost');
select pg_temp.act_as(pg_temp.s(3)); select public.set_signal(pg_temp.c('s1')::uuid, 'lost');
select pg_temp.act_as(pg_temp.s(4)); select public.set_signal(pg_temp.c('s1')::uuid, 'lost');
select pg_temp.act_as(pg_temp.s(5)); select public.set_signal(pg_temp.c('s1')::uuid, 'understand');
select pg_temp.act_as(pg_temp.s(1));
select is((public.get_pulse_after_commit(pg_temp.c('s1')::uuid)) ->> 'lost', '4', 'P2. after committing, S1 sees the lost count (>= 3)');
select is((public.get_pulse_after_commit(pg_temp.c('s1')::uuid)) ->> 'understand', null,
  'P3. buckets under 3 are masked (re-identification guard)');
select is((public.get_pulse_after_commit(pg_temp.c('s1')::uuid)) ->> 'others_lost_on_topic', '3',
  'P4. "3 others lost on this topic" shown at exactly the threshold');
select lives_ok(format($f$select public.set_signal('%s', 'lost')$f$, pg_temp.c('s1')), 'P5. repeating a signal is a no-op');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select lost from public.session_pulse where session_id = pg_temp.c('s1')::uuid), 4, 'P6. teacher pulse row aggregates lost=4');
select is((select understand from public.session_pulse where session_id = pg_temp.c('s1')::uuid), 1,
  'P7. teacher pulse row shows exact small counts (teachers are not subject to the student threshold)');
select pg_temp.act_as(pg_temp.s(1));
select is((select count(*) from public.understanding_signals), 1::bigint, 'P8. a student sees only their own signal row');

-- ------------------------------------------------ help requests, idempotency, clustering
select pg_temp.act_as(pg_temp.s(1));
select is((public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does pointer dereference work',
   '10000000-0000-0000-0000-000000000001')) ->> 'duplicate', 'false', 'H1. first create is not a duplicate');
select is((public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does pointer dereference work',
   '10000000-0000-0000-0000-000000000001')) ->> 'duplicate', 'true', 'H2. same idempotency key returns the existing request');
select is((select count(*) from public.help_requests), 1::bigint, 'H3. double-submit created exactly one request');
select is((select (public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does pointer dereference work',
   '10000000-0000-0000-0000-000000000001')) -> 'request' ->> 'status'), 'open', 'H4. duplicate returns current state');

select pg_temp.act_as(pg_temp.s(2));
select is((public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does pointer dereference work?',
   '10000000-0000-0000-0000-000000000002')) ->> 'similar_count', null, 'H5. 2nd similar request: count hidden (< 3 others)');
select pg_temp.act_as(pg_temp.s(3));
select public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does a pointer dereference work',
   '10000000-0000-0000-0000-000000000003');
select pg_temp.act_as(pg_temp.s(4));
select is((public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'how does pointer dereferencing work',
   '10000000-0000-0000-0000-000000000004')) ->> 'similar_count', '3', 'H6. 4th similar request sees "3 classmates" (>= 3)');
select pg_temp.act_as(pg_temp.s(5));
select public.create_help_request(pg_temp.c('s1')::uuid, 'other', 'what is a singly linked list node',
   '10000000-0000-0000-0000-000000000005');
select pg_temp.act_as(null);
select is((select count(distinct cluster_id) from public.help_requests
            where idempotency_key::text like '10000000-0000-0000-0000-00000000000_' and student_id <> pg_temp.s(5)),
  1::bigint, 'H7. the four similar questions share one cluster');
select isnt((select cluster_id from public.help_requests where student_id = pg_temp.s(5)),
            (select cluster_id from public.help_requests where student_id = pg_temp.s(1)),
  'H8. a dissimilar question gets its own cluster');
select ok((select count(*) from public.help_request_messages where kind = 'system' and body like 'Received. Position %') = 5,
  'H9. every request gets an instant receipt with a queue position');

select pg_temp.act_as(pg_temp.s(1));
select throws_like($$select public.create_help_request((select session_id from public.help_requests limit 1),
  'other', '', gen_random_uuid())$$, '%violates check constraint%', 'H10. empty message rejected by DB constraint');

-- ------------------------------------------------ address a cluster (B8/B9)
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*) from public.teacher_requests_for_session(pg_temp.c('s1')::uuid)), 5::bigint,
  'C1. teacher sees all five requests');
select is((select count(distinct cluster_id) from public.teacher_requests_for_session(pg_temp.c('s1')::uuid)), 2::bigint,
  'C2. ...grouped into two clusters');
insert into ctx select 'cl', cluster_id::text from public.teacher_requests_for_session(pg_temp.c('s1')::uuid)
  where display_name = 'Student One' limit 1;
select is(public.address_cluster(pg_temp.c('cl')::uuid, 'A pointer holds an address; * follows it.'), 4,
  'C3. address_cluster closes all four requests at once');
select pg_temp.act_as(pg_temp.s(1));
select ok(exists (select 1 from public.help_request_messages
                   where kind = 'system' and body = 'Addressed in class: A pointer holds an address; * follows it.'),
  'C4. contributor gets the anonymised "addressed in class" notice');
select ok(exists (select 1 from public.help_request_messages where kind = 'system' and body = 'Your question helped 3 classmates.'),
  'C5. contributor gets the private impact message');
select is((select status::text from public.help_requests), 'handled', 'C6. their request is handled');
select pg_temp.act_as(pg_temp.s(5));
select is((select status::text from public.help_requests), 'open', 'C7. an unrelated cluster is untouched');

-- ------------------------------------------------ close the loop (B7)
select pg_temp.act_as(pg_temp.s(1));
select lives_ok(format($f$select public.confirm_resolution('%s', 'not_cleared')$f$, (select id from public.help_requests)),
  'L1. student says "not cleared"');
select is((select status::text from public.help_requests), 'reopened', 'L2. "not cleared" reopens automatically');
select pg_temp.act_as(pg_temp.s(2));
select public.confirm_resolution((select id from public.help_requests), 'cleared');
select is((select student_confirmed from public.help_requests), 'cleared', 'L3. "cleared" is recorded');
select pg_temp.act_as(pg_temp.s(5));
select throws_ok(format($f$select public.confirm_resolution('%s', 'cleared')$f$, (select id from public.help_requests)),
  'invalid_state', 'L4. cannot confirm a request that is not handled');
select pg_temp.act_as(pg_temp.s(3));
select public.add_follow_up((select id from public.help_requests), 'still confused about *p++');
select is((select status::text from public.help_requests), 'reopened', 'L5. a follow-up on a handled request reopens it');

-- ------------------------------------------------ caps and pause
select pg_temp.act_as(pg_temp.s(5));
select public.create_help_request(pg_temp.c('s1')::uuid, 'other', 'second distinct question about stacks', gen_random_uuid());
select public.create_help_request(pg_temp.c('s1')::uuid, 'other', 'third unrelated question on recursion depth', gen_random_uuid());
select throws_ok(format($f$select public.create_help_request('%s', 'other', 'fourth topic hashing', gen_random_uuid())$f$, pg_temp.c('s1')),
  'too_many_open', 'Q1. max 3 open requests per student per session');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.pause_questions(pg_temp.c('s1')::uuid, true);
select pg_temp.act_as(pg_temp.s(4));
select throws_ok(format($f$select public.create_help_request('%s', 'other', 'while paused', gen_random_uuid())$f$, pg_temp.c('s1')),
  'paused', 'Q2. questions_paused blocks new requests');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.pause_questions(pg_temp.c('s1')::uuid, false);
select pg_temp.act_as(pg_temp.s(6));
select throws_ok(format($f$select public.create_help_request('%s', 'other', 'not in session', gen_random_uuid())$f$, pg_temp.c('s1')),
  'not_member', 'Q3. a non-member cannot ask');

-- ------------------------------------------------ draft engine (CAS)
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
with i as (insert into public.activities(session_id, title, statement, created_by)
  values (pg_temp.c('s1')::uuid, 'Q1', 'Reverse', 'b1000000-0000-0000-0000-000000000001') returning id)
insert into ctx select 'act', id::text from i;
with i as (insert into public.activities(session_id, title, statement, due_at, created_by)
  values (pg_temp.c('s1')::uuid, 'Late', 'x', now() - interval '1 hour', 'b1000000-0000-0000-0000-000000000001') returning id)
insert into ctx select 'late', id::text from i;
select pg_temp.act_as(pg_temp.s(1));
select is((public.save_draft(pg_temp.c('act')::uuid, 'v1', 0, 'dev1')) ->> 'rev', '1', 'D1. first save -> rev 1');
select is((public.save_draft(pg_temp.c('act')::uuid, 'v2', 1, 'dev1')) ->> 'rev', '2', 'D2. save with current base_rev -> rev 2');
select is((public.save_draft(pg_temp.c('act')::uuid, 'from tab 2', 1, 'dev2')) ->> 'conflict', 'true',
  'D3. stale base_rev -> conflict (never silently overwrites)');
select is((public.save_draft(pg_temp.c('act')::uuid, 'from tab 2', 1, 'dev2')) -> 'server' ->> 'code', 'v2',
  'D4. the conflict response carries the server copy');
select is((select code from public.code_drafts), 'v2', 'D5. the draft is unchanged after a conflict');
select is((select count(*) from public.code_snapshots where kind = 'autosave'), 1::bigint,
  'D6. autosave snapshots are throttled (one per minute), not one per save');
select throws_ok(format($f$select public.save_draft('%s', repeat('x', 100001), 2)$f$, pg_temp.c('act')), 'too_large',
  'D7. oversize code rejected');

select is((public.snapshot_my_code(pg_temp.c('act')::uuid, 'my conflicting copy')), 2,
  'D8. conflict dialog can park "mine" as a snapshot before taking theirs');
select is((select count(*) from public.code_snapshots where kind = 'autosave'), 2::bigint, 'D9. that snapshot is kept in history');

-- ------------------------------------------------ submissions
select is((public.submit_code(pg_temp.c('act')::uuid, 'answer', '20000000-0000-0000-0000-000000000001')) ->> 'duplicate', 'false',
  'S1. submit creates an immutable submission');
select is((public.submit_code(pg_temp.c('act')::uuid, 'answer', '20000000-0000-0000-0000-000000000001')) ->> 'duplicate', 'true',
  'S2. same idempotency key is a safe retry');
select is((public.submit_code(pg_temp.c('act')::uuid, 'answer v2', '20000000-0000-0000-0000-000000000002')) ->> 'version', '4',
  'S3. a new submission gets the next version (autosave v1, parked copy v2, submissions v3 and v4)');
select is((select count(*) from public.code_snapshots where kind = 'submission'), 2::bigint, 'S4. both submissions are kept');
select throws_ok(format($f$select public.submit_code('%s', 'x', gen_random_uuid())$f$, pg_temp.c('late')),
  'deadline_passed', 'S5. submissions after the deadline are rejected');

-- ------------------------------------------------ teacher code view keyed by request id
select pg_temp.act_as(pg_temp.s(1));
insert into ctx select 'rcode', (public.create_help_request(pg_temp.c('s1')::uuid, 'coding', 'my loop never ends',
  '30000000-0000-0000-0000-000000000001', pg_temp.c('act')::uuid, null, true, false)) -> 'request' ->> 'id';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((public.get_student_draft(pg_temp.c('rcode')::uuid)) -> 'draft' ->> 'code', 'v2',
  'V1. teacher sees the current draft via request id');
select ok(not ((public.get_student_draft(pg_temp.c('rcode')::uuid))::text like '%c1000000%'),
  'V2. draft payload contains no student id');
select ok(((public.get_student_draft(pg_temp.c('rcode')::uuid)) ->> 'request_snapshot_id') is not null,
  'V3. the request is linked to the code snapshot taken at asking time');

-- ------------------------------------------------ polls
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into ctx values ('poll', public.create_poll(pg_temp.c('s1')::uuid, 'What does line 4 print?', 'predict_output',
  '["1","2","3"]', '"2"', false, true)::text);
select pg_temp.act_as(pg_temp.s(1));
select is((public.get_session_polls(pg_temp.c('s1')::uuid))::text, '[]', 'O1. draft polls are invisible to students');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.open_poll(pg_temp.c('poll')::uuid);
select pg_temp.act_as(pg_temp.s(1));
select is((public.get_session_polls(pg_temp.c('s1')::uuid)) -> 0 ->> 'correct', null, 'O2. correct answer hidden while the poll is open');
select throws_ok(format($f$select public.respond_poll('%s', '"2"')$f$, pg_temp.c('poll')), 'confidence_required',
  'O3. confidence-calibrated poll requires a confidence');
select lives_ok(format($f$select public.respond_poll('%s', '"2"', 3::smallint)$f$, pg_temp.c('poll')), 'O4. respond with confidence');
select throws_ok(format($f$select public.respond_poll('%s', '"3"', 1::smallint)$f$, pg_temp.c('poll')), 'already_responded',
  'O5. one response per student');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.reveal_poll(pg_temp.c('poll')::uuid);
select pg_temp.act_as(pg_temp.s(1));
select is((public.get_session_polls(pg_temp.c('s1')::uuid)) -> 0 ->> 'correct', '2', 'O6. correct answer visible after reveal');
select throws_ok(format($f$select public.respond_poll('%s', '"2"', 1::smallint)$f$, pg_temp.c('poll')), 'poll_closed',
  'O7. no responses after reveal');

-- ------------------------------------------------ exit ticket
select public.submit_exit_ticket(pg_temp.c('s1')::uuid, 'pointer arithmetic', 2::smallint);
select public.submit_exit_ticket(pg_temp.c('s1')::uuid, 'second try', 3::smallint);
select is((select muddiest from public.exit_tickets), 'pointer arithmetic', 'E1. exit ticket is once per session (idempotent)');

-- ------------------------------------------------ Doubt Bank window expiry
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into ctx select 's2', (public.create_session(pg_temp.c('c1')::uuid, 'Old lecture')) ->> 'id';
select public.start_session(pg_temp.c('s2')::uuid, 0);
select pg_temp.act_as(pg_temp.s(1)); select public.join_session(pg_temp.c('s2')::uuid);
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.end_session(pg_temp.c('s2')::uuid, 1);
select is((public.end_session(pg_temp.c('s2')::uuid, 999)) ->> 'status', 'ended', 'W1. end_session is idempotent');
select pg_temp.act_as(null);
update public.sessions set ended_at = now() - interval '3 days' where id = pg_temp.c('s2')::uuid;
select pg_temp.act_as(pg_temp.s(1));
select throws_ok(format($f$select public.create_help_request('%s', 'other', 'too late', gen_random_uuid())$f$, pg_temp.c('s2')),
  'session_ended', 'W2. Doubt Bank closes after its window');

-- ------------------------------------------------ roster mode verification
select pg_temp.act_as(null);
update public.platform_settings set roster_mode = true;
insert into public.roster_entries(normalised_ug, normalised_name) values ('UG/24/00050', 'roster kid');
insert into auth.users(id, email, raw_user_meta_data)
values ('e1000000-0000-0000-0000-000000000001', 'rk@x.test', '{"full_name":"Roster  Kid","ug_number":"ug/24/00050"}');
select is((select verification::text from public.profiles where id = 'e1000000-0000-0000-0000-000000000001'),
  'verified', 'R1. roster match (case/whitespace-insensitive) verifies automatically');
insert into auth.users(id, email, raw_user_meta_data)
values ('e2000000-0000-0000-0000-000000000001', 'late@x.test', '{"full_name":"Late Comer","ug_number":"UG/24/00060"}');
select is((select verification::text from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'),
  'pending', 'R2. no roster match -> pending');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is((public.admin_import_roster('[{"ug_number":"UG/24/00060","full_name":"late comer"},{"ug_number":"bad","full_name":"x"}]'))::text,
  '{"invalid": 1, "imported": 1, "verified_now": 1}', 'R3. importing the roster verifies waiting accounts and reports invalid rows');
select pg_temp.act_as(null);
select is((select verification::text from public.profiles where id = 'e2000000-0000-0000-0000-000000000001'),
  'verified', 'R4. the waiting account is now verified');


-- ------------------------------------------------ UI support RPCs (migration 0014)
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select is((select count(*) from public.teacher_course_roster(pg_temp.c('c1')::uuid)), 5::bigint,
  'U1. teacher can list the roster of their own course');
select is((public.teacher_session_stats(pg_temp.c('s1')::uuid)) ->> 'joined', '5', 'U2. session stats count joined students');
select ok((select count(*) from public.teacher_doubt_bank()) >= 0, 'U3. teacher_doubt_bank runs for a teacher');
select ok((select count(*) from public.pulse_history where session_id = pg_temp.c('s1')::uuid) >= 1,
  'U4. pulse timeline is sampled lazily as signals change');
select pg_temp.act_as(pg_temp.s(1));
select throws_ok(format($f$select * from public.teacher_course_roster('%s')$f$, pg_temp.c('c1')), 'permission_denied',
  'U5. students cannot read the roster');
select throws_ok($$select public.admin_update_settings(true, '^x$', 48)$$, 'permission_denied', 'U6. students cannot change settings');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select throws_ok($$select public.admin_update_settings(true, '([', 48)$$, 'invalid_input', 'U7. invalid UG regex rejected');
select lives_ok($$select public.admin_update_settings(false, '^UG\/\d{2}\/\d{5}$', 72)$$, 'U8. admin can update settings');


-- ------------------------------------------------ notebook: owner comes from auth.uid()
select pg_temp.act_as(pg_temp.s(1));
select lives_ok(format($f$insert into public.notebook_entries(course_id, title, body) values ('%s', 'Pointers', 'A pointer holds an address.')$f$, pg_temp.c('c1')),
  'N1. a student can save a notebook entry without supplying their own id');
select is((select student_id from public.notebook_entries limit 1), pg_temp.s(1), 'N2. the entry is owned by the caller');
select pg_temp.act_as(pg_temp.s(2));
select is((select count(*) from public.notebook_entries), 0::bigint, 'N3. other students cannot see it');
select throws_like(format($f$insert into public.notebook_entries(student_id, course_id, title, body) values ('%s', '%s', 'x', 'y')$f$, pg_temp.s(1), pg_temp.c('c1')),
  '%row-level security%', 'N4. a student cannot write an entry for someone else');

select * from finish();
rollback;
