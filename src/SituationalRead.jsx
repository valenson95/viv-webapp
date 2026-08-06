import React, { useEffect, useMemo, useRef, useState } from "react";
import { SITUATIONAL } from "./situational-data.js";
import { MARKET_MONITOR } from "./marketMonitor-data.js";
import { GROUP_RS } from "./groupRS-data.js";
import { latestSnapshot } from "./themes.js";
import { readBreadth } from "./MarketMonitor.jsx";
import { InfoDot, Tip } from "./GroupRS.jsx";
import { LensCamera, XShare } from "./capture.jsx";
import { supabase } from "./supabaseClient.js";

// ── SITUATIONAL AWARENESS ────────────────────────────────────────────────────
// Sits directly under the lens cards (Theme Leaders · Rotation · Breadth · Earnings) and answers,
// in a few plain sentences, the question the tables leave open: given all of this together, is
// this weather going to play out — and if you were buying, which neighbourhood would you shop?
//
// TWO LAYERS, on purpose:
//   1. THE WRITTEN READ — prose. The default ships committed in situational-data.js: Claude writes
//      it as part of EVERY lens refresh (HARD rule, Valen 2026-08-02 — breadth/rotation/themes/
//      earnings and this verdict move as ONE push). Valen can type straight over it here
//      (admin ✎ → /api/situational) with rich text — bold / italic / underline / colour / size —
//      and his note wins while its `updated` stamp is at least as new as the file's.
//   2. THE SPINE — chips computed live from the same data files, so the numbers can never drift
//      from the tables above even when the paragraph is a day old.
//
// The copy describes what the lenses show — it never instructs.

const canonicalApi = (path) => {
  const onVst = typeof window !== "undefined" && /(^|\.)valensontrades\.com$/i.test(window.location.hostname);
  return onVst ? `https://www.valensontrades.com${path}` : path;
};

// ── rich-text sanitizer — the ONLY path to dangerouslySetInnerHTML ───────────
// Whitelist: inline formatting tags + the styles the toolbar can produce. Everything else
// (scripts, handlers, links, images, classes) is stripped. Runs on RENDER, so even a hostile
// stored doc can't execute — the server check is a courtesy, this is the defense.
const OK_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "SPAN", "FONT", "UL", "OL", "LI"]);
const OK_STYLE = new Set(["color", "font-size", "font-weight", "font-style", "text-decoration"]);
export function sanitizeRich(html) {
  if (html == null) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");
  const walk = (node) => {
    [...node.childNodes].forEach((ch) => {
      if (ch.nodeType === Node.TEXT_NODE) return;
      if (ch.nodeType !== Node.ELEMENT_NODE || !OK_TAGS.has(ch.tagName)) {
        // unwrap unknown elements (keep their text), drop comments etc.
        if (ch.nodeType === Node.ELEMENT_NODE) { walk(ch); ch.replaceWith(...ch.childNodes); }
        else ch.remove();
        return;
      }
      // scrub attributes: keep only a filtered style; convert legacy <font color> to style.
      const color = ch.tagName === "FONT" ? ch.getAttribute("color") : null;
      const style = ch.getAttribute("style") || "";
      [...ch.attributes].forEach(a => ch.removeAttribute(a.name));
      const kept = style.split(";").map(s => s.trim()).filter(s => {
        const k = s.slice(0, s.indexOf(":")).trim().toLowerCase();
        return OK_STYLE.has(k) && !/url|expression|javascript/i.test(s);
      });
      if (color && /^#?[a-z0-9(),.\s%]+$/i.test(color)) kept.push(`color:${color}`);
      if (kept.length) ch.setAttribute("style", kept.join(";"));
      walk(ch);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

// Groups ranked top by monthly RS that are ALSO close to their 52-week high — strength that is
// still a trend, as opposed to strength that is a bounce off a deep hole.
const NEAR_HIGH = -8;   // % off the 52-week high still counted as "near its high"
const DEEP = -15;       // matches the rotation table's own off-floor flag

const PALETTE = ["var(--white)", "var(--greenFg)", "var(--redFg)", "var(--blueFg)", "var(--muted)"];
const SIZES = [["S", "12px"], ["M", "14px"], ["L", "17px"]];

// One rich-text field: label + toolbar + contentEditable box. execCommand is deprecated but
// universally supported for exactly this scale of editor — no dependency, no schema.
function RichField({ C, font, label, value, onChange, minH = 96 }) {
  const ref = useRef(null);
  // Seed once; afterwards the DOM owns the content (re-seeding on each keystroke resets the caret).
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ""; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c, arg) => (e) => { e.preventDefault(); document.execCommand(c, false, arg); if (ref.current) onChange(ref.current.innerHTML); };
  const tbtn = { fontFamily: font, fontSize: "0.6875rem", fontWeight: 500, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 999, border: `1px solid ${C.border}`, background: "var(--w04)", color: C.text, cursor: "pointer", lineHeight: 1 };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--muted)" }}>{label}</span>
        <span style={{ display: "inline-flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
          <button type="button" style={tbtn} onMouseDown={cmd("bold")} title="Bold"><b>B</b></button>
          <button type="button" style={{ ...tbtn, fontStyle: "italic" }} onMouseDown={cmd("italic")} title="Italic">I</button>
          <button type="button" style={{ ...tbtn, textDecoration: "underline" }} onMouseDown={cmd("underline")} title="Underline">U</button>
          {SIZES.map(([t, px]) => (
            <button key={t} type="button" style={{ ...tbtn, fontSize: t === "S" ? "0.6875rem" : t === "L" ? "0.8125rem" : "0.75rem" }} title={`Text size ${t}`}
              onMouseDown={(e) => { e.preventDefault(); document.execCommand("fontSize", false, "7"); if (ref.current) { ref.current.querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement("span"); s.style.fontSize = px; s.innerHTML = f.innerHTML; f.replaceWith(s); }); onChange(ref.current.innerHTML); } }}>{t}</button>
          ))}
          {PALETTE.map(col => (
            <button key={col} type="button" title="Text colour" onMouseDown={cmd("foreColor", col)}
              style={{ ...tbtn, minWidth: 16, width: 16, height: 16, padding: 0, borderRadius: 999, background: col, border: "1px solid rgba(0,0,0,0.4)" }} />
          ))}
          <button type="button" style={tbtn} onMouseDown={cmd("insertUnorderedList")} title="Bullet list">•</button>
          <button type="button" style={tbtn} onMouseDown={cmd("removeFormat")} title="Clear formatting">✕</button>
        </span>
      </div>
      {/* fontSize 1rem = 16px: anything smaller makes iOS Safari zoom the page the moment this gets focus. */}
      <div ref={ref} className="sitedit" contentEditable suppressContentEditableWarning
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        style={{ minHeight: minH, background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 9, color: C.text, fontFamily: font, fontSize: "1rem", lineHeight: 1.65, padding: "10px 12px", outline: "none", overflowWrap: "break-word" }} />
    </div>
  );
}

export default function SituationalRead({ C, font, session, isAdmin }) {
  const cardRef = useRef(null);
  const [doc, setDoc] = useState(null);          // Valen's typed override, if any
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(canonicalApi("/api/situational"))
      .then(r => r.json())
      .then(j => { if (alive && j && j.ok && j.doc) setDoc(j.doc); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Whichever read is NEWER wins: a fresh Claude push supersedes an old typed note, and a fresh
  // typed note supersedes the committed file. "Clear my note" removes the override outright.
  const read = useMemo(() => {
    if (doc && (doc.updated || "") >= (SITUATIONAL.updated || "")) return { ...SITUATIONAL, ...doc };
    return SITUATIONAL;
  }, [doc]);
  const isOverride = read !== SITUATIONAL;

  // ── the live spine ─────────────────────────────────────────────────────────
  const spine = useMemo(() => {
    const rows = (MARKET_MONITOR && MARKET_MONITOR.rows) || [];
    const b = readBreadth(rows[rows.length - 1] || {});
    const g = ((GROUP_RS && GROUP_RS.rows) || []).filter(r => r.rs1m != null);
    const ranked = [...g].sort((a, b2) => (b2.rs1m - a.rs1m) || ((b2.thrust || 0) - (a.thrust || 0)));
    const lead = ranked.slice(0, 15);
    const nearHigh = lead.filter(r => r.off52 != null && r.off52 >= NEAR_HIGH).slice(0, 3);
    const bouncing = lead.filter(r => r.off52 != null && r.off52 <= DEEP);
    const snap = latestSnapshot();
    const wk = (snap && snap.week) || [];
    return {
      breakouts: b.breakouts.more,
      nearHigh,
      bouncing: bouncing.length,
      themes: wk.slice(0, 3).map(x => x[0]),
      dataAsof: (MARKET_MONITOR && MARKET_MONITOR.asof) || null,
      themeAsof: (snap && snap.date) || null,
    };
  }, []);

  // The lenses have moved on since the paragraph was written — say so rather than let a stale
  // read look current (HARD: a data push must always move the visible stamp).
  const stale = spine.dataAsof && read.asof && spine.dataAsof > read.asof;

  const startEdit = () => {
    setErr("");
    setForm({
      headline: sanitizeRich(read.headline || ""),
      weather: sanitizeRich(read.weather || ""),
      shop: sanitizeRich(read.shop || ""),
      flip: sanitizeRich(read.flip || ""),
      commentary: sanitizeRich(read.commentary || ""),
      stance: read.stance || "NEUTRAL",
    });
    setEditing(true);
  };

  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const send = async (method, body) => {
    setSaving(true); setErr("");
    try {
      const { data: { session: fresh } } = await supabase.auth.getSession();
      const res = await fetch(canonicalApi("/api/situational"), {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${fresh?.access_token || session?.access_token || ""}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json();
      if (!j.ok) { setErr(j.error || "Save failed."); return false; }
      setDoc(j.doc || null);
      setEditing(false);
      return true;
    } catch (e) {
      setErr(String((e && e.message) || e));
      return false;
    } finally { setSaving(false); }
  };

  const save = () => send("POST", { ...form, asof: spine.dataAsof || read.asof, updated: todayLocal() });
  const reset = () => { if (window.confirm("Clear your note and show the written read that ships with the app?")) send("DELETE"); };

  const blockLabel = { fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--muted)", marginBottom: 7 };
  const blockBody = { fontSize: "0.75rem", lineHeight: 1.65, color: C.text, overflowWrap: "break-word" };
  const btn = (primary) => ({ fontFamily: font, fontSize: "0.75rem", fontWeight: 500, padding: "7px 14px", borderRadius: 999, cursor: saving ? "wait" : "pointer", border: `1px solid ${primary ? "var(--borderGold)" : C.border}`, background: primary ? "var(--goldDim)" : "var(--w03)", color: primary ? (C.goldBright || C.gold) : C.muted });

  const Rich = ({ html, style }) => <div className="sitrich" style={style} dangerouslySetInnerHTML={{ __html: sanitizeRich(html) }} />;

  // STANCE — the one word the whole card exists to deliver, shown as a badge in the header.
  // Colour carries the meaning: green = risk on · gold = neutral · red = risk off.
  const STANCE = {
    "RISK ON": { fg: "var(--greenFg)", bg: "rgba(0,200,5,0.14)", bd: "rgba(0,200,5,0.4)" },
    "NEUTRAL": { fg: "var(--blueFg)", bg: "rgba(59,158,255,0.14)", bd: "rgba(59,158,255,0.4)" },
    "RISK OFF": { fg: "var(--redFg)", bg: "rgba(255,80,0,0.14)", bd: "rgba(255,80,0,0.4)" },
  };
  const st = STANCE[(read.stance || "").toUpperCase()];

  return (
    <div ref={cardRef} className="card" style={{ fontFamily: font, display: "flex", flexDirection: "column" }}>
      {/* Bullets are the house format for this card (Valen 2026-08-02: point form, punchy).
          Tight leading, gold markers, no default browser indent blowout. */}
      <style>{`
        .sitrich ul, .sitedit ul{margin:0; padding-left:16px; list-style:none}
        .sitrich li, .sitedit li{position:relative; padding-left:2px; margin:0 0 7px}
        .sitrich li:last-child, .sitedit li:last-child{margin-bottom:0}
        .sitrich li::before, .sitedit li::before{content:'▸'; position:absolute; left:-14px; color:var(--faint); font-size:0.7em; top:0.15em}
        .sitrich b, .sitedit b, .sitrich strong{color:${C.white}; font-weight:700}
      `}</style>
      <div className="cardhead">
        <span className="label" style={{ flex: "none" }}>Situational Awareness</span>
        {st && (
          <span title={`Stance: ${read.stance.toUpperCase()}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 4, padding: "3px 10px", borderRadius: 999, background: st.bg, border: `1px solid ${st.bd}` }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: C.muted }}>Stance</span>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.02em", color: st.fg }}>{read.stance.toUpperCase()}</span>
          </span>
        )}
        <InfoDot tip={{ lead: "Every table above, boiled down to one verdict.", points: [
          "The weather — what the market is actually doing",
          "The neighbourhood — where the strength is",
          "What would change it",
          "Ends with a stance: risk on, neutral, or risk off",
        ] }} />
        <LensCamera getEl={() => cardRef.current} name="situational" C={C} style={{ marginLeft: 6 }} />
        {/* Post to X shares the IMAGE + a short hook — never the full read as text (the card is the
            product; the paragraph belongs on the site, not pasted into a post). */}
        <XShare getEl={() => cardRef.current} C={C} />
        {/* No standing date stamp — the Daily Plan section header carries the ONE batch stamp.
            Only a typed override gets its own small marker, since it can move independently. */}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
          {isAdmin && !editing && (
            <button onClick={startEdit} data-html2canvas-ignore="true" title="Type your own read — it goes live for members on save"
              style={{ ...btn(false), padding: "5px 11px" }}>✎ Edit</button>
          )}
          {isOverride && read.updated && (
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: C.muted, fontVariantNumeric: "tabular-nums" }}>note · {read.updated}</span>
          )}
        </span>
      </div>

      {stale && (
        <div style={{ marginBottom: 12, fontSize: "0.75rem", lineHeight: 1.5, color: C.muted, background: "var(--w06)", border: "1px solid var(--w14)", borderRadius: 9, padding: "7px 11px" }}>
          Written for the {read.asof} close — the tables above have since updated to {spine.dataAsof}. The chips below are current.
        </div>
      )}

      {editing ? (
        <div style={{ display: "grid", gap: 13 }}>
          <RichField C={C} font={font} label="The call — one or two lines" value={form.headline} onChange={(v) => setForm(f => ({ ...f, headline: v }))} minH={44} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--muted)" }}>Stance</span>
            {["RISK ON", "NEUTRAL", "RISK OFF"].map(k => {
              const on = (form.stance || "").toUpperCase() === k;
              const c = STANCE[k];
              return (
                <button key={k} type="button" onClick={() => setForm(f => ({ ...f, stance: k }))}
                  style={{ fontFamily: font, fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.02em", padding: "5px 13px", borderRadius: 999, cursor: "pointer",
                    border: `1px solid ${on ? c.bd : C.border}`, background: on ? c.bg : "var(--w03)", color: on ? c.fg : C.muted }}>{k}</button>
              );
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
            <RichField C={C} font={font} label="The weather" value={form.weather} onChange={(v) => setForm(f => ({ ...f, weather: v }))} />
            <RichField C={C} font={font} label="The neighbourhood" value={form.shop} onChange={(v) => setForm(f => ({ ...f, shop: v }))} />
            <RichField C={C} font={font} label="What would change it" value={form.flip} onChange={(v) => setForm(f => ({ ...f, flip: v }))} />
          </div>
          <RichField C={C} font={font} label="Market commentary — optional, your own words" value={form.commentary} onChange={(v) => setForm(f => ({ ...f, commentary: v }))} minH={70} />
          {err && <div style={{ fontSize: "0.75rem", color: C.red }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={save} disabled={saving} style={btn(true)}>{saving ? "Saving…" : "Save — live for members"}</button>
            <button onClick={() => setEditing(false)} disabled={saving} style={btn(false)}>Cancel</button>
            {isOverride && <button onClick={reset} disabled={saving} style={{ ...btn(false), marginLeft: "auto" }}>Clear my note</button>}
          </div>
        </div>
      ) : (
        <>
          {/* THE CALL — one punchy line, gold rule on the left so it reads as the verdict */}
          {read.headline && (
            <Rich html={read.headline} style={{ borderLeft: `2px solid var(--w35)`, paddingLeft: 13, marginBottom: 15, fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.5, color: C.white, letterSpacing: "-0.012em" }} />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20 }}>
            <div><div style={blockLabel}>The weather</div><Rich html={read.weather} style={blockBody} /></div>
            <div><div style={blockLabel}>The neighbourhood</div><Rich html={read.shop} style={blockBody} /></div>
            <div><div style={blockLabel}>What would change it</div><Rich html={read.flip} style={blockBody} /></div>
          </div>
          {read.commentary && (
            <div style={{ marginTop: 15, padding: "11px 14px", borderRadius: 11, background: "var(--w02)", border: `1px solid ${C.border}` }}>
              <div style={blockLabel}>Market commentary</div>
              <Rich html={read.commentary} style={blockBody} />
            </div>
          )}
        </>
      )}

      {/* THE SPINE — computed live from the same data files, so the numbers can never drift from
          the tables above even if the paragraph is a day old. */}
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBlockStart: 15 }}>
        <Chip C={C} label="Breakouts" value={spine.breakouts ? "MORE likely" : "LESS likely"} tone={spine.breakouts ? "green" : "red"} />
        {spine.nearHigh.length > 0 && (
          <Chip C={C} label="Strong and near highs" value={spine.nearHigh.map(r => r.t).join(" · ")} title={spine.nearHigh.map(r => `${r.t} — ${r.name} (${Math.round(r.off52)}% off its 52-week high)`).join("\n")} />
        )}
        {spine.bouncing > 0 && (
          <Chip C={C} label="Top-ranked but far below highs" value={String(spine.bouncing)} tone="amber" title="Groups in the top 15 by monthly RS that still sit 15% or more below their 52-week high — strength that is a bounce, not a breakout." />
        )}
        {spine.themes.length > 0 && (
          <Chip C={C} label="Themes this week" value={spine.themes.join(" · ")} title={spine.themeAsof ? `Theme tracker, updated ${spine.themeAsof}` : undefined} />
        )}
        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: C.muted, opacity: 0.8 }}>
          A read of the lenses above.
        </span>
      </div>
    </div>
  );
}

// Chip tooltips go through Tip (portal, opens on hover with NO delay and flips at the viewport
// edge). The native `title` attribute was used here first — the browser holds it back ~1s and
// clips it inside the card, which is exactly what Valen flagged 2026-08-02. Never use `title`
// for anything a member is meant to read.
function Chip({ C, label, value, tone, title }) {
  const fg = tone === "green" ? C.green : tone === "red" ? C.red : tone === "amber" ? C.orange : C.text;
  const body = (
    <>
      <span style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--faint)" }}>{label}</span>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: fg, whiteSpace: "nowrap" }}>{value}</span>
    </>
  );
  const style = { display: "inline-flex", alignItems: "baseline", gap: 7, padding: "5px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: "var(--w03)", cursor: title ? "help" : "default" };
  return title ? <Tip tip={title} style={style}>{body}</Tip> : <span style={style}>{body}</span>;
}
