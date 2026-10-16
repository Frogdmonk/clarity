-- Minimal pgTAP-compatible subset used ONLY by the PGlite harness. Real runs use the pgTAP extension.
create function extensions.plan(n int) returns text language plpgsql as $$
begin
  perform set_config('tap.n', '0', false); perform set_config('tap.plan', n::text, false);
  perform set_config('tap.failed', '0', false);
  return '1..' || n;
end $$;
create function extensions._tap(p_ok boolean, p_desc text, p_diag text default null) returns text language plpgsql as $$
declare n int := current_setting('tap.n')::int + 1;
begin
  perform set_config('tap.n', n::text, false);
  if not coalesce(p_ok, false) then
    perform set_config('tap.failed', (current_setting('tap.failed')::int + 1)::text, false);
  end if;
  return (case when coalesce(p_ok, false) then 'ok ' else 'not ok ' end) || n || ' - ' || coalesce(p_desc, '')
         || coalesce(E'\n#   ' || p_diag, '');
end $$;
create function extensions.ok(boolean, text default '') returns text language sql as $$ select extensions._tap($1, $2) $$;
create function extensions.is(anyelement, anyelement, text default '') returns text language sql as $$
  select extensions._tap($1 is not distinct from $2, $3, case when $1 is not distinct from $2 then null
    else format('have: %s want: %s', $1, $2) end) $$;
create function extensions.isnt(anyelement, anyelement, text default '') returns text language sql as $$
  select extensions._tap($1 is distinct from $2, $3) $$;
create function extensions.throws_ok(p_sql text, p_msg text, p_desc text default '') returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return extensions._tap(sqlerrm = p_msg, p_desc, format('threw: %s want: %s', sqlerrm, p_msg));
  end;
  return extensions._tap(false, p_desc, 'no exception thrown, wanted: ' || p_msg);
end $$;
create function extensions.throws_like(p_sql text, p_pat text, p_desc text default '') returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return extensions._tap(sqlerrm like p_pat, p_desc, format('threw: %s want like: %s', sqlerrm, p_pat));
  end;
  return extensions._tap(false, p_desc, 'no exception thrown, wanted like: ' || p_pat);
end $$;
create function extensions.lives_ok(p_sql text, p_desc text default '') returns text language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return extensions._tap(false, p_desc, 'threw: ' || sqlerrm);
  end;
  return extensions._tap(true, p_desc);
end $$;
create function extensions.finish() returns setof text language plpgsql as $$
begin
  if current_setting('tap.failed')::int > 0 then
    return next '# Looks like you failed ' || current_setting('tap.failed') || ' test(s)';
  end if;
  if current_setting('tap.n')::int <> current_setting('tap.plan')::int then
    return next '# Looks like you planned ' || current_setting('tap.plan') || ' tests but ran ' || current_setting('tap.n');
  end if;
  return;
end $$;
grant execute on all functions in schema extensions to public;
