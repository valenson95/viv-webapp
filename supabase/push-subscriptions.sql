-- ════════════════════════════════════════════════════════════════
-- VIV Web Push — run ONCE in Supabase → SQL Editor (project ifahfxsqgmzyxcebslwe).
-- Creates push_subscriptions + RLS. Idempotent: safe to re-run.
--
-- Model: each browser/device the member enables notifications on writes ONE row
-- keyed by its push `endpoint` (the unique per-device URL the browser hands us).
-- Members may only touch their OWN rows. Nobody reads the table with the anon key —
-- scripts/send-push.mjs reads it with the service_role key, which bypasses RLS.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  sub jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ── Members write only their own device rows. No SELECT policy on purpose:
--    with RLS on and no select policy, the anon/authenticated key can read nothing.
--    (The client never needs to read — it upserts on enable, deletes on disable.)
drop policy if exists push_subs_insert on public.push_subscriptions;
create policy push_subs_insert on public.push_subscriptions
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists push_subs_update on public.push_subscriptions;
create policy push_subs_update on public.push_subscriptions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists push_subs_delete on public.push_subscriptions;
create policy push_subs_delete on public.push_subscriptions
  for delete to authenticated
  using (auth.uid() = user_id);

-- ── Why an upsert still needs a narrow SELECT ──────────────────────────────
-- PostgREST resolves `upsert(..., onConflict: 'endpoint')` to
-- INSERT … ON CONFLICT DO UPDATE, which only needs INSERT + UPDATE — the two
-- policies above. The client asks for no representation back (`returning:
-- 'minimal'` in src/push.js), so no SELECT policy is required. If a future
-- change wants the row echoed back, add:
--   create policy push_subs_select on public.push_subscriptions
--     for select to authenticated using (auth.uid() = user_id);
