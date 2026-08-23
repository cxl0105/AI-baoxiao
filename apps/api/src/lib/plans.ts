// 套餐定义（四档）
// free: 免费版 | basic: 299元/人/年 | pro: 399元/人/年 | enterprise: 联系销售

export type PlanKey = 'free' | 'basic' | 'pro' | 'enterprise'

export interface PlanDef {
  key: PlanKey
  name: string
  price: number | null      // 每人每年价格（元），null = 联系销售
  priceLabel: string        // 展示文案
  monthlyInvoiceLimit: number | null  // 每月发票限额，null = 不限
  ocrEnabled: boolean       // OCR 识别
  spreadsheetEnabled: boolean // 电子表格报销单（差旅补贴）
  expenseStandardEnabled: boolean // 费用标准校验
  description: string
}

export const PLANS: PlanDef[] = [
  {
    key: 'free',
    name: '免费版',
    price: 0,
    priceLabel: '免费',
    monthlyInvoiceLimit: 10,
    ocrEnabled: false,
    spreadsheetEnabled: false,
    expenseStandardEnabled: false,
    description: '手动输入发票，每月 10 张免费额度',
  },
  {
    key: 'basic',
    name: '标准版',
    price: 299,
    priceLabel: '299 元/人/年',
    monthlyInvoiceLimit: null,
    ocrEnabled: true,
    spreadsheetEnabled: false,
    expenseStandardEnabled: false,
    description: 'OCR 识别 + 发票不限量 + 审批流/预算/统计',
  },
  {
    key: 'pro',
    name: '专业版',
    price: 399,
    priceLabel: '399 元/人/年',
    monthlyInvoiceLimit: null,
    ocrEnabled: true,
    spreadsheetEnabled: true,
    expenseStandardEnabled: true,
    description: '标准版全部 + 电子表格报销单（差旅补贴）+ 费用标准校验',
  },
  {
    key: 'enterprise',
    name: '企业版',
    price: null,
    priceLabel: '联系销售',
    monthlyInvoiceLimit: null,
    ocrEnabled: true,
    spreadsheetEnabled: true,
    expenseStandardEnabled: true,
    description: '专业版全部 + 私有化部署 / 定制开发',
  },
]

export function getPlan(key: string | null | undefined): PlanDef {
  return PLANS.find((p) => p.key === key) || PLANS[0]
}

export function isPaidPlan(key: string | null | undefined): boolean {
  return key === 'basic' || key === 'pro' || key === 'enterprise'
}
