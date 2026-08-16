'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSubmittedStore, submittedToListItem } from '@/lib/submitted-store'
import { api, MOCK_MODE } from '@/lib/api'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Download,
  Calendar,
  User,
  MoreHorizontal,
  Eye,
  Trash2,
  Edit3,
  AlertCircle,
  X,
  SlidersHorizontal,
  ArrowUpDown,
} from 'lucide-react'
import {
  generateMockList,
  STATUS_META,
  TYPE_LABEL,
  type ReimbursementStatus,
  type ReimbursementListItem,
} from '@/lib/reimbursements'

const PAGE_SIZE = 8
const STATUS_TABS: Array<{ key: 'all' | ReimbursementStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'pending', label: '审批中' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'paid', label: '已付款' },
  { key: 'revoked', label: '已撤销' },
]

function StatusBadge({ status }: { status: ReimbursementStatus }) {
  const m = STATUS_META[status]
  const toneClass: Record<typeof m.tone, string> = {
    default: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    muted: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${toneClass[m.tone]}`}
    >
      {m.label}
    </span>
  )
}

export default function ReimbursementListPage() {
  const router = useRouter()
  const submittedList = useSubmittedStore((s) => s.list)
  const [apiList, setApiList] = useState<any[] | null>(null)
  useEffect(() => {
    if (MOCK_MODE) return
    api.listReimbursements({ pageSize: 200 }).then((res) => setApiList(res.list)).catch(() => setApiList([]))
  }, [])
  const allData = useMemo(() => {
    const local = submittedList.map(submittedToListItem)
    const base = apiList !== null ? apiList : generateMockList(72)
    return [...local, ...base]
  }, [submittedList, apiList])

  const [activeTab, setActiveTab] = useState<typeof STATUS_TABS[number]['key']>('all')
  const [search, setSearch] = useState('')
  const [type, setType] = useState<string>('all')
  const [dept, setDept] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [sortKey, setSortKey] = useState<'createdAt' | 'amount' | 'updatedAt'>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [bulkSelection, setBulkSelection] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)

  // --- 筛选 ---
  const filtered = useMemo(() => {
    let rows = allData
    if (activeTab !== 'all') rows = rows.filter((r) => r.status === activeTab)
    if (type !== 'all') rows = rows.filter((r) => r.type === type)
    if (dept !== 'all') rows = rows.filter((r) => r.department === dept)
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.code.toLowerCase().includes(kw) ||
          r.title.toLowerCase().includes(kw) ||
          r.submitter.toLowerCase().includes(kw) ||
          r.approver.toLowerCase().includes(kw)
      )
    }
    if (dateFrom) rows = rows.filter((r) => r.createdAt >= dateFrom)
    if (dateTo) rows = rows.filter((r) => r.createdAt <= dateTo)
    const min = amountMin === '' ? -Infinity : Number(amountMin) || 0
    const max = amountMax === '' ? Infinity : Number(amountMax) || Infinity
    rows = rows.filter((r) => r.amount >= min && r.amount <= max)

    rows = [...rows].sort((a, b) => {
      const va: any = a[sortKey]
      const vb: any = b[sortKey]
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'desc' ? -cmp : cmp
    })
    return rows
  }, [allData, activeTab, search, type, dept, dateFrom, dateTo, amountMin, amountMax, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pagedData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // 统计
  const stats = useMemo(() => {
    const base: Record<ReimbursementStatus, number> = {
      draft: 0, pending: 0, approved: 0, rejected: 0, paid: 0, revoked: 0,
    }
    let total = 0
    let pendingAmount = 0
    allData.forEach((r) => {
      base[r.status] += 1
      total += r.amount
      if (r.status === 'pending') pendingAmount += r.amount
    })
    return { base, total, pendingAmount, count: allData.length }
  }, [allData])

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const toggleBulk = (id: string) => {
    setBulkSelection((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allPagedSelected =
    pagedData.length > 0 && pagedData.every((r) => bulkSelection.has(r.id))
  const togglePagedAll = () => {
    setBulkSelection((prev) => {
      const next = new Set(prev)
      if (allPagedSelected) pagedData.forEach((r) => next.delete(r.id))
      else pagedData.forEach((r) => next.add(r.id))
      return next
    })
  }

  const typeOptions = Object.entries(TYPE_LABEL)
  const deptOptions = ['研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部', '行政部']

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* 顶部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">我的报销</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            查看所有报销单的实时状态，支持按状态、日期、金额多维筛选
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl border transition-colors ${
              showFilter
                ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            高级筛选
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" />
            导出
          </button>
          <Link
            href="/dashboard/reimbursements/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            新建报销单
          </Link>
        </div>
      </div>

      {/* 数据概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <Metric label="报销单总数" value={stats.count.toString()} hint="所有类型合计" />
        <Metric
          label="审批中"
          value={stats.base.pending.toString()}
          hint={`¥${stats.pendingAmount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}待处理`}
          tone="warn"
        />
        <Metric label="已通过" value={stats.base.approved.toString()} hint="本周期累计" tone="success" />
        <Metric label="已付款" value={stats.base.paid.toString()} hint={`¥${stats.total.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`} tone="info" />
      </div>

      {/* 搜索 + 状态 Tab */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索单号 / 标题 / 提交人 / 审批人"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto sm:overflow-visible">
            {STATUS_TABS.map((t) => {
              const count = t.key === 'all' ? stats.count : stats.base[t.key as ReimbursementStatus]
              const active = activeTab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => { setActiveTab(t.key); setPage(1) }}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-colors ${
                    active
                      ? 'text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/20'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800'
                  }`}
                >
                  {t.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${active ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 高级筛选 */}
        {showFilter && (
          <div className="px-4 sm:px-5 py-4 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <Field label="报销类型">
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">全部</option>
                {typeOptions.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="所属部门">
              <select
                value={dept}
                onChange={(e) => { setDept(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">全部</option>
                {deptOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="开始日期">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
            <Field label="结束日期">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
            <Field label="最小金额（元）">
              <input
                type="number"
                value={amountMin}
                onChange={(e) => { setAmountMin(e.target.value); setPage(1) }}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
            <Field label="最大金额（元）">
              <input
                type="number"
                value={amountMax}
                onChange={(e) => { setAmountMax(e.target.value); setPage(1) }}
                placeholder="不限"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </Field>
            <div className="sm:col-span-2 lg:col-span-6 flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => {
                  setType('all'); setDept('all'); setDateFrom(''); setDateTo('')
                  setAmountMin(''); setAmountMax(''); setSearch(''); setPage(1)
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" /> 重置筛选
              </button>
            </div>
          </div>
        )}

        {/* 批量操作条 */}
        {bulkSelection.size > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-brand-50/60 dark:bg-brand-900/10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              已选择 <span className="font-semibold text-brand-600 dark:text-brand-400">{bulkSelection.size}</span> 张报销单
            </p>
            <div className="flex items-center gap-2">
              <BulkActionBtn>批量导出</BulkActionBtn>
              <BulkActionBtn>批量打印</BulkActionBtn>
              <BulkActionBtn danger>批量删除草稿</BulkActionBtn>
              <button
                onClick={() => setBulkSelection(new Set())}
                className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 列表表格 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-400">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allPagedSelected}
                    onChange={togglePagedAll}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600"
                  />
                </th>
                <th className="text-left font-medium">
                  <SortHead label="单号 / 标题" active={sortKey === 'createdAt'} dir={sortDir} onClick={() => toggleSort('createdAt')} />
                </th>
                <th className="text-left font-medium px-3 py-3">类型</th>
                <th className="text-left font-medium px-3 py-3">部门 / 提交人</th>
                <th className="text-left font-medium">
                  <SortHead label="金额" active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')} />
                </th>
                <th className="text-left font-medium px-3 py-3">当前审批人</th>
                <th className="text-left font-medium px-3 py-3">状态</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedData.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-20 text-center">
                    <EmptyState onClear={() => { setActiveTab('all'); setSearch(''); setShowFilter(false) }} />
                  </td>
                </tr>
              )}
              {pagedData.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/dashboard/reimbursements/${r.id}`)}
                  className="group hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={bulkSelection.has(r.id)}
                      onChange={() => toggleBulk(r.id)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600"
                    />
                  </td>
                  <td className="px-2 py-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{r.code}</span>
                      </p>
                      <p className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-sm">
                        {r.title}
                      </p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" /> {r.createdAt} · {r.items.length} 项明细
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md">
                      {TYPE_LABEL[r.type] || '其他'}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-2 min-w-[140px]">
                      <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {r.submitter.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {r.submitter}
                        </p>
                        <p className="text-xs text-slate-400">{r.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4">
                    <p className="font-bold text-slate-900 dark:text-white">
                      ¥ {r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </p>
                  </td>
                  <td className="px-3 py-4 min-w-[130px]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 flex items-center justify-center text-[11px] font-semibold">
                        {r.approver.slice(0, 1)}
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-300">{r.approver}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-4 pr-4" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {menuFor === r.id && (
                        <RowActions
                          row={r}
                          onClose={() => setMenuFor(null)}
                          onOpen={() => router.push(`/dashboard/reimbursements/${r.id}`)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            共 <span className="font-medium text-slate-700 dark:text-slate-200">{filtered.length}</span> 条，
            第 <span className="font-medium text-slate-700 dark:text-slate-200">{safePage}</span> / {pageCount} 页
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {renderPages(safePage, pageCount).map((pn, i) =>
              pn === '...' ? (
                <span key={`e${i}`} className="px-2 text-sm text-slate-400">
                  ···
                </span>
              ) : (
                <button
                  key={pn}
                  onClick={() => setPage(pn as number)}
                  className={`min-w-[36px] h-9 px-2 text-sm font-medium rounded-lg ${
                    pn === safePage
                      ? 'text-white bg-brand-600 shadow shadow-brand-600/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {pn}
                </button>
              )
            )}
            <button
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) pages.push('...')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('...')
  pages.push(total)
  return pages
}

// === 小组件 ===
function Metric({
  label, value, hint, tone,
}: { label: string; value: string; hint?: string; tone?: 'warn' | 'success' | 'info' }) {
  const toneColor =
    tone === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'success'
      ? 'text-green-600 dark:text-green-400'
      : tone === 'info'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-slate-900 dark:text-white'
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl sm:text-3xl font-bold ${toneColor}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function SortHead({
  label, active, dir, onClick,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-3 py-3 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 transition-colors ${active ? 'text-brand-600 dark:text-brand-400' : ''}`} />
      {active && (
        <span className="text-[10px] text-brand-600 dark:text-brand-400">{dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )
}

function BulkActionBtn({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
        danger
          ? 'text-red-600 border-red-200 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20'
          : 'text-slate-700 border-slate-200 bg-white hover:bg-slate-50 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function RowActions({
  row, onClose, onOpen,
}: { row: ReimbursementListItem; onClose: () => void; onOpen: () => void }) {
  const canModify = row.status === 'draft' || row.status === 'revoked'
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 mt-1 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl py-1.5 z-20 text-sm">
        <ItemBtn onClick={onOpen} icon={<Eye className="w-4 h-4" />}>查看详情</ItemBtn>
        {canModify && (
          <ItemBtn onClick={onClose} icon={<Edit3 className="w-4 h-4" />}>继续编辑</ItemBtn>
        )}
        {row.status === 'pending' && (
          <ItemBtn onClick={onClose} icon={<AlertCircle className="w-4 h-4" />} danger>
            撤销申请
          </ItemBtn>
        )}
        <ItemBtn onClick={onClose} icon={<Download className="w-4 h-4" />}>导出 PDF</ItemBtn>
        {canModify && (
          <ItemBtn onClick={onClose} icon={<Trash2 className="w-4 h-4" />} danger>
            删除
          </ItemBtn>
        )}
      </div>
    </>
  )
}

function ItemBtn({
  children, onClick, icon, danger,
}: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
        danger
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20'
          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700/60'
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-slate-500 dark:text-slate-400 mb-3">没有找到符合条件的报销单</p>
      <button
        onClick={onClear}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/30"
      >
        <Filter className="w-4 h-4" /> 清除所有筛选条件
      </button>
    </div>
  )
}
