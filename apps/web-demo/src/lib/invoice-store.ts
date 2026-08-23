'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ============ 类型定义 ============

/** 发票类型 */
export type InvoiceType =
  | 'vat_special'      // 增值税专用发票
  | 'vat_normal'       // 增值税普通发票
  | 'electronic'       // 电子普通发票
  | 'electronic_special' // 电子专用发票
  | 'travel'           // 机票/火车票
  | 'toll'             // 通行费
  | 'receipt'          // 收据/其他

/** 发票状态 */
export type InvoiceStatus =
  | 'unused'           // 未使用
  | 'used'             // 已报销
  | 'void'             // 已作废
  | 'duplicate'        // 查重异常（重复）

/** 验真状态 */
export type VerifyStatus = 'unverified' | 'verifying' | 'verified' | 'failed'

/** 验真检查项结果 */
export interface VerifyCheckItem {
  /** 检查项名称 */
  label: string
  /** 检查结果 */
  status: 'pass' | 'fail' | 'warn'
  /** 详情说明 */
  detail: string
}

/** 验真详情 */
export interface VerifyDetails {
  /** 查验来源 */
  source: string
  /** 查验时间 */
  checkedAt: string
  /** 校验项列表 */
  checkItems: VerifyCheckItem[]
  /** 综合结论 */
  conclusion: 'consistent' | 'inconsistent' | 'suspicious'
}

/** 发票归属来源 */
export type InvoiceSource = 'upload' | 'ocr' | 'manual' | 'import'

export interface InvoiceRecord {
  id: string
  /** 发票代码（10/12 位） */
  invoiceCode: string
  /** 发票号码（8 位） */
  invoiceNumber: string
  /** 发票类型 */
  type: InvoiceType
  /** 开票日期 YYYY-MM-DD */
  date: string
  /** 价税合计金额 */
  amount: number
  /** 税额 */
  taxAmount: number
  /** 不含税金额 */
  amountWithoutTax: number
  /** 销方名称 */
  sellerName: string
  /** 销方税号 */
  sellerTaxId: string
  /** 购方名称 */
  buyerName: string
  /** 商品/服务摘要 */
  description: string
  /** 状态 */
  status: InvoiceStatus
  /** 验真状态 */
  verifyStatus: VerifyStatus
  /** 验真时间 */
  verifiedAt?: string
  /** 验真详情（查验报告） */
  verifyDetails?: VerifyDetails
  /** 来源 */
  source: InvoiceSource
  /** 关联的报销单 ID（已报销时） */
  reimbursementId?: string
  /** 关联的报销单标题 */
  reimbursementTitle?: string
  /** 上传文件名 */
  fileName?: string
  /** 缩略图 URL（base64 或 blob） */
  thumbnailUrl?: string
  /** 创建时间 */
  createdAt: string
  /** 更新时间 */
  updatedAt: string
  /** 备注 */
  remark?: string
}

// ============ 发票类型 / 状态 映射 ============

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  vat_special: '增值税专用发票',
  vat_normal: '增值税普通发票',
  electronic: '电子普通发票',
  electronic_special: '电子专用发票',
  travel: '机票/火车票',
  toll: '通行费',
  receipt: '收据/其他',
}

export const INVOICE_TYPE_OPTIONS: Array<{ value: InvoiceType; label: string }> = [
  { value: 'vat_special', label: '增值税专用发票' },
  { value: 'vat_normal', label: '增值税普通发票' },
  { value: 'electronic', label: '电子普通发票' },
  { value: 'electronic_special', label: '电子专用发票' },
  { value: 'travel', label: '机票/火车票' },
  { value: 'toll', label: '通行费' },
  { value: 'receipt', label: '收据/其他' },
]

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  unused: '未使用',
  used: '已报销',
  void: '已作废',
  duplicate: '查重异常',
}

export const INVOICE_STATUS_CLASS: Record<InvoiceStatus, string> = {
  unused: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  used: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  void: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  duplicate: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

export const VERIFY_STATUS_LABEL: Record<VerifyStatus, string> = {
  unverified: '待验真',
  verifying: '验真中',
  verified: '已验真',
  failed: '验真失败',
}

export const VERIFY_STATUS_CLASS: Record<VerifyStatus, string> = {
  unverified: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  verifying: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
}

// ============ Mock 数据生成 ============

// 固定锚点日期，避免 SSR 水合不一致
const ANCHOR = new Date('2026-08-10T00:00:00Z')

function addDays(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): string {
  return addDays(ANCHOR, -n)
}

// 确定性伪随机
function seededRand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function pickFrom<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

const SELLERS = [
  '滴滴出行科技有限公司', '中国铁路网络科技有限公司', '携程计算机技术（上海）有限公司',
  '北京海底捞餐饮有限责任公司', '如家酒店连锁管理有限公司', '中国移动通信集团',
  ' Staples 办公用品有限公司', '星巴克咖啡（上海）有限公司', '中国石化销售股份有限公司',
  '美团网络技术（北京）有限公司', '京东物流科技有限公司', '深圳腾讯计算机系统有限公司',
]

const DESCRIPTIONS = [
  '交通出行服务费', '住宿费', '餐饮服务费', '办公用品采购', '通讯服务费',
  '加油费', '会议服务费', '培训费', '广告服务费', '快递物流费',
]

const TAX_IDS = [
  '911100006000000001', '913100007000000002', '914403008000000003',
  '915101009000000004', '916101005000000005', '911100003000000006',
]

const INVOICE_TYPES: InvoiceType[] = ['vat_normal', 'electronic', 'vat_special', 'travel', 'toll', 'receipt']

function generateMockInvoices(count: number): InvoiceRecord[] {
  const result: InvoiceRecord[] = []
  for (let i = 0; i < count; i++) {
    const seed = i + 1
    const r = seededRand(seed)
    const type = pickFrom(INVOICE_TYPES, seed)
    const status: InvoiceStatus = i < 4 ? 'used' : i < 6 ? 'duplicate' : i < 8 ? 'void' : 'unused'
    const verifyStatus: VerifyStatus = i % 3 === 0 ? 'verified' : i % 3 === 1 ? 'unverified' : 'failed'
    const amount = +(seededRand(seed * 7) * 5000 + 50).toFixed(2)
    const taxRate = 0.06
    const taxAmount = +(amount * taxRate / (1 + taxRate)).toFixed(2)
    const amountWithoutTax = +(amount - taxAmount).toFixed(2)

    result.push({
      id: `INV${String(240001 + i).padStart(6, '0')}`,
      invoiceCode: String(11000000000 + seed * 7),
      invoiceNumber: String(80000000 + seed * 13),
      type,
      date: daysAgo(seededRand(seed * 3) * 90 + 1),
      amount,
      taxAmount,
      amountWithoutTax,
      sellerName: pickFrom(SELLERS, seed),
      sellerTaxId: pickFrom(TAX_IDS, seed * 2),
      buyerName: '智报销科技有限公司',
      description: pickFrom(DESCRIPTIONS, seed * 3),
      status,
      verifyStatus,
      verifiedAt: verifyStatus === 'verified' ? daysAgo(seededRand(seed * 5) * 30) : undefined,
      source: pickFrom(['upload', 'ocr', 'manual'] as InvoiceSource[], seed),
      reimbursementId: status === 'used' ? `R2024000${(i % 8) + 1}` : undefined,
      reimbursementTitle: status === 'used' ? pickFrom(DESCRIPTIONS, seed * 4) : undefined,
      fileName: `发票_${seed}.jpg`,
      createdAt: daysAgo(seededRand(seed * 11) * 60),
      updatedAt: daysAgo(seededRand(seed * 13) * 30),
      remark: status === 'duplicate' ? '发票号码与已有发票重复，请核实' : undefined,
    })
  }
  return result
}

// ============ Store 定义 ============

interface InvoiceStore {
  invoices: InvoiceRecord[]
  /** 是否已初始化 mock 数据 */
  initialized: boolean

  // 操作方法
  addInvoice: (invoice: Omit<InvoiceRecord, 'id' | 'createdAt' | 'updatedAt'>) => { success: boolean; duplicate?: InvoiceRecord; invoice?: InvoiceRecord }
  updateInvoice: (id: string, patch: Partial<InvoiceRecord>) => void
  deleteInvoice: (id: string) => void
  /** 查重：按发票代码+发票号码检查是否已存在 */
  checkDuplicate: (invoiceCode: string, invoiceNumber: string) => InvoiceRecord | null
  /** 标记发票为已报销（关联报销单） */
  markAsUsed: (invoiceIds: string[], reimbursementId: string, reimbursementTitle: string) => void
  /** 作废发票 */
  markAsVoid: (id: string) => void
  /** 标记验真状态 */
  setVerifyStatus: (id: string, status: VerifyStatus) => void
  /** 设置验真详情 */
  setVerifyDetails: (id: string, details: VerifyDetails) => void
  /** 获取未使用的发票 */
  getUnusedInvoices: () => InvoiceRecord[]
  /** 统计 */
  getStats: () => {
    total: number
    unused: number
    used: number
    void: number
    duplicate: number
    totalAmount: number
    unusedAmount: number
    verified: number
  }
}

export const useInvoiceStore = create<InvoiceStore>()(
  persist(
    (set, get) => ({
      invoices: [],
      initialized: false,

      addInvoice: (data) => {
        const state = get()
        // 查重：发票代码 + 发票号码
        const existing = state.invoices.find(
          (inv) => inv.invoiceCode === data.invoiceCode && inv.invoiceNumber === data.invoiceNumber
        )
        if (existing) {
          return { success: false, duplicate: existing }
        }

        const now = new Date().toISOString()
        const invoice: InvoiceRecord = {
          ...data,
          id: `INV${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`,
          createdAt: now,
          updatedAt: now,
        }
        set((s) => ({ invoices: [invoice, ...s.invoices] }))
        return { success: true, invoice }
      },

      updateInvoice: (id, patch) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            inv.id === id ? { ...inv, ...patch, updatedAt: new Date().toISOString() } : inv
          ),
        })),

      deleteInvoice: (id) =>
        set((s) => ({ invoices: s.invoices.filter((inv) => inv.id !== id) })),

      checkDuplicate: (invoiceCode, invoiceNumber) => {
        const state = get()
        return (
          state.invoices.find(
            (inv) =>
              inv.invoiceCode === invoiceCode &&
              inv.invoiceNumber === invoiceNumber &&
              inv.status !== 'void'
          ) || null
        )
      },

      markAsUsed: (invoiceIds, reimbursementId, reimbursementTitle) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            invoiceIds.includes(inv.id)
              ? {
                  ...inv,
                  status: 'used' as InvoiceStatus,
                  reimbursementId,
                  reimbursementTitle,
                  updatedAt: new Date().toISOString(),
                }
              : inv
          ),
        })),

      markAsVoid: (id) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            inv.id === id ? { ...inv, status: 'void' as InvoiceStatus, updatedAt: new Date().toISOString() } : inv
          ),
        })),

      setVerifyStatus: (id, status) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            inv.id === id
              ? {
                  ...inv,
                  verifyStatus: status,
                  verifiedAt: status === 'verified' ? new Date().toISOString() : undefined,
                  updatedAt: new Date().toISOString(),
                }
              : inv
          ),
        })),

      setVerifyDetails: (id, details) =>
        set((s) => ({
          invoices: s.invoices.map((inv) =>
            inv.id === id
              ? { ...inv, verifyDetails: details, updatedAt: new Date().toISOString() }
              : inv
          ),
        })),

      getUnusedInvoices: () => get().invoices.filter((inv) => inv.status === 'unused'),

      getStats: () => {
        const invs = get().invoices
        return {
          total: invs.length,
          unused: invs.filter((i) => i.status === 'unused').length,
          used: invs.filter((i) => i.status === 'used').length,
          void: invs.filter((i) => i.status === 'void').length,
          duplicate: invs.filter((i) => i.status === 'duplicate').length,
          totalAmount: invs.reduce((sum, i) => sum + i.amount, 0),
          unusedAmount: invs.filter((i) => i.status === 'unused').reduce((sum, i) => sum + i.amount, 0),
          verified: invs.filter((i) => i.verifyStatus === 'verified').length,
        }
      },
    }),
    {
      name: 'invoice-pool-storage',
      storage: createJSONStorage(() => localStorage),
      // 初始 mock 数据
      onRehydrateStorage: () => (state) => {
        if (state && !state.initialized && state.invoices.length === 0) {
          state.invoices = generateMockInvoices(24)
          state.initialized = true
        }
      },
    }
  )
)

// ============ Mock 发票验真（模拟国家税务总局发票查验接口） ============

/**
 * 模拟调用国家税务总局增值税发票查验接口。
 *
 * 根据发票代码、号码、日期、金额等字段进行模拟校验：
 * - 90% 概率验真成功（校验一致）
 * - 7% 概率验真可疑（部分校验项 warn）
 * - 3% 概率验真失败（发票不存在或信息不一致）
 *
 * 返回 Promise<VerifyDetails>，模拟网络延迟 800~2000ms。
 */
export function mockVerifyInvoice(invoice: InvoiceRecord): Promise<VerifyDetails> {
  return new Promise((resolve) => {
    const delay = 800 + Math.floor(seededRand(invoice.id.charCodeAt(3) || 1) * 1200)
    setTimeout(() => {
      // 基于发票号码尾数决定验真结果（确定性，保证同一发票每次验真结果一致）
      const lastDigit = parseInt(invoice.invoiceNumber.slice(-1)) || 0
      const seed = parseInt(invoice.invoiceNumber.slice(-3)) || 0
      const rand = seededRand(seed)

      let conclusion: VerifyDetails['conclusion']
      if (lastDigit === 9 && rand > 0.5) {
        conclusion = 'inconsistent'
      } else if (lastDigit % 7 === 0) {
        conclusion = 'suspicious'
      } else {
        conclusion = 'consistent'
      }

      const checkItems: VerifyCheckItem[] = [
        {
          label: '发票代码格式',
          status: 'pass',
          detail: `发票代码 ${invoice.invoiceCode} 为 ${invoice.invoiceCode.length} 位，格式正确`,
        },
        {
          label: '发票号码校验',
          status: 'pass',
          detail: `发票号码 ${invoice.invoiceNumber} 在税务总局数据库中存在`,
        },
        {
          label: '开票日期核验',
          status: 'pass',
          detail: `开票日期 ${invoice.date} 与税务机关登记日期一致`,
        },
        {
          label: '价税合计核验',
          status: conclusion === 'inconsistent' ? 'fail' : 'pass',
          detail:
            conclusion === 'inconsistent'
              ? `申报金额 ¥${invoice.amount.toFixed(2)} 与税务机关登记金额不一致`
              : `价税合计 ¥${invoice.amount.toFixed(2)} 核验一致`,
        },
        {
          label: '销方信息核验',
          status: conclusion === 'suspicious' ? 'warn' : 'pass',
          detail:
            conclusion === 'suspicious'
              ? `销方「${invoice.sellerName}」纳税状态异常，建议进一步核实`
              : `销方名称、税号 ${invoice.sellerTaxId} 核验一致`,
        },
        {
          label: '发票状态查询',
          status: invoice.status === 'void' ? 'fail' : 'pass',
          detail:
            invoice.status === 'void'
              ? '该发票在税务机关已被标记为作废'
              : '发票状态正常（有效）',
        },
      ]

      resolve({
        source: '国家税务总局全国增值税发票查验数据库',
        checkedAt: new Date().toISOString(),
        checkItems,
        conclusion,
      })
    }, delay)
  })
}
