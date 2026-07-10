begin;

alter table public.weddings
  add column if not exists planner_id uuid,
  add column if not exists color text not null default '#39756c',
  add column if not exists status text not null default 'active',
  add column if not exists completed_at timestamptz;

update public.weddings as wedding
set planner_id = profile.id
from public.profiles as profile
where wedding.planner_id is null
  and profile.wedding_id = wedding.id
  and profile.role = 'planner';

do $$
begin
  if exists (select 1 from public.weddings where planner_id is null) then
    raise exception 'Every wedding must have a planner before migration';
  end if;
end;
$$;

alter table public.weddings
  alter column planner_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weddings_planner_id_fkey'
      and conrelid = 'public.weddings'::regclass
  ) then
    alter table public.weddings
      add constraint weddings_planner_id_fkey
      foreign key (planner_id) references auth.users(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'weddings_status_check'
      and conrelid = 'public.weddings'::regclass
  ) then
    alter table public.weddings
      add constraint weddings_status_check check (status in ('active', 'completed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'weddings_color_check'
      and conrelid = 'public.weddings'::regclass
  ) then
    alter table public.weddings
      add constraint weddings_color_check check (color ~ '^#[0-9a-fA-F]{6}$');
  end if;
end;
$$;

create unique index if not exists weddings_planner_id_id_key
  on public.weddings (planner_id, id);
create index if not exists weddings_planner_status_date_idx
  on public.weddings (planner_id, status, wedding_date);

create table if not exists public.wedding_members (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('groom', 'bride')),
  created_at timestamptz not null default now(),
  primary key (wedding_id, user_id),
  unique (user_id),
  unique (wedding_id, role)
);

insert into public.wedding_members (wedding_id, user_id, role, created_at)
select wedding_id, id, role, created_at
from public.profiles
where role in ('groom', 'bride')
on conflict do nothing;

alter table public.profiles alter column wedding_id drop not null;

alter table public.vendor_categories add column if not exists planner_id uuid;
alter table public.vendors add column if not exists planner_id uuid;
alter table public.vendor_photos add column if not exists planner_id uuid;

update public.vendor_categories as category
set planner_id = wedding.planner_id
from public.weddings as wedding
where category.planner_id is null
  and category.wedding_id = wedding.id;

update public.vendors as vendor
set planner_id = wedding.planner_id
from public.weddings as wedding
where vendor.planner_id is null
  and vendor.wedding_id = wedding.id;

update public.vendor_photos as photo
set planner_id = wedding.planner_id
from public.weddings as wedding
where photo.planner_id is null
  and photo.wedding_id = wedding.id;

alter table public.vendor_categories alter column planner_id set not null;
alter table public.vendors alter column planner_id set not null;
alter table public.vendor_photos alter column planner_id set not null;

alter table public.vendor_photos
  drop constraint if exists vendor_photos_wedding_id_vendor_id_fkey;
alter table public.vendors
  drop constraint if exists vendors_wedding_id_category_id_fkey;
alter table public.vendor_categories
  drop constraint if exists vendor_categories_wedding_id_name_key;
alter table public.vendor_photos drop constraint if exists vendor_photos_pkey;
alter table public.vendors drop constraint if exists vendors_pkey;
alter table public.vendor_categories drop constraint if exists vendor_categories_pkey;

alter table public.vendor_categories alter column wedding_id drop not null;
alter table public.vendors alter column wedding_id drop not null;

alter table public.vendor_categories
  add constraint vendor_categories_pkey primary key (planner_id, id),
  add constraint vendor_categories_planner_name_key unique (planner_id, name),
  add constraint vendor_categories_planner_id_fkey
    foreign key (planner_id) references auth.users(id) on delete cascade;

alter table public.vendors
  add constraint vendors_pkey primary key (planner_id, id),
  add constraint vendors_planner_category_fkey
    foreign key (planner_id, category_id)
    references public.vendor_categories(planner_id, id)
    on update cascade on delete restrict,
  add constraint vendors_planner_id_fkey
    foreign key (planner_id) references auth.users(id) on delete cascade;

alter table public.vendor_photos
  add constraint vendor_photos_pkey primary key (planner_id, id),
  add constraint vendor_photos_planner_vendor_fkey
    foreign key (planner_id, vendor_id)
    references public.vendors(planner_id, id)
    on delete cascade,
  add constraint vendor_photos_planner_id_fkey
    foreign key (planner_id) references auth.users(id) on delete cascade;

create table if not exists public.wedding_vendor_selections (
  planner_id uuid not null,
  wedding_id uuid not null,
  vendor_id text not null,
  status text not null default '관심',
  quoted_price text not null default '',
  contract_terms text not null default '',
  planner_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, vendor_id),
  foreign key (planner_id, wedding_id)
    references public.weddings(planner_id, id) on delete cascade,
  foreign key (planner_id, vendor_id)
    references public.vendors(planner_id, id) on delete cascade
);

insert into public.wedding_vendor_selections (
  planner_id, wedding_id, vendor_id, status, created_at, updated_at
)
select planner_id, wedding_id, id, status, created_at, updated_at
from public.vendors
where wedding_id is not null
on conflict (wedding_id, vendor_id) do nothing;

create index if not exists wedding_members_wedding_idx
  on public.wedding_members (wedding_id, role);
create index if not exists wedding_vendor_selections_planner_idx
  on public.wedding_vendor_selections (planner_id, wedding_id, updated_at desc);
create index if not exists vendor_categories_planner_sort_idx
  on public.vendor_categories (planner_id, sort_order);
create index if not exists vendors_planner_recent_idx
  on public.vendors (planner_id, updated_at desc);
create index if not exists vendor_photos_planner_vendor_idx
  on public.vendor_photos (planner_id, vendor_id, sort_order);

drop trigger if exists wedding_vendor_selections_touch_updated_at
  on public.wedding_vendor_selections;
create trigger wedding_vendor_selections_touch_updated_at
before update on public.wedding_vendor_selections
for each row execute function public.touch_updated_at();

create or replace function public.is_platform_planner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'planner'
  );
$$;

create or replace function public.is_wedding_planner(target_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.weddings
    where id = target_wedding_id
      and planner_id = (select auth.uid())
  );
$$;

create or replace function public.is_active_wedding_planner(target_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.weddings
    where id = target_wedding_id
      and planner_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function public.is_wedding_member(target_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.wedding_members
    where wedding_id = target_wedding_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_wedding(target_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_wedding_planner(target_wedding_id)
      or public.is_wedding_member(target_wedding_id);
$$;

create or replace function public.planner_can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid())
    or exists (
      select 1
      from public.wedding_members as member
      join public.weddings as wedding on wedding.id = member.wedding_id
      where member.user_id = target_user_id
        and wedding.planner_id = (select auth.uid())
    );
$$;

create or replace function public.can_manage_vendor_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_planner()
    and (
      public.storage_wedding_id(object_name) = (select auth.uid())
      or public.is_wedding_planner(public.storage_wedding_id(object_name))
    );
$$;

alter table public.wedding_members enable row level security;
alter table public.wedding_vendor_selections enable row level security;

drop policy if exists weddings_member_select on public.weddings;
drop policy if exists weddings_planner_select on public.weddings;
create policy weddings_access_select on public.weddings
for select to authenticated
using (public.can_access_wedding(id));

drop policy if exists weddings_planner_insert on public.weddings;
create policy weddings_planner_insert on public.weddings
for insert to authenticated
with check (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists weddings_planner_update on public.weddings;
create policy weddings_planner_update on public.weddings
for update to authenticated
using (public.is_wedding_planner(id))
with check (planner_id = (select auth.uid()));

drop policy if exists profiles_member_select on public.profiles;
create policy profiles_scoped_select on public.profiles
for select to authenticated
using (public.planner_can_view_profile(id));

drop policy if exists profiles_planner_delete on public.profiles;

create policy wedding_members_scoped_select on public.wedding_members
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_wedding_planner(wedding_id)
);

drop policy if exists member_invites_planner_select on public.member_invites;
create policy member_invites_planner_select on public.member_invites
for select to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists member_invites_planner_insert on public.member_invites;
create policy member_invites_planner_insert on public.member_invites
for insert to authenticated
with check (
  public.is_active_wedding_planner(wedding_id)
  and created_by = (select auth.uid())
  and role in ('groom', 'bride')
);

drop policy if exists member_invites_planner_delete on public.member_invites;
create policy member_invites_planner_delete on public.member_invites
for delete to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists day_notes_member_select on public.day_notes;
create policy day_notes_access_select on public.day_notes
for select to authenticated
using (public.can_access_wedding(wedding_id));

drop policy if exists day_notes_planner_write on public.day_notes;
create policy day_notes_planner_write on public.day_notes
for all to authenticated
using (public.is_active_wedding_planner(wedding_id))
with check (public.is_active_wedding_planner(wedding_id));

drop policy if exists week_notes_member_select on public.week_notes;
create policy week_notes_access_select on public.week_notes
for select to authenticated
using (public.can_access_wedding(wedding_id));

drop policy if exists week_notes_planner_write on public.week_notes;
create policy week_notes_planner_write on public.week_notes
for all to authenticated
using (public.is_active_wedding_planner(wedding_id))
with check (public.is_active_wedding_planner(wedding_id));

drop policy if exists vendor_categories_member_select on public.vendor_categories;
drop policy if exists vendor_categories_planner_select on public.vendor_categories;
create policy vendor_categories_planner_select on public.vendor_categories
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists vendor_categories_planner_write on public.vendor_categories;
create policy vendor_categories_planner_write on public.vendor_categories
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists vendors_member_select on public.vendors;
drop policy if exists vendors_planner_select on public.vendors;
create policy vendors_planner_select on public.vendors
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists vendors_planner_write on public.vendors;
create policy vendors_planner_write on public.vendors
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists vendor_photos_member_select on public.vendor_photos;
drop policy if exists vendor_photos_planner_select on public.vendor_photos;
create policy vendor_photos_planner_select on public.vendor_photos
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());

drop policy if exists vendor_photos_planner_write on public.vendor_photos;
create policy vendor_photos_planner_write on public.vendor_photos
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());

create policy wedding_vendor_selections_planner_select
on public.wedding_vendor_selections
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_wedding_planner(wedding_id));

create policy wedding_vendor_selections_planner_write
on public.wedding_vendor_selections
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_active_wedding_planner(wedding_id))
with check (planner_id = (select auth.uid()) and public.is_active_wedding_planner(wedding_id));

drop policy if exists vendor_media_member_read on storage.objects;
drop policy if exists vendor_media_planner_read on storage.objects;
create policy vendor_media_planner_read on storage.objects
for select to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));

drop policy if exists vendor_media_planner_insert on storage.objects;
create policy vendor_media_planner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));

drop policy if exists vendor_media_planner_update on storage.objects;
create policy vendor_media_planner_update on storage.objects
for update to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name))
with check (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));

drop policy if exists vendor_media_planner_delete on storage.objects;
create policy vendor_media_planner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));

grant select on public.wedding_members to authenticated;
grant select, insert, update, delete on public.wedding_vendor_selections to authenticated;
grant insert on public.weddings to authenticated;

revoke all on function public.is_platform_planner() from public;
revoke all on function public.is_active_wedding_planner(uuid) from public;
revoke all on function public.can_access_wedding(uuid) from public;
revoke all on function public.planner_can_view_profile(uuid) from public;
revoke all on function public.can_manage_vendor_storage(text) from public;
grant execute on function public.is_platform_planner() to authenticated;
grant execute on function public.is_active_wedding_planner(uuid) to authenticated;
grant execute on function public.can_access_wedding(uuid) to authenticated;
grant execute on function public.planner_can_view_profile(uuid) to authenticated;
grant execute on function public.can_manage_vendor_storage(text) to authenticated;

drop function if exists public.delete_wedding_member(uuid);
create or replace function public.delete_wedding_member(
  target_wedding_id uuid,
  target_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_wedding_planner(target_wedding_id) then
    raise exception 'Only the wedding planner can delete a member';
  end if;

  if not exists (
    select 1 from public.wedding_members
    where wedding_id = target_wedding_id
      and user_id = target_user_id
  ) then
    raise exception 'Wedding member was not found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

create or replace function public.create_wedding(
  p_groom_name text,
  p_bride_name text,
  p_wedding_date date,
  p_planner_name text default '관리자',
  p_color text default '#39756c'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_wedding_id uuid;
begin
  if not public.is_platform_planner() then
    raise exception 'Only a planner can create a wedding';
  end if;
  if nullif(trim(p_groom_name), '') is null
    or nullif(trim(p_bride_name), '') is null
    or p_wedding_date is null then
    raise exception 'Wedding names and date are required';
  end if;

  insert into public.weddings (
    groom_name, bride_name, wedding_date, planner_name, planner_id, color
  ) values (
    trim(p_groom_name), trim(p_bride_name), p_wedding_date,
    coalesce(nullif(trim(p_planner_name), ''), '관리자'),
    (select auth.uid()),
    case when p_color ~ '^#[0-9a-fA-F]{6}$' then p_color else '#39756c' end
  ) returning id into new_wedding_id;

  return new_wedding_id;
end;
$$;

revoke all on function public.delete_wedding_member(uuid, uuid) from public;
revoke all on function public.create_wedding(text, text, date, text, text) from public;
grant execute on function public.delete_wedding_member(uuid, uuid) to authenticated;
grant execute on function public.create_wedding(text, text, date, text, text) to authenticated;

create or replace function public.handle_invited_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.member_invites%rowtype;
  invite_token text;
begin
  invite_token := new.raw_user_meta_data ->> 'invite_token';
  if invite_token is null or invite_token = '' then
    raise exception 'A valid wedding invitation is required';
  end if;

  select * into invite
  from public.member_invites
  where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Wedding invitation is invalid or expired';
  end if;
  if lower(coalesce(new.email, '')) <> invite.login_id || '@marryday.app' then
    raise exception 'Wedding invitation does not match this login ID';
  end if;

  insert into public.profiles (id, wedding_id, login_id, role, display_name)
  values (new.id, invite.wedding_id, invite.login_id, invite.role, invite.display_name);

  if invite.role = 'planner' then
    update public.weddings
    set planner_id = new.id
    where id = invite.wedding_id and planner_id is null;
  else
    insert into public.wedding_members (wedding_id, user_id, role)
    values (invite.wedding_id, new.id, invite.role);
  end if;

  update public.member_invites set used_at = now() where id = invite.id;
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = new.id;
  return new;
end;
$$;

commit;
