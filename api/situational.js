// Vercel Serverless Function — SITUATIONAL AWARENESS override (the dashboard read card).
//
// The card's default text ships in src/situational-data.js (committed, written by Claude with the
// lens refresh). This endpoint carries Valen's TYPED override so an in-app edit reaches members
// immediately, with no rebuild and no new table:
//   GET    → public. Returns the stored doc (or null). Everyone reads through the service key,
//            so there is no RLS problem and members never touch claude_insights directly.
//   POST   → admin only (Supabase JWT verified, email must match ADMIN_EMAIL). Merge-writes the
//            `situational` key of the admin's claude_insights payload. NEVER clobbers the Jarvis
//            keys — same law as scripts/edge-ledger.mjs.
//   DELETE → admin only. Clears the override so the committed Claude read shows again.
//
// Storage note: claude_insights is a per-user jsonb bag that already exists; using its admin row
// avoids a DDL step. If this ever grows past one document, promote it to its own table.

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = "vc-lv@live.com";

const FIELDS = ["headline", "weather", "shop", "flip", "commentary", "asof", "updated"];
const MAX = 6000; // per field — rich-text HTML (bold/colour spans) inflates the raw length
// Courtesy server-side scrub. The REAL defense is the client-side whitelist sanitizer that runs
// on render (sanitizeRich in SituationalRead.jsx) — this just keeps obviously hostile payloads
// out of the row at write time.
const scrub = (s) => String(s)
  .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
  .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, "")
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/javascript\s*:/gi, "");

let _adminId = null;
async function adminUserId(svc) {
  if (_adminId) return _adminId;
  const { data } = await svc.from("profiles").select("id").eq("email", ADMIN_EMAIL).maybeSingle();
  _adminId = data && data.id ? data.id : null;
  return _adminId;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!SB_URL || !SB_SERVICE) {
    return res.status(500).json({ ok: false, error: "Server not configured: missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY." });
  }
  const svc = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const uid = await adminUserId(svc);
    if (!uid) return res.status(500).json({ ok: false, error: "Admin profile not found." });

    // ── READ (public) ──────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const { data } = await svc.from("claude_insights").select("payload").eq("user_id", uid).maybeSingle();
      const doc = (data && data.payload && data.payload.situational) || null;
      // Short edge cache: his edit should show up within a minute, not instantly-hammer the DB.
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=45, stale-while-revalidate=300");
      return res.status(200).json({ ok: true, doc });
    }

    if (req.method !== "POST" && req.method !== "DELETE") {
      return res.status(405).json({ ok: false, error: "Method not allowed." });
    }

    // ── WRITE (admin only) ─────────────────────────────────────────────────────
    const auth = req.headers.authorization || "";
    if (!auth) return res.status(401).json({ ok: false, error: "Not signed in." });
    const asUser = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user } = {}, error: uErr } = await asUser.auth.getUser();
    if (uErr || !user) return res.status(401).json({ ok: false, error: "Your session expired — refresh the page and sign in again." });
    if ((user.email || "").toLowerCase() !== ADMIN_EMAIL) {
      return res.status(403).json({ ok: false, error: "Only the admin account can edit this card." });
    }

    // Read-modify-write: keep every other key in the payload untouched.
    const { data: existing } = await svc.from("claude_insights").select("payload").eq("user_id", uid).maybeSingle();
    const payload = (existing && existing.payload) || {};

    if (req.method === "DELETE") {
      delete payload.situational;
    } else {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const doc = {};
      for (const k of FIELDS) {
        const v = body[k];
        if (v == null) continue;
        doc[k] = scrub(String(v).slice(0, MAX)).trim();
      }
      if (!doc.headline && !doc.weather && !doc.shop && !doc.flip && !doc.commentary) {
        return res.status(400).json({ ok: false, error: "Nothing to save — write at least one line." });
      }
      doc.by = "valen";
      payload.situational = doc;
    }

    const { error: wErr } = await svc.from("claude_insights")
      .upsert({ user_id: uid, payload, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (wErr) return res.status(500).json({ ok: false, error: wErr.message });

    return res.status(200).json({ ok: true, doc: payload.situational || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e) });
  }
}
