// ONE date stamp for the whole Daily Market Plan section (Valen 2026-08-02): the lenses are
// always pushed together (HARD refresh-together rule), so the cards inside carry no individual
// stamps — the section header shows a single "updated <date> (<day>)" and the per-lens detail
// lives in its tooltip. asof = the close the numbers describe; updated = when the batch was pushed.
import { MARKET_MONITOR } from "./marketMonitor-data.js";
import { GROUP_RS } from "./groupRS-data.js";
import { EARNINGS } from "./earnings-data.js";
import { latestSnapshot } from "./themes.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const dayName = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  return isNaN(d) ? "" : DAYS[d.getUTCDay()];
};

// Display-only date format: "2026-08-07" → "Aug 7th, 2026". keep in sync with fmtNice in App.jsx
const FN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtNice = (d) => {
  if (!d) return "—";
  const dt = new Date(String(d) + (/^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? "T00:00:00" : ""));
  if (isNaN(dt)) return "—";
  const day = dt.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? "st" : (day % 10 === 2 && day !== 12) ? "nd" : (day % 10 === 3 && day !== 13) ? "rd" : "th";
  return `${FN_MONTHS[dt.getMonth()]} ${day}${suffix}, ${dt.getFullYear()}`;
};

export function planStamp() {
  const snap = latestSnapshot();
  const parts = {
    breadth: { asof: MARKET_MONITOR?.asof, updated: MARKET_MONITOR?.refreshed || MARKET_MONITOR?.asof },
    rotation: { asof: GROUP_RS?.asof, updated: GROUP_RS?.refreshed || GROUP_RS?.asof },
    earnings: { asof: EARNINGS?.asof, updated: EARNINGS?.refreshed || EARNINGS?.asof },
    themes: { asof: snap?.date, updated: snap?.date },
  };
  const updates = Object.values(parts).map(p => p.updated).filter(Boolean).sort();
  const asofs = Object.values(parts).map(p => p.asof).filter(Boolean).sort();
  const updated = updates[updates.length - 1] || null;
  const asof = asofs[asofs.length - 1] || null;
  const detail = [
    `Breadth & trend: close ${fmtNice(parts.breadth.asof)}, pushed ${fmtNice(parts.breadth.updated)}`,
    `Rotation: close ${fmtNice(parts.rotation.asof)}, pushed ${fmtNice(parts.rotation.updated)}`,
    `Themes: ${fmtNice(parts.themes.asof)}`,
    `Earnings: covers through ${fmtNice(parts.earnings.asof)}, pushed ${fmtNice(parts.earnings.updated)}`,
  ].join("\n");
  return { updated, asof, day: updated ? dayName(updated) : "", detail };
}
