-- Section 10.2 negative-permission tests. Run with: supabase test db
begin;
select plan(80);

-- ---------------------------------------------------------------- fixtures
-- act_as(NULL) returns to the superuser; otherwise acts as that user via the authenticated role.
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

insert into auth.users(id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'adm@x.test', '{"full_name":"Admin One"}'),
  ('b1000000-0000-0000-0000-000000000001', 't1@x.test',  '{"full_name":"Teacher One"}'),
  ('b2000000-0000-0000-0000-000000000001', 't2@x.test',  '{"full_name":"Teacher Two"}'),
  ('c1000000-0000-0000-0000-000000000001', 'a@x.test',   '{"full_name":"Aarav Sharma","ug_number":"UG/24/00001"}'),
  ('c2000000-0000-0000-0000-000000000001', 'b@x.test',   '{"full_name":"Meera Iyer","ug_number":"UG/24/00002"}'),
  ('c3000000-0000-0000-0000-000000000001', 'c@x.test',   '{"full_name":"Chitra Nair","ug_number":"UG/24/00003"}'),
  ('c9000000-0000-0000-0000-000000000001', 'x@x.test',   '{"full_name":"Xavier Pending","ug_number":"UG/24/00009"}');
update public.user_roles set role = 'admin'   where user_id = 'a0000000-0000-0000-0000-000000000001';
update public.user_roles set role = 'teacher' where user_id in
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');
update public.profiles set verification = 'pending' where id = 'c9000000-0000-0000-0000-000000000001';

-- Teacher 1: course with A and B; live session S1 with an activity
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into ctx values ('c1', public.create_course('DSA')::text);
select public.enrol_students(pg_temp.c('c1')::uuid, array['UG/24/00001', 'UG/24/00002']);
insert into ctx select 's1', (public.create_session(pg_temp.c('c1')::uuid, 'Lecture 1')) ->> 'id';
insert into ctx select 'code1', (select join_code from public.session_secrets where session_id = pg_temp.c('s1')::uuid);
select public.start_session(pg_temp.c('s1')::uuid, 0);
with i as (
  insert into public.activities(session_id, title, statement, created_by)
  values (pg_temp.c('s1')::uuid, 'Q1', 'Reverse a list', 'b1000000-0000-0000-0000-000000000001') returning id)
insert into ctx select 'act1', id::text from i;

-- Teacher 2: separate course with C, live session S2
select pg_temp.act_as('b2000000-0000-0000-0000-000000000001');
insert into ctx values ('c2', public.create_course('OS')::text);
select public.enrol_students(pg_temp.c('c2')::uuid, array['UG/24/00003']);
insert into ctx select 's2', (public.create_session(pg_temp.c('c2')::uuid, 'Lecture A')) ->> 'id';
select public.start_session(pg_temp.c('s2')::uuid, 0);

-- Students join and create data
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select public.join_session_by_code(pg_temp.c('code1'));
select public.set_signal(pg_temp.c('s1')::uuid, 'lost');
select public.save_draft(pg_temp.c('act1')::uuid, 'int main() {}', 0, 'devA');
insert into ctx select 'r1', (public.create_help_request(pg_temp.c('s1')::uuid, 'coding', 'A anonymous question',
  '11111111-1111-1111-1111-111111111111', pg_temp.c('act1')::uuid, null, true, false)) -> 'request' ->> 'id';

select pg_temp.act_as('c2000000-0000-0000-0000-000000000001');
select public.join_session(pg_temp.c('s1')::uuid);
select public.save_draft(pg_temp.c('act1')::uuid, 'B code here', 0, 'devB');
insert into ctx select 'r2', (public.create_help_request(pg_temp.c('s1')::uuid, 'concept', 'B secret question',
  '22222222-2222-2222-2222-222222222222')) -> 'request' ->> 'id';

select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into public.help_request_notes(request_id, teacher_id, note)
values (pg_temp.c('r1')::uuid, 'b1000000-0000-0000-0000-000000000001', 'private teacher note');

-- ------------------------------------------------ 1. students cannot read peers' data
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select is((select count(*) from public.code_drafts where student_id = 'c2000000-0000-0000-0000-000000000001'), 0::bigint,
  '1a. A cannot read B code_drafts');
select is((select count(*) from public.code_snapshots where student_id = 'c2000000-0000-0000-0000-000000000001'), 0::bigint,
  '1b. A cannot read B code_snapshots');
select is((select count(*) from public.help_requests where student_id = 'c2000000-0000-0000-0000-000000000001'), 0::bigint,
  '1c. A cannot read B help_requests');
select is((select count(*) from public.help_request_messages where request_id = pg_temp.c('r2')::uuid), 0::bigint,
  '1d. A cannot read B help_request_messages');
select ok((select count(*) from public.code_drafts) = 1, '1e. A sees exactly own draft');
select ok((select count(*) from public.help_requests) = 1, '1f. A sees exactly own request');

-- ------------------------------------------------ 2. teacher notes are invisible to students
select is((select count(*) from public.help_request_notes), 0::bigint, '2a. A sees 0 teacher notes');
select throws_like(format($f$insert into public.help_request_notes(request_id, teacher_id, note)
  values ('%s', 'c1000000-0000-0000-0000-000000000001', 'x')$f$, pg_temp.c('r1')),
  '%row-level security%', '2b. A cannot insert teacher notes');
select is((select count(*) from public.help_request_notes where request_id = pg_temp.c('r1')::uuid), 0::bigint,
  '2c. A cannot read the note on their own request');
select throws_like($$select * from public.help_request_events$$, '%permission denied%', '2d. A cannot read internal event timeline');

-- ------------------------------------------------ 3. no privilege escalation
select throws_like($$update public.user_roles set role = 'admin' where user_id = 'c1000000-0000-0000-0000-000000000001'$$,
  '%permission denied%', '3a. A cannot update own role');
select throws_like($$update public.profiles set verification = 'verified' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  '%permission denied%', '3b. A cannot update own verification');
select throws_like($$update public.profiles set normalised_ug = 'UG/24/99999' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  '%permission denied%', '3c. A cannot update own normalised_ug');
select lives_ok($$update public.profiles set full_name = 'Aarav S Sharma' where id = 'c1000000-0000-0000-0000-000000000001'$$,
  '3d. A can update own full_name');
select throws_like($$insert into public.user_roles(user_id, role) values ('c1000000-0000-0000-0000-000000000001', 'admin')$$,
  '%permission denied%', '3e. A cannot insert into user_roles');
select throws_like($$select * from public.platform_settings$$, '%permission denied%', '3f. A cannot read platform_settings');
select throws_like($$update public.sessions set status = 'ended'$$, '%permission denied%', '3g. A cannot update sessions directly');
select throws_like($$insert into public.help_requests(session_id, student_id, category, message, anon_policy, idempotency_key)
  values (gen_random_uuid(), 'c1000000-0000-0000-0000-000000000001', 'other', 'x', 'masked', gen_random_uuid())$$,
  '%permission denied%', '3h. A cannot insert help_requests directly');
select throws_like($$select * from public.rate_limits$$, '%permission denied%', '3i. A cannot read rate_limits');
select is((select count(*) from public.session_secrets), 0::bigint, '3j. A cannot read join codes');

-- ------------------------------------------------ 4. identity comes from auth.uid()
select pg_temp.act_as(null);
select is((select student_id from public.help_requests where id = pg_temp.c('r1')::uuid),
  'c1000000-0000-0000-0000-000000000001'::uuid, '4. request.student_id is the caller (no client identity param)');

-- ------------------------------------------------ 5. students cannot use teacher RPCs
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok(format($f$select public.set_request_status('%s', 'in_progress', 'open')$f$, pg_temp.c('r1')),
  'permission_denied', '5a. A cannot set_request_status');
select throws_ok(format($f$select public.reply_to_request('%s', 'hello')$f$, pg_temp.c('r1')),
  'permission_denied', '5b. A cannot reply_to_request');
select throws_ok(format($f$select public.reveal_identity('%s')$f$, pg_temp.c('r1')),
  'permission_denied', '5c. A cannot reveal_identity');
select throws_ok(format($f$select public.teacher_requests_for_session('%s')$f$, pg_temp.c('s1')),
  'permission_denied', '5d. A cannot list teacher queue');
select throws_ok($$select public.create_course('Mine')$$, 'permission_denied', '5e. A cannot create a course');
select throws_ok($$select public.admin_set_role('c2000000-0000-0000-0000-000000000001', 'teacher')$$,
  'permission_denied', '5f. A cannot call admin_set_role');
select throws_ok(format($f$select public.start_session('%s', 0)$f$, pg_temp.c('s1')),
  'permission_denied', '5g. A cannot start/end sessions');
select throws_ok(format($f$select public.get_student_draft('%s')$f$, pg_temp.c('r1')),
  'permission_denied', '5h. A cannot call get_student_draft');

-- ------------------------------------------------ 6. teacher isolation across courses
select pg_temp.act_as('b2000000-0000-0000-0000-000000000001');
select is((select count(*) from public.sessions where id = pg_temp.c('s1')::uuid), 0::bigint, '6a. T2 cannot see T1 session');
select is((select count(*) from public.courses where id = pg_temp.c('c1')::uuid), 0::bigint, '6b. T2 cannot see T1 course');
select throws_ok(format($f$select public.teacher_requests_for_session('%s')$f$, pg_temp.c('s1')),
  'permission_denied', '6c. T2 cannot list T1 requests');
select throws_ok(format($f$select public.get_student_draft('%s')$f$, pg_temp.c('r1')),
  'permission_denied', '6d. T2 cannot read T1 student drafts');
select is((select count(*) from public.help_request_notes), 0::bigint, '6e. T2 cannot read T1 notes');
select is((select count(*) from public.session_secrets where session_id = pg_temp.c('s1')::uuid), 0::bigint,
  '6f. T2 cannot read T1 join code');
select throws_ok(format($f$select public.reply_to_request('%s', 'hi')$f$, pg_temp.c('r1')),
  'permission_denied', '6g. T2 cannot reply to T1 requests');
select is((select count(*) from public.help_requests), 0::bigint, '6h. teachers have no direct help_requests access');

-- ------------------------------------------------ 7/8. joining
select pg_temp.act_as('c3000000-0000-0000-0000-000000000001');
select is((select public.join_session_by_code(pg_temp.c('code1')) ->> 'error'),
  'not_enrolled', '7. C cannot join T1 session with a valid code (not enrolled)');
select is((select public.join_session_by_code('ZZZZZZ') ->> 'error'), 'invalid_or_expired', '7b. bad code rejected');
select is((select count(*) from public.session_members where student_id = 'c3000000-0000-0000-0000-000000000001'),
  0::bigint, '7c. rejected join leaves no membership');

select pg_temp.act_as('c9000000-0000-0000-0000-000000000001');
select throws_ok(format($f$select public.join_session_by_code('%s')$f$, pg_temp.c('code1')),
  'not_verified', '8. unverified user (roster mode) cannot join anything');
select is((select count(*) from public.courses), 0::bigint, '8b. unverified user sees no courses');

-- ------------------------------------------------ 9. ended session behaviour
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
insert into ctx select 's3', (public.create_session(pg_temp.c('c1')::uuid, 'Lecture 2')) ->> 'id';
select public.start_session(pg_temp.c('s3')::uuid, 0);
with i as (
  insert into public.activities(session_id, title, statement, created_by)
  values (pg_temp.c('s3')::uuid, 'Q', 'x', 'b1000000-0000-0000-0000-000000000001') returning id)
insert into ctx select 'act3', id::text from i;
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select public.join_session(pg_temp.c('s3')::uuid);
select public.save_draft(pg_temp.c('act3')::uuid, 'draft v1', 0);
select public.submit_code(pg_temp.c('act3')::uuid, 'final answer', '33333333-3333-3333-3333-333333333333');
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select public.end_session(pg_temp.c('s3')::uuid, (select version from public.sessions where id = pg_temp.c('s3')::uuid));
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_ok(format($f$select public.set_signal('%s', 'lost')$f$, pg_temp.c('s3')),
  'session_not_live', '9a. set_signal fails after the session ended');
select throws_ok(format($f$select public.save_draft('%s', 'late', 1)$f$, pg_temp.c('act3')),
  'activity_closed', '9b. save_draft fails once the activity is closed');
select throws_ok(format($f$select public.submit_code('%s', 'late', gen_random_uuid())$f$, pg_temp.c('act3')),
  'activity_closed', '9c. submit_code fails after close');
select is((select count(*) from public.code_snapshots where activity_id = pg_temp.c('act3')::uuid and kind = 'submission'),
  1::bigint, '9d. earlier submission is preserved');
select is((select (public.create_help_request(pg_temp.c('s3')::uuid, 'other', 'doubt later',
   '44444444-4444-4444-4444-444444444444')) -> 'request' ->> 'status'), 'open',
  '9e. ended session accepts Doubt Bank requests (not live questions)');
select pg_temp.act_as(null);
select is((select is_doubt_bank from public.help_requests where idempotency_key = '44444444-4444-4444-4444-444444444444'),
  true, '9f. that request is flagged is_doubt_bank');
select is((select count(*) from public.session_secrets where session_id = pg_temp.c('s3')::uuid), 0::bigint,
  '9g. join code is destroyed when the session ends');

-- ------------------------------------------------ 10. state machine
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select lives_ok(format($f$select public.set_request_status('%s', 'in_progress', 'open')$f$, pg_temp.c('r2')),
  '10a. open -> in_progress works');
select throws_ok(format($f$select public.set_request_status('%s', 'handled', 'open')$f$, pg_temp.c('r2')),
  'already_changed', '10b. stale expected_status -> already_changed');
select throws_ok(format($f$select public.set_request_status('%s', 'open', 'in_progress')$f$, pg_temp.c('r2')),
  'invalid_transition', '10c. illegal transition rejected');

-- ------------------------------------------------ 11. immutable tables
select pg_temp.act_as(null);
select throws_ok($$update public.code_snapshots set code = 'tampered'$$, 'immutable table', '11a. snapshots reject UPDATE (superuser)');
select throws_ok($$delete from public.code_snapshots$$, 'immutable table', '11b. snapshots reject DELETE (superuser)');
insert into public.audit_log(action) values ('test_row');
select throws_ok($$delete from public.audit_log$$, 'immutable table', '11c. audit_log rejects DELETE');
select throws_ok($$update public.help_request_events set event_type = 'x'$$, 'immutable table', '11d. events reject UPDATE');
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select throws_like($$update public.code_snapshots set code = 'tampered'$$, '%permission denied%', '11e. owner cannot UPDATE snapshots');

-- ------------------------------------------------ 12. realtime channel authorisation
select pg_temp.act_as(null);
insert into realtime.messages(topic, extension) values ('x', 'broadcast');
create function pg_temp.visible(p_uid uuid, p_topic text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform pg_temp.act_as(p_uid);
  perform set_config('realtime.topic', p_topic, true);
  select count(*) into n from realtime.messages;
  perform pg_temp.act_as(null);
  return n;
end $$;
select is(pg_temp.visible('c1000000-0000-0000-0000-000000000001', 'session:' || pg_temp.c('s1') || ':teacher'), 0::bigint,
  '12a. student A cannot subscribe to the teacher channel');
select is(pg_temp.visible('b2000000-0000-0000-0000-000000000001', 'session:' || pg_temp.c('s1') || ':teacher'), 0::bigint,
  '12b. teacher T2 cannot subscribe to T1 teacher channel');
select is(pg_temp.visible('b1000000-0000-0000-0000-000000000001', 'session:' || pg_temp.c('s1') || ':teacher'), 1::bigint,
  '12c. teacher T1 can subscribe to own teacher channel');
select is(pg_temp.visible('c1000000-0000-0000-0000-000000000001', 'session:' || pg_temp.c('s1') || ':public'), 1::bigint,
  '12d. member A can subscribe to the session public channel');
select is(pg_temp.visible('c3000000-0000-0000-0000-000000000001', 'session:' || pg_temp.c('s1') || ':public'), 0::bigint,
  '12e. non-member C cannot subscribe to the session public channel');
select is(pg_temp.visible('c1000000-0000-0000-0000-000000000001', 'user:c2000000-0000-0000-0000-000000000001:inbox'), 0::bigint,
  '12f. A cannot subscribe to B inbox');
select is(pg_temp.visible('c1000000-0000-0000-0000-000000000001', 'user:c1000000-0000-0000-0000-000000000001:inbox'), 1::bigint,
  '12g. A can subscribe to own inbox');
select is(pg_temp.visible('c1000000-0000-0000-0000-000000000001', 'garbage'), 0::bigint, '12h. malformed topic denied');

-- ------------------------------------------------ 13. masked anonymity + reveal
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select ok((select student_id is null and display_name like 'Student #%' and ug_number is null
             from public.teacher_requests_for_session(pg_temp.c('s1')::uuid) where request_id = pg_temp.c('r1')::uuid),
  '13a. masked request: no student_id / name / UG in teacher output');
select ok((select not (to_jsonb(t)::text like '%Aarav%' or to_jsonb(t)::text like '%c1000000%')
             from public.teacher_requests_for_session(pg_temp.c('s1')::uuid) t where t.request_id = pg_temp.c('r1')::uuid),
  '13b. identity appears nowhere in the serialised teacher row');
select ok(((public.teacher_request_thread(pg_temp.c('r1')::uuid))::text not like '%c1000000%'),
  '13c. teacher thread output does not leak the student id');
select lives_ok(format($f$select public.reveal_identity('%s')$f$, pg_temp.c('r1')), '13d. teacher can reveal in masked mode');
select is((select display_name from public.teacher_requests_for_session(pg_temp.c('s1')::uuid)
            where request_id = pg_temp.c('r1')::uuid), 'Aarav S Sharma', '13e. after reveal the name is shown');
select pg_temp.act_as('c1000000-0000-0000-0000-000000000001');
select ok(exists (select 1 from public.help_request_messages
                   where request_id = pg_temp.c('r1')::uuid and kind = 'system' and body like '%chose to see your name%'),
  '13f. student is told their identity was revealed');
select pg_temp.act_as(null);
select ok(exists (select 1 from public.audit_log where action = 'reveal_identity' and target_id = pg_temp.c('r1')::uuid),
  '13g. reveal is audit-logged');

-- ------------------------------------------------ 14. strict mode + break glass
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
update public.courses set settings = jsonb_set(settings, '{anonymity_mode}', '"strict"') where id = pg_temp.c('c1')::uuid;
select pg_temp.act_as('c2000000-0000-0000-0000-000000000001');
insert into ctx select 'r3', (public.create_help_request(pg_temp.c('s1')::uuid, 'other', 'strict anonymous question',
  '55555555-5555-5555-5555-555555555555', null, null, true, false)) -> 'request' ->> 'id';
select pg_temp.act_as('b1000000-0000-0000-0000-000000000001');
select throws_ok(format($f$select public.reveal_identity('%s')$f$, pg_temp.c('r3')), 'strict_mode',
  '14a. teacher cannot reveal in strict mode');
select throws_ok(format($f$select public.admin_break_glass_reveal('%s', 'a good enough reason')$f$, pg_temp.c('r3')),
  'permission_denied', '14b. teacher cannot use break-glass');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select throws_ok(format($f$select public.admin_break_glass_reveal('%s', 'short')$f$, pg_temp.c('r3')),
  'reason_required', '14c. break-glass requires a reason');
select is((public.admin_break_glass_reveal(pg_temp.c('r3')::uuid, 'Reported safety concern #123')) ->> 'full_name',
  'Meera Iyer', '14d. admin break-glass reveals identity');
select ok(exists (select 1 from public.audit_log where action = 'break_glass_reveal' and target_id = pg_temp.c('r3')::uuid
                    and metadata ->> 'reason' = 'Reported safety concern #123'), '14e. break-glass is audited with its reason');

-- ------------------------------------------------ extras: signup hardening
select pg_temp.act_as(null);
insert into auth.users(id, email, raw_user_meta_data)
values ('d0000000-0000-0000-0000-000000000001', 'z@x.test',
        '{"full_name":"Zed Hacker","role":"admin","ug_number":"UG/24/00077"}');
select is((select role::text from public.user_roles where user_id = 'd0000000-0000-0000-0000-000000000001'), 'student',
  'X1. metadata cannot grant a role: signup is always student');
select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'dup@x.test', '{"full_name":"Dup Licate","ug_number":"UG/24/00001"}')$$,
  'invalid_details', 'X2. duplicate UG number rejected with a generic error');
select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'bad@x.test', '{"full_name":"Bad Ug","ug_number":"UG/24/0001"}')$$,
  'invalid_details', 'X3. malformed UG number rejected (no silent fixing)');

select * from finish();
rollback;
