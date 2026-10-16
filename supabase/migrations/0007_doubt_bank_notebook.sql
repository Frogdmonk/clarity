create table public.notebook_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.help_requests(id) on delete set null,
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) <= 8000),
  snapshot_code text check (char_length(snapshot_code) <= 100000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index notebook_student on public.notebook_entries(student_id, created_at desc);

create table public.exit_tickets (
  session_id uuid references public.sessions(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  muddiest text check (char_length(muddiest) <= 500),
  confidence smallint check (confidence between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
