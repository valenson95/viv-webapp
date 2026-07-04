import { useEffect, useState } from "react";

// ══════════════════════════════════════════════════════════════════
// Setup-grade store. Device-local (localStorage) for now — a Supabase
// migration will later sync these across devices + into the journal.
// Keyed by SYMBOL (uppercase). Shared by the Setup Grader (Premium Tools)
// and the Open Positions "Grade" column (Dashboard).
// ══════════════════════════════════════════════════════════════════
const KEY = "viv-setup-grades-v1";

export function loadGrades() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
function persist(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); window.dispatchEvent(new Event("viv-grades")); } catch {}
}
export function getGrade(sym) {
  if (!sym) return null;
  return loadGrades()[String(sym).toUpperCase().trim()] || null;
}
export function saveGrade(sym, grade) {
  const s = String(sym || "").toUpperCase().trim();
  if (!s) return;
  const all = loadGrades();
  all[s] = { ...grade, sym: s, updatedAt: new Date().toISOString() };
  persist(all);
}
export function removeGrade(sym) {
  const all = loadGrades();
  delete all[String(sym || "").toUpperCase().trim()];
  persist(all);
}

// stars (0–5) → letter grade, matching the Setup Grader's grade labels.
export function letterFor(stars) {
  return ({ 5: "A+", 4: "A", 3: "B", 2: "C", 1: "C", 0: "—" })[stars] || "—";
}

// Re-render hook: bumps whenever any grade is saved/removed (this tab or another).
export function useGrades() {
  const [, setV] = useState(0);
  useEffect(() => {
    const h = () => setV(x => x + 1);
    window.addEventListener("viv-grades", h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener("viv-grades", h); window.removeEventListener("storage", h); };
  }, []);
}
