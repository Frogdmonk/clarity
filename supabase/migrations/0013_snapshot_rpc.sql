-- Used by the draft conflict dialog: "Save mine as a snapshot, then take theirs".
create function public.snapshot_my_code(p_activity uuid, p_code text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_user(); v_a public.activities; v_ver int;
begin
  if p_code is null or char_length(p_code) > 100000 then raise exception 'too_large'; end if;
  select * into v_a from public.activities where id = p_activity;
  if not found or not public.is_activity_member(p_activity) then raise exception 'permission_denied'; end if;
  if v_a.closed then raise exception 'activity_closed'; end if;
  perform public.check_rate('snap', 12, 60);
  v_ver := public._next_snapshot_version(p_activity, v_uid);
  insert into public.code_snapshots(activity_id, student_id, version, kind, code)
  values (p_activity, v_uid, v_ver, 'autosave', p_code);
  return v_ver;
end $$;
grant execute on function public.snapshot_my_code(uuid, text) to authenticated;
