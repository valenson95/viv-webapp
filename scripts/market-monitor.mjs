// ── MARKET MONITOR (breadth) — data builder ──────────────────────────────────
// Run:  node scripts/market-monitor.mjs   (no env needed)
//
// Replicates the Stockbee-style Market Monitor breadth sheet 100% faithfully:
//   • DATA  comes from the source sheet itself (live public Google Sheet CSV,
//     which the user's local "Stockbee Market Monitor 2026.xlsx" mirrors).
//   • FORMULAS are the sheet's OWN formula cells, recorded verbatim from the
//     xlsx (data_only=False):
//        5 day ratio  (col D) :  =(sum(B3:B7))/(sum(C3:C7))
//        10 day ratio (col E) :  =(sum(B3:B12))/(sum(C3:C12))
//     i.e. a TRAILING sum-of-(up 4%+) / sum-of-(down 4%+) over 5 and 10 sessions,
//     evaluated on the sheet's date-DESCENDING layout (row 3 = newest). This
//     script recomputes those two columns from the raw B/C counts and
//     cross-checks against the sheet's own computed values (proves identity).
//
// PRIMARY source : live public sheet CSV (gid 1082103394 = the "2026" tab).
// FALLBACK       : parse the local xlsx via a python3 subprocess (openpyxl).
//
// Column headers are kept VERBATIM from the sheet (row 2). Educational, not advice.

import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "marketMonitor-data.js");
const XLSX = "/Users/valenchua/Desktop/Stockbee Market Monitor 2026.xlsx";
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/export?format=csv&gid=1082103394";

// Stable keys mapped to the sheet's own columns (A..P), header names kept verbatim.
const COLS = [
  { key: "date",      hdr: "Date" },
  { key: "up4",       hdr: "Number of stocks up 4% plus today" },
  { key: "down4",     hdr: "Number of stocks down 4% plus today" },
  { key: "r5",        hdr: "5 day ratio" },
  { key: "r10",       hdr: "10 day  ratio " },
  { key: "up25q",     hdr: "Number of stocks up 25% plus in a quarter" },
  { key: "down25q",   hdr: "Number of stocks down 25% + in a quarter" },
  { key: "up25m",     hdr: "Number of stocks up 25% + in a month" },
  { key: "down25m",   hdr: "Number of stocks down 25% + in a month" },
  { key: "up50m",     hdr: "Number of stocks up 50% + in a month" },
  { key: "down50m",   hdr: "Number of stocks down 50% + in a month" },
  { key: "up13d34",   hdr: "Number of stocks up 13% + in 34 days" },
  { key: "down13d34", hdr: "Number of stocks down 13% + in 34 days" },
  { key: "universe",  hdr: " Worden Common stock universe" },
  { key: "t2108",     hdr: "T2108 " },
  { key: "sp",        hdr: "S&P" },
];

// ── tiny CSV parser (handles quoted fields with commas, e.g. "7,457.69") ──────
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inq) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inq = false; }
      else field += c;
    } else {
      if (c === '"') inq = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/[",\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  return isFinite(v) ? v : null;
};
// "7/17/2026" (M/D/YYYY) -> "2026-07-17"
const isoDate = (s) => {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(+d) ? String(s).trim() : d.toISOString().slice(0, 10);
};

// ── source A: live public sheet CSV ──────────────────────────────────────────
async function fromSheet() {
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`sheet HTTP ${res.status}`);
  const rows = parseCSV(await res.text());
  // row[0] = group banner, row[1] = real headers, row[2..] = data (date-descending)
  const data = rows.slice(2).filter((r) => r[0] && String(r[0]).trim());
  return data;
}

// ── source B: local xlsx via python3 (emits the same descending CSV shape) ────
function fromXlsx() {
  const py = `
import openpyxl, sys, csv, datetime
wb = openpyxl.load_workbook(${JSON.stringify(XLSX)}, data_only=True)
ws = wb["2026"]
w = csv.writer(sys.stdout)
for r in range(3, ws.max_row + 1):
    a = ws.cell(r, 1).value
    b = ws.cell(r, 2).value
    if a is None and b is None:
        continue
    out = []
    for c in range(1, 17):
        v = ws.cell(r, c).value
        if isinstance(v, (datetime.datetime, datetime.date)):
            v = "%d/%d/%d" % (v.month, v.day, v.year)
        out.append("" if v is None else v)
    w.writerow(out)
`;
  const txt = execFileSync("python3", ["-c", py], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return parseCSV(txt).filter((r) => r[0] && String(r[0]).trim());
}

// ── build ─────────────────────────────────────────────────────────────────
(async () => {
  let raw, source;
  try {
    raw = await fromSheet();
    source = "sheet";
    console.log(`[market-monitor] live sheet OK — ${raw.length} data rows`);
  } catch (e) {
    console.warn(`[market-monitor] live sheet failed (${e.message}); falling back to local xlsx`);
    raw = fromXlsx();
    source = "xlsx";
    console.log(`[market-monitor] local xlsx OK — ${raw.length} data rows`);
  }

  // Parse in the sheet's native DESCENDING order (row 0 = newest) so the
  // trailing-window recompute matches the sheet formula index-for-index.
  const desc = raw.map((r) => {
    const o = {};
    COLS.forEach((c, i) => { o[c.key] = c.key === "date" ? isoDate(r[i]) : num(r[i]); });
    return o;
  });

  // Recompute ratio columns using the sheet's OWN formulas (trailing sums over
  // the sheet's descending layout; missing forward rows contribute 0, exactly
  // like the sheet's SUM over empty cells).
  const sumWin = (arr, i, n, k) => {
    let s = 0;
    for (let j = i; j < i + n && j < arr.length; j++) s += (arr[j][k] || 0);
    return s;
  };
  desc.forEach((row, i) => {
    const up5 = sumWin(desc, i, 5, "up4"),  dn5 = sumWin(desc, i, 5, "down4");
    const up10 = sumWin(desc, i, 10, "up4"), dn10 = sumWin(desc, i, 10, "down4");
    row.r5_calc = dn5 ? up5 / dn5 : null;
    row.r10_calc = dn10 ? up10 / dn10 : null;
  });

  // Cross-check recomputed vs the sheet's own computed r5 / r10 (proves the
  // formula is identical). The live CSV rounds displayed ratios to 2dp, so a
  // ~0.005 rounding gap is expected; anything larger means a formula mismatch.
  let maxDiff = 0;
  const cells = [];
  desc.forEach((row) => {
    [["r5", "r5_calc"], ["r10", "r10_calc"]].forEach(([shk, ck]) => {
      if (row[shk] != null && row[ck] != null) {
        const d = Math.abs(row[shk] - row[ck]);
        if (d > maxDiff) maxDiff = d;
        if (d > 0.01) cells.push({ date: row.date, col: shk, sheet: row[shk], calc: +row[ck].toFixed(4), diff: +d.toFixed(4) });
      }
    });
  });

  // Normalize to ASCENDING (oldest -> newest) for the UI.
  const rows = [...desc].reverse().map((r) => ({
    ...r,
    r5_calc: r.r5_calc == null ? null : +r.r5_calc.toFixed(4),
    r10_calc: r.r10_calc == null ? null : +r.r10_calc.toFixed(4),
  }));

  const asof = rows[rows.length - 1]?.date || null;
  const payload = {
    asof,
    // MYT stamp via LOCAL date parts — this node lacks tz ICU (Intl timeZone falls back to
    // local silently); the script always runs on Valen's Mac whose local clock IS MYT.
    refreshed: (() => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })(),
    source,
    headers: COLS.map((c) => c.hdr),
    cols: COLS,                       // key <-> verbatim header pairing for the table
    rows,                             // ascending; keep all (sheet has ~143 rows for 2026)
    formulaCheck: { maxDiff: +maxDiff.toFixed(6), mismatches: cells.length, cells: cells.slice(0, 20) },
  };

  const banner =
    "// AUTO-GENERATED by scripts/market-monitor.mjs — DO NOT EDIT BY HAND.\n" +
    "// Source: Stockbee-style Market Monitor breadth sheet (live public Google Sheet CSV,\n" +
    "// mirrored by the user's local xlsx). Ratio columns recomputed from the sheet's own\n" +
    "// formulas:  5d = trailing sum(up4%)/sum(down4%) over 5 sessions; 10d = over 10.\n" +
    `// Built ${new Date().toISOString()} · source=${source} · rows=${rows.length} · maxDiff=${payload.formulaCheck.maxDiff}\n`;
  writeFileSync(OUT, banner + "export const MARKET_MONITOR = " + JSON.stringify(payload) + ";\n");

  console.log(`[market-monitor] wrote ${OUT}`);
  console.log(`[market-monitor] rows=${rows.length}  asof=${asof}  source=${source}`);
  console.log(`[market-monitor] formula cross-check maxDiff=${payload.formulaCheck.maxDiff}  mismatches(>0.01)=${cells.length}`);
  const latest = rows[rows.length - 1];
  console.log(`[market-monitor] latest: up4=${latest.up4} down4=${latest.down4} r5=${latest.r5}(calc ${latest.r5_calc}) r10=${latest.r10}(calc ${latest.r10_calc}) T2108=${latest.t2108} S&P=${latest.sp}`);
})();
