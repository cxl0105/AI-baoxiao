'use client'

import React, { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/api'

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
  const [year, setYear] = useState<number>(2024)
  const [quarter, setQuarter] = useState<(typeof QUARTERS)[number]['value']>('all')
  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set())
  const [catFilter, setCatFilter] = useState<Set<string>>(new Set())

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

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          统计分析
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          报销金额趋势、费用构成、部门对比，多维视图帮你掌握公司支出全貌与变化
        </p>
      </div>

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
    </div>
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
