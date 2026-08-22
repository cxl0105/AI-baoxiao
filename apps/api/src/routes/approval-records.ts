import { Hono } from 'hono'
import { pool } from '../db'
import { authMiddleware, currentUser } from '../lib/auth'

const records = new Hono()
records.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 审批记录双视角：
//   mine         — 我发起的报销单（reimbursements.userId = me）
//   participated — 我参与审批的单据（approval_steps.actor = me.name 且有 approve/reject 动作）
records.get('/', async (c) => {
  const me = currentUser(c)

  // ---- 我发起的 ----
  const mineRes = await pool.query(
    `SELECT r.id, r.code, r.title, r.type, r.amount, r.status, r.created_at, r.updated_at,
            COALESCE((SELECT COUNT(*) FROM invoices i WHERE i.reimbursement_id = r.id), 0) AS invoice_count,
            COALESCE((SELECT it.category FROM reimbursement_items it WHERE it.reimbursement_id = r.id LIMIT 1), 'other') AS category
     FROM reimbursements r
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [me.sub]
  )

  const reimbIds = mineRes.rows.map((r) => r.id)
  const stepRows = reimbIds.length
    ? await pool.query(
        `SELECT reimbursement_id, step_index, actor, action, time
         FROM approval_steps WHERE reimbursement_id = ANY($1::uuid[])`,
        [reimbIds]
      )
    : { rows: [] as any[] }

  const stepsByReimb = new Map<string, any[]>()
  for (const s of stepRows.rows) {
    if (!stepsByReimb.has(s.reimbursement_id)) stepsByReimb.set(s.reimbursement_id, [])
    stepsByReimb.get(s.reimbursement_id)!.push(s)
  }

  const mine = mineRes.rows.map((r) => {
    const steps = (stepsByReimb.get(r.id) || []).sort((a, b) => a.step_index - b.step_index)
    const totalSteps = steps.length > 0 ? Math.max(1, steps.length) : 3
    // 当前步 = 已处理动作数（submit 算 1，approve/reject 各推进）
    const doneActions = steps.filter((s) => ['submit', 'approve', 'reject', 'pay'].includes(s.action)).length
    const currentStep = r.status === 'approved' || r.status === 'paid' ? totalSteps : Math.min(totalSteps, doneActions || 0)
    const pendingStep = steps.find((s) => s.action === 'pending')
    const currentApprover = pendingStep ? pendingStep.actor : ''
    const submitStep = steps.find((s) => s.action === 'submit')
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      type: r.type,
      category: r.category,
      amount: num(r.amount),
      invoiceCount: num(r.invoice_count),
      createdAt: r.created_at,
      status: r.status,
      submittedAt: submitStep?.time || r.created_at,
      currentApprover,
      currentStep,
      totalSteps,
      updatedAt: r.updated_at,
    }
  })

  // ---- 我参与的（我实际审批过的单据）----
  const partRes = await pool.query(
    `SELECT DISTINCT ON (r.id)
            r.id, r.code, r.title, r.type, r.amount, r.status, r.created_at, r.updated_at,
            u.name AS applicant, r.department AS applicant_dept,
            COALESCE((SELECT COUNT(*) FROM invoices i WHERE i.reimbursement_id = r.id), 0) AS invoice_count,
            COALESCE((SELECT it.category FROM reimbursement_items it WHERE it.reimbursement_id = r.id LIMIT 1), 'other') AS category,
            s.action AS my_last_action, s.time AS my_last_action_at, s.role AS my_role
     FROM approval_steps s
     JOIN reimbursements r ON r.id = s.reimbursement_id
     LEFT JOIN users u ON u.id = r.user_id
     WHERE s.actor = $1 AND s.action IN ('approved', 'rejected')
     ORDER BY r.id, s.time DESC`,
    [me.name || me.role]
  )

  const participated = partRes.rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    category: r.category,
    amount: num(r.amount),
    invoiceCount: num(r.invoice_count),
    createdAt: r.created_at,
    applicant: r.applicant || '',
    applicantDept: r.applicant_dept || '',
    finalStatus: r.status,
    myLastActionAt: r.my_last_action_at,
    myLastAction: r.my_last_action === 'rejected' ? 'rejected' : 'approved',
    myRole: r.my_role || '',
  }))

  return c.json({ code: 'SUCCESS', data: { mine, participated } })
})

export const approvalRecordsRoutes = records
