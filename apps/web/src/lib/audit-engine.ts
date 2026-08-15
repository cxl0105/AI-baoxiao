/**
 * 逐条智能审核引擎
 *
 * 参考 AuditAgent 的逐条审核思路，对报销单进行多维度检查：
 * 1. 发票合规性 - 验真状态、OCR 置信度
 * 2. 发票查重 - 发票代码+号码是否重复报销
 * 3. 费用标准 - 每项费用是否超标（单笔/单日限额）
 * 4. 预算控制 - 部门/项目预算是否超支
 * 5. 审批路由 - 是否需要升级审批
 * 6. 信息完整性 - 必填字段、发票附件
 * 7. 时效性 - 费用日期是否在报销时效内
 * 8. 逻辑一致性 - 金额合计匹配、类型与事由匹配
 */

import type { ReimbursementDetail } from './reimbursements'
import {
  checkReportStandards,
  checkBudget,
  computeApprovalRouting,
  hasBlockIssue,
  hasOverBudget,
  type OverStandardIssue,
  type BudgetCheckResult,
  type ApprovalRoutingResult,
} from './expense-standard'
import {
  readReimbursementPolicySync,
  type ReimbursementPolicy,
  type ExpenseCategoryKey,
} from './settings'
import { useInvoiceStore, type InvoiceRecord } from './invoice-store'

// --- 审核结果类型定义 ---

export type AuditStatus = 'pass' | 'warn' | 'fail' | 'skip'
export type AuditCategory =
  | 'compliance'    // 发票合规
  | 'duplicate'     // 发票查重
  | 'standard'      // 费用标准
  | 'budget'        // 预算控制
  | 'routing'       // 审批路由
  | 'completeness'  // 信息完整性
  | 'timeliness'    // 时效性
  | 'consistency'   // 逻辑一致性

export interface AuditCheckItem {
  id: string
  category: AuditCategory
  categoryLabel: string
  title: string
  status: AuditStatus
  message: string
  detail?: string
  severity: 'info' | 'warning' | 'error'
}

export interface AuditResult {
  items: AuditCheckItem[]
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
    skipped: number
    overallStatus: 'pass' | 'warn' | 'fail'
    score: number // 0-100
  }
}

// --- 审核类别标签 ---
const CATEGORY_LABELS: Record<AuditCategory, string> = {
  compliance: '发票合规',
  duplicate: '发票查重',
  standard: '费用标准',
  budget: '预算控制',
  routing: '审批路由',
  completeness: '信息完整性',
  timeliness: '时效性',
  consistency: '逻辑一致性',
}

// --- 辅助函数 ---

function makeId(category: string, index: number): string {
  return `audit-${category}-${index}`
}

function fmtMoney(n: number): string {
  return `¥${n.toFixed(2)}`
}

// --- 主审核函数 ---

export interface AuditInput {
  detail: ReimbursementDetail
  policy?: ReimbursementPolicy
  invoices?: InvoiceRecord[]
  employeeLevel?: string
  tripType?: string
  department?: string
  projectCode?: string
}

export function runAudit(input: AuditInput): AuditResult {
  const { detail } = input
  const policy = input.policy || readReimbursementPolicySync()
  const items: AuditCheckItem[] = []

  // 1. 发票合规性检查
  items.push(...checkCompliance(detail, input.invoices))

  // 2. 发票查重检查
  items.push(...checkDuplicate(detail, input.invoices))

  // 3. 费用标准检查
  items.push(...checkStandard(detail, policy, input.employeeLevel, input.tripType))

  // 4. 预算控制检查
  items.push(...checkBudgetControl(detail, policy, input.department, input.projectCode))

  // 5. 审批路由检查
  items.push(...checkRouting(detail, policy, items))

  // 6. 信息完整性检查
  items.push(...checkCompleteness(detail))

  // 7. 时效性检查
  items.push(...checkTimeliness(detail))

  // 8. 逻辑一致性检查
  items.push(...checkConsistency(detail))

  // 汇总
  const passed = items.filter((i) => i.status === 'pass').length
  const warnings = items.filter((i) => i.status === 'warn').length
  const failed = items.filter((i) => i.status === 'fail').length
  const skipped = items.filter((i) => i.status === 'skip').length
  const total = items.length

  let overallStatus: 'pass' | 'warn' | 'fail' = 'pass'
  if (failed > 0) overallStatus = 'fail'
  else if (warnings > 0) overallStatus = 'warn'

  const score = total > 0 ? Math.round((passed / total) * 100) : 0

  return {
    items,
    summary: { total, passed, warnings, failed, skipped, overallStatus, score },
  }
}

// --- 1. 发票合规性检查 ---

function checkCompliance(
  detail: ReimbursementDetail,
  invoices?: InvoiceRecord[],
): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const pool = useInvoiceStore.getState().invoices
  const allInvoices = invoices || pool

  if (detail.invoiceCount === 0 && allInvoices.length === 0) {
    items.push({
      id: makeId('compliance', 0),
      category: 'compliance',
      categoryLabel: CATEGORY_LABELS.compliance,
      title: '发票验真',
      status: 'skip',
      message: '未关联发票，跳过验真检查',
      severity: 'info',
    })
    return items
  }

  const unverified = allInvoices.filter((inv) => inv.verifyStatus === 'unverified' || inv.verifyStatus === 'failed')
  const verifying = allInvoices.filter((inv) => inv.verifyStatus === 'verifying')
  const verified = allInvoices.filter((inv) => inv.verifyStatus === 'verified')

  if (unverified.length > 0) {
    items.push({
      id: makeId('compliance', 0),
      category: 'compliance',
      categoryLabel: CATEGORY_LABELS.compliance,
      title: '发票验真',
      status: 'warn',
      message: `${unverified.length} 张发票未验真`,
      detail: unverified
        .map((inv) => `  ${inv.invoiceCode}-${inv.invoiceNumber}（${inv.sellerName}）`)
        .join('\n'),
      severity: 'warning',
    })
  } else if (verifying.length > 0) {
    items.push({
      id: makeId('compliance', 0),
      category: 'compliance',
      categoryLabel: CATEGORY_LABELS.compliance,
      title: '发票验真',
      status: 'warn',
      message: `${verifying.length} 张发票正在验真中`,
      severity: 'warning',
    })
  } else if (verified.length > 0) {
    const failed = verified.filter((inv) => inv.verifyDetails?.conclusion === 'inconsistent')
    if (failed.length > 0) {
      items.push({
        id: makeId('compliance', 0),
        category: 'compliance',
        categoryLabel: CATEGORY_LABELS.compliance,
        title: '发票验真',
        status: 'fail',
        message: `${failed.length} 张发票验真不一致`,
        detail: failed.map((inv) => `  ${inv.invoiceCode}-${inv.invoiceNumber}`).join('\n'),
        severity: 'error',
      })
    } else {
      items.push({
        id: makeId('compliance', 0),
        category: 'compliance',
        categoryLabel: CATEGORY_LABELS.compliance,
        title: '发票验真',
        status: 'pass',
        message: `${verified.length} 张发票均已验真通过`,
        severity: 'info',
      })
    }
  } else {
    items.push({
      id: makeId('compliance', 0),
      category: 'compliance',
      categoryLabel: CATEGORY_LABELS.compliance,
      title: '发票验真',
      status: 'skip',
      message: '无发票需要验真',
      severity: 'info',
    })
  }

  return items
}

// --- 2. 发票查重检查 ---

function checkDuplicate(
  detail: ReimbursementDetail,
  invoices?: InvoiceRecord[],
): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const pool = useInvoiceStore.getState().invoices
  const allInvoices = invoices || pool

  if (allInvoices.length === 0) {
    items.push({
      id: makeId('duplicate', 0),
      category: 'duplicate',
      categoryLabel: CATEGORY_LABELS.duplicate,
      title: '发票查重',
      status: 'skip',
      message: '无发票，跳过查重检查',
      severity: 'info',
    })
    return items
  }

  const duplicates = allInvoices.filter((inv) => inv.status === 'duplicate')
  // 也检查发票池中是否有代码+号码相同但状态非void的
  const seen = new Set<string>()
  const dups: InvoiceRecord[] = []
  for (const inv of allInvoices) {
    const key = `${inv.invoiceCode}-${inv.invoiceNumber}`
    if (inv.status === 'void') continue
    if (seen.has(key)) {
      dups.push(inv)
    } else {
      seen.add(key)
    }
  }

  const allDups = [...duplicates, ...dups]
  if (allDups.length > 0) {
    items.push({
      id: makeId('duplicate', 0),
      category: 'duplicate',
      categoryLabel: CATEGORY_LABELS.duplicate,
      title: '发票查重',
      status: 'fail',
      message: `发现 ${allDups.length} 张重复发票`,
      detail: allDups
        .map((inv) => `  ${inv.invoiceCode}-${inv.invoiceNumber}（${inv.sellerName}，${fmtMoney(inv.amount)}）`)
        .join('\n'),
      severity: 'error',
    })
  } else {
    items.push({
      id: makeId('duplicate', 0),
      category: 'duplicate',
      categoryLabel: CATEGORY_LABELS.duplicate,
      title: '发票查重',
      status: 'pass',
      message: `${allInvoices.length} 张发票无重复`,
      severity: 'info',
    })
  }

  return items
}

// --- 3. 费用标准检查 ---

function checkStandard(
  detail: ReimbursementDetail,
  policy: ReimbursementPolicy,
  employeeLevel?: string,
  tripType?: string,
): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const level = (employeeLevel || 'staff') as import('./settings').EmployeeLevel
  const tt = tripType || 'domestic'

  // 将报销单明细转换为检查所需的 rows 格式
  const rows = detail.items.map((item) => ({
    date: item.date,
    amounts: { [item.category]: item.amount } as Partial<Record<ExpenseCategoryKey, number>>,
  }))

  if (rows.length === 0) {
    items.push({
      id: makeId('standard', 0),
      category: 'standard',
      categoryLabel: CATEGORY_LABELS.standard,
      title: '费用标准',
      status: 'skip',
      message: '无费用明细，跳过标准检查',
      severity: 'info',
    })
    return items
  }

  const issues = checkReportStandards(policy, level, tt, rows)
  const blocked = issues.filter((i) => i.action === 'block')
  const escalated = issues.filter((i) => i.action === 'escalation')
  const warned = issues.filter((i) => i.action === 'warn')

  if (blocked.length > 0) {
    items.push({
      id: makeId('standard', 0),
      category: 'standard',
      categoryLabel: CATEGORY_LABELS.standard,
      title: '费用标准',
      status: 'fail',
      message: `${blocked.length} 项费用超标准（阻断）`,
      detail: blocked.map((i) => `  ${i.message}`).join('\n'),
      severity: 'error',
    })
  } else if (escalated.length > 0 || warned.length > 0) {
    const all = [...escalated, ...warned]
    items.push({
      id: makeId('standard', 0),
      category: 'standard',
      categoryLabel: CATEGORY_LABELS.standard,
      title: '费用标准',
      status: 'warn',
      message: `${all.length} 项费用超标准（需升级审批）`,
      detail: all.map((i) => `  ${i.message}`).join('\n'),
      severity: 'warning',
    })
  } else {
    items.push({
      id: makeId('standard', 0),
      category: 'standard',
      categoryLabel: CATEGORY_LABELS.standard,
      title: '费用标准',
      status: 'pass',
      message: `${rows.length} 项费用均在标准范围内`,
      severity: 'info',
    })
  }

  return items
}

// --- 4. 预算控制检查 ---

function checkBudgetControl(
  detail: ReimbursementDetail,
  policy: ReimbursementPolicy,
  department?: string,
  projectCode?: string,
): AuditCheckItem[] {
  const items: AuditCheckItem[] = []

  if (!policy.budgetControl?.enabled) {
    items.push({
      id: makeId('budget', 0),
      category: 'budget',
      categoryLabel: CATEGORY_LABELS.budget,
      title: '预算控制',
      status: 'skip',
      message: '预算控制未启用',
      severity: 'info',
    })
    return items
  }

  const results = checkBudget(
    policy,
    department || detail.department || '',
    projectCode || '',
    detail.amount,
  )

  const overBudget = results.filter((r) => r.overBudget)
  const dangerBudget = results.filter((r) => !r.overBudget && r.afterUtilization >= 0.9)

  if (overBudget.length > 0) {
    const action = policy.budgetControl.overBudgetAction
    items.push({
      id: makeId('budget', 0),
      category: 'budget',
      categoryLabel: CATEGORY_LABELS.budget,
      title: '预算控制',
      status: action === 'block' ? 'fail' : 'warn',
      message: `${overBudget.length} 项预算超支`,
      detail: overBudget
        .map((r) => `  ${r.name}：已用 ${fmtMoney(r.usedAmount)}/${fmtMoney(r.budgetAmount)}（${(r.utilization * 100).toFixed(0)}%）`)
        .join('\n'),
      severity: action === 'block' ? 'error' : 'warning',
    })
  } else if (dangerBudget.length > 0) {
    items.push({
      id: makeId('budget', 0),
      category: 'budget',
      categoryLabel: CATEGORY_LABELS.budget,
      title: '预算控制',
      status: 'warn',
      message: `${dangerBudget.length} 项预算使用率超过 90%`,
      detail: dangerBudget
        .map((r) => `  ${r.name}：审批后将达 ${(r.afterUtilization * 100).toFixed(0)}%`)
        .join('\n'),
      severity: 'warning',
    })
  } else {
    items.push({
      id: makeId('budget', 0),
      category: 'budget',
      categoryLabel: CATEGORY_LABELS.budget,
      title: '预算控制',
      status: 'pass',
      message: '所有预算项均在可控范围内',
      severity: 'info',
    })
  }

  return items
}

// --- 5. 审批路由检查 ---

function checkRouting(
  detail: ReimbursementDetail,
  policy: ReimbursementPolicy,
  priorItems: AuditCheckItem[],
): AuditCheckItem[] {
  const items: AuditCheckItem[] = []

  const hasOverStandard = priorItems.some(
    (i) => i.category === 'standard' && (i.status === 'warn' || i.status === 'fail'),
  )
  const hasOverBudget = priorItems.some(
    (i) => i.category === 'budget' && (i.status === 'warn' || i.status === 'fail'),
  )

  const routing = computeApprovalRouting(policy, detail.amount, hasOverStandard, hasOverBudget)

  if (routing.hasEscalation && routing.appendSignerKeys.length > 0) {
    const signerLabels: Record<string, string> = {
      gm: '总经理',
      vp: '副总裁',
      cfo: '财务总监',
    }
    const signers = routing.appendSignerKeys.map((k) => signerLabels[k] || k)
    items.push({
      id: makeId('routing', 0),
      category: 'routing',
      categoryLabel: CATEGORY_LABELS.routing,
      title: '审批路由',
      status: 'warn',
      message: `触发升级审批，需追加 ${signers.join('、')} 审批`,
      detail: routing.triggeredRules
        .map((r) => `  ${r.name}：${r.amountThreshold > 0 ? `金额≥${fmtMoney(r.amountThreshold)}` : '条件触发'}`)
        .join('\n'),
      severity: 'warning',
    })
  } else {
    items.push({
      id: makeId('routing', 0),
      category: 'routing',
      categoryLabel: CATEGORY_LABELS.routing,
      title: '审批路由',
      status: 'pass',
      message: '标准审批流程，无需升级',
      severity: 'info',
    })
  }

  return items
}

// --- 6. 信息完整性检查 ---

function checkCompleteness(detail: ReimbursementDetail): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const issues: string[] = []

  if (!detail.title || detail.title.trim().length < 2) {
    issues.push('报销标题未填写或过短')
  }
  if (!detail.description || detail.description.trim().length === 0) {
    issues.push('事由说明未填写')
  }
  if (!detail.items || detail.items.length === 0) {
    issues.push('无费用明细')
  }
  if (detail.invoiceCount === 0) {
    issues.push('未关联发票')
  }
  if (!detail.startDate || !detail.endDate) {
    issues.push('费用期间未填写')
  }

  if (issues.length > 0) {
    const hasCritical = issues.some((i) => i.includes('无费用') || i.includes('未关联'))
    items.push({
      id: makeId('completeness', 0),
      category: 'completeness',
      categoryLabel: CATEGORY_LABELS.completeness,
      title: '信息完整性',
      status: hasCritical ? 'fail' : 'warn',
      message: `${issues.length} 项信息不完整`,
      detail: issues.map((i) => `  ${i}`).join('\n'),
      severity: hasCritical ? 'error' : 'warning',
    })
  } else {
    items.push({
      id: makeId('completeness', 0),
      category: 'completeness',
      categoryLabel: CATEGORY_LABELS.completeness,
      title: '信息完整性',
      status: 'pass',
      message: '所有必填信息完整',
      severity: 'info',
    })
  }

  return items
}

// --- 7. 时效性检查 ---

function checkTimeliness(detail: ReimbursementDetail): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const now = new Date('2026-08-10T12:00:00Z').getTime() // 锚点日期

  const dates = detail.items
    .map((i) => new Date(i.date).getTime())
    .filter((t) => !isNaN(t))

  if (dates.length === 0) {
    items.push({
      id: makeId('timeliness', 0),
      category: 'timeliness',
      categoryLabel: CATEGORY_LABELS.timeliness,
      title: '报销时效',
      status: 'skip',
      message: '无费用日期，跳过时效检查',
      severity: 'info',
    })
    return items
  }

  const earliest = Math.min(...dates)
  const daysDiff = Math.floor((now - earliest) / 86400000)

  // 超过 90 天为超期，超过 30 天为提醒
  if (daysDiff > 90) {
    items.push({
      id: makeId('timeliness', 0),
      category: 'timeliness',
      categoryLabel: CATEGORY_LABELS.timeliness,
      title: '报销时效',
      status: 'fail',
      message: `最早费用已超过 ${daysDiff} 天，超出报销时效（90天）`,
      detail: `  最早费用日期：${new Date(earliest).toLocaleDateString('zh-CN')}`,
      severity: 'error',
    })
  } else if (daysDiff > 30) {
    items.push({
      id: makeId('timeliness', 0),
      category: 'timeliness',
      categoryLabel: CATEGORY_LABELS.timeliness,
      title: '报销时效',
      status: 'warn',
      message: `最早费用已 ${daysDiff} 天，建议尽快报销`,
      detail: `  最早费用日期：${new Date(earliest).toLocaleDateString('zh-CN')}`,
      severity: 'warning',
    })
  } else {
    items.push({
      id: makeId('timeliness', 0),
      category: 'timeliness',
      categoryLabel: CATEGORY_LABELS.timeliness,
      title: '报销时效',
      status: 'pass',
      message: `所有费用在报销时效内（最早 ${daysDiff} 天前）`,
      severity: 'info',
    })
  }

  return items
}

// --- 8. 逻辑一致性检查 ---

function checkConsistency(detail: ReimbursementDetail): AuditCheckItem[] {
  const items: AuditCheckItem[] = []
  const issues: string[] = []

  // 检查明细合计是否等于总金额
  const itemsSum = detail.items.reduce((sum, i) => sum + i.amount, 0)
  const diff = Math.abs(itemsSum - detail.amount)
  if (detail.items.length > 0 && diff > 0.01) {
    issues.push(`明细合计 ${fmtMoney(itemsSum)} 与报销总额 ${fmtMoney(detail.amount)} 不一致（差额 ${fmtMoney(diff)}）`)
  }

  // 检查费用类型与明细类别是否匹配
  if (detail.type === 'travel') {
    const hasTravelItem = detail.items.some(
      (i) => i.category === 'transport' || i.category === 'travel',
    )
    if (!hasTravelItem && detail.items.length > 0) {
      issues.push('差旅报销单未包含交通/差旅费用')
    }
  }

  // 检查是否有金额为 0 的明细
  const zeroItems = detail.items.filter((i) => i.amount <= 0)
  if (zeroItems.length > 0) {
    issues.push(`${zeroItems.length} 项明细金额为 0 或负数`)
  }

  if (issues.length > 0) {
    items.push({
      id: makeId('consistency', 0),
      category: 'consistency',
      categoryLabel: CATEGORY_LABELS.consistency,
      title: '逻辑一致性',
      status: 'warn',
      message: `${issues.length} 项逻辑异常`,
      detail: issues.map((i) => `  ${i}`).join('\n'),
      severity: 'warning',
    })
  } else {
    items.push({
      id: makeId('consistency', 0),
      category: 'consistency',
      categoryLabel: CATEGORY_LABELS.consistency,
      title: '逻辑一致性',
      status: 'pass',
      message: '金额和类型校验通过',
      severity: 'info',
    })
  }

  return items
}
