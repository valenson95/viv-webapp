# Supabase schema — source-of-truth notes (project `ifahfxsqgmzyxcebslwe`)

⚠️ Only the SQL files in this folder are version-controlled (`feedback.sql`, `modelbook.sql`, `setup-grades.sql`).
The CORE tables below were created ad-hoc in the dashboard and live ONLY in the cloud — **known debt**: when the
Supabase CLI is re-authenticated (`supabase login` + `supabase link --project-ref ifahfxsqgmzyxcebslwe`), run
`supabase db pull` to snapshot them into `supabase/migrations/` as the real baseline.

## Core tables (reconstructed from code — verify against the dashboard before relying on details)
- **trades** — closed round-trips + partial trims. Key columns: `user_id, ticker, entry_date, entry_time, exit_date,
  exit_time, entry_price, exit_price, shares, stop_price` (LOCKED original — never overwrite), `current_stop_price`
  (trail), `stop_locked_at, needs_stop, setup, tags[], pl_pct, pl_dollar, r_mult, exit_reason, commission, notes,
  chart_url, chart_image, trade_type, source, ib_exec_id` (unique, partial index), `ib_trade_id, position_id,
  ai_review, rationale, is_deleted, grade_snapshot` (jsonb — added by setup-grades.sql).
- **positions** — open holdings: `user_id, symbol, shares, entry_price, current_price, stop_price` (locked original),
  `stop_price_2, trailing_stop, setup, tags, source, ib_conid, ib_synced_at, is_closed, entry_date, trade_type, rationale, chart_image`.
- **user_settings** — k/v per user (`setting_key`/`setting_value`), incl. `ibkr_token`, `ibkr_query_id`.
- **profiles** — display name etc. · **access_codes** — admin-managed invites.
- **ibkr_sync_state** — per-user `cutover_date`, `last_synced_at`, sync mode (cron opt-in).
- **claude_insights** — admin-only Jarvis payload (`user_id, payload, updated_at`). ⚠️ verify RLS is admin-locked
  (client only hides the UI).

## Version-controlled (run in SQL Editor, all idempotent)
- `feedback.sql` — feedback / feedback_votes / feedback_comments + RLS (admin email hardcoded 3×).
- `modelbook.sql` — model_book + RLS (members submit drafts; admin publishes).
- `setup-grades.sql` — setup_grades (per-user grade sync) + `trades.grade_snapshot` column.

## Storage
- Bucket **`trade-charts`** (public URLs): member chart uploads (`<uid>/…`), Model Book images
  (`modelbook/<uid>/…`, `modelbook/library/…`, `modelbook/seed/…`).

## Conventions
- Admin = `vc-lv@live.com` (hardcoded in RLS policies + `ADMIN_EMAIL` in App.jsx — centralize when refactoring).
- Ingest writes are idempotent on `ib_exec_id`, append-only, never touch a locked stop.
