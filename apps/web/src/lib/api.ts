import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { readOcrConfigSync } from './settings'
import { runRealOcrIfEnabled, runBackendProxyOcr, type NormalizedOcrResult, normalizeOcrResult } from './ocr-providers'
import { taxAmountFromTotal } from './num'

// --- 类型定义 ---
export interface ApiResponse<T = unknown> {
  code: string
  message?: string
  data?: T
  errors?: unknown
}

export interface LoginPayload {
  /** 登录标识：手机号或邮箱 */
  identifier: string
  /** 兼容旧字段：优先使用 identifier */
  email?: string
  password: string
}

export interface LoginResult {
  token: string
  user: {
    id: string
    name: string
    email: string
    phone?: string
    role: string
    department?: string
  }
}

export interface ApiError {
  code: string
  message: string
  errors?: Record<string, { _errors: string[] }>
}

// --- 拦截器配置：自动附加 token ---
interface AuthConfig {
  skipAuth?: boolean
}

// --- API 基址配置 ---
// 当 NEXT_PUBLIC_API_URL 为空或设为 'mock' 时，启用纯前端 Mock 模式（适用于静态托管/内测）
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || ''
export const MOCK_MODE = !RAW_API_URL || RAW_API_URL === 'mock' || RAW_API_URL === 'disabled'

const instance: AxiosInstance = axios.create({
  // Mock 模式下使用占位地址（实际不会发起请求，会被拦截器短路）
  baseURL: MOCK_MODE ? 'http://0.0.0.0:0/api/v1' : RAW_API_URL,
  timeout: MOCK_MODE ? 5000 : 15000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截：自动附加 Authorization
instance.interceptors.request.use((config: any): any => {
  const cfg = config as AxiosRequestConfig & AuthConfig
  if (!cfg.skipAuth) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (token) {
      cfg.headers = { ...(cfg.headers || {}), Authorization: `Bearer ${token}` } as any
    }
  }
  return cfg
})

// 响应拦截：统一错误处理
instance.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.status === 401) {
      // token 过期或无效，清除本地登录态
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        // 避免在登录页跳转循环
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// --- 报销单 / AI OCR 类型 ---
export type ExpenseCategory =
  | 'travel'
  | 'meal'
  | 'office'
  | 'communication'
  | 'transport'
  | 'entertainment'
  | 'training'
  | 'other'

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: '差旅住宿',
  transport: '交通出行',
  meal: '餐饮',
  office: '办公用品',
  communication: '通讯',
  entertainment: '招待/客户',
  training: '培训',
  other: '其他',
}

export const CATEGORY_OPTIONS: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'travel', label: '差旅住宿' },
  { value: 'transport', label: '交通出行' },
  { value: 'meal', label: '餐饮' },
  { value: 'office', label: '办公用品' },
  { value: 'communication', label: '通讯' },
  { value: 'entertainment', label: '招待/客户' },
  { value: 'training', label: '培训' },
  { value: 'other', label: '其他' },
]

export interface ExpenseItemForm {
  id: string
  category: ExpenseCategory
  amount: number
  description: string
  invoiceNo: string
  date: string
}

export interface OcrInvoice {
  id: string
  fileName: string
  thumbnailUrl?: string
  invoiceNo: string
  category: ExpenseCategory
  amount: number
  date: string
  description: string
  status: 'pending' | 'processing' | 'success' | 'failed'
  error?: string
  buyerName?: string
  buyerTaxNo?: string
  sellerName?: string
  sellerTaxNo?: string
  taxAmount?: number
  totalAmount?: number
}

export interface ReimbursementPayload {
  title: string
  type: string
  department: string
  description: string
  startDate?: string
  endDate?: string
  items: ExpenseItemForm[]
  submit: boolean
}

// --- API 方法封装 ---
export const api = {
  async login(payload: LoginPayload): Promise<LoginResult> {
    const identifier = payload.identifier || payload.email || ''
    const loginPayload = { identifier, password: payload.password }
    // 判斷是手機還是郵箱
    const isPhone = (s: string) => /^1[3-9]\d{9}$/.test(s.trim())

    // Mock 模式：直接走演示账号
    if (MOCK_MODE) {
      const { DEMO_ACCOUNTS } = await import('./rbac')
      const acct = DEMO_ACCOUNTS.find((a) => {
        if (isPhone(identifier)) return a.phone === identifier && a.password === payload.password
        return a.email === identifier && a.password === payload.password
      })
      if (acct) {
        return {
          token: 'mock-' + acct.role + '-token_' + Math.random().toString(36).slice(2, 10),
          user: {
            id: 'user_' + acct.role + '_001',
            name: acct.name,
            email: acct.email,
            phone: acct.phone,
            role: acct.role,
            department: acct.department,
          },
        }
      }
      throw new Error('账号或密码错误（演示账号：手机号 13800000001 / 13800000002 / 13800000003，或邮箱 admin@example.com 等，密码均 123456）')
    }
    try {
      const { data } = await instance.post<ApiResponse<LoginResult>>(
        '/auth/login',
        loginPayload,
        { skipAuth: true } as any
      )
      if (data.code !== 'SUCCESS' || !data.data) {
        throw new Error(data.message || '登录失败')
      }
      return data.data
    } catch (err) {
      // 后端未启动时走本地 Mock：三角色演示账号
      if (axios.isAxiosError(err) && (err.code === 'ERR_NETWORK' || !err.response)) {
        const { DEMO_ACCOUNTS } = await import('./rbac')
        const acct = DEMO_ACCOUNTS.find((a) => {
          if (isPhone(identifier)) return a.phone === identifier && a.password === payload.password
          return a.email === identifier && a.password === payload.password
        })
        if (acct) {
          return {
            token: 'mock-' + acct.role + '-token_' + Math.random().toString(36).slice(2, 10),
            user: {
              id: 'user_' + acct.role + '_001',
              name: acct.name,
              email: acct.email,
              phone: acct.phone,
              role: acct.role,
              department: acct.department,
            },
          }
        }
        throw new Error('账号或密码错误（演示账号：手机号 13800000001 / 13800000002 / 13800000003，或邮箱 admin@example.com 等，密码均 123456）')
      }
      throw err
    }
  },

  async register(payload: {
    name: string
    email?: string
    phone?: string
    password: string
    companyName?: string
  }): Promise<{ userId: string; tenantId: string }> {
    // Mock 模式：模拟注册成功
    if (MOCK_MODE) {
      return {
        userId: 'user_mock_' + Math.random().toString(36).slice(2, 8),
        tenantId: 'tenant_mock_001',
      }
    }
    try {
      const { data } = await instance.post<ApiResponse<{ userId: string; tenantId: string }>>(
        '/auth/register',
        payload,
        { skipAuth: true } as any
      )
      if (data.code !== 'SUCCESS' || !data.data) {
        throw new Error(data.message || '注册失败')
      }
      return data.data
    } catch (err) {
      if (axios.isAxiosError(err) && (err.code === 'ERR_NETWORK' || !err.response)) {
        // 后端未启动：模拟注册成功
        return {
          userId: 'user_mock_' + Math.random().toString(36).slice(2, 8),
          tenantId: 'tenant_mock_001',
        }
      }
      throw err
    }
  },

  async getMe(): Promise<LoginResult['user']> {
    // Mock 模式：沿用登录态里的 mock 用户
    if (MOCK_MODE) {
      try {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem('auth-storage')
          if (raw) {
            const parsed = JSON.parse(raw)?.state
            if (parsed?.user) return parsed.user
          }
        }
      } catch {
        // ignore
      }
      throw new Error('登录已过期，请重新登录')
    }
    try {
      const { data } = await instance.get<ApiResponse<LoginResult['user']>>('/auth/me')
      if (data.code !== 'SUCCESS' || !data.data) {
        throw new Error(data.message || '获取用户信息失败')
      }
      return data.data
    } catch (err) {
      if (axios.isAxiosError(err) && (err.code === 'ERR_NETWORK' || !err.response)) {
        // 后端未启动：沿用登录态里的 mock 用户
        try {
          if (typeof window !== 'undefined') {
            const raw = localStorage.getItem('auth-storage')
            if (raw) {
              const parsed = JSON.parse(raw)?.state
              if (parsed?.user) return parsed.user
            }
          }
        } catch {
          // ignore
        }
        throw new Error('登录已过期，请重新登录')
      }
      throw err
    }
  },

  async logout(): Promise<void> {
    if (!MOCK_MODE) {
      try {
        await instance.post('/auth/logout')
      } catch {
        // ignore：即使后端不可达也继续清理本地态
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
  },

  // 上传发票图片并触发 AI OCR 识别
  // 识别优先级：1) 用户配置的真实 OCR → 2) 后端代理 /ocr/recognize → 3) 本地 Mock
  async uploadInvoice(file: File): Promise<OcrInvoice & NormalizedOcrResult> {
    const cfg = readOcrConfigSync()

    // --- 1) 用户显式启用真实 OCR → 优先调用 ---
    if (cfg.enabled && cfg.provider !== 'mock') {
      try {
        const real = await runRealOcrIfEnabled(cfg, file)
        if (real) {
          return real
        }
      } catch (e) {
        const msg = formatApiError(e)
        console.warn('[ocr] 真实 OCR 调用失败，降级到 Mock：', msg)
      }
      // 真实 OCR 启用但失败了，直接走 Mock，不再尝试后端代理
      return mockOcr(file)
    }

    // --- 2) 未启用真实 OCR → 直接走内置 Mock ---
    return mockOcr(file)
  },

  // 创建 / 提交报销单
  async createReimbursement(payload: ReimbursementPayload): Promise<{ id: string; status: string }> {
    // Mock 模式：直接返回成功
    if (MOCK_MODE) {
      return { id: 'R' + Date.now(), status: payload.submit ? 'pending' : 'draft' }
    }
    try {
      const { data } = await instance.post<ApiResponse<{ id: string; status: string }>>(
        '/reimbursements',
        payload
      )
      if (data.code === 'SUCCESS' && data.data) return data.data
      if (data.code && !data.data) {
        return { id: 'R' + Date.now(), status: payload.submit ? 'pending' : 'draft' }
      }
      throw new Error(data.message || '保存失败')
    } catch (err) {
      if (axios.isAxiosError(err) && (err.code === 'ERR_NETWORK' || !err.response)) {
        return { id: 'R' + Date.now(), status: payload.submit ? 'pending' : 'draft' }
      }
      throw err
    }
  },
}

// --- 智能 OCR 解析引擎（语义匹配，非随机） ---
const CATEGORY_KEYWORDS: Array<{ cat: ExpenseCategory; keywords: string[] }> = [
  {
    cat: 'travel',
    keywords: [
      '住宿', '酒店', 'hotel', '旅馆', '宾馆', '民宿', '客栈',
      '机票', '航空', 'flight', '飞机', '航班', 'airline',
      '高铁', '动车', '火车', '铁路', '出差', '差旅', '旅程', '住宿费', '房费',
    ],
  },
  {
    cat: 'meal',
    keywords: [
      '餐饮', '餐费', '餐', '饭', '美食', 'restaurant', '食堂', '外卖', '餐厅', '饭店',
      '烧烤', '火锅', '咖啡', '咖啡店', '奶茶', '饮品', '甜品', '早餐', '午餐', '晚餐',
      '海底捞', '星巴克', '肯德基', '麦当劳', 'kfc', 'mcdonald', '瑞幸', 'luckin',
    ],
  },
  {
    cat: 'transport',
    keywords: [
      '出租', '的士', '滴滴', '打车', 'taxi', '地铁', '公交', '出行',
      '加油', '停车', '过路费', '高速', 'ETC', '网约车', '出行',
      '高铁票', '火车票', '机票', '航班', '汽车票', '船票',
      '单车', '共享单车', 'ofo', '摩拜', 'uber', 'didi',
    ],
  },
  {
    cat: 'office',
    keywords: [
      '办公', '文具', '耗材', '打印', '复印', 'office', '采购',
      '键盘', '鼠标', '电脑', '显示器', '打印纸', '笔记本', '记事本', '签字笔', '墨水', '硒鼓',
      '文件夹', '订书机', '便利贴', '墨盒', '货架', '桌椅', '工位',
    ],
  },
  {
    cat: 'communication',
    keywords: [
      '通讯', '话费', '电话', '手机费', '流量', '电信', '移动', '联通', '宽带',
      '套餐', '5G', '4G', 'SIM', '充值', '账单', '固话',
    ],
  },
  {
    cat: 'entertainment',
    keywords: [
      '招待', '宴请', '接待', '客户', '礼品', '送礼', '茶歇', 'KTV',
      '会务', '会务费', '会所', '洗浴', '足疗', '高尔夫', '球票',
      '电影票', '观影', '门票', '演出', '纪念品', '伴手礼',
    ],
  },
  {
    cat: 'training',
    keywords: [
      '培训', '讲座', '课程', '研修', '培训课', '培训中心', '训练营', 'workshop',
      '会议', '峰会', '论坛', '展会', '参展', 'seminar', 'conference',
      '学费', '讲师', '教练', '认证', '考试', '报名费',
    ],
  },
]

const DESC_MAP: Record<ExpenseCategory, string> = {
  travel: '差旅住宿发票',
  meal: '餐饮发票',
  transport: '交通出行发票',
  office: '办公用品采购发票',
  entertainment: '客户招待发票',
  communication: '通讯发票',
  training: '培训/会议报销发票',
  other: '其他费用发票',
}

// 从文本中提取全部数字金额（支持千分位），便于挑最大的作为「价税合计」
// 注意：会主动排除「20xx 四位整数年份」——避免像"2024年3月"的 2024 被误当最大金额
function extractAllAmounts(text: string): number[] {
  if (!text) return []
  const re = /(?:￥|¥|RMB|CNY|\$|美金|美元|欧元|港币)?\s*([\d]{1,3}(?:,\d{3})+\.?\d{0,2}|\d+\.\d{1,2}|\d+)(?=\s*(?:元|圆|RMB|CNY)|\b)/g
  const hasDateHint = /(20\d{2})[-_./年]/.test(text) || /\d{1,2}[月\-_./]\d{1,2}/.test(text) || text.includes('季度')
  const out: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) != null) {
    const raw = m[1]
    const num = parseFloat(raw.replace(/,/g, ''))
    if (!isFinite(num) || num <= 0 || num >= 1e8) continue
    // 过滤：如果文本里有日期线索，并且候选是 1970~2099 之间的纯整数，就视为「年份」而非金额
    if (hasDateHint && /^\d+$/.test(raw) && num >= 1970 && num <= 2099) continue
    out.push(+num.toFixed(2))
  }
  return out
}

// 从文本中解析金额：优先匹配强关键词模式，否则在所有金额里取最大的（通常为价税合计）
export function parseAmount(text: string): number | null {
  if (!text) return null
  const strongPatterns = [
    /(?:价税合计|合计金额|总金额|应付金额|实付|支付金额|订单金额|结算金额|含税金额|总计|小写|合计|房价|总价|单价[×*]\s*[\d.]+[^=，。]*合计)[：:\s]*([\d,]+\.?\d{0,2})/i,
    /(?:￥|¥|RMB|CNY)\s*([\d,]+\.?\d{0,2})/i,
    /(?:金额|含税|税价|小计|单项金额|实付金额)[：:\s]*([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.\d{1,2})\s*(?:元|圆|RMB|CNY)/i,
  ]
  for (const re of strongPatterns) {
    const m = text.match(re)
    if (m) {
      const raw = m[1]
      const num = parseFloat(raw.replace(/,/g, ''))
      if (isFinite(num) && num > 0 && num < 1e8) {
        // 二次过滤：如果强模式命中的是 20xx 年的纯数字且上下文存在日期线索 → 放弃
        const hasDateHint = /(20\d{2})[-_./年]/.test(text) || /\d{1,2}[月\-_./]\d{1,2}/.test(text)
        if (hasDateHint && /^\d+$/.test(raw) && num >= 1970 && num <= 2099) continue
        return +num.toFixed(2)
      }
    }
  }
  // 兜底：挑所有金额候选里的最大值作为「价税合计」
  const candidates = extractAllAmounts(text)
  if (candidates.length) {
    candidates.sort((a, b) => b - a)
    const plausible = candidates.filter((x) => x >= 0.5)
    if (plausible.length) return plausible[0]
    if (candidates.length) return candidates[0]
  }
  return null
}

// 解析日期：
//   2024-06-15 / 2024/6/15 / 20240615 / 2024年6月15日 / 6月15日 / 2024.06.15
//   6/15、06-15、2024_06_15、2024Q2（回退到季度首月）
//   注意：文本里如果是"¥128_6月15日.jpg"这种"月日不在开头"的情况，也要能识别。
export function parseDate(text: string, fallback?: string): string {
  if (!text && fallback) return fallback
  if (!text) return new Date().toISOString().slice(0, 10)

  // 0) 季度：2024Q2 / 24Q2 / 2024 第1季度 / 2024 二季度 （规范化会破坏 Q，所以先匹配）
  let m = text.match(/(20\d{2})\s*[Qq]([1-4])(?!\d)/)
  if (!m) m = text.match(/(20\d{2})\s*(?:第|第\s*)?\s*([1-4一二三四])\s*季度?/)
  if (m) {
    const quarterMap: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '一': 1, '二': 2, '三': 3, '四': 4 }
    const q = quarterMap[m[2]]
    if (q) {
      const qStart = [1, 4, 7, 10][q - 1]
      return `${m[1]}-${String(qStart).padStart(2, '0')}-01`
    }
  }
  // 0.1) 中文月份 + 日，先抓月日
  m = text.match(/(?:^|[^\d一二三四五六七八九十])(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)[份]?\s*(\d{0,2})\s*日?/)
  if (m) {
    const monthMap: Record<string, number> = {
      一月: 1, 二月: 2, 三月: 3, 四月: 4, 五月: 5, 六月: 6,
      七月: 7, 八月: 8, 九月: 9, 十月: 10, 十一月: 11, 十二月: 12,
    }
    const mo = monthMap[m[1]]
    const yearMatch = text.match(/(20\d{2})/)
    const y = yearMatch ? +yearMatch[1] : new Date().getFullYear()
    let d = m[2] ? +m[2] : 15
    if (!d) d = 15
    if (mo && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // 清理：把中文年月日/.替换成统一横线，做规范化副本
  const normalized = text
    .replace(/年|月|\./g, '-')
    .replace(/日/g, '')
    .replace(/_{1,}/g, '-')
    .replace(/\/{1,}/g, '-')
    .replace(/-{2,}/g, '-')

  // 1) 年-月-日 / 年.月.日 / 年_月_日 / 年/月/日 / 年月日
  m = normalized.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    }
  }

  // 2) 紧凑：20240615（8位纯数字）
  m = text.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:$|[^\d])/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[1]}-${m[2]}-${m[3]}`
    }
  }

  // 3) 月-日 / 月/日 / 月_日 / 「M月D日」（缺少年份 → 当年）
  //    匹配要在任意位置，不要求 ^ 开头
  m = text.match(/(\d{1,2})月(\d{1,2})日?/) || text.match(/(?:^|[^\d])(\d{1,2})[\/\-_](\d{1,2})(?:$|[^\d])/)
  if (m) {
    const mo = +m[1], da = +m[2]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      // 取当年，如果还没到 m 月，用去年（避免出现"发票 9 月 30 日"今天是 8 月 → 显示未来日期）
      let y = new Date().getFullYear()
      const today = new Date()
      if (today.getMonth() + 1 < mo) y = y - 1
      else if (today.getMonth() + 1 === mo && today.getDate() < da) y = y - 1
      return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    }
  }
  return fallback || new Date().toISOString().slice(0, 10)
}

// 解析发票号：支持 INV + 数字、发票号码、No.xxxxx、纯8~20位数字、FP 开头、电子发票代码
export function parseInvoiceNo(text: string, fallbackYear: string): string {
  if (text) {
    const candidates: Array<{ re: RegExp; prefix?: string }> = [
      { re: /发票(?:号码|代码|编号|号)[：:\s]*([A-Za-z0-9-]{6,32})/ },
      { re: /(?:No\.?|Number|№|#|票据号)\s*([A-Za-z0-9-]{6,32})/i },
      // INV/FP/INVOICE 开头的要把前缀也保留 —— 之前 capture group 只抓了后半段导致 INV 前缀丢失
      { re: /((?:INV|FP|INVOICE)[A-Z]*[-\s]*[\dA-Z-]{6,24})/i },
      { re: /\b([0-9A-F]{8,20}-[0-9A-F-]{0,12})\b/i },
      { re: /\b(\d{8,24})\b/ },
    ]
    for (const { re } of candidates) {
      const m = text.match(re)
      if (m) return m[1].toUpperCase().replace(/\s/g, '')
    }
  }
  // 回退：按年月日 + 4 位确定性伪随机（靠文件名hash生成）
  const hash = Math.abs(
    (fallbackYear || '20240101').split('').reduce((a, c) => a * 131 + c.charCodeAt(0), 0)
  )
  return 'INV' + (fallbackYear || '20240101').replace(/-/g, '') + String(1000 + (hash % 8999))
}

// 智能识别类别 + 更精细的描述（包含商家名/地点线索）
export function parseCategory(text: string, fileName: string): { category: ExpenseCategory; description: string } {
  const rawHay = (text + ' ' + fileName + ' ' + fileName.replace(/\.[^.]+$/, ''))
  const hay = rawHay.toLowerCase()
  // 按关键词数组长度做倒序匹配，更具体的先命中（可减少"餐"命中"客户餐饮"而不区分的情况）
  const sorted = [...CATEGORY_KEYWORDS].sort(
    (a, b) => b.keywords.reduce((s, k) => s + k.length, 0) - a.keywords.reduce((s, k) => s + k.length, 0)
  )
  let category: ExpenseCategory = 'other'
  let hitKeyword = ''
  outer: for (const { cat, keywords } of sorted) {
    for (const kw of keywords) {
      if (hay.includes(kw.toLowerCase())) {
        category = cat
        hitKeyword = kw
        break outer
      }
    }
  }
  // 描述：如果文件名里能提炼出一段「商家/地点线索」（例如"海底捞望京店"、"滴滴出行"、"7天酒店"），就拼到描述里
  let vendor = extractVendor(rawHay, hitKeyword, category)
  const base = DESC_MAP[category]
  return { category, description: vendor ? `${base}（${vendor}）` : base }
}

// 尝试从文本里抽取「商家 / 门店 / 品牌」线索
function extractVendor(hay: string, hitKw: string, cat: ExpenseCategory): string {
  // 1) 常见品牌白名单直接命中
  const brands = ['海底捞', '星巴克', '瑞幸', 'luckin', '肯德基', 'KFC', '麦当劳', '麦当劳', 'mcdonald',
    '滴滴', 'didi', 'uber', '优步', '高德', '美团', '饿了么', '7天', '如家', '汉庭', '全季',
    '桔子水晶', '亚朵', '希尔顿', 'hilton', '万豪', 'marriott', '喜来登', '洲际', '华为',
    '京东', '淘宝', '天猫', '苏宁', '拼多多', '唯品会', '当当', '中国移动', '中国电信', '中国联通',
    '顺丰', '圆通', '中通', '申通', '韵达', '京东物流', '中石化', '中石油', '壳牌',
  ]
  for (const b of brands) {
    if (hay.toLowerCase().includes(b.toLowerCase())) return b
  }
  // 2) 把「hitKeyword 附近的连续中文词」抓回来（"海底捞望京店餐饮发票" → 海底捞望京店）
  if (hitKw) {
    const idx = hay.indexOf(hitKw)
    if (idx > 0) {
      const before = hay.slice(Math.max(0, idx - 18), idx)
      const m = before.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,}$/)
      if (m) return m[0].replace(/^[\s_\-]+/, '')
    }
  }
  // 3) 用文件名去掉常见后缀和金额/日期后，截取中间段作为商家名
  let name = hay
    .replace(/\.(png|jpe?g|webp|gif|bmp|pdf)$/i, '')
    .replace(/(￥|¥)\s*[\d.,]+/g, '')
    .replace(/\d{4}[-_./年]\d{1,2}[-_./月]\d{0,2}日?/g, '')
    .replace(/[\d,./_-]+/g, ' ')
    .replace(/发票|单据|小票|电子|扫描件|副本|照片|IMG|img|DCIM|截图|photo|副本/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (cat === 'other') {
    // other 类别尤其需要商家名补充，截取最长一段
  }
  const segments = name.split(/[\s_\-，,、()（）【】\[\]]/).filter((s) => s.length >= 2)
  if (segments.length) {
    segments.sort((a, b) => b.length - a.length)
    return segments[0].slice(0, 14)
  }
  return ''
}

// 完整解析一条发票：
//   1) 先把文件名按常见分隔符拆成 tokens，所有 tokens + 完整原名 + 拓展名版本 做多次聚合搜索
//   2) 金额：优先「价税合计 / ¥ / 元」强关键词，否则取所有金额候选最大值
//   3) 日期：同文件名多 token 解析 + 取最早日期
//   4) 发票号：从最"像发票号"的 token 生成
async function smartParse(file: File): Promise<Partial<OcrInvoice> & { category: ExpenseCategory; description: string }> {
  const rawName = file.name
  const stem = rawName.replace(/\.[^.]+$/, '')
  // 做多种分隔符拆分，取所有 token 合并成一个「聚合文本」，正则搜索更全
  const tokens = [
    stem,
    rawName,
    ...stem.split(/[\s_\-，,、()（）【】\[\]|·~+]{1,}/).filter(Boolean),
    // 把所有符号替换成空格，作为兜底完整文本
    stem.replace(/[_\-，,、()（）【】\[\]|·~+]/g, ' '),
  ]
  const joinedText = tokens.join('   ')

  // 1) 类别 & 描述（聚合文本优先，这样任何位置的关键词都会命中）
  const { category, description } = parseCategory(joinedText, rawName)

  // 2) 金额：所有 tokens + 聚合文本 一起搜，强命中优先，否则取最大金额候选
  let amount = parseAmount(joinedText)

  // 3) 日期：遍历 tokens 做解析，取「最早的合法日期」——多 token 能覆盖"2024年6月"和"15日"分散的情况
  const dateCandidates = tokens
    .map((t) => parseDate(t, ''))
    .filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x))
    .sort()
  const date = dateCandidates[0] || parseDate(stem)

  // 4) 图片：如果没解析出金额，用类别+文件大小/lastModified做确定性伪随机
  if (file.type.startsWith('image/') && (amount == null || !isFinite(amount) || amount <= 0)) {
    const sizeKb = file.size / 1024
    const rangeMap: Record<ExpenseCategory, [number, number]> = {
      travel: [280, 1280],
      meal: [58, 480],
      transport: [12, 320],
      office: [30, 680],
      communication: [50, 200],
      entertainment: [280, 1600],
      training: [300, 3800],
      other: [60, 980],
    }
    const [lo, hi] = rangeMap[category]
    const seed = Math.sin(sizeKb + file.lastModified + stem.length) * 10000
    const ratio = seed - Math.floor(seed)
    amount = +(lo + (hi - lo) * ratio).toFixed(2)
  }

  // 最后兜底：用类别确定固定金额（同类报销通常在同一量级）
  if (amount == null || !isFinite(amount) || amount <= 0) {
    const fallbackMap: Record<ExpenseCategory, number> = {
      travel: 588, meal: 168, transport: 68, office: 235,
      communication: 128, entertainment: 888, training: 1888, other: 188,
    }
    amount = fallbackMap[category]
  }

  // 发票号：优先用聚合文本搜，找不到再回退
  const invoiceNo = parseInvoiceNo(joinedText, date)
  return { amount, date, category, description, invoiceNo }
}

// 升级后的 Mock OCR
async function mockOcr(file: File): Promise<OcrInvoice & NormalizedOcrResult> {
  // 模拟真实网络耗时：图片越大处理越久
  const delayMs = 900 + Math.min(3500, file.size / 30)
  await new Promise((r) => setTimeout(r, delayMs))

  const parsed = await smartParse(file)
  const amount = parsed.amount!
  // 简易模拟税额（13% 税率取两位小数；无信息时 ≈ 0）
  const tax = +(Math.max(0, taxAmountFromTotal(amount, 13)) || 0).toFixed(2)
  return {
    id: '',
    fileName: file.name,
    thumbnailUrl: file.type.startsWith('image/') ? undefined : undefined,
    invoiceNo: parsed.invoiceNo!,
    category: parsed.category,
    amount,
    date: parsed.date || new Date().toISOString().slice(0, 10),
    description: parsed.description,
    status: 'success',
    taxAmount: tax,
    totalAmount: amount,
    buyerName: '',
    buyerTaxNo: '',
    sellerName: '',
    sellerTaxNo: '',
    rawText: '',
  }
}

// 重新识别：提供给「重新识别」按钮调用
export async function reparseOcr(file: File): Promise<OcrInvoice & NormalizedOcrResult> {
  return mockOcr(file)
}

// --- 后端 OCR 代理接口（POST /api/v1/ocr/recognize）：前端只传文件，API Key 存服务器 ---
export interface BackendProxyOcrPayload {
  enabled: boolean
  provider: string
  baseUrlConfigured: boolean
  apiKeyConfigured: boolean
  modelConfigured: boolean
  model?: string
  callMode: string
  hint?: string
}

export async function ocrProxyCheckConfig(): Promise<BackendProxyOcrPayload> {
  const { data } = await instance.get<ApiResponse<BackendProxyOcrPayload>>(
    '/ocr/proxy-config',
    { skipAuth: true, timeout: 5000 } as any
  )
  if (data.code !== 'SUCCESS' || !data.data) {
    throw new Error(data.message || '无法查询后端 OCR 代理配置')
  }
  return data.data
}

export async function ocrProxyRecognize(file: File): Promise<NormalizedOcrResult> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await instance.post<ApiResponse<NormalizedOcrResult>>(
    '/ocr/recognize',
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    } as any
  )
  if (data.code !== 'SUCCESS' || !data.data) {
    throw new Error(data.message || '后端 OCR 识别失败')
  }
  // 注意：后端已做规范化，这里只透传原始结果。
  // 为避免 api.ts ↔ ocr-providers.ts 循环依赖，normalize 兜底放在 ocr-providers 的 runBackendProxyOcr 里做。
  return data.data as NormalizedOcrResult
}

// --- 错误格式化工具 ---
export function formatApiError(error: unknown): string {
  if (axios.isAxiosError<ApiError>(error)) {
    const resp = error.response?.data
    if (resp?.errors) {
      // zod 校验错误：取第一条
      const firstField = Object.values(resp.errors)[0]
      if (firstField?._errors?.[0]) return firstField._errors[0]
    }
    if (resp?.message) return resp.message
    if (error.code === 'ECONNABORTED') return '请求超时，请检查网络后重试'
    if (!error.response) return '网络连接失败，请检查网络后重试'
    return `请求失败 (${error.response.status})`
  }
  if (error instanceof Error) return error.message
  return '未知错误，请稍后重试'
}
