# VIV Webapp — Claude Code Context

## What This Is
VIV (Valen Insiders Vault) is a swing-trading performance tracker — a React SPA with a Supabase backend, deployed via Vercel auto-deploy from GitHub.

**Live URL:** https://www.valensontrades.com
**Stack:** React 18, Vite, Supabase (auth + PostgreSQL + storage), Recharts, html2canvas, TradingView `lightweight-charts` v4.1.3 (CDN `<script>` in index.html, not npm).
**NO TypeScript, NO Tailwind, NO shadcn.** Zero `.css` files — all styling is CSS-in-JS: inline style objects, plus per-page `<style dangerouslySetInnerHTML>` blocks for `:hover`/`@keyframes`/media queries.

## Working Principles
Behavioral guidelines to reduce common LLM coding mistakes. These bias toward caution over speed; for trivial tasks, use judgment.

**1. Think before coding.** Don't assume, don't hide confusion, surface tradeoffs. State assumptions explicitly; if uncertain, ask. If multiple interpretations exist, present them — don't pick silently. If a simpler approach exists, say so and push back when warranted. If something is unclear, stop and name it.

**2. Simplicity first.** Minimum code that solves the problem; nothing speculative. No features beyond what was asked, no abstractions for single-use code, no unrequested flexibility/configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite it. Ask: "would a senior engineer call this overcomplicated?"

**3. Surgical changes.** Touch only what you must; clean up only your own mess. Don't "improve" adjacent code, comments, or formatting; don't refactor what isn't broken; match existing style even if you'd do it differently. Remove only the imports/variables/functions YOUR changes orphaned — never pre-existing dead code (mention it instead). Every changed line should trace directly to the request. In this repo that specifically means: **never touch a data-writing path (see HARD RULES) without explicit verification.**

**4. Goal-driven execution.** Turn tasks into verifiable goals and loop until verified ("add validation" → "write tests for invalid inputs, then make them pass"). For multi-step work, state a brief plan — each step plus its verification check. Here, "verify" almost always includes a clean `npx vite build` before declaring done.

**Working if:** fewer unnecessary lines in diffs, fewer rewrites from overcomplication, and clarifying questions come *before* implementation rather than after mistakes.

## Architecture
No longer single-file, but `src/App.jsx` (~12k lines) is still the core: auth, page routing, manual save/sync logic, design tokens, and the four core pages (Dashboard, Trade Journal, Premium Tools, Settings) defined inline. Routing is a `page` state variable + conditional render — no router library. Don't split App.jsx further unless explicitly asked.

**Page map** (`page` value → component): `dashboard` → `DashboardPage` (inline) · `journal` → `TradeJournalPage` (inline; includes the admin-only "Jarvis" `CoachHero` performance-analysis block, defined at ~App.jsx:4621, reading `claude_insights`) · `tools` → `PremiumToolsPage` (inline; sub-tabs Setup Grader / Return Simulator / Risk / Expectancy / Risk Finance) · `daily` → `DailySetupsTab` · `modelbook` → `ModelBookPage` · `quant` → `QuantAnalysis` (admin) · `mentor` → `MentorModePage` (nav hidden behind `false &&`) · `settings` → `SettingsPage` (inline). `FeedbackWidget` renders globally outside the page switch. `ThemeStrip`, `MarketContext`, `EdgeLedger` render inside DashboardPage.

**Extracted components** (each receives `C`/`font` as **props** — the tokens are not exported from App.jsx):
- `Calendar.jsx` — monthly/yearly trade calendar; books closed P&L on exit date.
- `DailySetups.jsx` — members' daily-idea feed (reads grader scorecards published by admin).
- `EdgeLedger.jsx` — admin edge/probability dashboard reading `claude_insights` (written by `scripts/edge-ledger.mjs`).
- `Feedback.jsx` — community feedback feed (post/upvote/comment, admin resolve).
- `MarketContext.jsx` — SPY/QQQ market-context card via `/api/candles`.
- `MentorMode.jsx` — admin mentor↔mentee preview (gated on `supabase/mentor.sql`; not launched).
- `ModelBook.jsx` — curated best-setups database; star scoring mirrors Setup Grader's checklist.
- `QuantAnalysis.jsx` — admin quant bench (campaign R analytics, Monte Carlo); has own `QABoundary` error boundary and own local palette `T`.
- `SetupGrader.jsx` — 5-star setup grader; `SECTIONS` checklist is the scoring source of truth (consumed by DailySetups + ModelBook).
- `StudyBook.jsx` — Study Book wing of Model Book (historical exercises); named exports only.
- `TradeReplayChart.jsx` — static lightweight-charts trade-review chart (fills, stop, EMAs, saved drawings).
- `ThemeStrip.jsx` — compact Top-5 1W/1M theme leaders (on Dashboard).
- Dead code, leave alone: `TVChart.jsx` (orphaned, never imported) · `ThemeTracker.jsx` (imported, never rendered).

**Helper modules:** `grades.js` (setup-grade store: Supabase + localStorage cache) · `dailySetups.js` (daily-setups store) · `themes.js` (dated theme-leader snapshots, manually updated) · `sectors.js` (ticker→theme lookup + Finnhub fallback) · `ibkrCsv.js` (pure IBKR CSV parser) · `shareCard.js` (canvas share-card renderer; hardcodes its own colors/font) · `supabaseClient.js` (exports `supabase`, `supabaseUrl`, `supabaseAnonKey`).

**Other directories:** `api/` Vercel serverless functions (see Data Architecture — no longer all read-only) · `scripts/` ~44 one-off Node `.mjs` maintenance/data-fix scripts, run manually · `supabase/` SQL migrations + `SCHEMA.md` (several features soft-fail to a "table missing" state if their `.sql` wasn't run) · `mockups/` static HTML design mockups + guide voiceover audio that the four core pages were rebuilt from.

### UI mode toggles (all localStorage, per-browser)
- **Guided/Pro:** `uiMode` `"guided" | "pro"`, key `"viv-mode"`, derived `expert` boolean. Pro currently just hides guide tooltips/voiceover/welcome banners via CSS classes (`.vd.expert` etc.). Redeclared independently (copy-pasted) in 4 page components — `PremiumToolsPage`, `TradeJournalPage`, `DashboardPage`, `SettingsPage` — kept in sync only via the shared localStorage key, not shared state.
- **Simple/Pro tables:** `tableView` `"simple" | "pro"`, key `"viv-view"`, Dashboard + Journal only. Controls table column sets and is deliberately independent of Guided/Pro.
- **Interface style:** `uiTheme` `"classic" | "zella"` (Settings). Toggles `theme-zella` class on `<body>` → CSS-variable override block in App.jsx ("Zella Clean": flatter look, Inter font).

## Design System (VIV Brand)

### Colors — the `C` object, App.jsx ~line 55 (always use `C`, never hardcode hex)
```
bg #08080e · bg2 #0c0c14 · white #ffffff
text rgba(255,255,255,0.92) · muted rgba(255,255,255,0.70)
gold #c9982a · goldBright #f0c050 · goldMid #b8820a · goldDeep #7a4f00
goldDim rgba(201,152,42,0.15) · borderGold rgba(201,152,42,0.22)
glass rgba(255,255,255,0.042) · border rgba(255,255,255,0.09)
green #22c55e · red #ef4444 · blue #3b82f6 · purple #a78bfa
greenDim/redDim/blueDim/purpleDim — same hues at ~0.10 alpha
```
Known pre-existing duplications (match locally, don't unify unasked): `QuantAnalysis.jsx` palette `T`, `EdgeLedger.jsx` local hex constants, `shareCard.js` canvas constants, `ADMIN_EMAIL` hardcoded in App.jsx + EdgeLedger.jsx + QuantAnalysis.jsx.

### Typography
- Font: the `font` constant — `'Plus Jakarta Sans', -apple-system, sans-serif` (App.jsx line 65).
- ⚠️ Known gap: `index.html` loads Manrope + Inter from Google Fonts but **not** Plus Jakarta Sans, so the app currently falls back to the system font. Don't "fix" in passing — flag when relevant.
- Weights 300–800. Labels: small uppercase with wide letter-spacing; body 0.70–0.88rem; headers 1.05–2rem.

### UI Patterns
- Glassmorphism cards (blur + gradient overlay); pill buttons (`borderRadius: 980`); gold accents on interactive/active elements.
- Animated background (grid + drifting particles + cursor glow).
- Stat grids use `repeat(auto-fit, minmax(...))` so cards stretch full-width; equal-height cards via `height:100%`.
- All P/L `$` and `%` values display at 2 decimals.

## Data Architecture

### Supabase Tables
Core: `positions` (open positions; prices/shares/stops stored as **text**, `commission` numeric) · `trades` (closed trades/journal; soft-delete `is_deleted`; uses `ticker` not `symbol`; `entry_price`/`exit_price` numeric, `shares` integer) · `user_settings` (key-value per user) · `profiles` (display names + prefs) · `access_codes` (registration gate).
Feature tables: `setup_grades` (grades.js) · `daily_setups` (dailySetups.js/SetupGrader) · `model_book` (ModelBook) · `feedback` / `feedback_votes` / `feedback_comments` (Feedback) · `mentor_notes` (MentorMode) · `ibkr_sync_state` (IBKR auto-sync opt-in + last-sync) · `claude_insights` (read-only from the app; written by `scripts/edge-ledger.mjs`).

### api/ directory
Read-only, no DB writes: `candles.js` (Polygon candles proxy), `prices.js` (Finnhub quotes), `sector.js` (Finnhub industry fallback), `ibkr-sync.js` (per-user Flex pull; reconciliation + writes happen client-side behind a confirm).
**Write path — treat as HARD-RULE territory:** `ibkr-cron.js` (weekday 21:30 cron per vercel.json; iterates opted-in users, updates `ibkr_sync_state.last_synced_at`) → calls `ibkr-ingest.js` (service-role key; the ONLY server writer of synced fills — idempotent upsert on `(user_id, ib_exec_id)` into `trades`/`positions`, append-only, never deletes).

### Save Architecture
- **Positions/trades: manual save only** — the user clicks "Save". No autosave, **no emergency save** (removed): `beforeunload` only shows the browser leave-warning when dirty; `visibilitychange` re-*fetches* positions for cross-device sync and bails if local edits are unsaved. The legacy `viv_emergency_positions_*` localStorage key is read-and-cleared on load only — nothing writes it anymore.
- **Settings/profile fields autosave** (1s debounce) into `profiles`/`user_settings`.
- **IBKR auto-sync** (cron → ingest, above) is the one unattended write path.
- Upsert pattern: update existing → insert new. The single delete-then-insert is `daily_setups` republish, scoped to the same ticker+date row.

### HARD RULES — Data Integrity
1. **ZERO tolerance for data loss.** Upsert only — no destructive DB patterns.
2. **Never wipe existing data.** Always additive or update-in-place.
3. **Never modify a data-writing path** without explicit verification — save logic, field names, cell-write wiring in App.jsx, `grades.js`/`dailySetups.js` stores, and `api/ibkr-ingest.js`/`ibkr-cron.js`.
4. All changes must be build-verified before deploy.

## Build Commands
```bash
npm run dev                                            # dev server (localhost:5173)
npx vite build --outDir /tmp/viv-build --emptyOutDir   # production build (use /tmp to avoid EPERM)
```
If a build fails with `Cannot find module '@rollup/rollup-darwin-arm64'` (npm optional-deps bug):
```bash
npm install --no-save "@rollup/rollup-darwin-arm64@$(node -p "require('./node_modules/rollup/package.json').version")"
```

## Conventions
- All styles are CSS-in-JS — NO `.css` files, NO Tailwind classes. Colors via `C`, font via `font`; extracted components take both as props (never re-import or redefine unless matching an existing local duplication).
- Plain function components; the only classes are `ErrorBoundary` (App.jsx) and `QABoundary` (QuantAnalysis.jsx).
- State: React hooks only — no external state libraries. Per-browser UI prefs go to localStorage (`viv-*` keys); cross-device prefs go to `user_settings`/`profiles`.
- Admin gating: hardcoded `ADMIN_EMAIL` check.

## What NOT To Do
- Never add TypeScript, Tailwind, or shadcn.
- Never use destructive database patterns (DELETE-then-INSERT).
- Never remove or modify data-writing paths without explicit verification.
- Never split App.jsx into more files, delete "dead" components, or unify duplicated constants without being asked.
- Never crop chart screenshots — full, uncropped, original aspect ratio only.
- Never use MonAlert, SEPA, Minervini, or M360 terminology in any user-facing output.
- Always build-verify before declaring changes done.
