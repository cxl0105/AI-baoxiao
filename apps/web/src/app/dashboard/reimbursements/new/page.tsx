'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray, Controller, SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowLeft,
  Upload,
  FileText,
  Calendar,
  Sparkles,
  Plus,
  Trash2,
  Save,
  Send,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  XCircle,
  Camera,
  Pencil,
  RefreshCw,
  LayoutGrid,
  List,
} from 'lucide-react'
import {
  api,
  formatApiError,
  reparseOcr,
  parseAmount,
  parseDate,
  parseInvoiceNo,
  parseCategory,
  type ExpenseCategory,
  type OcrInvoice,
  type ExpenseItemForm,
  CATEGORY_LABEL,
} from '@/lib/api'
import { useSettingsStore } from '@/lib/settings'
import { useSubmittedStore } from '@/lib/submitted-store'

const fileToDataUrl = (f: File): Promise<string> => new Promise((resolve) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result || ''))
  r.onerror = () => resolve('')
  r.readAsDataURL(f)
})
import { InvoiceTable } from '@/components/invoice-table'
import type { AnyInvoice } from '@/components/invoice-table'
import { InvoiceSummary } from '@/components/invoice-summary'

// --- Zod 校验规则 ---
const categorySchema = z.enum([
  'travel',
  'meal',
  'office',
  'communication',
  'transport',
  'entertainment',
  'training',
  'other',
])

const itemSchema = z.object({
  id: z.string(),
  category: categorySchema,
  amount: z.number().positive('金额必须大于 0').max(999999.99, '金额过大'),
  description: z.string().min(2, '说明至少 2 个字符').max(200, '说明最多 200 个字符'),
  invoiceNo: z.string().max(60, '发票号过长').optional().or(z.literal('')),
  date: z.string().min(1, '请选择日期'),
  // 非校验字段：关联 invoiceId，用于 OCR 回写
  linkedInvoiceId: z.string().optional(),
})

const formSchema = z
  .object({
    title: z.string().min(3, '报销单标题至少 3 个字符').max(80, '标题最多 80 个字符'),
    type: z.enum(['travel', 'purchase', 'daily', 'conference', 'training', 'other'], {
      required_error: '请选择报销类型',
    }),
    department: z.string().min(2, '请选择或填写部门'),
    description: z.string().max(500, '说明最多 500 个字符').optional().or(z.literal('')),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    items: z
      .array(itemSchema)
      .min(1, '至少需要 1 条费用明细，可通过上传发票自动生成或手动添加'),
  })
  .refine(
    (d) => {
      if (!d.startDate || !d.endDate) return true
      return new Date(d.endDate) >= new Date(d.startDate)
    },
    { message: '结束日期不能早于开始日期', path: ['endDate'] }
  )

type FormValues = Omit<z.infer<typeof formSchema>, 'items'> & {
  items: Array<z.infer<typeof itemSchema>>
}

// --- 常量 ---
const TYPE_OPTIONS: { value: FormValues['type']; label: string }[] = [
  { value: 'travel', label: '差旅报销' },
  { value: 'purchase', label: '采购报销' },
  { value: 'daily', label: '日常费用' },
  { value: 'conference', label: '会议报销' },
  { value: 'training', label: '培训报销' },
  { value: 'other', label: '其他' },
]

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'travel', label: '差旅住宿' },
  { value: 'transport', label: '交通出行' },
  { value: 'meal', label: '餐饮' },
  { value: 'office', label: '办公用品' },
  { value: 'communication', label: '通讯' },
  { value: 'entertainment', label: '招待/客户' },
  { value: 'training', label: '培训' },
  { value: 'other', label: '其他' },
]

const DEPARTMENT_OPTIONS = ['研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部', '行政部']

const makeEmptyItem = (linkedInvoiceId?: string): ExpenseItemForm & { linkedInvoiceId?: string } => ({
  id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
  category: 'other',
  amount: 0,
  description: '',
  invoiceNo: '',
  date: new Date().toISOString().slice(0, 10),
  ...(linkedInvoiceId ? { linkedInvoiceId } : {}),
})

// 把 OCR 识别结果转换为一条新的费用明细（保留双向关联）
const invoiceToItem = (inv: OcrInvoice): ExpenseItemForm & { linkedInvoiceId?: string } => ({
  id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
  category: inv.status === 'success' ? inv.category : 'other',
  amount: inv.status === 'success' ? inv.amount : 0,
  description: inv.status === 'success' ? inv.description : inv.fileName,
  invoiceNo: inv.invoiceNo,
  date: inv.date || new Date().toISOString().slice(0, 10),
  linkedInvoiceId: inv.id,
})

export default function NewReimbursementPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadedFilesRef = useRef<Map<string, File>>(new Map())
  const [invoices, setInvoices] = useState<OcrInvoice[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [serverError, setServerError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState<{ id: string; status: 'draft' | 'pending' } | null>(null)
  // 「出差 vs 日常」提醒弹窗
  const [typeChoiceOpen, setTypeChoiceOpen] = useState(false)
  const pendingSubmitModeRef = useRef<'submit' | 'draft'>('submit')

  // --- Settings: 默认视图 / 金额精度 ---
  const defaultView = useSettingsStore((s) => s.ui.invoiceViewMode)
  const amountPrecision = useSettingsStore((s) => s.ui.currencyPrecision)
  const [invoiceView, setInvoiceView] = useState<'card' | 'table'>(defaultView === 'cards' ? 'card' : 'table')

  // 文件名去重 Toast：{text, type}
  const [fileToast, setFileToast] = useState<{
    id: string; text: string; kind: 'error' | 'success' | 'warn'
  } | null>(null)
  // 被重复上传而高亮的文件名集合（红色闪动）
  const [dupFlashNames, setDupFlashNames] = useState<Set<string>>(new Set())
  const pushFileToast = (text: string, kind: 'error' | 'success' | 'warn' = 'warn') => {
    setFileToast({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4), text, kind })
    setTimeout(() => setFileToast((cur) => (cur && cur.text === text ? null : cur)), 3200)
  }
  const flashDupName = (names: string[]) => {
    if (!names.length) return
    setDupFlashNames((s) => {
      const next = new Set(s)
      names.forEach((n) => next.add(n))
      return next
    })
    setTimeout(() => {
      setDupFlashNames((s) => {
        const next = new Set(s)
        names.forEach((n) => next.delete(n))
        return next
      })
    }, 2200)
  }

  // OCR 编辑弹窗
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const editingInvoice = invoices.find((i) => i.id === editingInvoiceId) || null
  const [editDraft, setEditDraft] = useState<{
    category: ExpenseCategory
    amount: string
    date: string
    invoiceNo: string
    description: string
  } | null>(null)

  // --- React Hook Form ---
  const today = new Date().toISOString().slice(0, 10)
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      title: `日常费用报销 - ${today.replace(/-/g, '/').slice(0, 7)}`,
      type: 'daily',
      department: '研发部',
      description: '',
      startDate: today,
      endDate: today,
      items: [makeEmptyItem()],
    },
  })

  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'items' as const,
  })

  const items = watch('items')

  // --- 合计金额 ---
  const totalAmount = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0),
    [items]
  )

  // 工具：根据 invoiceId 找到对应 item 的 index
  const findItemIndexByInvoiceId = (invoiceId: string) =>
    items.findIndex((it: any) => it.linkedInvoiceId === invoiceId)

  // --- 处理一张新发票文件 ---
  const processFile = useCallback(
    async (file: File, { skipDupCheck }: { skipDupCheck?: boolean } = {}) => {
      const maxSize = 10 * 1024 * 1024
      if (file.size > maxSize) {
        setServerError(`文件 ${file.name} 过大（超过 10MB）`)
        return
      }
      if (!/\.(png|jpe?g|webp|gif|bmp|pdf)$/i.test(file.name)) {
        setServerError(`文件格式不支持：${file.name}（支持 PNG/JPG/WebP/PDF）`)
        return
      }

      // === 文件名去重 ===
      if (!skipDupCheck) {
        const normalized = file.name
        const exists = invoices.some((i) => i.fileName === normalized)
        if (exists) {
          pushFileToast(`检测到重复文件名：「${file.name}」已导入，本次拒绝导入，请修改文件名后重试`, 'error')
          flashDupName([normalized])
          return
        }
        // 整批多选时，同一批里不同实例同名也要拦（一次拖进来 2 个同文件名实际浏览器会去重，但保险起见）
      }
      setServerError('')

      const invoiceId = 'ocr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
      uploadedFilesRef.current.set(invoiceId, file)

      const pendingInvoice: OcrInvoice = {
        id: invoiceId,
        fileName: file.name,
        invoiceNo: '',
        category: 'other',
        amount: 0,
        date: '',
        description: '',
        status: 'processing',
      }
      if (file.type.startsWith('image/')) {
        pendingInvoice.thumbnailUrl = URL.createObjectURL(file)
      }
      setInvoices((list) => [...list, pendingInvoice])

      try {
        const result = await api.uploadInvoice(file)
        const updated: OcrInvoice = {
          ...result,
          id: invoiceId,
          thumbnailUrl: pendingInvoice.thumbnailUrl || result.thumbnailUrl,
        }
        setInvoices((list) => list.map((it) => (it.id === invoiceId ? updated : it)))

        if (result.status === 'success') {
          // OCR 成功 → 新建一条明细并绑定 linkedInvoiceId
          append(invoiceToItem(updated) as any)
          // 发票落库到后端 invoices 表（真实持久化，供发票池/验真/查重使用）
          api.createInvoice({
            fileName: file.name,
            invoiceNumber: (result as any).invoiceNo || '',
            amount: result.amount || 0,
            taxAmount: (result as any).taxAmount || 0,
            date: (result as any).date || '',
            sellerName: (result as any).sellerName || '',
            sellerTaxId: (result as any).sellerTaxNo || '',
            buyerName: (result as any).buyerName || '',
            description: result.description || '',
          }).catch(() => { /* 落库失败不阻断 OCR 主流程 */ })
          pushFileToast(
            `识别成功：${file.name}（¥ ${result.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}）`,
            'success'
          )
        } else {
          pushFileToast(`识别完成但状态异常：${file.name}`, 'warn')
        }
      } catch (e) {
        setInvoices((list) =>
          list.map((it) =>
            it.id === invoiceId
              ? { ...it, status: 'failed' as const, error: formatApiError(e) }
              : it
          )
        )
        setServerError(`识别「${file.name}」失败：${formatApiError(e)}`)
      }
    },
    [append, invoices]
  )

  const onFilePick = (files: FileList | null) => {
    if (!files || !files.length) return
    const incoming = Array.from(files)
    // --- 批次级去重：先一次性检查 ---
    const existingNames = new Set(invoices.map((i) => i.fileName))
    const dupInThisBatch = new Set<string>()
    const dups: string[] = []
    const batchSeen = new Set<string>()
    const okFiles: File[] = []
    for (const f of incoming) {
      const name = f.name
      if (existingNames.has(name) || dupInThisBatch.has(name)) {
        if (!dups.includes(name)) dups.push(name)
        continue
      }
      if (batchSeen.has(name)) {
        if (!dups.includes(name)) dups.push(name)
        continue
      }
      batchSeen.add(name)
      okFiles.push(f)
    }
    if (dups.length > 0) {
      flashDupName(dups)
      if (dups.length === 1) {
        pushFileToast(`拒绝导入：文件名「${dups[0]}」已存在，请修改文件名后重试`, 'error')
      } else {
        pushFileToast(`拒绝导入：检测到 ${dups.length} 个重复文件名（${dups.slice(0, 2).join('、')}${dups.length > 2 ? '…' : ''}）`, 'error')
      }
    }
    okFiles.forEach((f) => void processFile(f, { skipDupCheck: true }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // --- 拖拽 ---
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    onFilePick(e.dataTransfer.files)
  }

  // --- 重新识别失败发票 ---
  const retryRecognize = async (invoiceId: string) => {
    const file = uploadedFilesRef.current.get(invoiceId)
    if (!file) {
      setServerError('找不到原始文件，无法重新识别')
      return
    }
    setInvoices((list) =>
      list.map((it) => (it.id === invoiceId ? { ...it, status: 'processing', error: undefined } : it))
    )
    try {
      const old = invoices.find((i) => i.id === invoiceId)!
      const result = await reparseOcr(file)
      const updated: OcrInvoice = {
        ...result,
        id: invoiceId,
        thumbnailUrl: old.thumbnailUrl,
      }
      setInvoices((list) => list.map((it) => (it.id === invoiceId ? updated : it)))

      // 如果之前没绑定明细 → 新建；否则覆盖旧绑定的明细
      const existingIdx = findItemIndexByInvoiceId(invoiceId)
      if (existingIdx === -1) {
        append(invoiceToItem(updated) as any)
      } else {
        const item = items[existingIdx] as any
        update(existingIdx, {
          ...item,
          category: result.category,
          amount: result.amount,
          description: result.description,
          invoiceNo: result.invoiceNo,
          date: result.date || item.date,
        } as any)
      }
    } catch (e) {
      setInvoices((list) =>
        list.map((it) =>
          it.id === invoiceId ? { ...it, status: 'failed', error: formatApiError(e) } : it
        )
      )
      setServerError('重新识别失败：' + formatApiError(e))
    }
  }

  // --- 删除发票 ---
  const removeInvoice = (invoiceId: string) => {
    setInvoices((list) => {
      const target = list.find((x) => x.id === invoiceId)
      if (target?.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl)
      return list.filter((x) => x.id !== invoiceId)
    })
    uploadedFilesRef.current.delete(invoiceId)
    // 同步删除对应费用明细
    const idx = findItemIndexByInvoiceId(invoiceId)
    if (idx >= 0 && fields.length > 1) remove(idx)
  }

  // --- 打开编辑弹窗 ---
  const openEdit = (inv: OcrInvoice) => {
    setEditingInvoiceId(inv.id)
    setEditDraft({
      category: inv.category,
      amount: inv.amount ? String(inv.amount) : '',
      date: inv.date || today,
      invoiceNo: inv.invoiceNo || '',
      description: inv.description || '',
    })
  }

  // --- 保存编辑结果：同时更新发票卡片和绑定的费用明细 ---
  const saveEdit = () => {
    if (!editingInvoiceId || !editDraft) return
    // 1) 校验
    const amtNum = parseAmount(editDraft.amount)
    if (amtNum == null) {
      setServerError('请填写正确的金额（如 128.50）')
      return
    }
    const cat = editDraft.category || (parseCategory(editDraft.description, '').category as ExpenseCategory)
    const date = parseDate(editDraft.date, today)
    const invoiceNo = parseInvoiceNo(editDraft.invoiceNo, date)
    const description = editDraft.description || '手动修正后的发票'

    const newInvoice: OcrInvoice = {
      ...(invoices.find((i) => i.id === editingInvoiceId)!),
      category: cat,
      amount: amtNum,
      date,
      invoiceNo,
      description,
      status: 'success',
      error: undefined,
    }
    setInvoices((list) => list.map((it) => (it.id === editingInvoiceId ? newInvoice : it)))

    // 2) 回写到对应费用明细
    const idx = findItemIndexByInvoiceId(editingInvoiceId)
    if (idx >= 0) {
      const old = items[idx] as any
      update(idx, {
        ...old,
        category: cat,
        amount: amtNum,
        description,
        invoiceNo,
        date,
      } as any)
    } else {
      append(invoiceToItem(newInvoice) as any)
    }

    setEditingInvoiceId(null)
    setEditDraft(null)
    setServerError('')
  }

  // --- 表格行编辑：更新发票并同步关联的费用明细（双向绑定） ---
  const patchInvoiceFromTable = useCallback(
    (id: string, patch: Partial<AnyInvoice>) => {
      // 1) 更新 invoices
      setInvoices((list) =>
        list.map((it) => (it.id === id ? ({ ...it, ...patch } as OcrInvoice) : it))
      )
      // 2) 同步到对应费用明细（只同步费用表有对应字段的）
      const idx = findItemIndexByInvoiceId(id)
      if (idx >= 0) {
        const old = items[idx] as any
        const next = { ...old }
        let changed = false
        if (patch.category !== undefined && patch.category !== old.category) {
          next.category = patch.category
          changed = true
        }
        if (typeof patch.amount === 'number' && patch.amount !== old.amount) {
          next.amount = patch.amount
          changed = true
        }
        if (patch.invoiceNo !== undefined && patch.invoiceNo !== old.invoiceNo) {
          next.invoiceNo = patch.invoiceNo
          changed = true
        }
        if (patch.date !== undefined && patch.date !== old.date) {
          next.date = patch.date || old.date
          changed = true
        }
        if (patch.description !== undefined && patch.description !== old.description) {
          next.description = patch.description || old.description
          changed = true
        }
        if (changed) update(idx, next as any)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, update]
  )

  // --- 批量删除发票（同步删除关联费用明细） ---
  const removeInvoicesBatch = useCallback(
    (ids: string[]) => {
      // 1) 删除 invoices + 释放缩略图 blob
      setInvoices((list) => {
        const toDel = new Set(ids)
        list.forEach((inv) => {
          if (toDel.has(inv.id) && inv.thumbnailUrl) URL.revokeObjectURL(inv.thumbnailUrl)
          if (toDel.has(inv.id)) uploadedFilesRef.current.delete(inv.id)
        })
        return list.filter((x) => !toDel.has(x.id))
      })
      // 2) 删除对应的费用明细（从后往前删，避免索引漂移）
      const idxs: number[] = []
      ids.forEach((id) => {
        const idx = findItemIndexByInvoiceId(id)
        if (idx >= 0) idxs.push(idx)
      })
      if (idxs.length) {
        const sorted = [...idxs].sort((a, b) => b - a)
        const toRemove = new Set(sorted)
        // 注意 remove 支持传 index 数组（RHF API 支持）
        remove(Array.from(toRemove) as any)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items]
  )

  // 快捷：失败发票数
  const failedCount = useMemo(
    () => invoices.filter((i) => i.status === 'failed').length,
    [invoices]
  )

  // --- 提交 ---
  const doSubmit: SubmitHandler<FormValues> = async (values, ev) => {
    setServerError('')
    const submitter = (ev?.nativeEvent as any)?.submitter as HTMLElement | undefined
    const isSubmit = pendingSubmitModeRef.current === 'submit' ? true : submitter?.dataset?.action === 'submit'
    try {
      const result = await api.createReimbursement({ ...(values as any), submit: isSubmit })
      // 打通：把真实发票转 base64 持久化，供审批预览
      try {
        const invList = await Promise.all(invoices.map(async (inv) => {
          const f = uploadedFilesRef.current.get(inv.id)
          let dataUrl = ''
          if (typeof inv.thumbnailUrl === 'string' && inv.thumbnailUrl.startsWith('data:')) dataUrl = inv.thumbnailUrl
          if (!dataUrl && f) dataUrl = await fileToDataUrl(f)
          return { name: inv.fileName || (f ? f.name : '发票.jpg'), size: f ? Math.round(f.size / 1024) : 0, dataUrl }
        }))
        useSubmittedStore.getState().add({
          id: result.id,
          code: 'BX-' + result.id,
          title: values.title || '报销单',
          type: values.type || 'daily',
          department: values.department || '',
          submitter: '申请人',
          totalAmount: invoices.reduce((sum, x) => sum + (x.amount || 0), 0),
          status: isSubmit ? 'pending' : 'draft',
          createdAt: new Date().toISOString(),
          items: invoices.map((inv) => ({ category: inv.category, amount: inv.amount, description: inv.description, invoiceNo: inv.invoiceNo, date: inv.date })),
          invoices: invList,
        })
      } catch (e) { /* 持久化失败忽略 */ }
      setSubmitSuccess({
        id: result.id,
        status: (result.status as 'draft' | 'pending') || (isSubmit ? 'pending' : 'draft'),
      })
    } catch (e) {
      setServerError(formatApiError(e))
    }
  }

  // 清理缩略图
  useEffect(() => {
    return () => {
      invoices.forEach((inv) => inv.thumbnailUrl && URL.revokeObjectURL(inv.thumbnailUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // === 成功页面 ===
  if (submitSuccess) {
    const label = submitSuccess.status === 'pending' ? '已提交审批流程' : '草稿已保存'
    const tip =
      submitSuccess.status === 'pending'
        ? '审批人将收到通知，你可以在「我的报销」中查看最新进度'
        : '你随时可以返回此草稿继续编辑或提交审批'
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{label}</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            报销单号：
            <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
              {submitSuccess.id}
            </span>
          </p>
          <p className="text-slate-500 dark:text-slate-400 mb-8">{tip}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/dashboard/reimbursements"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors shadow-lg shadow-brand-600/20"
            >
              <FileText className="w-4 h-4" />
              查看我的报销
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              返回工作台
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* 顶部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/reimbursements"
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">新建报销单</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              支持拖拽上传多张发票，由 AI 自动识别并填充费用明细（识别结果可手动修正）
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSubmit(doSubmit)()}
            data-action="draft"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl disabled:opacity-60 transition-colors"
          >
            <Save className="w-4 h-4" />
            保存草稿
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit(doSubmit)} className="space-y-6" noValidate>
        {/* AI 发票上传区 */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 dark:text-white">AI 发票识别</h2>
                <p className="text-xs text-slate-400 truncate">
                  识别结果可点表格单元格直接校正 / 或点「铅笔」打开详情；校正后自动同步到费用明细
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-slate-400 hidden md:inline">PNG / JPG / PDF · 单张 ≤10MB</span>
              <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setInvoiceView('card')}
                  title="卡片视图（适合少量发票 + 大图预览）"
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    invoiceView === 'card'
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  卡片
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceView('table')}
                  title="表格视图（批量核对、修改、分类统计、导出 CSV）"
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors border-l border-slate-200 dark:border-slate-700 ${
                    invoiceView === 'table'
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  表格
                </button>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`block cursor-pointer rounded-2xl border-2 border-dashed transition-all ${
                isDragging
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-700 bg-slate-50 dark:bg-slate-800/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,application/pdf"
                className="hidden"
                onChange={(e) => onFilePick(e.target.files)}
              />
              <div className="px-6 py-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center mb-3">
                  <Camera className="w-7 h-7 text-brand-600 dark:text-brand-400" />
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-1">
                  点击选择文件，或直接把发票拖拽到这里
                </p>
                <p className="text-xs text-slate-400">
                  支持一次上传多张；建议文件名含线索，如「餐饮_¥128_6月15日.jpg」→ 识别更准
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30 rounded-lg">
                  <Upload className="w-4 h-4" />
                  选择发票文件
                </div>
              </div>
            </label>

            {invoices.length > 0 && (
              <InvoiceSummary
                invoices={invoices as AnyInvoice[]}
                precision={amountPrecision ?? 2}
                failedCount={failedCount}
              />
            )}

            {invoices.length > 0 && (
              <>
                {invoiceView === 'card' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {invoices.map((inv) => {
                      const isDup = dupFlashNames.has(inv.fileName)
                      return (
                      <div
                        key={inv.id}
                        className={`relative group rounded-xl border overflow-hidden transition-all ${
                          isDup
                            ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20 animate-pulse shadow-lg shadow-red-200 dark:shadow-red-900/30 ring-2 ring-red-200 dark:ring-red-800'
                            : inv.status === 'failed'
                            ? 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/10'
                            : inv.status === 'processing'
                            ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700'
                        }`}
                      >
                    {/* 重复提示徽章 */}
                    {isDup && (
                      <div className="absolute top-1.5 left-1.5 z-20 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-semibold shadow">
                        <AlertTriangle className="w-3 h-3" /> 文件名重复（已存在）
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 opacity-90">
                      {inv.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => retryRecognize(inv.id)}
                          className="p-1.5 rounded-md bg-white/90 dark:bg-slate-800/90 backdrop-blur text-brand-600 hover:text-brand-700"
                          title="重新识别"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      )}
                      {inv.status !== 'processing' && (
                        <button
                          type="button"
                          onClick={() => openEdit(inv)}
                          className="p-1.5 rounded-md bg-white/90 dark:bg-slate-800/90 backdrop-blur text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                          title="校正识别结果"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeInvoice(inv.id)}
                        className="p-1.5 rounded-md bg-white/90 dark:bg-slate-800/90 backdrop-blur text-slate-400 hover:text-red-500"
                        title="移除"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 缩略图 */}
                    <div className="h-32 bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden relative">
                      {inv.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={inv.thumbnailUrl} alt={inv.fileName} className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                      )}
                      {inv.status === 'processing' && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                          <Loader2 className="w-7 h-7 animate-spin mb-1.5" />
                          <p className="text-xs">AI 正在识别中...</p>
                        </div>
                      )}
                    </div>

                    {/* 识别内容 */}
                    <div className="p-3 space-y-1">
                      <p className="text-xs text-slate-400 truncate">{inv.fileName}</p>
                      {inv.status === 'success' && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                              识别成功
                            </span>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              ¥ {inv.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>{CATEGORY_LABEL[inv.category] || CATEGORY_OPTIONS.find((c) => c.value === inv.category)?.label}</span>
                            <span className="font-mono">{inv.date}</span>
                          </div>
                          {inv.invoiceNo && (
                            <div className="text-[11px] text-slate-400 truncate font-mono">
                              发票号：{inv.invoiceNo}
                            </div>
                          )}
                          {inv.description && (
                            <div className="text-[11px] text-slate-500 truncate">项目：{inv.description}</div>
                          )}
                          {inv.sellerName && (
                            <div className="text-[11px] text-slate-400 truncate">销方：{inv.sellerName}</div>
                          )}
                          {inv.sellerTaxNo && (
                            <div className="text-[11px] text-slate-400 truncate font-mono">销方税号：{inv.sellerTaxNo}</div>
                          )}
                          {inv.buyerName && (
                            <div className="text-[11px] text-slate-400 truncate">购方：{inv.buyerName}</div>
                          )}
                          {inv.buyerTaxNo && (
                            <div className="text-[11px] text-slate-400 truncate font-mono">购方税号：{inv.buyerTaxNo}</div>
                          )}
                        </>
                      )}
                      {inv.status === 'failed' && (
                        <div className="flex items-start gap-1.5 pt-1">
                          <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-red-600 dark:text-red-300">
                            {inv.error || '识别失败，请重试或手动录入'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            ) : (
              <InvoiceTable
                invoices={invoices as AnyInvoice[]}
                onUpdateInvoice={patchInvoiceFromTable}
                onDeleteInvoice={removeInvoicesBatch}
                onReparse={retryRecognize}
                onOpenEdit={(id) => {
                  const inv = invoices.find((x) => x.id === id)
                  if (inv) openEdit(inv)
                }}
                onSwitchToCards={() => setInvoiceView('card')}
                dupFlashNames={dupFlashNames}
              />
            )}
              </>
            )}
          </div>
        </section>

        {/* 基本信息 */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-400" />
            基本信息
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                报销单标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="如：2024年6月北京出差报销"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                  errors.title ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                }`}
                {...register('title')}
              />
              {errors.title && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.title.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                报销类型 <span className="text-red-500">*</span>
              </label>
              <select
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                  errors.type ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                }`}
                {...register('type')}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {errors.type && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.type.message as string}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                所属部门 <span className="text-red-500">*</span>
              </label>
              <select
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                  errors.department ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                }`}
                {...register('department')}
              >
                {DEPARTMENT_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {errors.department && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.department.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">开始日期</label>
              <input
                type="date"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                {...register('startDate')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">结束日期</label>
              <input
                type="date"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                  errors.endDate ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                }`}
                {...register('endDate')}
              />
              {errors.endDate && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.endDate.message as string}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">附加说明</label>
              <textarea
                rows={3}
                placeholder="可选：补充说明报销事由等信息"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
                {...register('description')}
              />
            </div>
          </div>
        </section>

        {/* 费用明细 */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              费用明细
              <span className="ml-1 text-xs font-medium text-slate-400">
                共 {fields.length} 条 · 合计
                <span className="text-brand-600 dark:text-brand-400 ml-1">
                  ¥ {totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </span>
              </span>
            </h2>
            <button
              type="button"
              onClick={() => append(makeEmptyItem() as any)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              手动添加一条
            </button>
          </div>

          {errors.items?.root && (
            <div className="mx-5 mt-3">
              <p className="text-sm text-red-500 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                {(errors.items.root as any)?.message as string}
              </p>
            </div>
          )}

          <div className="hidden md:grid grid-cols-[1fr_1.2fr_1fr_1.3fr_1.2fr_0.8fr_0.5fr] gap-3 px-5 py-2.5 text-xs font-medium text-slate-400 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <div>日期</div>
            <div>费用类别</div>
            <div>发票号</div>
            <div>费用说明</div>
            <div>金额（元）</div>
            <div>操作</div>
            <div></div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {fields.map((field, idx) => {
              const err = (errors.items as any)?.[idx]
              return (
                <div key={field.id} className="px-5 py-4">
                  <div className="md:grid grid-cols-[1fr_1.2fr_1fr_1.3fr_1.2fr_0.8fr_0.5fr] gap-3 items-start space-y-3 md:space-y-0">
                    <div>
                      <span className="md:hidden inline-block text-xs font-medium text-slate-400 mb-1">日期</span>
                      <input
                        type="date"
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          err?.date ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                        }`}
                        {...register(`items.${idx}.date`)}
                      />
                      {err?.date && <p className="mt-1 text-xs text-red-500">{err.date.message as string}</p>}
                    </div>
                    <div>
                      <span className="md:hidden inline-block text-xs font-medium text-slate-400 mb-1">费用类别</span>
                      <Controller
                        control={control}
                        name={`items.${idx}.category`}
                        render={({ field: f }) => (
                          <select
                            value={f.value}
                            onChange={f.onChange}
                            className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                              err?.category ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                            }`}
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        )}
                      />
                      {err?.category && <p className="mt-1 text-xs text-red-500">{err.category.message as string}</p>}
                    </div>
                    <div>
                      <span className="md:hidden inline-block text-xs font-medium text-slate-400 mb-1">发票号</span>
                      <input
                        type="text"
                        placeholder="如 INV2024..."
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          err?.invoiceNo ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                        }`}
                        {...register(`items.${idx}.invoiceNo`)}
                      />
                      {err?.invoiceNo && <p className="mt-1 text-xs text-red-500">{err.invoiceNo.message as string}</p>}
                    </div>
                    <div>
                      <span className="md:hidden inline-block text-xs font-medium text-slate-400 mb-1">费用说明</span>
                      <input
                        type="text"
                        placeholder="请简单说明用途"
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          err?.description ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                        }`}
                        {...register(`items.${idx}.description`)}
                      />
                      {err?.description && <p className="mt-1 text-xs text-red-500">{err.description.message as string}</p>}
                    </div>
                    <div>
                      <span className="md:hidden inline-block text-xs font-medium text-slate-400 mb-1">金额（元）</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        className={`w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                          err?.amount ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                        }`}
                        {...register(`items.${idx}.amount`, { valueAsNumber: true })}
                      />
                      {err?.amount && <p className="mt-1 text-xs text-red-500">{err.amount.message as string}</p>}
                    </div>
                    <div className="flex md:justify-end md:items-center md:h-[42px]">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        disabled={fields.length <= 1}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="md:hidden">删除</span>
                      </button>
                    </div>
                    <div />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {serverError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-700 dark:text-red-200">{serverError}</div>
          </div>
        )}

        {/* 底部提交栏 */}
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 pb-5 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent dark:from-slate-950 dark:via-slate-950/95">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg sm:shadow-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">费用明细合计</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                ¥ {totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => reset()}
                disabled={isSubmitting}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl disabled:opacity-50 transition-colors"
              >
                重置
              </button>
              <button
                type="submit"
                data-action="draft"
                disabled={isSubmitting}
                className="sm:hidden inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                保存草稿
              </button>
              <button
                type="button"
                onClick={() => setTypeChoiceOpen(true)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-brand-600/20 hover:shadow-xl hover:shadow-brand-600/30 transition-all"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                提交报销
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* ===== OCR 校正弹窗 ===== */}
      {/* ===== 出差/日常 报销方式选择弹窗 ===== */}
      {typeChoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTypeChoiceOpen(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-brand-600" />
                选择报销方式
              </h3>
              <button onClick={() => setTypeChoiceOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                请确认本次报销类型，不同方式对应不同流程：
              </p>
              <button
                type="button"
                onClick={() => {
                  setTypeChoiceOpen(false)
                  pendingSubmitModeRef.current = 'submit'
                  void handleSubmit(doSubmit)()
                }}
                disabled={isSubmitting}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-colors text-left disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">日常报销 · 直接提交</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    仅报销发票金额（餐饮、办公、交通等），OCR/手动录入后直接提交审批
                  </p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeChoiceOpen(false)
                  router.push('/dashboard/reimbursements/spreadsheet')
                }}
                className="w-full flex items-start gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">出差报销 · 走电子表格</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    差旅含补贴（住宿/交通/餐补等），通过电子表格报销单填写并多级签字递交
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {editingInvoice && editDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setEditingInvoiceId(null); setEditDraft(null) }} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-brand-600" />
                校正识别结果
              </h3>
              <button onClick={() => { setEditingInvoiceId(null); setEditDraft(null) }} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="flex items-center gap-3">
                {editingInvoice.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={editingInvoice.thumbnailUrl}
                    alt=""
                    className="w-20 h-20 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{editingInvoice.fileName}</p>
                  <p className="text-xs text-slate-400 mt-0.5">修改后会自动同步到对应费用明细</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">费用类别</label>
                <select
                  value={editDraft.category}
                  onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as ExpenseCategory })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">金额（元）</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="例如 128.50"
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft({ ...editDraft, amount: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">开票日期</label>
                <input
                  type="date"
                  value={editDraft.date}
                  onChange={(e) => setEditDraft({ ...editDraft, date: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">发票号码</label>
                <input
                  type="text"
                  placeholder="如 INV20240615001234"
                  value={editDraft.invoiceNo}
                  onChange={(e) => setEditDraft({ ...editDraft, invoiceNo: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">费用说明</label>
                <input
                  type="text"
                  placeholder="如：出差上海 XX 酒店住宿费"
                  value={editDraft.description}
                  onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30">
              <button
                type="button"
                onClick={() => { setEditingInvoiceId(null); setEditDraft(null) }}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow shadow-brand-600/20"
              >
                <CheckCircle2 className="w-4 h-4" />
                保存并同步
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文件去重 / OCR 结果 Toast — 通过 Portal 渲染到 body，避免被父级 overflow/transform 截断 */}
      {fileToast &&
        typeof document !== 'undefined' &&
        createPortal(
          <div key={fileToast.id} className="pointer-events-none fixed inset-0 z-[9999] flex items-end justify-center pb-10">
            <div
              className={`pointer-events-auto inline-flex items-start gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium border backdrop-blur max-w-[92vw] ${
                fileToast.kind === 'success'
                  ? 'bg-emerald-600/95 text-white border-emerald-500/30'
                  : fileToast.kind === 'error'
                  ? 'bg-red-600/95 text-white border-red-500/30'
                  : 'bg-slate-900/95 text-white border-slate-700/40 dark:bg-slate-100/95 dark:text-slate-900'
              }`}
            >
              {fileToast.kind === 'success' && <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-white/90" />}
              {fileToast.kind === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-200" />}
              {fileToast.kind === 'warn' && <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-300" />}
              <span className="whitespace-pre-wrap break-words">{fileToast.text}</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
