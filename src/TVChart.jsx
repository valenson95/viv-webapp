import React, { useEffect, useRef, useState } from "react";

// ══════════════════════════════════════════════════════════════════
// Genuine TradingView chart (official embed widget, tv.js) — the full TV
// interface: indicators, drawing toolbar, timeframes, TV's own data.
// Limitation vs the licensed Charting Library (what TradeZella uses):
// the widget can't plot OUR fills/stop lines or do candle replay — that
// stays on the "Replay" tab. Upgrade path: TradingView Advanced Charts
// license (free, application required) → custom marks + our Polygon feed.
// ══════════════════════════════════════════════════════════════════

let tvPromise = null;
function loadTV() {
  if (window.TradingView) return Promise.resolve();
  if (!tvPromise) tvPromise = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return tvPromise;
}
// Resolve a CSS custom property to its current painted value — the TV embed widget's `theme`,
// `backgroundColor` and `gridColor` options are read once at construction and don't accept var(...).
const cssVar = (n, fb) => { try { const v = getComputedStyle(document.documentElement).getPropertyValue(n); return (v || "").trim() || fb; } catch { return fb; } };

export default function TVChart({ symbol, interval = "D", height = 560 }) {
  const ref = useRef(null);
  const idRef = useRef("tvw_" + Math.random().toString(36).slice(2));
  // The TV embed widget (tv.js) takes its theme/colours ONCE at construction — it exposes no live
  // theme setter (that's the licensed Charting Library only). App.jsx's applyTheme() toggles
  // <body class="theme-light">, so watch that with a MutationObserver and bump a tick to force a
  // full destroy+recreate on a light/dark flip. Not instant (a widget reload), but "cheap" — the
  // teardown/rebuild path already exists below for symbol/interval changes.
  const [themeTick, setThemeTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return;
    const mo = new MutationObserver(() => setThemeTick((t) => t + 1));
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    let dead = false;
    loadTV().then(() => {
      if (dead || !ref.current || !window.TradingView) return;
      ref.current.innerHTML = "";
      const light = document.body.classList.contains("theme-light");
      new window.TradingView.widget({
        container_id: idRef.current,
        symbol: String(symbol || "").toUpperCase(),
        interval,
        autosize: true,
        theme: light ? "light" : "dark",
        style: "1",
        timezone: "America/New_York",
        locale: "en",
        hide_side_toolbar: false,      // full drawing toolbar
        hide_top_toolbar: false,
        allow_symbol_change: false,
        withdateranges: true,
        save_image: true,
        studies: ["MAExp@tv-basicstudies"],
        backgroundColor: cssVar("--card", light ? "#f7f8f8" : "#0e0e16"),
        gridColor: cssVar("--gridline", light ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.05)"),
      });
    }).catch(() => {});
    return () => { dead = true; if (ref.current) ref.current.innerHTML = ""; };
  }, [symbol, interval, themeTick]);
  return <div id={idRef.current} ref={ref} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid var(--w08)", background: "var(--card)" }} />;
}
