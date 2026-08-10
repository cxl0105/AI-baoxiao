import { drizzle } from 'drizzle-orm/node-postgres'
import { Client } from 'pg'
import * as schema from './schema'

let _client: Client | null = null

export async function getDb() {
  if (!_client) {
    _client = new Client({
      connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/reimbursement',
    })
    await _client.connect()
    console.log('✅ 数据库连接成功')
  }
  return drizzle(_client, { schema })
}

export type Db = Awaited<ReturnType<typeof getDb>>
export { schema }
