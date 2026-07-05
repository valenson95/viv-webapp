import React, { useEffect, useRef } from "react";

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

export default function TVChart({ symbol, interval = "D", height = 560 }) {
  const ref = useRef(null);
  const idRef = useRef("tvw_" + Math.random().toString(36).slice(2));
  useEffect(() => {
    let dead = false;
    loadTV().then(() => {
      if (dead || !ref.current || !window.TradingView) return;
      ref.current.innerHTML = "";
      new window.TradingView.widget({
        container_id: idRef.current,
        symbol: String(symbol || "").toUpperCase(),
        interval,
        autosize: true,
        theme: "dark",
        style: "1",
        timezone: "America/New_York",
        locale: "en",
        hide_side_toolbar: false,      // full drawing toolbar
        hide_top_toolbar: false,
        allow_symbol_change: false,
        withdateranges: true,
        save_image: true,
        studies: ["MAExp@tv-basicstudies"],
        backgroundColor: "#0e0e16",
        gridColor: "rgba(255,255,255,0.05)",
      });
    }).catch(() => {});
    return () => { dead = true; if (ref.current) ref.current.innerHTML = ""; };
  }, [symbol, interval]);
  return <div id={idRef.current} ref={ref} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", background: "#0e0e16" }} />;
}
