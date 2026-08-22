import { Hono } from 'hono'
import { pool } from '../db'
import { authMiddleware, currentUser, isAdminOrFinance } from '../lib/auth'

const a = new Hono()
a.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// GET /api/v1/analytics?year=2026&quarter=all
a.get('/', async (c) => {
  const me = currentUser(c)
  const { year = '', quarter = 'all' } = c.req.query()
  const isApprover = isAdminOrFinance(me.role)

  const nowYear = String(new Date().getFullYear())
  const y = Number(year) || Number(nowYear)
  const qm: number[] = quarter === 'q1' ? [1, 2, 3] : quarter === 'q2' ? [4, 5, 6] : quarter === 'q3' ? [7, 8, 9] : quarter === 'q4' ? [10, 11, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

  // 所有条件统一用 r. 前缀，避免 JOIN users 后 created_at/status 歧义
  const dateCond = `EXTRACT(YEAR FROM r.created_at) = ${y}` +
    (quarter !== 'all' ? ` AND EXTRACT(MONTH FROM r.created_at) IN (${qm.join(',')})` : '')
  const validCond = `r.status NOT IN ('draft','revoked') AND ${dateCond}`

  // ---- 月度趋势 ----
  const trendRes = await pool.query(
    `SELECT EXTRACT(MONTH FROM r.created_at)::int AS m, COALESCE(SUM(r.amount),0) AS amt
     FROM reimbursements r WHERE ${validCond} GROUP BY m ORDER BY m`
  )
  const trendMap = new Map(trendRes.rows.map((r) => [r.m, num(r.amt)]))
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    amount: trendMap.get(i + 1) || 0,
  }))

  // ---- 部门统计 ----
  const deptRes = await pool.query(
    `SELECT COALESCE(r.department,'未分配') AS dept, COALESCE(SUM(r.amount),0) AS amt, COUNT(*) AS cnt
     FROM reimbursements r WHERE ${validCond} GROUP BY r.department ORDER BY amt DESC`
  )
  const departmentStats = deptRes.rows.map((r) => ({ name: r.dept, amount: num(r.amt), count: num(r.cnt) }))

  // ---- 分类统计 ----
  const catRes = await pool.query(
    `SELECT ri.category AS cat, COALESCE(SUM(ri.amount),0) AS amt, COUNT(*) AS cnt
     FROM reimbursement_items ri
     JOIN reimbursements r ON r.id = ri.reimbursement_id
     WHERE r.status NOT IN ('draft','revoked') AND EXTRACT(YEAR FROM r.created_at) = ${y}
       ${quarter !== 'all' ? ` AND EXTRACT(MONTH FROM r.created_at) IN (${qm.join(',')})` : ''}
     GROUP BY ri.category ORDER BY amt DESC`
  )
  const categoryStats = catRes.rows.map((r) => ({ category: r.cat, amount: num(r.amt), count: num(r.cnt) }))

  // ---- Top 员工 ----
  const empRes = await pool.query(
    `SELECT u.id, u.name, u.department, COALESCE(SUM(r.amount),0) AS amt, COUNT(*) AS cnt
     FROM reimbursements r JOIN users u ON u.id = r.user_id
     WHERE ${validCond} GROUP BY u.id, u.name, u.department ORDER BY amt DESC LIMIT 10`
  )
  const topEmployees = empRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    department: r.department || '',
    amount: num(r.amt),
    count: num(r.cnt),
  }))

  // ---- 汇总 KPI ----
  const kpiRes = await pool.query(
    `SELECT
       COALESCE(SUM(r.amount),0) AS total_amount,
       COUNT(*) AS total_count,
       COUNT(*) FILTER (WHERE r.status IN ('approved','paid')) AS approved_count,
       COUNT(*) FILTER (WHERE r.status = 'rejected') AS rejected_count
     FROM reimbursements r WHERE ${validCond}`
  )
  const kpi = kpiRes.rows[0]
  const totalAmount = num(kpi.total_amount)
  const totalCount = num(kpi.total_count)
  const approvedCount = num(kpi.approved_count)
  const rejectedCount = num(kpi.rejected_count)
  const passRate = totalCount > 0 ? ((approvedCount / totalCount) * 100) : 0

  // ---- 预算执行 ----
  const budgetRes = await pool.query(
    `SELECT kind, name, code, amount, period FROM budgets ORDER BY kind, name`
  )
  const budgetSummary: any[] = []
  for (const b of budgetRes.rows) {
    let used = 0
    if (b.kind === 'project') {
      const r = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS amt FROM reimbursements
         WHERE project_code = $1 AND status IN ('approved','paid') AND EXTRACT(YEAR FROM created_at) = ${y}`,
        [b.code]
      )
      used = num(r.rows[0].amt)
    } else {
      const r = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS amt FROM reimbursements
         WHERE department = $1 AND status IN ('approved','paid') AND EXTRACT(YEAR FROM created_at) = ${y}`,
        [b.name]
      )
      used = num(r.rows[0].amt)
    }
    budgetSummary.push({
      kind: b.kind,
      name: b.name,
      code: b.code || '',
      amount: num(b.amount),
      usedAmount: used,
      utilization: b.amount > 0 ? (used / num(b.amount)) * 100 : 0,
    })
  }

  // ---- 异常检测（真实规则）----
  const anomalies: any[] = []
  const bigRes = await pool.query(
    `SELECT r.id, r.code, r.title, r.amount, r.department, u.name AS submitter
     FROM reimbursements r JOIN users u ON u.id = r.user_id
     WHERE ${validCond} AND r.amount >= 50000 ORDER BY r.amount DESC LIMIT 20`
  )
  for (const r of bigRes.rows) {
    anomalies.push({
      id: r.id, code: r.code, title: r.title, amount: num(r.amount),
      department: r.department || '', submitter: r.submitter || '',
      type: 'high_amount', reason: '单笔大额报销（≥¥50,000），建议人工复核',
    })
  }
  const rejRes = await pool.query(
    `SELECT r.id, r.code, r.title, r.amount, r.department, u.name AS submitter
     FROM reimbursements r JOIN users u ON u.id = r.user_id
     WHERE ${validCond} AND r.status = 'rejected' ORDER BY r.amount DESC LIMIT 20`
  )
  for (const r of rejRes.rows) {
    anomalies.push({
      id: r.id, code: r.code, title: r.title, amount: num(r.amount),
      department: r.department || '', submitter: r.submitter || '',
      type: 'rejected', reason: '单据被驳回',
    })
  }

  return c.json({
    code: 'SUCCESS',
    data: {
      kpi: { totalAmount, totalCount, approvedCount, rejectedCount, passRate },
      monthlyTrend,
      departmentStats,
      categoryStats,
      topEmployees,
      budgetSummary,
      anomalies,
    },
  })
})

export const analyticsRoutes = a
