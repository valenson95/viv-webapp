-- VIV Model Book — curated best-winner chart database with embedded setup-grade scorecards.
-- Members read PUBLISHED entries; admin (vc-lv@live.com) has full control. Idempotent.

create table if not exists public.model_book (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  pattern text not null default 'Breakout',          -- Breakout | EP | Pullback | U&R | HTF | Parabolic
  theme text,
  entry_date date,
  exit_date date,
  before_img text,                                    -- chart at/just before entry (Supabase storage public URL)
  after_img text,                                     -- outcome chart
  stars int not null default 0,                       -- base grade 0-5 (Setup Grader scale)
  elite jsonb not null default '[]'::jsonb,           -- elite-factor keys ticked (the 6★/7★ layer)
  ticked jsonb not null default '[]'::jsonb,          -- full Setup Grader checklist snapshot
  run_pct numeric,                                    -- resulting move % (the rally after entry)
  run_up_pct numeric,                                 -- prior run-up % INTO the base (the pole, from the chart info-line)
  angle numeric,                                      -- slope of the rally in degrees (from the chart info-line)
  characteristics jsonb not null default '[]'::jsonb, -- objective traits: ["3 tight days","ADR 6.1%","vol dry-up","gap +8%"]
  days_held int,
  r_mult numeric,
  thesis text,                                        -- why it was an A+ BEFORE the move
  lesson text,                                        -- what to learn AFTER
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists model_book_created_idx on public.model_book (created_at desc);
create index if not exists model_book_pattern_idx on public.model_book (pattern);

alter table public.model_book enable row level security;

drop policy if exists mb_read on public.model_book;
create policy mb_read on public.model_book for select to authenticated
  using (is_published or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists mb_insert_admin on public.model_book;
create policy mb_insert_admin on public.model_book for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists mb_update_admin on public.model_book;
create policy mb_update_admin on public.model_book for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists mb_delete_admin on public.model_book;
create policy mb_delete_admin on public.model_book for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- Safe re-run column adds (for projects that ran an earlier version of this file)
alter table public.model_book add column if not exists run_up_pct numeric;
alter table public.model_book add column if not exists angle numeric;
alter table public.model_book add column if not exists characteristics jsonb not null default '[]'::jsonb;
