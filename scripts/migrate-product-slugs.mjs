/**
 * 將所有商品 slug 改為新的 4 碼（小寫英文 + 數字），彼此不重複。
 *
 * 執行前請備份 dataset。舊網址會失效，必要時請自行做 301。
 *
 * 用法（專案根目錄 electrical-earth，需與 product-create 相同的 Sanity 環境變數）：
 *   node --env-file=.env scripts/migrate-product-slugs.mjs
 *   node --env-file=.env scripts/migrate-product-slugs.mjs --dry-run
 */

import { createClient } from '@sanity/client';

const API_VERSION = '2025-03-18';
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LEN = 4;
const TX_CHUNK = 150;

function randomSlug() {
  let s = '';
  for (let i = 0; i < SLUG_LEN; i++) {
    s += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return s;
}

function readSanityEnv() {
  const projectId =
    process.env.SANITY_STUDIO_PROJECT_ID?.trim() ||
    process.env.PUBLIC_SANITY_PROJECT_ID?.trim() ||
    '';
  const dataset =
    process.env.SANITY_STUDIO_DATASET?.trim() ||
    process.env.PUBLIC_SANITY_DATASET?.trim() ||
    'production';
  const token =
    process.env.SANITY_STUDIO_TOKEN?.trim() ||
    process.env.SANITY_AUTH_TOKEN?.trim() ||
    process.env.SANITY_API_TOKEN?.trim() ||
    process.env.SANITY_WRITE_TOKEN?.trim() ||
    '';
  return { projectId, dataset, token };
}

function pickUnique(reserved) {
  for (;;) {
    const c = randomSlug();
    if (!reserved.has(c)) {
      reserved.add(c);
      return c;
    }
  }
}

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const { projectId, dataset, token } = readSanityEnv();
  if (!projectId) {
    console.error('缺少 SANITY_STUDIO_PROJECT_ID 或 PUBLIC_SANITY_PROJECT_ID');
    process.exit(1);
  }
  if (!token) {
    console.error('缺少寫入 Token（SANITY_STUDIO_TOKEN 等）');
    process.exit(1);
  }

  const client = createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    token
  });

  const docs = await client.fetch(`*[_type == "product"]{ _id, "old": slug.current }`);

  if (!docs?.length) {
    console.log('沒有商品文件，結束。');
    return;
  }

  const reserved = new Set();
  for (const d of docs) {
    const o = d.old ? String(d.old).trim() : '';
    if (o) reserved.add(o);
  }

  const pairs = [];
  for (const d of docs) {
    const next = pickUnique(reserved);
    pairs.push({ _id: d._id, old: d.old ?? '', next });
  }

  console.log(`共 ${pairs.length} 筆商品${dryRun ? '（dry-run，不寫入）' : ''}。`);
  pairs.slice(0, 8).forEach((p) => console.log(`  ${p._id}: "${p.old}" → "${p.next}"`));
  if (pairs.length > 8) console.log(`  … 其餘 ${pairs.length - 8} 筆`);

  if (dryRun) return;

  for (let i = 0; i < pairs.length; i += TX_CHUNK) {
    const slice = pairs.slice(i, i + TX_CHUNK);
    let trx = client.transaction();
    for (const p of slice) {
      trx = trx.patch(p._id, { set: { slug: { _type: 'slug', current: p.next } } });
    }
    await trx.commit();
    console.log(`已提交 ${Math.min(i + TX_CHUNK, pairs.length)} / ${pairs.length}`);
  }

  console.log('完成。');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
