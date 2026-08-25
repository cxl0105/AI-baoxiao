import bcrypt from 'bcryptjs'
import { db } from './index'
import { users } from './schema'
import { eq } from 'drizzle-orm'

async function main() {
  const pwd = process.env.PLATFORM_ADMIN_PASSWORD
  if (!pwd || pwd.length < 8) {
    console.error('[FATAL] 必须设置环境变量 PLATFORM_ADMIN_PASSWORD（≥8位）后才能初始化平台管理员。')
    process.exit(1)
  }
  const hash = await bcrypt.hash(pwd, 12) // 强度 10 → 12
  await db.delete(users).where(eq(users.phone, '13900000000'))
  const [u] = await db.insert(users).values({
    companyId: null,
    name: '平台管理员',
    phone: '13900000000',
    email: 'platform@example.com',
    passwordHash: hash,
    role: 'platform',
    department: '平台运营',
    status: 'active',
  }).returning()
  console.log('平台管理员已创建:', u.name, u.id, u.role)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
