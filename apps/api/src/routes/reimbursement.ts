import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, inArray } from 'drizzle-orm'
import { db } from '../db'
import { reimbursements, reimbursementItems, invoices, approvalSteps, users } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance } from '../lib/auth'

const reimb = new Hono()
reimb.use('*', authMiddleware)

const num = (v: any): number => Number(v)

// --- 编号生成 ---
async function genCode(): Promise<string> {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rows = await db.select({ id: reimbursements.id }).from(reimbursements)
  const seq = String(rows.length + 1).padStart(4, '0')
  return `BX-${ymd}-${seq}`
}

// --- Schemas ---
const createSchema = z.object({
  title: z.string().min(2, '标题至少 2 个字符'),
  type: z.string().optional().default('daily'),
  department: z.string().optional(),
  description: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  totalAmount: z.number().optional(),
  submit: z.boolean().optional().default(false),
  items: z
    .array(
      z.object({
        category: z.string(),
        amount: z.number(),
        description: z.string().optional(),
        date: z.string().optional(),
        invoiceNo: z.string().optional(),
      })
    )
    .optional()
    .default([]),
})

// --- 列表 ---
reimb.get('/', async (c) => {
  const me = currentUser(c)
  const { status, type, page = '1', pageSize = '50' } = c.req.query()
  const p = Math.max(1, Number(page) || 1)
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 50))

  let q = db.select().from(reimbursements)
  if (status) q = q.where(eq(reimbursements.status, status as any)) as any
  if (type) q = q.where(eq(reimbursements.type, type)) as any
  if (!isAdminOrFinance(me.role)) {
    q = q.where(eq(reimbursements.userId, me.sub)) as any
  }
  const all = await q.orderBy(desc(reimbursements.createdAt))
  const pageRows = all.slice((p - 1) * ps, p * ps)

  // 批量查用户 + 明细
  const userIds = [...new Set(pageRows.map((r) => r.userId))]
  const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : []
  const userMap = new Map(userRows.map((u) => [u.id, u]))
  const reimbIds = pageRows.map((r) => r.id)
  const itemRows = reimbIds.length
    ? await db.select().from(reimbursementItems).where(inArray(reimbursementItems.reimbursementId, reimbIds))
    : []
  const itemsByReimb = new Map<string, any[]>()
  for (const it of itemRows) {
    if (!itemsByReimb.has(it.reimbursementId)) itemsByReimb.set(it.reimbursementId, [])
    itemsByReimb.get(it.reimbursementId)!.push(it)
  }

  const list = pageRows.map((r) => {
    const u = userMap.get(r.userId)
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      type: r.type,
      amount: num(r.amount),
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      department: r.department || '',
      submitter: u?.name || '',
      approver: '',
      items: (itemsByReimb.get(r.id) || []).map((it) => ({
        category: it.category,
        amount: num(it.amount),
        description: it.description || '',
        date: it.date || '',
      })),
    }
  })

  return c.json({
    code: 'SUCCESS',
    data: { list, pagination: { page: p, pageSize: ps, total: all.length } },
  })
})

// --- 创建 ---
reimb.post(
  '/',
  zValidator('json', createSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const me = currentUser(c)
    const data = c.req.valid('json')
    const code = await genCode()
    const items = data.items || []
    const amount = data.totalAmount ?? items.reduce((s, it) => s + (it.amount || 0), 0)
    const status = data.submit ? 'pending' : 'draft'

    const [r] = await db
      .insert(reimbursements)
      .values({
        userId: me.sub,
        code,
        title: data.title,
        type: data.type || 'daily',
        department: data.department || null,
        amount: String(amount),
        status: status as any,
        description: data.description || null,
        startDate: data.startDate || null,
        endDate: data.endDate || null,
      })
      .returning()

    if (items.length) {
      await db.insert(reimbursementItems).values(
        items.map((it) => ({
          reimbursementId: r.id,
          category: it.category,
          amount: String(it.amount),
          description: it.description || null,
          date: it.date || null,
          invoiceNo: it.invoiceNo || null,
        }))
      )
    }

    if (data.submit) {
      await db.insert(approvalSteps).values([
        { reimbursementId: r.id, stepIndex: 0, actor: '部门负责人', role: 'manager', action: 'pending' },
        { reimbursementId: r.id, stepIndex: 1, actor: '财务审核', role: 'finance', action: 'pending' },
      ])
    }

    return c.json({ code: 'SUCCESS', message: data.submit ? '已提交审批' : '草稿已保存', data: { id: r.id, code: r.code, status } }, 201)
  }
)

// --- 详情 ---
reimb.get('/:id', async (c) => {
  const me = currentUser(c)
  const { id } = c.req.param()
  const rows = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1)
  const r = rows[0]
  if (!r) return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)
  if (!isAdminOrFinance(me.role) && r.userId !== me.sub) {
    return c.json({ code: 'FORBIDDEN', message: '无权查看该报销单' }, 403)
  }

  const [itemRows, invoiceRows, stepRows, userRows] = await Promise.all([
    db.select().from(reimbursementItems).where(eq(reimbursementItems.reimbursementId, id)),
    db.select().from(invoices).where(eq(invoices.reimbursementId, id)),
    db.select().from(approvalSteps).where(eq(approvalSteps.reimbursementId, id)),
    db.select().from(users).where(eq(users.id, r.userId)).limit(1),
  ])
  const submitter = userRows[0]

  return c.json({
    code: 'SUCCESS',
    data: {
      id: r.id,
      code: r.code,
      title: r.title,
      type: r.type,
      amount: num(r.amount),
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      department: r.department || '',
      submitter: submitter?.name || '',
      description: r.description || '',
      startDate: r.startDate || '',
      endDate: r.endDate || '',
      items: itemRows.map((it) => ({
        category: it.category,
        amount: num(it.amount),
        description: it.description || '',
        date: it.date || '',
        invoiceNo: it.invoiceNo || '',
      })),
      invoiceCount: invoiceRows.length,
      attachmentUrls: invoiceRows.map((inv) => ({
        name: inv.fileName,
        size: inv.size || 0,
        url: inv.fileUrl || '#',
        thumbnail: (inv.ocrData as any)?.thumbnailUrl || undefined,
      })),
      timeline: stepRows
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((s) => ({
          id: s.id,
          stepIndex: s.stepIndex,
          actor: s.actor,
          role: s.role || '',
          action: s.action,
          time: s.time || undefined,
          comment: s.comment || undefined,
        })),
      nextApprovers: [],
      canRevoke: r.userId === me.sub && (r.status === 'pending' || r.status === 'draft'),
      canModify: r.userId === me.sub && r.status === 'draft',
      canDelete: r.userId === me.sub && r.status === 'draft',
      canPay: isAdminOrFinance(me.role) && r.status === 'approved',
    },
  })
})

// --- 状态流转 ---
async function transition(c: any, id: string, action: string, comment?: string) {
  const me = currentUser(c)
  const rows = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1)
  const r = rows[0]
  if (!r) return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)

  const statusMap: Record<string, string> = {
    submit: 'pending',
    approve: 'approved',
    reject: 'rejected',
    revoke: 'revoked',
    pay: 'paid',
  }
  const newStatus = statusMap[action]
  const actor = me.name || me.role

  await db.update(reimbursements).set({ status: newStatus as any, updatedAt: new Date() }).where(eq(reimbursements.id, id))
  await db.insert(approvalSteps).values({
    reimbursementId: id,
    stepIndex: 0,
    actor,
    role: me.role,
    action,
    comment: comment || null,
    time: new Date(),
  })

  const msgMap: Record<string, string> = {
    submit: '已提交审批',
    approve: '已审批通过',
    reject: '已驳回',
    revoke: '已撤销',
    pay: '已完成付款',
  }
  return c.json({ code: 'SUCCESS', message: msgMap[action], data: { id, status: newStatus } })
}

reimb.post('/:id/submit', async (c) => {
  const { id } = c.req.param()
  const me = currentUser(c)
  const rows = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1)
  if (!rows[0]) return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)
  if (rows[0].userId !== me.sub) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  return transition(c, id, 'submit')
})

reimb.post('/:id/approve', async (c) => {
  const me = currentUser(c)
  if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  return transition(c, c.req.param('id'), 'approve')
})

reimb.post('/:id/reject', async (c) => {
  const me = currentUser(c)
  if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  return transition(c, c.req.param('id'), 'reject', body.reason || body.comment || '未填写原因')
})

reimb.post('/:id/revoke', async (c) => {
  const me = currentUser(c)
  const { id } = c.req.param()
  const rows = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1)
  if (!rows[0]) return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)
  if (rows[0].userId !== me.sub && !isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  const body = await c.req.json().catch(() => ({}))
  return transition(c, id, 'revoke', body.reason || body.comment)
})

reimb.post('/:id/pay', async (c) => {
  const me = currentUser(c)
  if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无付款权限' }, 403)
  return transition(c, c.req.param('id'), 'pay')
})

export const reimbursementRoutes = reimb
