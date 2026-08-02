import React, { useState, useRef } from "react";

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

// ─── Post to X (Valen 2026-08-02, "like DeepVue's") ─────────────────────────
// ⚠️ X's web intent CANNOT attach an image — the API was removed years ago, and no site can
// upload media on your behalf without OAuth. So the only working flow (DeepVue's too) is:
//   1. render the card → PNG → clipboard (synchronously inside the gesture, Safari's rule)
//   2. open X's composer BLANK (Valen writes his own copy)
//   3. the user pastes the image with ⌘V / Ctrl+V
// The button label flips to "Copied — paste ⌘V" for 8s so nobody waits for an image that never
// arrives on its own. If the clipboard write fails (older Safari, insecure context) we download
// the PNG instead and say so.
export function XShare({ getEl, text, C, style, label }) {
  const [state, setState] = useState("");   // "" | "copied" | "saved"
  const muted = (C && C.muted) || "rgba(255,255,255,0.5)";
  const gold = (C && C.goldBright) || "#f0c050";
  // Blank composer by default (Valen 2026-08-02: "i just have to do my own write up").
  // The IMAGE is the payload; pass `text` only if a caller genuinely wants a seed caption.
  const openX = () => {
    const url = "https://x.com/intent/post" + (text ? "?text=" + encodeURIComponent(text) : "");
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const flash = (s2) => { setState(s2); setTimeout(() => setState(""), 8000); };
  const download = (canvas) => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `viv-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };
  const onClick = (e) => {
    e.stopPropagation();
    const el = typeof getEl === "function" ? getEl() : getEl;
    if (!el) return;
    // ORDER MATTERS: finish the clipboard write BEFORE opening the tab. Opening first steals
    // focus and the browser rejects the write ("document is not focused") — the image would
    // silently never arrive, which is exactly what went wrong on the first version.
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        const item = new window.ClipboardItem({
          // Promise value passed synchronously — required for Safari's user-gesture rule.
          "image/png": render(el).then((canvas) => new Promise((res) => canvas.toBlob(res, "image/png"))),
        });
        navigator.clipboard.write([item])
          .then(() => { flash("copied"); openX(); })
          .catch(() => { render(el).then((c) => { download(c); flash("saved"); openX(); }).catch(() => {}); });
      } else {
        render(el).then((c) => { download(c); flash("saved"); openX(); }).catch(() => {});
      }
    } catch { openX(); }
  };
  const msg = state === "copied" ? "Image is on your clipboard — press \u2318V in the post box"
    : state === "saved" ? "Image downloaded — attach it in the post"
    : (label || "Post to X — copies this card as an image, then opens a blank post for you to paste into");
  return (
    <button type="button" data-html2canvas-ignore="true" onClick={onClick} title={msg} aria-label="Post to X"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 22, padding: state ? "0 8px" : "0 5px", borderRadius: 7, cursor: "pointer", flex: "none", background: state ? "rgba(201,152,42,0.14)" : "transparent", border: "none", color: state ? gold : muted, transition: "color .15s", fontSize: "0.56rem", fontWeight: 800, whiteSpace: "nowrap", ...style }}
      onMouseEnter={(e) => { if (!state) e.currentTarget.style.color = gold; }}
      onMouseLeave={(e) => { if (!state) e.currentTarget.style.color = muted; }}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {state === "copied" ? <span>Copied — paste ⌘V</span> : state === "saved" ? <span>Downloaded — attach it</span> : null}
    </button>
  );
}

// ─── Corner camera for one PANEL inside a full-view popup (Valen 2026-08-02: "the rotation
// card when i clicked into it, it also should have screenshot features across all the cards").
// Drops into any positioned panel and captures the nearest ancestor matching `sel` — no per-panel
// ref plumbing. Sits top-right, only fully visible on hover so it never competes with the data.
export function SectionCamera({ sel = "section", name, C, style, top = 9, right = 11 }) {
  const ref = useRef(null);
  return (
    <span ref={ref} data-html2canvas-ignore="true" className="seccam"
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", top, right, zIndex: 4, lineHeight: 0, opacity: 0.32, transition: "opacity .15s", ...style }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.32; }}>
      <LensCamera getEl={() => ref.current && ref.current.closest(sel)} name={name} C={C} />
    </span>
  );
}
