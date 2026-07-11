-- ═══════════════════════════════════════════════════════════════════════════
-- JOURNAL DATA-INTEGRITY PROTECTIONS (2026-07-10, after the self-import incident)
-- Run once in Supabase Studio → SQL Editor. Idempotent (safe to re-run).
--
-- 1) LOCKED ORIGINAL STOP: positions.stop_price can be SET once (from empty) but
--    NEVER CHANGED to a different non-empty value by anyone — app, script, or
--    import. Trailing stops belong in trailing_stop. This makes "my original
--    stop got altered" structurally impossible at the database layer.
--    (Clearing back to empty stays allowed so a genuine typo can be fixed:
--    clear first, then set — a deliberate two-step, never a silent overwrite.)
--
-- 2) NO DUPLICATE IBKR EXECUTIONS: one (user, ib_exec_id) can exist only once
--    among live rows — a re-import of the same fill is rejected by the DB
--    itself instead of relying on application dedupe.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) stop_price lock ---------------------------------------------------------
create or replace function public.protect_original_stop()
returns trigger language plpgsql as $$
begin
  if coalesce(old.stop_price,'') <> ''                    -- an original stop exists
     and coalesce(new.stop_price,'') <> ''                -- and it's being replaced (not cleared)
     and new.stop_price is distinct from old.stop_price   -- with a DIFFERENT value
  then
    raise exception 'positions.stop_price is the LOCKED original stop (drives R). To trail, write trailing_stop. To correct a typo: clear it first, then set the new value.';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_original_stop on public.positions;
create trigger trg_protect_original_stop
  before update of stop_price on public.positions
  for each row execute function public.protect_original_stop();

-- 2) unique live IBKR execution per user -------------------------------------
-- Partial unique index: applies only to live (not deleted/sample) rows with an exec id.
create unique index if not exists uq_trades_user_exec_live
  on public.trades (user_id, ib_exec_id)
  where ib_exec_id is not null and is_deleted = false and is_sample = false;
