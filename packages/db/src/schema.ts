import { pgTable, serial, text, varchar, timestamp, boolean, jsonb, integer, numeric, date } from 'drizzle-orm/pg-core'

// --- 多租户 - 企业/组织
export const tenants = pgTable('tenants', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
  maxUsers: integer('max_users'),
  settings: jsonb('settings'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// --- 用户表
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  avatar: varchar('avatar', { length: 500 }),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  departmentId: integer('department_id'),
  employeeNo: varchar('employee_no', { length: 50 }),
  position: varchar('position', { length: 100 }),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// --- 部门表
export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  parentId: integer('parent_id'),
  managerId: integer('manager_id'),
  budgetLimit: numeric('budget_limit', { precision: 12, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 报销单表
export const reimbursements = pgTable('reimbursements', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  applicantId: integer('applicant_id').notNull(),
  departmentId: integer('department_id'),
  totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('CNY'),
  description: text('description'),
  status: varchar('status', { length: 30 }).notNull().default('draft'),
  currentStep: integer('current_step').notNull().default(0),
  submittedAt: timestamp('submitted_at'),
  approvedAt: timestamp('approved_at'),
  paidAt: timestamp('paid_at'),
  rejectedAt: timestamp('rejected_at'),
  rejectReason: text('reject_reason'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// --- 报销明细表
export const expenseItems = pgTable('expense_items', {
  id: serial('id').primaryKey(),
  reimbursementId: integer('reimbursement_id').notNull(),
  category: varchar('category', { length: 100 }).notNull(),
  date: date('expense_date').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  merchant: varchar('merchant', { length: 255 }),
  location: varchar('location', { length: 255 }),
})

// --- 票据/发票表
export const invoices = pgTable('invoices', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  reimbursementId: integer('reimbursement_id'),
  fileUrl: varchar('file_url', { length: 500 }).notNull(),
  fileName: varchar('file_name', { length: 255 }),
  fileSize: integer('file_size'),
  invoiceType: varchar('invoice_type', { length: 50 }),
  invoiceCode: varchar('invoice_code', { length: 50 }),
  invoiceNo: varchar('invoice_no', { length: 50 }),
  invoiceDate: date('invoice_date'),
  amount: numeric('amount', { precision: 12, scale: 2 }),
  tax: numeric('tax', { precision: 12, scale: 2 }),
  total: numeric('total', { precision: 12, scale: 2 }),
  merchant: varchar('merchant', { length: 255 }),
  category: varchar('category', { length: 100 }),
  isVerified: boolean('is_verified').notNull().default(false),
  verifiedAt: timestamp('verified_at'),
  ocrConfidence: numeric('ocr_confidence', { precision: 5, scale: 4 }),
  ocrRaw: jsonb('ocr_raw'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 审批流程表
export const approvalFlows = pgTable('approval_flows', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
  maxAmount: numeric('max_amount', { precision: 12, scale: 2 }),
  departmentId: integer('department_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

// --- 审批步骤表
export const approvalSteps = pgTable('approval_steps', {
  id: serial('id').primaryKey(),
  flowId: integer('flow_id').notNull(),
  stepNo: integer('step_no').notNull(),
  approverType: varchar('approver_type', { length: 50 }).notNull(),
  approverId: integer('approver_id'),
  role: varchar('role', { length: 50 }),
})

// --- 审批记录表
export const approvalRecords = pgTable('approval_records', {
  id: serial('id').primaryKey(),
  reimbursementId: integer('reimbursement_id').notNull(),
  stepNo: integer('step_no').notNull(),
  approverId: integer('approver_id').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
