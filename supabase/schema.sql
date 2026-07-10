create extension if not exists pgcrypto with schema extensions;

create table public.weddings (
  id uuid primary key default gen_random_uuid(),
  planner_id uuid references auth.users(id) on delete restrict,
  groom_name text not null default '신랑',
  bride_name text not null default '신부',
  wedding_date date not null default ((current_date + interval '1 year')::date),
  planner_name text not null default '관리자',
  color text not null default '#39756c' check (color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'active' check (status in ('active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planner_id, id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete set null,
  login_id text not null unique,
  role text not null check (role in ('planner', 'groom', 'bride')),
  display_name text not null,
  created_at timestamptz not null default now(),
  constraint profiles_login_id_format check (
    login_id = lower(login_id)
    and login_id ~ '^[a-z0-9][a-z0-9._-]{2,29}$'
  )
);

create table public.wedding_members (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('groom', 'bride')),
  created_at timestamptz not null default now(),
  primary key (wedding_id, user_id),
  unique (user_id),
  unique (wedding_id, role)
);

create table public.member_invites (
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

create table public.day_notes (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  note_date date not null,
  title text not null default '',
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, note_date)
);

create table public.week_notes (
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  week_start date not null,
  body text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, week_start)
);

create table public.vendor_categories (
  planner_id uuid not null references auth.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete set null,
  id text not null,
  name text not null,
  color text not null default '#6f716c',
  icon text not null default 'folder',
  locked boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (planner_id, id),
  unique (planner_id, name)
);

create table public.vendors (
  planner_id uuid not null references auth.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete set null,
  id text not null,
  category_id text not null,
  name text not null,
  status text not null default '관심',
  favorite boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (planner_id, id),
  foreign key (planner_id, category_id)
    references public.vendor_categories(planner_id, id)
    on update cascade on delete restrict
);

create table public.vendor_photos (
  planner_id uuid not null references auth.users(id) on delete cascade,
  wedding_id uuid references public.weddings(id) on delete set null,
  id text not null,
  vendor_id text not null,
  storage_path text not null unique,
  file_name text not null default 'photo.jpg',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (planner_id, id),
  foreign key (planner_id, vendor_id)
    references public.vendors(planner_id, id) on delete cascade
);

create table public.wedding_vendor_selections (
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

create index weddings_planner_status_date_idx
  on public.weddings (planner_id, status, wedding_date);
create index wedding_members_wedding_idx
  on public.wedding_members (wedding_id, role);
create unique index member_invites_active_login_idx
  on public.member_invites (login_id) where used_at is null;
create index day_notes_upcoming_idx
  on public.day_notes (wedding_id, note_date);
create index vendor_categories_planner_sort_idx
  on public.vendor_categories (planner_id, sort_order);
create index vendors_planner_recent_idx
  on public.vendors (planner_id, updated_at desc);
create index vendor_photos_planner_vendor_idx
  on public.vendor_photos (planner_id, vendor_id, sort_order);
create index wedding_vendor_selections_planner_idx
  on public.wedding_vendor_selections (planner_id, wedding_id, updated_at desc);

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger weddings_touch_updated_at
before update on public.weddings
for each row execute function public.touch_updated_at();
create trigger vendors_touch_updated_at
before update on public.vendors
for each row execute function public.touch_updated_at();
create trigger wedding_vendor_selections_touch_updated_at
before update on public.wedding_vendor_selections
for each row execute function public.touch_updated_at();

create function public.storage_wedding_id(object_name text)
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

create function public.is_platform_planner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'planner'
  );
$$;

create function public.is_wedding_planner(target_wedding_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.weddings
    where id = target_wedding_id and planner_id = (select auth.uid())
  );
$$;

create function public.is_active_wedding_planner(target_wedding_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.weddings
    where id = target_wedding_id
      and planner_id = (select auth.uid())
      and status = 'active'
  );
$$;

create function public.is_wedding_member(target_wedding_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.wedding_members
    where wedding_id = target_wedding_id and user_id = (select auth.uid())
  );
$$;

create function public.can_access_wedding(target_wedding_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_wedding_planner(target_wedding_id)
      or public.is_wedding_member(target_wedding_id);
$$;

create function public.planner_can_view_profile(target_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
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

create function public.can_manage_vendor_storage(object_name text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_platform_planner()
    and (
      public.storage_wedding_id(object_name) = (select auth.uid())
      or public.is_wedding_planner(public.storage_wedding_id(object_name))
    );
$$;

alter table public.weddings enable row level security;
alter table public.profiles enable row level security;
alter table public.wedding_members enable row level security;
alter table public.member_invites enable row level security;
alter table public.day_notes enable row level security;
alter table public.week_notes enable row level security;
alter table public.vendor_categories enable row level security;
alter table public.vendors enable row level security;
alter table public.vendor_photos enable row level security;
alter table public.wedding_vendor_selections enable row level security;

create policy weddings_access_select on public.weddings
for select to authenticated using (public.can_access_wedding(id));
create policy weddings_planner_insert on public.weddings
for insert to authenticated
with check (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy weddings_planner_update on public.weddings
for update to authenticated
using (public.is_wedding_planner(id))
with check (planner_id = (select auth.uid()));

create policy profiles_scoped_select on public.profiles
for select to authenticated using (public.planner_can_view_profile(id));
create policy wedding_members_scoped_select on public.wedding_members
for select to authenticated
using (user_id = (select auth.uid()) or public.is_wedding_planner(wedding_id));

create policy member_invites_planner_select on public.member_invites
for select to authenticated using (public.is_wedding_planner(wedding_id));
create policy member_invites_planner_insert on public.member_invites
for insert to authenticated
with check (
  public.is_active_wedding_planner(wedding_id)
  and created_by = (select auth.uid())
  and role in ('groom', 'bride')
);
create policy member_invites_planner_delete on public.member_invites
for delete to authenticated using (public.is_wedding_planner(wedding_id));

create policy day_notes_access_select on public.day_notes
for select to authenticated using (public.can_access_wedding(wedding_id));
create policy day_notes_planner_write on public.day_notes
for all to authenticated
using (public.is_active_wedding_planner(wedding_id))
with check (public.is_active_wedding_planner(wedding_id));
create policy week_notes_access_select on public.week_notes
for select to authenticated using (public.can_access_wedding(wedding_id));
create policy week_notes_planner_write on public.week_notes
for all to authenticated
using (public.is_active_wedding_planner(wedding_id))
with check (public.is_active_wedding_planner(wedding_id));

create policy vendor_categories_planner_select on public.vendor_categories
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy vendor_categories_planner_write on public.vendor_categories
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy vendors_planner_select on public.vendors
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy vendors_planner_write on public.vendors
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy vendor_photos_planner_select on public.vendor_photos
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy vendor_photos_planner_write on public.vendor_photos
for all to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner())
with check (planner_id = (select auth.uid()) and public.is_platform_planner());
create policy wedding_vendor_selections_planner_select
on public.wedding_vendor_selections for select to authenticated
using (planner_id = (select auth.uid()) and public.is_wedding_planner(wedding_id));
create policy wedding_vendor_selections_planner_write
on public.wedding_vendor_selections for all to authenticated
using (planner_id = (select auth.uid()) and public.is_active_wedding_planner(wedding_id))
with check (planner_id = (select auth.uid()) and public.is_active_wedding_planner(wedding_id));

grant usage on schema public to authenticated;
grant select, insert, update on public.weddings to authenticated;
grant select on public.profiles to authenticated;
grant select on public.wedding_members to authenticated;
grant select, insert, delete on public.member_invites to authenticated;
grant select, insert, update, delete on public.day_notes to authenticated;
grant select, insert, update, delete on public.week_notes to authenticated;
grant select, insert, update, delete on public.vendor_categories to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.vendor_photos to authenticated;
grant select, insert, update, delete on public.wedding_vendor_selections to authenticated;

revoke all on function public.is_platform_planner() from public;
revoke all on function public.is_wedding_planner(uuid) from public;
revoke all on function public.is_active_wedding_planner(uuid) from public;
revoke all on function public.is_wedding_member(uuid) from public;
revoke all on function public.can_access_wedding(uuid) from public;
revoke all on function public.planner_can_view_profile(uuid) from public;
revoke all on function public.can_manage_vendor_storage(text) from public;
grant execute on function public.is_platform_planner() to authenticated;
grant execute on function public.is_wedding_planner(uuid) to authenticated;
grant execute on function public.is_active_wedding_planner(uuid) to authenticated;
grant execute on function public.is_wedding_member(uuid) to authenticated;
grant execute on function public.can_access_wedding(uuid) to authenticated;
grant execute on function public.planner_can_view_profile(uuid) to authenticated;
grant execute on function public.can_manage_vendor_storage(text) to authenticated;

create function public.create_wedding(
  p_groom_name text,
  p_bride_name text,
  p_wedding_date date,
  p_planner_name text default '관리자',
  p_color text default '#39756c'
)
returns uuid
language plpgsql security definer set search_path = ''
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

create function public.delete_wedding_member(
  target_wedding_id uuid,
  target_user_id uuid
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_wedding_planner(target_wedding_id) then
    raise exception 'Only the wedding planner can delete a member';
  end if;
  if not exists (
    select 1 from public.wedding_members
    where wedding_id = target_wedding_id and user_id = target_user_id
  ) then
    raise exception 'Wedding member was not found';
  end if;
  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.create_wedding(text, text, date, text, text) from public;
revoke all on function public.delete_wedding_member(uuid, uuid) from public;
grant execute on function public.create_wedding(text, text, date, text, text) to authenticated;
grant execute on function public.delete_wedding_member(uuid, uuid) to authenticated;

create function public.handle_invited_user()
returns trigger
language plpgsql security definer set search_path = ''
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
    and used_at is null and expires_at > now()
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

create trigger on_auth_user_invited
after insert on auth.users
for each row execute function public.handle_invited_user();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendor-media', 'vendor-media', false, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy vendor_media_planner_read on storage.objects
for select to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));
create policy vendor_media_planner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));
create policy vendor_media_planner_update on storage.objects
for update to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name))
with check (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));
create policy vendor_media_planner_delete on storage.objects
for delete to authenticated
using (bucket_id = 'vendor-media' and public.can_manage_vendor_storage(name));

insert into public.weddings (
  id, groom_name, bride_name, wedding_date, planner_name, color
) values (
  '11111111-1111-1111-1111-111111111111',
  '신랑', '신부', ((current_date + interval '1 year')::date), '관리자', '#39756c'
);

insert into public.member_invites (
  wedding_id, login_id, role, display_name, token_hash, created_by, expires_at
) values (
  '11111111-1111-1111-1111-111111111111',
  'admin', 'planner', '관리자',
  '5244f7fa4ae535847d531a6fc489d9a469f89374a3c715717d1d2a6a484b629d',
  null, now() + interval '24 hours'
);
