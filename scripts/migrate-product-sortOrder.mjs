import { createClient } from '@sanity/client'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_VERSION = '2025-03-18'

function loadDotEnv() {
  const here = fileURLToPath(import.meta.url)
  const root = path.resolve(path.dirname(here), '..')
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return

  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/g)) {
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

function parseArgs() {
  const args = process.argv.slice(2)
  return { dryRun: args.includes('--dry-run') }
}

async function main() {
  loadDotEnv()
  const { projectId, dataset, token } = readSanityEnvForWrite()
  if (!projectId) throw new Error('缺少 projectId')
  const { dryRun } = parseArgs()
  if (!dryRun && !token) throw new Error('缺少寫入 token（SANITY_STUDIO_TOKEN 等）')

  const client = createClient({
    projectId,
    dataset,
    useCdn: false,
    apiVersion: API_VERSION,
    ...(token ? { token } : {})
  })

  // 把既有商品依分類分組，並用名稱排序後給 1,2,3... 作為「分類內排序」
  const docs = await client.fetch(
    '*[_type == "product"]{_id, name, "category": category->slug.current, sortOrder} | order(category asc, name asc)'
  )

  /** @type {Map<string, any[]>} */
  const byCat = new Map()
  for (const d of docs) {
    const cat = String(d.category ?? 'uncategorized')
    if (!byCat.has(cat)) byCat.set(cat, [])
    byCat.get(cat).push(d)
  }

  /** @type {{_id:string,name:string,category:string,from:any,to:number}[]} */
  const plan = []
  for (const [cat, items] of byCat.entries()) {
    items.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-Hant'))
    let n = 1
    for (const it of items) {
      plan.push({
        _id: it._id,
        name: it.name,
        category: cat,
        from: it.sortOrder,
        to: n
      })
      n += 1
    }
  }

  console.log(`products: ${docs.length}`)
  console.log(`will set sortOrder for: ${plan.length} (dryRun: ${dryRun})`)

  if (dryRun) {
    console.log('--- preview (first 20) ---')
    for (const p of plan.slice(0, 20)) {
      console.log(`[${p.category}] ${p.name}: ${p.from ?? '∅'} -> ${p.to}`)
    }
    return
  }

  const batchSize = 50
  for (let i = 0; i < plan.length; i += batchSize) {
    const batch = plan.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const p of batch) {
      tx.patch(p._id, (patch) => patch.set({ sortOrder: p.to }))
    }
    await tx.commit()
    console.log(`patched batch ${i}..${i + batch.length - 1}`)
  }

  console.log('done.')
}

main().catch((e) => {
  console.error('Migration failed:', e?.message || e)
  process.exit(1)
})

