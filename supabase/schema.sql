create extension if not exists pgcrypto with schema extensions;

create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  groom_name text not null default '신랑',
  bride_name text not null default '신부',
  wedding_date date not null default ((current_date + interval '1 year')::date),
  planner_name text not null default '관리자',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  login_id text not null unique,
  role text not null check (role in ('planner', 'groom', 'bride')),
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_login_id_format check (
    login_id = lower(login_id)
    and login_id ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
  )
);

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  login_id text not null,
  role text not null check (role in ('planner', 'groom', 'bride')),
  display_name text not null,
  token_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint member_invites_login_id_format check (
    login_id = lower(login_id)
    and login_id ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
  )
);

create table if not exists public.day_notes (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  note_date date not null,
  title text not null default '',
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, note_date)
);

create table if not exists public.week_notes (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  week_start date not null,
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, week_start)
);

create table if not exists public.vendor_categories (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null default '#6f716c',
  icon text not null default 'folder',
  locked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (wedding_id, id),
  unique (wedding_id, name)
);

create table if not exists public.vendors (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  id text not null,
  category_id text not null,
  name text not null,
  status text not null default '관심',
  favorite boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, id),
  foreign key (wedding_id, category_id)
    references public.vendor_categories(wedding_id, id)
    on update cascade on delete restrict
);

create table if not exists public.vendor_photos (
  wedding_id uuid not null,
  id text not null,
  vendor_id text not null,
  storage_path text not null unique,
  file_name text not null default 'photo.jpg',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (wedding_id, id),
  foreign key (wedding_id, vendor_id)
    references public.vendors(wedding_id, id)
    on delete cascade
);

create index if not exists day_notes_upcoming_idx
  on public.day_notes (wedding_id, note_date);
create index if not exists vendors_recent_idx
  on public.vendors (wedding_id, updated_at desc);
create index if not exists vendor_photos_vendor_idx
  on public.vendor_photos (wedding_id, vendor_id, sort_order);
create unique index if not exists member_invites_active_login_idx
  on public.member_invites (login_id)
  where used_at is null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weddings_touch_updated_at on public.weddings;
create trigger weddings_touch_updated_at
before update on public.weddings
for each row execute function public.touch_updated_at();

drop trigger if exists vendors_touch_updated_at on public.vendors;
create trigger vendors_touch_updated_at
before update on public.vendors
for each row execute function public.touch_updated_at();

create or replace function public.is_wedding_member(target_wedding_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and wedding_id = target_wedding_id
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
    select 1
    from public.profiles
    where id = (select auth.uid())
      and wedding_id = target_wedding_id
      and role = 'planner'
  );
$$;

create or replace function public.storage_wedding_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(object_name, '/', 1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

alter table public.weddings enable row level security;
alter table public.profiles enable row level security;
alter table public.member_invites enable row level security;
alter table public.day_notes enable row level security;
alter table public.week_notes enable row level security;
alter table public.vendor_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_photos enable row level security;

drop policy if exists weddings_member_select on public.weddings;
create policy weddings_member_select on public.weddings
for select to authenticated
using (public.is_wedding_member(id));

drop policy if exists weddings_planner_update on public.weddings;
create policy weddings_planner_update on public.weddings
for update to authenticated
using (public.is_wedding_planner(id))
with check (public.is_wedding_planner(id));

drop policy if exists profiles_member_select on public.profiles;
create policy profiles_member_select on public.profiles
for select to authenticated
using (public.is_wedding_member(wedding_id));

drop policy if exists profiles_planner_delete on public.profiles;
create policy profiles_planner_delete on public.profiles
for delete to authenticated
using (public.is_wedding_planner(wedding_id) and role <> 'planner');

drop policy if exists member_invites_planner_select on public.member_invites;
create policy member_invites_planner_select on public.member_invites
for select to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists member_invites_planner_insert on public.member_invites;
create policy member_invites_planner_insert on public.member_invites
for insert to authenticated
with check (
  public.is_wedding_planner(wedding_id)
  and created_by = (select auth.uid())
  and role in ('groom', 'bride')
);

drop policy if exists member_invites_planner_delete on public.member_invites;
create policy member_invites_planner_delete on public.member_invites
for delete to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists day_notes_member_select on public.day_notes;
create policy day_notes_member_select on public.day_notes
for select to authenticated
using (public.is_wedding_member(wedding_id));

drop policy if exists day_notes_planner_write on public.day_notes;
create policy day_notes_planner_write on public.day_notes
for all to authenticated
using (public.is_wedding_planner(wedding_id))
with check (public.is_wedding_planner(wedding_id));

drop policy if exists week_notes_member_select on public.week_notes;
create policy week_notes_member_select on public.week_notes
for select to authenticated
using (public.is_wedding_member(wedding_id));

drop policy if exists week_notes_planner_write on public.week_notes;
create policy week_notes_planner_write on public.week_notes
for all to authenticated
using (public.is_wedding_planner(wedding_id))
with check (public.is_wedding_planner(wedding_id));

drop policy if exists vendor_categories_member_select on public.vendor_categories;
drop policy if exists vendor_categories_planner_select on public.vendor_categories;
create policy vendor_categories_planner_select on public.vendor_categories
for select to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists vendor_categories_planner_write on public.vendor_categories;
create policy vendor_categories_planner_write on public.vendor_categories
for all to authenticated
using (public.is_wedding_planner(wedding_id))
with check (public.is_wedding_planner(wedding_id));

drop policy if exists vendors_member_select on public.vendors;
drop policy if exists vendors_planner_select on public.vendors;
create policy vendors_planner_select on public.vendors
for select to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists vendors_planner_write on public.vendors;
create policy vendors_planner_write on public.vendors
for all to authenticated
using (public.is_wedding_planner(wedding_id))
with check (public.is_wedding_planner(wedding_id));

drop policy if exists vendor_photos_member_select on public.vendor_photos;
drop policy if exists vendor_photos_planner_select on public.vendor_photos;
create policy vendor_photos_planner_select on public.vendor_photos
for select to authenticated
using (public.is_wedding_planner(wedding_id));

drop policy if exists vendor_photos_planner_write on public.vendor_photos;
create policy vendor_photos_planner_write on public.vendor_photos
for all to authenticated
using (public.is_wedding_planner(wedding_id))
with check (public.is_wedding_planner(wedding_id));

grant usage on schema public to authenticated;
grant select, update on public.weddings to authenticated;
grant select, delete on public.profiles to authenticated;
grant select, insert, delete on public.member_invites to authenticated;
grant select, insert, update, delete on public.day_notes to authenticated;
grant select, insert, update, delete on public.week_notes to authenticated;
grant select, insert, update, delete on public.vendor_categories to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.vendor_photos to authenticated;

revoke all on function public.is_wedding_member(uuid) from public;
revoke all on function public.is_wedding_planner(uuid) from public;
grant execute on function public.is_wedding_member(uuid) to authenticated;
grant execute on function public.is_wedding_planner(uuid) to authenticated;

create or replace function public.delete_wedding_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  planner_wedding_id uuid;
begin
  select wedding_id into planner_wedding_id
  from public.profiles
  where id = (select auth.uid())
    and role = 'planner';

  if planner_wedding_id is null then
    raise exception 'Only a planner can delete a member';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = target_user_id
      and wedding_id = planner_wedding_id
      and role in ('groom', 'bride')
  ) then
    raise exception 'Wedding member was not found';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.delete_wedding_member(uuid) from public;
grant execute on function public.delete_wedding_member(uuid) to authenticated;

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

  update public.member_invites
  set used_at = now()
  where id = invite.id;

  -- Invites are issued in-app, so synthetic login emails cannot receive mail.
  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
after insert on auth.users
for each row execute function public.handle_invited_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-media',
  'vendor-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vendor_media_member_read on storage.objects;
drop policy if exists vendor_media_planner_read on storage.objects;
create policy vendor_media_planner_read on storage.objects
for select to authenticated
using (
  bucket_id = 'vendor-media'
  and public.is_wedding_planner(public.storage_wedding_id(name))
);

drop policy if exists vendor_media_planner_insert on storage.objects;
create policy vendor_media_planner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'vendor-media'
  and public.is_wedding_planner(public.storage_wedding_id(name))
);

drop policy if exists vendor_media_planner_update on storage.objects;
create policy vendor_media_planner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'vendor-media'
  and public.is_wedding_planner(public.storage_wedding_id(name))
)
with check (
  bucket_id = 'vendor-media'
  and public.is_wedding_planner(public.storage_wedding_id(name))
);

drop policy if exists vendor_media_planner_delete on storage.objects;
create policy vendor_media_planner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'vendor-media'
  and public.is_wedding_planner(public.storage_wedding_id(name))
);

insert into public.weddings (
  id,
  groom_name,
  bride_name,
  wedding_date,
  planner_name
)
values (
  '11111111-1111-1111-1111-111111111111',
  '신랑',
  '신부',
  ((current_date + interval '1 year')::date),
  '관리자'
)
on conflict (id) do nothing;

insert into public.member_invites (
  wedding_id,
  login_id,
  role,
  display_name,
  token_hash,
  created_by,
  expires_at
)
values (
  '11111111-1111-1111-1111-111111111111',
  'admin',
  'planner',
  '관리자',
  '5244f7fa4ae535847d531a6fc489d9a469f89374a3c715717d1d2a6a484b629d',
  null,
  now() + interval '24 hours'
)
on conflict (token_hash) do nothing;
