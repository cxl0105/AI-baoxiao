import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const reimbursement = new Hono()

// --- Schemas ---
const createReimbursementSchema = z.object({
  title: z.string().min(2, '标题至少 2 个字符'),
  type: z.enum(['travel', 'daily', 'purchase', 'payment'], {
    required_error: '请选择报销类型',
  }),
  totalAmount: z.number().positive('金额必须大于 0'),
  description: z.string().optional(),
  invoices: z.array(z.object({
    fileUrl: z.string(),
    type: z.string().optional(),
  })).optional(),
  expenseItems: z.array(z.object({
    category: z.string(),
    amount: z.number().positive(),
    date: z.string(),
    description: z.string().optional(),
  })).optional(),
})

// --- Mock Data ---
const mockData = [
  {
    id: 'R20240001',
    title: '5月北京出差报销',
    type: 'travel',
    totalAmount: 3580.50,
    status: 'pending',
    createdAt: '2024-05-15T10:30:00Z',
    applicant: { id: '1', name: '张三' },
  },
  {
    id: 'R20240002',
    title: '办公用品采购',
    type: 'purchase',
    totalAmount: 890.00,
    status: 'approved',
    createdAt: '2024-05-10T09:15:00Z',
    applicant: { id: '1', name: '张三' },
  },
  {
    id: 'R20240003',
    title: '客户招待费',
    type: 'daily',
    totalAmount: 1280.00,
    status: 'rejected',
    createdAt: '2024-05-08T14:20:00Z',
    applicant: { id: '1', name: '张三' },
  },
]

// --- Routes ---
reimbursement.get('/', async (c) => {
  const { page = '1', pageSize = '10', status, type } = c.req.query()

  let filtered = mockData
  if (status) filtered = filtered.filter(r => r.status === status)
  if (type) filtered = filtered.filter(r => r.type === type)

  return c.json({
    code: 'SUCCESS',
    data: {
      list: filtered,
      pagination: {
        page: Number(page),
        pageSize: Number(pageSize),
        total: filtered.length,
      },
    },
  })
})

reimbursement.post(
  '/',
  zValidator('json', createReimbursementSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() },
        400
      )
    }
  }),
  async (c) => {
    const data = c.req.valid('json')

    // TODO: Trigger AI OCR processing via Cloudflare Workers AI
    return c.json({
      code: 'SUCCESS',
      message: '报销单已提交，AI 正在处理票据识别...',
      data: {
        id: 'R' + Date.now(),
        status: 'processing',
        ...data,
      },
    }, 201)
  }
)

reimbursement.get('/:id', async (c) => {
  const { id } = c.req.param()
  const record = mockData.find(r => r.id === id)

  if (!record) {
    return c.json({ code: 'NOT_FOUND', message: '报销单不存在' }, 404)
  }

  return c.json({
    code: 'SUCCESS',
    data: {
      ...record,
      approvals: [
        { step: 1, approver: '部门主管', status: 'pending', comment: '' },
        { step: 2, approver: '财务审核', status: 'waiting', comment: '' },
      ],
    },
  })
})

reimbursement.post('/:id/submit', async (c) => {
  const { id } = c.req.param()
  return c.json({
    code: 'SUCCESS',
    message: '已提交审批',
    data: { id, status: 'pending' },
  })
})

reimbursement.post('/:id/approve', async (c) => {
  const { id } = c.req.param()
  return c.json({
    code: 'SUCCESS',
    message: '已审批通过',
    data: { id, status: 'approved' },
  })
})

reimbursement.post('/:id/reject', async (c) => {
  const { id } = c.req.param()
  const body = await c.req.json().catch(() => ({}))
  return c.json({
    code: 'SUCCESS',
    message: '已驳回',
    data: { id, status: 'rejected', reason: body.reason || '未填写原因' },
  })
})

// AI OCR endpoint
reimbursement.post('/ai/ocr', async (c) => {
  // TODO: Implement with Cloudflare Workers AI + R2 storage
  return c.json({
    code: 'SUCCESS',
    data: {
      invoiceNo: '2411230000123456789',
      invoiceCode: '011002400111',
      date: '2024-05-20',
      amount: 356.00,
      tax: 20.38,
      total: 376.38,
      merchant: '北京某某酒店有限公司',
      category: 'hotel',
      confidence: 0.987,
    },
  })
})

export const reimbursementRoutes = reimbursement
