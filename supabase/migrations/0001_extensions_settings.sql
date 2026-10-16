create extension if not exists pg_trgm with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.platform_settings (
  id boolean primary key default true check (id),
  roster_mode boolean not null default false,
  ug_regex text not null default '^UG\/\d{2}\/\d{5}$',
  ug_unique boolean not null default true,
  default_doubt_bank_hours int not null default 48,
  pseudonym_salt text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings default values;
