create type public.request_status as enum ('open','in_progress','handled','reopened');
create type public.request_category as enum ('concept','coding','example','pace','other');
create type public.anon_mode as enum ('identified','masked','strict');

create table public.clusters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 160),
  addressed_at timestamptz,
  addressed_note text check (char_length(addressed_note) <= 500),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index clusters_session on public.clusters(session_id);

create table public.help_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id),
  topic_id uuid references public.topics(id),
  snapshot_id uuid references public.code_snapshots(id),
  category public.request_category not null,
  message text not null check (char_length(message) between 1 and 2000),
  is_anonymous boolean not null default false,
  anon_policy public.anon_mode not null,
  is_doubt_bank boolean not null default false,
  priority smallint not null default 0 check (priority between 0 and 2),
  is_blocked boolean not null default false,
  status public.request_status not null default 'open',
  cluster_id uuid references public.clusters(id) on delete set null,
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  student_confirmed text check (student_confirmed in ('cleared','partly','not_cleared')),
  identity_revealed boolean not null default false,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, idempotency_key)
);
create index hr_session_status on public.help_requests(session_id, status, created_at);
create index hr_student on public.help_requests(student_id, created_at desc);
create index hr_cluster on public.help_requests(cluster_id);
create index hr_message_trgm on public.help_requests using gin (message extensions.gin_trgm_ops);

create table public.help_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.help_requests(id) on delete cascade,
  sender_id uuid references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  kind text not null default 'reply'
    check (kind in ('reply','hint','guiding_question','follow_up','system')),
  created_at timestamptz not null default now()
);
create index hrm_request on public.help_request_messages(request_id, created_at);

create table public.help_request_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.help_requests(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  note text not null check (char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hrn_request on public.help_request_notes(request_id);

create table public.help_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.help_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index hre_request on public.help_request_events(request_id, created_at);

create trigger events_immutable before update or delete on public.help_request_events
  for each row execute function public.forbid_mutation();
