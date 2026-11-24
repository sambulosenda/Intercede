-- Intercede schema and privacy rules.
--
-- Privacy (PRD R3/R4) is enforced here, in row-level security, not in the UI:
--   * `requests` holds metadata only (status, urgency, privacy level, assignee).
--     Every member of the church can list it, so the inbox can show locked rows.
--   * `request_details` holds the words (request text, theme, requester name and
--     contact). A member can read a row only if their role is allowed by the
--     request's privacy level, or the request was assigned to them.
--   * Briefs, follow-ups and testimonies follow the same rule as the details.
--
-- Public intake (the request form) never touches the database as `anon`.
-- The Next.js server inserts with the service role after validating the form.

create extension if not exists pgcrypto;

create type member_role as enum ('intercessor', 'coordinator', 'pastor');
create type privacy_level as enum ('team', 'leaders', 'pastors');
create type request_status as enum ('new', 'assigned', 'prayed', 'followed_up', 'closed');
create type urgency_level as enum ('normal', 'urgent', 'pastoral');

-- ---------------------------------------------------------------- tables

create table churches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  contact_phone text,
  safeguarding_contact text,
  retention_months int not null default 12,
  follow_up_days int not null default 7,
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null,
  role member_role not null,
  created_at timestamptz not null default now()
);
create index on members (church_id);

create table requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches(id) on delete cascade,
  privacy privacy_level not null,
  status request_status not null default 'new',
  urgency urgency_level not null default 'normal',
  triaged_at timestamptz,             -- null = AI not run or failed: shows as unsorted
  answered boolean not null default false,
  assigned_to uuid references members(id) on delete set null,
  pastor_ack_at timestamptz,          -- urgent/pastoral rows stay pinned until set
  pastor_ack_by uuid references members(id) on delete set null,
  follow_up_due_at timestamptz,
  has_contact boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index on requests (church_id, created_at desc);

create table request_details (
  request_id uuid primary key references requests(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  requester_name text,
  requester_contact text,
  theme text,
  urgency_reason text,
  safeguarding boolean not null default false,
  consent_at timestamptz not null,
  testimony_consent boolean not null default false
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  assigned_by uuid references members(id) on delete set null,
  assigned_at timestamptz not null default now(),
  prayed_at timestamptz,
  note text
);
create index on assignments (request_id);
create index on assignments (member_id);

create table briefs (
  request_id uuid primary key references requests(id) on delete cascade,
  prayer_points jsonb not null default '[]',
  scriptures jsonb not null default '[]',   -- [{reference, text, version}]
  ai_generated boolean not null default true,
  approved_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  draft text not null,
  edited_text text,
  ai_generated boolean not null default true,
  approved_by uuid references members(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on follow_ups (request_id);

create table testimonies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references requests(id) on delete cascade,
  draft text not null,
  edited_text text,
  ai_generated boolean not null default true,
  approved_by uuid references members(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  church_id uuid not null references churches(id) on delete cascade,
  member_id uuid references members(id) on delete set null,
  request_id uuid references requests(id) on delete cascade,
  action text not null,
  at timestamptz not null default now()
);
create index on audit_log (church_id, at desc);

-- Verses fetched from the Bible source, so briefs keep working if the API is slow.
create table verse_cache (
  reference text not null,
  version text not null,
  text text not null,
  fetched_at timestamptz not null default now(),
  primary key (reference, version)
);

-- ---------------------------------------------------------------- helpers
-- security definer so policies can look up the caller's membership without
-- recursing through members' own RLS.

create function my_member() returns members
language sql stable security definer set search_path = public as $$
  select * from members where user_id = auth.uid() limit 1
$$;

create function my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid() limit 1
$$;

create function my_church_id() returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from members where user_id = auth.uid() limit 1
$$;

create function my_role() returns member_role
language sql stable security definer set search_path = public as $$
  select role from members where user_id = auth.uid() limit 1
$$;

create function is_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(my_role() in ('coordinator', 'pastor'), false)
$$;

-- The single privacy rule. Everything that shows request words goes through it.
create function can_view_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from requests r
    join members m on m.church_id = r.church_id and m.user_id = auth.uid()
    where r.id = rid
      and (
        r.privacy = 'team'
        or (r.privacy = 'leaders' and m.role in ('coordinator', 'pastor'))
        or (r.privacy = 'pastors' and m.role = 'pastor')
        -- a pastor may bring someone in by assigning the request to them
        or exists (select 1 from assignments a where a.request_id = r.id and a.member_id = m.id)
      )
  )
$$;

-- Leaders may manage a request only if they can see it.
create function can_manage_request(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_leader() and can_view_request(rid)
$$;

-- ---------------------------------------------------------------- RLS

alter table churches enable row level security;
alter table members enable row level security;
alter table requests enable row level security;
alter table request_details enable row level security;
alter table assignments enable row level security;
alter table briefs enable row level security;
alter table follow_ups enable row level security;
alter table testimonies enable row level security;
alter table audit_log enable row level security;
alter table verse_cache enable row level security;

-- churches: members read their own church
create policy churches_read on churches for select to authenticated
  using (id = my_church_id());

-- members: read the team list of your own church
create policy members_read on members for select to authenticated
  using (church_id = my_church_id());

-- requests: metadata visible to the whole church team (locked rows show no words)
create policy requests_read on requests for select to authenticated
  using (church_id = my_church_id());
create policy requests_update_leader on requests for update to authenticated
  using (church_id = my_church_id() and can_manage_request(id))
  with check (church_id = my_church_id());
create policy requests_update_assignee on requests for update to authenticated
  using (assigned_to = my_member_id())
  with check (church_id = my_church_id());

-- request_details: the words. Read only through the privacy rule. No client writes.
create policy details_read on request_details for select to authenticated
  using (can_view_request(request_id));
create policy details_update_leader on request_details for update to authenticated
  using (can_manage_request(request_id))
  with check (can_manage_request(request_id));

-- assignments
create policy assignments_read on assignments for select to authenticated
  using (can_view_request(request_id));
create policy assignments_insert on assignments for insert to authenticated
  with check (can_manage_request(request_id)
              and exists (select 1 from members m where m.id = member_id and m.church_id = my_church_id()));
create policy assignments_update_self on assignments for update to authenticated
  using (member_id = my_member_id())
  with check (member_id = my_member_id());
create policy assignments_update_leader on assignments for update to authenticated
  using (can_manage_request(request_id))
  with check (can_manage_request(request_id));
create policy assignments_delete_leader on assignments for delete to authenticated
  using (can_manage_request(request_id));

-- briefs: anyone who can see the request can generate and read its brief
create policy briefs_read on briefs for select to authenticated
  using (can_view_request(request_id));
create policy briefs_write on briefs for insert to authenticated
  with check (can_view_request(request_id));
create policy briefs_update on briefs for update to authenticated
  using (can_view_request(request_id)) with check (can_view_request(request_id));

-- follow-ups and testimonies: leaders only
create policy follow_ups_read on follow_ups for select to authenticated
  using (can_view_request(request_id));
create policy follow_ups_insert on follow_ups for insert to authenticated
  with check (can_manage_request(request_id));
create policy follow_ups_update on follow_ups for update to authenticated
  using (can_manage_request(request_id)) with check (can_manage_request(request_id));

create policy testimonies_read on testimonies for select to authenticated
  using (can_view_request(request_id));
create policy testimonies_insert on testimonies for insert to authenticated
  with check (can_manage_request(request_id));
create policy testimonies_update on testimonies for update to authenticated
  using (can_manage_request(request_id)) with check (can_manage_request(request_id));
-- approving a testimony is a pastor's decision (enforced in update below)
create function testimony_approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null
     and coalesce(my_role()::text, '') <> 'pastor'
     and auth.uid() is not null then
    raise exception 'Only a pastor can approve a testimony';
  end if;
  return new;
end $$;
create trigger testimony_approval_guard before update on testimonies
  for each row execute function testimony_approval_guard();

-- audit log: members write entries for their own church; leaders read them
create policy audit_insert on audit_log for insert to authenticated
  with check (church_id = my_church_id() and member_id = my_member_id());
create policy audit_read on audit_log for select to authenticated
  using (church_id = my_church_id() and is_leader());

-- verse cache: shared, non-sensitive
create policy verse_cache_read on verse_cache for select to authenticated using (true);
create policy verse_cache_write on verse_cache for insert to authenticated with check (true);

-- Status only moves forward: new -> assigned -> prayed -> followed_up -> closed.
create function request_status_guard() returns trigger
language plpgsql as $$
begin
  if new.status < old.status then
    raise exception 'Request status cannot move backwards (% -> %)', old.status, new.status;
  end if;
  -- privacy level can never be changed from the app (the AI may not change it either)
  if new.privacy <> old.privacy and auth.uid() is not null then
    raise exception 'Privacy level cannot be changed after submission';
  end if;
  return new;
end $$;
create trigger request_status_guard before update on requests
  for each row execute function request_status_guard();
