import { supabase } from "./supabaseClient";

// ══════════════════════════════════════════════════════════════════
// Daily Setups store — the published daily-idea feed (supabase/daily-setups.sql).
// Admin publishes from the Setup Grader; members read. If the table isn't
// created yet, publishes park in localStorage (admin's browser only) and the
// feed shows them with a "local only" badge — nothing is ever silently lost.
// ══════════════════════════════════════════════════════════════════
const LOCAL_KEY = "viv-daily-setups-local-v1";

function localRows() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; }
}
function persistLocal(rows) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); } catch {}
}

// Newest first. Server rows + any local-only parked rows (marked _local: true).
export async function listSetups() {
  let server = [], tableMissing = false;
  try {
    const { data, error } = await supabase
      .from("daily_setups").select("*")
      .order("trade_date", { ascending: false }).order("created_at", { ascending: false })
      .limit(200);
    if (error) tableMissing = true; else server = data || [];
  } catch { tableMissing = true; }
  const local = localRows().map(r => ({ ...r, _local: true }));
  return { rows: [...local, ...server], tableMissing };
}

// Returns { ok, local } — local=true means it parked in localStorage (table not created yet).
export async function publishSetup(row) {
  const body = {
    created_by: row.created_by, ticker: row.ticker, trade_date: row.trade_date,
    sector: row.sector || null, stars: row.stars || 0, letter: row.letter || null,
    pct: row.pct ?? null, star_hit: row.star_hit ?? null, starmakers: row.starmakers ?? null,
    ticked: row.ticked || [], auto: row.auto || [], note: row.note || null,
    chart_img: row.chart_img || null, is_published: true,
  };
  try {
    const { error } = await supabase.from("daily_setups").insert(body);
    if (!error) return { ok: true, local: false };
  } catch {}
  // Table missing / offline → park locally so the publish is never lost
  const parked = { ...body, id: "local-" + Date.now(), created_at: new Date().toISOString() };
  persistLocal([parked, ...localRows()]);
  return { ok: true, local: true };
}

// Admin "start fresh" — wipes the WHOLE feed (server rows + local parked). Daily-ideas
// board, not an archive: the grades themselves stay in setup_grades untouched.
export async function resetSetups() {
  persistLocal([]);
  const { error } = await supabase.from("daily_setups").delete().not("id", "is", null);
  return { ok: !error, error: error?.message };
}

export async function deleteSetup(id) {
  if (String(id).startsWith("local-")) {
    persistLocal(localRows().filter(r => r.id !== id));
    return { ok: true };
  }
  const { error } = await supabase.from("daily_setups").delete().eq("id", id);
  return { ok: !error, error: error?.message };
}
