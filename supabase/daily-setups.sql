-- VIV Daily Setups — the daily annotated-setup feed (replaces manual Skool screenshot/overlay posts).
-- Valen grades a chart in the Setup Grader → hits "Publish to members" → it lands here.
-- Members: READ published rows only. Admin (vc-lv@live.com): full control. Idempotent — safe to re-run.

create table if not exists public.daily_setups (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  trade_date date not null default current_date,     -- the day the idea is for
  sector text,                                       -- DeepVue grouping (from the chart annotation, never AI-guessed)
  stars int not null default 0,                      -- computed from ticked (Setup Grader formula) at publish
  letter text,
  pct numeric,
  star_hit int,
  starmakers int,
  ticked jsonb not null default '[]'::jsonb,         -- Setup Grader "si-ii" keys
  auto jsonb not null default '[]'::jsonb,           -- gold-dot subset of ticked: AI-read off the chart, pending Valen's eye
  note text,                                         -- the annotation / why it's on the list
  chart_img text,                                    -- storage public URL (trade-charts bucket, daily-setups/ prefix)
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists daily_setups_date_idx on public.daily_setups (trade_date desc, created_at desc);

alter table public.daily_setups enable row level security;

-- READ: members see published; admin sees everything (drafts included)
drop policy if exists ds_read on public.daily_setups;
create policy ds_read on public.daily_setups for select to authenticated
  using (is_published or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- WRITE: admin only — this feed is curated, members never post to it
drop policy if exists ds_insert on public.daily_setups;
create policy ds_insert on public.daily_setups for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists ds_update on public.daily_setups;
create policy ds_update on public.daily_setups for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists ds_delete on public.daily_setups;
create policy ds_delete on public.daily_setups for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- Gold-dot support on the Setup Grader itself: which ticks were auto-filled by VIV
-- (clearing happens client-side the moment a human toggles the tick).
alter table public.setup_grades add column if not exists auto jsonb not null default '[]'::jsonb;

-- 2026-07-06: setup segmentation (Breakout / Pullback — mirrors the Daily Trade Ideas folders)
alter table public.daily_setups add column if not exists setup_type text;
