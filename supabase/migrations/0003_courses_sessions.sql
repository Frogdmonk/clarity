create table public.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid,
  title text not null check (char_length(title) between 2 and 160),
  description text check (char_length(description) <= 2000),
  owner_id uuid not null references public.profiles(id),
  settings jsonb not null default '{
    "anonymity_mode":"masked",
    "doubt_bank_hours":48,
    "behaviour": {"pulse_reveal_after_commit":true,"impact_messages":true,"exit_ticket":true}
  }',
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('student','teacher');
create type public.enrol_status as enum ('active','invited','removed');
create table public.course_members (
  course_id uuid references public.courses(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  member_role public.member_role not null,
  status public.enrol_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (course_id, user_id)
);
create index course_members_user on public.course_members(user_id, status);

create type public.session_status as enum ('scheduled','live','ended');
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 2 and 160),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  status public.session_status not null default 'scheduled',
  questions_paused boolean not null default false,
  qa_window_open boolean not null default false,
  current_topic_id uuid,
  settings jsonb not null default '{}',
  version int not null default 0,
  created_at timestamptz not null default now(),
  check ((status = 'scheduled') or started_at is not null),
  check ((status <> 'ended') or ended_at is not null)
);
create index sessions_course_status on public.sessions(course_id, status, scheduled_at desc);

create table public.session_secrets (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  join_code text not null,
  expires_at timestamptz not null
);
create unique index session_join_code_active on public.session_secrets(join_code);

create table public.session_members (
  session_id uuid references public.sessions(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (session_id, student_id)
);
create index session_members_student on public.session_members(student_id);

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index topics_session on public.topics(session_id, started_at);

alter table public.sessions
  add constraint sessions_current_topic_fk
  foreign key (current_topic_id) references public.topics(id) on delete set null;
