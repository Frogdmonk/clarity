create table public.activities (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  statement text not null check (char_length(statement) <= 20000),
  language text not null default 'plaintext',
  starter_code text not null default '' check (char_length(starter_code) <= 100000),
  config jsonb not null default '{}',
  due_at timestamptz,
  closed boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index activities_session on public.activities(session_id);

create table public.code_drafts (
  activity_id uuid references public.activities(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  code text not null check (char_length(code) <= 100000),
  rev int not null default 1,
  device_id text,
  saved_at timestamptz not null default now(),
  primary key (activity_id, student_id)
);

create type public.snapshot_kind as enum ('autosave','request','submission');
create table public.code_snapshots (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  version int not null,
  kind public.snapshot_kind not null,
  code text not null check (char_length(code) <= 100000),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  unique (activity_id, student_id, version)
);
create index snapshots_lookup on public.code_snapshots(activity_id, student_id, version desc);
create unique index snapshots_idem on public.code_snapshots(student_id, idempotency_key)
  where idempotency_key is not null;

create function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable table';
end $$;

create trigger snap_immutable before update or delete on public.code_snapshots
  for each row execute function public.forbid_mutation();
