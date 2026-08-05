-- ════════════════════════════════════════════════════════════════
-- 🎯 WATCHLIST FLAGS — run ONCE in Supabase → SQL Editor.
--
-- Backs the TradingView-style colour flags on the 🎯 Watchlist card (Dashboard).
-- One row per ticker. Members READ the flags; ONLY the admin may set/change/clear them.
-- Admin = vc-lv@live.com (change the email in the 3 write policies if it ever changes).
--
-- DEPLOY-SAFE: the app probes this table on mount. Until this file is run the card still
-- renders — every flag shows as an empty outline and the editor is disabled. Nothing crashes.
--
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.watchlist_flags (
  ticker     text primary key,                            -- upper-case symbol, e.g. 'NVDA'
  color      text not null,                               -- hex from the card's palette, e.g. '#f23645'
  updated_at timestamptz not null default now()
);

alter table public.watchlist_flags enable row level security;

-- ── READ: any signed-in member ────────────────────────────────
drop policy if exists watchlist_flags_read on public.watchlist_flags;
create policy watchlist_flags_read on public.watchlist_flags for select to authenticated using (true);

-- ── WRITE: admin only ─────────────────────────────────────────
drop policy if exists watchlist_flags_insert_admin on public.watchlist_flags;
create policy watchlist_flags_insert_admin on public.watchlist_flags for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists watchlist_flags_update_admin on public.watchlist_flags;
create policy watchlist_flags_update_admin on public.watchlist_flags for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists watchlist_flags_delete_admin on public.watchlist_flags;
create policy watchlist_flags_delete_admin on public.watchlist_flags for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com');
