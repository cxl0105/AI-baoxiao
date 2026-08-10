'use client'

import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import {
  LayoutGrid,
  List,
  Search,
  Trash2,
  Download,
  RefreshCw,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileImage,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  Undo2,
} from 'lucide-react'
import type {
  ExpenseCategory,
  OcrInvoice,
} from '@/lib/api'
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from '@/lib/api'
import type { NormalizedOcrResult } from '@/lib/ocr-providers'

export type AnyInvoice = OcrInvoice & Partial<NormalizedOcrResult>

type SortKey =
  | 'fileName'
  | 'status'
  | 'category'
  | 'amount'
  | 'date'
  | 'invoiceNo'
  | 'taxAmount'
  | 'totalAmount'
  | 'sellerName'

export interface InvoiceTableProps {
  invoices: AnyInvoice[]
  /** 向上更新：替换整张发票（OCR 编辑后、重识别后） */
  onUpdateInvoice: (id: string, patch: Partial<AnyInvoice>) => void
  /** 向上：删除单张（同时要解绑/删除关联费用明细，由父组件处理） */
  onDeleteInvoice: (ids: string[]) => void
  /** 向上：重新识别（按钮触发） */
  onReparse: (id: string) => void
  /** 视图切换按钮：点卡片视图 */
  onSwitchToCards?: () => void
  /** 打开原 OCR 编辑弹窗（铅笔按钮触发） */
  onOpenEdit?: (id: string) => void
  /** 高亮重复文件名 */
  dupFlashNames?: Set<string>
}

type SortDir = 'asc' | 'desc'

/** 导出 CSV：当前表格全部行（含未选中），UTF-8 BOM，Excel 可直接打开中文 */
function exportRowsToCsv(rows: AnyInvoice[], precision: number) {
  const header = [
    '文件名', '状态', '类别', '发票号', '开票日期', '金额(元)', '税额(元)', '价税合计(元)',
    '销售方', '购买方', '描述', '纳税人识别号(销)', '纳税人识别号(购)'
  ]
  const fmtAmt = (n: number | undefined | null) =>
    (n == null || !isFinite(n) ? 0 : n).toFixed(precision)
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const body = rows.map((r) => [
    r.fileName,
    statusLabel(r.status),
    CATEGORY_LABEL[r.category] || r.category,
    r.invoiceNo,
    r.date,
    fmtAmt(r.amount),
    fmtAmt(r.taxAmount),
    fmtAmt(r.totalAmount ?? r.amount),
    r.sellerName || '',
    r.buyerName || '',
    r.description || '',
    r.sellerTaxNo || '',
    r.buyerTaxNo || '',
  ].map(esc).join(','))
  return '\ufeff' + [header.join(','), ...body].join('\n')
}

function statusLabel(s: OcrInvoice['status']) {
  return s === 'success' ? '识别成功' : s === 'processing' ? '识别中…' : s === 'failed' ? '识别失败' : '待上传'
}

export const InvoiceTable: React.FC<InvoiceTableProps> = ({
  invoices,
  onUpdateInvoice,
  onDeleteInvoice,
  onReparse,
  onSwitchToCards,
  onOpenEdit,
  dupFlashNames,
}) => {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [bulkCategory, setBulkCategory] = useState<ExpenseCategory>('meal')
  const [editingCell, setEditingCell] = useState<string | null>(null) // `${id}:${col}`
  const editDraftRef = useRef<string>('')

  // --- 搜索过滤 ---
  const filtered = useMemo(() => {
    if (!search.trim()) return invoices
    const kw = search.trim().toLowerCase()
    return invoices.filter(
      (r) =>
        r.fileName.toLowerCase().includes(kw) ||
        (r.invoiceNo || '').toLowerCase().includes(kw) ||
        (CATEGORY_LABEL[r.category] || '').toLowerCase().includes(kw) ||
        (r.description || '').toLowerCase().includes(kw) ||
        (r.sellerName || '').toLowerCase().includes(kw) ||
        (r.buyerName || '').toLowerCase().includes(kw)
    )
  }, [invoices, search])

  // --- 排序 ---
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      let av: any = (a as any)[sortKey]
      let bv: any = (b as any)[sortKey]
      if (sortKey === 'category') {
        av = CATEGORY_LABEL[a.category] || ''
        bv = CATEGORY_LABEL[b.category] || ''
      }
      if (sortKey === 'status') {
        av = statusLabel(a.status)
        bv = statusLabel(b.status)
      }
      if (av == null) av = ''
      if (bv == null) bv = ''
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir
      }
      return String(av).localeCompare(String(bv), 'zh-CN') * dir
    })
    return arr
  }, [filtered, sortKey, sortDir])

  // --- 合计 ---
  const totals = useMemo(() => {
    let cnt = 0
    let amt = 0
    let tax = 0
    let tot = 0
    for (const r of sorted) {
      if (r.status !== 'success') continue
      cnt++
      amt += r.amount || 0
      tax += (r.taxAmount as number | undefined) || 0
      tot += (r.totalAmount as number | undefined) || r.amount || 0
    }
    return { cnt, amt, tax, tot }
  }, [sorted])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const allSelected =
    sorted.length > 0 && sorted.every((r) => selected.has(r.id))
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(sorted.map((r) => r.id)))
  }
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const doBulkCategory = () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    ids.forEach((id) => onUpdateInvoice(id, { category: bulkCategory }))
  }

  const doDeleteSelected = () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`确定删除选中的 ${ids.length} 张发票？将同步移除关联的费用明细。`)) return
    onDeleteInvoice(ids)
    setSelected(new Set())
  }

  const doExportCsv = () => {
    const csv = exportRowsToCsv(sorted, 2)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `发票识别明细_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  // --- 行内编辑：进入编辑态 / 提交 / 取消 ---
  const startEdit = (key: string, initValue: string) => {
    setEditingCell(key)
    editDraftRef.current = initValue
  }
  useEffect(() => {
    if (!editingCell) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingCell(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editingCell])

  const commitEdit = (id: string, field: keyof AnyInvoice, raw: string) => {
    const patch: Partial<AnyInvoice> = {}
    let v: any = raw
    if (field === 'amount' || field === 'taxAmount' || field === 'totalAmount') {
      const n = parseFloat(String(v).replace(/[,\s￥¥]/g, ''))
      if (!isFinite(n) || n < 0) {
        setEditingCell(null)
        return
      }
      v = +n.toFixed(2)
    }
    if (field === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        setEditingCell(null)
        return
      }
    }
    ;(patch as any)[field] = v
    onUpdateInvoice(id, patch)
    setEditingCell(null)
  }

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex items-center gap-2 flex-wrap">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索文件名 / 发票号 / 类别 / 销售方…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5">
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value as ExpenseCategory)}
            className="bg-transparent text-sm outline-none pr-1 border-r border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={doBulkCategory}
            disabled={!selected.size}
            className={`text-xs font-medium px-2 py-0.5 rounded-md transition-colors ${
              selected.size
                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            }`}
            title="批量设置类别到所有选中行"
          >
            改类别{selected.size ? ` (${selected.size})` : ''}
          </button>
        </div>
        <button
          onClick={doDeleteSelected}
          disabled={!selected.size}
          className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            selected.size
              ? 'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800/50'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
          title="删除选中的发票（同步移除关联费用明细）"
        >
          <Trash2 className="w-4 h-4" />
          删除
        </button>
        <button
          onClick={doExportCsv}
          disabled={!sorted.length}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
          title="导出当前筛选+排序结果为 CSV（Excel 可直接打开）"
        >
          <Download className="w-4 h-4" />
          导出 CSV
        </button>
        <div className="ml-auto flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <button
            onClick={onSwitchToCards}
            title="切换为卡片视图"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">卡片</span>
          </button>
          <button
            title="当前：表格视图（可编辑）"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 border-l border-slate-200 dark:border-slate-700"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">表格</span>
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[70vh]">
          <table className="min-w-[1600px] w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <Th style={{ width: 44 }} className="text-left">
                  <input
                    type="checkbox"
                    className="accent-brand-600"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </Th>
                <Th style={{ width: 56 }}>文件</Th>
                <Th onClick={() => toggleSort('fileName')} sortDir={sortKey === 'fileName' ? sortDir : undefined}>
                  文件名
                </Th>
                <Th onClick={() => toggleSort('status')} sortDir={sortKey === 'status' ? sortDir : undefined}>
                  状态
                </Th>
                <Th onClick={() => toggleSort('category')} sortDir={sortKey === 'category' ? sortDir : undefined} className="w-[120px]">
                  费用类别
                </Th>
                <Th onClick={() => toggleSort('invoiceNo')} sortDir={sortKey === 'invoiceNo' ? sortDir : undefined} className="w-[150px]">
                  发票号
                </Th>
                <Th onClick={() => toggleSort('date')} sortDir={sortKey === 'date' ? sortDir : undefined} className="w-[130px]">
                  开票日期
                </Th>
                <Th onClick={() => toggleSort('amount')} sortDir={sortKey === 'amount' ? sortDir : undefined} align="right" className="w-[110px]">
                  金额(¥)
                </Th>
                <Th onClick={() => toggleSort('taxAmount')} sortDir={sortKey === 'taxAmount' ? sortDir : undefined} align="right" className="w-[110px]">
                  税额(¥)
                </Th>
                <Th onClick={() => toggleSort('totalAmount')} sortDir={sortKey === 'totalAmount' ? sortDir : undefined} align="right" className="w-[110px]">
                  价税合计(¥)
                </Th>
                <Th onClick={() => toggleSort('sellerName')} sortDir={sortKey === 'sellerName' ? sortDir : undefined} className="w-[160px]">
                  销售方/开票方
                </Th>
                <Th className="w-[160px]">购买方</Th>
                <Th className="w-[220px]">描述/备注</Th>
                <Th className="w-[120px] sticky right-0 bg-slate-50 dark:bg-slate-800/80 shadow-[-4px_0_8px_-6px_rgba(0,0,0,0.15)]">操作</Th>
              </tr>
            </thead>
            <tbody className="align-top divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                    {search ? '没有匹配的发票，试试换个关键字' : '还没有识别过发票，先点击左上角拖拽区上传若干张发票吧 📎'}
                  </td>
                </tr>
              )}
              {sorted.map((r, rowIdx) => {
                const isDup = dupFlashNames?.has(r.fileName)
                return (
                  <tr
                    key={r.id}
                    className={`group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                      isDup ? 'bg-red-50/70 dark:bg-red-900/10 animate-pulse' : ''
                    } ${rowIdx % 2 ? '' : 'bg-white dark:bg-slate-900/60'}`}
                  >
                    <Td style={{ width: 44 }}>
                      <input
                        type="checkbox"
                        className="accent-brand-600"
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                      />
                    </Td>
                    <Td style={{ width: 56 }} className="py-2.5">
                      {r.thumbnailUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                          <img
                            src={r.thumbnailUrl}
                            alt={r.fileName}
                            className="w-full h-full object-cover"
                            onError={(e) => ((e.currentTarget.style.display = 'none'))}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400">
                          {/\.pdf$/i.test(r.fileName) ? <FileText className="w-5 h-5" /> : <FileImage className="w-5 h-5" />}
                        </div>
                      )}
                    </Td>
                    <Td title={r.fileName}>
                      <div className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[260px]">{r.fileName}</div>
                      {isDup && (
                        <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                          <AlertCircle className="w-3 h-3" />
                          文件名重复（已存在）
                        </span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={r.status} />
                    </Td>
                    <Td className="w-[120px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'category',
                        readValue: CATEGORY_LABEL[r.category] || r.category,
                        renderEditor: () => (
                          <select
                            autoFocus
                            defaultValue={r.category}
                            onBlur={(e) => commitEdit(r.id, 'category', e.currentTarget.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.currentTarget as HTMLSelectElement).blur()
                            }}
                            className="w-full px-2 py-1 text-sm rounded-md border border-brand-400 dark:border-brand-500 bg-white dark:bg-slate-900"
                          >
                            {CATEGORY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ),
                      })}
                    </Td>
                    <Td className="w-[150px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'invoiceNo',
                        readValue: r.invoiceNo || <span className="text-slate-400 italic">未识别</span>,
                        initString: r.invoiceNo || '',
                      })}
                    </Td>
                    <Td className="w-[130px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'date',
                        readValue: r.date,
                        initString: r.date,
                        renderEditor: () => (
                          <input
                            autoFocus
                            type="date"
                            defaultValue={r.date}
                            onBlur={(e) => commitEdit(r.id, 'date', e.currentTarget.value)}
                            className="w-full px-2 py-1 text-sm rounded-md border border-brand-400 dark:border-brand-500 bg-white dark:bg-slate-900"
                          />
                        ),
                      })}
                    </Td>
                    <Td align="right" className="w-[110px] font-medium tabular-nums">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'amount',
                        readValue: r.amount.toFixed(2),
                        initString: r.amount.toFixed(2),
                        align: 'right',
                      })}
                    </Td>
                    <Td align="right" className="w-[110px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'taxAmount',
                        readValue: ((r.taxAmount as number | undefined) ?? 0).toFixed(2),
                        initString: ((r.taxAmount as number | undefined) ?? 0).toFixed(2),
                        align: 'right',
                      })}
                    </Td>
                    <Td align="right" className="w-[110px] font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                      {((r.totalAmount as number | undefined) ?? r.amount).toFixed(2)}
                    </Td>
                    <Td className="w-[160px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'sellerName',
                        readValue: (r.sellerName as string | undefined) || <span className="text-slate-400 italic">—</span>,
                        initString: (r.sellerName as string | undefined) || '',
                      })}
                    </Td>
                    <Td className="w-[160px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'buyerName',
                        readValue: (r.buyerName as string | undefined) || <span className="text-slate-400 italic">—</span>,
                        initString: (r.buyerName as string | undefined) || '',
                      })}
                    </Td>
                    <Td className="w-[220px]">
                      {renderEditableCell({
                        editingCell, startEdit, commitEdit, draftRef: editDraftRef,
                        id: r.id, field: 'description',
                        readValue: r.description || <span className="text-slate-400 italic">—</span>,
                        initString: r.description || '',
                        multiline: true,
                      })}
                    </Td>
                    <Td className="w-[120px] sticky right-0 bg-inherit group-hover:bg-slate-50/60 dark:group-hover:bg-slate-800/40">
                      <div className="flex items-center justify-end gap-1 text-xs">
                        <button
                          onClick={() => onOpenEdit?.(r.id)}
                          title="打开完整 OCR 校正面板"
                          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-brand-600"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onReparse(r.id)}
                          title="重新识别"
                          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                          disabled={r.status === 'processing'}
                        >
                          {r.status === 'processing' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => onDeleteInvoice([r.id])}
                          title="删除此行"
                          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 dark:hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            {/* 合计行（sticky 底部） */}
            <tfoot className="sticky bottom-0 z-10 bg-slate-50 dark:bg-slate-800/80 backdrop-blur text-sm">
              <tr className="font-semibold text-slate-800 dark:text-slate-100 border-t-2 border-slate-200 dark:border-slate-700">
                <td colSpan={2} className="px-4 py-3"></td>
                <td className="px-4 py-3">
                  合计 {totals.cnt} 张成功 / {sorted.length} 总行
                </td>
                <td colSpan={4}></td>
                <td align="right" className="px-4 py-3 tabular-nums">{totals.amt.toFixed(2)}</td>
                <td align="right" className="px-4 py-3 tabular-nums text-slate-500 dark:text-slate-300">{totals.tax.toFixed(2)}</td>
                <td align="right" className="px-4 py-3 tabular-nums text-brand-700 dark:text-brand-300">{totals.tot.toFixed(2)}</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ---------- 小组件：Th（可排序） ---------- */
function Th(props: {
  children?: React.ReactNode
  onClick?: () => void
  sortDir?: SortDir
  align?: 'left' | 'right'
  style?: React.CSSProperties
  className?: string
  stickyRight?: boolean
}) {
  const sortable = !!props.onClick
  const Ind =
    !props.sortDir ? <ArrowUpDown className="w-3 h-3 opacity-60" />
    : props.sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-brand-600" />
    : <ArrowDown className="w-3 h-3 text-brand-600" />
  const align = props.align === 'right' ? 'text-right' : 'text-left'
  return (
    <th
      className={`px-4 py-3 font-semibold select-none ${align} ${props.className || ''}`}
      style={props.style}
      onClick={props.onClick}
    >
      <span className={`inline-flex items-center gap-1 ${sortable ? 'cursor-pointer hover:text-slate-700 dark:hover:text-slate-100' : ''}`}>
        <span>{props.children}</span>
        {sortable && Ind}
      </span>
    </th>
  )
}
function Td(props: {
  children?: React.ReactNode
  style?: React.CSSProperties
  align?: 'left' | 'right'
  className?: string
  title?: string
  colSpan?: number
  rowSpan?: number
}) {
  const align = props.align === 'right' ? 'text-right' : 'text-left'
  return (
    <td
      className={`px-4 py-3 ${align} ${props.className || ''}`}
      style={props.style}
      title={props.title}
      colSpan={props.colSpan}
      rowSpan={props.rowSpan}
    >
      {props.children}
    </td>
  )
}

/* ---------- 小组件：状态徽章 ---------- */
function StatusBadge({ status }: { status: OcrInvoice['status'] }) {
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
        <CheckCircle2 className="w-3 h-3" />
        识别成功
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50">
        <Loader2 className="w-3 h-3 animate-spin" />
        识别中…
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-800/50">
        <AlertCircle className="w-3 h-3" />
        识别失败
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
      待上传
    </span>
  )
}

/* ---------- 小组件：可编辑单元格（文本 / 下拉 / date / number） ---------- */
interface EditCellArgs {
  editingCell: string | null
  startEdit: (key: string, init: string) => void
  commitEdit: (id: string, field: keyof AnyInvoice, raw: string) => void
  draftRef: React.MutableRefObject<string>
  id: string
  field: keyof AnyInvoice
  readValue: React.ReactNode
  initString?: string
  align?: 'left' | 'right'
  multiline?: boolean
  renderEditor?: () => React.ReactNode
}
function renderEditableCell(args: EditCellArgs) {
  const key = `${args.id}:${String(args.field)}`
  const active = args.editingCell === key
  const align = args.align === 'right' ? 'text-right' : 'text-left'
  if (active) {
    if (args.renderEditor) return args.renderEditor()
    const common = `w-full px-2 py-1 text-sm rounded-md border border-brand-400 dark:border-brand-500 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-brand-500/30 ${align}`
    if (args.multiline) {
      return (
        <textarea
          autoFocus
          defaultValue={args.initString || ''}
          rows={2}
          className={common + ' resize-y'}
          onChange={(e) => (args.draftRef.current = e.currentTarget.value)}
          onBlur={(e) => args.commitEdit(args.id, args.field, e.currentTarget.value)}
        />
      )
    }
    return (
      <input
        autoFocus
        type="text"
        defaultValue={args.initString || ''}
        onChange={(e) => (args.draftRef.current = e.currentTarget.value)}
        onBlur={(e) => args.commitEdit(args.id, args.field, e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
        }}
        className={common}
      />
    )
  }
  return (
    <div
      onClick={() => args.startEdit(key, args.initString ?? String(args.readValue ?? ''))}
      className={`inline-flex w-full px-1.5 py-0.5 rounded-md cursor-text border border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900 transition-colors ${align} min-h-[28px] items-center`}
      title="点击编辑（回车保存，Esc 取消）"
    >
      {args.readValue}
    </div>
  )
}

/* 占位，避免 React Tree Shake 误报 */
export const _InvoiceTableComponentsInternal = { Undo2, ChevronDown }
