create table if not exists public.calendar_integrations (
  planner_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider = 'google'),
  calendar_id text not null default '',
  calendar_name text not null default 'Marryday Planner',
  enabled boolean not null default false,
  last_sync_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_event_links (
  planner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('day_note', 'wedding_date')),
  wedding_id uuid not null,
  source_key text not null,
  google_event_id text not null,
  payload_hash text not null default '',
  sync_status text not null default 'synced' check (sync_status in ('synced', 'error')),
  last_error text not null default '',
  synced_at timestamptz not null default now(),
  primary key (planner_id, source_type, wedding_id, source_key),
  unique (planner_id, google_event_id)
);

create table if not exists public.calendar_sync_queue (
  id bigint generated always as identity primary key,
  planner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('day_note', 'wedding_date')),
  wedding_id uuid not null,
  source_key text not null,
  operation text not null default 'upsert' check (operation in ('upsert', 'delete')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planner_id, source_type, wedding_id, source_key)
);

create index if not exists calendar_sync_queue_due_idx
  on public.calendar_sync_queue (next_attempt_at, planner_id)
  where locked_at is null;
create index if not exists calendar_event_links_wedding_idx
  on public.calendar_event_links (planner_id, wedding_id);

drop trigger if exists calendar_integrations_touch_updated_at on public.calendar_integrations;
create trigger calendar_integrations_touch_updated_at
before update on public.calendar_integrations
for each row execute function public.touch_updated_at();

drop trigger if exists calendar_sync_queue_touch_updated_at on public.calendar_sync_queue;
create trigger calendar_sync_queue_touch_updated_at
before update on public.calendar_sync_queue
for each row execute function public.touch_updated_at();

create or replace function public.upsert_calendar_sync_job(
  target_planner_id uuid,
  target_source_type text,
  target_wedding_id uuid,
  target_source_key text,
  target_operation text,
  target_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_planner_id is null
    or target_source_type not in ('day_note', 'wedding_date')
    or target_wedding_id is null
    or nullif(target_source_key, '') is null
    or target_operation not in ('upsert', 'delete') then
    return;
  end if;

  insert into public.calendar_sync_queue (
    planner_id, source_type, wedding_id, source_key, operation, payload,
    attempts, next_attempt_at, locked_at, last_error
  ) values (
    target_planner_id, target_source_type, target_wedding_id,
    target_source_key, target_operation, coalesce(target_payload, '{}'::jsonb),
    0, now(), null, ''
  )
  on conflict (planner_id, source_type, wedding_id, source_key)
  do update set
    operation = excluded.operation,
    payload = excluded.payload,
    attempts = 0,
    next_attempt_at = now(),
    locked_at = null,
    last_error = '';
end;
$$;

create or replace function public.queue_day_note_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.day_notes%rowtype;
  target_planner_id uuid;
begin
  if tg_op = 'DELETE' then target_note := old; else target_note := new; end if;
  select wedding.planner_id into target_planner_id
  from public.weddings as wedding
  where wedding.id = target_note.wedding_id;

  if target_planner_id is null or not exists (
    select 1 from public.calendar_integrations as integration
    where integration.planner_id = target_planner_id and integration.enabled
  ) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  perform public.upsert_calendar_sync_job(
    target_planner_id,
    'day_note',
    target_note.wedding_id,
    target_note.note_date::text,
    case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
    jsonb_build_object('note_date', target_note.note_date)
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.queue_wedding_calendar_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  note_record record;
  link_record record;
  metadata_changed boolean := false;
  reactivated boolean := false;
begin
  if tg_op = 'DELETE' then
    for link_record in
      select source_type, wedding_id, source_key
      from public.calendar_event_links
      where planner_id = old.planner_id and wedding_id = old.id
    loop
      perform public.upsert_calendar_sync_job(
        old.planner_id,
        link_record.source_type,
        link_record.wedding_id,
        link_record.source_key,
        'delete',
        '{}'::jsonb
      );
    end loop;
    return old;
  end if;

  if new.planner_id is null or not exists (
    select 1 from public.calendar_integrations as integration
    where integration.planner_id = new.planner_id and integration.enabled
  ) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' then
      perform public.upsert_calendar_sync_job(
        new.planner_id, 'wedding_date', new.id, 'wedding-date', 'upsert', '{}'::jsonb
      );
    end if;
    return new;
  end if;

  metadata_changed := old.groom_name is distinct from new.groom_name
    or old.bride_name is distinct from new.bride_name
    or old.wedding_date is distinct from new.wedding_date
    or old.planner_name is distinct from new.planner_name
    or old.color is distinct from new.color;
  reactivated := old.status = 'completed' and new.status = 'active';

  if metadata_changed or reactivated then
    perform public.upsert_calendar_sync_job(
      new.planner_id, 'wedding_date', new.id, 'wedding-date', 'upsert', '{}'::jsonb
    );
    for note_record in
      select note_date from public.day_notes where wedding_id = new.id
    loop
      perform public.upsert_calendar_sync_job(
        new.planner_id,
        'day_note',
        new.id,
        note_record.note_date::text,
        'upsert',
        jsonb_build_object('note_date', note_record.note_date)
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists day_notes_calendar_sync on public.day_notes;
create trigger day_notes_calendar_sync
after insert or update or delete on public.day_notes
for each row execute function public.queue_day_note_calendar_sync();

drop trigger if exists weddings_calendar_sync on public.weddings;
create trigger weddings_calendar_sync
after insert or update or delete on public.weddings
for each row execute function public.queue_wedding_calendar_sync();

alter table public.calendar_integrations enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.calendar_sync_queue enable row level security;

drop policy if exists calendar_integrations_planner_select on public.calendar_integrations;
create policy calendar_integrations_planner_select on public.calendar_integrations
for select to authenticated
using (planner_id = (select auth.uid()) and public.is_platform_planner());

revoke all on public.calendar_integrations from anon, authenticated;
revoke all on public.calendar_event_links from anon, authenticated;
revoke all on public.calendar_sync_queue from anon, authenticated;
grant select on public.calendar_integrations to authenticated;
grant all on public.calendar_integrations to service_role;
grant all on public.calendar_event_links to service_role;
grant all on public.calendar_sync_queue to service_role;
grant select on public.weddings, public.day_notes to service_role;
grant usage, select on sequence public.calendar_sync_queue_id_seq to service_role;

revoke all on function public.upsert_calendar_sync_job(uuid, text, uuid, text, text, jsonb) from public;
revoke all on function public.queue_day_note_calendar_sync() from public;
revoke all on function public.queue_wedding_calendar_sync() from public;
