-- Privacy tests: one login per role (PRD build note + R4).
-- Run with `npm run test:rls` (plain Postgres, uses auth_stub.sql).
-- Any failed check raises and stops the script with a non-zero exit.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- Supabase grants anon table access by default; RLS must still return nothing.
grant usage on schema public to anon;
grant select on all tables in schema public to anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'pastor@test'),
  ('00000000-0000-0000-0000-00000000000b', 'coord@test'),
  ('00000000-0000-0000-0000-00000000000c', 'int1@test'),
  ('00000000-0000-0000-0000-00000000000d', 'int2@test'),
  ('00000000-0000-0000-0000-00000000000e', 'other@test');

insert into churches (id, slug, name) values
  ('10000000-0000-0000-0000-000000000001', 'test-church', 'Test Church'),
  ('10000000-0000-0000-0000-000000000002', 'other-church', 'Other Church');

insert into members (id, church_id, user_id, display_name, email, role) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Pastor', 'pastor@test', 'pastor'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'Coord', 'coord@test', 'coordinator'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'Int1', 'int1@test', 'intercessor'),
  ('20000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'Int2', 'int2@test', 'intercessor'),
  ('20000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000e', 'Other', 'other@test', 'pastor');

insert into requests (id, church_id, privacy) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'team'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'leaders'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'pastors');
insert into request_details (request_id, body, consent_at) values
  ('30000000-0000-0000-0000-000000000001', 'team text', now()),
  ('30000000-0000-0000-0000-000000000002', 'leaders text', now()),
  ('30000000-0000-0000-0000-000000000003', 'pastors text', now());

create function pg_temp.expect(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual <> expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;

create function pg_temp.login(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end $$;

set role authenticated;

-- pastor sees all three texts
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect('pastor sees 3 request rows', (select count(*) from requests), 3);
select pg_temp.expect('pastor reads 3 texts', (select count(*) from request_details), 3);

-- coordinator: team + leaders, not pastors-only
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect('coordinator sees 3 request rows (locked rows listed)', (select count(*) from requests), 3);
select pg_temp.expect('coordinator reads 2 texts', (select count(*) from request_details), 2);
select pg_temp.expect('coordinator cannot read pastors-only text',
  (select count(*) from request_details where body = 'pastors text'), 0);

-- intercessor: team only
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('intercessor reads 1 text', (select count(*) from request_details), 1);
select pg_temp.expect('intercessor cannot read leaders text',
  (select count(*) from request_details where body = 'leaders text'), 0);
select pg_temp.expect('intercessor cannot read pastors text',
  (select count(*) from request_details where body = 'pastors text'), 0);

-- intercessor cannot assign
do $$ begin
  begin
    insert into assignments (request_id, member_id) values
      ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL intercessor was able to assign';
  exception when insufficient_privilege then raise notice 'ok  intercessor cannot assign';
  end;
end $$;

-- coordinator cannot assign a pastors-only request (cannot see it)
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into assignments (request_id, member_id) values
      ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000c');
    raise exception 'FAIL coordinator assigned a pastors-only request';
  exception when insufficient_privilege then raise notice 'ok  coordinator cannot assign pastors-only';
  end;
end $$;

-- pastor brings intercessor 2 into the pastors-only request
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into assignments (request_id, member_id, assigned_by) values
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-00000000000a');

select pg_temp.login('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect('assigned intercessor now reads pastors-only text',
  (select count(*) from request_details where body = 'pastors text'), 1);
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('other intercessor still cannot',
  (select count(*) from request_details where body = 'pastors text'), 0);

-- another church sees nothing
select pg_temp.login('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect('other church sees 0 request rows', (select count(*) from requests), 0);
select pg_temp.expect('other church reads 0 texts', (select count(*) from request_details), 0);

-- signed-out (anon) sees nothing
reset role;
set role anon;
select pg_temp.login('');
select pg_temp.expect('anon sees 0 request rows', (select count(*) from requests), 0);
select pg_temp.expect('anon reads 0 texts', (select count(*) from request_details), 0);

reset role;
select 'ALL PRIVACY CHECKS PASSED' as result;
