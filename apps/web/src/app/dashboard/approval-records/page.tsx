'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ListChecks,
  Search,
  Filter,
  ChevronRight,
  Clock4,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCcw,
  FileX2,
  Eye,
  ArrowRightLeft,
  BadgePlus,
  ArrowLeft,
  Calendar,
  CircleDollarSign,
} from 'lucide-react'
import { CATEGORY_LABEL, type ExpenseCategory } from '@/lib/api'

type ReimburseStatus = 'pending' | 'approved' | 'rejected' | 'draft' | 'revoked'
type Tab = 'mine' | 'participated'
type ActionTaken = 'approved' | 'rejected' | 'added_approver' | 'transferred'

interface BaseItem {
  id: string
  code: string
  title: string
  type: 'travel' | 'purchase' | 'daily' | 'conference' | 'training'
  category: ExpenseCategory
  amount: number
  invoiceCount: number
  createdAt: string
}
interface MineRow extends BaseItem {
  tab: 'mine'
  status: ReimburseStatus
  submittedAt: string
  currentApprover: string
  currentStep: number
  totalSteps: number
  updatedAt: string
}
interface ParticipatedRow extends BaseItem {
  tab: 'participated'
  applicant: string
  applicantDept: string
  finalStatus: ReimburseStatus
  myLastActionAt: string
  myLastAction: ActionTaken
  myRole: string // 第几节点审批人
}
type Row = MineRow | ParticipatedRow

const TYPES: Record<MineRow['type'], string> = {
  travel: '差旅报销',
  purchase: '采购报销',
  daily: '日常费用',
  conference: '会议报销',
  training: '培训报销',
}

const STATUS_LABEL: Record<ReimburseStatus, string> = {
  pending: '审批中',
  approved: '已通过',
  rejected: '已驳回',
  draft: '草稿',
  revoked: '已撤销',
}
function StatusBadge({ s }: { s: ReimburseStatus }) {
  const cfg: Record<ReimburseStatus, { cls: string; icon: React.ReactNode }> = {
    pending: {
      cls: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50',
      icon: <Clock4 className="w-3 h-3 animate-spin-slow" />,
    },
    approved: {
      cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    rejected: {
      cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200/60 dark:border-red-800/50',
      icon: <XCircle className="w-3 h-3" />,
    },
    draft: {
      cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      icon: <FileText className="w-3 h-3" />,
    },
    revoked: {
      cls: 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200/60 dark:border-violet-800/50',
      icon: <RefreshCcw className="w-3 h-3" />,
    },
  }
  const c = cfg[s]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
      {c.icon}
      {STATUS_LABEL[s]}
    </span>
  )
}
function ActionBadge({ a }: { a: ActionTaken }) {
  const map: Record<ActionTaken, { label: string; cls: string; icon: React.ReactNode }> = {
    approved: {
      label: '我已同意',
      cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/60',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    rejected: {
      label: '我已驳回',
      cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-redald-300 border-red-200/60',
      icon: <XCircle className="w-3 h-3" />,
    },
    added_approver: {
      label: '我有加签',
      cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200/60',
      icon: <BadgePlus className="w-3 h-3" />,
    },
    transferred: {
      label: '我已转办',
      cls: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200/60',
      icon: <ArrowRightLeft className="w-3 h-3" />,
    },
  }
  const c = map[a]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  )
}
const STATUS_OPTIONS: Array<{ value: 'all' | ReimburseStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '审批中' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'draft', label: '草稿' },
  { value: 'revoked', label: '已撤销' },
]
const TYPE_OPTIONS: Array<{ value: 'all' | MineRow['type']; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'daily', label: '日常费用' },
  { value: 'travel', label: '差旅报销' },
  { value: 'purchase', label: '采购报销' },
  { value: 'conference', label: '会议报销' },
  { value: 'training', label: '培训报销' },
]

const APPLICANTS = ['张伟', '王芳', '李娜', '刘洋', '陈静', '赵磊', '黄敏']
const DEPTS = ['研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部']
const APPROVERS = ['财务（孙丽）', '部门主管（周杰）', '总经理（吴强）', '行政（郑凯）']

// 固定锚点，避免 SSR/客户端 new Date() 不一致引发 hydrate error
const ANCHOR_ISO = '2026-08-08T00:00:00Z'
function daysAgoDeterministic(n: number, minuteOffset = 0): string {
  const base = new Date(ANCHOR_ISO)
  base.setUTCDate(base.getUTCDate() - n)
  base.setUTCHours(9 + (n % 7), (n * 11 + minuteOffset) % 60, 0, 0)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${base.getUTCFullYear()}-${p(base.getUTCMonth() + 1)}-${p(base.getUTCDate())} ${p(base.getUTCHours())}:${p(base.getUTCMinutes())}`
}

function pickFrom<T>(arr: readonly T[], seed: number): T {
  return arr[((seed % arr.length) + arr.length) % arr.length]
}

function makeMockData(): Row[] {
  const TYPE_POOL_A: readonly MineRow['type'][] = ['daily', 'travel', 'purchase', 'daily', 'conference', 'training']
  const mineList: MineRow[] = Array.from({ length: 18 }).map((_, i) => {
    const statusRand = i % 7
    const status: ReimburseStatus =
      statusRand === 0 ? 'pending'
      : statusRand === 1 ? 'approved'
      : statusRand === 2 ? 'approved'
      : statusRand === 3 ? 'rejected'
      : statusRand === 4 ? 'draft'
      : statusRand === 5 ? 'revoked'
      : 'approved'
    const totalSteps = 3
    const currentStep =
      status === 'draft' ? 0
      : status === 'approved' ? totalSteps
      : status === 'rejected' ? 1 + (i % 2)
      : status === 'revoked' ? 1
      : 1 + (i % 2)
    return {
      tab: 'mine',
      id: 'BX' + (20240001 + i),
      code: 'BX-' + (20240001 + i),
      title: [
        '2024 年 Q3 北京客户拜访差旅',
        '打印机耗材采购报销单',
        '月度团队建设聚餐报销',
        '上海行业峰会差旅报销',
        '新员工电脑采购报销',
        '季度财务培训费',
        '办公用品（7月批次）',
      ][i % 7] + ` #${i + 1}`,
      type: pickFrom(TYPE_POOL_A, i * 5 + 2),
      category: (['travel', 'meal', 'office', 'transport', 'other'] as const)[i % 5],
      amount: +(120 + i * 183.47).toFixed(2),
      invoiceCount: 1 + (i % 4),
      createdAt: daysAgoDeterministic(i * 3 + 1, 0),
      status,
      submittedAt: status === 'draft' ? '' : daysAgoDeterministic(i * 3, 2),
      currentApprover: APPROVERS[Math.max(0, currentStep - 1)] || '—',
      currentStep,
      totalSteps,
      updatedAt: daysAgoDeterministic(i, 3),
    }
  })
  const TYPE_POOL_B: readonly MineRow['type'][] = ['daily', 'travel', 'conference', 'training']
  const participated: ParticipatedRow[] = Array.from({ length: 12 }).map((_, i) => {
    const a: ActionTaken =
      i % 4 === 0 ? 'rejected'
      : i % 4 === 1 ? 'added_approver'
      : i % 4 === 2 ? 'transferred'
      : 'approved'
    const finalStatus: ReimburseStatus =
      a === 'rejected' ? 'rejected'
      : a === 'transferred' ? 'pending'
      : i % 3 === 0 ? 'pending'
      : 'approved'
    return {
      tab: 'participated',
      id: 'BX' + (30240001 + i),
      code: 'BX-' + (30240001 + i),
      title: [
        '华东区销售月度招待费',
        '产品部 UI 设计工具年费',
        '公司年会场地预订',
        '员工季度体检费',
        '差旅机票 + 酒店费用',
      ][i % 5] + ` #${i + 1}`,
      type: pickFrom(TYPE_POOL_B, i * 3 + 1),
      category: (['meal', 'office', 'travel', 'training', 'entertainment'] as const)[i % 5],
      amount: +(300 + i * 427.11).toFixed(2),
      invoiceCount: 2 + (i % 3),
      createdAt: daysAgoDeterministic(i * 5 + 2, 5),
      applicant: APPLICANTS[i % APPLICANTS.length],
      applicantDept: DEPTS[i % DEPTS.length],
      finalStatus,
      myLastActionAt: daysAgoDeterministic(i * 3 + 1, 7),
      myLastAction: a,
      myRole: ['第 1 级（部门主管）', '第 2 级（财务）', '第 3 级（总经理）'][i % 3],
    }
  })
  return [...mineList, ...participated]
}

export default function ApprovalRecordsPage() {
  const [tab, setTab] = useState<Tab>('mine')
  const [rows] = useState<Row[]>(() => makeMockData())

  const mineRows = rows.filter((r): r is MineRow => r.tab === 'mine')
  const partRows = rows.filter((r): r is ParticipatedRow => r.tab === 'participated')
  const curr = tab === 'mine' ? mineRows : partRows

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | ReimburseStatus>('all')
  const [type, setType] = useState<'all' | MineRow['type']>('all')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const mineKpi = useMemo(() => {
    const s = mineRows
    const total = s.length
    const pending = s.filter((r) => r.status === 'pending').length
    const passed = s.filter((r) => r.status === 'approved').length
    const amount = s.filter((r) => r.status === 'approved').reduce((sum, r) => sum + r.amount, 0)
    return { total, pending, passed, amount }
  }, [mineRows])

  const partKpi = useMemo(() => {
    const s = partRows
    const total = s.length
    const approved = s.filter((r) => r.myLastAction === 'approved').length
    const rejected = s.filter((r) => r.myLastAction === 'rejected').length
    const touchedAmount = s.filter((r) => r.finalStatus === 'approved').reduce((sum, r) => sum + r.amount, 0)
    return { total, approved, rejected, touchedAmount }
  }, [partRows])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    const s = start ? new Date(start).getTime() : 0
    const e = end ? new Date(end + ' 23:59:59').getTime() : Infinity
    return curr.filter((r) => {
      if (status !== 'all') {
        if (r.tab === 'mine' && r.status !== status) return false
        if (r.tab === 'participated' && r.finalStatus !== status) return false
      }
      if (type !== 'all' && r.type !== type) return false
      const dt = new Date(r.createdAt).getTime()
      if (dt < s || dt > e) return false
      if (!kw) return true
      return (
        r.code.toLowerCase().includes(kw) ||
        r.title.toLowerCase().includes(kw) ||
        String(r.amount).includes(kw) ||
        (r.tab === 'participated' && (r.applicant.toLowerCase().includes(kw) || r.applicantDept.includes(kw)))
      )
    })
  }, [curr, search, status, type, start, end])

  const statsLabel = tab === 'mine'
    ? { t1: '我发起的单据', t2: '审批中', t3: '已通过', t4: '累计报销金额(¥)' }
    : { t1: '我参与审批', t2: '我同意', t3: '我驳回', t4: '通过累计金额(¥)' }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <ListChecks className="w-5 h-5 text-white" />
            </div>
            审批记录
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            全面查看你发起的报销单历史，以及你作为审批人参与过的所有单据流水
          </p>
        </div>
        <Link
          href="/dashboard/reimbursements/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/20"
        >
          <FileText className="w-4 h-4" />
          发起新报销
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label={statsLabel.t1} value={tab === 'mine' ? mineKpi.total : partKpi.total} tone="sky" icon={<ListChecks className="w-4 h-4" />} />
        <Kpi label={statsLabel.t2} value={tab === 'mine' ? mineKpi.pending : partKpi.approved} tone={tab === 'mine' ? 'amber' : 'emerald'} icon={<Clock4 className="w-4 h-4" />} />
        <Kpi label={statsLabel.t3} value={tab === 'mine' ? mineKpi.passed : partKpi.rejected} tone={tab === 'mine' ? 'emerald' : 'red'} icon={<CheckCircle2 className="w-4 h-4" />} />
        <Kpi label={statsLabel.t4} value={(tab === 'mine' ? mineKpi.amount : partKpi.touchedAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tone="violet" icon={<CircleDollarSign className="w-4 h-4" />} />
      </div>

      {/* Tab */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-fit shadow-sm">
        {(
          [
            { v: 'mine' as Tab, label: '我申请的', count: mineRows.length },
            { v: 'participated' as Tab, label: '我审批过的', count: partRows.length },
          ]
        ).map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.v
                ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            {t.label}
            <span className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold ${
              tab === t.v ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* 过滤器 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索 单号 / 标题 / 金额 / 申请人"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 pr-1"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 pr-1"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 hidden sm:block" />
          <div className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="bg-transparent outline-none text-xs text-slate-600 dark:text-slate-300 px-1 max-w-[120px]"
            />
            <span className="text-slate-400 text-xs">至</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-transparent outline-none text-xs text-slate-600 dark:text-slate-300 px-1 max-w-[120px]"
            />
          </div>
        </div>
        <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          匹配到 <b className="text-slate-700 dark:text-slate-200">{filtered.length}</b> 条记录
        </div>
      </div>

      {/* 列表（卡片流，移动端友好） */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-16 text-center shadow-sm border-dashed">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
              <FileX2 className="w-7 h-7" />
            </div>
            <div className="text-slate-600 dark:text-slate-300 font-medium mb-1">暂无符合条件的审批记录</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              试试调整筛选条件，或点击右上角「发起新报销」创建一条新单据
            </div>
          </div>
        )}
        {filtered.map((r) => (
          <RecordCard key={r.id + r.tab} row={r} />
        ))}
      </div>
    </div>
  )
}

function RecordCard({ row }: { row: Row }) {
  if (row.tab === 'mine') return <MineCard r={row} />
  return <PartCard r={row} />
}

function MineCard({ r }: { r: MineRow }) {
  const stepPercent = Math.max(0, Math.min(100, (r.currentStep / r.totalSteps) * 100))
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Link
              href={`/dashboard/reimbursements/${r.id}`}
              className="text-base font-semibold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate"
            >
              {r.title}
            </Link>
            <StatusBadge s={r.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 font-mono">
              <FileText className="w-3 h-3" />
              {r.code}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              {TYPES[r.type]} · {CATEGORY_LABEL[r.category]}
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1"><FileX2 className="w-3 h-3" />{r.invoiceCount} 张发票</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">提交 {r.submittedAt || '（草稿未提交）'}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            ¥{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">更新 {r.updatedAt.slice(5, 16)}</div>
        </div>
      </div>
      {/* 底部：审批进度条 + 当前处理人 + 操作 */}
      <div className="px-5 py-3 bg-slate-50/60 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-[280px] flex-1 max-w-lg">
          {r.status === 'draft' || r.status === 'revoked' || r.status === 'rejected' ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              {r.status === 'draft' && <FileText className="w-3.5 h-3.5 text-slate-500" />}
              {r.status === 'revoked' && <RefreshCcw className="w-3.5 h-3.5 text-violet-500" />}
              {r.status === 'rejected' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
              <span>
                {r.status === 'draft'
                  ? '尚未提交审批，可继续编辑或删除草稿'
                  : r.status === 'revoked'
                  ? '发起人已撤销此单据'
                  : `被驳回于 ${r.updatedAt.slice(5, 16)}，可修改后重新提交`}
              </span>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>审批进度 · 当前节点：<b className="text-slate-700 dark:text-slate-200">{r.currentApprover}</b></span>
                <span className="tabular-nums">{r.currentStep} / {r.totalSteps}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-500 transition-all"
                  style={{ width: stepPercent + '%' }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={r.status === 'draft' ? '/dashboard/reimbursements/new' : `/dashboard/reimbursements/${r.id}`}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {r.status === 'draft' ? (
              <>
                <ArrowLeft className="w-3.5 h-3.5" />
                继续编辑
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                查看详情
              </>
            )}
            <ChevronRight className="w-3 h-3 text-slate-400" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function PartCard({ r }: { r: ParticipatedRow }) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Link
              href={`/dashboard/reimbursements/${r.id}`}
              className="text-base font-semibold text-slate-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate"
            >
              {r.title}
            </Link>
            <StatusBadge s={r.finalStatus} />
            <ActionBadge a={r.myLastAction} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 font-mono">
              <FileText className="w-3 h-3" />{r.code}
            </span>
            <span>·</span>
            <span>
              发起人：<b className="text-slate-700 dark:text-slate-200">{r.applicant}</b>（{r.applicantDept}）
            </span>
            <span>·</span>
            <span>{TYPES[r.type]} · {CATEGORY_LABEL[r.category]}</span>
            <span>·</span>
            <span>发票 {r.invoiceCount} 张</span>
            <span>·</span>
            <span className="text-brand-700 dark:text-brand-400 font-medium">{r.myRole}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            ¥{r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-slate-400 mt-1">申请 {r.createdAt.slice(5, 16)}</div>
          <div className="text-xs text-indigo-600 dark:text-indigo-300 mt-0.5">
            我的处理：{r.myLastActionAt.slice(5, 16)}
          </div>
        </div>
      </div>
      <div className="px-5 py-3 bg-slate-50/60 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
        <Link
          href={`/dashboard/reimbursements/${r.id}`}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/30"
        >
          <Eye className="w-3.5 h-3.5" />
          查看审批详情
          <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

function Kpi({
  label, value, tone, icon,
}: {
  label: string; value: number | string; tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'red'; icon: React.ReactNode;
}) {
  const m: Record<string, string> = {
    sky: 'from-sky-500 to-cyan-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    violet: 'from-violet-500 to-fuchsia-500',
    red: 'from-red-500 to-rose-500',
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${m[tone]} opacity-10`} />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white break-all">{value}</div>
        </div>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${m[tone]} text-white shadow`}>{icon}</div>
      </div>
    </div>
  )
}
