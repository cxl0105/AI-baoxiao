import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { eq, desc, count, and } from 'drizzle-orm'
import { db } from '../db'
import { companies, users, reimbursements, budgets, companySettings } from '../db/schema'
import { authMiddleware, currentUser, isPlatformAdmin } from '../lib/auth'

const tenant = new Hono()
tenant.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 创建企业时的校验
const createSchema = z.object({
  name: z.string().min(2, '企业名称至少 2 个字符'),
  taxNo: z.string().min(6, '纳税号/统一社会信用代码至少 6 位'),
  fullName: z.string().optional(),
  industry: z.string().optional(),
  scale: z.string().optional(),
  contactPhone: z.string().optional(),
  // 初始管理员手机号（自动生成 4 类账号用，密码统一 123456）
  adminPhone: z.string().regex(/^1[3-9]\d{9}$/, '初始管理员手机号格式不正确'),
})

// 平台管理员：列出所有企业（含账号数 + 管理员）
tenant.get('/', async (c) => {
  const me = currentUser(c)
  if (!isPlatformAdmin(me.role)) return c.json({ code: 'FORBIDDEN', message: '仅平台管理员可管理企业' }, 403)

  const compRows = await db.select().from(companies).orderBy(desc(companies.createdAt))
  const list = []
  for (const comp of compRows) {
    const userRows = await db.select().from(users).where(eq(users.companyId, comp.id))
    const admins = userRows.filter((u) => u.role === 'admin')
    list.push({
      id: comp.id,
      name: comp.name,
      taxNo: comp.taxNo || '',
      fullName: comp.fullName || '',
      industry: comp.industry || '',
      scale: comp.scale || '',
      contactPhone: comp.contactPhone || '',
      createdAt: comp.createdAt,
      userCount: userRows.length,
      admin: admins[0] ? { name: admins[0].name, phone: admins[0].phone } : null,
    })
  }
  return c.json({ code: 'SUCCESS', data: { list } })
})

// 平台管理员：新增企业，自动生成 4 类账号（管理员/总经理/财务/部门经理），密码 123456
tenant.post(
  '/',
  zValidator('json', createSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isPlatformAdmin(me.role)) return c.json({ code: 'FORBIDDEN', message: '仅平台管理员可新增企业' }, 403)

    const data = c.req.valid('json')

    // 纳税号唯一性校验
    const existing = await db.select().from(companies).where(eq(companies.taxNo, data.taxNo)).limit(1)
    if (existing[0]) return c.json({ code: 'CONFLICT', message: '该纳税号已存在，请勿重复创建' }, 409)

    // 手机号冲突校验
    const phoneDup = await db.select().from(users).where(eq(users.phone, data.adminPhone)).limit(1)
    if (phoneDup[0]) return c.json({ code: 'CONFLICT', message: '该手机号已被使用' }, 409)

    // 1) 创建企业
    const [comp] = await db
      .insert(companies)
      .values({
        name: data.name,
        taxNo: data.taxNo,
        fullName: data.fullName || null,
        industry: data.industry || null,
        scale: data.scale || null,
        contactPhone: data.contactPhone || null,
      })
      .returning()

    // 2) 自动生成 4 类账号（初始手机号 = adminPhone；其余角色用占位手机号，后续可改）
    const hash = await bcrypt.hash('123456', 10)
    // 生成不冲突的占位手机号
    const accounts = [
      { name: '企业管理员', role: 'admin', phone: data.adminPhone },
      { name: '总经理', role: 'gm', phone: null },
      { name: '财务专员', role: 'finance', phone: null },
      { name: '部门经理', role: 'manager', phone: null },
    ]

    const createdUsers: any[] = []
    for (const a of accounts) {
      let phone = a.phone
      if (!phone) {
        // 占位手机号：基于纳税号后 9 位 + 角色序号，保证唯一
        const tail = data.taxNo.replace(/\D/g, '').slice(-9).padStart(9, '0')
        const roleIdx = { gm: '1', finance: '2', manager: '3' }[a.role] || '4'
        phone = '19' + tail + roleIdx
        // 若冲突则加时间戳
        const dup = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
        if (dup[0]) phone = '19' + tail + roleIdx + String(Date.now()).slice(-2)
      }
      const [u] = await db
        .insert(users)
        .values({
          companyId: comp.id,
          name: a.name,
          phone,
          email: null,
          passwordHash: hash,
          role: a.role as any,
          department: a.role === 'manager' ? '综合部' : a.role === 'finance' ? '财务部' : a.role === 'gm' ? '管理层' : '管理层',
        })
        .returning()
      createdUsers.push({ id: u.id, name: u.name, role: u.role, phone: u.phone })
    }

    return c.json(
      {
        code: 'SUCCESS',
        message: '企业已创建，账号已自动生成（密码均为 123456）',
        data: { company: { id: comp.id, name: comp.name, taxNo: comp.taxNo }, accounts: createdUsers },
      },
      201
    )
  }
)

// 平台管理员：删除企业 + 级联删除其所有用户
tenant.delete('/:id', async (c) => {
  const me = currentUser(c)
  if (!isPlatformAdmin(me.role)) return c.json({ code: 'FORBIDDEN', message: '仅平台管理员可删除企业' }, 403)

  const id = c.req.param('id')
  const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1)
  if (!rows[0]) return c.json({ code: 'NOT_FOUND', message: '企业不存在' }, 404)

  // 按依赖顺序删除：报销单(级联删明细/发票/审批步) → 预算 → 设置 → 用户 → 企业
  await db.delete(reimbursements).where(eq(reimbursements.companyId, id))
  await db.delete(budgets).where(eq(budgets.companyId, id))
  await db.delete(companySettings).where(eq(companySettings.companyId, id))
  await db.delete(users).where(eq(users.companyId, id))
  await db.delete(companies).where(eq(companies.id, id))

  return c.json({ code: 'SUCCESS', message: '企业及其账号、数据已删除' })
})

export const tenantRoutes = tenant
