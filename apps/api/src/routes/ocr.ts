import { Hono } from 'hono'
import axios from 'axios'

const ocr = new Hono()

// ---- 后端代理使用的 System Prompt（与前端默认保持一致，可通过 OCR_PROXY_SYSTEM_PROMPT 环境变量覆盖） ----
const DEFAULT_OCR_SYSTEM_PROMPT = `你是专业的发票/小票/行程单识别助手。请按如下要求精确识别图像中的内容：
1) 输出必须是**合法 JSON**，不要输出任何 Markdown、解释、思考过程、代码块包裹（不要用 \`\`\`json）。
2) 字段规范：
{
  "invoiceNo": "发票号码/编号（如有 INVxxx 优先取；否则取发票号码字段；找不到就返回空字符串）",
  "date": "YYYY-MM-DD 格式的开票日期（2024-05-22；仅年月日），找不到就返回空字符串",
  "amount": 0.0,
  "taxAmount": 0.0,
  "totalAmount": 0.0,
  "category": "分类：travel(差旅住宿)/meal(餐饮)/transport(交通出行，含高铁/地铁/出租/滴滴/机票)/office(办公用品采购)/communication(话费/宽带/通讯账单)/entertainment(客户招待/礼品/KTV等)/training(培训/会议/参展)/other（无法分类或其他）",
  "description": "简短中文描述：包含『类别』+ 商家/地点/事由，如『餐饮发票（海底捞望京店）』、『交通出行发票（滴滴出行望京-国贸）』；长度不超过 40 字",
  "buyerName": "购买方名称（通常在「购买方/付款方/购买人」后的公司名或个人名）或空字符串",
  "buyerTaxNo": "购买方纳税人识别号/统一社会信用代码（18 位左右）或空字符串",
  "sellerName": "销售方/开票方名称或空字符串",
  "sellerTaxNo": "销售方纳税人识别号或空字符串",
  "rawText": "可选：把你识别到的主要文字，按行用 \\n 拼起来（500 字以内），便于用户核对"
}
3) 金额字段：
   - totalAmount：**价税合计 / 应付金额 / 实付金额 / 总金额**，用户最关心；如果图上有「价税合计(小写) ¥1,886.00」就取 1886.00；有「¥128 元」就取 128.00。
   - amount：**金额/不含税金额/价款合计**；能识别就填，无法识别就写 null 或同 totalAmount。
   - taxAmount：税额，能识别就填，否则 0 或 null。
4) 分类 category 尽量按语义选最合适的一类：
   - 餐饮 / 饭店 / 火锅 / 咖啡 / 星巴克 / 海底捞 → meal
   - 酒店 / 住宿 / 房费 / 7 天 / 如家 / 汉庭 / 希尔顿 → travel
   - 高铁 / 火车票 / 机票 / 地铁 / 公交 / 出租 / 滴滴 / 加油 / 停车费 / 高速 / ETC → transport
   - 办公 / 文具 / 耗材 / 打印 / 采购 / 电脑 / 显示器 → office
   - 话费 / 手机费 / 流量 / 电信 / 移动 / 联通 / 宽带 → communication
   - 培训 / 会议 / 峰会 / 论坛 / 展会 / 课程 / 报名费 → training
   - 客户招待 / 宴请 / 礼品 / KTV / 高尔夫 / 球票 → entertainment
5) 日期只取**开票日期/行程日期/消费日期**。若有多条，取「业务发生日期」而非打印日期。找不到返回空字符串。
6) 所有数值字段：用 number（128.00 不是字符串）；金额以元为单位，支持 2 位小数。
7) 若图像里**完全没有发票或任何金额/日期信息**，也照样返回合法 JSON（totalAmount=0、category=other、description=其他费用发票，其他字段尽量空）。`

// ---- 简化的响应契约（与前端 NormalizedOcrResult 对齐，避免跨 app 导入） ----
interface VisionLlmInvoiceResult {
  invoiceNo?: string
  date?: string
  amount?: number
  taxAmount?: number
  totalAmount?: number
  category?: string
  description?: string
  buyerName?: string
  buyerTaxNo?: string
  sellerName?: string
  sellerTaxNo?: string
  rawText?: string
}

interface BackendProxyOcrResult {
  invoiceNo: string
  date: string
  category: string
  description: string
  amount: number
  taxAmount: number
  totalAmount: number
  buyerName?: string
  buyerTaxNo?: string
  sellerName?: string
  sellerTaxNo?: string
  rawText?: string
  provider: string
  latencyMs: number
  fileName?: string
}

// ---- JSON 兜底提取（兼容模型用 ```json 包裹或输出解释文字） ----
function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null
  const s = text.trim()
  try { return JSON.parse(s) as T } catch { /* ignore */ }
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (m) {
    try { return JSON.parse(m[1].trim()) as T } catch { /* ignore */ }
  }
  const left = s.indexOf('{')
  const right = s.lastIndexOf('}')
  if (left >= 0 && right > left) {
    try { return JSON.parse(s.slice(left, right + 1)) as T } catch { /* ignore */ }
  }
  return null
}

function to2(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return +n.toFixed(2)
}

// ---- 智能兜底：当 LLM 某些字段缺失时用文件名做轻量推断 ----
const CATEGORY_FALLBACK_MAP: Array<{ cat: string; re: RegExp }> = [
  { cat: 'meal', re: /餐饮|餐费|饭店|火锅|咖啡|星巴克|瑞幸|luckin|海底捞|肯德基|kfc|麦当劳|mcdonald/i },
  { cat: 'travel', re: /住宿|酒店|hotel|机票|航空|飞机|高铁|动车|火车|差旅|宾馆|民宿|房费/i },
  { cat: 'transport', re: /出租|的士|滴滴|didi|打车|taxi|地铁|公交|加油|停车|过路费|高速|etc|网约车|单车|机票|火车票|汽车票/i },
  { cat: 'office', re: /办公|文具|耗材|打印|复印|采购|office|电脑|显示器|键盘|鼠标/i },
  { cat: 'communication', re: /通讯|话费|电话|手机费|流量|电信|移动|联通|宽带/i },
  { cat: 'entertainment', re: /招待|宴请|接待|客户|礼品|ktv|会务|高尔夫|球票/i },
  { cat: 'training', re: /培训|讲座|课程|研修|会议|峰会|论坛|展会|参展|报名费|seminar|conference|workshop/i },
]

const DESC_MAP: Record<string, string> = {
  travel: '差旅住宿发票',
  meal: '餐饮发票',
  transport: '交通出行发票',
  office: '办公用品采购发票',
  communication: '通讯发票',
  entertainment: '客户招待发票',
  training: '培训/会议报销发票',
  other: '其他费用发票',
}

function fallbackCategory(original: string | undefined, fileName: string): { category: string; description: string } {
  if (original && ['travel', 'meal', 'office', 'communication', 'transport', 'entertainment', 'training', 'other'].includes(original)) {
    return { category: original, description: DESC_MAP[original] || '其他费用发票' }
  }
  const hay = fileName || ''
  for (const entry of CATEGORY_FALLBACK_MAP) {
    if (entry.re.test(hay)) {
      return { category: entry.cat, description: DESC_MAP[entry.cat] }
    }
  }
  return { category: 'other', description: DESC_MAP.other }
}

function fallbackAmount(raw: VisionLlmInvoiceResult): { amount: number; totalAmount: number; taxAmount: number } {
  const total = typeof raw.totalAmount === 'number' && isFinite(raw.totalAmount) ? raw.totalAmount : 0
  const amt = typeof raw.amount === 'number' && isFinite(raw.amount) ? raw.amount : 0
  const tax = typeof raw.taxAmount === 'number' && isFinite(raw.taxAmount) ? raw.taxAmount : 0
  if (total > 0) return { amount: to2(amt || total), totalAmount: to2(total), taxAmount: to2(tax) }
  if (amt > 0) return { amount: to2(amt), totalAmount: to2(amt), taxAmount: to2(tax) }
  return { amount: 0, totalAmount: 0, taxAmount: 0 }
}

function fallbackDate(original: string | undefined, fileName: string): string {
  if (original && /^\d{4}-\d{2}-\d{2}$/.test(original)) return original
  // 从文件名提取 2024-06-15 / 2024_06_15 / 20240615 / 6月15日
  let m = (fileName || '').match(/(20\d{2})[-_./年](\d{1,2})[-_./月](\d{1,2})/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    }
  }
  m = (fileName || '').match(/(20\d{2})(\d{2})(\d{2})/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[1]}-${m[2]}-${m[3]}`
  }
  return new Date().toISOString().slice(0, 10)
}

function fallbackInvoiceNo(original: string | undefined, date: string, fileName: string): string {
  if (original && original.length >= 4) return original
  const hash = Math.abs(
    (fileName + date).split('').reduce((a, c) => a * 131 + c.charCodeAt(0), 0)
  )
  return 'INV' + date.replace(/-/g, '') + String(1000 + (hash % 8999))
}

// ---- OCR 配置健康检查：告知前端「后端代理是否已配置」 ----
ocr.get('/proxy-config', (c) => {
  const baseUrl = process.env.OCR_PROXY_BASE_URL || ''
  const apiKey = process.env.OCR_PROXY_API_KEY || ''
  const model = process.env.OCR_PROXY_MODEL || ''
  const enabled = !!baseUrl && !!apiKey && !!model
  return c.json({
    code: 'SUCCESS',
    data: {
      enabled,
      provider: 'vision_llm',
      baseUrlConfigured: !!baseUrl,
      apiKeyConfigured: !!apiKey,
      modelConfigured: !!model,
      model: enabled ? model : undefined,
      callMode: 'backend_proxy',
      hint: enabled
        ? '后端 OCR 代理已就绪，前端保存即可使用，无需在浏览器端填写 API Key。'
        : '后端 OCR 代理尚未配置。请在服务器设置环境变量：OCR_PROXY_BASE_URL / OCR_PROXY_API_KEY / OCR_PROXY_MODEL。',
    },
  })
})

// ---- POST /api/v1/ocr/recognize —— 前端只传文件，Key 只存在服务器 ----
ocr.post('/recognize', async (c) => {
  const startedAt = Date.now()

  // 1) 读取后端配置（服务端 .env，不暴露给前端）
  const baseUrl = (process.env.OCR_PROXY_BASE_URL || '').trim()
  const apiKey = (process.env.OCR_PROXY_API_KEY || '').trim()
  const model = (process.env.OCR_PROXY_MODEL || '').trim()
  const timeoutMs = Number(process.env.OCR_PROXY_TIMEOUT_MS) || 60_000
  const temperature = Number(process.env.OCR_PROXY_TEMPERATURE) || 0.1
  const sysPrompt = (process.env.OCR_PROXY_SYSTEM_PROMPT || '').trim() || DEFAULT_OCR_SYSTEM_PROMPT

  if (!baseUrl || !apiKey || !model) {
    return c.json(
      {
        code: 'PROXY_NOT_CONFIGURED',
        message: '服务器未配置 OCR 代理（缺少 OCR_PROXY_BASE_URL / OCR_PROXY_API_KEY / OCR_PROXY_MODEL 环境变量）。请联系管理员，或在系统设置中切换到「前端直连」模式。',
      },
      503
    )
  }

  // 2) 解析上传的文件
  let file: File | undefined
  let fileName = 'upload'
  try {
    const formData = await c.req.formData()
    const entry = formData.get('file')
    if (!entry || typeof (entry as any).arrayBuffer !== 'function') {
      return c.json(
        { code: 'VALIDATION_ERROR', message: '缺少文件字段 `file`（multipart/form-data 上传）。' },
        400
      )
    }
    file = entry as File
    fileName = file.name || fileName
    if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
      return c.json(
        { code: 'UNSUPPORTED_FILE_TYPE', message: `不支持的文件类型：${file.type}。请上传图片或 PDF。` },
        400
      )
    }
  } catch (err: any) {
    return c.json(
      { code: 'BAD_REQUEST', message: '解析上传文件失败：' + (err?.message || String(err)) },
      400
    )
  }

  // 3) 文件 → base64 data URL
  const buf = Buffer.from(await file.arrayBuffer())
  const mediaType = file.type || 'application/octet-stream'
  const dataUrl = `data:${mediaType};base64,${buf.toString('base64')}`

  // 4) 调视觉大模型（OpenAI 兼容 /chat/completions）
  const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  try {
    const resp = await axios.post(
      endpoint,
      {
        model,
        temperature,
        max_tokens: 2400,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sysPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
              {
                type: 'text',
                text: `请识别这张${file.type.includes('pdf') ? '（可能是 PDF 图片转换）' : ''}发票。文件名：${fileName}。请严格按 System Prompt 里的 JSON 结构返回。`,
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: timeoutMs,
      }
    )

    const content: string | undefined = resp?.data?.choices?.[0]?.message?.content
    if (!content) {
      return c.json(
        {
          code: 'LLM_EMPTY_RESPONSE',
          message: `视觉大模型返回空内容 (HTTP ${resp.status})。请检查模型名称是否支持视觉输入。`,
        },
        502
      )
    }

    const parsed = extractJson<VisionLlmInvoiceResult>(content) || {}

    // 5) 规范化 & 兜底（与前端 normalizeOcrResult 保持一致的输出字段）
    const catFallback = fallbackCategory(parsed.category, fileName)
    const category = parsed.category && catFallback.category === parsed.category
      ? parsed.category
      : catFallback.category
    let description = parsed.description?.trim()
    if (!description) description = catFallback.description
    if (!/[\u4e00-\u9fa5]/.test(description)) description = catFallback.description

    const amounts = fallbackAmount(parsed)
    const date = fallbackDate(parsed.date, fileName)
    const invoiceNo = fallbackInvoiceNo(parsed.invoiceNo, date, fileName)

    const result: BackendProxyOcrResult = {
      invoiceNo,
      date,
      category,
      description,
      amount: amounts.amount,
      taxAmount: amounts.taxAmount,
      totalAmount: amounts.totalAmount > 0 ? amounts.totalAmount : amounts.amount,
      buyerName: parsed.buyerName || undefined,
      buyerTaxNo: parsed.buyerTaxNo || undefined,
      sellerName: parsed.sellerName || undefined,
      sellerTaxNo: parsed.sellerTaxNo || undefined,
      rawText: parsed.rawText || undefined,
      provider: 'vision_llm (backend_proxy)',
      latencyMs: Date.now() - startedAt,
      fileName,
    }

    return c.json({ code: 'SUCCESS', data: result })
  } catch (err: any) {
    const status = err?.response?.status || 502
    const upstreamMsg: string =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      '未知错误'
    return c.json(
      {
        code: 'LLM_CALL_FAILED',
        message: `调用视觉大模型失败 (${status}): ${upstreamMsg}`,
        details:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                baseUrl,
                model,
                upstreamStatus: status,
                upstreamMsg,
                latencyMs: Date.now() - startedAt,
              },
      },
      status >= 400 && status < 600 ? status : 502
    )
  }
})

export const ocrRoutes = ocr
