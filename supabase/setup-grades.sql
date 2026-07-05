-- Setup Grader grades → Supabase (cross-device + honest per-trade snapshots). Idempotent.
-- Run once in the SQL Editor. The webapp keeps localStorage as an offline cache and syncs through this table.

create table if not exists public.setup_grades (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  stars int not null default 0,
  letter text,
  pct numeric,
  star_hit int,
  starmakers int,
  ticked jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.setup_grades enable row level security;

drop policy if exists sg_all_own on public.setup_grades;
create policy sg_all_own on public.setup_grades for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Per-trade grade snapshot: freezes the symbol's grade onto the trade so later re-grades
-- never rewrite history (drives the grade-vs-outcome analytics).
alter table public.trades add column if not exists grade_snapshot jsonb;
