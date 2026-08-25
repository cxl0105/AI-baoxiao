// scripts/reset-weak-passwords.ts —— 一次性清理存量 123456 账号（跑完即删）
//
// 作用：遍历所有用户，凡是密码仍是 '123456' 的，重置为随机强密码。
// 修复补丁只防"新增"弱密码，数据库里已存在的 123456 账号必须靠这个脚本清掉。
//
// ⚠️ 导入路径按你项目实际结构调整（下面是推测路径）：
//    若你的启动入口在 apps/api，则 db 可能在 apps/api/src/db
import bcrypt from 'bcryptjs'
import { db } from '../apps/api/src/db'      // ⚠️ 按实际调整
import { users } from '../apps/api/src/db/schema' // ⚠️ 按实际调整
import { eq } from 'drizzle-orm'

async function main() {
  const all = await db.select().from(users)
  let reset = 0
  for (const u of all) {
    const weak = await bcrypt.compare('123456', u.passwordHash)
    if (weak) {
      const np = Math.random().toString(36).slice(2) + 'A1!' + Date.now().toString(36)
      await db.update(users).set({ passwordHash: await bcrypt.hash(np, 12) }).where(eq(users.id, u.id))
      console.log('已重置弱密码账号:', u.phone || u.email, '| 角色:', u.role)
      reset++
    }
  }
  console.log(`共重置 ${reset} 个弱密码账号。请通知相关用户通过"忘记密码"重新设置。`)
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
