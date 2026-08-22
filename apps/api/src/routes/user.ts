import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { eq, or, ilike, desc, and } from 'drizzle-orm'
import { db } from '../db'
import { users, companies, reimbursements } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance } from '../lib/auth'

const user = new Hono()
user.use('*', authMiddleware)

const createUserSchema = z.object({
  name: z.string().min(2, '姓名至少 2 个字符'),
  phone: z.string().length(11, '手机号必须为 11 位数字').regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  email: z.string().optional().or(z.literal('')),
  password: z.string().min(6, '密码至少 6 个字符').optional(),
  role: z.enum(['admin', 'finance', 'employee']).default('employee'),
  department: z.string().optional(),
})

function toUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    department: u.department || '',
    status: 'active',
    createdAt: u.createdAt,
  }
}

// 列表：管理员/财务看全部，员工只看自己
user.get('/', async (c) => {
  const me = currentUser(c)
  const { keyword = '' } = c.req.query()
  let rows
  if (isAdminOrFinance(me.role)) {
    let q = db.select().from(users)
    if (keyword) {
      const k = `%${keyword}%`
      q = q.where(or(ilike(users.name, k), ilike(users.phone, k), ilike(users.email, k))) as any
    }
    rows = await q.orderBy(desc(users.createdAt))
  } else {
    rows = await db.select().from(users).where(eq(users.id, me.sub))
  }
  return c.json({
    code: 'SUCCESS',
    data: { list: rows.map(toUser), pagination: { page: 1, pageSize: rows.length, total: rows.length } },
  })
})

// 创建用户（管理员/财务）
user.post(
  '/',
  zValidator('json', createUserSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    const data = c.req.valid('json')
    const email = data.email ? data.email.toLowerCase() : null
    const conds = [eq(users.phone, data.phone)]
    if (email) conds.push(eq(users.email, email))
    const existing = await db.select().from(users).where(or(...conds)).limit(1)
    if (existing[0]) return c.json({ code: 'CONFLICT', message: '该手机号或邮箱已存在' }, 409)

    let companyRows = await db.select().from(companies).limit(1)
    let company = companyRows[0]
    if (!company) {
      const [cc] = await db.insert(companies).values({ name: '默认公司' }).returning()
      company = cc
    }
    const hash = await bcrypt.hash(data.password || '123456', 10)
    const [u] = await db
      .insert(users)
      .values({
        companyId: company.id,
        name: data.name,
        phone: data.phone,
        email,
        passwordHash: hash,
        role: data.role,
        department: data.department || null,
      })
      .returning()
    return c.json({ code: 'SUCCESS', data: toUser(u) }, 201)
  }
)


// 更新用户（管理员/财务）
user.patch(
  '/:id',
  zValidator('json', createUserSchema.partial(), (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)

    const id = c.req.param('id')
    const data = c.req.valid('json')

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!existing) {
      return c.json({ code: 'NOT_FOUND', message: '用户不存在' }, 404)
    }

    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.phone) updateData.phone = data.phone
    if (data.email !== undefined) updateData.email = data.email ? data.email.toLowerCase() : null
    if (data.role) updateData.role = data.role
    if (data.department !== undefined) updateData.department = data.department || null
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10)
    }

    const [updated] = await db.update(users).set(updateData).where(eq(users.id, id)).returning()
    return c.json({ code: 'SUCCESS', data: toUser(updated) })
  }
)

// 删除用户（管理员/财务）
user.delete('/:id', async (c) => {
  const me = currentUser(c)
  if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)

  const id = c.req.param('id')

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) {
    return c.json({ code: 'NOT_FOUND', message: '用户不存在' }, 404)
  }

  if (id === me.sub) {
    return c.json({ code: 'FORBIDDEN', message: '不能删除自己的账号' }, 403)
  }

  await db.delete(users).where(eq(users.id, id))
  return c.json({ code: 'SUCCESS' })
})

export const userRoutes = user
