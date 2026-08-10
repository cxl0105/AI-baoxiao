/**
 * 汇联易风格：费用标准检查 + 预算控制 + 智能审批路由
 *
 * 提供纯函数供报销单页面、审批页面、预算管理页面调用。
 */
import {
  type ReimbursementPolicy,
  type ExpenseStandardRule,
  type EmployeeLevel,
  type ExpenseCategoryKey,
  type ApprovalRoutingRule,
  EMPLOYEE_LEVELS,
} from './settings'

const n = (v: unknown): number => {
  if (v == null || v === '') return 0
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/* ======================================================================
   一、费用标准检查
   ====================================================================== */

/** 单条超标问题 */
export interface OverStandardIssue {
  /** 来源行索引（从 0 起；-1 表示汇总级） */
  rowIndex: number
  /** 费用类别 */
  category: ExpenseCategoryKey
  /** 实际金额 */
  amount: number
  /** 限额 */
  limit: number
  /** 限额类型 */
  limitType: 'perReceipt' | 'perDay'
  /** 处理策略 */
  action: 'warn' | 'block' | 'escalation'
  /** 描述信息 */
  message: string
  /** 触发的规则 */
  rule: ExpenseStandardRule
}

/** 查找匹配的费用标准规则（按职级+类别+差旅类型） */
export function findStandardRule(
  policy: ReimbursementPolicy,
  level: EmployeeLevel,
  category: ExpenseCategoryKey,
  tripType: string,
): ExpenseStandardRule | undefined {
  const rules = policy.expenseStandards || []
  // 优先匹配 精确 tripType，其次 any
  return (
    rules.find((r) => r.level === level && r.category === category && r.tripType === tripType) ||
    rules.find((r) => r.level === level && r.category === category && r.tripType === 'any')
  )
}

/**
 * 检查单行费用是否超标。
 *
 * @param daysCount 当行覆盖的天数（用于住宿/餐饮的单日限额计算）。默认 1。
 */
export function checkExpenseRowStandard(
  policy: ReimbursementPolicy,
  level: EmployeeLevel,
  tripType: string,
  row: { amounts: Partial<Record<ExpenseCategoryKey, number>> },
  rowIndex: number,
  daysCount: number = 1,
): OverStandardIssue[] {
  const issues: OverStandardIssue[] = []
  const enabledCategories = (policy.categories || []).filter((c) => c.enabled)
  for (const cat of enabledCategories) {
    const amount = n(row.amounts[cat.key as ExpenseCategoryKey])
    if (amount <= 0) continue
    const rule = findStandardRule(policy, level, cat.key as ExpenseCategoryKey, tripType)
    if (!rule) continue

    // 单笔限额
    if (rule.perReceiptLimit > 0 && amount > rule.perReceiptLimit) {
      issues.push({
        rowIndex,
        category: cat.key as ExpenseCategoryKey,
        amount,
        limit: rule.perReceiptLimit,
        limitType: 'perReceipt',
        action: rule.overLimitAction,
        message: `${cat.label}单笔 ¥${amount.toFixed(2)} 超过限额 ¥${rule.perReceiptLimit.toFixed(2)}`,
        rule,
      })
    }
    // 单日限额（按天均摊后比较）
    if (rule.perDayLimit > 0 && daysCount > 0) {
      const perDay = amount / daysCount
      if (perDay > rule.perDayLimit) {
        issues.push({
          rowIndex,
          category: cat.key as ExpenseCategoryKey,
          amount,
          limit: rule.perDayLimit,
          limitType: 'perDay',
          action: rule.overLimitAction,
          message: `${cat.label}日均 ¥${perDay.toFixed(2)} 超过限额 ¥${rule.perDayLimit.toFixed(2)}/天（${daysCount}天）`,
          rule,
        })
      }
    }
  }
  return issues
}

/**
 * 检查整张报销单的超标情况。
 *
 * 策略：
 * - 单笔限额：逐行检查
 * - 单日限额：按日期聚合同类费用后检查（同一日期 + 同一类别 合计 / 1 天）
 */
export function checkReportStandards(
  policy: ReimbursementPolicy,
  level: EmployeeLevel,
  tripType: string,
  rows: Array<{ date: string; amounts: Partial<Record<ExpenseCategoryKey, number>> }>,
): OverStandardIssue[] {
  const issues: OverStandardIssue[] = []
  const enabledCategories = (policy.categories || []).filter((c) => c.enabled)

  // 1) 逐行检查单笔限额
  rows.forEach((row, idx) => {
    for (const cat of enabledCategories) {
      const amount = n(row.amounts[cat.key as ExpenseCategoryKey])
      if (amount <= 0) continue
      const rule = findStandardRule(policy, level, cat.key as ExpenseCategoryKey, tripType)
      if (!rule) continue
      if (rule.perReceiptLimit > 0 && amount > rule.perReceiptLimit) {
        issues.push({
          rowIndex: idx,
          category: cat.key as ExpenseCategoryKey,
          amount,
          limit: rule.perReceiptLimit,
          limitType: 'perReceipt',
          action: rule.overLimitAction,
          message: `第${idx + 1}行 ${cat.label}单笔 ¥${amount.toFixed(2)} 超过限额 ¥${rule.perReceiptLimit.toFixed(2)}`,
          rule,
        })
      }
    }
  })

  // 2) 按日期聚合检查单日限额
  const dailyMap: Record<string, Partial<Record<ExpenseCategoryKey, number>>> = {}
  for (const row of rows) {
    const key = row.date || 'nodate'
    if (!dailyMap[key]) dailyMap[key] = {}
    for (const cat of enabledCategories) {
      const v = n(row.amounts[cat.key as ExpenseCategoryKey])
      if (v > 0) {
        dailyMap[key][cat.key as ExpenseCategoryKey] = n(dailyMap[key][cat.key as ExpenseCategoryKey]) + v
      }
    }
  }
  for (const [date, amounts] of Object.entries(dailyMap)) {
    for (const cat of enabledCategories) {
      const amount = n(amounts[cat.key as ExpenseCategoryKey])
      if (amount <= 0) continue
      const rule = findStandardRule(policy, level, cat.key as ExpenseCategoryKey, tripType)
      if (!rule || rule.perDayLimit <= 0) continue
      if (amount > rule.perDayLimit) {
        issues.push({
          rowIndex: -1,
          category: cat.key as ExpenseCategoryKey,
          amount,
          limit: rule.perDayLimit,
          limitType: 'perDay',
          action: rule.overLimitAction,
          message: `${date} ${cat.label}当日合计 ¥${amount.toFixed(2)} 超过日限额 ¥${rule.perDayLimit.toFixed(2)}`,
          rule,
        })
      }
    }
  }

  return issues
}

/** 是否存在阻断级超标 */
export function hasBlockIssue(issues: OverStandardIssue[]): boolean {
  return issues.some((i) => i.action === 'block')
}

/** 是否存在升级审批级超标 */
export function hasEscalationIssue(issues: OverStandardIssue[]): boolean {
  return issues.some((i) => i.action === 'escalation')
}

/* ======================================================================
   二、预算控制
   ====================================================================== */

/** 预算检查结果 */
export interface BudgetCheckResult {
  type: 'department' | 'project'
  /** 部门名 / 项目名 */
  name: string
  /** 预算总额 */
  budgetAmount: number
  /** 已使用额度（不含本次） */
  usedAmount: number
  /** 本次报销金额 */
  pendingAmount: number
  /** 本次后预计使用 */
  afterAmount: number
  /** 使用率（不含本次） */
  utilization: number
  /** 本次后使用率 */
  afterUtilization: number
  /** 是否超预算 */
  overBudget: boolean
  /** 处理策略 */
  action: 'warn' | 'block' | 'escalation'
}

/** 检查预算（部门 + 项目） */
export function checkBudget(
  policy: ReimbursementPolicy,
  department: string,
  projectCode: string,
  totalAmount: number,
): BudgetCheckResult[] {
  const results: BudgetCheckResult[] = []
  const bc = policy.budgetControl
  if (!bc?.enabled) return results

  // 部门预算
  if (department) {
    const dep = bc.departmentBudgets.find((d) => d.department === department)
    if (dep) {
      const after = n(dep.usedAmount) + n(totalAmount)
      results.push({
        type: 'department',
        name: dep.department,
        budgetAmount: dep.amount,
        usedAmount: dep.usedAmount,
        pendingAmount: n(totalAmount),
        afterAmount: after,
        utilization: dep.amount > 0 ? dep.usedAmount / dep.amount : 0,
        afterUtilization: dep.amount > 0 ? after / dep.amount : 0,
        overBudget: after > dep.amount,
        action: bc.overBudgetAction,
      })
    }
  }

  // 项目预算
  if (projectCode) {
    const proj = bc.projectBudgets.find((p) => p.projectCode === projectCode)
    if (proj) {
      const after = n(proj.usedAmount) + n(totalAmount)
      results.push({
        type: 'project',
        name: `${proj.projectCode} ${proj.projectName}`,
        budgetAmount: proj.amount,
        usedAmount: proj.usedAmount,
        pendingAmount: n(totalAmount),
        afterAmount: after,
        utilization: proj.amount > 0 ? proj.usedAmount / proj.amount : 0,
        afterUtilization: proj.amount > 0 ? after / proj.amount : 0,
        overBudget: after > proj.amount,
        action: bc.overBudgetAction,
      })
    }
  }

  return results
}

/** 是否存在超预算 */
export function hasOverBudget(results: BudgetCheckResult[]): boolean {
  return results.some((r) => r.overBudget)
}

/** 是否存在阻断级超预算 */
export function hasBlockBudget(results: BudgetCheckResult[]): boolean {
  return results.some((r) => r.overBudget && r.action === 'block')
}

/** 是否存在升级审批级超预算 */
export function hasEscalationBudget(results: BudgetCheckResult[]): boolean {
  return results.some((r) => r.overBudget && r.action === 'escalation')
}

/** 预算使用率分级 */
export function utilizationLevel(rate: number): 'safe' | 'warning' | 'danger' | 'exceeded' {
  if (rate >= 1) return 'exceeded'
  if (rate >= 0.9) return 'danger'
  if (rate >= 0.7) return 'warning'
  return 'safe'
}

/* ======================================================================
   三、智能审批路由
   ====================================================================== */

/** 审批路由计算结果 */
export interface ApprovalRoutingResult {
  /** 触发的规则 */
  triggeredRules: ApprovalRoutingRule[]
  /** 应追加的审批节点 key（去重） */
  appendSignerKeys: string[]
  /** 是否触发了任何升级 */
  hasEscalation: boolean
}

/**
 * 根据单据情况计算审批路由。
 *
 * 触发条件组合（OR 关系）：
 * - 金额阈值：单据总额 > amountThreshold 且 amountThreshold > 0
 * - 超标：hasOverStandard=true 且规则要求 hasOverStandard
 * - 超预算：hasOverBudget=true 且规则要求 hasOverBudget
 */
export function computeApprovalRouting(
  policy: ReimbursementPolicy,
  totalAmount: number,
  hasOverStandard: boolean,
  hasOverBudget: boolean,
): ApprovalRoutingResult {
  const rules = (policy.approvalRouting || []).filter((r) => r.enabled)
  const triggered: ApprovalRoutingRule[] = []
  const keySet = new Set<string>()

  for (const rule of rules) {
    let match = false
    // 金额阈值触发
    if (rule.amountThreshold > 0 && n(totalAmount) > rule.amountThreshold) {
      match = true
    }
    // 超标触发
    if (rule.hasOverStandard && hasOverStandard) {
      match = true
    }
    // 超预算触发
    if (rule.hasOverBudget && hasOverBudget) {
      match = true
    }
    if (match) {
      triggered.push(rule)
      if (rule.appendSignerKey) keySet.add(rule.appendSignerKey)
    }
  }

  return {
    triggeredRules: triggered,
    appendSignerKeys: Array.from(keySet),
    hasEscalation: triggered.length > 0,
  }
}

/* ======================================================================
   四、辅助：职级工具
   ====================================================================== */

export function getEmployeeLevelLabel(level: EmployeeLevel): string {
  return EMPLOYEE_LEVELS.find((l) => l.value === level)?.label || level
}

/** 根据用户角色推断默认职级 */
export function inferLevelFromRole(role?: string): EmployeeLevel {
  if (!role) return 'staff'
  if (role === 'admin') return 'c_level'
  if (role === 'finance') return 'manager'
  return 'staff'
}
