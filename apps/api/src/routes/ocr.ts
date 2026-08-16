import { Hono } from 'hono'
import axios from 'axios'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ocr = new Hono()

function getCfg() {
  return {
    url: (process.env.MEDIAKIT_OCR_URL || '').trim() || 'https://mediakit.cn-beijing.volces.com/api/v1/tools-sync/image-ocr',
    key: (process.env.MEDIAKIT_API_KEY || '').trim(),
    publicBase: (process.env.PUBLIC_BASE_URL || 'http://aibaoxiao.top').trim().replace(/\/+$/, ''),
    uploadDir: (process.env.UPLOAD_DIR || '/var/www/uploads').trim(),
  }
}

const CATEGORY_KEYWORDS: Array<{ cat: string; keywords: string[] }> = [
  { cat: 'travel', keywords: ['住宿', '酒店', 'hotel', '旅馆', '宾馆', '民宿', '客栈', '房费', '住宿费'] },
  { cat: 'transport', keywords: ['交通', '出租', '的士', '滴滴', '打车', 'taxi', '地铁', '公交', '出行', '加油', '停车', '过路费', '高速', 'ETC', '网约车', '高铁', '动车', '火车', '铁路', '机票', '航空', '航班', 'flight', 'airline', '汽车票', '船票', '单车', 'uber', 'didi'] },
  { cat: 'meal', keywords: ['餐饮', '餐费', '餐', '饭', '美食', 'restaurant', '食堂', '外卖', '餐厅', '饭店', '烧烤', '火锅', '咖啡', '奶茶', '饮品', '甜品', '早餐', '午餐', '晚餐', '海底捞', '星巴克', '肯德基', '麦当劳', 'kfc', 'mcdonald', '瑞幸', 'luckin'] },
  { cat: 'office', keywords: ['办公', '文具', '耗材', '打印', '复印', 'office', '采购', '键盘', '鼠标', '电脑', '显示器', '打印纸', '笔记本', '记事本', '签字笔', '墨水', '硒鼓', '文件夹', '订书机', '便利贴', '墨盒'] },
  { cat: 'communication', keywords: ['通讯', '话费', '电话', '手机费', '流量', '电信', '移动', '联通', '宽带', '套餐', '5G', '4G', 'SIM', '充值', '账单', '固话'] },
  { cat: 'entertainment', keywords: ['招待', '宴请', '接待', '客户', '礼品', '送礼', '茶歇', 'KTV', '会务', '会所', '洗浴', '足疗', '高尔夫', '球票', '电影票', '观影', '门票', '演出', '纪念品', '伴手礼'] },
  { cat: 'training', keywords: ['培训', '讲座', '课程', '研修', '训练营', 'workshop', '会议', '峰会', '论坛', '展会', '参展', 'seminar', 'conference', '学费', '讲师', '教练', '认证', '考试', '报名费'] },
]

const DESC_MAP: Record<string, string> = {
  travel: '差旅住宿发票', meal: '餐饮发票', transport: '交通出行发票',
  office: '办公用品采购发票', communication: '通讯发票',
  entertainment: '客户招待发票', training: '培训/会议报销发票', other: '其他费用发票',
}

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
    if (hasDateHint && /^\d+$/.test(raw) && num >= 1970 && num <= 2099) continue
    out.push(+num.toFixed(2))
  }
  return out
}

function parseAmount(text: string): number | null {
  if (!text) return null
  const strongPatterns = [
    /价税合计[^\d]{0,12}?([\d,]+\.?\d{0,2})/,
    /(?:￥|¥|RMB|CNY)\s*([\d,]+\.?\d{0,2})/i,
    /(?:合计金额|总金额|应付金额|实付|支付金额|订单金额|结算金额|含税金额|总计|小写|合计|房价|总价)[：:\s]*([\d,]+\.?\d{0,2})/i,
    /(?:金额|含税|税价|小计|单项金额|实付金额)[：:\s]*([\d,]+\.?\d{0,2})/i,
    /([\d,]+\.\d{1,2})\s*(?:元|圆|RMB|CNY)/i,
  ]
  for (const re of strongPatterns) {
    const m = text.match(re)
    if (m) {
      const raw = m[1]
      const num = parseFloat(raw.replace(/,/g, ''))
      if (isFinite(num) && num > 0 && num < 1e8) {
        const hasDateHint = /(20\d{2})[-_./年]/.test(text) || /\d{1,2}[月\-_./]\d{1,2}/.test(text)
        if (hasDateHint && /^\d+$/.test(raw) && num >= 1970 && num <= 2099) continue
        return +num.toFixed(2)
      }
    }
  }
  const candidates = extractAllAmounts(text)
  if (candidates.length) {
    candidates.sort((a, b) => b - a)
    const plausible = candidates.filter((x) => x >= 0.5)
    if (plausible.length) return plausible[0]
    return candidates[0]
  }
  return null
}

function parseDate(text: string): string {
  if (!text) return ''
  let m = text.match(/(20\d{2})[-_./年](\d{1,2})[-_./月](\d{1,2})/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
  }
  m = text.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:$|[^\d])/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[1]}-${m[2]}-${m[3]}`
  }
  m = text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
  }
  return ''
}

function parseInvoiceNo(text: string): string {
  if (!text) return ''
  const candidates = [
    /发票(?:号码|代码|编号|号)[：:\s]*([A-Za-z0-9-]{6,32})/,
    /(?:No\.?|Number|№|#|票据号)\s*([A-Za-z0-9-]{6,32})/i,
    /((?:INV|FP|INVOICE)[A-Z]*[-\s]*[\dA-Z-]{6,24})/i,
    /\b(\d{8,24})\b/,
  ]
  for (const re of candidates) {
    const m = text.match(re)
    if (m) return m[1].toUpperCase().replace(/\s/g, '')
  }
  return ''
}

// 从文本中提取「标签：值」字段
function extractField(text: string, label: string): string {
  const m = text.match(new RegExp(label + '[：:]\\s*([^\\n，,]{2,80})'))
  return m ? m[1].trim() : ''
}

function parseCategory(text: string): { category: string; description: string } {
  const hay = (text || '').toLowerCase()
  const sorted = [...CATEGORY_KEYWORDS].sort(
    (a, b) => b.keywords.reduce((s, k) => s + k.length, 0) - a.keywords.reduce((s, k) => s + k.length, 0)
  )
  let category = 'other'
  outer: for (const { cat, keywords } of sorted) {
    for (const kw of keywords) {
      if (hay.includes(kw.toLowerCase())) { category = cat; break outer }
    }
  }
  return { category, description: DESC_MAP[category] || '其他费用发票' }
}

interface NormalizedOcrResult {
  invoiceNo: string
  date: string
  amount: number
  taxAmount: number
  totalAmount: number
  category: string
  description: string
  buyerName?: string
  buyerTaxNo?: string
  sellerName?: string
  sellerTaxNo?: string
  rawText?: string
  provider: string
  latencyMs: number
  fileName?: string
}

ocr.get('/proxy-config', (c) => {
  const { key } = getCfg()
  const enabled = !!key
  return c.json({
    code: 'SUCCESS',
    data: {
      enabled,
      provider: 'mediakit_ocr',
      baseUrlConfigured: true,
      apiKeyConfigured: enabled,
      modelConfigured: enabled,
      model: 'mediakit-image-ocr',
      callMode: 'backend_proxy',
      hint: enabled ? '后端 MediaKit OCR 已就绪，前端保存即可使用。' : '后端 MediaKit OCR 尚未配置。请在服务器设置环境变量 MEDIAKIT_API_KEY。',
    },
  })
})

ocr.post('/recognize', async (c) => {
  const startedAt = Date.now()
  const { url, key, publicBase, uploadDir } = getCfg()

  if (!key) {
    return c.json({ code: 'PROXY_NOT_CONFIGURED', message: '服务器未配置 MediaKit OCR（缺少 MEDIAKIT_API_KEY）。' }, 503)
  }

  let file: File | undefined
  let fileName = 'upload'
  try {
    const formData = await c.req.formData()
    const entry = formData.get('file')
    if (!entry || typeof (entry as any).arrayBuffer !== 'function') {
      return c.json({ code: 'VALIDATION_ERROR', message: '缺少文件字段 file（multipart/form-data 上传）。' }, 400)
    }
    file = entry as File
    fileName = file.name || fileName
    if (!file.type.startsWith('image/') && !file.type.includes('pdf')) {
      return c.json({ code: 'UNSUPPORTED_FILE_TYPE', message: `不支持的文件类型：${file.type}。请上传图片或 PDF。` }, 400)
    }
  } catch (err: any) {
    return c.json({ code: 'BAD_REQUEST', message: '解析上传文件失败：' + (err?.message || String(err)) }, 400)
  }

  const ext = (file.name || '').split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'png'
  const savedName = `${randomUUID()}.${ext}`
  const savedPath = resolve(uploadDir, savedName)
  const imageUrl = `${publicBase}/uploads/${savedName}`

  try {
    if (!existsSync(uploadDir)) await mkdir(uploadDir, { recursive: true })
    const buf = Buffer.from(await file.arrayBuffer())
    await writeFile(savedPath, buf)

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }

    // 标准版 OCR（快），一次性拿到全文
    const resp = await axios.post(url, { image_url: imageUrl, tool_version: 'standard' }, { headers, timeout: 40000 })
    if (!resp?.data?.success) {
      const emsg = resp?.data?.error?.message || 'OCR 调用失败'
      return c.json({ code: 'LLM_CALL_FAILED', message: `MediaKit OCR 失败：${emsg}` }, 502)
    }
    const blocks: Array<{ content?: string }> = resp.data.result?.ocr_result || []
    const rawText = blocks.map((b) => b.content || '').join('\n').trim()

    // 解析金额 / 日期 / 发票号 / 类别
    const totalAmount = parseAmount(rawText) || 0
    const date = parseDate(rawText)
    const invoiceNo = parseInvoiceNo(rawText)
    const { category, description: catDesc } = parseCategory(rawText)

    // 税额：单独匹配
    const taxM = rawText.match(/税额[：:\s]*([\d,]+\.?\d{0,2})/)
    const taxAmount = taxM ? parseFloat(taxM[1].replace(/,/g, '')) || 0 : 0
    const amount = totalAmount > 0 ? Math.max(0, +(totalAmount - taxAmount).toFixed(2)) : 0

    // 购买方 / 销售方 / 税号 / 项目名称
    let buyerName = extractField(rawText, '购买方名称') || extractField(rawText, '购方名称')
    if (!buyerName) {
      const bm = rawText.match(/购买[^\n：:]{0,2}名称[：:]\s*([^\n，,]{2,80})/)
      if (bm) buyerName = bm[1].trim()
    }
    let sellerName = extractField(rawText, '销售方名称') || extractField(rawText, '销方名称')
    if (!sellerName) {
      const sm = rawText.match(/销售[^\n：:]{0,2}名称[：:]\s*([^\n，,]{2,80})/)
      if (sm) sellerName = sm[1].trim()
    }
    const buyerTaxNo = extractField(rawText, '购买方纳税人识别号') || extractField(rawText, '购方纳税人识别号') || extractField(rawText, '统一社会信用代码')
    const sellerTaxNo = extractField(rawText, '销售方纳税人识别号') || extractField(rawText, '销方纳税人识别号')
    // 项目名称：优先 *xxx* 形式，其次「项目名称：xxx」
    const starM = rawText.match(/\*[^*\n]{1,60}\*/)
    const projectName = starM ? starM[0].replace(/\*/g, '') : (extractField(rawText, '项目名称') || extractField(rawText, '货物或应税劳务、服务名称'))

    const result: NormalizedOcrResult = {
      invoiceNo,
      date,
      amount,
      taxAmount,
      totalAmount,
      category,
      description: projectName ? projectName.replace(/\*/g, '') : catDesc,
      buyerName,
      buyerTaxNo,
      sellerName,
      sellerTaxNo,
      rawText: rawText.slice(0, 1200),
      provider: 'mediakit_ocr',
      latencyMs: Date.now() - startedAt,
      fileName,
    }

    return c.json({ code: 'SUCCESS', data: result })
  } catch (err: any) {
    const status = err?.response?.status || 502
    const upstreamMsg = err?.response?.data?.error?.message || err?.message || '未知错误'
    return c.json({ code: 'LLM_CALL_FAILED', message: `MediaKit OCR 调用失败 (${status}): ${upstreamMsg}` }, status >= 400 && status < 600 ? status : 502)
  } finally {
    try { await unlink(savedPath) } catch { /* ignore */ }
  }
})

export const ocrRoutes = ocr
