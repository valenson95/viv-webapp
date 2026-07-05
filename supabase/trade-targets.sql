-- OPTIONAL: cross-device persistence for the TradeZella-style planning inputs on trade
-- details (Profit Target / planned Stop Loss). Without these columns the inputs still
-- work — they live in the browser's localStorage. Idempotent; run once in the SQL Editor.
-- NOTE: planned_stop is a PLANNING value only — the locked original stop_price is untouched.

alter table public.trades add column if not exists profit_target numeric;
alter table public.trades add column if not exists planned_stop numeric;
