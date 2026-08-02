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
    `Breadth & trend: close ${parts.breadth.asof || "—"}, pushed ${parts.breadth.updated || "—"}`,
    `Rotation: close ${parts.rotation.asof || "—"}, pushed ${parts.rotation.updated || "—"}`,
    `Themes: ${parts.themes.asof || "—"}`,
    `Earnings: covers through ${parts.earnings.asof || "—"}, pushed ${parts.earnings.updated || "—"}`,
  ].join("\n");
  return { updated, asof, day: updated ? dayName(updated) : "", detail };
}
