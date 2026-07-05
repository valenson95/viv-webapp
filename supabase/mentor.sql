-- MENTOR MODE (admin-only preview) — run once in the SQL Editor. Idempotent.
-- 1) Lets the ADMIN read every member's trades (members still see only their own).
-- 2) mentor_notes: annotations on a member / a specific trade. Hidden from members
--    by default (visible_to_member=false) until mentorship launches.

-- Admin read-all on trades (additive — existing own-rows policies keep working)
drop policy if exists trades_admin_read on public.trades;
create policy trades_admin_read on public.trades for select to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

create table if not exists public.mentor_notes (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  trade_id text,                            -- optional: ties the note to one trade
  body text not null,
  visible_to_member boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.mentor_notes enable row level security;

drop policy if exists mn_admin_all on public.mentor_notes;
create policy mn_admin_all on public.mentor_notes for all to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com')
  with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

drop policy if exists mn_member_read on public.mentor_notes;
create policy mn_member_read on public.mentor_notes for select to authenticated
  using (member_id = auth.uid() and visible_to_member = true);
