import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { eq, or, ilike, desc, and, ne } from 'drizzle-orm'
import { db } from '../db'
import { users, companies, reimbursements } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance, isSuperAdmin, canManageAllMembers, isManager } from '../lib/auth'

const user = new Hono()
user.use('*', authMiddleware)

const createUserSchema = z.object({
  name: z.string().min(2, '姓名至少 2 个字符'),
  phone: z.string().length(11, '手机号必须为 11 位数字').regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  email: z.string().optional().or(z.literal('')),
  password: z.string().min(6, '密码至少 6 个字符').optional(),
  role: z.enum(['admin', 'gm', 'finance', 'manager', 'employee']).default('employee'),
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
    status: u.status || 'active',
    createdAt: u.createdAt,
  }
}

// 列表：管理员/财务看全部，员工只看自己
user.get('/', async (c) => {
  const me = currentUser(c)
  const { keyword = '' } = c.req.query()
  let rows
  if (isAdminOrFinance(me.role)) {
    // 管理员/总经理/财务：看本公司全部成员
    const kwConds: any[] = [eq(users.companyId, me.companyId), ne(users.status, 'pending')]
    if (keyword) {
      const k = `%${keyword}%`
      kwConds.push(or(ilike(users.name, k), ilike(users.phone, k), ilike(users.email, k)))
    }
    rows = await db.select().from(users).where(and(...kwConds)).orderBy(desc(users.createdAt))
  } else if (isManager(me.role)) {
    // 部门经理：看本部门成员
    const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
    const myDept = myRow[0]?.department || ''
    const conds: any[] = [eq(users.companyId, me.companyId), ne(users.status, 'pending')]
    if (myDept) conds.push(eq(users.department, myDept))
    const q = db.select().from(users).where(and(...conds))
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
    // 部门经理只能创建本部门成员；管理员/财务可创建任意
    if (!isAdminOrFinance(me.role) && !isManager(me.role)) {
      return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    }
    const data = c.req.valid('json')
    // 部门经理创建的用户强制归入本部门、且不能设为 admin/gm/finance
    if (isManager(me.role)) {
      const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
      const myDept = myRow[0]?.department || ''
      if (data.role !== 'employee' && data.role !== 'manager') {
        return c.json({ code: 'FORBIDDEN', message: '部门经理仅可创建普通员工或部门经理' }, 403)
      }
      ;(data as any).department = myDept || data.department
    }
    const email = data.email ? data.email.toLowerCase() : null
    const conds = [eq(users.phone, data.phone)]
    if (email) conds.push(eq(users.email, email))
    const existing = await db.select().from(users).where(or(...conds)).limit(1)
    if (existing[0]) return c.json({ code: 'CONFLICT', message: '该手机号或邮箱已存在' }, 409)

    const hash = await bcrypt.hash(data.password || '123456', 10)
    const [u] = await db
      .insert(users)
      .values({
        companyId: me.companyId,
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
    if (!isAdminOrFinance(me.role) && !isManager(me.role)) {
      return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    }

    const id = c.req.param('id')
    const data = c.req.valid('json')

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    if (!existing) {
      return c.json({ code: 'NOT_FOUND', message: '用户不存在' }, 404)
    }
    // 隔离：只能操作本公司成员
    if (existing.companyId !== me.companyId) {
      return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
    }
    // 部门经理只能操作本部门成员，且不能改角色为 admin/gm/finance
    if (isManager(me.role)) {
      const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
      const myDept = myRow[0]?.department || ''
      if (existing.department !== myDept) {
        return c.json({ code: 'FORBIDDEN', message: '仅可操作本部门成员' }, 403)
      }
      if (data.role && data.role !== 'employee' && data.role !== 'manager') {
        return c.json({ code: 'FORBIDDEN', message: '部门经理不可设置管理员/总经理/财务角色' }, 403)
      }
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
  if (!isAdminOrFinance(me.role) && !isManager(me.role)) {
    return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
  }

  const id = c.req.param('id')

  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) {
    return c.json({ code: 'NOT_FOUND', message: '用户不存在' }, 404)
  }
  if (existing.companyId !== me.companyId) {
    return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  }
  // 部门经理只能删本部门成员，且不能删管理员/财务
  if (isManager(me.role)) {
    const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
    const myDept = myRow[0]?.department || ''
    if (existing.department !== myDept) {
      return c.json({ code: 'FORBIDDEN', message: '仅可操作本部门成员' }, 403)
    }
    if (existing.role === 'admin' || existing.role === 'gm' || existing.role === 'finance') {
      return c.json({ code: 'FORBIDDEN', message: '部门经理不可删除管理员/财务' }, 403)
    }
  }

  if (id === me.sub) {
    return c.json({ code: 'FORBIDDEN', message: '不能删除自己的账号' }, 403)
  }

  await db.delete(users).where(eq(users.id, id))
  return c.json({ code: 'SUCCESS' })
})

// ============ 注册审批 ============

// 待审批列表：admin/gm 看全部，manager 只看本部门
user.get('/pending', async (c) => {
  const me = currentUser(c)
  if (!isSuperAdmin(me.role) && !isManager(me.role)) {
    return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  }
  const conds: any[] = [eq(users.companyId, me.companyId), eq(users.status, 'pending')]
  if (isManager(me.role)) {
    const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
    const myDept = myRow[0]?.department || ''
    if (myDept) conds.push(eq(users.department, myDept))
  }
  const rows = await db.select().from(users).where(and(...conds)).orderBy(desc(users.createdAt))
  return c.json({ code: 'SUCCESS', data: { list: rows.map(toUser) } })
})

// 通过审批：admin/gm 任意，manager 仅本部门
user.post('/:id/approve', async (c) => {
  const me = currentUser(c)
  if (!isSuperAdmin(me.role) && !isManager(me.role)) {
    return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  }
  const id = c.req.param('id')
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) return c.json({ code: 'NOT_FOUND', message: '申请不存在' }, 404)
  if (existing.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  if (existing.status !== 'pending') return c.json({ code: 'BAD_REQUEST', message: '该申请已处理' }, 400)

  if (isManager(me.role)) {
    const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
    const myDept = myRow[0]?.department || ''
    if (existing.department !== myDept) {
      return c.json({ code: 'FORBIDDEN', message: '部门经理仅可审批本部门员工的申请' }, 403)
    }
  }

  await db.update(users).set({ status: 'active', updatedAt: new Date() }).where(eq(users.id, id))
  return c.json({ code: 'SUCCESS', message: '已通过审批' })
})

// 拒绝：删除 pending 记录
user.post('/:id/reject', async (c) => {
  const me = currentUser(c)
  if (!isSuperAdmin(me.role) && !isManager(me.role)) {
    return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  }
  const id = c.req.param('id')
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) return c.json({ code: 'NOT_FOUND', message: '申请不存在' }, 404)
  if (existing.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  if (existing.status !== 'pending') return c.json({ code: 'BAD_REQUEST', message: '该申请已处理' }, 400)

  if (isManager(me.role)) {
    const myRow = await db.select().from(users).where(eq(users.id, me.sub)).limit(1)
    const myDept = myRow[0]?.department || ''
    if (existing.department !== myDept) {
      return c.json({ code: 'FORBIDDEN', message: '部门经理仅可审批本部门员工的申请' }, 403)
    }
  }

  await db.delete(users).where(eq(users.id, id))
  return c.json({ code: 'SUCCESS', message: '已拒绝并删除申请' })
})

export const userRoutes = user
