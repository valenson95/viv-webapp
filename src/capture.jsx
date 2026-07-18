import React, { useState } from "react";

// ─── Shared screenshot → clipboard button for dashboard lens cards. ───
// Captures a card element to PNG and copies it to the clipboard (Safari needs the
// ClipboardItem built SYNCHRONOUSLY inside the gesture with a Promise value), falling
// back to a PNG download when the async Clipboard API is unavailable. The button itself
// is excluded from the capture via data-html2canvas-ignore. html2canvas can't read
// backdrop-filter glass, so we pass an explicit near-black background. html2canvas is
// loaded lazily (matches captureElement.js) so it stays out of the first-paint bundle.
const H2C_OPTS = {
  backgroundColor: "#08080e",
  scale: 2,
  ignoreElements: (n) => n && n.getAttribute && n.getAttribute("data-html2canvas-ignore") === "true",
};
let _h2c = null;
const loadH2C = () => (_h2c = _h2c || import("html2canvas").then((m) => m.default || m));
const render = (el) => loadH2C().then((h2c) => h2c(el, H2C_OPTS));

export function LensCamera({ getEl, name, C, style }) {
  const [done, setDone] = useState(false);
  const muted = (C && C.muted) || "rgba(255,255,255,0.5)";
  const gold = (C && C.goldBright) || "#f0c050";
  const green = (C && C.green) || "#22c55e";
  const flash = () => { setDone(true); setTimeout(() => setDone(false), 2000); };
  const fileName = `viv-${name}-${new Date().toISOString().slice(0, 10)}.png`;
  const download = (el) => render(el).then((canvas) => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = fileName;
    a.click();
    flash();
  }).catch(() => {});
  const onClick = (e) => {
    e.stopPropagation();
    const el = typeof getEl === "function" ? getEl() : getEl;
    if (!el) return;
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        // Promise value passed synchronously — required for Safari's user-gesture rule.
        const item = new window.ClipboardItem({
          "image/png": render(el).then((canvas) => new Promise((res) => canvas.toBlob(res, "image/png"))),
        });
        navigator.clipboard.write([item]).then(flash).catch(() => download(el));
      } else {
        download(el);
      }
    } catch {
      download(el);
    }
  };
  return (
    <button type="button" data-html2canvas-ignore="true" onClick={onClick}
      title={done ? "Copied to clipboard" : "Copy this card as an image"} aria-label="Copy card as image"
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: 22, minWidth: 22, padding: done ? "0 6px" : 0, borderRadius: 7, cursor: "pointer", flex: "none", background: "transparent", border: "none", color: done ? green : muted, transition: "color .15s", ...style }}
      onMouseEnter={(e) => { if (!done) e.currentTarget.style.color = gold; }}
      onMouseLeave={(e) => { if (!done) e.currentTarget.style.color = muted; }}>
      {done ? (
        <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>Copied ✓</span>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )}
    </button>
  );
}
