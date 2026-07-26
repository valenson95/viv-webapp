// PRE-SHIP GATE — run after `npm run build`, before every push. Catches the free-identifier
// bug class MECHANICALLY (2026-07-26: STUDY_SETUPS referenced in ModelBook without import →
// build green, prod crashed; the manual grep rule was skipped once and that once shipped it).
// Logic: every identifier exported from src/ gets minified/renamed in the production bundle,
// so ANY exported name appearing verbatim in dist output = an unimported free reference
// (the minifier can't rename what isn't bound). Zero hits = pass.
import { readFileSync, readdirSync } from "node:fs";

const ALLOW = new Set(["supabase"]); // appears inside URL strings (x.supabase.co) — known-safe
const srcFiles = readdirSync("src").filter(f => /\.(jsx?|mjs)$/.test(f));
const names = new Set();
for (const f of srcFiles) {
  const txt = readFileSync(`src/${f}`, "utf8");
  for (const m of txt.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    const n = m[1];
    if (n.length >= 6 && !ALLOW.has(n)) names.add(n);
  }
}
const dist = readdirSync("dist/assets").filter(f => /^index-.*\.js$/.test(f));
if (!dist.length) { console.error("preship: no dist/assets/index-*.js — run npm run build first"); process.exit(1); }
let bundle = dist.map(f => readFileSync(`dist/assets/${f}`, "utf8")).join("\n");
// Strip string literals first — UI copy legitimately contains words like "positions"/"EARNINGS";
// a real free-identifier leak lives in CODE position (e.g. STUDY_SETUPS[x]), never inside quotes.
// Proper tokenizer (regex passes break on cross-quote content: a ` inside "…" derails pairing):
// states: code / '…' / "…" / `…` with a ${ } interpolation stack (interpolation content IS code).
function stripStrings(src) {
  let out = "", i = 0, n = src.length;
  const stack = []; // "s" | "d" | "t" (string modes) · numbers = brace depth of a template interpolation
  while (i < n) {
    const ch = src[i], mode = stack[stack.length - 1];
    if (mode === "s" || mode === "d" || mode === "t") {
      if (ch === "\\") { i += 2; continue; }            // skip escaped char
      if ((mode === "s" && ch === "'") || (mode === "d" && ch === '"') || (mode === "t" && ch === "`")) { stack.pop(); out += ch; i++; continue; }
      if (mode === "t" && ch === "$" && src[i + 1] === "{") { stack.push(0); out += "${"; i += 2; continue; }
      i++; continue;                                    // string content — dropped
    }
    // code mode (top level or inside a template interpolation)
    if (ch === "'") { stack.push("s"); out += ch; i++; continue; }
    if (ch === '"') { stack.push("d"); out += ch; i++; continue; }
    if (ch === "`") { stack.push("t"); out += ch; i++; continue; }
    // Comments + regex literals — a quote inside /["']/ would otherwise flip string mode and
    // invert the stripping. Standard heuristic: "/" starts a regex when the previous significant
    // char can't end an expression.
    if (ch === "/") {
      const nx = src[i + 1];
      if (nx === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (nx === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      let j = out.length - 1; while (j >= 0 && /\s/.test(out[j])) j--;
      const prev = j >= 0 ? out[j] : "";
      if (!prev || "(,=:[!&|?{};+-*%~^<>".includes(prev)) {
        out += ch; i++;
        let inClass = false;
        while (i < n) {
          const c2 = src[i];
          if (c2 === "\\") { i += 2; continue; }
          if (c2 === "[") inClass = true;
          else if (c2 === "]") inClass = false;
          else if (c2 === "/" && !inClass) { i++; break; }
          i++;
        }
        while (i < n && /[a-z]/i.test(src[i])) i++; // flags
        out += "/";
        continue;
      }
    }
    if (typeof mode === "number") {
      if (ch === "{") { stack[stack.length - 1]++; }
      if (ch === "}") { if (mode === 0) { stack.pop(); out += ch; i++; continue; } stack[stack.length - 1]--; }
    }
    out += ch; i++;
  }
  return out;
}
bundle = stripStrings(bundle);

// Only EXPRESSION-position hits crash (e.g. `=STUDY_SETUPS[x]`). Property keys (`positions:i`)
// and property access on another object (`y.positions`) are never renamed and are safe — exclude:
// not preceded by `.` or an identifier char, not followed by `:` (key position).
const leaks = [...names].filter(n => new RegExp(`(?<![.\\w$])${n}(?![\\w$])(?!\\s*:)`).test(bundle));
if (leaks.length) {
  console.error(`✗ FREE-IDENTIFIER LEAK — these exported names appear verbatim in the minified bundle`);
  console.error(`  (referenced somewhere without an import → guaranteed runtime ReferenceError):`);
  leaks.forEach(n => console.error(`  · ${n}`));
  process.exit(1);
}
console.log(`✓ preship clean — ${names.size} exported identifiers checked against the bundle, 0 leaks`);
