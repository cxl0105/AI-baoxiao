import { Hono } from 'hono'
import { pool } from '../db'
import { authMiddleware, currentUser, isApprover } from '../lib/auth'

const stats = new Hono()
stats.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 近 N 个月份标签（如 ['2026-03', ...]），基于北京时区
function lastMonths(n: number): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

stats.get('/', async (c) => {
  const me = currentUser(c)
  const isAppr = isApprover(me.role)
  const cid = me.companyId

  // ---- 员工个人统计 ----
  const myRes = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status IN ('approved','paid') AND created_at >= date_trunc('month', now()) THEN amount END), 0) AS month_total,
       COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
       COUNT(*) FILTER (WHERE status IN ('approved','paid')) AS approved_count,
       COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count
     FROM reimbursements WHERE user_id = $1 AND company_id = $2`,
    [me.sub, cid]
  )
  const myRow = myRes.rows[0]

  // 员工最近报销（5 条）
  const recentRes = await pool.query(
    `SELECT id, code, title, type, amount, status, created_at
     FROM reimbursements WHERE user_id = $1 AND company_id = $2 ORDER BY created_at DESC LIMIT 5`,
    [me.sub, cid]
  )

  // ---- 审批人视角（管理员/总经理/财务/部门经理）----
  let approval: any = {
    pendingCount: 0,
    pendingAmount: 0,
    processedThisMonth: 0,
    overdueCount: 0,
    pendingList: [],
  }
  if (isAppr) {
    const apRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
         COUNT(*) FILTER (WHERE status IN ('approved','rejected','paid') AND updated_at >= date_trunc('month', now())) AS processed_this_month,
         COUNT(*) FILTER (WHERE status = 'pending' AND created_at <= now() - interval '48 hours') AS overdue_count
       FROM reimbursements WHERE company_id = $1`,
      [cid]
    )
    const ap = apRes.rows[0]
    approval = {
      pendingCount: num(ap.pending_count),
      pendingAmount: num(ap.pending_amount),
      processedThisMonth: num(ap.processed_this_month),
      overdueCount: num(ap.overdue_count),
    }
    const plRes = await pool.query(
      `SELECT r.id, r.code, r.title, r.type, r.amount, r.status, r.created_at, r.department,
              u.name AS submitter
       FROM reimbursements r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending' AND r.company_id = $1 ORDER BY r.created_at DESC LIMIT 100`,
      [cid]
    )
    approval.pendingList = plRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      title: r.title,
      type: r.type,
      amount: num(r.amount),
      status: r.status,
      createdAt: r.created_at,
      department: r.department || '',
      submitter: r.submitter || '',
    }))
  }

  // ---- 全局聚合（月度趋势 + 部门统计 + 活跃成员 + 全公司本月）----
  const months = lastMonths(6)
  const trendRes = await pool.query(
    `SELECT to_char(created_at, 'YYYY-MM') AS ym, COALESCE(SUM(amount), 0) AS amt
     FROM reimbursements
     WHERE company_id = $1 AND status NOT IN ('draft','revoked') AND created_at >= date_trunc('month', now()) - interval '5 months'
     GROUP BY ym ORDER BY ym`,
    [cid]
  )
  const trendMap = new Map(trendRes.rows.map((r) => [r.ym, num(r.amt)]))
  const monthlyTrend = months.map((m) => ({ month: m, amount: trendMap.get(m) || 0 }))

  const deptRes = await pool.query(
    `SELECT COALESCE(department, '未分配') AS dept, COALESCE(SUM(amount), 0) AS amt, COUNT(*) AS cnt
     FROM reimbursements
     WHERE company_id = $1 AND status NOT IN ('draft','revoked')
     GROUP BY department ORDER BY amt DESC`,
    [cid]
  )
  const departmentStats = deptRes.rows.map((r) => ({ name: r.dept, amount: num(r.amt), count: num(r.cnt) }))

  const memberRes = await pool.query(`SELECT COUNT(*) AS c FROM users WHERE company_id = $1`, [cid])
  const activeMembers = num(memberRes.rows[0].c)

  const companyMonthRes = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS amt FROM reimbursements
     WHERE company_id = $1 AND status IN ('approved','paid') AND created_at >= date_trunc('month', now())`,
    [cid]
  )
  const companyMonthTotal = num(companyMonthRes.rows[0].amt)

  return c.json({
    code: 'SUCCESS',
    data: {
      my: {
        monthTotal: num(myRow.month_total),
        pendingCount: num(myRow.pending_count),
        approvedCount: num(myRow.approved_count),
        rejectedCount: num(myRow.rejected_count),
        recent: recentRes.rows.map((r) => ({
          id: r.id,
          code: r.code,
          title: r.title,
          type: r.type,
          amount: num(r.amount),
          status: r.status,
          createdAt: r.created_at,
        })),
      },
      approval,
      monthlyTrend,
      departmentStats,
      activeMembers,
      companyMonthTotal,
    },
  })
})

export const statsRoutes = stats
