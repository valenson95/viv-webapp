-- ═══════════════════════════════════════════════════════════════════════════════
-- Member Deep Dives + Demo Trades — 2026-08-03. Idempotent; safe to re-run.
-- Paste into Supabase SQL editor (project ifahfxsqgmzyxcebslwe) and Run.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · MEMBER DEEP DIVES ─────────────────────────────────────────────────────
-- A member turns their Study-Book project (or whole book, project='*') into a
-- Deep Dive rendered through the SAME typeset template as the VIV dives.
-- Self-serve: the member flips is_live themselves — no admin review gate
-- (Valen 2026-08-03: "it's for their own purposes... they can publish live").
-- model_book's own publish invariant is UNTOUCHED: members still cannot set
-- is_published. Community visibility flows ONLY through this table (policy below).

create table if not exists public.member_dives (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  project text not null,                    -- matches metrics->study->>project on their rows; '*' = whole book
  title text not null,
  premise text,
  author_name text,                         -- denormalized at save (no profiles-RLS dependency)
  is_live boolean not null default false,   -- member-controlled publish switch
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, project)
);

alter table public.member_dives enable row level security;

drop policy if exists md_read on public.member_dives;
create policy md_read on public.member_dives for select to authenticated
  using (is_live or created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists md_insert on public.member_dives;
create policy md_insert on public.member_dives for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists md_update on public.member_dives;
create policy md_update on public.member_dives for update to authenticated
  using (created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check (created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists md_delete on public.member_dives;
create policy md_delete on public.member_dives for delete to authenticated
  using (created_by = auth.uid() or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- Community read-through on model_book: a member's study rows are readable by
-- all authenticated members ONLY while a LIVE dive of theirs covers them.
-- Flipping the dive off instantly re-hides the rows. is_published stays admin-only.
drop policy if exists mb_read_community on public.model_book;
create policy mb_read_community on public.model_book for select to authenticated
  using (exists (
    select 1 from public.member_dives d
    where d.created_by = model_book.created_by
      and d.is_live
      and (d.project = '*' or d.project = (model_book.metrics -> 'study' ->> 'project'))
  ));

-- ── 2 · DEMO TRADES ───────────────────────────────────────────────────────────
-- One flag, strict walls (Valen 2026-08-03: separate demo lens).
-- Default false ⇒ zero change to any existing member row (deploys never touch
-- member data). IBKR ingest never sets it — demo rows are always manual.

alter table public.positions add column if not exists is_demo boolean not null default false;
alter table public.trades    add column if not exists is_demo boolean not null default false;

create index if not exists positions_demo_idx on public.positions (user_id, is_demo);
create index if not exists trades_demo_idx    on public.trades    (user_id, is_demo);


-- ── 3 · MEMBER DIVE CUSTOMISATION (2026-08-03 evening — his picks: tick studies · named
--        chapters · opening page · hide notes). Code is deploy-safe: the modal probes these
--        columns and only shows the new sections once they exist.
alter table public.member_dives add column if not exists selected_ids jsonb;   -- ["<model_book uuid>", ...] — ticked studies; null = project/whole-book rule
alter table public.member_dives add column if not exists chapters     jsonb;   -- {"2026": "My first month", ...} — year → chapter label
alter table public.member_dives add column if not exists intro        text;    -- opening page, their words
alter table public.member_dives add column if not exists hide_notes   boolean not null default false;

-- ── 4 · MEMBER HYPOTHESES (2026-08-04, JH: "ability to add our own new hypotheses to test").
--        Plain list of claim strings, printed on the "Working hypotheses" page of their dive.
--        Deploy-safe: the modal probes this column and hides the section until the SQL runs.
alter table public.member_dives add column if not exists hypotheses jsonb;  -- ["claim", ...]


-- Visibility follows the TICKED set exactly when one exists; falls back to the project rule.
drop policy if exists mb_read_community on public.model_book;
create policy mb_read_community on public.model_book for select to authenticated
  using (exists (
    select 1 from public.member_dives d
    where d.created_by = model_book.created_by
      and d.is_live
      and (
        case when d.selected_ids is not null and jsonb_typeof(d.selected_ids) = 'array'
             then d.selected_ids ? model_book.id::text
             else (d.project = '*' or d.project = (model_book.metrics -> 'study' ->> 'project'))
        end
      )
  ));
