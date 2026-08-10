'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Plus,
  Minus,
  Save,
  Send,
  Printer,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Info,
  Table2,
  CalendarDays,
  MapPin,
  User,
  Building2,
  FileSignature,
  Hash,
  Receipt,
  BadgeCheck,
  ClipboardCheck,
  FileCheck2,
  Shield,
  Gauge,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
// 兼容：lucide-react 可能没有 FileCode2，使用 fallback
import { FileCode2 as _FileCode2 } from 'lucide-react'
const FileCode2: any = _FileCode2 || ClipboardCheck
import {
  useSettingsStore,
  generateNextSerialNo,
  DEFAULT_REIMBURSEMENT_POLICY,
  type ReimbursementPolicy,
  type ExpenseCategoryKey,
  type TripSubsidyRule,
  type ApprovalSignerLevel,
  type ExpenseCategoryDef,
  EMPLOYEE_LEVELS,
  type EmployeeLevel,
} from '@/lib/settings'
import { useAuthStore } from '@/lib/auth'
import AllocationPanel, { type AllocationConfig, validateAllocation } from '@/components/AllocationPanel'
import {
  checkReportStandards,
  hasBlockIssue,
  hasEscalationIssue,
  type OverStandardIssue,
  checkBudget,
  hasOverBudget,
  hasBlockBudget,
  hasEscalationBudget,
  utilizationLevel,
  type BudgetCheckResult,
  computeApprovalRouting,
  inferLevelFromRole,
} from '@/lib/expense-standard'
import { useConciergeStore } from '@/lib/concierge'

/* ======================================================================
   类型定义
   ====================================================================== */
interface ExpenseRow {
  id: string
  date: string           // yyyy-MM-dd
  note: string           // 备注/说明：如"上海→北京 高铁"、"虹桥机场打车"、"XX酒店 2晚"等
  /** 每个启用分类的金额；key = ExpenseCategoryKey，value = 数字 */
  amounts: Partial<Record<ExpenseCategoryKey, number>>
  invoiceCount: number   // 该行附单据张数
}

interface SubsidyState {
  subsidyKey: string          // 选中的出差类型 key
  fullDays: number            // 全天补贴天数
  halfDays: number            // 半天补贴天数（仅启用时允许）
}

interface SignatureState {
  /** 每个签字节点是否已"签字"（线上用勾选+姓名+日期模拟，或手写签名区） */
  signedMap: Record<string, { signed: boolean; signerName: string; date: string }>
}

/* ======================================================================
   工具函数
   ====================================================================== */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

const todayISO = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const n = (v: any): number => {
  if (v == null || v === '') return 0
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/** 金额转中文大写（人民币），简化版覆盖 0~千亿 */
function toChineseAmount(num: number): string {
  if (!Number.isFinite(num)) return ''
  if (Math.abs(num) < 1e-9) return '零元整'
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const intUnits = ['', '拾', '佰', '仟']
  const bigUnits = ['', '万', '亿', '兆']
  const decUnits = ['角', '分']
  const negative = num < 0
  const abs = Math.abs(num)
  const fixed = abs.toFixed(2)
  const [intPartStr, decPartStr] = fixed.split('.')
  // 整数
  let intOut = ''
  if (intPartStr === '0') {
    intOut = '零'
  } else {
    // 每 4 位一组，从右往左
    const groups: string[] = []
    let s = intPartStr
    while (s.length > 0) {
      groups.unshift(s.slice(-4))
      s = s.slice(0, -4)
    }
    let prevZero = false
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      const bigUnit = bigUnits[groups.length - 1 - gi]
      let groupOut = ''
      let gPrevZero = false
      for (let di = 0; di < group.length; di++) {
        const d = +group[di]
        const unit = intUnits[group.length - 1 - di]
        if (d === 0) {
          gPrevZero = true
        } else {
          if (gPrevZero) groupOut += '零'
          groupOut += digits[d] + unit
          gPrevZero = false
        }
      }
      if (groupOut !== '') {
        if (prevZero && !groupOut.startsWith('零')) intOut += '零'
        intOut += groupOut + bigUnit
        prevZero = false
      } else {
        prevZero = true
      }
    }
  }
  // 小数
  let decOut = ''
  const jiao = +decPartStr[0]
  const fen = +decPartStr[1]
  if (jiao === 0 && fen === 0) {
    decOut = '整'
  } else {
    if (jiao > 0) decOut += digits[jiao] + '角'
    else if (intOut !== '零') decOut += '零'
    if (fen > 0) decOut += digits[fen] + '分'
  }
  return (negative ? '（负）' : '') + intOut + '元' + decOut
}

const fmtMoney = (v: number, precision = 2) =>
  n(v).toLocaleString('zh-CN', { minimumFractionDigits: precision, maximumFractionDigits: precision })

const dateDiffDays = (startISO: string, endISO: string): number => {
  if (!startISO || !endISO) return 0
  const s = new Date(startISO + 'T00:00:00').getTime()
  const e = new Date(endISO + 'T00:00:00').getTime()
  if (Number.isNaN(s) || Number.isNaN(e)) return 0
  const days = Math.round((e - s) / 86400000)
  return Math.max(0, days)
}

/* ======================================================================
   页面组件
   ====================================================================== */
export default function SpreadsheetReimbursementPage() {
  const policy = useSettingsStore((s) => s.policy)
  const company = useSettingsStore((s) => s.company)
  const user = useAuthStore((s) => s.user)
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => setIsHydrated(true), [])

  // 启用的分类列
  const enabledCategories = useMemo(
    () => (policy?.categories?.filter((c) => c.enabled) || DEFAULT_REIMBURSEMENT_POLICY.categories.filter((c) => c.enabled)) as ExpenseCategoryDef[],
    [policy]
  )
  const enabledSubsidies = useMemo(
    () => (policy?.subsidies?.filter((s) => s.enabled) || DEFAULT_REIMBURSEMENT_POLICY.subsidies.filter((s) => s.enabled)),
    [policy]
  )
  const enabledSigners = useMemo(
    () => (policy?.signerLevels?.filter((x) => x.enabled) || DEFAULT_REIMBURSEMENT_POLICY.signerLevels.filter((x) => x.enabled)),
    [policy]
  )

  // 单据编号（懒初始化，仅首次生成一次避免每次刷新递增）
  const [serialNo, setSerialNo] = useState<string>(() => '')
  const policyRef = useRef(policy)
  policyRef.current = policy
  useEffect(() => {
    if (!isHydrated) return
    // 若还未生成单号，生成一次
    setSerialNo((cur) => {
      if (cur) return cur
      try {
        return generateNextSerialNo(policyRef.current, new Date())
      } catch {
        return `BX-${new Date().toISOString().slice(0, 7).replace('-', '')}-0001`
      }
    })
  }, [isHydrated])

  // ===== 单据头 =====
  const [reportName, setReportName] = useState('')              // 报销名称（事由标题）
  const [startDate, setStartDate] = useState('')               // 出差开始日
  const [endDate, setEndDate] = useState('')                   // 出差结束日
  const [originAddr, setOriginAddr] = useState('')             // 出发地
  const [destAddr, setDestAddr] = useState('')                 // 目的地
  const [employeeId, setEmployeeId] = useState('')             // 工号
  const [department, setDepartment] = useState('')             // 部门
  const [projectCode, setProjectCode] = useState('')           // 项目号/成本中心
  const [purpose, setPurpose] = useState('')                   // 事由/目的
  // 职级（用于费用标准检查与审批路由）
  const [employeeLevel, setEmployeeLevel] = useState<EmployeeLevel>('staff')

  // 预置：登录用户名 → 报销人；今日日期作为默认
  useEffect(() => {
    if (!isHydrated) return
    setReportName((v) => v || (destAddr ? `${destAddr}出差费用报销` : ''))
  }, [isHydrated, destAddr])

  // 预置：根据登录用户角色推断默认职级
  useEffect(() => {
    if (!isHydrated) return
    setEmployeeLevel((cur) => (cur !== 'staff' ? cur : inferLevelFromRole(user?.role)))
  }, [isHydrated, user?.role])

  // ===== 明细表 =====
  const buildEmptyRow = (d?: string): ExpenseRow => ({
    id: uid(),
    date: d || startDate || todayISO(),
    note: '',
    amounts: {},
    invoiceCount: 1,
  })

  const [rows, setRows] = useState<ExpenseRow[]>(() => [
    // 默认 3 行空白，便于直接填写
  ])
  useEffect(() => {
    if (!isHydrated) return
    setRows((cur) => (cur.length === 0 ? [buildEmptyRow(), buildEmptyRow(), buildEmptyRow()] : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated])

  const updateRow = (id: string, patch: Partial<ExpenseRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch, amounts: patch.amounts ? { ...r.amounts, ...patch.amounts } : r.amounts } : r)))
  const removeRow = (id: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.id !== id) : rs))
  const addRowAfter = (id?: string) => {
    const nr = buildEmptyRow()
    setRows((rs) => {
      if (!id) return [...rs, nr]
      const idx = rs.findIndex((r) => r.id === id)
      if (idx < 0) return [...rs, nr]
      return [...rs.slice(0, idx + 1), nr, ...rs.slice(idx + 1)]
    })
  }

  // ===== 补贴区 =====
  const defaultSubsidyKey = (enabledSubsidies.find((x) => x.key === policy?.defaultSubsidyKey) || enabledSubsidies[0])?.key || 'domestic'
  const [subsidy, setSubsidy] = useState<SubsidyState>({ subsidyKey: defaultSubsidyKey, fullDays: 0, halfDays: 0 })
  useEffect(() => {
    if (!isHydrated) return
    // 默认根据起止日期计算：西门子规则"起程+返程各计一天 → end - start + 1"
    const calc = Math.max(0, dateDiffDays(startDate, endDate) + (startDate && endDate ? 1 : 0))
    setSubsidy((s) => ({ ...s, fullDays: s.fullDays || calc }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, isHydrated])

  const activeSubsidy: TripSubsidyRule | undefined = enabledSubsidies.find((x) => x.key === subsidy.subsidyKey) || enabledSubsidies[0]
  const subsidyPerDay = activeSubsidy?.perDay ?? 80
  const cappedDays = (maxDays?: number) => (maxDays && maxDays > 0 ? Math.min(subsidy.fullDays, maxDays) : subsidy.fullDays)
  const cappedHalfDays = (maxDays?: number) => {
    if (!maxDays || maxDays <= 0) return subsidy.halfDays
    // 全天已占用后剩余额度：
    const remain = Math.max(0, maxDays - cappedDays(maxDays))
    return Math.min(subsidy.halfDays, remain)
  }
  const subsidyTotal = useMemo(() => {
    const fullCount = cappedDays(activeSubsidy?.maxDays)
    const halfCount = policy?.halfDaySubsidyEnabled ? cappedHalfDays(activeSubsidy?.maxDays) : 0
    return fullCount * subsidyPerDay + halfCount * subsidyPerDay * 0.5
  }, [activeSubsidy, subsidy, policy, subsidyPerDay])

  // ===== 分类汇总 / 总合计 =====
  const catSubtotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of rows) {
      for (const cat of enabledCategories) {
        map[cat.key] = (map[cat.key] || 0) + n(r.amounts[cat.key as ExpenseCategoryKey])
      }
    }
    return map
  }, [rows, enabledCategories])

  const rowsTotal = useMemo(() => Object.values(catSubtotals).reduce((a, b) => a + b, 0), [catSubtotals])
  const invoiceTotal = useMemo(() => rows.reduce((s, r) => s + n(r.invoiceCount), 0), [rows])
  const grandTotal = rowsTotal + (policy?.subsidyInSeparateRow ? subsidyTotal : 0)

  // ===== 费用分摊配置 =====
  const [allocationConfig, setAllocationConfig] = useState<AllocationConfig>({
    enabled: false,
    basis: 'department',
    items: [],
  })
  const allocationValidation = useMemo(
    () => (allocationConfig.enabled ? validateAllocation(allocationConfig.items) : { isValid: true, total: 0, message: '' }),
    [allocationConfig]
  )

  // ===== 汇联易风格：费用标准检查 / 预算控制 / 智能审批路由 =====
  const currentTripType = subsidy.subsidyKey || 'domestic'
  const overStandardIssues: OverStandardIssue[] = useMemo(() => {
    if (!isHydrated || !policy?.expenseStandards?.length) return []
    return checkReportStandards(policy, employeeLevel, currentTripType, rows)
  }, [isHydrated, policy, employeeLevel, currentTripType, rows])

  const budgetCheckResults: BudgetCheckResult[] = useMemo(() => {
    if (!isHydrated || !policy?.budgetControl?.enabled) return []
    return checkBudget(policy, department, projectCode, grandTotal)
  }, [isHydrated, policy, department, projectCode, grandTotal])

  const approvalRouting = useMemo(() => {
    if (!isHydrated) return { triggeredRules: [], appendSignerKeys: [], hasEscalation: false }
    return computeApprovalRouting(
      policy,
      grandTotal,
      hasEscalationIssue(overStandardIssues),
      hasOverBudget(budgetCheckResults) || hasEscalationBudget(budgetCheckResults),
    )
  }, [isHydrated, policy, grandTotal, overStandardIssues, budgetCheckResults])

  // ===== Concierge AI 助手：更新报销单填写状态 =====
  const setConciergeFormState = useConciergeStore((s) => s.setFormState)
  const clearConciergeFormState = useConciergeStore((s) => s.clearFormState)
  useEffect(() => {
    if (!isHydrated) return
    // 检查不完整字段
    const incompleteFields: string[] = []
    if (!reportName.trim()) incompleteFields.push('报销单标题')
    if (!startDate || !endDate) incompleteFields.push('出差日期')
    if (!originAddr || !destAddr) incompleteFields.push('出发地/目的地')
    if (rows.length === 0) incompleteFields.push('费用明细')
    rows.forEach((row, idx) => {
      if (!row.date) incompleteFields.push(`第${idx + 1}行日期`)
      if (!row.note.trim()) incompleteFields.push(`第${idx + 1}行说明`)
    })

    setConciergeFormState({
      title: reportName,
      rowsCount: rows.length,
      totalAmount: grandTotal,
      hasInvoice: rows.some((r) => r.invoiceCount > 0),
      hasAllocation: allocationConfig.enabled,
      overStandard: overStandardIssues.length > 0,
      overBudget: hasOverBudget(budgetCheckResults),
      incompleteFields: incompleteFields.slice(0, 5),
    })
    // 组件卸载时清除
    return () => clearConciergeFormState()
  }, [isHydrated, reportName, rows, grandTotal, allocationConfig.enabled, overStandardIssues, budgetCheckResults, setConciergeFormState, clearConciergeFormState])

  // ===== 签字区 =====
  const [signatures, setSignatures] = useState<SignatureState>({ signedMap: {} })
  useEffect(() => {
    if (!isHydrated) return
    // 初始化签字节点
    setSignatures((prev) => {
      const next: SignatureState = { signedMap: { ...prev.signedMap } }
      for (const s of enabledSigners) {
        if (!next.signedMap[s.key]) {
          next.signedMap[s.key] = { signed: false, signerName: '', date: '' }
        }
      }
      // 清理被禁用的节点
      const keys = new Set(enabledSigners.map((x) => x.key))
      for (const k of Object.keys(next.signedMap)) if (!keys.has(k)) delete next.signedMap[k]
      return next
    })
  }, [enabledSigners, isHydrated])

  const updateSignature = (k: string, patch: Partial<{ signed: boolean; signerName: string; date: string }>) =>
    setSignatures((prev) => ({ signedMap: { ...prev.signedMap, [k]: { ...prev.signedMap[k], ...patch } } }))
  // 点击「我已确认并签字」（申请人签字快捷按钮）时自动填写当前用户 + 今日
  const applicantKey = enabledSigners[0]?.key
  const quickSignApplicant = () => {
    if (!applicantKey) return
    updateSignature(applicantKey, { signed: true, signerName: user?.name || '', date: todayISO() })
  }

  // ===== 校验 =====
  const issues = useMemo(() => {
    const arr: Array<{ kind: 'err' | 'warn'; msg: string }> = []
    if (!reportName.trim()) arr.push({ kind: 'warn', msg: '请填写「报销名称/单据名称」' })
    if (policy?.requireDepartment && !department.trim()) arr.push({ kind: 'warn', msg: '公司规则要求填写「所属部门」' })
    if (policy?.requireEmployeeId && !employeeId.trim()) arr.push({ kind: 'warn', msg: '公司规则要求填写「工号」' })
    if (policy?.requireProjectCode && !projectCode.trim()) arr.push({ kind: 'warn', msg: '公司规则要求填写「项目号/成本中心」' })
    const rowsAnyAmount = rows.some((r) => enabledCategories.some((c) => n(r.amounts[c.key as ExpenseCategoryKey]) > 0))
    if (!rowsAnyAmount && !(policy?.subsidyInSeparateRow && subsidyTotal > 0)) {
      arr.push({ kind: 'err', msg: '请至少填写一行费用金额或出差补贴' })
    }
    if (!applicantKey || !signatures.signedMap[applicantKey]?.signed) {
      arr.push({ kind: 'warn', msg: '递交前请先在「申请人签字」处签字确认' })
    }
    // 费用分摊校验
    if (allocationConfig.enabled && !allocationValidation.isValid) {
      arr.push({ kind: 'err', msg: `费用分摊${allocationValidation.message}` })
    }
    // 费用标准阻断级超标校验
    if (hasBlockIssue(overStandardIssues)) {
      const blockers = overStandardIssues.filter((i) => i.action === 'block')
      arr.push({ kind: 'err', msg: `存在阻断级超标：${blockers.map((b) => b.message).join('；')}` })
    }
    // 预算阻断级超预算校验
    if (hasBlockBudget(budgetCheckResults)) {
      const blockers = budgetCheckResults.filter((r) => r.overBudget && r.action === 'block')
      arr.push({ kind: 'err', msg: `${blockers.map((b) => `${b.name}预算超支`).join('；')}，请联系管理员调整预算` })
    }
    return arr
  }, [reportName, department, employeeId, projectCode, policy, rows, enabledCategories, subsidyTotal, applicantKey, signatures, allocationConfig, allocationValidation, overStandardIssues, budgetCheckResults])

  // ===== 操作：暂存 / 提交审批 =====
  const [toast, setToast] = useState<{ kind: 'ok' | 'err' | 'info'; msg: string } | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const showToast = (t: { kind: 'ok' | 'err' | 'info'; msg: string }) => {
    setToast(t)
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200)
  }

  const serializeDraft = () => ({
    serialNo,
    reportName,
    startDate, endDate, originAddr, destAddr,
    employeeId, department, projectCode, purpose,
    employeeLevel,
    rows,
    subsidy,
    signatures,
    allocationConfig,
    policySnapshot: policy,
    grandTotal,
    savedAt: new Date().toISOString(),
  })

  const doSave = useCallback(() => {
    try {
      const key = `reimbursement-spreadsheet-draft-${serialNo || 'new'}`
      localStorage.setItem(key, JSON.stringify(serializeDraft()))
      showToast({ kind: 'ok', msg: `已保存草稿：${serialNo || '未编号'} ✓` })
    } catch {
      showToast({ kind: 'err', msg: '保存失败，请检查浏览器存储。' })
    }
  }, [serialNo, reportName, startDate, endDate, originAddr, destAddr, employeeId, department, projectCode, purpose, rows, subsidy, signatures, policy, grandTotal])

  const doSubmit = useCallback(() => {
    // 提交前的校验
    const errs = issues.filter((i) => i.kind === 'err')
    if (errs.length) {
      showToast({ kind: 'err', msg: `无法递交：${errs[0].msg}` })
      return
    }
    if (!applicantKey || !signatures.signedMap[applicantKey]?.signed) {
      showToast({ kind: 'err', msg: '请先「签字确认」作为报销人，再递交审批。' })
      return
    }
    try {
      const key = `reimbursement-spreadsheet-submitted-${serialNo || uid()}`
      localStorage.setItem(key, JSON.stringify({ ...serializeDraft(), status: 'pending_approval', submittedAt: new Date().toISOString() }))
      showToast({ kind: 'ok', msg: `已递交审批 ✓ 单据：${serialNo || '未编号'} （合计 ${policy?.currency || '¥'}${fmtMoney(grandTotal)}）` })
    } catch {
      showToast({ kind: 'err', msg: '递交失败，请稍后重试。' })
    }
  }, [issues, applicantKey, signatures, serialNo, policy, grandTotal])

  const doReset = () => {
    if (!window.confirm('确定清空当前单据并重置为新一张？（当前未保存内容会丢失）')) return
    setRows([buildEmptyRow(), buildEmptyRow(), buildEmptyRow()])
    setReportName('')
    setStartDate(''); setEndDate('')
    setOriginAddr(''); setDestAddr('')
    setEmployeeId(''); setDepartment(''); setProjectCode(''); setPurpose('')
    setSubsidy({ subsidyKey: defaultSubsidyKey, fullDays: 0, halfDays: 0 })
    setSignatures({ signedMap: {} })
    try {
      setSerialNo(generateNextSerialNo(policy, new Date()))
    } catch { /* ignore */ }
    showToast({ kind: 'info', msg: '已重置为新单据。' })
  }

  const doPrint = () => {
    try { window.print() } catch { showToast({ kind: 'info', msg: '请使用浏览器菜单打印 / 另存为 PDF。' }) }
  }

  // ===== 样式常量（打印友好 A4）=====
  const TH_CL = 'px-2 py-2 text-left text-[12px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 align-top whitespace-nowrap'
  const TD_CL = 'px-2 py-1 border border-slate-200 dark:border-slate-700 align-top'
  const CELL_INPUT = 'w-full px-1.5 py-1.5 text-sm bg-transparent outline-none focus:bg-brand-50/60 dark:focus:bg-brand-950/30 rounded text-slate-800 dark:text-slate-100 tabular-nums'
  const CELL_INPUT_NUM = `${CELL_INPUT} text-right font-medium`

  void isHydrated

  return (
    <div className="space-y-6 pb-24">
      {/* 页头操作条 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <Link href="/dashboard/reimbursements" className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> 我的报销
            </Link>
            <span>/</span>
            <span>电子表格报销单（西门子风格）</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Table2 className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            {policy?.formTitle || '出差费用报销单'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
            {policy?.formSubtitle || '按日期逐行填写交通费、打车费、住宿、餐饮及其他费用；补贴按制度自动计算；确认签字后递交审批。'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={doPrint}
            className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors">
            <Printer className="w-4 h-4" /> 打印 / 存PDF
          </button>
          <button onClick={doReset}
            className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors">
            <RotateCcw className="w-4 h-4" /> 重置
          </button>
          <button onClick={doSave}
            className="px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-200 bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-900 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-950/70 inline-flex items-center gap-1.5 transition-colors">
            <Save className="w-4 h-4" /> 保存草稿
          </button>
          <button
            onClick={doSubmit}
            disabled={!!issues.find((i) => i.kind === 'err')}
            className={`px-4 py-2 text-sm font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-sm ${
              issues.find((i) => i.kind === 'err')
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-br from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white'
            }`}
          >
            <Send className="w-4 h-4" /> 签字后递交审批
          </button>
        </div>
      </div>

      {/* 问题条 */}
      {issues.length > 0 && (
        <div className={`rounded-xl border p-4 space-y-1.5 ${
          issues.some(i => i.kind === 'err')
            ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
        }`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
            {issues.some(i => i.kind === 'err') ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />}
            {issues.some(i => i.kind === 'err') ? '递交前必须修正：' : '提示（仍可保存草稿）：'}
          </div>
          <ul className="list-disc list-inside space-y-0.5 pl-1 text-xs text-rose-700/90 dark:text-rose-200/90">
            {issues.map((i, idx) => (
              <li key={idx} className={i.kind === 'warn' ? 'text-amber-700 dark:text-amber-300' : ''}>{i.msg}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ============ 单据本体（A4 打印样式） ============ */}
      <div className="bg-white dark:bg-slate-900 shadow-xl rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden print:shadow-none print:rounded-none print:border-slate-400/60">
        {/* A4 内边距 */}
        <div className="p-8 sm:p-12 max-w-[980px] mx-auto print:max-w-none print:p-10">
          {/* 单据抬头 + 公司信息 + 编号 */}
          <div className="border-b-2 border-slate-800 dark:border-slate-100 pb-5 mb-6 flex items-start justify-between gap-6 flex-wrap print:border-slate-900">
            <div className="min-w-0">
              {(company?.shortName || company?.fullName) && (
                <div className="text-xs tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400 mb-1">
                  {(company?.shortName || company?.fullName) + ' · ' + (policy?.formTitle || '出差费用报销单')}
                </div>
              )}
              <h2 className="text-3xl sm:text-[32px] font-black tracking-tight text-slate-900 dark:text-white">
                {policy?.formTitle || '出差费用报销单'}
              </h2>
              {policy?.formSubtitle && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">{policy.formSubtitle}</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">Document No.</div>
              <div className="mt-0.5 font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                {serialNo || '—— —— ——'}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                填写日期：<span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{todayISO()}</span>
              </div>
            </div>
          </div>

          {/* 单据头：报销人 / 部门 / 工号 / 项目号 / 起止日期 / 出差地 / 事由 */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-5 gap-y-3 text-sm mb-6 [&_label]:block [&_label>span]:block [&_label>span]:text-[11px] [&_label>span]:uppercase [&_label>span]:tracking-[0.15em] [&_label>span]:text-slate-500 [&_label>span]:dark:text-slate-400 [&_label>span]:mb-1 [&_input]:w-full [&_input]:px-2.5 [&_input]:py-1.5 [&_input]:rounded-md [&_input]:bg-slate-50 [&_input]:dark:bg-slate-800/60 [&_input]:border [&_input]:border-slate-200 [&_input]:dark:border-slate-700 [&_input]:outline-none [&_input]:focus:ring-2 [&_input]:focus:ring-brand-500/30 [&_input]:text-slate-800 [&_input]:dark:text-slate-100 [&_input]:text-sm">
            <label className="sm:col-span-3">
              <span><User className="inline w-3 h-3 -mt-0.5 mr-1" />报销人姓名</span>
              <input value={user?.name || ''} readOnly className="!bg-slate-100/70 dark:!bg-slate-800/40 !cursor-not-allowed" />
            </label>
            {(policy?.requireEmployeeId || employeeId) && (
              <label className="sm:col-span-3">
                <span><Hash className="inline w-3 h-3 -mt-0.5 mr-1" />{policy?.requireEmployeeId ? '工号 *' : '工号'}</span>
                <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="E12345" />
              </label>
            )}
            <label className="sm:col-span-3">
              <span><Building2 className="inline w-3 h-3 -mt-0.5 mr-1" />{policy?.requireDepartment ? '所属部门 *' : '所属部门'}</span>
              <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="如：研发中心 / 市场部" />
            </label>
            {(policy?.requireProjectCode || projectCode) && (
              <label className="sm:col-span-3">
                <span><FileCode2 className="inline w-3 h-3 -mt-0.5 mr-1" />{policy?.requireProjectCode ? '项目号/成本中心 *' : '项目号/成本中心'}</span>
                <input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="如：PRJ-2026-0801" />
              </label>
            )}
            <label className="sm:col-span-3">
              <span><Shield className="inline w-3 h-3 -mt-0.5 mr-1" />职级（用于费用标准校验）</span>
              <select
                value={employeeLevel}
                onChange={(e) => setEmployeeLevel(e.target.value as EmployeeLevel)}
                className="w-full px-2.5 py-1.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100 text-sm"
              >
                {EMPLOYEE_LEVELS.map((lv) => (
                  <option key={lv.value} value={lv.value}>{lv.label}</option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-6 sm:col-start-1">
              <span><Receipt className="inline w-3 h-3 -mt-0.5 mr-1" />报销名称（单据名称） *</span>
              <input value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="例：2026年8月北京客户拜访出差报销" />
            </label>
            <label className="sm:col-span-6">
              <span><MapPin className="inline w-3 h-3 -mt-0.5 mr-1" />出差目的地</span>
              <input value={destAddr} onChange={(e) => setDestAddr(e.target.value)} placeholder="例：北京市朝阳区" />
            </label>

            <label className="sm:col-span-3">
              <span><CalendarDays className="inline w-3 h-3 -mt-0.5 mr-1" />开始日期</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="sm:col-span-3">
              <span><CalendarDays className="inline w-3 h-3 -mt-0.5 mr-1" />结束日期</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
            <label className="sm:col-span-3">
              <span><MapPin className="inline w-3 h-3 -mt-0.5 mr-1" />出发地</span>
              <input value={originAddr} onChange={(e) => setOriginAddr(e.target.value)} placeholder="如：上海市" />
            </label>
            <label className="sm:col-span-3">
              <span><BadgeCheck className="inline w-3 h-3 -mt-0.5 mr-1" />出差天数（自动：结束-开始+1）</span>
              <input value={startDate && endDate ? (dateDiffDays(startDate, endDate) + 1) + ' 天' : ''} readOnly
                className="!bg-slate-100/70 dark:!bg-slate-800/40 !cursor-not-allowed !font-medium !text-slate-700 dark:!text-slate-200 tabular-nums" />
            </label>

            <label className="sm:col-span-12">
              <span><ClipboardCheck className="inline w-3 h-3 -mt-0.5 mr-1" />出差事由 / 报销说明</span>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)}
                placeholder="例：拜访客户 A、B，参加行业会议 X；预计会谈内容：合同签订 / 技术对接…" />
            </label>
          </div>

          {/* ========== 电子表格明细表 ========== */}
          <div className="mb-6">
            <div className="flex items-end justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-[0.15em] flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-brand-600" />
                A · 费用明细表（按日期填写）
              </h3>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                提示：金额无需输入千分位，系统自动汇总。空行在打印时自动跳过。
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-300 dark:border-slate-700 shadow-inner">
              <table className="w-full border-collapse text-sm" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className={`${TH_CL} w-24`} style={{ textAlign: 'center' }}>日期</th>
                    <th className={TH_CL}>费用说明 / 起止地点</th>
                    {enabledCategories.map((c) => (
                      <th key={c.key} className={`${TH_CL}`} style={{ textAlign: 'right' }} title={c.hint}>
                        <div className="font-bold">{c.label}</div>
                        {c.hint && <div className="text-[10px] font-normal text-slate-500 dark:text-slate-400 mt-0.5 normal-case tracking-normal">（{c.hint}）</div>}
                      </th>
                    ))}
                    <th className={`${TH_CL} w-16`} style={{ textAlign: 'right' }}>
                      行小计
                    </th>
                    <th className={`${TH_CL} w-14`} style={{ textAlign: 'center' }}>单据张数</th>
                    <th className={`${TH_CL} w-12`} style={{ textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const rowSum = enabledCategories.reduce((s, c) => s + n(r.amounts[c.key as ExpenseCategoryKey]), 0)
                    return (
                      <tr key={r.id} className={rowSum > 0 ? '' : 'text-slate-400'}>
                        <td className={TD_CL}>
                          <input type="date" value={r.date} onChange={(e) => updateRow(r.id, { date: e.target.value })}
                            className={`${CELL_INPUT} !text-center !text-xs tabular-nums`} />
                        </td>
                        <td className={TD_CL}>
                          <input value={r.note} onChange={(e) => updateRow(r.id, { note: e.target.value })}
                            className={CELL_INPUT} placeholder={idx === 0 ? '例：上海→北京 G104 高铁二等座' : '费用说明…'} />
                        </td>
                        {enabledCategories.map((c) => {
                          const v = r.amounts[c.key as ExpenseCategoryKey]
                          return (
                            <td key={c.key} className={TD_CL}>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                value={v == null || v === 0 ? '' : v}
                                placeholder="0.00"
                                onChange={(e) => updateRow(r.id, { amounts: { [c.key]: n(e.target.value) } as any })}
                                className={CELL_INPUT_NUM}
                              />
                            </td>
                          )
                        })}
                        <td className={`${TD_CL} bg-slate-50/60 dark:bg-slate-800/40 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100`}>
                          {rowSum > 0 ? `${policy?.currency || '¥'}${fmtMoney(rowSum)}` : <span className="opacity-40">0.00</span>}
                        </td>
                        <td className={TD_CL}>
                          <input type="number" min={0} step={1}
                            value={r.invoiceCount || ''}
                            onChange={(e) => updateRow(r.id, { invoiceCount: Math.max(0, n(e.target.value)) })}
                            className={`${CELL_INPUT} !text-center !tabular-nums !font-medium`} placeholder="1" />
                        </td>
                        <td className={`${TD_CL} !p-0 align-middle`} style={{ textAlign: 'center' }}>
                          <div className="flex items-center justify-center gap-0.5 py-1">
                            <button title="在下方插入一行" onClick={() => addRowAfter(r.id)}
                              className="p-1 rounded hover:bg-brand-50 text-slate-500 hover:text-brand-600 dark:hover:bg-brand-950/40">
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button title="删除该行" onClick={() => removeRow(r.id)}
                              className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 dark:hover:bg-red-950/40">
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* 列小计行 */}
                  <tr className="bg-slate-100 dark:bg-slate-800/80 font-semibold text-slate-800 dark:text-slate-100">
                    <td className={`${TD_CL} text-center text-xs uppercase tracking-wider`} colSpan={2}>
                      B · 列分类合计
                    </td>
                    {enabledCategories.map((c) => {
                      const sv = catSubtotals[c.key] || 0
                      return (
                        <td key={c.key} className={`${TD_CL} text-right tabular-nums ${sv > 0 ? 'text-brand-700 dark:text-brand-300' : ''}`}>
                          {sv > 0 ? `${policy?.currency || '¥'}${fmtMoney(sv)}` : <span className="opacity-50">0.00</span>}
                        </td>
                      )
                    })}
                    <td className={`${TD_CL} text-right tabular-nums text-brand-700 dark:text-brand-300`}>
                      {policy?.currency || '¥'}{fmtMoney(rowsTotal)}
                    </td>
                    <td className={`${TD_CL} text-center tabular-nums`}>{invoiceTotal}</td>
                    <td className={TD_CL}></td>
                  </tr>

                  {/* 出差补贴行（西门子风格独立一行） */}
                  {policy?.subsidyInSeparateRow !== false && (
                    <tr className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border-t-2 border-slate-300 dark:border-slate-700">
                      <td className={`${TD_CL} text-center text-xs uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300`} colSpan={2}>
                        <div className="inline-flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5" /> C · 出差补贴（按公司制度自动计算）</div>
                      </td>
                      {/* 补贴金额放在最后一个分类列，横跨剩余分类列的最右显示 → 放在"行小计"位置更直观 */}
                      {enabledCategories.slice(0, -1).map((c) => (
                        <td key={c.key} className={TD_CL}></td>
                      ))}
                      <td className={TD_CL}>
                        {/* 最右侧分类列内写入补贴配置明细 */}
                        <div className="px-1 py-0.5 space-y-1.5">
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <select value={subsidy.subsidyKey}
                              onChange={(e) => setSubsidy((s) => ({ ...s, subsidyKey: e.target.value }))}
                              className="px-1.5 py-1 text-xs rounded border border-amber-300/70 dark:border-amber-900/70 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-200 font-medium min-w-[120px]">
                              {enabledSubsidies.map((s) => (
                                <option key={s.key} value={s.key}>{s.label} · {policy?.currency || '¥'}{s.perDay}/天</option>
                              ))}
                            </select>
                            <label className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                              全天
                              <input type="number" min={0} step={1} value={subsidy.fullDays}
                                onChange={(e) => setSubsidy((s) => ({ ...s, fullDays: Math.max(0, n(e.target.value)) }))}
                                className="w-14 px-1 py-0.5 text-center border border-amber-300/70 dark:border-amber-900/70 rounded tabular-nums bg-white dark:bg-slate-900" />
                              天
                            </label>
                            {policy?.halfDaySubsidyEnabled && (
                              <label className="inline-flex items-center gap-1 text-xs text-amber-800 dark:text-amber-200">
                                +半天
                                <input type="number" min={0} step={1} value={subsidy.halfDays}
                                  onChange={(e) => setSubsidy((s) => ({ ...s, halfDays: Math.max(0, n(e.target.value)) }))}
                                  className="w-14 px-1 py-0.5 text-center border border-amber-300/70 dark:border-amber-900/70 rounded tabular-nums bg-white dark:bg-slate-900" />
                                天
                              </label>
                            )}
                            <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
                              标准 <b>{policy?.currency || '¥'}{subsidyPerDay}</b>/天 · 合计
                            </span>
                          </div>
                        </div>
                      </td>
                      {/* 行小计列：显示补贴合计 */}
                      <td className={`${TD_CL} text-right font-bold tabular-nums text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/30`}>
                        + {policy?.currency || '¥'}{fmtMoney(subsidyTotal)}
                      </td>
                      <td className={`${TD_CL} text-center text-xs text-amber-700 dark:text-amber-300`}>
                        —
                      </td>
                      <td className={TD_CL}></td>
                    </tr>
                  )}

                  {/* 合计行 */}
                  <tr className="bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900">
                    <td className={`${TD_CL} !border-slate-900/30 text-center text-sm font-black uppercase tracking-[0.2em]`} colSpan={2}>
                      D · 单据合计（人民币）
                    </td>
                    {enabledCategories.map((c) => (
                      <td key={c.key} className={`${TD_CL} !border-slate-900/30`}></td>
                    ))}
                    <td className={`${TD_CL} !border-slate-900/30 text-right font-black text-xl tabular-nums`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {policy?.currency || '¥'}{fmtMoney(grandTotal)}
                    </td>
                    <td className={`${TD_CL} !border-slate-900/30 text-center text-xs`}>
                      共 <b className="text-base">{invoiceTotal}</b> 张
                    </td>
                    <td className={`${TD_CL} !border-slate-900/30`}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <button onClick={() => addRowAfter()}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950/30">
                <Plus className="w-3.5 h-3.5" /> 追加一行
              </button>
            </div>
          </div>

          {/* 大写金额 + 张数统计摘要 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-8">
            <div className="md:col-span-8 p-4 rounded-xl border-2 border-slate-800 dark:border-slate-200 bg-slate-50/40 dark:bg-slate-800/20">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">Amount in Words · 人民币大写</div>
              <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-wide leading-relaxed break-words">
                {toChineseAmount(grandTotal)}
              </div>
            </div>
            <div className="md:col-span-4 grid grid-cols-2 gap-3">
              <Kpi title="明细行数" value={`${rows.filter(r => enabledCategories.some(c => n(r.amounts[c.key as ExpenseCategoryKey]) > 0)).length} 行`} />
              <Kpi title="附件张数" value={`${invoiceTotal} 张`} />
              <Kpi title="差旅天数" value={startDate && endDate ? `${dateDiffDays(startDate, endDate) + 1} 天` : '—'} />
              <Kpi title="补贴合计" value={`${policy?.currency || '¥'}${fmtMoney(subsidyTotal)}`} highlight />
            </div>
          </div>

          {/* ========== 费用分摊区（汇联易风格：按部门/项目/成本中心分摊）========== */}
          <div className="print:hidden">
            <AllocationPanel
              totalAmount={grandTotal}
              config={allocationConfig}
              onChange={setAllocationConfig}
            />
          </div>

          {/* ========== 汇联易风格：费用标准检查 + 预算控制 + 智能审批路由 ========== */}
          {(overStandardIssues.length > 0 || budgetCheckResults.length > 0 || approvalRouting.hasEscalation) && (
            <div className="print:hidden mt-4 space-y-3">
              {/* 费用标准超标预警 */}
              {overStandardIssues.length > 0 && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TriangleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      费用标准检查 · {overStandardIssues.length} 项提示
                    </h4>
                    <span className="text-[11px] text-amber-700/70 dark:text-amber-400/70 ml-auto">
                      职级：{EMPLOYEE_LEVELS.find((l) => l.value === employeeLevel)?.label} · 差旅类型：{currentTripType}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs">
                    {overStandardIssues.map((issue, idx) => {
                      const isBlock = issue.action === 'block'
                      const isEscalation = issue.action === 'escalation'
                      const tagClass = isBlock
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                        : isEscalation
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      const tagText = isBlock ? '阻断' : isEscalation ? '升级审批' : '提示'
                      return (
                        <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${tagClass}`}>{tagText}</span>
                          <span className="flex-1">{issue.message}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* 预算使用进度 */}
              {budgetCheckResults.length > 0 && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">预算控制</h4>
                    <span className="text-[11px] text-slate-500 ml-auto">
                      周期：{policy?.budgetControl?.period === 'monthly' ? '月度' : policy?.budgetControl?.period === 'quarterly' ? '季度' : '年度'}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {budgetCheckResults.map((b, idx) => {
                      const level = utilizationLevel(b.afterUtilization)
                      const barColor = level === 'exceeded' ? 'bg-red-500' : level === 'danger' ? 'bg-orange-500' : level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                      const label = b.type === 'department' ? '部门' : '项目'
                      return (
                        <div key={idx}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-600 dark:text-slate-300">
                              <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 mr-1.5">{label}</span>
                              {b.name}
                            </span>
                            <span className={b.overBudget ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500'}>
                              ¥{fmtMoney(b.afterAmount)} / ¥{fmtMoney(b.budgetAmount)}
                              {b.overBudget && <span className="ml-1 text-red-600 dark:text-red-400">（超支）</span>}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${barColor} transition-all`}
                              style={{ width: `${Math.min(100, b.afterUtilization * 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-0.5 text-slate-400">
                            <span>已用 {fmtMoney(b.usedAmount)}（{(b.utilization * 100).toFixed(1)}%）</span>
                            <span>本次 {fmtMoney(b.pendingAmount)} → 预计 {(b.afterUtilization * 100).toFixed(1)}%</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 智能审批路由触发提示 */}
              {approvalRouting.hasEscalation && (
                <div className="rounded-lg border border-brand-200 dark:border-brand-900/50 bg-brand-50/60 dark:bg-brand-900/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <h4 className="text-sm font-semibold text-brand-800 dark:text-brand-300">
                      智能审批路由 · 触发 {approvalRouting.triggeredRules.length} 条升级规则
                    </h4>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {approvalRouting.triggeredRules.map((rule) => (
                      <li key={rule.id} className="flex items-center gap-2">
                        <CheckCircle2 className="w-3 h-3 text-brand-500 flex-shrink-0" />
                        <span>{rule.name}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-brand-700/70 dark:text-brand-400/70 mt-2">
                    本单将自动追加审批节点：
                    {approvalRouting.appendSignerKeys
                      .map((k) => enabledSigners.find((s) => s.key === k)?.title || k)
                      .join('、')}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ========== 签字区（多级） ========== */}
          <div className="pt-4 border-t border-dashed border-slate-300 dark:border-slate-700">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-[0.15em] flex items-center gap-2">
                <span className="w-1.5 h-4 rounded bg-violet-600" />
                E · 签字确认 & 递交审批
              </h3>
              <button onClick={quickSignApplicant}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-sm transition-colors">
                <FileSignature className="w-3.5 h-3.5" /> 一键：我作为报销人签字确认
              </button>
            </div>

            <div className={`grid gap-3 ${
              enabledSigners.length <= 2 ? 'grid-cols-1 sm:grid-cols-2'
                : enabledSigners.length <= 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-' + Math.min(4, enabledSigners.length)
            }`}>
              {enabledSigners.map((s, idx) => {
                const state = signatures.signedMap[s.key] || { signed: false, signerName: '', date: '' }
                const isApplicant = idx === 0
                return (
                  <div key={s.key} className={`rounded-xl border-2 p-4 transition-colors relative ${
                    state.signed
                      ? 'border-emerald-400/80 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/60'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50'
                  }`}>
                    <div className="flex items-start justify-between mb-2 gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                          第 {idx + 1} 级 · {isApplicant ? 'Applicant' : 'Approver'}
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white text-[15px] leading-tight mt-0.5">
                          {s.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">建议：{s.placeholderRole}</div>
                      </div>
                      {state.signed
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">待签字</span>
                      }
                    </div>

                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1 mt-3 inline-flex items-center gap-1.5">
                      <input type="checkbox" className="accent-brand-600"
                        checked={state.signed}
                        onChange={(e) => updateSignature(s.key, {
                          signed: e.target.checked,
                          date: e.target.checked ? (state.date || todayISO()) : state.date
                        })}
                      />
                      我已核对本栏信息并同意签字
                    </label>

                    <div className="grid grid-cols-[1fr_110px] gap-2 mt-1">
                      <input
                        placeholder="签字人姓名"
                        value={state.signerName}
                        onChange={(e) => updateSignature(s.key, { signerName: e.target.value })}
                        disabled={!state.signed && !isApplicant}
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-slate-50 dark:disabled:bg-slate-900/60 disabled:text-slate-400 disabled:cursor-not-allowed"
                      />
                      <input
                        type="date"
                        value={state.date}
                        onChange={(e) => updateSignature(s.key, { date: e.target.value })}
                        disabled={!state.signed && !isApplicant}
                        className="w-full px-2 py-1 text-sm rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-slate-50 dark:disabled:bg-slate-900/60 disabled:text-slate-400 disabled:cursor-not-allowed tabular-nums"
                      />
                    </div>

                    {/* 签字"占位线"，打印时好看 */}
                    <div className="mt-3 h-9 border-b border-slate-400/70 dark:border-slate-400/50 flex items-end pb-1">
                      {state.signed && state.signerName
                        ? <span className="text-lg font-serif italic text-slate-800 dark:text-slate-100 leading-none">{state.signerName}</span>
                        : <span className="text-xs text-slate-300 dark:text-slate-700">（此处签字）</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 底部制度说明 */}
          {policy?.footerNotes && (
            <div className="mt-10 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-1.5">公司制度 / Remarks</div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap print:text-[11px] print:text-slate-800">
                {policy.footerNotes}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ========== Toast ========== */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-xl border text-sm font-medium backdrop-blur ${
            toast.kind === 'ok'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : toast.kind === 'err'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-slate-800 text-white border-slate-700'
          }`}>
            {toast.kind === 'ok' && <CheckCircle2 className="w-4 h-4" />}
            {toast.kind === 'err' && <AlertCircle className="w-4 h-4" />}
            {toast.kind === 'info' && <Info className="w-4 h-4" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${
      highlight
        ? 'border-amber-300/70 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/20 dark:border-amber-900/50'
        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40'
    }`}>
      <div className="text-[11px] uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{title}</div>
      <div className={`mt-0.5 font-bold tabular-nums ${
        highlight ? 'text-amber-700 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'
      } text-lg leading-tight`}>{value}</div>
    </div>
  )
}
