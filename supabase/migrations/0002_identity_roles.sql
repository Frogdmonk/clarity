create type public.app_role as enum ('student','teacher','admin');
create type public.verification_status as enum ('pending','verified','rejected','disabled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  ug_number text,
  normalised_ug text,
  verification public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_ug_unique on public.profiles(normalised_ug) where normalised_ug is not null;

create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role public.app_role not null default 'student',
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now()
);

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  normalised_ug text not null unique,
  normalised_name text not null,
  claimed_by uuid unique references public.profiles(id),
  created_at timestamptz not null default now()
);

-- New-user trigger: user metadata is untrusted. Always role 'student'.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.platform_settings;
  v_name text;
  v_ug text;
  v_norm text;
  v_status public.verification_status := 'pending';
  v_roster public.roster_entries;
begin
  select * into s from public.platform_settings where id;
  v_name := btrim(coalesce(new.raw_user_meta_data->>'full_name', ''));
  v_ug := new.raw_user_meta_data->>'ug_number';
  v_norm := case when v_ug is null then null else upper(btrim(v_ug)) end;

  if char_length(v_name) < 2 then
    raise exception 'invalid_details';
  end if;
  if v_norm is not null and v_norm !~ s.ug_regex then
    raise exception 'invalid_details';
  end if;

  if s.roster_mode then
    if v_norm is not null then
      select * into v_roster from public.roster_entries
        where normalised_ug = v_norm and claimed_by is null
          and normalised_name = lower(regexp_replace(v_name, '\s+', ' ', 'g'));
      if found then
        v_status := 'verified';
      end if;
    end if;
  else
    v_status := 'verified';
  end if;

  begin
    insert into public.profiles(id, full_name, ug_number, normalised_ug, verification)
    values (new.id, v_name, v_ug, v_norm, v_status);
  exception when unique_violation then
    -- Generic error (anti-enumeration). An audit row cannot be written here because
    -- the raised exception rolls back the whole signup transaction.
    raise exception 'invalid_details';
  end;

  insert into public.user_roles(user_id, role) values (new.id, 'student');

  if v_status = 'verified' and s.roster_mode then
    update public.roster_entries set claimed_by = new.id where id = v_roster.id;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
