import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc, inArray, and, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { reimbursements, reimbursementItems, invoices, approvalSteps, users, companies } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance, isApprover, canPay } from '../lib/auth'

const reimb = new Hono()
reimb.use('*', authMiddleware)

const num = (v: any): number => Number(v)

// --- 编号生成 ---
async function genCode(companyId: string): Promise<string> {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const rows = await db.select({ id: reimbursements.id }).from(reimbursements).where(eq(reimbursements.companyId, companyId))
  const seq = String(rows.length + 1).padStart(4, '0')
  return `BX-${ymd}-${seq}`
}

// --- 审批流引擎 ---
// 三级审批：阶段0 = 主管(manager) + 财务(finance)【并行】，阶段1 = 总经理(gm)/管理员(admin)【终审】
// 同阶段并行：两条 pending 都 approve 才进入下一阶段；最后阶段 approve 后整单 approved
async function initApprovalFlow(reimbId: string) {
  await db.insert(approvalSteps).values([
    { reimbursementId: reimbId, stepIndex: 0, actor: '部门主管', role: 'manager', action: 'pending' },
    { reimbursementId: reimbId, stepIndex: 0, actor: '财务审核', role: 'finance', action: 'pending' },
    { reimbursementId: reimbId, stepIndex: 1, actor: '总经理/管理员', role: 'gm', action: 'pending' },
  ])
}

// 判断当前用户角色能审批哪个 pending 节点
// manager -> role='manager'；finance -> role='finance'；gm/admin -> role='gm'（终审节点）
function matchNodeRole(meRole: string, nodeRole: string | null): boolean {
  if (nodeRole === 'gm') return meRole === 'gm' || meRole === 'admin'
  return nodeRole === meRole
}

async function applyApprovalAction(c: any, id: string, action: 'approve' | 'reject', comment?: string) {
  const me = currentUser(c)
  const rows = await db.select().from(reimbursements).where(eq(reimbursements.id, id)).limit(1)
  const r = rows[0]
  if (!r) return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)
  if (r.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  if (r.status !== 'pending') return c.json({ code: 'CONFLICT', message: '该报销单当前状态不可审批' }, 409)

  // 找当前用户能处理的 pending 节点
  const stepRows = await db.select().from(approvalSteps).where(eq(approvalSteps.reimbursementId, id))
  const myPending = stepRows.find((st) => st.action === 'pending' && matchNodeRole(me.role, st.role))
  if (!myPending) return c.json({ code: 'FORBIDDEN', message: '当前审批环节无需你处理（等待其他审批人，或你已审批过）' }, 403)

  if (action === 'reject') {
    // 驳回：整单 rejected，打回员工
    await db.update(reimbursements).set({ status: 'rejected', updatedAt: new Date() }).where(eq(reimbursements.id, id))
    await db.update(approvalSteps)
      .set({ action: 'reject', actor: me.name || me.role, comment: comment || null, time: new Date() })
      .where(eq(approvalSteps.id, myPending.id))
    return c.json({ code: 'SUCCESS', message: '已驳回，退回申请人', data: { id, status: 'rejected' } })
  }

  // 同意：标记该节点通过
  await db.update(approvalSteps)
    .set({ action: 'approve', actor: me.name || me.role, comment: comment || null, time: new Date() })
    .where(eq(approvalSteps.id, myPending.id))

  // 检查是否还有 pending 节点
  const remain = await db.select().from(approvalSteps).where(eq(approvalSteps.reimbursementId, id))
  const stillPending = remain.filter((st) => st.action === 'pending')
  if (stillPending.length === 0) {
    // 全部通过 → 整单 approved
    await db.update(reimbursements).set({ status: 'approved', updatedAt: new Date() }).where(eq(reimbursements.id, id))
    return c.json({ code: 'SUCCESS', message: '审批全部通过', data: { id, status: 'approved' } })
  }
  // 还有同级或下级待批，保持 pending
  return c.json({ code: 'SUCCESS', message: '已通过本环节，等待其他审批人', data: { id, status: 'pending' } })
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

  // 多租户隔离 + 筛选条件：用 and 合并，避免 drizzle where 覆盖
  const conds: any[] = [eq(reimbursements.companyId, me.companyId)]
  if (status) conds.push(eq(reimbursements.status, status as any))
  if (type) conds.push(eq(reimbursements.type, type))
  if (!isAdminOrFinance(me.role)) conds.push(eq(reimbursements.userId, me.sub))
  const q = db.select().from(reimbursements).where(and(...conds))
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

  // 批量查审批步骤，用于填充「当前审批人」+ 审批流摘要
  const stepRows = reimbIds.length
    ? await db.select().from(approvalSteps).where(inArray(approvalSteps.reimbursementId, reimbIds))
    : []
  const stepsByReimb = new Map<string, any[]>()
  for (const st of stepRows) {
    if (!stepsByReimb.has(st.reimbursementId)) stepsByReimb.set(st.reimbursementId, [])
    stepsByReimb.get(st.reimbursementId)!.push(st)
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
      approver: (() => {
        const steps = stepsByReimb.get(r.id) || []
        const pending = steps.find((x) => x.action === 'pending')
        if (pending) return pending.actor
        // 无 pending 节点时，取最后一条动作的执行人
        const last = steps[steps.length - 1]
        return last ? last.actor : ''
      })(),
      approvalFlow: (() => {
        const steps = (stepsByReimb.get(r.id) || []).sort((a, b) => a.stepIndex - b.stepIndex)
        const total = steps.length || 0
        const done = steps.filter((x) => ['submit', 'approve', 'reject', 'pay'].includes(x.action)).length
        return { currentStep: done, totalSteps: total, nodes: steps.map((x) => ({ actor: x.actor, action: x.action })) }
      })(),
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
    const code = await genCode(me.companyId)
    const items = data.items || []
    const amount = data.totalAmount ?? items.reduce((s, it) => s + (it.amount || 0), 0)
    const status = data.submit ? 'pending' : 'draft'

    // --- 免费版发票配额校验：按企业计，每月免费 10 张发票（报销明细） ---
    const compRows = await db.select().from(companies).where(eq(companies.id, me.companyId)).limit(1)
    const plan = compRows[0]?.plan || 'free'
    if (plan === 'free') {
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)
      const used = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(reimbursementItems)
        .innerJoin(reimbursements, eq(reimbursements.id, reimbursementItems.reimbursementId))
        .where(and(eq(reimbursements.companyId, me.companyId), gte(reimbursements.createdAt, monthStart)))
      const usedCount = Number(used[0]?.cnt || 0)
      if (usedCount + items.length > 10) {
        return c.json(
          { code: 'QUOTA_EXCEEDED', message: `本月免费额度已用完（免费版每月 10 张发票，已用 ${usedCount} 张，本次 ${items.length} 张）。请升级付费版或下月再试。` },
          403
        )
      }
    }

    const [r] = await db
      .insert(reimbursements)
      .values({
        userId: me.sub,
        companyId: me.companyId,
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
      await initApprovalFlow(r.id)
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
  if (r.companyId !== me.companyId) {
    return c.json({ code: 'FORBIDDEN', message: '无权查看该报销单' }, 403)
  }
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
  if (r.companyId !== me.companyId) return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)

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
  const t = await transition(c, id, 'submit')
  // 提交后初始化审批流（若尚无审批节点）
  const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.reimbursementId, id))
  if (steps.length === 0) await initApprovalFlow(id)
  return t
})

reimb.post('/:id/approve', async (c) => {
  const me = currentUser(c)
  if (!isApprover(me.role)) return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  return applyApprovalAction(c, c.req.param('id'), 'approve')
})

reimb.post('/:id/reject', async (c) => {
  const me = currentUser(c)
  if (!isApprover(me.role)) return c.json({ code: 'FORBIDDEN', message: '无审批权限' }, 403)
  const body = await c.req.json().catch(() => ({}))
  return applyApprovalAction(c, c.req.param('id'), 'reject', body.reason || body.comment || '未填写原因')
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
  if (!canPay(me.role)) return c.json({ code: 'FORBIDDEN', message: '无付款权限' }, 403)
  return transition(c, c.req.param('id'), 'pay')
})

export const reimbursementRoutes = reimb
