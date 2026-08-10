// 统一 API 响应类型
export type ApiResponse<T = unknown> =
  | {
      code: 'SUCCESS'
      message?: string
      data?: T
    }
  | {
      code: string
      message: string
      errors?: unknown
    }

// 分页响应
export interface PaginatedResponse<T> {
  list: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}

// 用户
export interface User {
  id: string
  name: string
  email: string
  phone?: string
  role: 'admin' | 'finance' | 'manager' | 'user'
  department?: string
  avatar?: string
  tenant?: Tenant
}

export interface Tenant {
  id: string
  name: string
  plan: 'free' | 'basic' | 'pro' | 'enterprise'
}

// 报销单
export type ReimbursementType = 'travel' | 'daily' | 'purchase' | 'payment'
export type ReimbursementStatus = 'draft' | 'processing' | 'pending' | 'approved' | 'rejected' | 'paid'

export interface Reimbursement {
  id: string
  code: string
  title: string
  type: ReimbursementType
  totalAmount: number
  currency: string
  description?: string
  status: ReimbursementStatus
  applicant: Pick<User, 'id' | 'name' | 'avatar'>
  department?: string
  submittedAt?: string
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ReimbursementDetail extends Reimbursement {
  expenseItems?: ExpenseItem[]
  invoices?: Invoice[]
  approvals?: ApprovalStep[]
}

export interface ExpenseItem {
  id: string
  category: string
  date: string
  amount: number
  description?: string
  merchant?: string
}

export interface Invoice {
  id: string
  fileUrl: string
  fileName?: string
  invoiceNo?: string
  invoiceCode?: string
  invoiceDate?: string
  amount?: number
  tax?: number
  total?: number
  merchant?: string
  category?: string
  isVerified: boolean
  ocrConfidence?: number
}

export interface ApprovalStep {
  step: number
  approver: string
  status: 'pending' | 'approved' | 'rejected' | 'waiting'
  comment?: string
  actionAt?: string
}

// OCR 识别结果
export interface OcrResult {
  invoiceNo?: string
  invoiceCode?: string
  date?: string
  amount?: number
  tax?: number
  total?: number
  merchant?: string
  category?: string
  confidence: number
}
