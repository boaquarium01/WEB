import { createClient } from '@sanity/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_VERSION = '2025-03-18'
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

function loadDotEnv() {
  // 給本機執行用：把專案根目錄 .env 的值填進 process.env
  const here = fileURLToPath(import.meta.url)
  const root = path.resolve(path.dirname(here), '..')
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return

  const raw = fs.readFileSync(envPath, 'utf8')
  const lines = raw.split(/\r?\n/g)
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const idx = t.indexOf('=')
    if (idx === -1) continue
    const key = t.slice(0, idx).trim()
    const val = t.slice(idx + 1).trim()
    if (!process.env[key] && key) process.env[key] = val
  }
}

function getEnv(key) {
  return process.env[key]?.trim() || ''
}

function readSanityEnvForWrite() {
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID') || getEnv('PUBLIC_SANITY_PROJECT_ID') || ''
  const dataset = getEnv('SANITY_STUDIO_DATASET') || getEnv('PUBLIC_SANITY_DATASET') || 'production'
  const token =
    getEnv('SANITY_STUDIO_TOKEN') ||
    getEnv('SANITY_AUTH_TOKEN') ||
    getEnv('SANITY_API_TOKEN') ||
    getEnv('SANITY_WRITE_TOKEN') ||
    ''

  return { projectId, dataset, token }
}

function random6() {
  return Array.from({ length: 6 }, () => SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)]).join('')
}

function parseArgs() {
  const args = process.argv.slice(2)
  const out = {
    dryRun: args.includes('--dry-run'),
    limit: undefined
  }

  for (const a of args) {
    if (a.startsWith('--limit=')) {
      out.limit = Number(a.slice('--limit='.length))
    }
  }
  return out
}

async function main() {
  loadDotEnv()
  const { projectId, dataset, token } = readSanityEnvForWrite()
  if (!projectId) throw new Error('缺少 SANITY_STUDIO_PROJECT_ID 或 PUBLIC_SANITY_PROJECT_ID')

  const { dryRun, limit } = parseArgs()
  if (!dryRun && !token) throw new Error('缺少寫入 token（請在 .env 設定 SANITY_STUDIO_TOKEN 或 SANITY_WRITE_TOKEN 等）')

  const client = createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    ...(token ? { token } : {})
  })

  // 只抓現有 product slug（slug.current 即產品網址 key）
  const productsQuery = `*[_type == "product" && defined(slug.current)]{_id, "oldSlug": slug.current, name}`
  const products = await client.fetch(productsQuery)
  const target = typeof limit === 'number' && Number.isFinite(limit) ? products.slice(0, limit) : products

  console.log(`products total: ${products.length}`)
  console.log(`will update: ${target.length} (dryRun: ${dryRun})`)

  // 產生新的、彼此不重複的 slug
  const existingSlugs = new Set(products.map((p) => String(p.oldSlug ?? '')))
  const nextSlugs = new Map()
  const used = new Set(existingSlugs)

  for (const p of target) {
    let s = random6()
    while (used.has(s)) s = random6()
    used.add(s)
    nextSlugs.set(p._id, { oldSlug: p.oldSlug, newSlug: s, name: p.name })
  }

  if (dryRun) {
    console.log('--- preview mapping (first 20) ---')
    let i = 0
    for (const v of nextSlugs.values()) {
      console.log(`${v.name}: ${v.oldSlug} -> ${v.newSlug}`)
      i++
      if (i >= 20) break
    }
    return
  }

  // 批量 patch，避免一次 transaction 太大
  const batchSize = 50
  const ids = Array.from(nextSlugs.keys())
  for (let i = 0; i < ids.length; i += batchSize) {
    const batchIds = ids.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const id of batchIds) {
      const { newSlug } = nextSlugs.get(id)
      tx.patch(id, (p) => p.set({ slug: { _type: 'slug', current: newSlug } }))
    }
    await tx.commit()
    console.log(`patched batch ${i}..${i + batchIds.length - 1}`)
  }

  console.log('done.')
}

main().catch((e) => {
  console.error('Migration failed:', e?.message || e)
  process.exit(1)
})

