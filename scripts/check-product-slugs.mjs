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

async function main() {
  loadDotEnv()
  const projectId = getEnv('SANITY_STUDIO_PROJECT_ID') || getEnv('PUBLIC_SANITY_PROJECT_ID')
  const dataset = getEnv('SANITY_STUDIO_DATASET') || getEnv('PUBLIC_SANITY_DATASET') || 'production'
  if (!projectId) throw new Error('missing projectId')

  const client = createClient({ projectId, dataset, useCdn: false, apiVersion: API_VERSION })
  const docs = await client.fetch(
    '*[_type == "product"]{_id, name, "slug": slug.current} | order(_updatedAt desc)[0...9]'
  )
  console.log(docs)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})

