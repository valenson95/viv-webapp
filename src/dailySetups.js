import { supabase } from "./supabaseClient";

// ══════════════════════════════════════════════════════════════════
// Daily Setups store — the published daily-idea feed (supabase/daily-setups.sql).
// Admin publishes from the Setup Grader; members read. If the TABLE IS MISSING
// (SQL not run yet), publishes park in localStorage (admin's browser only) and
// the feed shows them with a "local only" badge. Any OTHER failure (network,
// RLS, constraint) is reported honestly — never silently parked as "ok".
// ══════════════════════════════════════════════════════════════════
const LOCAL_KEY = "viv-daily-setups-local-v1";

function localRows() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function persistLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch {}
}
// PGRST205 = table not in schema cache (Supabase), 42P01 = undefined_table (Postgres)
const isTableMissing = (error) =>
  !!error && (error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message || ""));

// Newest first. Server rows + any local-only parked rows (marked _local: true),
// sorted together so date grouping in the feed never splits or duplicates a day.
export async function listSetups() {
  let server = [], tableMissing = false, loadError = null;
  try {
    const { data, error } = await supabase
      .from("daily_setups").select("*")
      .order("trade_date", { ascending: false }).order("created_at", { ascending: false })
      .limit(200);
    if (error) { if (isTableMissing(error)) tableMissing = true; else loadError = error.message; }
    else server = data || [];
  } catch (e) { loadError = String(e?.message || e); }
  const local = localRows().map(r => ({ ...r, _local: true }));
  const rows = [...local, ...server].sort((a, b) =>
    String(b.trade_date || "").localeCompare(String(a.trade_date || "")) ||
    String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return { rows, tableMissing, loadError };
}

// Returns { ok, local, error? } — local=true means it parked in localStorage (table not created yet).
export async function publishSetup(row) {
  const body = {
    created_by: row.created_by, ticker: row.ticker, trade_date: row.trade_date,
    sector: row.sector || null, stars: row.stars || 0, letter: row.letter || null,
    pct: row.pct ?? null, star_hit: row.star_hit ?? null, starmakers: row.starmakers ?? null,
    ticked: row.ticked || [], auto: row.auto || [], note: row.note || null,
    chart_img: row.chart_img || null, is_published: true,
  };
  try {
    // Republish = replace, never stack: clear any same ticker+date post of mine first
    // (mirrors scripts/publish-daily-setup.mjs; RLS restricts the delete to admin anyway).
    const del = await supabase.from("daily_setups").delete()
      .eq("created_by", body.created_by).eq("ticker", body.ticker).eq("trade_date", body.trade_date);
    if (del.error && !isTableMissing(del.error)) return { ok: false, local: false, error: del.error.message };
    const { error } = await supabase.from("daily_setups").insert(body);
    if (!error) return { ok: true, local: false };
    if (!isTableMissing(error)) return { ok: false, local: false, error: error.message };
  } catch (e) {
    return { ok: false, local: false, error: String(e?.message || e) }; // network blip → retry, don't park
  }
  // Table genuinely missing → park locally (replace same ticker+date) so the work isn't lost
  const parked = { ...body, id: "local-" + Date.now(), created_at: new Date().toISOString() };
  persistLocal([parked, ...localRows().filter(r => !(r.ticker === body.ticker && r.trade_date === body.trade_date))]);
  return { ok: true, local: true };
}

// Admin "start fresh" — wipes the WHOLE feed (server rows + local parked). Daily-ideas
// board, not an archive: the grades themselves stay in setup_grades untouched.
export async function resetSetups() {
  try {
    const { error } = await supabase.from("daily_setups").delete().not("id", "is", null);
    if (error && !isTableMissing(error)) return { ok: false, error: error.message }; // keep local rows on real failure
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  persistLocal([]); // server cleared (or table missing = nothing there) → now clear local
  return { ok: true };
}

export async function deleteSetup(id) {
  if (String(id).startsWith("local-")) {
    persistLocal(localRows().filter(r => r.id !== id));
    return { ok: true };
  }
  const { error } = await supabase.from("daily_setups").delete().eq("id", id);
  return { ok: !error, error: error?.message };
}
