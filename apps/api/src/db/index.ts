import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

// 在 import 阶段加载 apps/api/.env（ESM import 先于 index.ts 的运行时 .env 加载执行，
// 这里必须自行加载，否则创建 Pool 时 DATABASE_URL 还是空的）
try {
  const __filename = fileURLToPath(import.meta.url)
  const envPath = resolve(dirname(__filename), '..', '..', '.env')
  if (existsSync(envPath)) {
    for (const rawLine of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const [, key, tail] = m
      if (key in process.env) continue
      let value = tail.trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      const hashIdx = value.search(/\s+#\s*/)
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim()
      process.env[key] = value
    }
  }
} catch {}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('缺少 DATABASE_URL 环境变量')
}

export const pool = new Pool({ connectionString, max: 20 })

export const db = drizzle(pool, { schema })

export async function ping(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch (e) {
    console.error('[db] 连接失败:', e)
    return false
  }
}
