/**
 * OCR 解析核心函数单元测试（从 api.ts 复制出纯函数部分，不依赖 axios/DOM）
 * 运行：node apps/web/scripts/test-ocr.mjs
 */

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------- 从 api.ts 复制的纯函数 ----------
const CATEGORY_KEYWORDS = [
  { cat: 'travel', keywords: ['酒店','住宿','宾馆','民宿','客栈','机票','飞机','航班','航空','差旅','出差','房费','入住','退房','booking','hotel','airbnb','motel','booking','resort'] },
  { cat: 'meal', keywords: ['餐饮','餐厅','饭店','餐费','美食','酒家','酒楼','餐馆','料理','火锅','烧烤','自助餐','宴会','餐饮服务','食堂','餐','food','restaurant','海底捞','星巴克','肯德基','麦当劳','kfc','mcdonald','瑞幸','luckin'] },
  { cat: 'transport', keywords: ['出租','的士','滴滴','打车','taxi','地铁','公交','出行','加油','停车','过路费','高速','ETC','网约车','出行','高铁票','火车票','机票','航班','汽车票','船票','单车','共享单车','ofo','摩拜','uber','didi'] },
  { cat: 'office', keywords: ['办公','文具','耗材','打印','复印','office','采购','键盘','鼠标','电脑','显示器','打印纸','笔记本','记事本','签字笔','墨水','硒鼓','文件夹','订书机','便利贴','墨盒','货架','桌椅','工位'] },
  { cat: 'communication', keywords: ['通讯','话费','电话','手机费','流量','电信','移动','联通','宽带','套餐','5G','4G','SIM','充值','账单','固话'] },
  { cat: 'entertainment', keywords: ['招待','宴请','接待','客户','礼品','送礼','茶歇','KTV','会务','会务费','会所','洗浴','足疗','高尔夫','球票','电影票','观影','门票','演出','纪念品','伴手礼'] },
  { cat: 'training', keywords: ['培训','讲座','课程','研修','培训课','培训中心','训练营','workshop','会议','峰会','论坛','展会','参展','seminar','conference','学费','讲师','教练','认证','考试','报名费'] },
]
const DESC_MAP = {
  travel: '差旅住宿发票', meal: '餐饮发票', transport: '交通出行发票', office: '办公用品采购发票',
  entertainment: '客户招待发票', communication: '通讯发票', training: '培训/会议报销发票', other: '其他费用发票',
}

function extractAllAmounts(text) {
  if (!text) return []
  const re = /(?:￥|¥|RMB|CNY|\$|美金|美元|欧元|港币)?\s*([\d]{1,3}(?:,\d{3})+\.?\d{0,2}|\d+\.\d{1,2}|\d+)(?=\s*(?:元|圆|RMB|CNY)|\b)/g
  const hasDateHint = /(20\d{2})[-_./年]/.test(text) || /\d{1,2}[月\-_./]\d{1,2}/.test(text) || text.includes('季度')
  const out = []
  let m
  while ((m = re.exec(text)) != null) {
    const raw = m[1]
    const num = parseFloat(raw.replace(/,/g, ''))
    if (!isFinite(num) || num <= 0 || num >= 1e8) continue
    if (hasDateHint && /^\d+$/.test(raw) && num >= 1970 && num <= 2099) continue
    out.push(+num.toFixed(2))
  }
  return out
}

function parseAmount(text) {
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
    if (candidates.length) return candidates[0]
  }
  return null
}

function parseDate(text, fallback) {
  if (!text && fallback) return fallback
  if (!text) return new Date().toISOString().slice(0, 10)

  let m = text.match(/(20\d{2})\s*[Qq]([1-4])(?!\d)/)
  if (!m) m = text.match(/(20\d{2})\s*(?:第|第\s*)?\s*([1-4一二三四])\s*季度?/)
  if (m) {
    const quarterMap = { '1': 1, '2': 2, '3': 3, '4': 4, '一': 1, '二': 2, '三': 3, '四': 4 }
    const q = quarterMap[m[2]]
    if (q) {
      const qStart = [1, 4, 7, 10][q - 1]
      return `${m[1]}-${String(qStart).padStart(2, '0')}-01`
    }
  }
  m = text.match(/(?:^|[^\d一二三四五六七八九十])(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)[份]?\s*(\d{0,2})\s*日?/)
  if (m) {
    const monthMap = { '一月':1,'二月':2,'三月':3,'四月':4,'五月':5,'六月':6,'七月':7,'八月':8,'九月':9,'十月':10,'十一月':11,'十二月':12 }
    const mo = monthMap[m[1]]
    const yearMatch = text.match(/(20\d{2})/)
    const y = yearMatch ? +yearMatch[1] : new Date().getFullYear()
    let d = m[2] ? +m[2] : 15
    if (!d) d = 15
    if (mo && d >= 1 && d <= 31) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  const normalized = text
    .replace(/年|月|\./g, '-')
    .replace(/日/g, '')
    .replace(/_{1,}/g, '-')
    .replace(/\/{1,}/g, '-')
    .replace(/-{2,}/g, '-')

  m = normalized.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[1]}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    }
  }

  m = text.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:$|[^\d])/)
  if (m) {
    const mo = +m[2], da = +m[3]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      return `${m[1]}-${m[2]}-${m[3]}`
    }
  }

  m = text.match(/(\d{1,2})月(\d{1,2})日?/) || text.match(/(?:^|[^\d])(\d{1,2})[\/\-_](\d{1,2})(?:$|[^\d])/)
  if (m) {
    const mo = +m[1], da = +m[2]
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
      let y = new Date().getFullYear()
      const today = new Date()
      if (today.getMonth() + 1 < mo) y = y - 1
      else if (today.getMonth() + 1 === mo && today.getDate() < da) y = y - 1
      return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    }
  }
  return fallback || new Date().toISOString().slice(0, 10)
}

function parseInvoiceNo(text, fallbackYear) {
  if (text) {
    const candidates = [
      /发票(?:号码|代码|编号|号)[：:\s]*([A-Za-z0-9-]{6,32})/,
      /(?:No\.?|Number|№|#|票据号)\s*([A-Za-z0-9-]{6,32})/i,
      // 修复：INV/FP/INVOICE 前缀要整体保留（capture group 包整个）
      /((?:INV|FP|INVOICE)[A-Z]*[-\s]*[\dA-Z-]{6,24})/i,
      /\b([0-9A-F]{8,20}-[0-9A-F-]{0,12})\b/i,
      /\b(\d{8,24})\b/,
    ]
    for (const re of candidates) {
      const m = text.match(re)
      if (m) return m[1].toUpperCase().replace(/\s/g, '')
    }
  }
  const hash = Math.abs(
    (fallbackYear || '20240101').split('').reduce((a, c) => a * 131 + c.charCodeAt(0), 0)
  )
  return 'INV' + (fallbackYear || '20240101').replace(/-/g, '') + String(1000 + (hash % 8999))
}

function extractVendor(hay, hitKw, cat) {
  const brands = ['海底捞','星巴克','瑞幸','luckin','肯德基','KFC','麦当劳','mcdonald','滴滴','didi','uber','优步','高德','美团','饿了么','7天','如家','汉庭','全季','桔子水晶','亚朵','希尔顿','hilton','万豪','marriott','喜来登','洲际','华为','京东','淘宝','天猫','苏宁','拼多多','唯品会','当当','中国移动','中国电信','中国联通','顺丰','圆通','中通','申通','韵达','京东物流','中石化','中石油','壳牌']
  for (const b of brands) {
    if (hay.toLowerCase().includes(b.toLowerCase())) return b
  }
  if (hitKw) {
    const idx = hay.indexOf(hitKw)
    if (idx > 0) {
      const before = hay.slice(Math.max(0, idx - 18), idx)
      const m = before.match(/[\u4e00-\u9fa5A-Za-z0-9·]{2,}$/)
      if (m) return m[0].replace(/^[\s_\-]+/, '')
    }
  }
  let name = hay
    .replace(/\.(png|jpe?g|webp|gif|bmp|pdf)$/i, '')
    .replace(/(￥|¥)\s*[\d.,]+/g, '')
    .replace(/\d{4}[-_./年]\d{1,2}[-_./月]\d{0,2}日?/g, '')
    .replace(/[\d,./_-]+/g, ' ')
    .replace(/发票|单据|小票|电子|扫描件|副本|照片|IMG|img|DCIM|截图|photo|副本/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  const segments = name.split(/[\s_\-，,、()（）【】\[\]]/).filter((s) => s.length >= 2)
  if (segments.length) {
    segments.sort((a, b) => b.length - a.length)
    return segments[0].slice(0, 14)
  }
  return ''
}

function parseCategory(text, fileName) {
  const rawHay = (text + ' ' + fileName + ' ' + fileName.replace(/\.[^.]+$/, ''))
  const hay = rawHay.toLowerCase()
  const sorted = [...CATEGORY_KEYWORDS].sort(
    (a, b) => b.keywords.reduce((s, k) => s + k.length, 0) - a.keywords.reduce((s, k) => s + k.length, 0)
  )
  let category = 'other'
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
  let vendor = extractVendor(rawHay, hitKeyword, category)
  const base = DESC_MAP[category]
  return { category, description: vendor ? `${base}（${vendor}）` : base }
}

function smartParse(fileName) {
  const rawName = fileName
  const stem = rawName.replace(/\.[^.]+$/, '')
  const tokens = [
    stem, rawName,
    ...stem.split(/[\s_\-，,、()（）【】\[\]|·~+]{1,}/).filter(Boolean),
    stem.replace(/[_\-，,、()（）【】\[\]|·~+]/g, ' '),
  ]
  const joinedText = tokens.join('   ')
  const { category, description } = parseCategory(joinedText, rawName)
  let amount = parseAmount(joinedText)
  const dateCandidates = tokens
    .map((t) => parseDate(t, ''))
    .filter((x) => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x))
    .sort()
  const date = dateCandidates[0] || parseDate(stem)
  if (amount == null || !isFinite(amount) || amount <= 0) {
    const fallbackMap = { travel: 588, meal: 168, transport: 68, office: 235, communication: 128, entertainment: 888, training: 1888, other: 188 }
    amount = fallbackMap[category]
  }
  const invoiceNo = parseInvoiceNo(joinedText, date)
  return { amount, date, category, description, invoiceNo }
}

// ---------- 测试用例 ----------
const CASES = [
  {
    name: '餐饮 ¥128 中间位置月日',
    fileName: '餐饮_¥128_6月15日.jpg',
    expect: { amount: 128.0, dateLike: '06-15', category: 'meal', descriptionLike: ['餐饮','餐饮发票'], invLike: null },
  },
  {
    name: '高铁票 车次+金额+标准日期',
    fileName: '高铁票_G1234_¥553_2024-06-22.jpg',
    expect: { amount: 553.0, dateLike: '2024-06-22', category: 'transport', descriptionLike: ['高铁票','滴滴','交通出行'], invLike: 'INV20240622' },
  },
  {
    name: '酒店住宿 千分位金额 中文月日',
    fileName: '酒店住宿发票_¥1,288.50_2024年04月09日.pdf',
    expect: { amount: 1288.50, dateLike: '2024-04-09', category: 'travel', descriptionLike: ['酒店','住宿','差旅住宿'], invLike: null },
  },
  {
    name: '办公用品 Q2季度日期（关键：2024 不误做金额）',
    fileName: '办公用品采购_¥954.30_2024Q2.pdf',
    expect: { amount: 954.30, dateLike: '-04-01', category: 'office', descriptionLike: ['办公','采购'], invLike: null, amountNOT: [2024, 2024.0] },
  },
  {
    name: '滴滴出行 紧凑 8 位日期',
    fileName: '滴滴出行行程单_¥36.50_20240518.png',
    expect: { amount: 36.50, dateLike: '2024-05-18', category: 'transport', descriptionLike: ['滴滴','交通出行'], invLike: null },
  },
  {
    name: '增值税发票 明确 INV 号 + 千分位金额',
    fileName: '增值税普通发票_¥1,886.00_INV240056_2024-05-22.jpg',
    expect: { amount: 1886.00, dateLike: '2024-05-22', category: 'other', descriptionLike: ['增值税','普通发票','其他'], invLike: 'INV240056' },
  },
  {
    name: '¥ 金额开头 + 月日不在开头',
    fileName: '¥128_6月15日_团建餐饮.jpg',
    expect: { amount: 128.0, dateLike: '06-15', category: 'meal', descriptionLike: ['餐饮','团建'], invLike: null },
  },
  {
    name: '通讯费 3 月份 + ¥99',
    fileName: '通讯费-2024年3月_¥99.00_2024-03-31.png',
    expect: { amount: 99.00, dateLike: '2024-03-31', category: 'communication', descriptionLike: ['通讯'], invLike: null },
  },
]

const CAT_LABEL = { travel: '差旅住宿', meal: '餐饮', transport: '交通出行', office: '办公用品', entertainment: '客户招待', communication: '通讯', training: '培训/会议', other: '其他' }

function run() {
  const rows = []
  let pass = 0, fail = 0
  console.log('\n===== OCR 单元测试：8 个样本 =====')
  for (const c of CASES) {
    const got = smartParse(c.fileName)
    const checks = []
    // 金额
    const amtOk = got.amount === c.expect.amount
    checks.push({ k: '金额', ok: amtOk, expect: c.expect.amount, got: got.amount })
    if (!amtOk) console.log(`  ❌ [${c.name}] 金额：期望 ${c.expect.amount}，实际 ${got.amount}`)
    // 金额黑名单（如季度 2024 不能被当成金额）
    if (c.expect.amountNOT) {
      for (const bad of c.expect.amountNOT) {
        const notOk = got.amount !== bad
        checks.push({ k: `金额≠${bad}`, ok: notOk, expect: `≠${bad}`, got: got.amount })
        if (!notOk) console.log(`  ❌ [${c.name}] 金额错误等于 ${bad}（应为 ${c.expect.amount}）`)
      }
    }
    // 日期
    const dateOk = got.date.includes(c.expect.dateLike.replace(/^\d{4}-/, '').replace(/^(\d{2}-\d{2})$/, (mmdd) => mmdd)) || got.date.endsWith(c.expect.dateLike) || (got.date === c.expect.dateLike)
    const dateOkV2 = c.expect.dateLike.startsWith('-') ? got.date.endsWith(c.expect.dateLike) : (got.date === c.expect.dateLike || got.date.includes(c.expect.dateLike))
    checks.push({ k: '日期', ok: dateOkV2, expect: `*${c.expect.dateLike}`, got: got.date })
    if (!dateOkV2) console.log(`  ❌ [${c.name}] 日期：期望包含 ${c.expect.dateLike}，实际 ${got.date}`)
    // 类别
    const catOk = got.category === c.expect.category
    checks.push({ k: '类别', ok: catOk, expect: `${c.expect.category}(${CAT_LABEL[c.expect.category]})`, got: `${got.category}(${CAT_LABEL[got.category]})` })
    if (!catOk) console.log(`  ❌ [${c.name}] 类别：期望 ${CAT_LABEL[c.expect.category]}，实际 ${CAT_LABEL[got.category]}`)
    // 描述
    if (c.expect.descriptionLike) {
      const desOk = c.expect.descriptionLike.some((kw) => (got.description || '').includes(kw))
      checks.push({ k: '描述含关键词', ok: desOk, expect: c.expect.descriptionLike.join('/'), got: got.description })
      if (!desOk) console.log(`  ❌ [${c.name}] 描述：期望含 ${c.expect.descriptionLike.join('/')}，实际「${got.description}」`)
    }
    // 发票号
    if (c.expect.invLike) {
      const invOk = (got.invoiceNo || '').toUpperCase().includes(c.expect.invLike.toUpperCase())
      checks.push({ k: '发票号含线索', ok: invOk, expect: c.expect.invLike, got: got.invoiceNo })
      if (!invOk) console.log(`  ❌ [${c.name}] 发票号：期望含 ${c.expect.invLike}，实际 ${got.invoiceNo}`)
    }

    const ok = checks.every((x) => x.ok)
    if (ok) { pass++; console.log(`  ✅ [${c.name}] 金额 ¥${got.amount.toFixed(2)} · ${got.date} · ${CAT_LABEL[got.category]} · 发票号 ${got.invoiceNo} · ${got.description}`) } else fail++
    rows.push({
      name: c.name, file: c.fileName,
      amount: got.amount, date: got.date, category: CAT_LABEL[got.category], invoiceNo: got.invoiceNo, description: got.description,
      pass: ok,
    })
  }
  console.log(`\n===== 结果：${pass}/${CASES.length} 通过，${fail} 失败 =====`)

  // 输出 JSON 供下一步做对比表
  const out = {
    generatedAt: new Date().toISOString(),
    summary: { pass, fail, total: CASES.length },
    rows,
  }
  const outPath = resolve(process.cwd(), 'apps/web/scripts/test-ocr-result.json')
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
  console.log('JSON 报告写入：', outPath)
  process.exit(fail > 0 ? 1 : 0)
}

run()
