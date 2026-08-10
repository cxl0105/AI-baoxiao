/**
 * OCR Provider 抽象层：支持多种 OCR 后端，统一把结果归一化为内部结构。
 *
 * 目前实现：
 *   1) vision_llm - 「兼容 OpenAI Chat Completions 协议」的视觉大模型（推荐用于高精度识别）
 *        - 智谱 GLM-4V: https://open.bigmodel.cn/api/paas/v4
 *        - 阿里 Qwen-VL: https://dashscope.aliyuncs.com/compatible-mode/v1
 *        - OpenAI GPT-4o: https://api.openai.com/v1
 *   2) mock           - 本地正则+文件名推断（兜底/演示）
 *
 * 为未来扩展：
 *   3) aliyun_invoice  - 阿里云增值税发票识别（专用 OCR）
 *   4) tencent_invoice - 腾讯云发票识别（专用 OCR）
 */

import axios from 'axios'
import type { ExpenseCategory, OcrInvoice } from './api'
import type { OcrProviderConfig } from './settings'
import { parseAmount, parseCategory, parseDate, parseInvoiceNo, ocrProxyRecognize } from './api'

// --- 视觉大模型期望的结构化 JSON 输出（供 prompt 里说明 + 结果解析） ---
export interface VisionLlmInvoiceResult {
  invoiceNo?: string
  /** 开票日期，优先 YYYY-MM-DD */
  date?: string
  /** 不含税金额（元） */
  amount?: number
  /** 税额（元） */
  taxAmount?: number
  /** 价税合计（最常用，用来覆盖 amount 空） */
  totalAmount?: number
  /** 8 类之一；模型看不懂时返回 other */
  category?: ExpenseCategory
  description?: string
  /** 购买方（报销方）公司名 */
  buyerName?: string
  /** 购买方纳税人识别号 */
  buyerTaxNo?: string
  /** 销售方/开票方名称 */
  sellerName?: string
  sellerTaxNo?: string
  /** 发票全文（可选） */
  rawText?: string
}

export const DEFAULT_OCR_SYSTEM_PROMPT = `你是专业的发票/小票/行程单识别助手。请按如下要求精确识别图像中的内容：
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

// --- 内部工具：File → base64 data url（前端环境内） ---
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// --- 从 LLM 文本响应里把 JSON 抠出来（兼容代码块包裹 / 前导文字） ---
function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null
  const s = text.trim()
  // 先尝试整段解析
  try {
    return JSON.parse(s) as T
  } catch {
    // 忽略
  }
  // 取 ```json ... ``` 或 ``` ... ``` 包裹
  let m = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (m) {
    try {
      return JSON.parse(m[1].trim()) as T
    } catch {
      // ignore
    }
  }
  // 兜底：找第一个 { 到最后一个 }
  const left = s.indexOf('{')
  const right = s.lastIndexOf('}')
  if (left >= 0 && right > left) {
    try {
      return JSON.parse(s.slice(left, right + 1)) as T
    } catch {
      return null
    }
  }
  return null
}

// --- 归一化：把 Vision LLM 输出 → OcrInvoice（现有结构） + 可选扩展字段 ---
export interface NormalizedOcrResult extends OcrInvoice {
  taxAmount?: number
  totalAmount?: number
  buyerName?: string
  buyerTaxNo?: string
  sellerName?: string
  sellerTaxNo?: string
  rawText?: string
}

/**
 * 字段归一化：把 VisionLlmInvoiceResult 映射到 OcrInvoice + 扩展。
 * 如果 LLM 某些字段为空，就用已有的 smartParse(文件名+上下文) 再次兜底。
 */
export function normalizeOcrResult(
  raw: Partial<VisionLlmInvoiceResult> | null,
  file: File,
  fallback?: Partial<NormalizedOcrResult>
): NormalizedOcrResult {
  const name = file.name
  const joined = `${name} ${raw?.rawText || ''} ${raw?.description || ''} ${raw?.sellerName || ''}`

  // 分类
  let category: ExpenseCategory = (raw?.category as ExpenseCategory) || 'other'
  let description = raw?.description || ''
  if (
    !raw?.category ||
    !['travel', 'meal', 'office', 'communication', 'transport', 'entertainment', 'training', 'other'].includes(
      raw.category
    )
  ) {
    const byKw = parseCategory(joined, name)
    category = byKw.category
    description = description || byKw.description
  }
  if (!description) {
    description = parseCategory(joined, name).description
  }

  // 金额：优先 totalAmount → amount → parseAmount 兜底
  let amount = 0
  const total = typeof raw?.totalAmount === 'number' && isFinite(raw.totalAmount) ? raw.totalAmount : null
  const amt = typeof raw?.amount === 'number' && isFinite(raw.amount) ? raw.amount : null
  if (total && total > 0) amount = total
  else if (amt && amt > 0) amount = amt
  else {
    const parsed = parseAmount(joined)
    amount = parsed && parsed > 0 ? parsed : 0
  }

  // 日期
  let date = raw?.date || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = parseDate(joined, '')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = new Date().toISOString().slice(0, 10)
  }

  // 发票号
  let invoiceNo = raw?.invoiceNo || ''
  if (!invoiceNo || invoiceNo.length < 4) {
    invoiceNo = parseInvoiceNo(joined, date)
  }

  const tax =
    typeof raw?.taxAmount === 'number' && isFinite(raw.taxAmount) && raw.taxAmount >= 0 ? raw.taxAmount : 0

  return {
    id: '',
    fileName: name,
    thumbnailUrl: file.type.startsWith('image/') ? undefined : undefined,
    invoiceNo,
    category,
    amount: +amount.toFixed(2),
    date,
    description,
    status: 'success',
    taxAmount: +tax.toFixed(2),
    totalAmount: total ? +total.toFixed(2) : +amount.toFixed(2),
    buyerName: raw?.buyerName || fallback?.buyerName,
    buyerTaxNo: raw?.buyerTaxNo || fallback?.buyerTaxNo,
    sellerName: raw?.sellerName || fallback?.sellerName,
    sellerTaxNo: raw?.sellerTaxNo || fallback?.sellerTaxNo,
    rawText: raw?.rawText || fallback?.rawText,
  }
}

// --- Provider 一：Vision LLM 视觉大模型（OpenAI 兼容协议） ---
export async function runVisionLlmOcr(
  config: OcrProviderConfig,
  file: File
): Promise<NormalizedOcrResult> {
  if (!config.apiKey) throw new Error('未配置 API Key，请在「系统设置 → OCR 大模型」里填写')
  if (!config.model) throw new Error('未配置模型名称')
  if (!config.baseUrl) throw new Error('未配置 Base URL')

  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`
  const dataUrl = await fileToDataUrl(file)

  const sysPrompt = (config.systemPrompt || '').trim() || DEFAULT_OCR_SYSTEM_PROMPT

  const body = {
    model: config.model,
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.1,
    max_tokens: 2400,
    response_format: { type: 'json_object' as const },
    messages: [
      { role: 'system', content: sysPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'high' as const },
          },
          {
            type: 'text',
            text: `请识别这张${file.type.includes('pdf') ? '（可能是 PDF 图片转换）' : ''}发票。文件名：${file.name}。请严格按 System Prompt 里的 JSON 结构返回。`,
          },
        ],
      },
    ],
  }

  const resp = await axios.post(endpoint, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    timeout: config.timeoutMs || 60_000,
  })

  const content: string | undefined = resp?.data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error(`视觉大模型返回空内容 (HTTP ${resp.status})`)
  }
  const parsed = extractJson<VisionLlmInvoiceResult>(content)
  return normalizeOcrResult(parsed, file)
}

// --- Provider 二：后端代理 OCR（/api/v1/ocr/recognize）——推荐方案，API Key 只保存在服务器 ---
export async function runBackendProxyOcr(
  _config: OcrProviderConfig,
  file: File
): Promise<NormalizedOcrResult> {
  // 调后端 /api/v1/ocr/recognize，前端只传文件
  const fromBackend = await ocrProxyRecognize(file)
  // 再做一次前端 normalize，确保字段完全符合 OcrInvoice + 扩展的结构，并在后端有漏字段时兜底
  return normalizeOcrResult(
    fromBackend as unknown as Partial<VisionLlmInvoiceResult>,
    file,
    fromBackend
  )
}

// --- Provider 调度入口：根据 settings 决定走真实 OCR，还是直接抛错让调用方走 Mock ---
export async function runRealOcrIfEnabled(
  config: OcrProviderConfig,
  file: File
): Promise<NormalizedOcrResult | null> {
  if (!config?.enabled) return null
  // callMode=proxy 优先：无论 provider 选的是 vision_llm 还是专用 OCR，只要 proxy 就统一走后端代理
  if (config.callMode === 'proxy') {
    return await runBackendProxyOcr(config, file)
  }
  switch (config.provider) {
    case 'vision_llm':
      return await runVisionLlmOcr(config, file)
    case 'aliyun_invoice':
    case 'tencent_invoice':
      // 预留：后续扩展阿里云发票 / 腾讯云发票专用接口；目前暂时抛错让调用方降级到 mock
      throw new Error(`暂未实现专用 OCR 提供商：${config.provider}，请切到「通用视觉大模型」或联系开发`)
    case 'mock':
    default:
      return null
  }
}
