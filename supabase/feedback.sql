-- ════════════════════════════════════════════════════════════════
-- VIV Community Feedback — run ONCE in Supabase → SQL Editor.
-- Creates feedback / feedback_votes / feedback_comments + RLS.
-- Admin = vc-lv@live.com (change the email in the 3 policies if it changes).
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Member',
  category text not null default 'Suggestion',
  body text not null,
  status text not null default 'open',            -- 'open' | 'resolved'
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.feedback_votes (
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (feedback_id, user_id)
);

create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null default 'Member',
  body text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_comments_fid_idx on public.feedback_comments (feedback_id);

alter table public.feedback enable row level security;
alter table public.feedback_votes enable row level security;
alter table public.feedback_comments enable row level security;

-- ── feedback ──
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (true);

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (auth.uid() = user_id);

-- Only admin may update (i.e. mark resolved / reopen)
drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback for update to authenticated
  using ((auth.jwt() ->> 'email') = 'vc-lv@live.com') with check ((auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- Author deletes own; admin deletes any
drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'vc-lv@live.com');

-- ── votes ──
drop policy if exists votes_read on public.feedback_votes;
create policy votes_read on public.feedback_votes for select to authenticated using (true);

drop policy if exists votes_insert on public.feedback_votes;
create policy votes_insert on public.feedback_votes for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists votes_delete on public.feedback_votes;
create policy votes_delete on public.feedback_votes for delete to authenticated using (auth.uid() = user_id);

-- ── comments ──
drop policy if exists comments_read on public.feedback_comments;
create policy comments_read on public.feedback_comments for select to authenticated using (true);

-- Post own comment; only admin may set is_admin = true (prevents spoofing the TEAM badge)
drop policy if exists comments_insert on public.feedback_comments;
create policy comments_insert on public.feedback_comments for insert to authenticated
  with check (auth.uid() = user_id and (is_admin = false or (auth.jwt() ->> 'email') = 'vc-lv@live.com'));

drop policy if exists comments_delete on public.feedback_comments;
create policy comments_delete on public.feedback_comments for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'vc-lv@live.com');
