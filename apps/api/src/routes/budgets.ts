import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, and } from 'drizzle-orm'
import { db, pool } from '../db'
import { budgets } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance, canManageAllMembers } from '../lib/auth'

const b = new Hono()
b.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 预算周期起点（按 period 回退）
function periodStart(period: string): Date {
  const now = new Date()
  const d = new Date(now)
  if (period === 'yearly') {
    d.setMonth(0, 1); d.setHours(0, 0, 0, 0)
  } else if (period === 'quarterly') {
    const qm = Math.floor(now.getMonth() / 3) * 3
    d.setMonth(qm, 1); d.setHours(0, 0, 0, 0)
  } else {
    // monthly（默认）
    d.setDate(1); d.setHours(0, 0, 0, 0)
  }
  return d
}

// 计算某部门/项目在当前周期内的已用金额（已审批通过或已付款的报销单）
async function computeUsed(kind: string, name: string, code: string | null, period: string, companyId: string): Promise<number> {
  const start = periodStart(period)
  if (kind === 'project') {
    const r = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS amt FROM reimbursements
       WHERE company_id = $3 AND project_code = $1 AND status IN ('approved','paid') AND created_at >= $2`,
      [code, start, companyId]
    )
    return num(r.rows[0].amt)
  }
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amt FROM reimbursements
     WHERE company_id = $3 AND department = $1 AND status IN ('approved','paid') AND created_at >= $2`,
    [name, start, companyId]
  )
  return num(r.rows[0].amt)
}

// GET /api/v1/budgets — 列表（含实时已用额度 + 预算控制配置）
b.get('/', async (c) => {
  const me = currentUser(c)
  const { kind = '' } = c.req.query()
  let rows
  if (kind === 'department' || kind === 'project') {
    rows = await db.select().from(budgets).where(and(eq(budgets.companyId, me.companyId), eq(budgets.kind, kind))).orderBy(desc(budgets.createdAt))
  } else {
    rows = await db.select().from(budgets).where(eq(budgets.companyId, me.companyId)).orderBy(desc(budgets.createdAt))
  }

  const departmentBudgets: any[] = []
  const projectBudgets: any[] = []
  for (const r of rows) {
    const used = await computeUsed(r.kind, r.name, r.code, r.period, me.companyId)
    const item = {
      id: r.id,
      kind: r.kind,
      name: r.name,
      code: r.code || '',
      amount: num(r.amount),
      usedAmount: used,
      period: r.period,
    }
    if (r.kind === 'project') {
      projectBudgets.push({
        id: r.id,
        projectCode: r.code || '',
        projectName: r.name,
        amount: num(r.amount),
        usedAmount: used,
      })
    } else {
      departmentBudgets.push({
        id: r.id,
        department: r.name,
        amount: num(r.amount),
        usedAmount: used,
      })
    }
  }

  // 读取预算控制配置（enabled/period/overBudgetAction 存 company_settings.policy.budgetControl）
  let control: any = { enabled: true, period: 'monthly', overBudgetAction: 'warn' }
  try {
    const s = await pool.query(
      `SELECT policy FROM company_settings WHERE company_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [me.companyId]
    )
    const policy = s.rows[0]?.policy || {}
    const bc = (policy as any)?.budgetControl
    if (bc) {
      control = {
        enabled: bc.enabled !== false,
        period: bc.period || 'monthly',
        overBudgetAction: bc.overBudgetAction || 'warn',
      }
    }
  } catch { /* 表可能尚未有数据 */ }

  return c.json({
    code: 'SUCCESS',
    data: {
      budgetControl: control,
      departmentBudgets,
      projectBudgets,
      all: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        code: r.code || '',
        amount: num(r.amount),
        period: r.period,
      })),
    },
  })
})

const budgetSchema = z.object({
  kind: z.enum(['department', 'project']),
  name: z.string().min(1, '名称必填'),
  code: z.string().optional().or(z.literal('')),
  amount: z.number().min(0),
  period: z.string().optional().default('monthly'),
})

// POST /api/v1/budgets — 创建
b.post(
  '/',
  zValidator('json', budgetSchema, (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    const data = c.req.valid('json')
    const [r] = await db
      .insert(budgets)
      .values({
        companyId: me.companyId,
        kind: data.kind,
        name: data.name,
        code: data.code || null,
        amount: String(data.amount),
        period: data.period || 'monthly',
      })
      .returning()
    return c.json({ code: 'SUCCESS', data: { id: r.id } }, 201)
  }
)

// PATCH /api/v1/budgets/:id — 更新
b.patch(
  '/:id',
  zValidator('json', budgetSchema.partial(), (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    const id = c.req.param('id')
    const data = c.req.valid('json')
    const [existing] = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1)
    if (!existing) return c.json({ code: 'NOT_FOUND', message: '预算项不存在' }, 404)
    if (existing.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
    const upd: any = { updatedAt: new Date() }
    if (data.name !== undefined) upd.name = data.name
    if (data.code !== undefined) upd.code = data.code || null
    if (data.amount !== undefined) upd.amount = String(data.amount)
    if (data.period !== undefined) upd.period = data.period
    const [r] = await db.update(budgets).set(upd).where(eq(budgets.id, id)).returning()
    return c.json({ code: 'SUCCESS', data: { id: r.id } })
  }
)

// DELETE /api/v1/budgets/:id — 删除
b.delete('/:id', async (c) => {
  const me = currentUser(c)
  if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
  const id = c.req.param('id')
  const [existing] = await db.select().from(budgets).where(eq(budgets.id, id)).limit(1)
  if (!existing) return c.json({ code: 'NOT_FOUND', message: '预算项不存在' }, 404)
  if (existing.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  await db.delete(budgets).where(eq(budgets.id, id))
  return c.json({ code: 'SUCCESS' })
})

export const budgetRoutes = b
