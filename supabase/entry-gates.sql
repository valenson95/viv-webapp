-- ENTRY GATES CAPTURE (2026-07-11) — the data the Entry Refinement Lab slices on.
-- Run once in Supabase SQL editor. Adds a JSON column to both tables; the trade-log
-- skill fills it at ENTRY time for every new position, and the ledger folds it into
-- campaigns. Old rows stay null — the lab reports them as "not captured", never guessed.
--
-- Shape written by the trade-log skill (all optional, only what was actually measured):
-- {
--   "lod_dist_atr": 0.42,        -- (entry − LoD) ÷ ATR14 at entry  · gate: ≤ 0.60
--   "rvol_tm": 2.1,              -- time-matched RVOL at entry       · gate: ≥ 1.3 (pilot ≥ 2 conviction)
--   "orb_wait": true,            -- waited the 30-min gate before the 5-min ORB trigger
--   "ext_mult": 3.2,             -- ATR%-multiple from 50MA at entry · gate: ≤ 4
--   "dcr": 0.55,                 -- daily closing range of the setup day (0..1)
--   "entry_model": "orb" | "pullback" | "breakout" | "other",
--   "sized_same_d": true         -- shares computed from the SAME D as the 3 stops (SOFI lesson)
-- }
alter table public.trades    add column if not exists entry_gates jsonb;
alter table public.positions add column if not exists entry_gates jsonb;
