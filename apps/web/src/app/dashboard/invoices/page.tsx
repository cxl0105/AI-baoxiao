'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  FileText, Search, Filter, ShieldCheck, ShieldAlert, Plus, Download,
  CheckCircle2, XCircle, Clock, AlertTriangle, Eye, Trash2, X,
  Wallet, Stamp, ShieldQuestion, Send, Link2
} from 'lucide-react'
import { useInvoiceStore,
  INVOICE_TYPE_LABEL, INVOICE_TYPE_OPTIONS,
  INVOICE_STATUS_LABEL, INVOICE_STATUS_CLASS,
  VERIFY_STATUS_LABEL, VERIFY_STATUS_CLASS,
  mockVerifyInvoice,
  type InvoiceRecord, type InvoiceType, type InvoiceStatus, type VerifyStatus, type VerifyDetails
} from '@/lib/invoice-store'
import { useAuthStore } from '@/lib/auth'
import { hasPermission, ROLES, type Role } from '@/lib/rbac'

// ============ 工具函数 ============

/** 格式化金额为 ¥1,234.56 */
function fmtMoney(n: number): string {
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** 每页条数 */
const PAGE_SIZE = 10

/** 表单输入框统一样式（与筛选栏一致） */
const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 transition-colors'

/** 发票来源标签 */
const SOURCE_LABEL: Record<string, string> = {
  upload: '上传',
  ocr: 'OCR 识别',
  manual: '手动录入',
  import: '批量导入',
}

/** 导出发票列表为 CSV（UTF-8 BOM，Excel 可直接打开中文） */
function exportInvoicesCsv(rows: InvoiceRecord[]) {
  const header = [
    '发票号码', '发票代码', '类型', '开票日期', '销方名称', '销方税号',
    '价税合计(元)', '税额(元)', '不含税金额(元)', '状态', '验真状态', '验真时间',
    '关联报销单', '商品摘要', '备注', '来源', '创建时间'
  ]
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const body = rows.map((r) => [
    r.invoiceNumber, r.invoiceCode, INVOICE_TYPE_LABEL[r.type], r.date,
    r.sellerName, r.sellerTaxId, r.amount, r.taxAmount, r.amountWithoutTax,
    INVOICE_STATUS_LABEL[r.status], VERIFY_STATUS_LABEL[r.verifyStatus],
    r.verifiedAt || '', r.reimbursementTitle || '', r.description, r.remark || '',
    SOURCE_LABEL[r.source] || r.source, r.createdAt
  ].map(esc).join(','))
  const csv = '\ufeff' + [header.join(','), ...body].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `发票池清单_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** 分页页码渲染（含省略号） */
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

// ============ 手动录入表单类型 ============
interface ManualForm {
  invoiceCode: string
  invoiceNumber: string
  type: InvoiceType
  date: string
  amount: string
  taxAmount: string
  sellerName: string
  sellerTaxId: string
  description: string
  remark: string
}

const EMPTY_FORM: ManualForm = {
  invoiceCode: '',
  invoiceNumber: '',
  type: 'vat_normal',
  date: '',
  amount: '',
  taxAmount: '',
  sellerName: '',
  sellerTaxId: '',
  description: '',
  remark: '',
}

// ============ 主组件 ============
export default function InvoicesPage() {
  const { user } = useAuthStore()
  const invoices = useInvoiceStore((s) => s.invoices)
  const addInvoice = useInvoiceStore((s) => s.addInvoice)
  const markAsVoid = useInvoiceStore((s) => s.markAsVoid)
  const setVerifyStatus = useInvoiceStore((s) => s.setVerifyStatus)
  const setVerifyDetails = useInvoiceStore((s) => s.setVerifyDetails)

  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // --- 验真中状态跟踪（正在验真的发票 ID 集合）---
  const [verifyingIds, setVerifyingIds] = useState<Set<string>>(new Set())
  // --- 验真报告弹窗 ---
  const [verifyReport, setVerifyReport] = useState<{ invoice: InvoiceRecord; details: VerifyDetails } | null>(null)

  const role = (user?.role as Role) || 'employee'
  const roleInfo = ROLES[role] || ROLES.employee

  // 权限：发票池无独立权限，按角色映射
  // 验真/录入：admin + finance（approval:approve 仅这两个角色拥有）
  // 作废：仅 admin
  const canVerify = hasPermission(role, 'approval:approve')
  const canInput = hasPermission(role, 'approval:approve')
  const canVoid = role === 'admin'

  // --- 筛选状态 ---
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<InvoiceType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')
  const [verifyFilter, setVerifyFilter] = useState<VerifyStatus | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // --- 选择 / 分页 ---
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  // --- 弹窗 ---
  const [detailInvoice, setDetailInvoice] = useState<InvoiceRecord | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [form, setForm] = useState<ManualForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [dupInvoice, setDupInvoice] = useState<InvoiceRecord | null>(null)

  // ============ 统计 ============
  const stats = useMemo(() => {
    const total = invoices.length
    const unused = invoices.filter((i) => i.status === 'unused').length
    const used = invoices.filter((i) => i.status === 'used').length
    const voidCount = invoices.filter((i) => i.status === 'void').length
    const duplicate = invoices.filter((i) => i.status === 'duplicate').length
    const unusedAmount = invoices
      .filter((i) => i.status === 'unused')
      .reduce((s, i) => s + i.amount, 0)
    const verified = invoices.filter((i) => i.verifyStatus === 'verified').length
    const verifyRate = total > 0 ? Math.round((verified / total) * 100) : 0
    return { total, unused, used, void: voidCount, duplicate, unusedAmount, verified, verifyRate }
  }, [invoices])

  // ============ 筛选 + 排序 ============
  const filtered = useMemo(() => {
    let rows = invoices
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      rows = rows.filter(
        (i) =>
          i.invoiceNumber.toLowerCase().includes(kw) ||
          i.invoiceCode.toLowerCase().includes(kw) ||
          i.sellerName.toLowerCase().includes(kw)
      )
    }
    if (typeFilter !== 'all') rows = rows.filter((i) => i.type === typeFilter)
    if (statusFilter !== 'all') rows = rows.filter((i) => i.status === statusFilter)
    if (verifyFilter !== 'all') rows = rows.filter((i) => i.verifyStatus === verifyFilter)
    if (dateFrom) rows = rows.filter((i) => i.date >= dateFrom)
    if (dateTo) rows = rows.filter((i) => i.date <= dateTo)
    // 按开票日期倒序
    return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  }, [invoices, search, typeFilter, statusFilter, verifyFilter, dateFrom, dateTo])

  // ============ 分页 ============
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // ============ 选择操作 ============
  const allPagedSelected = paged.length > 0 && paged.every((i) => selected.has(i.id))
  const togglePagedAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allPagedSelected) paged.forEach((i) => next.delete(i.id))
      else paged.forEach((i) => next.add(i.id))
      return next
    })
  }
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())

  // ============ 单行操作 ============
  const handleVerify = async (id: string) => {
    const invoice = invoices.find((i) => i.id === id)
    if (!invoice) return
    // 设置验真中状态
    setVerifyingIds((prev) => new Set(prev).add(id))
    setVerifyStatus(id, 'verifying')
    try {
      const details = await mockVerifyInvoice(invoice)
      setVerifyDetails(id, details)
      if (details.conclusion === 'inconsistent') {
        setVerifyStatus(id, 'failed')
      } else {
        setVerifyStatus(id, 'verified')
      }
      // 若详情弹窗打开，同步更新
      setDetailInvoice((cur) =>
        cur && cur.id === id
          ? { ...cur, verifyStatus: details.conclusion === 'inconsistent' ? 'failed' : 'verified', verifiedAt: new Date().toISOString(), verifyDetails: details }
          : cur
      )
    } catch {
      setVerifyStatus(id, 'failed')
    } finally {
      setVerifyingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    }
  }
  const handleVoid = (id: string) => {
    if (!confirm('确定作废此发票？作废后该发票将不可用于报销。')) return
    markAsVoid(id)
    setDetailInvoice((cur) => (cur && cur.id === id ? { ...cur, status: 'void' } : cur))
  }

  // ============ 批量操作 ============
  const handleBulkVerify = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`确认为选中的 ${ids.length} 张发票执行验真？`)) return
    // 批量设置验真中
    setVerifyingIds((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n })
    ids.forEach((id) => setVerifyStatus(id, 'verifying'))
    // 并行验真
    await Promise.all(
      ids.map(async (id) => {
        const invoice = invoices.find((i) => i.id === id)
        if (!invoice) return
        try {
          const details = await mockVerifyInvoice(invoice)
          setVerifyDetails(id, details)
          setVerifyStatus(id, details.conclusion === 'inconsistent' ? 'failed' : 'verified')
        } catch {
          setVerifyStatus(id, 'failed')
        } finally {
          setVerifyingIds((prev) => { const n = new Set(prev); n.delete(id); return n })
        }
      })
    )
    clearSelection()
  }
  const handleBulkVoid = () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`确定作废选中的 ${ids.length} 张发票？`)) return
    ids.forEach((id) => markAsVoid(id))
    clearSelection()
  }
  const handleBulkExport = () => {
    const ids = Array.from(selected)
    const rows = ids.length ? filtered.filter((i) => ids.includes(i.id)) : filtered
    if (!rows.length) return
    exportInvoicesCsv(rows)
  }
  const handleExportAll = () => {
    if (!filtered.length) return
    exportInvoicesCsv(filtered)
  }

  // ============ 手动录入 ============
  const openManual = () => {
    setForm({ ...EMPTY_FORM, date: new Date().toISOString().slice(0, 10) })
    setFormError(null)
    setDupInvoice(null)
    setShowManual(true)
  }
  const handleManualSubmit = () => {
    setFormError(null)
    setDupInvoice(null)
    if (!form.invoiceCode.trim() || !form.invoiceNumber.trim()) {
      setFormError('请填写发票代码和发票号码')
      return
    }
    const amountNum = parseFloat(form.amount)
    if (!isFinite(amountNum) || amountNum <= 0) {
      setFormError('请输入有效的价税合计金额')
      return
    }
    let taxNum: number
    if (form.taxAmount.trim() === '') {
      // 留空自动按 6% 税率计算（amount 为价税合计）
      taxNum = +(amountNum * 0.06 / 1.06).toFixed(2)
    } else {
      taxNum = parseFloat(form.taxAmount)
      if (!isFinite(taxNum) || taxNum < 0 || taxNum > amountNum) {
        setFormError('请输入有效的税额（0 ~ 价税合计）')
        return
      }
    }
    const withoutTax = +(amountNum - taxNum).toFixed(2)
    const result = addInvoice({
      invoiceCode: form.invoiceCode.trim(),
      invoiceNumber: form.invoiceNumber.trim(),
      type: form.type,
      date: form.date,
      amount: amountNum,
      taxAmount: taxNum,
      amountWithoutTax: withoutTax,
      sellerName: form.sellerName.trim(),
      sellerTaxId: form.sellerTaxId.trim(),
      buyerName: '智报销科技有限公司',
      description: form.description.trim(),
      status: 'unused',
      verifyStatus: 'unverified',
      source: 'manual',
      remark: form.remark.trim() || undefined,
    })
    if (!result.success && result.duplicate) {
      setDupInvoice(result.duplicate)
      return
    }
    setShowManual(false)
  }

  const resetFilters = () => {
    setSearch('')
    setTypeFilter('all')
    setStatusFilter('all')
    setVerifyFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  // ============ 渲染 ============
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* === SSR 水合前 loading === */}
      {!mounted ? (
        <div className="flex items-center justify-center py-20">
          <Clock className="w-6 h-6 text-brand-500 animate-spin mr-2" />
          <span className="text-slate-500 dark:text-slate-400">加载发票池...</span>
        </div>
      ) : (
        <>
      {/* ============ 标题区 ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">发票池</h1>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                role === 'admin'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : role === 'finance'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {roleInfo.label}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            集中管理所有发票，自动查重验真，防范重复报销风险
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canInput && (
            <button
              onClick={openManual}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              手动录入发票
            </button>
          )}
          <button
            onClick={handleExportAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出发票清单
          </button>
        </div>
      </div>

      {/* ============ 统计卡片 ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 发票总数 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">发票总数</p>
          <p className="text-xs text-slate-400 mt-2">
            未使用 {stats.unused} · 已报销 {stats.used} · 已作废 {stats.void} · 查重异常 {stats.duplicate}
          </p>
        </div>

        {/* 未使用金额 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">
            {fmtMoney(stats.unusedAmount)}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">未使用金额</p>
          <p className="text-xs text-slate-400 mt-2">{stats.unused} 张发票可用</p>
        </div>

        {/* 已验真数 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.verified}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">已验真数</p>
          <p className="text-xs text-slate-400 mt-2">验真率 {stats.verifyRate}%</p>
        </div>

        {/* 查重异常 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 dark:border-red-900/40 p-5 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.duplicate}</p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-1">查重异常</p>
          <p className="text-xs text-red-500/80 dark:text-red-400/70 mt-2">需人工核实</p>
        </div>
      </div>

      {/* ============ 发票列表卡片 ============ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* 筛选栏 */}
        <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 搜索框 */}
          <div className="relative lg:col-span-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="发票号码 / 代码 / 销方"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white dark:focus:bg-slate-800 transition-colors"
            />
          </div>
          {/* 发票类型 */}
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value as InvoiceType | 'all'); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <option value="all">全部类型</option>
            {INVOICE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {/* 状态 */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as InvoiceStatus | 'all'); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <option value="all">全部状态</option>
            <option value="unused">未使用</option>
            <option value="used">已报销</option>
            <option value="void">已作废</option>
            <option value="duplicate">查重异常</option>
          </select>
          {/* 验真状态 */}
          <select
            value={verifyFilter}
            onChange={(e) => { setVerifyFilter(e.target.value as VerifyStatus | 'all'); setPage(1) }}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          >
            <option value="all">全部验真</option>
            <option value="unverified">待验真</option>
            <option value="verifying">验真中</option>
            <option value="verified">已验真</option>
            <option value="failed">验真失败</option>
          </select>
          {/* 日期范围 */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
            <span className="text-slate-400 text-xs">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          {(search || typeFilter !== 'all' || statusFilter !== 'all' || verifyFilter !== 'all' || dateFrom || dateTo) && (
            <div className="sm:col-span-2 lg:col-span-5 flex justify-end">
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" /> 重置筛选
              </button>
            </div>
          )}
        </div>

        {/* 批量操作栏 */}
        {selected.size > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-brand-50/60 dark:bg-brand-900/10 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              已选择 <span className="font-semibold text-brand-600 dark:text-brand-400">{selected.size}</span> 项
              <button onClick={togglePagedAll} className="ml-3 text-xs text-brand-600 dark:text-brand-400 hover:underline">
                {allPagedSelected ? '取消本页选择' : '全选本页'}
              </button>
              <button onClick={clearSelection} className="ml-2 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200">
                取消选择
              </button>
            </p>
            <div className="flex items-center gap-2">
              {canVerify && (
                <button
                  onClick={handleBulkVerify}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border text-sky-700 border-sky-200 bg-sky-50 hover:bg-sky-100 dark:text-sky-300 dark:border-sky-800 dark:bg-sky-900/20"
                >
                  <Stamp className="w-4 h-4" /> 批量验真
                </button>
              )}
              {canVoid && (
                <button
                  onClick={handleBulkVoid}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border text-red-600 border-red-200 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20"
                >
                  <Trash2 className="w-4 h-4" /> 批量作废
                </button>
              )}
              <button
                onClick={handleBulkExport}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border text-slate-700 border-slate-200 bg-white hover:bg-slate-50 dark:text-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Download className="w-4 h-4" /> 批量导出
              </button>
            </div>
          </div>
        )}

        {/* 表格 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
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
                <th className="text-left font-medium px-3 py-3">发票号码 / 代码</th>
                <th className="text-left font-medium px-3 py-3">类型</th>
                <th className="text-left font-medium px-3 py-3">开票日期</th>
                <th className="text-left font-medium px-3 py-3">销方名称</th>
                <th className="text-right font-medium px-3 py-3">金额(价税合计)</th>
                <th className="text-right font-medium px-3 py-3">税额</th>
                <th className="text-left font-medium px-3 py-3">状态</th>
                <th className="text-center font-medium px-3 py-3">验真</th>
                <th className="text-right font-medium px-3 py-3 pr-4">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paged.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                        <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mb-3">
                        {search || typeFilter !== 'all' || statusFilter !== 'all' || verifyFilter !== 'all' || dateFrom || dateTo
                          ? '没有找到符合条件的发票'
                          : '发票池暂无发票'}
                      </p>
                      {(search || typeFilter !== 'all' || statusFilter !== 'all' || verifyFilter !== 'all' || dateFrom || dateTo) && (
                        <button
                          onClick={resetFilters}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 rounded-lg hover:bg-brand-100 dark:hover:bg-brand-900/30"
                        >
                          <Filter className="w-4 h-4" /> 清除筛选条件
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {paged.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggleOne(inv.id)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-600"
                    />
                  </td>
                  {/* 发票号码 / 代码 */}
                  <td className="px-3 py-4">
                    <p className="font-mono text-sm font-medium text-slate-800 dark:text-slate-100">{inv.invoiceNumber}</p>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">{inv.invoiceCode}</p>
                  </td>
                  {/* 类型 */}
                  <td className="px-3 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md">
                      {INVOICE_TYPE_LABEL[inv.type]}
                    </span>
                  </td>
                  {/* 开票日期 */}
                  <td className="px-3 py-4 text-slate-600 dark:text-slate-300">{inv.date}</td>
                  {/* 销方名称 */}
                  <td className="px-3 py-4">
                    <p className="text-slate-700 dark:text-slate-200 truncate max-w-[180px]" title={inv.sellerName}>
                      {inv.sellerName}
                    </p>
                    <p className="font-mono text-xs text-slate-400 mt-0.5">{inv.sellerTaxId}</p>
                  </td>
                  {/* 金额（价税合计） */}
                  <td className="px-3 py-4 text-right">
                    <p className="font-bold text-slate-900 dark:text-white tabular-nums">{fmtMoney(inv.amount)}</p>
                  </td>
                  {/* 税额 */}
                  <td className="px-3 py-4 text-right">
                    <p className="text-xs text-slate-400 tabular-nums">{fmtMoney(inv.taxAmount)}</p>
                  </td>
                  {/* 状态 */}
                  <td className="px-3 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_CLASS[inv.status]}`}>
                      {INVOICE_STATUS_LABEL[inv.status]}
                    </span>
                  </td>
                  {/* 验真 */}
                  <td className="px-3 py-4 text-center">
                    {inv.verifyStatus === 'verified' && (
                      <span className="inline-flex items-center justify-center text-green-600 dark:text-green-400" title={`已验真 · ${inv.verifiedAt || ''}`}>
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}
                    {inv.verifyStatus === 'verifying' && (
                      <span className="inline-flex items-center justify-center text-blue-500" title="验真中...">
                        <Clock className="w-4 h-4 animate-spin" />
                      </span>
                    )}
                    {inv.verifyStatus === 'unverified' && (
                      <span className="inline-flex items-center justify-center text-slate-400" title="待验真">
                        <ShieldQuestion className="w-4 h-4" />
                      </span>
                    )}
                    {inv.verifyStatus === 'failed' && (
                      <span className="inline-flex items-center justify-center text-red-500" title="验真失败">
                        <XCircle className="w-4 h-4" />
                      </span>
                    )}
                  </td>
                  {/* 操作 */}
                  <td className="px-3 py-4 pr-4">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        onClick={() => setDetailInvoice(inv)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" /> 详情
                      </button>
                      {canVerify && (inv.verifyStatus === 'unverified' || inv.verifyStatus === 'failed') && (
                        <button
                          onClick={() => handleVerify(inv.id)}
                          disabled={verifyingIds.has(inv.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Stamp className="w-3.5 h-3.5" /> {verifyingIds.has(inv.id) ? '验真中' : '验真'}
                        </button>
                      )}
                      {inv.verifyStatus === 'verifying' && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                          <Clock className="w-3.5 h-3.5 animate-spin" /> 验真中
                        </span>
                      )}
                      {canVerify && (inv.verifyStatus === 'verified' || inv.verifyStatus === 'failed') && inv.verifyDetails && (
                        <button
                          onClick={() => setVerifyReport({ invoice: inv, details: inv.verifyDetails! })}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> 报告
                        </button>
                      )}
                      {canVoid && inv.status === 'unused' && (
                        <button
                          onClick={() => handleVoid(inv.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 作废
                        </button>
                      )}
                      {inv.status === 'used' && inv.reimbursementTitle && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 dark:text-brand-400">
                          <Link2 className="w-3 h-3" />
                          <span className="truncate max-w-[120px]" title={inv.reimbursementTitle}>{inv.reimbursementTitle}</span>
                        </span>
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
            第 <span className="font-medium text-slate-700 dark:text-slate-200">{currentPage}</span> / {totalPages} 页 · 本页 {paged.length} / 合计 {filtered.length} 条
          </p>
          <div className="flex items-center gap-1">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            {renderPages(currentPage, totalPages).map((pn, i) =>
              pn === '...' ? (
                <span key={`e${i}`} className="px-2 text-sm text-slate-400">···</span>
              ) : (
                <button
                  key={pn}
                  onClick={() => setPage(pn as number)}
                  className={`min-w-[36px] h-9 px-2 text-sm font-medium rounded-lg ${
                    pn === currentPage
                      ? 'text-white bg-brand-600 shadow shadow-brand-600/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {pn}
                </button>
              )
            )}
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {/* ============ 发票详情弹窗 ============ */}
      {detailInvoice && (
        <InvoiceDetailModal
          invoice={detailInvoice}
          canVerify={canVerify}
          canVoid={canVoid}
          isVerifying={verifyingIds.has(detailInvoice.id)}
          onClose={() => setDetailInvoice(null)}
          onVerify={() => handleVerify(detailInvoice.id)}
          onVoid={() => handleVoid(detailInvoice.id)}
          onViewReport={(details) => setVerifyReport({ invoice: detailInvoice, details })}
        />
      )}

      {/* ============ 验真报告弹窗 ============ */}
      {verifyReport && (
        <VerifyReportModal
          invoice={verifyReport.invoice}
          details={verifyReport.details}
          onClose={() => setVerifyReport(null)}
        />
      )}

      {/* ============ 手动录入弹窗 ============ */}
      {showManual && (
        <ManualEntryModal
          form={form}
          setForm={setForm}
          error={formError}
          dupInvoice={dupInvoice}
          onClose={() => setShowManual(false)}
          onSubmit={handleManualSubmit}
        />
      )}
        </>
      )}
    </div>
  )
}

// ============ 发票详情弹窗 ============
function InvoiceDetailModal({
  invoice, canVerify, canVoid, isVerifying, onClose, onVerify, onVoid, onViewReport,
}: {
  invoice: InvoiceRecord
  canVerify: boolean
  canVoid: boolean
  isVerifying: boolean
  onClose: () => void
  onVerify: () => void
  onVoid: () => void
  onViewReport: (details: VerifyDetails) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">发票详情</h3>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_CLASS[invoice.status]}`}>
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5 space-y-5">
          {/* 基本信息 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">基本信息</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="发票号码" value={invoice.invoiceNumber} mono />
              <DetailField label="发票代码" value={invoice.invoiceCode} mono />
              <DetailField label="发票类型" value={INVOICE_TYPE_LABEL[invoice.type]} />
              <DetailField label="开票日期" value={invoice.date} />
            </div>
          </section>

          {/* 金额信息 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">金额信息</h4>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <DetailField label="价税合计" value={fmtMoney(invoice.amount)} bold />
              <DetailField label="税额" value={fmtMoney(invoice.taxAmount)} />
              <DetailField label="不含税金额" value={fmtMoney(invoice.amountWithoutTax)} />
            </div>
          </section>

          {/* 销方 / 购方 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">销方 / 购方</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="销方名称" value={invoice.sellerName} />
              <DetailField label="销方税号" value={invoice.sellerTaxId} mono />
              <DetailField label="购方名称" value={invoice.buyerName} />
            </div>
          </section>

          {/* 商品摘要 / 备注 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">商品摘要 / 备注</h4>
            <div className="space-y-3 text-sm">
              <DetailField label="商品摘要" value={invoice.description || '—'} />
              <DetailField label="备注" value={invoice.remark || '—'} />
            </div>
          </section>

          {/* 状态信息 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">状态信息</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="发票状态" value={INVOICE_STATUS_LABEL[invoice.status]} />
              <div>
                <p className="text-xs text-slate-400 mb-0.5">验真状态</p>
                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${VERIFY_STATUS_CLASS[invoice.verifyStatus]}`}>
                  {isVerifying ? '验真中' : VERIFY_STATUS_LABEL[invoice.verifyStatus]}
                </span>
              </div>
              <DetailField label="验真时间" value={invoice.verifiedAt ? invoice.verifiedAt.slice(0, 19).replace('T', ' ') : '—'} />
              <DetailField label="关联报销单" value={invoice.reimbursementTitle || '—'} />
            </div>
            {/* 验真报告摘要 */}
            {invoice.verifyDetails && !isVerifying && (
              <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className={`w-4 h-4 ${invoice.verifyDetails.conclusion === 'consistent' ? 'text-green-500' : invoice.verifyDetails.conclusion === 'suspicious' ? 'text-amber-500' : 'text-red-500'}`} />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {invoice.verifyDetails.conclusion === 'consistent' ? '查验一致' : invoice.verifyDetails.conclusion === 'suspicious' ? '存疑' : '不一致'}
                    </span>
                    <span className="text-[11px] text-slate-400">· {invoice.verifyDetails.source}</span>
                  </div>
                  <button
                    onClick={() => onViewReport(invoice.verifyDetails!)}
                    className="text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    查看完整报告 →
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {invoice.verifyDetails.checkItems.map((item, idx) => (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded ${
                        item.status === 'pass'
                          ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                          : item.status === 'warn'
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      {item.status === 'pass' ? <CheckCircle2 className="w-3 h-3" /> : item.status === 'warn' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 来源 / 时间 */}
          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">来源 / 时间</h4>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="来源" value={SOURCE_LABEL[invoice.source] || invoice.source} />
              <DetailField label="发票 ID" value={invoice.id} mono />
              <DetailField label="创建时间" value={invoice.createdAt.slice(0, 19).replace('T', ' ')} />
              <DetailField label="更新时间" value={invoice.updatedAt.slice(0, 19).replace('T', ' ')} />
            </div>
          </section>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
          {canVerify && (invoice.verifyStatus === 'unverified' || invoice.verifyStatus === 'failed') && (
            <button
              onClick={onVerify}
              disabled={isVerifying}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isVerifying ? <Clock className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
              {isVerifying ? '验真中...' : '验真'}
            </button>
          )}
          {canVoid && invoice.status === 'unused' && (
            <button
              onClick={onVoid}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
            >
              <Trash2 className="w-4 h-4" /> 作废
            </button>
          )}
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 手动录入弹窗 ============
function ManualEntryModal({
  form, setForm, error, dupInvoice, onClose, onSubmit,
}: {
  form: ManualForm
  setForm: React.Dispatch<React.SetStateAction<ManualForm>>
  error: string | null
  dupInvoice: InvoiceRecord | null
  onClose: () => void
  onSubmit: () => void
}) {
  const update = (field: keyof ManualForm, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">手动录入发票</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单 */}
        <div className="px-6 py-5 space-y-4">
          {/* 查重警告 */}
          {dupInvoice && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-medium">
                    发票号码 {dupInvoice.invoiceNumber} 已存在于发票池中（状态：{INVOICE_STATUS_LABEL[dupInvoice.status]}），请勿重复录入
                  </p>
                </div>
              </div>
              {/* 高亮显示重复发票信息 */}
              <div className="ml-7 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/50 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">发票号码 / 代码</span><span className="font-mono text-slate-700 dark:text-slate-200">{dupInvoice.invoiceNumber} / {dupInvoice.invoiceCode}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">开票日期</span><span className="text-slate-700 dark:text-slate-200">{dupInvoice.date}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">销方名称</span><span className="text-slate-700 dark:text-slate-200">{dupInvoice.sellerName}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">价税合计</span><span className="font-semibold text-slate-900 dark:text-white">{fmtMoney(dupInvoice.amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">当前状态</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${INVOICE_STATUS_CLASS[dupInvoice.status]}`}>{INVOICE_STATUS_LABEL[dupInvoice.status]}</span></div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="发票代码" required>
              <input
                type="text"
                value={form.invoiceCode}
                onChange={(e) => update('invoiceCode', e.target.value)}
                placeholder="10/12 位发票代码"
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="发票号码" required>
              <input
                type="text"
                value={form.invoiceNumber}
                onChange={(e) => update('invoiceNumber', e.target.value)}
                placeholder="8 位发票号码"
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="发票类型">
              <select
                value={form.type}
                onChange={(e) => update('type', e.target.value)}
                className={INPUT_CLS}
              >
                {INVOICE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="开票日期">
              <input
                type="date"
                value={form.date}
                onChange={(e) => update('date', e.target.value)}
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="价税合计金额" required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => update('amount', e.target.value)}
                placeholder="0.00"
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="税额（留空自动按 6% 计算）">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.taxAmount}
                onChange={(e) => update('taxAmount', e.target.value)}
                placeholder="留空自动计算"
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="销方名称">
              <input
                type="text"
                value={form.sellerName}
                onChange={(e) => update('sellerName', e.target.value)}
                placeholder="销售方名称"
                className={INPUT_CLS}
              />
            </FormField>
            <FormField label="销方税号">
              <input
                type="text"
                value={form.sellerTaxId}
                onChange={(e) => update('sellerTaxId', e.target.value)}
                placeholder="纳税人识别号"
                className={INPUT_CLS}
              />
            </FormField>
          </div>

          <FormField label="商品摘要">
            <input
              type="text"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              placeholder="商品 / 服务摘要"
              className={INPUT_CLS}
            />
          </FormField>
          <FormField label="备注">
            <textarea
              value={form.remark}
              onChange={(e) => update('remark', e.target.value)}
              placeholder="备注信息（选填）"
              rows={2}
              className={INPUT_CLS + ' resize-y'}
            />
          </FormField>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-lg shadow-brand-600/20"
          >
            <Send className="w-4 h-4" /> 提交录入
          </button>
        </div>
      </div>
    </div>
  )
}

// ============ 小组件：详情字段 ============
function DetailField({
  label, value, mono, bold,
}: {
  label: string
  value: string
  mono?: boolean
  bold?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`${mono ? 'font-mono' : ''} ${bold ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
        {value}
      </p>
    </div>
  )
}

// ============ 小组件：表单字段 ============
function FormField({
  label, required, children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}

// ============ 验真报告弹窗 ============
function VerifyReportModal({
  invoice, details, onClose,
}: {
  invoice: InvoiceRecord
  details: VerifyDetails
  onClose: () => void
}) {
  const conclusionConfig = {
    consistent: { label: '查验一致', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', icon: CheckCircle2 },
    suspicious: { label: '存疑', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', icon: AlertTriangle },
    inconsistent: { label: '查验不一致', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', icon: XCircle },
  }
  const cfg = conclusionConfig[details.conclusion]
  const Icon = cfg.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            <h3 className="font-semibold text-slate-900 dark:text-white">发票验真报告</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-5 space-y-5">
          {/* 发票摘要 */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">发票号码</p>
                <p className="font-mono text-slate-700 dark:text-slate-200">{invoice.invoiceNumber}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">发票代码</p>
                <p className="font-mono text-slate-700 dark:text-slate-200">{invoice.invoiceCode}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">开票日期</p>
                <p className="text-slate-700 dark:text-slate-200">{invoice.date}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">价税合计</p>
                <p className="font-bold text-slate-900 dark:text-white">{fmtMoney(invoice.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">销方名称</p>
                <p className="text-slate-700 dark:text-slate-200 truncate" title={invoice.sellerName}>{invoice.sellerName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">销方税号</p>
                <p className="font-mono text-xs text-slate-600 dark:text-slate-300">{invoice.sellerTaxId}</p>
              </div>
            </div>
          </div>

          {/* 查验结论 */}
          <div className={`rounded-xl ${cfg.bg} border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3`}>
            <Icon className={`w-8 h-8 ${cfg.color} flex-shrink-0`} />
            <div>
              <p className={`font-semibold ${cfg.color}`}>{cfg.label}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                查验来源：{details.source}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                查验时间：{details.checkedAt.slice(0, 19).replace('T', ' ')}
              </p>
            </div>
          </div>

          {/* 校验项明细 */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">校验项明细</h4>
            <div className="space-y-2">
              {details.checkItems.map((item, idx) => {
                const itemIcon = item.status === 'pass' ? CheckCircle2 : item.status === 'warn' ? AlertTriangle : XCircle
                const itemColor = item.status === 'pass' ? 'text-green-500' : item.status === 'warn' ? 'text-amber-500' : 'text-red-500'
                const ItemIcon = itemIcon
                return (
                  <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                    <ItemIcon className={`w-4 h-4 ${itemColor} flex-shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                        <span className={`text-xs font-medium ${itemColor}`}>
                          {item.status === 'pass' ? '通过' : item.status === 'warn' ? '警告' : '不通过'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 免责声明 */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 p-3">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ※ 本查验结果由系统对接国家税务总局发票查验接口生成（当前为模拟环境）。验真结果仅供参考，不作为唯一合规凭证。如对结果有疑问，请前往 <span className="font-medium">国家税务总局全国增值税发票查验平台</span>（https://inv-veri.chinatax.gov.cn/）进行人工复核。
            </p>
          </div>
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-lg shadow-brand-600/20"
          >
            关闭报告
          </button>
        </div>
      </div>
    </div>
  )
}
