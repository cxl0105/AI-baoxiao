import bcrypt from 'bcryptjs'
import { eq, or } from 'drizzle-orm'
import { db } from './index'
import { companies, users } from './schema'

interface SeedAccount {
  name: string
  phone: string
  email: string
  role: 'admin' | 'gm' | 'finance' | 'manager' | 'employee'
  department: string
  password: string
}

async function main() {
  // 1) 公司
  let companyRows = await db.select().from(companies).limit(1)
  let company = companyRows[0]
  if (!company) {
    const [c] = await db.insert(companies).values({ name: '示例公司' }).returning()
    company = c
    console.log('已创建公司:', company.name, company.id)
  } else {
    console.log('公司已存在:', company.name, company.id)
  }

  // 2) 演示账号
  const accounts: SeedAccount[] = [
    { name: '管理员', phone: '13800000001', email: 'admin@example.com', role: 'admin', department: '管理层', password: '123456' },
    { name: '总经理', phone: '13800000005', email: 'gm@example.com', role: 'gm', department: '管理层', password: '123456' },
    { name: '财务专员', phone: '13800000002', email: 'finance@example.com', role: 'finance', department: '财务部', password: '123456' },
    { name: '部门主管', phone: '13800000006', email: 'manager@example.com', role: 'manager', department: '研发部', password: '123456' },
    { name: '员工小李', phone: '13800000003', email: 'employee@example.com', role: 'employee', department: '研发部', password: '123456' },
    { name: '演示用户', phone: '13800000004', email: 'demo@example.com', role: 'employee', department: '研发部', password: '123456' },
  ]

  for (const a of accounts) {
    const existing = await db
      .select()
      .from(users)
      .where(or(eq(users.phone, a.phone), eq(users.email, a.email)))
      .limit(1)
    if (existing[0]) {
      console.log('用户已存在:', a.name)
      continue
    }
    const hash = await bcrypt.hash(a.password, 10)
    const [u] = await db
      .insert(users)
      .values({
        companyId: company.id,
        name: a.name,
        phone: a.phone,
        email: a.email,
        passwordHash: hash,
        role: a.role,
        department: a.department,
      })
      .returning()
    console.log('已创建用户:', a.name, u.id, a.role)
  }

  // 3) 统计
  const total = await db.select().from(users)
  console.log(`\n当前用户总数: ${total.length}`)
  process.exit(0)
}

main().catch((e) => {
  console.error('种子失败:', e)
  process.exit(1)
})
