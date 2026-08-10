'use client'

import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
  BarChart3,
  CircleDollarSign,
  FileText,
  Target,
  CheckCircle2,
  Filter,
  Calendar,
  Building2,
  Tag,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ShieldAlert,
  Copy,
  Wallet,
  PieChart,
  Trophy,
  Crown,
  Medal,
  Flag,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Download,
  Printer,
} from 'lucide-react'
import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/api'
import { useSettingsStore } from '@/lib/settings'
import { utilizationLevel } from '@/lib/expense-standard'
import { useInvoiceStore } from '@/lib/invoice-store'

// ---- 常量 ----
const YEARS = [2025, 2024, 2023] as const
const QUARTERS: Array<{ value: 'all' | 'q1' | 'q2' | 'q3' | 'q4'; label: string; months: number[] }> = [
  { value: 'all', label: '全年', months: [1,2,3,4,5,6,7,8,9,10,11,12] },
  { value: 'q1', label: 'Q1（1–3 月）', months: [1,2,3] },
  { value: 'q2', label: 'Q2（4–6 月）', months: [4,5,6] },
  { value: 'q3', label: 'Q3（7–9 月）', months: [7,8,9] },
  { value: 'q4', label: 'Q4（10–12 月）', months: [10,11,12] },
]
const DEPTS = ['研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部', '行政部']
const CATS: ExpenseCategory[] = ['travel', 'meal', 'transport', 'office', 'communication', 'entertainment', 'training', 'other']
const CAT_COLORS: Record<ExpenseCategory, string> = {
  travel: '#6366f1', meal: '#f59e0b', transport: '#10b981', office: '#8b5cf6',
  communication: '#06b6d4', entertainment: '#ef4444', training: '#14b8a6', other: '#64748b',
}
const DEPT_COLORS = [
  '#06b6d4', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6', '#ec4899',
]

type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
interface MonthlyStat {
  month: Month
  amount: number
  count: number
  lastYearAmount: number
}
interface DeptStat { dept: string; amount: number; count: number; color: string }
interface CatStat { cat: ExpenseCategory; amount: number; count: number }

// ---- Mock 数据生成 ----
function seededRandom(seed: number) {
  // xorshift 伪随机，保证每次刷新数据一致（方便演示）
  let s = seed >>> 0
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) / 0xffffffff)
  }
}
function makeMonthly(year: number): MonthlyStat[] {
  const rnd = seededRandom(year * 1337 + 7)
  const list: MonthlyStat[] = []
  for (let m = 1; m <= 12; m++) {
    // 金额：基值 + 春节/双11/年末高峰
    const base = 8000 + Math.sin((m - 3) / 12 * Math.PI * 2) * 2500
    const seasonal =
      m === 1 ? 3200 : // 春节
      m === 2 ? 1200 :
      m === 10 ? 2500 : // 国庆差旅
      m === 11 ? 1800 :
      m === 12 ? 3800 : // 年底冲刺+年会
      0
    const noise = rnd() * 4000
    const amount = Math.round(base + seasonal + noise)
    list.push({
      month: m as Month,
      amount,
      count: Math.max(3, Math.round(10 + (m % 5) + rnd() * 12)),
      lastYearAmount: Math.round(amount * (0.6 + rnd() * 0.5)),
    })
  }
  return list
}
function makeDept(year: number): DeptStat[] {
  const rnd = seededRandom(year * 20277 + 99)
  return DEPTS.map((d, i) => {
    const scale = i === 0 ? 1.8 : i === 3 ? 1.5 : i === 2 ? 1.25 : 0.6 + rnd() * 0.7
    return {
      dept: d,
      amount: Math.round(28000 * scale + rnd() * 6000),
      count: Math.max(2, Math.round(12 * scale + rnd() * 8)),
      color: DEPT_COLORS[i],
    }
  }).sort((a, b) => b.amount - a.amount)
}
function makeCat(year: number): CatStat[] {
  const rnd = seededRandom(year * 7 + 31)
  const weights: Record<ExpenseCategory, number> = {
    travel: 1.9, meal: 1.4, transport: 1.0, office: 0.9,
    communication: 0.2, entertainment: 0.7, training: 0.5, other: 0.4,
  }
  const total = 245800
  return CATS.map((c) => ({
    cat: c,
    amount: Math.round(total * weights[c] * (0.8 + rnd() * 0.4)),
    count: Math.max(1, Math.round(10 * weights[c] * (0.7 + rnd() * 0.6))),
  })).sort((a, b) => b.amount - a.amount)
}

// ---- TOP10 员工费用排行 Mock 数据 ----
interface TopEmployeeStat {
  rank: number
  name: string
  dept: string
  amount: number
  count: number
  avgAmount: number
  yoy: number // 同比
  topCategory: ExpenseCategory
  topCategoryAmount: number
}

const EMPLOYEE_NAMES = [
  '张伟', '王芳', '李强', '刘洋', '陈静', '杨磊', '黄敏', '赵斌',
  '周婷', '吴浩', '徐丽', '孙鹏', '马超', '朱琳', '胡军', '郭明',
]
function makeTopEmployees(year: number, quarter: string): TopEmployeeStat[] {
  const rnd = seededRandom(year * 31 + quarter.length * 7 + 11)
  const q = QUARTERS.find((x) => x.value === quarter)!
  const monthCount = q.months.length
  const scale = monthCount / 12 // 季度缩放

  const list: TopEmployeeStat[] = EMPLOYEE_NAMES.map((name, i) => {
    const dept = DEPTS[i % DEPTS.length]
    const base = (12000 + rnd() * 28000) * scale
    const amount = Math.round(base)
    const count = Math.max(2, Math.round((4 + rnd() * 12) * scale))
    return {
      rank: 0,
      name,
      dept,
      amount,
      count,
      avgAmount: Math.round(amount / count),
      yoy: +(((rnd() - 0.4) * 60).toFixed(1)), // -24% ~ +36%
      topCategory: CATS[Math.floor(rnd() * CATS.length)],
      topCategoryAmount: Math.round(amount * (0.3 + rnd() * 0.4)),
    }
  })
  list.sort((a, b) => b.amount - a.amount)
  list.forEach((e, i) => { e.rank = i + 1 })
  return list.slice(0, 10)
}

// ---- 异常预警构建 ----
type AnomalyType = 'duplicate_invoice' | 'over_standard' | 'over_budget' | 'large_amount' | 'verify_failed'
interface AnomalyItem {
  id: string
  type: AnomalyType
  level: 'high' | 'medium' | 'low'
  title: string
  detail: string
  amount?: number
  source: string // 关联来源（发票号/部门/员工等）
  occurredAt: string
}

function buildAnomalies(
  invoices: import('@/lib/invoice-store').InvoiceRecord[],
  depts: DeptStat[],
  budgetControl: import('@/lib/settings').BudgetControl | undefined,
  year: number,
): AnomalyItem[] {
  const list: AnomalyItem[] = []

  // 1) 重复发票（status === 'duplicate' 或验真失败）
  invoices.forEach((inv) => {
    if (inv.status === 'duplicate') {
      list.push({
        id: `dup-${inv.id}`,
        type: 'duplicate_invoice',
        level: 'high',
        title: '发票查重异常',
        detail: `发票号码 ${inv.invoiceNumber}（代码 ${inv.invoiceCode}）与已有发票重复，疑似重复报销`,
        amount: inv.amount,
        source: inv.sellerName,
        occurredAt: inv.createdAt,
      })
    }
    if (inv.verifyStatus === 'failed') {
      list.push({
        id: `vf-${inv.id}`,
        type: 'verify_failed',
        level: 'high',
        title: '发票验真失败',
        detail: `发票 ${inv.invoiceNumber} 验真不一致：申报金额或销方信息与税务机关登记不符`,
        amount: inv.amount,
        source: inv.sellerName,
        occurredAt: inv.verifiedAt || inv.updatedAt,
      })
    }
  })

  // 2) 超预算预警（部门预算使用率 >= 90%）
  if (budgetControl?.enabled) {
    const periodLabel = budgetControl.period === 'monthly' ? '本月' : budgetControl.period === 'quarterly' ? '本季' : '本年'
    budgetControl.departmentBudgets.forEach((d) => {
      const rate = d.amount > 0 ? d.usedAmount / d.amount : 0
      if (rate >= 0.9) {
        list.push({
          id: `ob-dept-${d.id}`,
          type: 'over_budget',
          level: rate >= 1 ? 'high' : 'medium',
          title: `${d.department} 预算${rate >= 1 ? '已超支' : '即将用尽'}`,
          detail: `${periodLabel}预算 ¥${d.amount.toLocaleString('zh-CN')}，已使用 ¥${d.usedAmount.toLocaleString('zh-CN')}（${(rate * 100).toFixed(1)}%）${
            rate >= 1 ? `，超支 ¥${(d.usedAmount - d.amount).toLocaleString('zh-CN')}` : `，剩余 ¥${(d.amount - d.usedAmount).toLocaleString('zh-CN')}`
          }`,
          amount: d.usedAmount,
          source: d.department,
          occurredAt: new Date().toISOString(),
        })
      }
    })
    budgetControl.projectBudgets.forEach((p) => {
      const rate = p.amount > 0 ? p.usedAmount / p.amount : 0
      if (rate >= 0.9) {
        list.push({
          id: `ob-proj-${p.id}`,
          type: 'over_budget',
          level: rate >= 1 ? 'high' : 'medium',
          title: `项目「${p.projectName}」预算${rate >= 1 ? '已超支' : '即将用尽'}`,
          detail: `项目 ${p.projectCode} 预算 ¥${p.amount.toLocaleString('zh-CN')}，已使用 ¥${p.usedAmount.toLocaleString('zh-CN')}（${(rate * 100).toFixed(1)}%）`,
          amount: p.usedAmount,
          source: p.projectCode,
          occurredAt: new Date().toISOString(),
        })
      }
    })
  }

  // 3) 异常大额报销（基于部门数据 mock 生成）
  const rnd = seededRandom(year * 99 + 7)
  const bigAmountCount = 2 + Math.floor(rnd() * 3)
  for (let i = 0; i < bigAmountCount; i++) {
    const dept = depts[Math.floor(rnd() * depts.length)] || depts[0]
    if (!dept) continue
    const amount = Math.round(8000 + rnd() * 12000)
    list.push({
      id: `la-${year}-${i}`,
      type: 'large_amount',
      level: 'medium',
      title: '大额报销单待复核',
      detail: `${dept.dept} 存在单笔 ¥${amount.toLocaleString('zh-CN')} 的报销单，超过大额复核阈值 ¥8,000，建议财务复核发票真实性`,
      amount,
      source: dept.dept,
      occurredAt: new Date(Date.now() - i * 86400000).toISOString(),
    })
  }

  // 4) 超标预警（mock）
  const overStdCount = 1 + Math.floor(rnd() * 2)
  for (let i = 0; i < overStdCount; i++) {
    const dept = depts[Math.floor(rnd() * depts.length)] || depts[0]
    if (!dept) continue
    list.push({
      id: `os-${year}-${i}`,
      type: 'over_standard',
      level: 'low',
      title: '费用超标预警',
      detail: `${dept.dept} 有报销单住宿费日均超过职级限额，已触发提示（warn）并继续提交，建议主管审批时关注`,
      source: dept.dept,
      occurredAt: new Date(Date.now() - (i + 2) * 86400000).toISOString(),
    })
  }

  // 按级别和时间排序：high > medium > low，同级别按时间倒序
  const levelOrder = { high: 0, medium: 1, low: 2 }
  list.sort((a, b) => {
    if (levelOrder[a.level] !== levelOrder[b.level]) return levelOrder[a.level] - levelOrder[b.level]
    return a.occurredAt < b.occurredAt ? 1 : -1
  })
  return list
}

// ---- 工具 ----
const fmt = (n: number) =>
  (n < 10000 ? n.toLocaleString('zh-CN') : (n / 10000).toFixed(2) + ' 万')
const fullFmt = (n: number) => '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = (a: number, b: number) => (b === 0 ? 0 : (a / b) * 100)
const momText = (cur: number, prev: number) => {
  if (prev === 0) return { cls: '', icon: <Minus className="w-3 h-3" />, text: '—' }
  const p = ((cur - prev) / prev) * 100
  if (p > 0.5) return { cls: 'text-emerald-600 dark:text-emerald-400', icon: <TrendingUp className="w-3 h-3" />, text: `+${p.toFixed(1)}%` }
  if (p < -0.5) return { cls: 'text-red-600 dark:text-red-400', icon: <TrendingDown className="w-3 h-3" />, text: `${p.toFixed(1)}%` }
  return { cls: 'text-slate-500 dark:text-slate-400', icon: <Minus className="w-3 h-3" />, text: '持平' }
}

export default function AnalyticsPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [tab, setTab] = useState<'trend' | 'budget' | 'anomaly'>('trend')
  const [year, setYear] = useState<number>(2024)
  const [quarter, setQuarter] = useState<(typeof QUARTERS)[number]['value']>('all')
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set())
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set())
  // PDF 报告导出：printing=true 时渲染专用打印布局
  const [printing, setPrinting] = useState(false)

  // --- 预算数据（来自 settings store） ---
  const policy = useSettingsStore((s) => s.policy)
  const budgetControl = policy.budgetControl

  // --- 发票数据（用于异常预警） ---
  const invoices = useInvoiceStore((s) => s.invoices)

  const monthly = useMemo(() => makeMonthly(year), [year])
  const depts = useMemo(() => makeDept(year), [year])
  const cats = useMemo(() => makeCat(year), [year])

  const filteredMonths = useMemo(() => {
    const q = QUARTERS.find((q) => q.value === quarter)!
    return monthly.filter((m) => q.months.includes(m.month))
  }, [monthly, quarter])

  const scope = useMemo(() => {
    const ms = filteredMonths
    const count = ms.reduce((s, m) => s + m.count, 0)
    const amount = ms.reduce((s, m) => s + m.amount, 0)
    const last = ms.reduce((s, m) => s + m.lastYearAmount, 0)
    const avg = count > 0 ? amount / count : 0
    // 通过率：mock 90%+random
    const pass = 0.88 + ((year % 10) / 100)
    return { amount, count, avg, pass, last }
  }, [filteredMonths, year])

  // 部门 & 类别过滤：可视化时按 filter 过滤
  const visibleDepts = useMemo(
    () => (deptFilter.size === 0 ? depts : depts.filter((d) => deptFilter.has(d.dept))),
    [depts, deptFilter]
  )
  const visibleCats = useMemo(
    () => (catFilter.size === 0 ? cats : cats.filter((c) => catFilter.has(c.cat))),
    [cats, catFilter]
  )

  // === TOP10 费用排行（按员工 Mock） ===
  const topEmployees = useMemo(() => makeTopEmployees(year, quarter), [year, quarter])

  // === 预算执行率汇总 ===
  const budgetSummary = useMemo(() => {
    if (!budgetControl?.enabled) return null
    const deps = budgetControl.departmentBudgets || []
    const projs = budgetControl.projectBudgets || []
    const totalBudget = deps.reduce((s, d) => s + d.amount, 0) + projs.reduce((s, p) => s + p.amount, 0)
    const totalUsed = deps.reduce((s, d) => s + d.usedAmount, 0) + projs.reduce((s, p) => s + p.usedAmount, 0)
    const totalRemaining = totalBudget - totalUsed
    const overallRate = totalBudget > 0 ? totalUsed / totalBudget : 0
    return { totalBudget, totalUsed, totalRemaining, overallRate }
  }, [budgetControl])

  // === 异常预警列表 ===
  const anomalies = useMemo(() => buildAnomalies(invoices, depts, budgetControl, year), [invoices, depts, budgetControl, year])

  // === PDF 导出 ===
  // 打印结束后重置 printing 状态（兼容 beforeprint/afterprint 事件）
  useEffect(() => {
    if (!printing) return
    const handleAfterPrint = () => setPrinting(false)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [printing])

  const handleExportPdf = useCallback(() => {
    setPrinting(true)
    // 等待打印布局渲染完成后再触发打印
    setTimeout(() => {
      window.print()
    }, 300)
  }, [])

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            统计分析
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            报销金额趋势、费用构成、部门对比、预算执行、异常预警，多维视图帮你掌握公司支出全貌与变化
          </p>
        </div>
        {/* 导出 PDF 报告 */}
        <button
          onClick={handleExportPdf}
          disabled={!mounted}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          title="导出当前仪表盘所有数据为 PDF 报告"
        >
          <Download className="w-4 h-4" />
          <span>导出 PDF 报告</span>
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="analytics-screen flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 w-fit">
        <TabBtn active={tab === 'trend'} onClick={() => setTab('trend')} icon={<TrendingUp className="w-4 h-4" />} label="趋势分析" />
        <TabBtn active={tab === 'budget'} onClick={() => setTab('budget')} icon={<Wallet className="w-4 h-4" />} label="预算执行" />
        <TabBtn active={tab === 'anomaly'} onClick={() => setTab('anomaly')} icon={<ShieldAlert className="w-4 h-4" />} label="异常预警" badge={anomalies.length} />
      </div>

      {/* SSR 水合前 loading */}
      {!mounted ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mr-3" />
          <span className="text-slate-500 dark:text-slate-400">加载分析数据...</span>
        </div>
      ) : tab === 'trend' ? (
        <>
      {/* 过滤器 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            className="bg-transparent outline-none text-sm font-medium text-slate-700 dark:text-slate-200 pr-1"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y} 年度</option>
            ))}
          </select>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <select
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value as any)}
          >
            {QUARTERS.map((q) => (
              <option key={q.value} value={q.value}>{q.label}</option>
            ))}
          </select>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <details className="relative group">
            <summary className="list-none cursor-pointer text-sm text-slate-700 dark:text-slate-200 outline-none inline-flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              部门：{deptFilter.size === 0 ? '全部' : `${deptFilter.size} 个`}
            </summary>
            <div className="absolute left-0 top-full mt-2 w-56 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto">
              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={deptFilter.size === 0}
                  onChange={() => setDeptFilter(new Set())}
                  className="accent-brand-600"
                />
                <span>全部部门</span>
              </label>
              {DEPTS.map((d) => (
                <label key={d} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deptFilter.has(d)}
                    onChange={() =>
                      setDeptFilter((s) => {
                        const n = new Set(s)
                        if (n.has(d)) n.delete(d)
                        else n.add(d)
                        return n
                      })
                    }
                    className="accent-brand-600"
                  />
                  <span>{d}</span>
                </label>
              ))}
            </div>
          </details>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <details className="relative group">
            <summary className="list-none cursor-pointer text-sm text-slate-700 dark:text-slate-200 outline-none inline-flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              类别：{catFilter.size === 0 ? '全部' : `${catFilter.size} 个`}
            </summary>
            <div className="absolute left-0 top-full mt-2 w-56 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto">
              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={catFilter.size === 0}
                  onChange={() => setCatFilter(new Set())}
                  className="accent-brand-600"
                />
                <span>全部类别</span>
              </label>
              {CATS.map((c) => (
                <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={catFilter.has(c)}
                    onChange={() =>
                      setCatFilter((s) => {
                        const n = new Set(s)
                        if (n.has(c)) n.delete(c)
                        else n.add(c)
                        return n
                      })
                    }
                    className="accent-brand-600"
                  />
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CAT_COLORS[c] }} />
                    {CATEGORY_LABEL[c]}
                  </span>
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          对比周期：{year - 1} vs {year}（同比）
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="累计报销金额"
          value={fmt(scope.amount)}
          tone="violet"
          icon={<CircleDollarSign className="w-4 h-4" />}
          sub={`同比 ${momText(scope.amount, scope.last).text}`}
          mom={momText(scope.amount, scope.last)}
        />
        <Kpi
          label="报销单数"
          value={scope.count}
          tone="sky"
          icon={<FileText className="w-4 h-4" />}
        />
        <Kpi
          label="平均单笔"
          value={fmt(Math.round(scope.avg))}
          tone="amber"
          icon={<Target className="w-4 h-4" />}
        />
        <Kpi
          label="审批通过率"
          value={`${(scope.pass * 100).toFixed(1)}%`}
          tone="emerald"
          icon={<CheckCircle2 className="w-4 h-4" />}
          sub="审批通过 / 已提交总数"
        />
      </div>

      {/* 2x2 图表网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 趋势图（占 3 列） */}
        <Card title="月度报销金额趋势" subtitle="柱：当年金额 / 线：去年同月金额 / 观察季节性波动" className="lg:col-span-3">
          <TrendChart data={filteredMonths} />
        </Card>
        {/* 类别占比（占 2 列） */}
        <Card title="费用类别构成" subtitle="饼图 = 价税合计占比（可在顶部筛选类别）">
          <DonutChart cats={visibleCats} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 部门对比（占 3 列） */}
        <Card title="部门报销金额对比 TOP" subtitle="按总金额降序（可在顶部筛部门）">
          <DeptBarChart list={visibleDepts} />
        </Card>
        {/* 月度明细表（占 2 列） */}
        <Card title="月度明细" subtitle="当月 / 环比 / 占全年">
          <MonthlyTable rows={monthly} quarterMonths={QUARTERS.find((q) => q.value === quarter)!.months} />
        </Card>
      </div>

      {/* TOP10 费用排行 */}
      <Card title="员工费用报销 TOP10 排行" subtitle={`按 ${year} 年${quarter === 'all' ? '全年' : QUARTERS.find((q) => q.value === quarter)!.label}累计金额排序`}>
        <TopEmployeesList list={topEmployees} />
      </Card>
        </>
      ) : tab === 'budget' ? (
        <BudgetDashboard
          budgetControl={budgetControl}
          summary={budgetSummary}
        />
      ) : (
        <AnomalyDashboard anomalies={anomalies} year={year} />
      )}

      {/* === PDF 报告打印布局（仅在 printing=true 时渲染，仅打印时可见） === */}
      {printing && (
        <PrintReport
          year={year}
          quarter={quarter}
          scope={scope}
          monthly={monthly}
          depts={depts}
          cats={cats}
          topEmployees={topEmployees}
          budgetControl={budgetControl}
          budgetSummary={budgetSummary}
          anomalies={anomalies}
        />
      )}

      {/* === 打印专用 CSS：隐藏整个应用 UI，仅显示打印报告 === */}
      <style jsx global>{`
        /* 默认隐藏打印报告 */
        .analytics-print-report { display: none !important; }
        /* 默认显示屏幕内容 */
        .analytics-screen { display: revert; }

        @media print {
          /* 隐藏屏幕 UI：侧边栏、头部、Tab、主内容区 */
          body * { visibility: hidden !important; }
          .analytics-print-report, .analytics-print-report * { visibility: visible !important; }
          .analytics-print-report {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* 打印时使用白底黑字，节省墨水 */
          .analytics-print-report {
            background: white !important;
            color: #1e293b !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* 避免行内分页截断 */
          .analytics-print-report tr, .analytics-print-report .print-avoid-break { page-break-inside: avoid; }
          /* 表格不换页 */
          .analytics-print-report table { page-break-inside: auto; }
          /* 段落标题前换页（除第一个） */
          .analytics-print-report .print-page-break { page-break-before: always; }
          @page { margin: 14mm 12mm; }
        }
      `}</style>
    </div>
  )
}

// ---- 小组件：Tab 按钮 ----
function TabBtn(props: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={props.onClick}
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
        props.active
          ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
      }`}
    >
      {props.icon}
      <span>{props.label}</span>
      {props.badge != null && props.badge > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
          {props.badge}
        </span>
      )}
    </button>
  )
}

// ---- 小组件：KPI ----
function Kpi(props: {
  label: string
  value: string | number
  tone: 'violet' | 'sky' | 'amber' | 'emerald'
  icon: React.ReactNode
  sub?: string
  mom?: { cls: string; icon: React.ReactNode; text: string }
}) {
  const m: Record<string, string> = {
    violet: 'from-violet-500 to-fuchsia-500',
    sky: 'from-sky-500 to-cyan-500',
    amber: 'from-amber-500 to-orange-500',
    emerald: 'from-emerald-500 to-teal-500',
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${m[props.tone]} opacity-10`} />
      <div className="flex items-start justify-between relative">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{props.label}</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white break-all">{props.value}</div>
          {props.sub && (
            <div className={`mt-1 text-xs inline-flex items-center gap-1 ${props.mom?.cls || 'text-slate-500 dark:text-slate-400'}`}>
              {props.mom?.icon}
              <span>{props.sub}</span>
            </div>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${m[props.tone]} text-white shadow flex-shrink-0`}>{props.icon}</div>
      </div>
    </div>
  )
}

// ---- 小组件：Card 容器 ----
function Card(props: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 ${props.className || ''}`}>
      <div className="mb-3">
        <div className="font-semibold text-slate-900 dark:text-white text-sm">{props.title}</div>
        {props.subtitle && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{props.subtitle}</div>}
      </div>
      {props.children}
    </div>
  )
}

// ---- 图表：月度趋势（柱 + 折线混合 SVG）----
function TrendChart({ data }: { data: MonthlyStat[] }) {
  if (data.length === 0) {
    return <EmptyState text="当前区间没有月度数据，试试调整上方「季度」筛选" />
  }
  const W = 640, H = 260
  const padL = 44, padR = 16, padT = 12, padB = 36
  const max = Math.max(...data.map((d) => Math.max(d.amount, d.lastYearAmount))) * 1.15
  const min = 0
  const xStep = (W - padL - padR) / Math.max(data.length, 1)
  const barW = Math.min(28, xStep * 0.45)
  const yTicks = 4

  const yTick = (i: number) => min + ((max - min) * i) / yTicks
  const yPos = (v: number) => padT + (H - padT - padB) * (1 - (v - min) / (max - min))

  // 折线路径（去年金额）
  const pts = data.map((d, i) => {
    const cx = padL + xStep * i + xStep / 2
    return [cx, yPos(d.lastYearAmount)] as const
  })
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const areaPath =
    linePath +
    ` L ${pts[pts.length - 1][0].toFixed(1)} ${yPos(0).toFixed(1)}` +
    ` L ${pts[0][0].toFixed(1)} ${yPos(0).toFixed(1)} Z`

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full h-[260px]">
        <defs>
          <linearGradient id="trendArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="barFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>
        {/* 网格 + Y 轴刻度 */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const y = yPos(yTick(i))
          return (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" className="fill-slate-400">
                {fmt(Math.round(yTick(i)))}
              </text>
            </g>
          )
        })}
        {/* 金额柱（当年） */}
        {data.map((d, i) => {
          const cx = padL + xStep * i + xStep / 2
          const y = yPos(d.amount)
          const h = Math.max(0, yPos(0) - y)
          return (
            <g key={d.month}>
              <rect
                x={cx - barW / 2}
                y={y}
                width={barW}
                height={h}
                rx={4}
                fill="url(#barFill)"
                className="transition-opacity hover:opacity-80"
              >
                <title>
                  {`${d.month} 月：\n当年 ¥${d.amount.toLocaleString('zh-CN')}\n去年 ¥${d.lastYearAmount.toLocaleString('zh-CN')}\n单数 ${d.count}`}
                </title>
              </rect>
              <text x={cx} y={H - padB + 16} textAnchor="middle" fontSize="11" className="fill-slate-500 dark:fill-slate-400">
                {d.month}月
              </text>
              {/* 单数标签 */}
              <text x={cx} y={y - 5} textAnchor="middle" fontSize="9" className="fill-slate-500 dark:fill-slate-400">
                {d.count}单
              </text>
            </g>
          )
        })}
        {/* 去年面积 + 折线 */}
        {pts.length > 1 && (
          <>
            <path d={areaPath} fill="url(#trendArea)" />
            <path d={linePath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 3" />
            {pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2">
                <title>{`${data[i].month} 月去年同期：¥${data[i].lastYearAmount.toLocaleString('zh-CN')}`}</title>
              </circle>
            ))}
          </>
        )}
        {/* 图例 */}
        <g transform={`translate(${padL}, 2)`}>
          <rect x="0" y="0" width="12" height="4" rx="2" fill="url(#barFill)" />
          <text x="16" y="5" fontSize="10" className="fill-slate-500 dark:fill-slate-400">{yearLabel(yearInline())} 当年金额</text>
          <line x1="150" y1="2" x2="166" y2="2" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 3" />
          <circle cx="158" cy="2" r="2.5" fill="#fff" stroke="#f59e0b" strokeWidth="1.5" />
          <text x="172" y="5" fontSize="10" className="fill-slate-500 dark:fill-slate-400">去年同期（虚线）</text>
        </g>
      </svg>
    </div>
  )
}
function yearInline(): number {
  return YEARS[0]
}
const yearLabel = (y: number) => y + ''

// ---- 图表：类别 donut ----
function DonutChart({ cats }: { cats: CatStat[] }) {
  if (cats.length === 0) return <EmptyState text="当前类别筛选下无数据" />
  const total = cats.reduce((s, c) => s + c.amount, 0) || 1
  const size = 240
  const cx = size / 2, cy = size / 2
  const r = 82, innerR = 50
  const arcs: { cat: ExpenseCategory; path: string }[] = []
  let start = -Math.PI / 2
  for (const c of cats) {
    const span = (c.amount / total) * Math.PI * 2
    const a0 = start, a1 = start + span
    start = a1
    arcs.push({ cat: c.cat, path: arcPath(cx, cy, r, innerR, a0, a1) })
  }
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-[220px] h-[220px] flex-shrink-0">
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.path}
            fill={CAT_COLORS[a.cat]}
            stroke="#fff"
            strokeWidth={1.5}
            className="hover:opacity-90 transition-opacity"
          >
            <title>
              {`${CATEGORY_LABEL[a.cat]}：¥${cats[i].amount.toLocaleString('zh-CN')} / ${cats[i].count} 单 (${(
                (cats[i].amount / total) *
                100
              ).toFixed(1)}%)`}
            </title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={innerR} fill="white" className="dark:fill-slate-900" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="10" className="fill-slate-400">
          金额合计
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="18" fontWeight={700} className="fill-slate-900 dark:fill-white">
          ¥{fmt(total)}
        </text>
      </svg>
      <ul className="flex-1 min-w-[180px] w-full space-y-1.5">
        {cats.map((c) => (
          <li key={c.cat}>
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: CAT_COLORS[c.cat] }} />
                <span className="truncate text-slate-700 dark:text-slate-200">{CATEGORY_LABEL[c.cat]}</span>
                <span className="text-slate-400 tabular-nums">{c.count}单</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums text-slate-800 dark:text-slate-100 font-medium">{fmt(c.amount)}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400 w-[44px] text-right">
                  {percent(c.amount, total).toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(0, Math.min(100, percent(c.amount, total)))}%`, background: CAT_COLORS[c.cat] }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- 图表：部门条形 ----
function DeptBarChart({ list }: { list: DeptStat[] }) {
  if (list.length === 0) return <EmptyState text="当前部门筛选下无数据" />
  const max = list[0].amount * 1.05
  return (
    <div className="space-y-2.5">
      {list.map((d, i) => (
        <div key={d.dept}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200 font-medium min-w-0">
              <span className="text-slate-400 tabular-nums w-4">#{i + 1}</span>
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="truncate">{d.dept}</span>
              <span className="text-slate-400">{d.count}单</span>
            </span>
            <span className="tabular-nums font-semibold text-slate-900 dark:text-white">{fmt(d.amount)}</span>
          </div>
          <div className="relative h-6 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-lg transition-all"
              style={{
                width: `${Math.max(1, Math.min(100, (d.amount / max) * 100))}%`,
                background: `linear-gradient(90deg, ${d.color}dd, ${d.color}99)`,
              }}
              title={`${d.dept}：¥${d.amount.toLocaleString('zh-CN')} / ${d.count} 单`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-white/90 drop-shadow">
              {percent(d.amount, list.reduce((s, x) => s + x.amount, 0)).toFixed(1)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- 月度明细表 ----
function MonthlyTable({ rows, quarterMonths }: { rows: MonthlyStat[]; quarterMonths: number[] }) {
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="max-h-[360px] overflow-y-auto -mx-1">
      <table className="w-full text-xs min-w-[360px]">
        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10">
          <tr className="text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
            <th className="px-3 py-2 text-left font-semibold">月份</th>
            <th className="px-3 py-2 text-right font-semibold">金额(¥)</th>
            <th className="px-3 py-2 text-right font-semibold">单数</th>
            <th className="px-3 py-2 text-right font-semibold">环比</th>
            <th className="px-3 py-2 text-right font-semibold">占比</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows
            .filter((r) => quarterMonths.includes(r.month))
            .map((r, i, arr) => {
              const prev = i > 0 ? arr[i - 1].amount : 0
              const mom = momText(r.amount, prev)
              const inRange = rows.filter((x) => quarterMonths.includes(x.month))
              const sum = inRange.reduce((s, x) => s + x.amount, 0)
              return (
                <tr key={r.month} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium tabular-nums">
                    {r.month} 月
                  </td>
                  <td align="right" className="px-3 py-2 tabular-nums text-slate-800 dark:text-slate-100 font-semibold">
                    {fullFmt(r.amount).slice(1)}
                  </td>
                  <td align="right" className="px-3 py-2 tabular-nums text-slate-500 dark:text-slate-400">
                    {r.count}
                  </td>
                  <td align="right" className={`px-3 py-2 tabular-nums inline-flex items-center gap-1 w-full justify-end ${mom.cls}`}>
                    {mom.icon}
                    {mom.text}
                  </td>
                  <td align="right" className="px-3 py-2 tabular-nums text-slate-500 dark:text-slate-400">
                    {percent(r.amount, sum).toFixed(1)}%
                  </td>
                </tr>
              )
            })}
        </tbody>
        <tfoot className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
          <tr className="font-semibold text-slate-800 dark:text-slate-100">
            <td className="px-3 py-2.5">小计</td>
            <td align="right" className="px-3 py-2.5 tabular-nums text-brand-700 dark:text-brand-300">
              {fullFmt(
                rows.filter((r) => quarterMonths.includes(r.month)).reduce((s, r) => s + r.amount, 0)
              ).slice(1)}
            </td>
            <td align="right" className="px-3 py-2.5 tabular-nums">
              {rows.filter((r) => quarterMonths.includes(r.month)).reduce((s, r) => s + r.count, 0)}
            </td>
            <td></td>
            <td align="right" className="px-3 py-2.5 tabular-nums">
              {percent(
                rows.filter((r) => quarterMonths.includes(r.month)).reduce((s, r) => s + r.amount, 0),
                totalAmount
              ).toFixed(1)}
              % / 全年
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ---- 通用：空态 ----
function EmptyState({ text }: { text: string }) {
  return (
    <div className="h-[260px] rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 px-4 text-center">
      {text}
    </div>
  )
}

// ---- donut 辅助 ----
function arcPath(cx: number, cy: number, r: number, innerR: number, a0: number, a1: number): string {
  if (Math.abs(a1 - a0) < 1e-3) return ''
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
  const xi0 = cx + innerR * Math.cos(a1), yi0 = cy + innerR * Math.sin(a1)
  const xi1 = cx + innerR * Math.cos(a0), yi1 = cy + innerR * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return [
    `M ${x0.toFixed(3)} ${y0.toFixed(3)}`,
    `A ${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `L ${xi0.toFixed(3)} ${yi0.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${xi1.toFixed(3)} ${yi1.toFixed(3)}`,
    'Z',
  ].join(' ')
}

/* ======================================================================
   TOP10 员工费用排行
   ====================================================================== */
function TopEmployeesList({ list }: { list: TopEmployeeStat[] }) {
  if (!list.length) return <EmptyState text="暂无排行数据" />
  const max = list[0].amount * 1.05
  return (
    <div className="space-y-2">
      {list.map((e) => {
        const rankCls =
          e.rank === 1 ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-white' :
          e.rank === 2 ? 'bg-gradient-to-br from-slate-300 to-slate-500 text-white' :
          e.rank === 3 ? 'bg-gradient-to-br from-orange-400 to-orange-700 text-white' :
          'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
        const RankIcon = e.rank === 1 ? Crown : e.rank === 2 ? Medal : e.rank === 3 ? Award : null
        const yoyUp = e.yoy > 0.5
        const yoyDown = e.yoy < -0.5
        return (
          <div key={e.name} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            {/* 排名 */}
            <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${rankCls}`}>
              {RankIcon ? <RankIcon className="w-4 h-4" /> : e.rank}
            </div>
            {/* 信息 + 进度条 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{e.name}</span>
                  <span className="text-xs text-slate-400 truncate">{e.dept}</span>
                  <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: CAT_COLORS[e.topCategory] + '22', color: CAT_COLORS[e.topCategory] }}>
                    {CATEGORY_LABEL[e.topCategory]} ¥{fmt(e.topCategoryAmount)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400 tabular-nums">{e.count}单</span>
                  <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">{fmt(e.amount)}</span>
                  <span className={`inline-flex items-center gap-0.5 text-[10px] tabular-nums w-12 justify-end ${
                    yoyUp ? 'text-red-500' : yoyDown ? 'text-emerald-500' : 'text-slate-400'
                  }`}>
                    {yoyUp ? <ArrowUpRight className="w-3 h-3" /> : yoyDown ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {Math.abs(e.yoy) > 0.5 ? `${Math.abs(e.yoy).toFixed(1)}%` : '持平'}
                  </span>
                </div>
              </div>
              <div className="relative h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(2, Math.min(100, (e.amount / max) * 100))}%`,
                    background: e.rank <= 3
                      ? 'linear-gradient(90deg, #f59e0b, #f97316)'
                      : 'linear-gradient(90deg, #6366f1, #818cf8)',
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-500" />TOP10 入榜门槛 ¥{fmt(list[list.length - 1].amount)}</span>
        <span>平均单笔最高 ¥{fmt(Math.max(...list.map((e) => e.avgAmount)))}</span>
      </div>
    </div>
  )
}

/* ======================================================================
   预算执行仪表盘
   ====================================================================== */
function BudgetDashboard(props: {
  budgetControl: import('@/lib/settings').BudgetControl | undefined
  summary: { totalBudget: number; totalUsed: number; totalRemaining: number; overallRate: number } | null
}) {
  const { budgetControl, summary } = props

  if (!budgetControl?.enabled || !summary) {
    return (
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-10 text-center">
        <Wallet className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">预算控制未启用</p>
        <p className="text-xs text-slate-400 mt-1">请在「系统设置 → 费用标准与预算」中开启预算控制并配置部门/项目预算</p>
      </div>
    )
  }

  const overallLevel = utilizationLevel(summary.overallRate)
  const levelCfg = {
    safe: { label: '健康', color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
    warning: { label: '关注', color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
    danger: { label: '紧张', color: '#ef4444', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400' },
    exceeded: { label: '超支', color: '#dc2626', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400' },
  }[overallLevel]

  const periodLabel = budgetControl.period === 'monthly' ? '本月' : budgetControl.period === 'quarterly' ? '本季' : '本年'

  return (
    <div className="space-y-4">
      {/* 总览仪表盘 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-5">
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* 环形仪表 */}
          <div className="flex-shrink-0">
            <GaugeChart rate={summary.overallRate} color={levelCfg.color} label="总体执行率" />
          </div>
          {/* 数据卡片 */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
            <BudgetStat label={`${periodLabel}预算总额`} value={summary.totalBudget} icon={<Wallet className="w-4 h-4" />} tone="slate" />
            <BudgetStat label="已使用" value={summary.totalUsed} icon={<ArrowUpRight className="w-4 h-4" />} tone="amber" />
            <BudgetStat label="剩余可用" value={summary.totalRemaining} icon={<CircleDollarSign className="w-4 h-4" />} tone="emerald" />
            <div className={`rounded-lg border border-slate-200 dark:border-slate-800 p-3 ${levelCfg.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500 dark:text-slate-400">健康度</span>
                <Flag className={`w-4 h-4 ${levelCfg.text}`} />
              </div>
              <div className={`text-lg font-bold ${levelCfg.text}`}>{levelCfg.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">执行率 {(summary.overallRate * 100).toFixed(1)}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* 部门预算 + 项目预算 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="部门预算执行率" subtitle={`周期：${periodLabel} · 共 ${budgetControl.departmentBudgets.length} 个部门`}>
          <BudgetList
            items={budgetControl.departmentBudgets.map((d) => ({
              id: d.id,
              name: d.department,
              budget: d.amount,
              used: d.usedAmount,
            }))}
          />
        </Card>
        <Card title="项目/成本中心预算执行率" subtitle={`周期：${periodLabel} · 共 ${budgetControl.projectBudgets.length} 个项目`}>
          <BudgetList
            items={budgetControl.projectBudgets.map((p) => ({
              id: p.id,
              name: `${p.projectCode} · ${p.projectName}`,
              budget: p.amount,
              used: p.usedAmount,
            }))}
          />
        </Card>
      </div>
    </div>
  )
}

/** 环形仪表盘 SVG */
function GaugeChart({ rate, color, label }: { rate: number; color: string; label: string }) {
  const size = 180
  const cx = size / 2, cy = size / 2
  const r = 72
  const strokeWidth = 14
  const circumference = 2 * Math.PI * r
  const displayRate = Math.min(1, Math.max(0, rate)) // 显示部分封顶 100%
  const dashOffset = circumference * (1 - displayRate)
  const isOver = rate >= 1
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-[180px] h-[180px]">
      {/* 背景圆环 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="currentColor"
        className="text-slate-100 dark:text-slate-800"
        strokeWidth={strokeWidth}
      />
      {/* 进度圆环 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="11" className="fill-slate-400">{label}</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fontSize="28" fontWeight={700} fill={isOver ? '#dc2626' : color}>
        {(rate * 100).toFixed(1)}%
      </text>
      {isOver && (
        <text x={cx} y={cy + 42} textAnchor="middle" fontSize="10" className="fill-red-500 font-semibold">已超支</text>
      )}
    </svg>
  )
}

/** 预算统计小卡片 */
function BudgetStat(props: { label: string; value: number; icon: React.ReactNode; tone: 'slate' | 'amber' | 'emerald' }) {
  const toneCls = {
    slate: 'text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50',
    amber: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
    emerald: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  }[props.tone]
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">{props.label}</span>
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${toneCls}`}>{props.icon}</span>
      </div>
      <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-white">¥{fmt(props.value)}</div>
    </div>
  )
}

/** 预算执行率列表 */
function BudgetList(props: { items: Array<{ id: string; name: string; budget: number; used: number }> }) {
  if (!props.items.length) return <EmptyState text="暂无预算配置" />
  return (
    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
      {props.items.map((item) => {
        const rate = item.budget > 0 ? item.used / item.budget : 0
        const level = utilizationLevel(rate)
        const cfg = {
          safe: { color: '#10b981', label: '健康', text: 'text-emerald-600 dark:text-emerald-400' },
          warning: { color: '#f59e0b', label: '关注', text: 'text-amber-600 dark:text-amber-400' },
          danger: { color: '#ef4444', label: '紧张', text: 'text-red-600 dark:text-red-400' },
          exceeded: { color: '#dc2626', label: '超支', text: 'text-red-700 dark:text-red-400' },
        }[level]
        const remaining = item.budget - item.used
        const barPct = Math.min(100, rate * 100)
        return (
          <div key={item.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{item.name}</span>
              <span className={`text-xs font-semibold ${cfg.text} flex-shrink-0`}>{cfg.label} · {(rate * 100).toFixed(1)}%</span>
            </div>
            <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${barPct}%`, background: cfg.color }}
              />
              {rate >= 1 && (
                <div
                  className="absolute top-0 h-full bg-red-500/40"
                  style={{ left: '100%', width: `${Math.min(20, (rate - 1) * 100)}%` }}
                />
              )}
            </div>
            <div className="flex items-center justify-between mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>已用 ¥{item.used.toLocaleString('zh-CN')} / 预算 ¥{item.budget.toLocaleString('zh-CN')}</span>
              <span className={remaining < 0 ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                {remaining < 0 ? `超支 ¥${Math.abs(remaining).toLocaleString('zh-CN')}` : `剩余 ¥${remaining.toLocaleString('zh-CN')}`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ======================================================================
   异常预警仪表盘
   ====================================================================== */
function AnomalyDashboard(props: { anomalies: AnomalyItem[]; year: number }) {
  const { anomalies } = props
  const high = anomalies.filter((a) => a.level === 'high')
  const medium = anomalies.filter((a) => a.level === 'medium')
  const low = anomalies.filter((a) => a.level === 'low')
  const totalAmount = anomalies.reduce((s, a) => s + (a.amount || 0), 0)

  // 按类型统计
  const typeStats = useMemo(() => {
    const map: Record<AnomalyType, { count: number; label: string; icon: React.ReactNode }> = {
      duplicate_invoice: { count: 0, label: '发票查重', icon: <Copy className="w-4 h-4" /> },
      verify_failed: { count: 0, label: '验真失败', icon: <ShieldAlert className="w-4 h-4" /> },
      over_budget: { count: 0, label: '超预算', icon: <Wallet className="w-4 h-4" /> },
      over_standard: { count: 0, label: '费用超标', icon: <AlertTriangle className="w-4 h-4" /> },
      large_amount: { count: 0, label: '大额复核', icon: <CircleDollarSign className="w-4 h-4" /> },
    }
    anomalies.forEach((a) => { map[a.type].count++ })
    return map
  }, [anomalies])

  return (
    <div className="space-y-4">
      {/* 预警 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">预警总数</span>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{anomalies.length}</div>
          <div className="text-xs text-slate-400 mt-0.5">条待处理预警</div>
        </div>
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-red-600 dark:text-red-400">高风险</span>
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{high.length}</div>
          <div className="text-xs text-red-500/70 mt-0.5">需立即处理</div>
        </div>
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-amber-600 dark:text-amber-400">中风险</span>
            <Flag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{medium.length}</div>
          <div className="text-xs text-amber-500/70 mt-0.5">建议跟进复核</div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500 dark:text-slate-400">涉及金额</span>
            <CircleDollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{fmt(totalAmount)}</div>
          <div className="text-xs text-slate-400 mt-0.5">低风险 {low.length} 条</div>
        </div>
      </div>

      {/* 按类型分布 */}
      <Card title="预警类型分布" subtitle="按异常类型聚合统计">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(Object.entries(typeStats) as Array<[AnomalyType, { count: number; label: string; icon: React.ReactNode }]>).map(([type, stat]) => {
            const max = Math.max(1, ...Object.values(typeStats).map((s) => s.count))
            const pct = (stat.count / max) * 100
            const active = stat.count > 0
            return (
              <div key={type} className={`rounded-lg border p-3 transition-colors ${active ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 opacity-60'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
                    {stat.icon}
                    {stat.label}
                  </span>
                  <span className={`text-lg font-bold tabular-nums ${active ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`}>{stat.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${active ? 'bg-gradient-to-r from-brand-500 to-brand-400' : 'bg-slate-300 dark:bg-slate-700'}`}
                    style={{ width: `${Math.max(active ? 6 : 0, pct)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 预警明细列表 */}
      <Card title="异常预警明细" subtitle="按风险等级排序，高风险建议立即处理">
        {anomalies.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">一切正常，暂无异常预警</p>
            <p className="text-xs text-slate-400 mt-1">系统将持续监控发票查重、验真、预算执行和费用超标情况</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {anomalies.map((a) => (
              <AnomalyRow key={a.id} item={a} />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/** 单条异常预警 */
function AnomalyRow({ item }: { item: AnomalyItem }) {
  const levelCfg = {
    high: { label: '高危', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', border: 'border-l-red-500', icon: <AlertTriangle className="w-4 h-4 text-red-500" /> },
    medium: { label: '中危', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', border: 'border-l-amber-500', icon: <Flag className="w-4 h-4 text-amber-500" /> },
    low: { label: '低危', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300', border: 'border-l-slate-400', icon: <Minus className="w-4 h-4 text-slate-400" /> },
  }[item.level]

  const typeLabel = {
    duplicate_invoice: '发票查重',
    verify_failed: '验真失败',
    over_budget: '超预算',
    over_standard: '费用超标',
    large_amount: '大额复核',
  }[item.type]

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border border-l-4 ${levelCfg.border} border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors`}>
      <div className="flex-shrink-0 mt-0.5">{levelCfg.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{item.title}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${levelCfg.cls}`}>{levelCfg.label}</span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 flex-shrink-0">{typeLabel}</span>
          </div>
          {item.amount != null && (
            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white flex-shrink-0">¥{item.amount.toLocaleString('zh-CN')}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.detail}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
          <span>来源：{item.source}</span>
          <span>·</span>
          <span>{item.occurredAt.slice(0, 16).replace('T', ' ')}</span>
        </div>
      </div>
    </div>
  )
}

/* ======================================================================
   PDF 报告打印布局
   ====================================================================== */
interface PrintReportProps {
  year: number
  quarter: string
  scope: { amount: number; count: number; avg: number; pass: number; last: number }
  monthly: MonthlyStat[]
  depts: DeptStat[]
  cats: CatStat[]
  topEmployees: TopEmployeeStat[]
  budgetControl: import('@/lib/settings').BudgetControl | undefined
  budgetSummary: { totalBudget: number; totalUsed: number; totalRemaining: number; overallRate: number } | null
  anomalies: AnomalyItem[]
}

function PrintReport(props: PrintReportProps) {
  const { year, quarter, scope, monthly, depts, cats, topEmployees, budgetControl, budgetSummary, anomalies } = props
  const quarterLabel = quarter === 'all' ? '全年' : QUARTERS.find((q) => q.value === quarter)!.label
  const now = new Date()
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const yoyPct = scope.last > 0 ? ((scope.amount - scope.last) / scope.last) * 100 : 0
  const highCount = anomalies.filter((a) => a.level === 'high').length
  const mediumCount = anomalies.filter((a) => a.level === 'medium').length
  const lowCount = anomalies.filter((a) => a.level === 'low').length
  const anomalyAmount = anomalies.reduce((s, a) => s + (a.amount || 0), 0)

  const monthTotal = monthly.reduce((s, m) => s + m.amount, 0)

  return (
    <div className="analytics-print-report" style={{ fontFamily: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif' }}>
      {/* === 报告封面 === */}
      <div style={{ textAlign: 'center', padding: '40px 0 30px', borderBottom: '3px solid #10b981' }}>
        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '8px' }}>智报销 · AI 智能报销系统</div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>费用分析报告</h1>
        <div style={{ fontSize: '14px', color: '#475569' }}>
          统计周期：{year} 年度 · {quarterLabel}
        </div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
          报告生成时间：{dateStr} · 数据来源：本系统实时统计
        </div>
      </div>

      {/* === 一、核心指标摘要 === */}
      <PrintSection title="一、核心指标摘要" index={1}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <PrintKpiBox label="累计报销金额" value={'¥' + fmt(scope.amount)} sub={`同比 ${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%`} color="#6366f1" />
          <PrintKpiBox label="报销单数" value={String(scope.count)} sub={`${year} 年${quarterLabel}`} color="#0ea5e9" />
          <PrintKpiBox label="平均单笔" value={'¥' + fmt(Math.round(scope.avg))} sub="金额 / 单数" color="#f59e0b" />
          <PrintKpiBox label="审批通过率" value={`${(scope.pass * 100).toFixed(1)}%`} sub="通过 / 已提交" color="#10b981" />
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', margin: '0' }}>
          本周期内累计报销 {scope.count} 笔，合计金额 ¥{scope.amount.toLocaleString('zh-CN')}，平均单笔 ¥{Math.round(scope.avg).toLocaleString('zh-CN')}。
          {yoyPct > 0 ? `较去年同期 (${year - 1}) 增长 ${yoyPct.toFixed(1)}%，建议关注增长原因。` : yoyPct < 0 ? `较去年同期 (${year - 1}) 下降 ${Math.abs(yoyPct).toFixed(1)}%，支出控制良好。` : '与去年同期基本持平。'}
          审批通过率 {(scope.pass * 100).toFixed(1)}%，{scope.pass >= 0.9 ? '审批流程运行健康。' : '建议复核退回原因。'}
        </p>
      </PrintSection>

      {/* === 二、月度趋势明细 === */}
      <PrintSection title="二、月度报销金额趋势" index={2} pageBreak>
        <PrintTable
          headers={['月份', '当年金额(¥)', '去年同期(¥)', '同比', '单数', '占全年']}
          rows={monthly.map((m) => {
            const yoy = m.lastYearAmount > 0 ? ((m.amount - m.lastYearAmount) / m.lastYearAmount) * 100 : 0
            const pct = monthTotal > 0 ? (m.amount / monthTotal) * 100 : 0
            return [
              `${m.month} 月`,
              m.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
              m.lastYearAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
              `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`,
              String(m.count),
              `${pct.toFixed(1)}%`,
            ]
          })}
          footer={['合计', scope.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }), scope.last.toLocaleString('zh-CN', { minimumFractionDigits: 2 }), `${yoyPct >= 0 ? '+' : ''}${yoyPct.toFixed(1)}%`, String(scope.count), '100.0%']}
        />
      </PrintSection>

      {/* === 三、费用类别构成 === */}
      <PrintSection title="三、费用类别构成" index={3}>
        <PrintTable
          headers={['费用类别', '金额(¥)', '单数', '占比']}
          rows={cats.map((c) => {
            const total = cats.reduce((s, x) => s + x.amount, 0)
            return [
              CATEGORY_LABEL[c.cat],
              c.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
              String(c.count),
              `${total > 0 ? ((c.amount / total) * 100).toFixed(1) : '0.0'}%`,
            ]
          })}
          footer={['合计', cats.reduce((s, c) => s + c.amount, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }), String(cats.reduce((s, c) => s + c.count, 0)), '100.0%']}
        />
        <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0' }}>
          主导费用类别为「{CATEGORY_LABEL[cats[0]?.cat || 'other']}」（占比 {cats.length > 0 && cats.reduce((s, c) => s + c.amount, 0) > 0 ? ((cats[0].amount / cats.reduce((s, c) => s + c.amount, 0)) * 100).toFixed(1) : '0.0'}%），建议结合业务情况评估合理性。
        </p>
      </PrintSection>

      {/* === 四、部门费用对比 === */}
      <PrintSection title="四、部门费用对比" index={4}>
        <PrintTable
          headers={['排名', '部门', '金额(¥)', '单数', '占比']}
          rows={depts.map((d, i) => {
            const total = depts.reduce((s, x) => s + x.amount, 0)
            return [
              `#${i + 1}`,
              d.dept,
              d.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
              String(d.count),
              `${total > 0 ? ((d.amount / total) * 100).toFixed(1) : '0.0'}%`,
            ]
          })}
          footer={['合计', '—', depts.reduce((s, d) => s + d.amount, 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 }), String(depts.reduce((s, d) => s + d.count, 0)), '100.0%']}
        />
      </PrintSection>

      {/* === 五、员工 TOP10 排行 === */}
      <PrintSection title="五、员工费用报销 TOP10 排行" index={5} pageBreak>
        <PrintTable
          headers={['排名', '姓名', '部门', '累计金额(¥)', '单数', '平均单笔(¥)', '同比', '主费用类别']}
          rows={topEmployees.map((e) => [
            `#${e.rank}`,
            e.name,
            e.dept,
            e.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
            String(e.count),
            e.avgAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
            `${e.yoy >= 0 ? '+' : ''}${e.yoy.toFixed(1)}%`,
            CATEGORY_LABEL[e.topCategory],
          ])}
        />
        <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0' }}>
          入榜门槛 ¥{topEmployees.length > 0 ? topEmployees[topEmployees.length - 1].amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '0'}。
          建议关注排名靠前且同比涨幅较大的员工报销明细，防范异常支出。
        </p>
      </PrintSection>

      {/* === 六、预算执行情况 === */}
      <PrintSection title="六、预算执行情况" index={6}>
        {budgetControl?.enabled && budgetSummary ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <PrintKpiBox label="预算总额" value={'¥' + fmt(budgetSummary.totalBudget)} color="#64748b" />
              <PrintKpiBox label="已使用" value={'¥' + fmt(budgetSummary.totalUsed)} color="#f59e0b" />
              <PrintKpiBox label="剩余可用" value={'¥' + fmt(budgetSummary.totalRemaining)} color="#10b981" />
              <PrintKpiBox label="总体执行率" value={`${(budgetSummary.overallRate * 100).toFixed(1)}%`} color={budgetSummary.overallRate >= 1 ? '#dc2626' : budgetSummary.overallRate >= 0.8 ? '#f59e0b' : '#10b981'} />
            </div>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: '12px 0 6px' }}>部门预算明细</h4>
            <PrintTable
              headers={['部门', '预算(¥)', '已用(¥)', '剩余(¥)', '执行率', '状态']}
              rows={budgetControl.departmentBudgets.map((d) => {
                const rate = d.amount > 0 ? d.usedAmount / d.amount : 0
                const level = utilizationLevel(rate)
                const statusMap = { safe: '健康', warning: '关注', danger: '紧张', exceeded: '超支' }
                return [
                  d.department,
                  d.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
                  d.usedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
                  (d.amount - d.usedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
                  `${(rate * 100).toFixed(1)}%`,
                  statusMap[level],
                ]
              })}
            />
            {budgetControl.projectBudgets.length > 0 && (
              <>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#334155', margin: '12px 0 6px' }}>项目预算明细</h4>
                <PrintTable
                  headers={['项目编号', '项目名称', '预算(¥)', '已用(¥)', '执行率', '状态']}
                  rows={budgetControl.projectBudgets.map((p) => {
                    const rate = p.amount > 0 ? p.usedAmount / p.amount : 0
                    const level = utilizationLevel(rate)
                    const statusMap = { safe: '健康', warning: '关注', danger: '紧张', exceeded: '超支' }
                    return [
                      p.projectCode,
                      p.projectName,
                      p.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
                      p.usedAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }),
                      `${(rate * 100).toFixed(1)}%`,
                      statusMap[level],
                    ]
                  })}
                />
              </>
            )}
          </>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
            预算控制未启用，无预算执行数据。请在「系统设置 → 费用标准与预算」中开启预算控制并配置部门/项目预算。
          </div>
        )}
      </PrintSection>

      {/* === 七、异常预警 === */}
      <PrintSection title="七、异常预警" index={7} pageBreak>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
          <PrintKpiBox label="预警总数" value={String(anomalies.length)} color="#ef4444" />
          <PrintKpiBox label="高风险" value={String(highCount)} color="#dc2626" />
          <PrintKpiBox label="中风险" value={String(mediumCount)} color="#f59e0b" />
          <PrintKpiBox label="涉及金额" value={'¥' + fmt(anomalyAmount)} color="#64748b" />
        </div>
        {anomalies.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#10b981', fontSize: '13px', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
            ✓ 一切正常，本周期内未检测到异常预警
          </div>
        ) : (
          <PrintTable
            headers={['序号', '风险等级', '类型', '预警标题', '涉及金额(¥)', '来源', '发生时间']}
            rows={anomalies.map((a, i) => {
              const levelMap = { high: '高危', medium: '中危', low: '低危' }
              const typeMap = { duplicate_invoice: '发票查重', verify_failed: '验真失败', over_budget: '超预算', over_standard: '费用超标', large_amount: '大额复核' }
              return [
                String(i + 1),
                levelMap[a.level],
                typeMap[a.type],
                a.title,
                a.amount != null ? a.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) : '—',
                a.source,
                a.occurredAt.slice(0, 16).replace('T', ' '),
              ]
            })}
          />
        )}
        <p style={{ fontSize: '12px', color: '#64748b', margin: '8px 0 0' }}>
          {highCount > 0
            ? `⚠ 本周期检测到 ${highCount} 条高风险预警，建议财务立即介入处理。`
            : mediumCount > 0
            ? `本周期有 ${mediumCount} 条中风险预警，建议主管在审批时重点关注。`
            : '本周期预警均为低风险，可按常规流程处理。'}
        </p>
      </PrintSection>

      {/* === 报告页脚 === */}
      <div style={{ marginTop: '30px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
        本报告由智报销系统自动生成 · 仅供内部财务分析使用 · 请妥善保管
      </div>
    </div>
  )
}

/** 打印小节标题 */
function PrintSection(props: { title: string; index: number; children: React.ReactNode; pageBreak?: boolean }) {
  return (
    <section className="print-avoid-break" style={{ marginTop: '24px', pageBreakBefore: props.pageBreak ? 'always' : 'auto' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', margin: '0 0 12px', paddingBottom: '6px', borderBottom: '2px solid #e2e8f0' }}>
        {props.title}
      </h2>
      {props.children}
    </section>
  )
}

/** 打印 KPI 小方框 */
function PrintKpiBox(props: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
      <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{props.label}</div>
      <div style={{ fontSize: '18px', fontWeight: 700, color: props.color }}>{props.value}</div>
      {props.sub && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{props.sub}</div>}
    </div>
  )
}

/** 打印表格 */
function PrintTable(props: { headers: string[]; rows: string[][]; footer?: string[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead>
        <tr>
          {props.headers.map((h, i) => (
            <th key={i} style={{ textAlign: i === 0 || i === props.headers.length - 1 ? 'left' : 'right', padding: '8px 10px', background: '#f1f5f9', color: '#334155', fontWeight: 600, borderBottom: '2px solid #cbd5e1' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row, ri) => (
          <tr key={ri} style={{ pageBreakInside: 'avoid' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ textAlign: ci === 0 || ci === row.length - 1 ? 'left' : 'right', padding: '6px 10px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {props.footer && (
        <tfoot>
          <tr>
            {props.footer.map((cell, ci) => (
              <td key={ci} style={{ textAlign: ci === 0 || ci === props.footer.length - 1 ? 'left' : 'right', padding: '8px 10px', fontWeight: 700, color: '#0f172a', borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                {cell}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}
