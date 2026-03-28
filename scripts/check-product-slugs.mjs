/**
 * 檢查所有商品的 slug 是否為「恰好 4 碼、僅 a-z0-9」。
 * 讀取專案根目錄 .env（PUBLIC_SANITY_PROJECT_ID 等），只需讀取權限。
 *
 *   node scripts/check-product-slugs.mjs
 */

import { createClient } from '@sanity/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_VERSION = '2025-03-18';
const EXPECT_LEN = 4;
const VALID_RE = /^[a-z0-9]{4}$/;

function loadDotEnv() {
  const here = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(here), '..');
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/g)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim();
    if (!process.env[key] && key) process.env[key] = val;
  }
}

function getEnv(key) {
  return process.env[key]?.trim() || '';
}

async function main() {
  loadDotEnv();
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID') || getEnv('PUBLIC_SANITY_PROJECT_ID');
  const dataset = getEnv('SANITY_STUDIO_DATASET') || getEnv('PUBLIC_SANITY_DATASET') || 'production';
  if (!projectId) throw new Error('缺少 PUBLIC_SANITY_PROJECT_ID（或 SANITY_STUDIO_PROJECT_ID）');

  const client = createClient({ projectId, dataset, useCdn: false, apiVersion: API_VERSION });
  const docs = await client.fetch('*[_type == "product"]{_id, name, "slug": slug.current}');

  const total = docs.length;
  const bad = [];
  for (const d of docs) {
    const s = d.slug != null ? String(d.slug).trim() : '';
    if (!VALID_RE.test(s)) bad.push({ _id: d._id, name: d.name, slug: s || '(空)' });
  }

  console.log(`商品總數: ${total}`);
  console.log(`符合 ${EXPECT_LEN} 碼（a-z0-9）: ${total - bad.length}`);
  console.log(`不符合: ${bad.length}`);

  if (bad.length) {
    console.log('\n需修正或執行 npm run migrate:product-slugs 的項目：');
    for (const b of bad) console.log(`  ${b.slug}  ← ${b.name ?? ''} (${b._id})`);
    process.exitCode = 1;
  } else {
    console.log('\n全部為四碼子頁網址規則。');
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
