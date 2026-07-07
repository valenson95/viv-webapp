-- Extension metric (ATR% Multiple from 50-MA) — insight columns, 2026-07-07.
-- Nullable, additive-only: touches no existing data, invisible in UI until populated.
-- Convention = DeepVue/TradingView "ATR% Multiple from 50-MA": ((P − SMA50) / SMA50) ÷ (ATR14 / P).
alter table trades    add column if not exists ext_entry numeric;  -- multiple at entry fill
alter table trades    add column if not exists ext_exit  numeric;  -- multiple at exit fill
alter table positions add column if not exists ext_mult  numeric;  -- live multiple, refreshed on each admin sync
alter table positions add column if not exists ext_asof  date;     -- bar date the ext_mult was computed from
