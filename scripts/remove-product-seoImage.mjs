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

async function main() {
  loadDotEnv()
  const { projectId, dataset, token } = readSanityEnvForWrite()
  if (!projectId) throw new Error('缺少 projectId')
  if (!token) throw new Error('缺少寫入 token（SANITY_STUDIO_TOKEN 等）')

  const client = createClient({ projectId, dataset, useCdn: false, apiVersion: API_VERSION, token })
  const ids = await client.fetch('*[_type == "product" && defined(seoImage)]._id')

  console.log(`products with seoImage: ${ids.length}`)
  if (ids.length === 0) return

  const batchSize = 50
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const tx = client.transaction()
    for (const id of batch) {
      tx.patch(id, (p) => p.unset(['seoImage']))
    }
    await tx.commit()
    console.log(`unset batch ${i}..${i + batch.length - 1}`)
  }
  console.log('done.')
}

main().catch((e) => {
  console.error('Failed:', e?.message || e)
  process.exit(1)
})

