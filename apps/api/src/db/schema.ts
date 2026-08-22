import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  numeric,
  integer,
  jsonb,
  index,
} from 'drizzle-orm/pg-core'

export const userRole = pgEnum('user_role', ['admin', 'gm', 'finance', 'manager', 'employee'])

export const reimbursementStatus = pgEnum('reimbursement_status', [
  'draft',
  'pending',
  'approved',
  'rejected',
  'paid',
  'revoked',
])

// 公司（租户）
export const companies = pgTable(
  'companies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    taxNo: text('tax_no'),
    fullName: text('full_name'),
    industry: text('industry'),
    scale: text('scale'),
    address: text('address'),
    creditCode: text('credit_code'),
    contactPhone: text('contact_phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    taxNoIdx: index('companies_tax_no_idx').on(t.taxNo),
  })
)

// 用户
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id),
    name: text('name').notNull(),
    phone: text('phone').unique(),
    email: text('email'),
    passwordHash: text('password_hash').notNull(),
    role: userRole('role').notNull().default('employee'),
    department: text('department'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    phoneIdx: index('users_phone_idx').on(t.phone),
    emailIdx: index('users_email_idx').on(t.email),
  })
)

// 报销单
export const reimbursements = pgTable(
  'reimbursements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    type: text('type').notNull().default('daily'),
    department: text('department'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    status: reimbursementStatus('status').notNull().default('draft'),
    description: text('description'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    projectCode: text('project_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdx: index('reimb_user_idx').on(t.userId),
    statusIdx: index('reimb_status_idx').on(t.status),
  })
)

// 报销明细
export const reimbursementItems = pgTable(
  'reimbursement_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reimbursementId: uuid('reimbursement_id')
      .notNull()
      .references(() => reimbursements.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    description: text('description'),
    date: text('date'),
    invoiceNo: text('invoice_no'),
  },
  (t) => ({
    reimbIdx: index('items_reimb_idx').on(t.reimbursementId),
  })
)

// 发票
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reimbursementId: uuid('reimbursement_id').references(() => reimbursements.id, {
      onDelete: 'set null',
    }),
    fileName: text('file_name').notNull(),
    fileUrl: text('file_url'),
    mimeType: text('mime_type'),
    size: integer('size'),
    ocrData: jsonb('ocr_data'),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    invoiceNo: text('invoice_no'),
    invoiceCode: text('invoice_code'),
    verifyStatus: text('verify_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    reimbIdx: index('invoices_reimb_idx').on(t.reimbursementId),
  })
)

// 审批节点
export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reimbursementId: uuid('reimbursement_id')
      .notNull()
      .references(() => reimbursements.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull().default(0),
    actor: text('actor').notNull(),
    role: text('role'),
    action: text('action').notNull().default('pending'),
    comment: text('comment'),
    time: timestamp('time', { withTimezone: true }),
  },
  (t) => ({
    reimbIdx: index('approval_reimb_idx').on(t.reimbursementId),
  })
)

// 预算（部门/项目）
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').references(() => companies.id),
    kind: text('kind').notNull().default('department'),
    name: text('name').notNull(),
    code: text('code'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
    period: text('period').notNull().default('monthly'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyIdx: index('budgets_company_idx').on(t.companyId),
  })
)

// 公司设置（公司信息/报销规则/OCR/UI，jsonb 存储）
export const companySettings = pgTable(
  'company_settings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull().unique().references(() => companies.id),
    company: jsonb('company').notNull().default({}),
    policy: jsonb('policy').notNull().default({}),
    ocr: jsonb('ocr').notNull().default({}),
    ui: jsonb('ui').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  }
)

// 类型导出
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Reimbursement = typeof reimbursements.$inferSelect
export type NewReimbursement = typeof reimbursements.$inferInsert
export type Invoice = typeof invoices.$inferSelect
export type NewInvoice = typeof invoices.$inferInsert
export type Budget = typeof budgets.$inferSelect
export type NewBudget = typeof budgets.$inferInsert
export type CompanySetting = typeof companySettings.$inferSelect
