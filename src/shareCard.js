// ══════════════════════════════════════════════════════════════════
// Share card — Valen's spec (2026-07-06 v3):
//   TOP    logo + brand + date banner
//   MIDDLE the chart, full-width hero (horizontal)
//   BOTTOM scoring strip: small ticker + stars + theme tag, then ALL 16
//          criteria (✓/✗, no subheaders) in a 4-column grid
// Rendered at 2× supersample so the DeepVue chart stays crisp.
// ══════════════════════════════════════════════════════════════════

const W = 1600, M = 40; // card width · outer margin
const GOLD = "#f0c050", GOLD_MID = "#c9982a", BG = "#08080e";
const MUTED = "rgba(255,255,255,0.52)", GREEN = "#22c55e", RED = "#ef4444";
const FONT = (w, s) => `${w} ${s}px 'Plus Jakarta Sans', -apple-system, sans-serif`;

function loadImg(src) {
  return new Promise((res) => {
    if (!src) return res(null);
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = () => res(null); // a missing chart/logo never blocks the card
    im.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// data: { ticker, dateLabel, sector, themeStatus: 'in'|'off'|null, stars, letter, label,
//         passed, total, starHit, starmakers, items: [{label, on, star}] (all 16, in order), chartUrl }
export async function renderShareCard(data) {
  try { await (document.fonts?.ready || Promise.resolve()); } catch {}
  const [logo, chart] = await Promise.all([loadImg("/logo-mark.png"), loadImg(data.chartUrl)]);

  // ── layout math (in 1× units) ──
  const chartW = W - M * 2;
  const chartH = chart ? Math.min(900, Math.round(chartW * (chart.height / chart.width))) : 420;
  const items = (data.items || []).slice(0, 16);
  const COLS = 4, ROWS = Math.ceil(items.length / COLS) || 1, ROW_H = 34;
  const topH = 92;                     // banner
  const scoreY = topH + chartH + 26;   // scoring strip start
  const gridY = scoreY + 56;           // criteria grid start
  const H = gridY + ROWS * ROW_H + 58; // + footer

  // 2× supersample — layout stays in 1600-unit space, pixels render doubled
  const SCALE = 2;
  const cv = document.createElement("canvas");
  cv.width = W * SCALE; cv.height = H * SCALE;
  const ctx = cv.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ── base ──
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(201,152,42,0.08)"); grad.addColorStop(0.5, "rgba(201,152,42,0)"); grad.addColorStop(1, "rgba(201,152,42,0.05)");
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(201,152,42,0.4)"; ctx.lineWidth = 2;
  roundRect(ctx, 10, 10, W - 20, H - 20, 20); ctx.stroke();

  // ── TOP banner: logo + brand | date ──
  const by = topH / 2 + 4;
  if (logo) ctx.drawImage(logo, M, by - 24, 44, 44);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff"; ctx.font = FONT(800, 26);
  ctx.fillText("Valen Insiders Vault", M + 58, by - 9);
  ctx.fillStyle = GOLD; ctx.font = FONT(700, 15);
  ctx.fillText("DAILY SETUP", M + 58, by + 17);
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED; ctx.font = FONT(600, 19);
  ctx.fillText(data.dateLabel || "", W - M, by);
  ctx.textAlign = "left";

  // ── CHART hero (full width) ──
  if (chart) {
    ctx.save();
    roundRect(ctx, M, topH, chartW, chartH, 14); ctx.clip();
    ctx.drawImage(chart, M, topH, chartW, chartH);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 1;
    roundRect(ctx, M, topH, chartW, chartH, 14); ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    roundRect(ctx, M, topH, chartW, chartH, 14); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.font = FONT(800, 110);
    ctx.textAlign = "center";
    ctx.fillText(data.ticker || "", W / 2, topH + chartH / 2);
    ctx.textAlign = "left";
  }

  // ── SCORING strip: ticker (small) + sector + theme tag + stars + grade ──
  let x = M, y = scoreY + 18;
  ctx.fillStyle = "#fff"; ctx.font = FONT(800, 30);
  ctx.fillText(data.ticker || "", x, y);
  x += ctx.measureText(data.ticker || "").width + 14;
  if (data.sector) {
    ctx.fillStyle = MUTED; ctx.font = FONT(600, 16);
    ctx.fillText(data.sector, x, y + 1);
    x += ctx.measureText(data.sector).width + 14;
  }
  if (data.themeStatus === "in" || data.themeStatus === "off") {
    const isIn = data.themeStatus === "in";
    const tag = isIn ? "IN THEME" : "OFF THEME";
    ctx.font = FONT(800, 12.5);
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = isIn ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)";
    roundRect(ctx, x, y - 12, tw + 22, 24, 12); ctx.fill();
    ctx.strokeStyle = isIn ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)"; ctx.lineWidth = 1;
    roundRect(ctx, x, y - 12, tw + 22, 24, 12); ctx.stroke();
    ctx.fillStyle = isIn ? GREEN : RED;
    ctx.fillText(tag, x + 11, y + 1);
  }
  // stars + grade + counts, right-aligned on the same line
  ctx.textAlign = "right";
  ctx.fillStyle = MUTED; ctx.font = FONT(600, 15);
  const counts = `${data.passed}/${data.total} criteria · ${data.starHit}/${data.starmakers} ★-makers`;
  ctx.fillText(counts, W - M, y + 1);
  let rx = W - M - ctx.measureText(counts).width - 22;
  ctx.fillStyle = GOLD; ctx.font = FONT(800, 19);
  ctx.fillText(data.label || "", rx, y);
  rx -= ctx.measureText(data.label || "").width + 18;
  ctx.font = FONT(700, 25);
  for (let k = 4; k >= 0; k--) {
    ctx.fillStyle = k < (data.stars || 0) ? GOLD : "rgba(255,255,255,0.15)";
    ctx.fillText("★", rx, y);
    rx -= 28;
  }
  ctx.textAlign = "left";

  // ── criteria grid: 4 columns, fixed icon columns (✓/✗ then ★ slot) — no overlap possible ──
  const colW = chartW / COLS;
  items.forEach((it, i) => {
    const cx = M + (i % COLS) * colW;
    const cy = gridY + Math.floor(i / COLS) * ROW_H + ROW_H / 2;
    ctx.font = FONT(800, 16);
    ctx.fillStyle = it.on ? GREEN : "rgba(255,255,255,0.20)";
    ctx.fillText(it.on ? "✓" : "✗", cx, cy);
    // ★-maker marker in its own fixed slot right after the tick
    if (it.star) {
      ctx.fillStyle = it.on ? GOLD_MID : "rgba(255,255,255,0.16)"; ctx.font = FONT(700, 13);
      ctx.fillText("★", cx + 22, cy - 1);
    }
    ctx.font = FONT(600, 15);
    ctx.fillStyle = it.on ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.32)";
    let lbl = it.label;
    while (ctx.measureText(lbl).width > colW - 62 && lbl.length > 6) lbl = lbl.slice(0, -2);
    if (lbl !== it.label) lbl = lbl.trimEnd() + "…";
    ctx.fillText(lbl, cx + 42, cy);
  });

  // ── footer (drawn last; band cleared first so nothing can overlay the text) ──
  const fy = H - 30;
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = BG; ctx.fillRect(12, fy - 16, W - 24, 30); // clear the band inside the frame
  ctx.strokeStyle = "rgba(255,255,255,0.09)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(M, fy - 20); ctx.lineTo(W - M, fy - 20); ctx.stroke();
  ctx.fillStyle = MUTED; ctx.font = FONT(600, 13.5);
  ctx.fillText("Full breakdown in the member webapp", M, fy);
  ctx.fillStyle = GOLD; ctx.font = FONT(800, 14); ctx.textAlign = "right";
  ctx.fillText("valensontrades.com", W - M, fy);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";

  return cv;
}

// Copy to clipboard (Safari needs the promise-form ClipboardItem). Returns "copied" | "downloaded".
export async function copyCard(canvas, filename = "viv-setup.png") {
  const toBlob = () => new Promise(res => canvas.toBlob(res, "image/png"));
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": toBlob() })]);
      return "copied";
    }
  } catch { /* fall through to download */ }
  const blob = await toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
