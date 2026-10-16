create type public.understanding as enum ('understand','partial','lost');

create table public.understanding_signals (
  session_id uuid references public.sessions(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  topic_id uuid references public.topics(id),
  value public.understanding not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create table public.session_pulse (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  understand int not null default 0,
  partial int not null default 0,
  lost int not null default 0,
  joined int not null default 0,
  by_topic jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.pulse_history (
  session_id uuid references public.sessions(id) on delete cascade,
  at timestamptz not null,
  understand int, partial int, lost int,
  topic_id uuid,
  primary key (session_id, at)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 2000),
  kind text not null check (kind in ('mcq','true_false','confidence','predict_output','short_answer')),
  options jsonb not null default '[]',
  correct jsonb,
  allow_change boolean not null default false,
  require_confidence boolean not null default false,
  status text not null default 'draft' check (status in ('draft','open','closed','revealed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index polls_session on public.polls(session_id);

create table public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  response jsonb not null,
  confidence smallint check (confidence between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, student_id)
);
