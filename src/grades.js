import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// ══════════════════════════════════════════════════════════════════
// Setup-grade store — Supabase-backed (`setup_grades`, run supabase/setup-grades.sql)
// with localStorage as the offline cache, so grades follow the member across
// devices and survive cache clears. Keyed by SYMBOL (uppercase). Shared by the
// Setup Grader, the Open Positions "Grade" column, and the Model Book.
// ══════════════════════════════════════════════════════════════════
const KEY = "viv-setup-grades-v1";
const OWNER_KEY = "viv-setup-grades-uid-v1"; // which account this browser's cache belongs to
let UID = null; // set by initGrades() after login; null = local-only mode
let READY = false; // true once initGrades has completed (or been attempted) — gates grade_snapshot freezing
export const isGradesReady = () => READY;

export function loadGrades() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function persist(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); window.dispatchEvent(new Event("viv-grades")); } catch {}
}

// Pull the member's grades from Supabase on login; server wins on conflict (newer updated_at).
// Local-only grades (made before this sync existed / while offline) are pushed up.
export async function initGrades(uid) {
  UID = uid || null;
  if (!UID) { READY = true; return; }
  try {
    // Cache hygiene: if this browser's cache belongs to a DIFFERENT account, wipe it —
    // otherwise user B inherits user A's grades on a shared machine (and pushes them
    // to their own account as "orphans").
    try {
      const owner = localStorage.getItem(OWNER_KEY);
      if (owner && owner !== UID) localStorage.removeItem(KEY);
      localStorage.setItem(OWNER_KEY, UID);
    } catch {}
    const { data, error } = await supabase.from("setup_grades").select("*").eq("user_id", UID);
    if (error) return; // table not created yet → stay in local-only mode silently
    const local = loadGrades();
    const merged = { ...local };
    const pushUp = []; // rows where LOCAL is newer (or server-missing) → push to server
    (data || []).forEach(r => {
      const sym = r.symbol;
      const localRow = local[sym];
      if (!localRow || new Date(r.updated_at) >= new Date(localRow.updatedAt || 0)) {
        merged[sym] = { sym, stars: r.stars, letter: r.letter, pct: +r.pct || 0, starHit: r.star_hit, starmakers: r.starmakers, ticked: r.ticked || [], updatedAt: r.updated_at };
      } else {
        pushUp.push(localRow); // local edit is newer than the server copy — sync it up
      }
    });
    persist(merged);
    const serverSyms = new Set((data || []).map(r => r.symbol));
    Object.values(local).forEach(g => { if (g.sym && !serverSyms.has(g.sym)) pushUp.push(g); });
    if (pushUp.length) {
      await supabase.from("setup_grades").upsert(pushUp.map(g => ({
        user_id: UID, symbol: g.sym, stars: g.stars || 0, letter: g.letter || null, pct: g.pct ?? null,
        star_hit: g.starHit ?? null, starmakers: g.starmakers ?? null, ticked: g.ticked || [], updated_at: g.updatedAt || new Date().toISOString(),
      })));
    }
  } catch { /* offline / not set up — local cache still works */ }
  finally { READY = true; try { window.dispatchEvent(new Event("viv-grades")); } catch {} }
}

export function getGrade(sym) {
  if (!sym) return null;
  return loadGrades()[String(sym).toUpperCase().trim()] || null;
}
export function saveGrade(sym, grade) {
  const s = String(sym || "").toUpperCase().trim();
  if (!s) return;
  const all = loadGrades();
  const row = { ...grade, sym: s, updatedAt: new Date().toISOString() };
  all[s] = row;
  persist(all);
  if (UID) { // write-through (fire-and-forget; localStorage already has it)
    supabase.from("setup_grades").upsert({
      user_id: UID, symbol: s, stars: row.stars || 0, letter: row.letter || null, pct: row.pct ?? null,
      star_hit: row.starHit ?? null, starmakers: row.starmakers ?? null, ticked: row.ticked || [], updated_at: row.updatedAt,
    }).then(({ error }) => { if (error) console.error("grade sync:", error.message); });
  }
}
export function removeGrade(sym) {
  const s = String(sym || "").toUpperCase().trim();
  const all = loadGrades();
  delete all[s];
  persist(all);
  if (UID) supabase.from("setup_grades").delete().eq("user_id", UID).eq("symbol", s).then(() => {});
}

// stars (0–5) → letter grade, matching the Setup Grader's grade labels.
export function letterFor(stars) {
  return ({ 5: "A+", 4: "A", 3: "B", 2: "C", 1: "C", 0: "—" })[stars] || "—";
}

// Re-render hook: bumps whenever any grade is saved/removed (this tab or another).
// Returns the version counter so effects can depend on grade changes.
export function useGrades() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const h = () => setV(x => x + 1);
    window.addEventListener("viv-grades", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("viv-grades", h); window.removeEventListener("storage", h); };
  }, []);
  return v;
}
