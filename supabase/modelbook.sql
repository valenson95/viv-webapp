-- VIV Model Book — best-setups database with embedded Setup-Grader scorecards. Idempotent.
-- Members: read PUBLISHED + manage their OWN drafts (submissions). Admin (vc-lv@live.com): full control + publishing.

create table if not exists public.model_book (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  pattern text not null default 'Trendline Breakout', -- Trendline Breakout | Pullback Buy | Episodic Pivot | VCP
  theme text,
  entry_date date,
  exit_date date,
  before_img text,                                    -- chart at/just before entry (storage public URL)
  after_img text,                                     -- outcome chart
  stars int not null default 0,                       -- COMPUTED from ticked (Setup Grader formula) at save
  elite jsonb not null default '[]'::jsonb,           -- elite-factor keys (the 6★/7★ layer, non-overlapping with grader)
  ticked jsonb not null default '[]'::jsonb,          -- the Setup Grader checklist ticks ("si-ii" keys)
  outcome text,                                       -- Huge Winner | Winner | Subpar | Loser
  run_pct numeric,                                    -- rally % after entry
  run_up_pct numeric,                                 -- prior run-up % INTO the base (pole, from chart info-line)
  angle numeric,                                      -- rally slope in degrees (info-line)
  characteristics jsonb not null default '[]'::jsonb, -- objective traits: ["3 tight days","ADR 6.1%","vol dry-up −60%"]
  metrics jsonb not null default '{}'::jsonb,         -- in-depth numeric layer (AI-extracted during backtesting)
  days_held int,
  r_mult numeric,
  thesis text,
  lesson text,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists model_book_created_idx on public.model_book (created_at desc);
create index if not exists model_book_pattern_idx on public.model_book (pattern);

-- Safe re-run column adds (for projects that ran an earlier version)
alter table public.model_book add column if not exists run_up_pct numeric;
alter table public.model_book add column if not exists angle numeric;
alter table public.model_book add column if not exists characteristics jsonb not null default '[]'::jsonb;
alter table public.model_book add column if not exists metrics jsonb not null default '{}'::jsonb;
alter table public.model_book add column if not exists outcome text;

alter table public.model_book enable row level security;

-- READ: published entries + your own drafts; admin sees all
drop policy if exists mb_read on public.model_book;
create policy mb_read on public.model_book for select to authenticated
  using (is_published or created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- INSERT: anyone may SUBMIT their own entry, but only admin can create it already-published
drop policy if exists mb_insert_admin on public.model_book;
drop policy if exists mb_insert on public.model_book;
create policy mb_insert on public.model_book for insert to authenticated
  with check (created_by = auth.uid() and (is_published = false or (auth.jwt() ->> 'email') = 'vc-lv@live.com'));

-- UPDATE: own drafts (cannot self-publish); admin anything (incl. publishing)
drop policy if exists mb_update_admin on public.model_book;
drop policy if exists mb_update on public.model_book;
create policy mb_update on public.model_book for update to authenticated
  using (created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check ((created_by = auth.uid() and is_published = false) or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- DELETE: own entries; admin any
drop policy if exists mb_delete_admin on public.model_book;
drop policy if exists mb_delete on public.model_book;
create policy mb_delete on public.model_book for delete to authenticated
  using (created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com');
