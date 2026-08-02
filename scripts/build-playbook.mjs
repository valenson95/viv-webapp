// Render the 21 Building Blocks book to a REAL, shareable page: public/playbook.html
//
// Why this exists: opening the book in-app produces a blob: URL. A blob URL is a handle that
// only exists inside the tab that made it — it cannot be pasted into Skool, or anywhere else.
// This writes the same HTML to a static file so it has a permanent address:
//     https://www.valensontrades.com/playbook
//
// The page is self-contained (inline CSS + inline lightbox script; images are absolute Supabase
// URLs; fonts come from Google). It carries noindex, so it is shareable by link but will not turn
// up in search — the content is member material.
//
// Run: node scripts/build-playbook.mjs
// Re-run it after ANY edit to PLAYBOOK_* in src/ModelBook.jsx, or the page goes stale. The check
// at the bottom prints the piece count so a silent truncation is visible.

import { execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "playbook.html");

// esbuild resolves node_modules from the ENTRY path, so the temp entry must live inside the repo.
const work = mkdtempSync(join(ROOT, ".playbook-build-"));
try {
  writeFileSync(join(work, "entry.mjs"),
    `import { openPlaybookBook } from "../src/ModelBook.jsx";\nglobalThis.__open = openPlaybookBook;\n`);

  // Minimal browser surface. Keep the REAL URL class — supabase-js calls `new URL()` at module
  // load and replacing it wholesale breaks the bundle.
  writeFileSync(join(work, "stub.cjs"), `
    let captured = "";
    global.window = { location: { origin: "https://www.valensontrades.com" },
      open: () => ({ document: { write() {}, close() {} }, focus() {} }) };
    global.document = { body: { className: "" }, documentElement: { className: "" },
      createElement: () => ({ style: {}, click() {}, setAttribute() {} }) };
    global.Blob = class { constructor(parts) { captured = parts.join(""); } };
    global.URL.createObjectURL = () => "blob:build";
    global.URL.revokeObjectURL = () => {};
    global.__getCaptured = () => captured;
  `);

  execFileSync("npx", ["esbuild", join(work, "entry.mjs"), "--bundle", "--format=cjs",
    `--outfile=${join(work, "bundle.cjs")}`, "--loader:.js=jsx", "--loader:.jsx=jsx", "--jsx=automatic",
    `--define:import.meta.env.VITE_SUPABASE_URL="https://stub.supabase.co"`,
    `--define:import.meta.env.VITE_SUPABASE_ANON_KEY="stub"`,
    `--define:import.meta.env.MODE="production"`,
    "--external:html2canvas", "--external:recharts"], { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] });

  writeFileSync(join(work, "render.cjs"),
    `require("./stub.cjs"); require("./bundle.cjs"); global.__open();
     require("fs").writeFileSync(process.argv[2], global.__getCaptured()); process.exit(0);`);

  mkdirSync(join(ROOT, "public"), { recursive: true });
  execFileSync("node", [join(work, "render.cjs"), OUT], { cwd: ROOT, stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const html = readFileSync(OUT, "utf8");
const pieces = (html.match(/class="page pbpiece/g) || []).length;
const figs = (html.match(/class="pcBlk pbfig/g) || []).length;
if (pieces < 21) throw new Error(`only ${pieces} piece pages rendered — expected 21. Not shipping a truncated book.`);
if (!/noindex/.test(html)) throw new Error("noindex meta missing — refusing to publish member material to search engines.");
if (!/width=device-width/.test(html)) throw new Error("viewport meta missing — the page would be unreadable on a phone.");
console.log(`public/playbook.html  ${(html.length / 1024).toFixed(0)}KB · ${pieces} pieces · ${figs} figures`);
console.log("live at https://www.valensontrades.com/playbook after the next deploy");
