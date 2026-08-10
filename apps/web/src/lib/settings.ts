'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// --- 类型定义 ---
export type OcrProviderType = 'mock' | 'vision_llm' | 'aliyun_invoice' | 'tencent_invoice'

export interface OcrProviderConfig {
  /** 是否启用真实 OCR（=false 或 provider == mock 时走 Mock） */
  enabled: boolean
  provider: OcrProviderType
  /** 调用模式（B 方案新增）：
   *  - proxy  推荐：通过后端 /api/v1/ocr/recognize 代理，API Key 只存服务器，不暴露给前端
   *  - direct 兼容：直接在浏览器端调 Base URL / Model / API Key（仅限本地 / 个人小范围演示使用）
   */
  callMode: 'proxy' | 'direct'
  /** 通用视觉大模型：兼容 OpenAI Chat Completions 协议的 base URL，如
   *  - 智谱: https://open.bigmodel.cn/api/paas/v4
   *  - 阿里 Dashscope(兼容): https://dashscope.aliyuncs.com/compatible-mode/v1
   *  - DeepSeek: https://api.deepseek.com/v1 (视觉版)
   *  - OpenAI: https://api.openai.com/v1
   *  ⚠️ 仅 callMode=direct 时使用；callMode=proxy 时建议清空此配置以避免误存 Key
   */
  baseUrl: string
  /** ⚠️ 仅 callMode=direct 时需要填写；proxy 模式下请留空，由服务器 .env 统一管理 */
  apiKey: string
  /** 模型名：glm-4v-plus / qwen-vl-max / gpt-4o / gpt-4o-mini / doubao-vision-pro 等
   *  ⚠️ direct 模式下必填；proxy 模式下可留空（以服务端 OCR_PROXY_MODEL 为准）
   */
  model: string
  /** 超时毫秒 */
  timeoutMs: number
  /** 识别温度（视觉大模型用，direct 模式下生效） */
  temperature: number
  /** 自定义系统提示词（留空用内置默认）—— direct 模式下走本字段；proxy 模式下以服务端 OCR_PROXY_SYSTEM_PROMPT 为准 */
  systemPrompt: string
  /** 阿里云 / 腾讯云专用：AccessKeyId / SecretId 等（先预留，与 vision_llm 共用 config，按需字段） */
  accessKeyId?: string
  accessKeySecret?: string
  /** 区域：阿里云 region-cn-shanghai 等 */
  region?: string
}

export interface UiSettings {
  /** 新建报销单发票识别的默认视图：卡片/表格 */
  invoiceViewMode: 'cards' | 'table'
  /** 主题色（仅 light/dark 占位） */
  theme: 'light' | 'dark' | 'system'
  /** 金额显示精度 */
  currencyPrecision: 0 | 1 | 2
  /** 上传文件大小上限（MB） */
  uploadMaxMb: number
}

/** 费用分类（西门子风格：交通费 / 打车费 / 住宿费 / 餐饮费 / 其它费用） */
export type ExpenseCategoryKey =
  | 'transport'      // 交通费（机票/火车/长途汽车/轮船等公共交通）
  | 'taxi'           // 打车费（出租车/网约车/短途出行）
  | 'hotel'          // 住宿费
  | 'meal'           // 餐饮费
  | 'other'          // 其它费用（招待/会议/材料/邮电等）

export interface ExpenseCategoryDef {
  key: ExpenseCategoryKey
  /** 中文列名（打印表头/明细行使用） */
  label: string
  /** 是否默认启用（出现在明细表中） */
  enabled: boolean
  /** 备注说明，悬停提示 */
  hint?: string
}

/** 出差类型对应的补贴标准 */
export interface TripSubsidyRule {
  /** 出差类型 key：domestic 国内 / overseas 海外 / local 市内 / remote 偏远地区 */
  key: 'domestic' | 'overseas' | 'local' | 'remote' | string
  label: string
  /** 每日补贴金额（元/天），默认 80 */
  perDay: number
  /** 是否启用该类型 */
  enabled: boolean
  /** 最高补贴天数上限（0 表示不限） */
  maxDays?: number
}

/** 签字审批节点（按顺序） */
export interface ApprovalSignerLevel {
  key: string
  /** 签字头衔，如：申请人 / 部门负责人 / 财务审核 / 总经理批准 */
  title: string
  /** 建议角色/岗位，用于打印时占位提示 */
  placeholderRole: string
  /** 是否启用 */
  enabled: boolean
}

/* ======================================================================
   汇联易风格扩展：费用标准 / 预算控制 / 智能审批路由
   ====================================================================== */

/** 员工职级（用于差旅标准/审批路由） */
export type EmployeeLevel = 'staff' | 'manager' | 'director' | 'vp' | 'c_level'

export const EMPLOYEE_LEVELS: Array<{ value: EmployeeLevel; label: string; defaultDailyHotel: number; defaultDailyMeal: number }> = [
  { value: 'staff',    label: '普通员工',  defaultDailyHotel: 400,  defaultDailyMeal: 80 },
  { value: 'manager',  label: '经理',      defaultDailyHotel: 500,  defaultDailyMeal: 100 },
  { value: 'director', label: '总监',      defaultDailyHotel: 700,  defaultDailyMeal: 150 },
  { value: 'vp',       label: '副总裁',    defaultDailyHotel: 900,  defaultDailyMeal: 200 },
  { value: 'c_level',  label: '高管(C级)', defaultDailyHotel: 1200, defaultDailyMeal: 300 },
]

/** 费用标准规则：按职级×费用类别×差旅类型配置单笔/单日限额 */
export interface ExpenseStandardRule {
  id: string
  /** 适用职级 */
  level: EmployeeLevel
  /** 费用类别 */
  category: ExpenseCategoryKey
  /** 出差类型：'any' 表示全部，或 domestic/overseas/local/remote */
  tripType: string
  /** 单笔限额（元），0 表示不限 */
  perReceiptLimit: number
  /** 单日限额（元，主要针对住宿/餐饮），0 表示不限 */
  perDayLimit: number
  /** 超标处理策略：warn 仅提示 / block 阻断 / escalation 自动升级审批 */
  overLimitAction: 'warn' | 'block' | 'escalation'
  /** 备注 */
  remark?: string
}

/** 部门预算 */
export interface DepartmentBudget {
  id: string
  department: string
  /** 预算周期内额度（元） */
  amount: number
  /** 已使用额度（元），由已审批通过的报销单累计 */
  usedAmount: number
}

/** 项目/成本中心预算 */
export interface ProjectBudget {
  id: string
  projectCode: string
  projectName: string
  amount: number
  usedAmount: number
}

/** 预算控制配置 */
export interface BudgetControl {
  /** 是否启用预算控制 */
  enabled: boolean
  /** 预算周期 */
  period: 'monthly' | 'quarterly' | 'yearly'
  /** 部门预算列表 */
  departmentBudgets: DepartmentBudget[]
  /** 项目预算列表 */
  projectBudgets: ProjectBudget[]
  /** 超预算处理策略：warn 提示 / block 阻断 / escalation 升级审批 */
  overBudgetAction: 'warn' | 'block' | 'escalation'
}

/** 智能审批路由规则：满足条件时追加审批节点 */
export interface ApprovalRoutingRule {
  id: string
  /** 规则名称 */
  name: string
  /** 是否启用 */
  enabled: boolean
  /** 单据总额阈值（元），超过此值触发，0 表示不限制 */
  amountThreshold: number
  /** 是否要求存在超标项才触发 */
  hasOverStandard: boolean
  /** 是否要求超预算才触发 */
  hasOverBudget: boolean
  /** 触发后追加的审批节点 key（对应 signerLevels 中的 key，如 gm/vp/cfo） */
  appendSignerKey: string
}

/** 报销单编号生成格式 */
export interface ReimbursementSerialFormat {
  /** 前缀，如 BX / REI / SIEMENS-EXP */
  prefix: string
  /** 日期格式：yyyyMM / yyyyMMdd / none */
  datePart: 'yyyyMM' | 'yyyyMMdd' | 'none'
  /** 序号位数，如 4 = 0001 */
  seqDigits: 2 | 3 | 4 | 5 | 6
  /** 分隔符，如 - / _ / 空 */
  separator: '-' | '_' | '/' | ''
}

/** 报销规则（西门子风格出差报销单配置）——可由公司管理员在「系统设置-报销规则」中统一维护 */
export interface ReimbursementPolicy {
  /** 单据标题（抬头），如：出差费用报销单 / 员工差旅费报销申请表 */
  formTitle: string
  /** 单据副标题/说明，如："本单据由报销人逐项填写，附原始发票后按签字顺序递交审批" */
  formSubtitle: string
  /** 编号格式 */
  serial: ReimbursementSerialFormat
  /** 启用的费用分类列（可按公司制度增减，如某些公司单独列「招待费」） */
  categories: ExpenseCategoryDef[]
  /** 出差补贴规则列表 */
  subsidies: TripSubsidyRule[]
  /** 默认选中的补贴类型 key */
  defaultSubsidyKey: string
  /** 是否启用"半天补贴（单日补贴×50%）"规则 */
  halfDaySubsidyEnabled: boolean
  /** 签字审批层级（按顺序从左到右展示） */
  signerLevels: ApprovalSignerLevel[]
  /** 是否要求填写工号、部门、项目号等附加字段 */
  requireEmployeeId: boolean
  requireDepartment: boolean
  requireProjectCode: boolean
  /** 币种符号 */
  currency: string
  /** 补贴是否单独列行展示（默认 true：西门子风格独立一行"出差补贴汇总"） */
  subsidyInSeparateRow: boolean
  /** 备注/报销制度摘要，打印在报销单底部表格外 */
  footerNotes: string
  /* --- 汇联易风格扩展字段 --- */
  /** 费用标准规则列表（按职级×类别×差旅类型限额） */
  expenseStandards: ExpenseStandardRule[]
  /** 预算控制配置 */
  budgetControl: BudgetControl
  /** 智能审批路由规则 */
  approvalRouting: ApprovalRoutingRule[]
}

/** 公司 / 单位信息（用于打印报销单、邮件签名、导出 PDF 抬头等） */
export interface CompanyInfo {
  /** 公司全称（打印抬头/发票专用章名称用） */
  fullName: string
  /** 公司简称（系统展示、Logo 旁） */
  shortName: string
  /** 统一社会信用代码 */
  creditCode: string
  /** 公司 Logo URL（支持相对路径或外链，留空用默认系统图标） */
  logoUrl: string
  /** 行业类型（下拉枚举，方便统计） */
  industry: string
  /** 公司规模 */
  scale: '1-50' | '51-200' | '201-500' | '501-1000' | '1000+'
  /** 办公地址 */
  address: string
  /** 联系电话（前台/行政/HR） */
  phone: string
  /** 公司官网（选填） */
  website: string
  /** 财务联系人（导出报销单/邮件通知默认收件人） */
  financeContact: string
  /** 财务联系邮箱 */
  financeEmail: string
  /** 税务联系人（发票核验、专票认证对接） */
  taxContact: string
  /** 开票银行 + 账号（导出 PDF 默认显示） */
  bankName: string
  bankAccount: string
  /** 备注：报销制度说明、审批签字位置等（选填富文本摘要） */
  notes: string
}

export interface AppSettingsState {
  ocr: OcrProviderConfig
  ui: UiSettings
  company: CompanyInfo
  policy: ReimbursementPolicy

  patchOcr: (partial: Partial<OcrProviderConfig>) => void
  setOcr: (next: OcrProviderConfig) => void
  patchUi: (partial: Partial<UiSettings>) => void
  patchCompany: (partial: Partial<CompanyInfo>) => void
  setCompany: (next: CompanyInfo) => void
  patchPolicy: (partial: Partial<ReimbursementPolicy>) => void
  setPolicy: (next: ReimbursementPolicy) => void
  resetOcr: () => void
  resetCompany: () => void
  resetPolicy: () => void
}

// --- 默认值 ---
export const DEFAULT_OCR_CONFIG: OcrProviderConfig = {
  enabled: false,
  provider: 'vision_llm',
  callMode: 'proxy',
  baseUrl: '',
  apiKey: '',
  model: '',
  timeoutMs: 60_000,
  temperature: 0.1,
  systemPrompt: '',
  accessKeyId: '',
  accessKeySecret: '',
  region: 'cn-shanghai',
}

export const DEFAULT_UI_SETTINGS: UiSettings = {
  invoiceViewMode: 'table',
  theme: 'system',
  currencyPrecision: 2,
  uploadMaxMb: 10,
}

export const DEFAULT_COMPANY_INFO: CompanyInfo = {
  fullName: '',
  shortName: '智报销演示公司',
  creditCode: '',
  logoUrl: '',
  industry: '互联网/信息技术',
  scale: '51-200',
  address: '',
  phone: '',
  website: '',
  financeContact: '',
  financeEmail: '',
  taxContact: '',
  bankName: '',
  bankAccount: '',
  notes: '',
}

/** 默认报销规则（西门子风格）——管理员可在系统设置→报销规则 Tab 修改 */
export const DEFAULT_REIMBURSEMENT_POLICY: ReimbursementPolicy = {
  formTitle: '出差费用报销单',
  formSubtitle: '本单据由报销人逐项填写，附原始发票后按签字顺序递交审批。补贴按公司制度标准计算。',
  serial: {
    prefix: 'BX',
    datePart: 'yyyyMM',
    seqDigits: 4,
    separator: '-',
  },
  categories: [
    { key: 'transport', label: '交通费', enabled: true, hint: '机票、火车票、长途汽车、轮船等公共交通费用' },
    { key: 'taxi',      label: '打车费',   enabled: true, hint: '出租车、网约车、机场/酒店接送等短途出行' },
    { key: 'hotel',     label: '住宿费',   enabled: true, hint: '酒店/宾馆住宿费用（附水单）' },
    { key: 'meal',      label: '餐饮费',   enabled: true, hint: '出差期间工作餐（需附发票，非招待）' },
    { key: 'other',     label: '其它费用', enabled: true, hint: '邮电、打印、会议、行李托运等其他费用' },
  ],
  subsidies: [
    { key: 'domestic', label: '国内出差补贴', perDay: 80,  enabled: true,  maxDays: 0 },
    { key: 'overseas', label: '海外出差补贴', perDay: 260, enabled: true,  maxDays: 0 },
    { key: 'local',    label: '市内/近郊出差补贴', perDay: 40, enabled: true, maxDays: 0 },
    { key: 'remote',   label: '偏远地区出差补贴', perDay: 120, enabled: false, maxDays: 0 },
  ],
  defaultSubsidyKey: 'domestic',
  halfDaySubsidyEnabled: true,
  signerLevels: [
    { key: 'applicant', title: '申请人签字',     placeholderRole: '报销人（手签）',    enabled: true },
    { key: 'dept_head', title: '部门负责人审批', placeholderRole: '部门经理（手签）',  enabled: true },
    { key: 'finance',   title: '财务审核',       placeholderRole: '财务会计（手签）',  enabled: true },
    { key: 'gm',        title: '总经理批准',     placeholderRole: '总经理（手签）',    enabled: true },
  ],
  requireEmployeeId: true,
  requireDepartment: true,
  requireProjectCode: false,
  currency: '¥',
  subsidyInSeparateRow: true,
  footerNotes:
    '说明：① 所有费用须凭真实合法发票报销，复印件、收据原则上不予受理；② 住宿费超标准部分自理，双人同性出差原则上合住一间；③ 补贴天数按"起程当日、返程当日各计一天"计算；④ 超过¥2000元的招待费须附参会人员名单及事由说明。',
  /* --- 汇联易风格扩展默认值 --- */
  expenseStandards: [
    // 普通员工
    { id: 'es-staff-hotel-d', level: 'staff', category: 'hotel', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 400, overLimitAction: 'warn', remark: '国内出差住宿 400/天' },
    { id: 'es-staff-meal-d', level: 'staff', category: 'meal', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 80, overLimitAction: 'warn', remark: '国内出差餐补 80/天' },
    { id: 'es-staff-hotel-o', level: 'staff', category: 'hotel', tripType: 'overseas', perReceiptLimit: 0, perDayLimit: 800, overLimitAction: 'warn', remark: '海外出差住宿 800/天' },
    { id: 'es-staff-transport', level: 'staff', category: 'transport', tripType: 'any', perReceiptLimit: 3000, perDayLimit: 0, overLimitAction: 'escalation', remark: '单程交通超3000需升级审批' },
    // 经理
    { id: 'es-mgr-hotel-d', level: 'manager', category: 'hotel', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 500, overLimitAction: 'warn', remark: '经理国内住宿 500/天' },
    { id: 'es-mgr-meal-d', level: 'manager', category: 'meal', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 100, overLimitAction: 'warn' },
    { id: 'es-mgr-transport', level: 'manager', category: 'transport', tripType: 'any', perReceiptLimit: 5000, perDayLimit: 0, overLimitAction: 'escalation' },
    // 总监
    { id: 'es-dir-hotel-d', level: 'director', category: 'hotel', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 700, overLimitAction: 'warn' },
    { id: 'es-dir-meal-d', level: 'director', category: 'meal', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 150, overLimitAction: 'warn' },
    { id: 'es-dir-transport', level: 'director', category: 'transport', tripType: 'any', perReceiptLimit: 8000, perDayLimit: 0, overLimitAction: 'escalation' },
    // 副总裁
    { id: 'es-vp-hotel-d', level: 'vp', category: 'hotel', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 900, overLimitAction: 'warn' },
    { id: 'es-vp-meal-d', level: 'vp', category: 'meal', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 200, overLimitAction: 'warn' },
    { id: 'es-vp-transport', level: 'vp', category: 'transport', tripType: 'any', perReceiptLimit: 15000, perDayLimit: 0, overLimitAction: 'escalation' },
    // 高管(C级)
    { id: 'es-c-hotel-d', level: 'c_level', category: 'hotel', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 1200, overLimitAction: 'warn' },
    { id: 'es-c-meal-d', level: 'c_level', category: 'meal', tripType: 'domestic', perReceiptLimit: 0, perDayLimit: 300, overLimitAction: 'warn' },
    { id: 'es-c-transport', level: 'c_level', category: 'transport', tripType: 'any', perReceiptLimit: 20000, perDayLimit: 0, overLimitAction: 'escalation' },
  ],
  budgetControl: {
    enabled: true,
    period: 'monthly',
    departmentBudgets: [
      { id: 'b-d-rd', department: '研发部', amount: 200000, usedAmount: 86500 },
      { id: 'b-d-sales', department: '销售部', amount: 150000, usedAmount: 112000 },
      { id: 'b-d-mkt', department: '市场部', amount: 100000, usedAmount: 43800 },
      { id: 'b-d-hr', department: '人事行政部', amount: 60000, usedAmount: 21500 },
      { id: 'b-d-finance', department: '财务部', amount: 40000, usedAmount: 12300 },
    ],
    projectBudgets: [
      { id: 'b-p-001', projectCode: 'P2026-001', projectName: 'AI报销系统V2', amount: 500000, usedAmount: 215800 },
      { id: 'b-p-002', projectCode: 'P2026-002', projectName: '华北区渠道拓展', amount: 300000, usedAmount: 187200 },
      { id: 'b-p-003', projectCode: 'P2026-003', projectName: '品牌升级项目', amount: 200000, usedAmount: 68500 },
    ],
    overBudgetAction: 'warn',
  },
  approvalRouting: [
    { id: 'ar-1', name: '单笔超5000元升级总经理审批', enabled: true, amountThreshold: 5000, hasOverStandard: false, hasOverBudget: false, appendSignerKey: 'gm' },
    { id: 'ar-2', name: '超标项自动升级总经理审批', enabled: true, amountThreshold: 0, hasOverStandard: true, hasOverBudget: false, appendSignerKey: 'gm' },
    { id: 'ar-3', name: '超预算自动升级总经理审批', enabled: true, amountThreshold: 0, hasOverStandard: false, hasOverBudget: true, appendSignerKey: 'gm' },
    { id: 'ar-4', name: '单笔超30000元升级总经理审批', enabled: true, amountThreshold: 30000, hasOverStandard: false, hasOverBudget: false, appendSignerKey: 'gm' },
  ],
}

export const INDUSTRY_OPTIONS = [
  '互联网/信息技术',
  '金融/银行/保险',
  '制造/工业',
  '教育/科研',
  '医疗/健康',
  '零售/电商',
  '房地产/建筑',
  '物流/运输',
  '咨询/服务',
  '文化传媒/广告',
  '政府/事业单位',
  '其他',
]

export const SCALE_OPTIONS: Array<{ value: CompanyInfo['scale']; label: string }> = [
  { value: '1-50', label: '1–50 人（小型）' },
  { value: '51-200', label: '51–200 人（中型）' },
  { value: '201-500', label: '201–500 人（中大型）' },
  { value: '501-1000', label: '501–1000 人（大型）' },
  { value: '1000+', label: '1000+ 人（跨国/集团）' },
]

// --- Store ---
export const useSettingsStore = create<AppSettingsState>()(
  persist<AppSettingsState>(
    (set) => ({
      ocr: DEFAULT_OCR_CONFIG,
      ui: DEFAULT_UI_SETTINGS,
      company: DEFAULT_COMPANY_INFO,
      policy: DEFAULT_REIMBURSEMENT_POLICY,

      patchOcr: (partial) =>
        set((s) => ({
          ocr: { ...s.ocr, ...partial },
        })),
      setOcr: (next) => set({ ocr: next }),
      patchUi: (partial) =>
        set((s) => ({
          ui: { ...s.ui, ...partial },
        })),
      patchCompany: (partial) =>
        set((s) => ({
          company: { ...s.company, ...partial },
        })),
      setCompany: (next) => set({ company: next }),
      patchPolicy: (partial) =>
        set((s) => ({
          policy: {
            ...s.policy,
            ...partial,
            categories: partial.categories ?? s.policy.categories,
            subsidies: partial.subsidies ?? s.policy.subsidies,
            signerLevels: partial.signerLevels ?? s.policy.signerLevels,
            serial: partial.serial ? { ...s.policy.serial, ...partial.serial } : s.policy.serial,
            expenseStandards: partial.expenseStandards ?? s.policy.expenseStandards,
            budgetControl: partial.budgetControl
              ? {
                  ...s.policy.budgetControl,
                  ...partial.budgetControl,
                  departmentBudgets: partial.budgetControl.departmentBudgets ?? s.policy.budgetControl.departmentBudgets,
                  projectBudgets: partial.budgetControl.projectBudgets ?? s.policy.budgetControl.projectBudgets,
                }
              : s.policy.budgetControl,
            approvalRouting: partial.approvalRouting ?? s.policy.approvalRouting,
          },
        })),
      setPolicy: (next) => set({ policy: next }),
      resetOcr: () => set({ ocr: DEFAULT_OCR_CONFIG }),
      resetCompany: () => set({ company: DEFAULT_COMPANY_INFO }),
      resetPolicy: () => set({ policy: DEFAULT_REIMBURSEMENT_POLICY }),
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ ocr: s.ocr, ui: s.ui, company: s.company, policy: s.policy }) as unknown as AppSettingsState,
      // 深层合并：确保新增字段（如 expenseStandards/budgetControl/approvalRouting）
      // 在老版本 localStorage 缺失时使用默认值兜底
      merge: (persisted, current) => {
        const p = (persisted as Record<string, unknown>) || {}
        const c = (current as AppSettingsState)
        const persistedPolicy = (p.policy as ReimbursementPolicy) || undefined
        const defaultPolicy = DEFAULT_REIMBURSEMENT_POLICY
        const mergedPolicy: ReimbursementPolicy = persistedPolicy
          ? {
              ...defaultPolicy,
              ...persistedPolicy,
              categories: persistedPolicy.categories?.length ? persistedPolicy.categories : defaultPolicy.categories,
              subsidies: persistedPolicy.subsidies?.length ? persistedPolicy.subsidies : defaultPolicy.subsidies,
              signerLevels: persistedPolicy.signerLevels?.length ? persistedPolicy.signerLevels : defaultPolicy.signerLevels,
              serial: { ...defaultPolicy.serial, ...(persistedPolicy.serial || {}) },
              expenseStandards: persistedPolicy.expenseStandards?.length ? persistedPolicy.expenseStandards : defaultPolicy.expenseStandards,
              approvalRouting: persistedPolicy.approvalRouting?.length ? persistedPolicy.approvalRouting : defaultPolicy.approvalRouting,
              budgetControl: {
                ...defaultPolicy.budgetControl,
                ...(persistedPolicy.budgetControl || {}),
                departmentBudgets: persistedPolicy.budgetControl?.departmentBudgets?.length ? persistedPolicy.budgetControl.departmentBudgets : defaultPolicy.budgetControl.departmentBudgets,
                projectBudgets: persistedPolicy.budgetControl?.projectBudgets?.length ? persistedPolicy.budgetControl.projectBudgets : defaultPolicy.budgetControl.projectBudgets,
              },
            }
          : defaultPolicy
        return { ...c, ...p, policy: mergedPolicy } as AppSettingsState
      },
    }
  )
)

/** 从 localStorage 同步读取（供非 React 上下文/api.ts 上传场景调用） */
export function readOcrConfigSync(): OcrProviderConfig {
  if (typeof window === 'undefined') return DEFAULT_OCR_CONFIG
  try {
    const raw = localStorage.getItem('app-settings')
    if (!raw) return DEFAULT_OCR_CONFIG
    const parsed = JSON.parse(raw)?.state
    return { ...DEFAULT_OCR_CONFIG, ...(parsed?.ocr || {}) }
  } catch {
    return DEFAULT_OCR_CONFIG
  }
}

/** 同步读取公司信息（打印页 / 导出 PDF 服务端无法用 zustand hook 时调用） */
export function readCompanyInfoSync(): CompanyInfo {
  if (typeof window === 'undefined') return DEFAULT_COMPANY_INFO
  try {
    const raw = localStorage.getItem('app-settings')
    if (!raw) return DEFAULT_COMPANY_INFO
    const parsed = JSON.parse(raw)?.state
    return { ...DEFAULT_COMPANY_INFO, ...(parsed?.company || {}) }
  } catch {
    return DEFAULT_COMPANY_INFO
  }
}

/** 同步读取报销规则（非 React 上下文调用，如生成单据编号、导出 PDF 用） */
export function readReimbursementPolicySync(): ReimbursementPolicy {
  if (typeof window === 'undefined') return DEFAULT_REIMBURSEMENT_POLICY
  try {
    const raw = localStorage.getItem('app-settings')
    if (!raw) return DEFAULT_REIMBURSEMENT_POLICY
    const parsed = JSON.parse(raw)?.state
    // 深层合并：数组以默认值兜底，避免老版本 localStorage 缺失字段
    const base: ReimbursementPolicy = { ...DEFAULT_REIMBURSEMENT_POLICY, ...(parsed?.policy || {}) }
    base.categories = parsed?.policy?.categories?.length
      ? parsed.policy.categories
      : DEFAULT_REIMBURSEMENT_POLICY.categories
    base.subsidies = parsed?.policy?.subsidies?.length
      ? parsed.policy.subsidies
      : DEFAULT_REIMBURSEMENT_POLICY.subsidies
    base.signerLevels = parsed?.policy?.signerLevels?.length
      ? parsed.policy.signerLevels
      : DEFAULT_REIMBURSEMENT_POLICY.signerLevels
    base.serial = { ...DEFAULT_REIMBURSEMENT_POLICY.serial, ...(parsed?.policy?.serial || {}) }
    // 兜底扩展字段（老版本 localStorage 无这些字段时使用默认值）
    base.expenseStandards = parsed?.policy?.expenseStandards?.length
      ? parsed.policy.expenseStandards
      : DEFAULT_REIMBURSEMENT_POLICY.expenseStandards
    base.approvalRouting = parsed?.policy?.approvalRouting?.length
      ? parsed.policy.approvalRouting
      : DEFAULT_REIMBURSEMENT_POLICY.approvalRouting
    base.budgetControl = {
      ...DEFAULT_REIMBURSEMENT_POLICY.budgetControl,
      ...(parsed?.policy?.budgetControl || {}),
      departmentBudgets: parsed?.policy?.budgetControl?.departmentBudgets?.length
        ? parsed.policy.budgetControl.departmentBudgets
        : DEFAULT_REIMBURSEMENT_POLICY.budgetControl.departmentBudgets,
      projectBudgets: parsed?.policy?.budgetControl?.projectBudgets?.length
        ? parsed.policy.budgetControl.projectBudgets
        : DEFAULT_REIMBURSEMENT_POLICY.budgetControl.projectBudgets,
    }
    return base
  } catch {
    return DEFAULT_REIMBURSEMENT_POLICY
  }
}

/** 按报销规则生成下一个单据编号（序号保存在 localStorage，按 yyyyMM 重置） */
export function generateNextSerialNo(policy: ReimbursementPolicy, now: Date = new Date()): string {
  const { prefix, datePart, seqDigits, separator } = policy.serial
  const pad = (n: number, len: number) => String(n).padStart(len, '0')
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  let dateStr = ''
  if (datePart === 'yyyyMM') dateStr = `${y}${pad(m, 2)}`
  else if (datePart === 'yyyyMMdd') dateStr = `${y}${pad(m, 2)}${pad(d, 2)}`

  // 读取/递增本地计数：按 datePart 分组重置
  const group = dateStr || 'global'
  const STORAGE_KEY = 'reimbursement-serial-counter'
  let counterMap: Record<string, number> = {}
  try {
    counterMap = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    counterMap = {}
  }
  const next = (counterMap[group] || 0) + 1
  counterMap[group] = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counterMap))
  } catch {
    /* ignore */
  }
  const seq = pad(next, seqDigits)
  return [prefix, dateStr, seq].filter(Boolean).join(separator)
}
