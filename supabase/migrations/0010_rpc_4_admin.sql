create function public.admin_set_role(p_user uuid, p_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user();
begin
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  if p_user = v_uid then raise exception 'cannot_change_self'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_found'; end if;
  insert into public.user_roles(user_id, role, granted_by) values (p_user, p_role, v_uid)
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  perform public._audit('set_role', 'profile', p_user, jsonb_build_object('role', p_role));
end $$;

create function public.admin_set_verification(p_user uuid, p_status public.verification_status) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user();
begin
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  if p_user = v_uid then raise exception 'cannot_change_self'; end if;
  update public.profiles set verification = p_status, updated_at = now() where id = p_user;
  if not found then raise exception 'not_found'; end if;
  perform public._audit('set_verification', 'profile', p_user, jsonb_build_object('status', p_status));
end $$;

create function public.admin_disable_user(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  select public.admin_set_verification(p_user, 'disabled')
$$;

-- p_rows: [{"ug_number":"UG/24/00123","full_name":"Aarav Sharma"}, ...]
create function public.admin_import_roster(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_regex text; v_row jsonb; v_ug text; v_name text; v_ok int := 0; v_bad int := 0; v_matched int := 0;
begin
  perform public._require_user();
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'invalid_rows'; end if;
  select ug_regex into v_regex from public.platform_settings where id;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_ug := upper(btrim(coalesce(v_row ->> 'ug_number', '')));
    v_name := lower(regexp_replace(btrim(coalesce(v_row ->> 'full_name', '')), '\s+', ' ', 'g'));
    if v_ug !~ v_regex or char_length(v_name) < 2 then v_bad := v_bad + 1; continue; end if;
    insert into public.roster_entries(normalised_ug, normalised_name) values (v_ug, v_name)
    on conflict (normalised_ug) do update set normalised_name = excluded.normalised_name
      where public.roster_entries.claimed_by is null;
    v_ok := v_ok + 1;
  end loop;

  -- Verify pending accounts that now match an unclaimed roster entry
  with m as (
    select p.id as pid, r.id as rid from public.profiles p
      join public.roster_entries r on r.normalised_ug = p.normalised_ug
       and r.normalised_name = lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g'))
     where p.verification = 'pending' and r.claimed_by is null),
  u as (update public.profiles set verification = 'verified', updated_at = now()
         where id in (select pid from m) returning id),
  c as (update public.roster_entries set claimed_by = m.pid from m where roster_entries.id = m.rid returning 1)
  select count(*) into v_matched from u;

  perform public._audit('import_roster', null, null,
    jsonb_build_object('imported', v_ok, 'invalid', v_bad, 'verified_now', v_matched));
  return jsonb_build_object('imported', v_ok, 'invalid', v_bad, 'verified_now', v_matched);
end $$;

create function public.admin_break_glass_reveal(p_request uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_r public.help_requests; v_p public.profiles;
begin
  perform public._require_user();
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 then raise exception 'reason_required'; end if;
  select * into v_r from public.help_requests where id = p_request;
  if not found then raise exception 'not_found'; end if;
  select * into v_p from public.profiles where id = v_r.student_id;
  perform public._audit('break_glass_reveal', 'help_request', p_request,
    jsonb_build_object('reason', btrim(p_reason)));
  return jsonb_build_object('student_id', v_p.id, 'full_name', v_p.full_name, 'ug_number', v_p.ug_number);
end $$;

create function public.admin_purge_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user();
begin
  if not public.is_admin() then raise exception 'permission_denied'; end if;
  if p_user = v_uid then raise exception 'cannot_change_self'; end if;
  perform public._audit('purge_user', 'profile', p_user);
  delete from auth.users where id = p_user;   -- cascades to profiles and all student-owned rows
end $$;

grant execute on function
  public.admin_set_role(uuid, public.app_role),
  public.admin_set_verification(uuid, public.verification_status),
  public.admin_disable_user(uuid), public.admin_import_roster(jsonb),
  public.admin_break_glass_reveal(uuid, text), public.admin_purge_user(uuid)
  to authenticated;
