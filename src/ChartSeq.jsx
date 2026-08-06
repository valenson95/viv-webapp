import React, { useState } from "react";
import { createPortal } from "react-dom";

// ══════════════════════════════════════════════════════════════════
// CHART SEQUENCE (Valen 2026-07-26) — the ONE ordered, chronological,
// self-labeled chart list shared by both editors (Study detailed view +
// member Model Book editor). Charts become an unlimited paste-or-upload,
// reorderable list. The fixed BEFORE/AFTER/TRIGGER slots survive UNDER
// THE HOOD: buildChartList() converts existing slot data into the list on
// load, deriveChartFields() folds the list back into the legacy DB columns
// on save — so the flash-card strip + campaign chaining keep working.
//
// Virtual home per row type:
//   • study rows      → metrics.study.charts
//   • plain MB rows   → metrics.charts
//   each entry = { img, label, caption, role }
//   role ∈ "context" | "before" | "trigger" | "after" | null
//
// Per-type slot mapping (the CANONICAL semantics, verified in StudyBook):
//   study : before_img = Context(HTF) · after_img = BEFORE-the-setup ·
//           trigger_ltf_img = TRIGGER-5min · outcome_img = AFTER-the-outcome
//   plain : before_img = BEFORE · after_img = AFTER
// ══════════════════════════════════════════════════════════════════

const CANON_LABEL = {
  context: "Context (HTF)",
  before: "BEFORE — the setup",
  trigger: "TRIGGER — 5-min entry",
  after: "AFTER — the outcome",
};

// role picker options — plain-English, member-safe (zero jargon walls, no mentor names)
export const ROLE_OPTIONS = [
  ["", "—"],
  ["before", "Setup card"],
  ["after", "Outcome card"],
  ["trigger", "Trigger detail"],
  ["context", "Context chart"],
];

const normalize = (c) => ({
  img: (c && c.img) || "",
  label: (c && c.label) || "",
  caption: (c && c.caption) || "",
  role: c && c.role != null ? c.role : null,
});

// ── LOAD: build the unified list from whatever the row already carries. If the
// list is already present, return it (normalized). Otherwise convert the legacy
// slot fields → list, carrying slot_captions into captions, then append extra_charts.
export function buildChartList(row, isStudy) {
  if (!row) return [];
  const home = isStudy ? (row.metrics && row.metrics.study) || {} : (row.metrics || {});
  if (Array.isArray(home.charts)) return home.charts.map(normalize);

  const list = [];
  if (isStudy) {
    const s = (row.metrics && row.metrics.study) || {};
    const caps = s.slot_captions || {};
    // trigger_ltf_img / outcome_img live in metrics.study, but the StudyEditor lifts them to
    // the top level while editing — read either so this works pre- and post-lift.
    const trig = row.trigger_ltf_img != null ? row.trigger_ltf_img : s.trigger_ltf_img;
    const out = row.outcome_img != null ? row.outcome_img : s.outcome_img;
    if (row.before_img) list.push({ img: row.before_img, role: "context", label: CANON_LABEL.context, caption: caps.context || "" });
    if (row.after_img) list.push({ img: row.after_img, role: "before", label: CANON_LABEL.before, caption: caps.before || "" });
    if (trig) list.push({ img: trig, role: "trigger", label: CANON_LABEL.trigger, caption: caps.trigger || "" });
    if (out) list.push({ img: out, role: "after", label: CANON_LABEL.after, caption: caps.after || "" });
    const extras = row.extra_charts != null ? row.extra_charts : s.extra_charts;
    (extras || []).forEach((ex) => { if (ex && ex.img) list.push({ img: ex.img, role: null, label: ex.label || "", caption: ex.caption || "" }); });
  } else {
    if (row.before_img) list.push({ img: row.before_img, role: "before", label: CANON_LABEL.before, caption: "" });
    if (row.after_img) list.push({ img: row.after_img, role: "after", label: CANON_LABEL.after, caption: "" });
  }
  return list;
}

// ── SAVE: derive the legacy DB columns from the list roles. Flash-card FRONT
// (study → after_img "BEFORE-the-setup" · plain → before_img) and BACK (study →
// outcome_img · plain → after_img) fall back to the FIRST / LAST chart when no
// chart carries that role — the invisible default the owner approved. Never sends
// one chart to BOTH faces unless the list holds exactly one chart. Context + trigger
// take their explicit role only (no first/last default).
export function deriveChartFields(list, isStudy) {
  const imgs = (list || []).filter((c) => c && c.img);
  const byRole = (role) => { const hit = imgs.find((c) => c.role === role); return hit ? hit.img : ""; };
  const n = imgs.length;
  const beforeExplicit = !!byRole("before");
  const afterExplicit = !!byRole("after");
  let front = byRole("before");
  let back = byRole("after");
  if (n === 1) {
    if (!front) front = imgs[0].img;
    if (!back) back = imgs[0].img; // a lone chart may fill both faces
  } else if (n > 1) {
    if (!front) front = imgs[0].img;              // first chart → front
    if (!back) back = imgs[n - 1].img;            // last chart → back
    if (front && front === back) {                // collision → move the DEFAULTED face off the explicit one
      if (!afterExplicit) { const alt = [...imgs].reverse().find((c) => c.img !== front); if (alt) back = alt.img; }
      else if (!beforeExplicit) { const alt = imgs.find((c) => c.img !== back); if (alt) front = alt.img; }
    }
  }
  if (isStudy) return { before_img: byRole("context"), after_img: front, trigger_ltf_img: byRole("trigger"), outcome_img: back };
  return { before_img: front, after_img: back };
}

// ── FACES: the compact before/after pair a strip / card shows (Valen 2026-07-26). Reads the SAME
// unified list buildChartList() produces (converting legacy slot rows on the fly), so a row whose charts
// aren't slot-shaped still yields thumbs — fixes strips/cards that read raw legacy fields and showed blanks.
//   front = first role"before" else the first chart · back = first role"after" else (≥2 ? last : null)
//   never front===back unless count===1 (then back=null).
export function chartFaces(row, isStudy) {
  const list = buildChartList(row, isStudy).filter((c) => c && c.img);
  const count = list.length;
  if (count === 0) return { front: null, back: null, count: 0 };
  const front = list.find((c) => c.role === "before") || list[0];
  if (count === 1) return { front, back: null, count };
  let back = list.find((c) => c.role === "after") || list[count - 1];
  if (back === front) back = [...list].reverse().find((c) => c !== front) || null; // collision → a different chart
  return { front, back, count };
}

// ── SECTIONS: group the ordered chart list into the SCR case-study layout (Valen 2026-07-26).
// Returns [{ num, title, charts:[…] }] in list order. Roled charts map to numbered sections; role-null
// charts either drive the numbered "setup/outcome" defaults (when NO chart carries a role) or attach as
// their own unnumbered group (labelled by the chart's own label, else "Chart N") in timeline position.
const _ROLE_SECTION = {
  context: { num: "①", title: "① Context" },
  before: { num: "②", title: "② The Setup" },
  trigger: { num: "③", title: "③ The Trigger" },
  after: { num: "④", title: "④ The Outcome" },
};
export function sectionizeCharts(list) {
  const charts = (list || []).filter((c) => c && c.img);
  if (charts.length === 0) return [];
  const hasRoles = charts.some((c) => c.role && _ROLE_SECTION[c.role]);
  if (!hasRoles) {
    // No roles at all → the invisible default: first chart = the setup, last (if ≥2) = the outcome,
    // anything between = an unnumbered "More charts" group.
    if (charts.length === 1) return [{ num: "②", title: "② The Setup", charts: [charts[0]] }];
    const middles = charts.slice(1, -1);
    const groups = [{ num: "②", title: "② The Setup", charts: [charts[0]] }];
    if (middles.length) groups.push({ num: null, title: "More charts", charts: middles });
    groups.push({ num: "④", title: "④ The Outcome", charts: [charts[charts.length - 1]] });
    return groups;
  }
  // Roles present → walk in order; consecutive same-role charts share one numbered header, null-role
  // charts each become their own unnumbered group titled by their label (or "Chart N").
  const groups = [];
  charts.forEach((c, i) => {
    if (c.role && _ROLE_SECTION[c.role]) {
      const sec = _ROLE_SECTION[c.role];
      const last = groups[groups.length - 1];
      if (last && last._role === c.role) last.charts.push(c);
      else groups.push({ num: sec.num, title: sec.title, _role: c.role, charts: [c] });
    } else {
      groups.push({ num: null, title: c.label || `Chart ${i + 1}`, charts: [c] });
    }
  });
  return groups.map(({ num, title, charts }) => ({ num, title, charts }));
}

// ── The shared vertical chronological editor. Module scope — one instance per editor.
export function ChartSeqEditor({ C, font, busy, list, onChange, onUpload, onZoom, compact }) {
  const items = list || [];
  const [lbox, setLbox] = useState(null); // internal lightbox fallback when the parent gives no onZoom

  const inputS = { background: "var(--w06)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontFamily: font, fontSize: "0.75rem", padding: "7px 10px", outline: "none", width: "100%", maxWidth: "100%", boxSizing: "border-box" };
  const lblStyle = { fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--faint)", margin: "8px 0 4px", display: "block" };
  const ctrlBtn = { flexShrink: 0, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 600, fontSize: "0.6875rem", borderRadius: 999, padding: "5px 9px", cursor: "pointer", lineHeight: 1 };
  const imgStyle = { display: "block", width: "100%", maxWidth: "100%", maxHeight: compact ? 320 : 480, objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}`, background: "var(--w08)", cursor: "zoom-in" };

  const setItem = (i, patch) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= items.length) return; const arr = [...items]; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; onChange(arr); };
  const remove = (i) => { if (!window.confirm("Remove this chart from the list? (the image stays in storage)")) return; onChange(items.filter((_, j) => j !== i)); };
  const zoom = (src, title) => { if (onZoom) onZoom({ src, title }); else setLbox({ src, title }); };

  // Uploads reuse the passed uploadImg(file, slot, cb) helper (bucket trade-charts): probe the callback
  // with {} to lift out the resolved URL, then append the new chart to the list (untagged, oldest-last).
  const doUpload = (file) => {
    if (!file) return;
    const slot = "seq_" + Date.now();
    onUpload(file, slot, (updater) => { const url = updater({})[slot]; if (url) onChange([...items, { img: url, label: "", caption: "", role: null }]); });
  };
  const onPaste = (e) => {
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.type && i.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    e.stopPropagation(); // don't double-fire a parent editor-wide paste handler
    const file = item.getAsFile();
    if (file) doUpload(file);
  };

  return (
    <div onPaste={onPaste} style={{ fontFamily: font, minWidth: 0 }}>
      {items.length === 0 && (
        <div style={{ fontSize: "0.75rem", color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 12, padding: "22px 16px", textAlign: "center", marginBottom: 16, lineHeight: 1.55 }}>
          No charts yet — add or paste your first one below.<br />
          Order them oldest → newest; the first and last become the flash-card front and back automatically.
        </div>
      )}

      {items.map((c, i) => (
        <div key={i} style={{ marginBottom: 20, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, minWidth: 0 }}>
          {/* label + reorder / remove controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ flexShrink: 0, fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums", color: C.muted }}>{i + 1}</span>
            <input value={c.label || ""} onChange={(e) => setItem(i, { label: e.target.value })}
              placeholder="Label this chart — e.g. 'Weekly context' or 'Trigger day'"
              style={{ ...inputS, flex: "1 1 180px", width: "auto", minWidth: 0, textTransform: "uppercase", fontWeight: 600, letterSpacing: ".05em", color: C.white, fontSize: "0.6875rem" }} />
            <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="Move earlier" style={{ ...ctrlBtn, opacity: i === 0 ? 0.35 : 1, cursor: i === 0 ? "default" : "pointer" }}>↑</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move later" style={{ ...ctrlBtn, opacity: i === items.length - 1 ? 0.35 : 1, cursor: i === items.length - 1 ? "default" : "pointer" }}>↓</button>
              <button type="button" onClick={() => remove(i)} title="Remove this chart (the image stays in storage)" style={ctrlBtn}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.borderColor = "var(--red)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}>✕</button>
            </div>
          </div>

          {c.img && <img src={c.img} alt={c.label || "chart"} onClick={() => zoom(c.img, c.label || `Chart ${i + 1}`)} title="Click to zoom" style={imgStyle} />}

          <label style={lblStyle}>Caption</label>
          <textarea value={c.caption || ""} onChange={(e) => setItem(i, { caption: e.target.value })} placeholder="What this chart shows…" style={{ ...inputS, minHeight: 42, resize: "vertical", fontSize: "0.75rem", color: C.text }} />

          {/* role picker — optional; first/last are used automatically */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.6875rem", color: C.muted, flexShrink: 0 }} title="Which flash-card does this feed? (optional — first/last are used automatically)">Flash-card role</span>
            <select value={c.role || ""} onChange={(e) => setItem(i, { role: e.target.value || null })}
              title="Which flash-card does this feed? (optional — first/last are used automatically)"
              style={{ ...inputS, width: "auto", flex: "0 1 200px", maxWidth: "100%", cursor: "pointer", fontSize: "0.75rem", padding: "5px 8px", color: c.role ? C.white : C.muted }}>
              {ROLE_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
        </div>
      ))}

      {/* add-chart bar + paste hint */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 600, fontSize: "0.75rem", padding: "9px 18px", borderRadius: 999, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Uploading…" : "+ Add chart"}
          <input type="file" accept="image/*" disabled={busy} onChange={(e) => { doUpload(e.target.files && e.target.files[0]); e.target.value = ""; }} style={{ display: "none" }} />
        </label>
        <span style={{ fontSize: "0.6875rem", color: C.muted }}>…or copy a chart and press <b style={{ color: C.white }}>⌘V / Ctrl+V</b> here.</span>
      </div>

      {/* internal lightbox (only when the parent didn't hand us an onZoom) */}
      {!onZoom && lbox && createPortal(
        <div onClick={(e) => { if (e.target === e.currentTarget) setLbox(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1560, background: "var(--lightbox)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, color: C.white, fontFamily: font }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--muted)" }}>{lbox.title}</span>
            <button onClick={() => setLbox(null)} style={{ background: "var(--w08)", border: `1px solid ${C.border}`, color: C.muted, width: 40, height: 40, borderRadius: 10, fontSize: "1.125rem", cursor: "pointer" }} aria-label="Close">✕</button>
          </div>
          <img src={lbox.src} alt={lbox.title} onClick={() => setLbox(null)} style={{ maxWidth: "96vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}`, cursor: "zoom-out", display: "block" }} />
        </div>, document.body)}
    </div>
  );
}
