// Mirror the ENTIRE trade-charts storage bucket to local disk — the bucket is the only
// copy of every chart image (model book, studies, daily setups, positions); Supabase DB
// backups do NOT include storage objects. Incremental: skips files already mirrored with
// the same size. Mirror lives OUTSIDE the AI-OS tree (media rule).
// Usage: node --env-file=.env.local scripts/mirror-charts.mjs   (or plain node; reads .env.local)
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, existsSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const DEST = `${process.env.HOME}/Desktop/Media/trade-charts-mirror`;
const BUCKET = 'trade-charts';

async function walk(prefix) {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) { console.error('list', prefix, error.message); break; }
    if (!data?.length) break;
    for (const f of data) {
      const p = prefix ? `${prefix}/${f.name}` : f.name;
      if (f.id === null && !f.metadata) out.push(...await walk(p)); // folder
      else out.push({ path: p, size: f.metadata?.size ?? 0 });
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return out;
}

const files = await walk('');
let copied = 0, skipped = 0, failed = 0, bytes = 0;
for (const f of files) {
  const local = join(DEST, f.path);
  if (existsSync(local) && (!f.size || statSync(local).size === f.size)) { skipped++; continue; }
  const { data, error } = await sb.storage.from(BUCKET).download(f.path);
  if (error) { console.error('✗', f.path, error.message); failed++; continue; }
  mkdirSync(dirname(local), { recursive: true });
  const buf = Buffer.from(await data.arrayBuffer());
  writeFileSync(local, buf);
  bytes += buf.length; copied++;
}
console.log(`✓ mirror: ${copied} downloaded (${(bytes/1e6).toFixed(1)} MB) · ${skipped} already current · ${failed} failed · total ${files.length} objects → ${DEST}`);
