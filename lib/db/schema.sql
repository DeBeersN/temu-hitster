-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- One row per game room. The whole game state lives in `state` (jsonb) and is
-- synced to every player's device via Supabase Realtime.

create table if not exists public.games (
  code        text primary key,           -- short room code, e.g. "PLUM"
  state       jsonb not null,             -- full GameState snapshot
  updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_touch_updated_at on public.games;
create trigger games_touch_updated_at
  before update on public.games
  for each row execute function public.touch_updated_at();

-- Realtime: broadcast row changes to subscribers. Guarded so re-running the
-- whole script doesn't error with "already member of publication".
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'games'
  ) then
    alter publication supabase_realtime add table public.games;
  end if;
end $$;

-- This is a local party game, not a fortress. RLS is on but policies are open
-- so anyone with the anon key (i.e. anyone in the game) can read/write rooms.
-- The room code is the only "secret". Tighten later if you ever go public.
alter table public.games enable row level security;

drop policy if exists games_all_access on public.games;
create policy games_all_access on public.games
  for all using (true) with check (true);

-- RLS controls which *rows* a role sees; Postgres still needs table-level
-- GRANTs. Newer Supabase projects don't auto-grant these to anon, so do it here.
grant select, insert, update, delete on public.games to anon, authenticated;
