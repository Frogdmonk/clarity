create table public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (user_id, bucket, window_start)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create trigger audit_immutable before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- Rate limiter. Called from inside SECURITY DEFINER RPCs only.
create function public.check_rate(p_bucket text, p_limit int, p_window_seconds int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_hits int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits(user_id, bucket, window_start, hits)
  values (v_uid, p_bucket, v_window, 1)
  on conflict (user_id, bucket, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- lazy cleanup of old windows (cheap, bounded)
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  if v_hits > p_limit then raise exception 'rate_limited'; end if;
end $$;

revoke all on function public.check_rate(text, int, int) from public, anon, authenticated;
