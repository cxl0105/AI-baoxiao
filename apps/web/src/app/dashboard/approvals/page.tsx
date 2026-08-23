'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSubmittedStore, submittedToListItem } from '@/lib/submitted-store'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  Send,
  Clock,
  Search,
  Download,
  AlertTriangle,
  ArrowUpDown,
  Calendar,
  Building2,
  User,
  Filter,
  ChevronRight,
  Check,
  AlertCircle,
  X,
  Eye,
} from 'lucide-react'
import {
  generatePendingApproval,
  STATUS_META,
  TYPE_LABEL,
  type ReimbursementStatus,
} from '@/lib/reimbursements'
import { api, formatApiError, type ExpenseCategory } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { hasPermission, ROLES, type Role } from '@/lib/rbac'
import { ShieldCheck, Lock, ShieldAlert } from 'lucide-react'

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: '差旅住宿', transport: '交通出行', meal: '餐饮',
  office: '办公用品', communication: '通讯', entertainment: '招待/客户',
  training: '培训', other: '其他',
}

const fmtDateTime = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return String(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const isUrgent = (iso?: string) => {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (isNaN(t)) return false
  return Date.now() - t > 48 * 3600 * 1000
}

type ApprovalSort = 'time' | 'amount' | 'step'
type ApprovalFilter = 'all' | 'urgent' | 'first' | 'last'

const PAGE_SIZE = 10

type PendingRow = ReturnType<typeof generatePendingApproval>[number]

export default function PendingApprovalPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const role = (user?.role as Role) || 'employee'
  const roleInfo = ROLES[role] || ROLES.employee
  const submittedList = useSubmittedStore((s) => s.list)
  const [apiList, setApiList] = useState<any[]>([])
  useEffect(() => {
    if (!mounted) return
    let cancelled = false
    api
      .listReimbursements({ status: 'pending', pageSize: 200 })
      .then((res) => { if (!cancelled) setApiList(res.list || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mounted])

  const refreshList = async () => {
    try {
      const res = await api.listReimbursements({ status: 'pending', pageSize: 200 })
      setApiList(res.list || [])
    } catch {
      /* ignore */
    }
  }

  const all = useMemo(() => {
    const apiRows = apiList.map((r) => {
      const nodes: Array<{ actor: string; action: string; role?: string }> = r.approvalFlow?.nodes || []
      const totalSteps = nodes.length || 3
      const doneSteps = nodes.filter((n) => n.action === 'approve').length
      // 当前用户角色是否还有对应 pending 节点可批
      const myRole = role
      const canAct = nodes.some(
        (n) =>
          n.action === 'pending' &&
          (n.role === myRole || (n.role === 'gm' && (myRole === 'gm' || myRole === 'admin')))
      )
      return {
        ...r,
        submittedAt: fmtDateTime(r.createdAt),
        urgent: isUrgent(r.createdAt),
        currentStep: doneSteps,
        totalSteps,
        canAct,
      }
    })
    const submitted = submittedList
      .filter((x) => x.status === 'pending')
      .map((x) => ({
        ...submittedToListItem(x),
        submittedAt: x.createdAt,
        urgent: false,
        currentStep: 1,
        totalSteps: 3,
      }))
    const merged = [...submitted, ...apiRows]
    const seen = new Set<string>()
    return merged.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
  }, [submittedList, apiList])

  // --- 权限拦截：员工无权访问审批页 ---
  const canViewApprovals = hasPermission(role, 'approval:view')
  const canApprove = hasPermission(role, 'approval:approve')
  // 终审权限：仅管理员
  const canFinalApprove = role === 'admin'

  const [filter, setFilter] = useState<ApprovalFilter>('all')
  const [type, setType] = useState('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<ApprovalSort>('time')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'batch-approve' | 'batch-reject'>(null)
  const [singleRejectId, setSingleRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [delegateFor, setDelegateFor] = useState<string | 'batch' | null>(null)
  const [delegateTo, setDelegateTo] = useState('')

  const avatarColors = [
    'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
    'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300',
    'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
  ]

  // --- 过滤 ---
  const filtered = useMemo(() => {
    let rows = all
    if (filter === 'urgent') rows = rows.filter((r) => r.urgent)
    if (filter === 'first') rows = rows.filter((r) => r.currentStep === 1)
    if (filter === 'last') rows = rows.filter((r) => r.currentStep === r.totalSteps)
    if (type !== 'all') rows = rows.filter((r) => r.type === type)
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      rows = rows.filter(
        (r) =>
          r.code.toLowerCase().includes(kw) ||
          r.title.toLowerCase().includes(kw) ||
          r.submitter.toLowerCase().includes(kw)
      )
    }
    rows = [...rows].sort((a, b) => {
      const va = sortKey === 'time' ? a.submittedAt : sortKey === 'amount' ? a.amount : a.currentStep
      const vb = sortKey === 'time' ? b.submittedAt : sortKey === 'amount' ? b.amount : b.currentStep
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sortDir === 'desc' ? -cmp : cmp
    })
    return rows
  }, [all, filter, type, search, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const toggleSort = (k: ApprovalSort) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k); setSortDir('desc')
    }
  }

  // --- 统计 ---
  const stats = useMemo(() => {
    const total = all.length
    const urgent = all.filter((x) => x.urgent).length
    const totalAmount = all.reduce((s, x) => s + x.amount, 0)
    const overdue = Math.floor(total * 0.18)
    return { total, urgent, totalAmount, overdue }
  }, [all])

  // --- 操作 ---
  const showToast = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 2600)
  }
  const singleApprove = (row: PendingRow) => {
    setSelection((s) => new Set(s).add(row.id))
    void batchApprove([row.id])
  }
  const batchApprove = async (ids: string[] = Array.from(selection)) => {
    if (!ids.length) { showToast('请先勾选要批量同意的报销单'); return }
    setBusy('batch-approve')
    try {
      await Promise.all(ids.map((id) => api.approveReimbursement(id)))
      showToast(`已同意 ${ids.length} 张报销单`)
      setSelection(new Set())
      await refreshList()
    } catch (e) {
      showToast('审批失败：' + formatApiError(e))
    } finally {
      setBusy(null)
    }
  }
  const batchReject = async () => {
    if (!selection.size) { showToast('请先勾选要批量驳回的报销单'); return }
    if (!rejectReason.trim()) { showToast('请先填写驳回原因'); return }
    setBusy('batch-reject')
    try {
      await Promise.all(Array.from(selection).map((id) => api.rejectReimbursement(id, rejectReason.trim())))
      showToast(`已驳回 ${selection.size} 张报销单：${rejectReason.trim()}`)
      setSelection(new Set())
      setRejectReason('')
      await refreshList()
    } catch (e) {
      showToast('驳回失败：' + formatApiError(e))
    } finally {
      setBusy(null)
      setSingleRejectId(null)
    }
  }
  const singleRejectConfirm = async () => {
    if (!rejectReason.trim()) { showToast('请先填写驳回原因'); return }
    const id = singleRejectId
    if (!id || id === '__batch__') return
    setBusy('batch-reject')
    try {
      await api.rejectReimbursement(id, rejectReason.trim())
      setSingleRejectId(null)
      setRejectReason('')
      showToast('已驳回')
      await refreshList()
    } catch (e) {
      showToast('驳回失败：' + formatApiError(e))
    } finally {
      setBusy(null)
    }
  }
  const confirmDelegate = async () => {
    if (!delegateTo) { showToast('请选择要转交的审批人'); return }
    await new Promise((r) => setTimeout(r, 600))
    const target =
      delegateFor === 'batch'
        ? `批量 ${selection.size} 张`
        : all.find((x) => x.id === delegateFor)?.code || '选中报销单'
    setDelegateFor(null); setDelegateTo('')
    showToast(`已加签：${target} 转交 → ${delegateTo}`)
  }

  const toggleSelect = (id: string) => {
    setSelection((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const pagedAllSelected = paged.length > 0 && paged.every((r) => selection.has(r.id))
  const togglePage = () => {
    setSelection((s) => {
      const next = new Set(s)
      if (pagedAllSelected) paged.forEach((r) => next.delete(r.id))
      else paged.forEach((r) => next.add(r.id))
      return next
    })
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* === SSR 水合前 loading（避免服务端 user 为 null 误判为员工）=== */}
      {!mounted ? (
        <div className="flex items-center justify-center py-20">
          <Clock className="w-6 h-6 text-brand-500 animate-spin mr-2" />
          <span className="text-slate-500 dark:text-slate-400">加载审批中心...</span>
        </div>
      ) : !canViewApprovals ? (
        <NoPermissionPanel role={role} roleInfo={roleInfo} />
      ) : (
        <>
      {/* 顶部 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            待我审批
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                role === 'admin'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              }`}
            >
              {roleInfo.label}
            </span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {role === 'admin'
              ? '你拥有终审权限，可处理所有节点的审批单据'
              : '请及时处理待审批单据，超时将自动触发升级提醒'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" /> 导出审批记录
          </button>
          <button
            onClick={() => router.push('/dashboard/reimbursements/new')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-100 dark:bg-brand-900/20 dark:text-brand-300 dark:border-brand-800 transition-colors"
          >
            <Send className="w-4 h-4" /> 我也发起一笔
          </button>
        </div>
      </div>

      {/* 顶部统计 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="待审批总数" value={stats.total.toString()} hint="需要你处理" tone="default" />
        <StatCard label="加急" value={stats.urgent.toString()} hint="红色角标需优先" tone="danger" />
        <StatCard
          label="待审批金额"
          value={`¥${Math.floor(stats.totalAmount).toLocaleString('zh-CN')}`}
          hint="合计涉及"
          tone="warn"
        />
        <StatCard label="超时预警" value={stats.overdue.toString()} hint="> 48h 未处理" tone="info" />
      </div>

      {/* 主面板 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* 筛选 + 搜索 */}
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* 筛选 chips */}
            <div className="flex items-center gap-2 overflow-x-auto">
              <FilterChip active={filter === 'all'} onClick={() => { setFilter('all'); setPage(1) }} badge={stats.total}>全部</FilterChip>
              <FilterChip active={filter === 'urgent'} onClick={() => { setFilter('urgent'); setPage(1) }} tone="danger" badge={stats.urgent}>
                <AlertTriangle className="w-3.5 h-3.5" /> 加急
              </FilterChip>
              <FilterChip active={filter === 'first'} onClick={() => { setFilter('first'); setPage(1) }}>首审</FilterChip>
              <FilterChip active={filter === 'last'} onClick={() => { setFilter('last'); setPage(1) }}>终审</FilterChip>
            </div>

            <div className="flex-1 flex items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="搜索单号 / 标题 / 提交人"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
                />
              </div>
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); setPage(1) }}
                className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="all">全部类型</option>
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 排序 */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 flex items-center gap-1 mr-1"><ArrowUpDown className="w-3 h-3" /> 排序：</span>
              <SortBtn active={sortKey === 'time'} dir={sortDir} onClick={() => toggleSort('time')}>提交时间</SortBtn>
              <SortBtn active={sortKey === 'amount'} dir={sortDir} onClick={() => toggleSort('amount')}>金额</SortBtn>
              <SortBtn active={sortKey === 'step'} dir={sortDir} onClick={() => toggleSort('step')}>审批阶段</SortBtn>
            </div>
            <div className="text-xs text-slate-400">
              共 <span className="font-medium text-slate-600 dark:text-slate-200">{filtered.length}</span> 条待审批
            </div>
          </div>
        </div>

        {/* 批量操作栏 */}
        {selection.size > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-amber-50/70 dark:bg-amber-900/10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              已选择 <span className="font-semibold text-amber-600 dark:text-amber-400">{selection.size}</span> 张报销单
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void batchApprove()}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 shadow shadow-green-600/20 disabled:opacity-60"
              >
                {busy === 'batch-approve' ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                批量同意
              </button>
              <button
                onClick={() => { setDelegateFor('batch'); setDelegateTo('') }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Send className="w-4 h-4" /> 批量加签
              </button>
              <button
                onClick={() => { setSingleRejectId('__batch__') }}
                disabled={busy === 'batch-reject'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
              >
                {busy === 'batch-reject' ? <Clock className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                批量驳回
              </button>
              <button onClick={() => setSelection(new Set())} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                取消
              </button>
            </div>
          </div>
        )}

        {/* 卡片列表（移动端友好 + 桌面紧凑） */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* 表头（桌面） */}
          <div className="hidden md:grid grid-cols-[40px_1.2fr_1fr_1fr_1fr_0.9fr_1.3fr] items-center gap-3 px-4 sm:px-5 py-2.5 text-xs font-medium text-slate-400 bg-slate-50 dark:bg-slate-800/40">
            <div>
              <input
                type="checkbox"
                checked={pagedAllSelected}
                onChange={togglePage}
                className="w-4 h-4 rounded border-slate-300 text-brand-600"
              />
            </div>
            <div>报销单信息</div>
            <div>提交人 / 部门</div>
            <div>提交时间</div>
            <div>审批进度</div>
            <div className="text-right">金额</div>
            <div className="text-right pr-3">操作</div>
          </div>

          {paged.length === 0 && (
            <div className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8 text-green-300 dark:text-green-900" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 mb-3">太棒了，当前筛选下没有待审批单据</p>
              <button
                onClick={() => { setFilter('all'); setType('all'); setSearch('') }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-700 bg-brand-50 dark:bg-brand-900/20 rounded-lg"
              >
                <Filter className="w-4 h-4" /> 清空筛选
              </button>
            </div>
          )}

          {paged.map((r, i) => {
            const colorCls = avatarColors[i % avatarColors.length]
            return (
              <div
                key={r.id}
                className={`group relative px-4 sm:px-5 py-4 md:grid md:grid-cols-[40px_1.2fr_1fr_1fr_1fr_0.9fr_1.3fr] md:items-center md:gap-3 md:space-y-0 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                  r.urgent ? 'bg-red-50/40 dark:bg-red-900/5' : ''
                }`}
              >
                {/* checkbox */}
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center h-full"
                >
                  <input
                    type="checkbox"
                    checked={selection.has(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="w-4 h-4 rounded border-slate-300 text-brand-600"
                  />
                </div>

                {/* 报销单信息 */}
                <div
                  className="flex items-start md:items-center gap-3 min-w-0 cursor-pointer"
                  onClick={() => router.push(`/dashboard/reimbursements/${r.id}`)}
                >
                  <div className={`w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                    {TYPE_LABEL[r.type]?.slice(0, 1) || r.type.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {r.urgent && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                          <AlertTriangle className="w-3 h-3" /> 加急
                        </span>
                      )}
                      <span className="font-mono text-xs text-slate-400">{r.code}</span>
                    </div>
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate mt-0.5">
                      {r.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400 md:hidden">
                      <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{r.submitter} · {r.department}</span>
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />{r.submittedAt}</span>
                      <span className="text-brand-600 dark:text-brand-400 font-semibold">
                        ¥ {r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 提交人（桌面） */}
                <div
                  className="hidden md:flex items-center gap-2 cursor-pointer"
                  onClick={() => router.push(`/dashboard/reimbursements/${r.id}`)}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${colorCls}`}>
                    {r.submitter.slice(0, 1)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{r.submitter}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1"><Building2 className="w-3 h-3" />{r.department}</p>
                  </div>
                </div>

                {/* 时间 */}
                <div className="hidden md:block">
                  <p className="text-sm text-slate-700 dark:text-slate-200">{r.submittedAt.split(' ')[0]}</p>
                  <p className="text-xs text-slate-400">{r.submittedAt.split(' ')[1] || ''}</p>
                </div>

                {/* 进度 */}
                <div className="hidden md:block">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                        style={{ width: `${(r.currentStep / r.totalSteps) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {r.currentStep}/{r.totalSteps}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    当前节点：第 {r.currentStep} 步审批
                  </p>
                </div>

                {/* 金额 */}
                <div className="hidden md:block text-right">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    ¥ {r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400">{r.items.length} 项明细</p>
                </div>

                {/* 操作 */}
                <div className="md:text-right">
                  <div className="flex md:inline-flex md:items-center md:justify-end flex-wrap items-center gap-2">
                    {(() => {
                      const isFinalStep = r.currentStep >= r.totalSteps
                      // 当前用户无对应 pending 节点（已批过/不归你管）：仅查看
                      if (!r.canAct) {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5" /> 已处理 / 等待他人
                          </span>
                        )
                      }
                      // 财务在终审节点：仅查看，不可操作
                      if (isFinalStep && !canFinalApprove) {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400">
                            <Lock className="w-3.5 h-3.5" /> 等待管理员终审
                          </span>
                        )
                      }
                      // 管理员在终审节点：显示「终审通过」按钮
                      if (isFinalStep && canFinalApprove) {
                        return (
                          <>
                            <button
                              onClick={() => singleApprove(r)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-amber-600 hover:bg-amber-700 shadow shadow-amber-600/20"
                            >
                              <ShieldCheck className="w-4 h-4" /> 终审通过
                            </button>
                            <button
                              onClick={() => { setSingleRejectId(r.id); setRejectReason('') }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                            >
                              <XCircle className="w-4 h-4" /> 终审驳回
                            </button>
                          </>
                        )
                      }
                      // 普通审批节点：财务和管理员都可以审核
                      return (
                        <>
                          <button
                            onClick={() => singleApprove(r)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 shadow shadow-green-600/20"
                          >
                            <CheckCircle2 className="w-4 h-4" /> 同意
                          </button>
                          <button
                            onClick={() => { setSingleRejectId(r.id); setRejectReason('') }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
                          >
                            <XCircle className="w-4 h-4" /> 驳回
                          </button>
                        </>
                      )
                    })()}
                    <button
                      onClick={() => { setDelegateFor(r.id); setDelegateTo('') }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="加签"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => router.push(`/dashboard/reimbursements/${r.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium rounded-lg text-slate-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:text-brand-300 dark:hover:bg-brand-900/20"
                    >
                      <Eye className="w-4 h-4" /> 详情 <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 分页 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-4 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400">
          <div>
            第 <span className="font-medium text-slate-700 dark:text-slate-200">{safePage}</span> / {pageCount} 页 ·
            本页 {paged.length} / 合计 {filtered.length} 条
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            {Array.from({ length: Math.min(5, pageCount) }, (_, i) => {
              let pageNum: number
              if (pageCount <= 5) pageNum = i + 1
              else if (safePage <= 3) pageNum = i + 1
              else if (safePage >= pageCount - 2) pageNum = pageCount - 4 + i
              else pageNum = safePage - 2 + i
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`min-w-[36px] h-9 rounded-lg font-medium ${
                    pageNum === safePage
                      ? 'text-white bg-brand-600 shadow shadow-brand-600/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {pageNum}
                </button>
              )
            })}
            <button
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* === 驳回弹窗 === */}
      {singleRejectId && (
        <Modal title={singleRejectId === '__batch__' ? '批量驳回' : '驳回该报销单'} onClose={() => setSingleRejectId(null)}>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            {singleRejectId === '__batch__'
              ? `以下 ${selection.size} 张报销单将被驳回，请填写原因：`
              : '请填写驳回原因，提交人可查看原因并重新提交。'}
          </p>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            autoFocus
            placeholder="例如：票据不清晰，请重新上传；超出部门月度预算，请拆分后提交..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
          />
          <ModalFooter
            onCancel={() => setSingleRejectId(null)}
            onConfirm={singleRejectId === '__batch__' ? batchReject : singleRejectConfirm}
            confirmLabel={busy === 'batch-reject' ? '处理中...' : (singleRejectId === '__batch__' ? '确认批量驳回' : '确认驳回')}
            tone="danger"
          />
        </Modal>
      )}

      {/* === 加签 / 转交 弹窗 === */}
      {delegateFor && (
        <Modal
          title={delegateFor === 'batch' ? '批量加签 / 转交审批' : '转交 / 加签'}
          onClose={() => setDelegateFor(null)}
        >
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            选择要转交的审批人，该审批人将作为新增节点加入审批流
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">审批人</span>
            <select
              value={delegateTo}
              onChange={(e) => setDelegateTo(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            >
              <option value="">请选择...</option>
              {['王总监（部门负责人）', '赵财务（财务复核）', '陈副总（最终审批）', '法务：周律师', '跨部门协作：刘经理'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <ModalFooter
            onCancel={() => setDelegateFor(null)}
            onConfirm={confirmDelegate}
            confirmLabel="确认加签"
          />
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60]">
          <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white shadow-2xl text-sm font-medium">
            <Check className="w-4 h-4 text-green-400" />
            {toast}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ===== 小组件 =====
function StatCard({
  label, value, hint, tone = 'default',
}: { label: string; value: string; hint?: string; tone?: 'default' | 'danger' | 'warn' | 'info' }) {
  const map = {
    default: 'text-slate-900 dark:text-white',
    danger:  'text-red-600 dark:text-red-400',
    warn:    'text-amber-600 dark:text-amber-400',
    info:    'text-blue-600 dark:text-blue-400',
  }
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl sm:text-3xl font-bold ${map[tone]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function FilterChip({
  active, onClick, children, badge, tone,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
  badge?: number; tone?: 'danger'
}) {
  const activeCls = tone === 'danger'
    ? 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
    : 'text-brand-700 bg-brand-50 border-brand-200 dark:text-brand-300 dark:bg-brand-900/20 dark:border-brand-800'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap ${
        active ? activeCls :
        'text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      {typeof badge === 'number' && (
        <span className={`text-[11px] px-1.5 py-0.5 rounded-md ${active ? 'bg-white/70 dark:bg-slate-800/60' : 'bg-slate-100 dark:bg-slate-800'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

function SortBtn({
  active, dir, onClick, children,
}: { active: boolean; dir: 'asc' | 'desc'; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
        active
          ? 'text-brand-700 bg-brand-50 dark:text-brand-300 dark:bg-brand-900/20 font-medium'
          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
      {active && <ArrowUpDown className="w-3 h-3" />}
    </button>
  )
}

function Modal({
  title, children, onClose,
}: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({
  onCancel, onConfirm, confirmLabel, tone,
}: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; tone?: 'danger'
}) {
  const confirmCls =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white shadow shadow-red-600/20'
      : 'bg-brand-600 hover:bg-brand-700 text-white shadow shadow-brand-600/20'
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
      >
        取消
      </button>
      <button
        onClick={onConfirm}
        className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg ${confirmCls}`}
      >
        <AlertCircle className="w-4 h-4" />
        {confirmLabel}
      </button>
    </div>
  )
}

// ===== 无权限提示组件（员工访问审批页时显示）=====
function NoPermissionPanel({ role, roleInfo }: { role: Role; roleInfo: { label: string; desc: string; color: string } }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 sm:p-12 text-center">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">无访问权限</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mb-6">
        当前角色
        <span
          className={`mx-1 px-2 py-0.5 text-xs font-medium rounded-full ${
            role === 'employee'
              ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}
        >
          {roleInfo.label}
        </span>
        无权访问审批中心。审批功能仅对
        <span className="mx-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">财务人员</span>
        和
        <span className="mx-1 px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">系统管理员</span>
        开放。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href="/dashboard"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/25 transition-all"
        >
          返回工作台
        </a>
        <a
          href="/dashboard/reimbursements/new"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-xl transition-all"
        >
          <Send className="w-4 h-4" /> 发起报销单
        </a>
      </div>
      <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 max-w-md mx-auto">
        <p className="mb-1">💡 如需审批权限，请联系系统管理员调整角色。</p>
        <p>你可以继续使用以下功能：创建报销单、查看个人报销记录、跟踪审批进度。</p>
      </div>
    </div>
  )
}

