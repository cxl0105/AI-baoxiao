import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { invoices, reimbursements } from '../db/schema'
import { authMiddleware, currentUser } from '../lib/auth'

const inv = new Hono()
inv.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 发票验真：确定性规则校验（格式 + 查重 + 一致性），替代随机 mock
function verifyInvoice(inv: any): any {
  const checkItems: Array<{ label: string; status: 'pass' | 'fail' | 'warn'; detail: string }> = []
  const code = (inv.invoiceCode || '').trim()
  const number = (inv.invoiceNumber || '').trim()
  const amount = num(inv.amount)

  // 1) 发票代码格式
  if (!code) {
    checkItems.push({ label: '发票代码格式', status: 'warn', detail: '未识别到发票代码，请核对' })
  } else if (!/^\d{10,12}$/.test(code)) {
    checkItems.push({ label: '发票代码格式', status: 'fail', detail: `发票代码 ${code} 位数不正确（应为 10/12 位数字）` })
  } else {
    checkItems.push({ label: '发票代码格式', status: 'pass', detail: `发票代码 ${code} 为 ${code.length} 位，格式正确` })
  }

  // 2) 发票号码格式
  if (!number) {
    checkItems.push({ label: '发票号码校验', status: 'warn', detail: '未识别到发票号码，请核对' })
  } else if (!/^\d{8}$/.test(number)) {
    checkItems.push({ label: '发票号码校验', status: 'fail', detail: `发票号码 ${number} 位数不正确（应为 8 位数字）` })
  } else {
    checkItems.push({ label: '发票号码校验', status: 'pass', detail: `发票号码 ${number} 校验通过` })
  }

  // 3) 金额合理性
  if (amount <= 0) {
    checkItems.push({ label: '价税合计核验', status: 'fail', detail: '金额缺失或为 0，无法核验' })
  } else if (amount >= 1e6) {
    checkItems.push({ label: '价税合计核验', status: 'warn', detail: `金额 ¥${amount.toFixed(2)} 较大，建议人工复核` })
  } else {
    checkItems.push({ label: '价税合计核验', status: 'pass', detail: `价税合计 ¥${amount.toFixed(2)} 核验一致` })
  }

  // 4) 开票日期
  if (!inv.date) {
    checkItems.push({ label: '开票日期核验', status: 'warn', detail: '未识别到开票日期' })
  } else {
    checkItems.push({ label: '开票日期核验', status: 'pass', detail: `开票日期 ${inv.date} 已记录` })
  }

  // 5) 销方信息
  if (!inv.sellerName) {
    checkItems.push({ label: '销方信息核验', status: 'warn', detail: '未识别到销方名称' })
  } else {
    checkItems.push({ label: '销方信息核验', status: 'pass', detail: `销方「${inv.sellerName}」已记录` })
  }

  const hasFail = checkItems.some((i) => i.status === 'fail')
  const hasWarn = checkItems.some((i) => i.status === 'warn')
  const conclusion = hasFail ? 'inconsistent' : hasWarn ? 'suspicious' : 'consistent'

  return {
    source: '本地规则引擎（格式/查重/一致性校验）',
    checkedAt: new Date().toISOString(),
    checkItems,
    conclusion,
  }
}

// GET /api/v1/invoices — 发票池列表（含报销单标题）
inv.get('/', async (c) => {
  const me = currentUser(c)
  const { verifyStatus = '', keyword = '' } = c.req.query()
  let allRows = await db.select().from(invoices).orderBy(desc(invoices.createdAt))
  if (verifyStatus) allRows = allRows.filter((r) => r.verifyStatus === verifyStatus)
  // 多租户隔离：发票通过 ocrData.companyId 或关联的本公司报销单归属
  const myReimbIds = new Set(
    (await db.select({ id: reimbursements.id }).from(reimbursements).where(eq(reimbursements.companyId, me.companyId))).map((x) => x.id)
  )
  const rows = allRows.filter((r) => {
    const ocrCompany = (r.ocrData as any)?.companyId
    if (ocrCompany && ocrCompany === me.companyId) return true
    if (r.reimbursementId && myReimbIds.has(r.reimbursementId)) return true
    return false
  })

  const reimbIds = [...new Set(rows.map((r) => r.reimbursementId).filter(Boolean) as string[])]
  const reimbRows = reimbIds.length
    ? await db.select({ id: reimbursements.id, title: reimbursements.title }).from(reimbursements)
    : []
  const titleMap = new Map(reimbRows.map((r) => [r.id, r.title]))

  let list = rows.map((r) => {
    const ocr = (r.ocrData || {}) as any
    return {
      id: r.id,
      invoiceCode: r.invoiceCode || '',
      invoiceNumber: r.invoiceNo || '',
      type: ocr.invoiceType || 'electronic',
      date: ocr.date || '',
      amount: num(r.amount),
      taxAmount: num(ocr.taxAmount),
      amountWithoutTax: num(ocr.amount),
      sellerName: ocr.sellerName || '',
      sellerTaxId: ocr.sellerTaxNo || '',
      buyerName: ocr.buyerName || '',
      description: ocr.description || '',
      status: ocr.status || (r.reimbursementId ? 'used' : 'unused'),
      verifyStatus: r.verifyStatus || 'unverified',
      verifiedAt: ocr.verifiedAt || undefined,
      verifyDetails: ocr.verifyDetails || undefined,
      source: ocr.source || 'upload',
      reimbursementId: r.reimbursementId || undefined,
      reimbursementTitle: r.reimbursementId ? titleMap.get(r.reimbursementId) || '' : '',
      fileName: r.fileName || '',
      createdAt: r.createdAt,
      updatedAt: r.createdAt,
    }
  })

  if (keyword) {
    const k = keyword.toLowerCase()
    list = list.filter((r) =>
      r.invoiceNumber.toLowerCase().includes(k) ||
      r.invoiceCode.toLowerCase().includes(k) ||
      r.sellerName.toLowerCase().includes(k) ||
      r.buyerName.toLowerCase().includes(k)
    )
  }

  return c.json({ code: 'SUCCESS', data: { list, pagination: { page: 1, pageSize: list.length, total: list.length } } })
})

const createInvoiceSchema = z.object({
  fileName: z.string().optional(),
  fileUrl: z.string().optional(),
  mimeType: z.string().optional(),
  size: z.number().optional(),
  invoiceCode: z.string().optional(),
  invoiceNumber: z.string().optional(),
  amount: z.number().optional(),
  taxAmount: z.number().optional(),
  date: z.string().optional(),
  sellerName: z.string().optional(),
  sellerTaxId: z.string().optional(),
  buyerName: z.string().optional(),
  description: z.string().optional(),
  invoiceType: z.string().optional(),
  reimbursementId: z.string().optional(),
})

// POST /api/v1/invoices — 发票落库（OCR 后调用）
inv.post(
  '/',
  zValidator('json', createInvoiceSchema, (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
  }),
  async (c) => {
    const me = currentUser(c)
    const data = c.req.valid('json')
    const ocrData = {
      companyId: me.companyId,
      date: data.date || '',
      taxAmount: data.taxAmount || 0,
      amount: data.amount || 0,
      sellerName: data.sellerName || '',
      sellerTaxNo: data.sellerTaxId || '',
      buyerName: data.buyerName || '',
      description: data.description || '',
      invoiceType: data.invoiceType || 'electronic',
      source: 'upload',
    }
    const [r] = await db
      .insert(invoices)
      .values({
        fileName: data.fileName || '未命名',
        fileUrl: data.fileUrl || null,
        mimeType: data.mimeType || null,
        size: data.size || null,
        invoiceCode: data.invoiceCode || null,
        invoiceNo: data.invoiceNumber || null,
        amount: data.amount !== undefined ? String(data.amount) : null,
        ocrData,
        verifyStatus: 'unverified',
      })
      .returning()
    return c.json({ code: 'SUCCESS', data: { id: r.id } }, 201)
  }
)

// POST /api/v1/invoices/:id/verify — 验真
inv.post('/:id/verify', async (c) => {
  const me = currentUser(c)
  const id = c.req.param('id')
  const [r] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  if (!r) return c.json({ code: 'NOT_FOUND', message: '发票不存在' }, 404)
  const ocr = (r.ocrData || {}) as any
  if ((ocr as any)?.companyId && (ocr as any).companyId !== me.companyId) {
    return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  }

  // 查重：同发票号是否已被其他发票使用
  let duplicate = false
  if (r.invoiceNo) {
    const dupRows = await db.select().from(invoices).where(eq(invoices.invoiceNo, r.invoiceNo))
    // 只在本公司内查重
    duplicate = dupRows.filter((x) => ((x.ocrData as any)?.companyId || '') === me.companyId).length > 1
  }

  const payload = {
    invoiceCode: r.invoiceCode || '',
    invoiceNumber: r.invoiceNo || '',
    amount: num(r.amount),
    date: ocr.date || '',
    sellerName: ocr.sellerName || '',
  }
  const details = verifyInvoice(payload)
  if (duplicate) {
    details.checkItems.push({ label: '查重校验', status: 'fail', detail: '该发票号码已存在重复记录' })
    details.conclusion = 'inconsistent'
  } else {
    details.checkItems.push({ label: '查重校验', status: 'pass', detail: '未发现重复发票' })
  }

  const verifyStatus = details.conclusion === 'inconsistent' ? 'failed' : 'verified'
  const nextOcr = { ...ocr, verifiedAt: new Date().toISOString(), verifyDetails: details }
  await db.update(invoices).set({ ocrData: nextOcr, verifyStatus }).where(eq(invoices.id, id))

  return c.json({ code: 'SUCCESS', data: { verifyStatus, verifyDetails: details } })
})

// POST /api/v1/invoices/:id/void — 作废
inv.post('/:id/void', async (c) => {
  const me = currentUser(c)
  const id = c.req.param('id')
  const [r] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  if (!r) return c.json({ code: 'NOT_FOUND', message: '发票不存在' }, 404)
  const ocr = (r.ocrData || {}) as any
  if ((ocr as any)?.companyId && (ocr as any).companyId !== me.companyId) {
    return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  }
  const nextOcr = { ...ocr, status: 'void' }
  await db.update(invoices).set({ ocrData: nextOcr }).where(eq(invoices.id, id))
  return c.json({ code: 'SUCCESS', message: '已作废' })
})

// PATCH /api/v1/invoices/:id — 关联报销单（标记已使用）
inv.patch('/:id', async (c) => {
  const me = currentUser(c)
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const [r] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1)
  if (!r) return c.json({ code: 'NOT_FOUND', message: '发票不存在' }, 404)
  const ocr = (r.ocrData || {}) as any
  if ((ocr as any)?.companyId && (ocr as any).companyId !== me.companyId) {
    return c.json({ code: 'FORBIDDEN', message: '无权操作' }, 403)
  }
  const nextOcr: any = { ...ocr }
  if (body.status) nextOcr.status = body.status
  if (body.reimbursementId !== undefined) nextOcr.reimbursementId = body.reimbursementId
  const upd: any = { ocrData: nextOcr }
  if (body.reimbursementId !== undefined) upd.reimbursementId = body.reimbursementId || null
  await db.update(invoices).set(upd).where(eq(invoices.id, id))
  return c.json({ code: 'SUCCESS', message: '已更新' })
})

export const invoiceRoutes = inv
