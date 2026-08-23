'use client'

/**
 * Concierge AI 智能助手核心逻辑
 *
 * 参考 Expensify Concierge 设计，提供：
 * 1. 费用类别智能推荐（基于关键词匹配）
 * 2. 填写进度提示（根据当前报销单状态给出下一步建议）
 * 3. 超标预警说明（解释为什么超标、如何处理）
 * 4. FAQ 知识库（常见问题答疑）
 * 5. 上下文感知（根据当前页面给出不同建议）
 */

import { create } from 'zustand'
import type { ExpenseCategoryKey } from './settings'

// ============ 类型定义 ============

/** 助手消息类型 */
export interface ConciergeMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  /** 消息附带快捷操作 */
  actions?: ConciergeAction[]
  /** 消息时间戳 */
  timestamp: string
}

/** 快捷操作 */
export interface ConciergeAction {
  label: string
  /** 操作类型 */
  type: 'fill' | 'navigate' | 'explain' | 'dismiss'
  /** 操作数据 */
  data?: Record<string, unknown>
}

/** 上下文信息 */
export interface ConciergeContext {
  /** 当前页面 */
  page: 'dashboard' | 'reimbursements' | 'spreadsheet' | 'invoices' | 'approvals' | 'analytics' | 'budgets' | 'settings' | 'login' | 'other'
  /** 用户角色 */
  role: string
  /** 报销单填写状态（仅 spreadsheet 页面） */
  formState?: {
    title?: string
    rowsCount?: number
    totalAmount?: number
    hasInvoice?: boolean
    hasAllocation?: boolean
    overStandard?: boolean
    overBudget?: boolean
    incompleteFields?: string[]
  }
}

/** 智能建议 */
export interface SmartSuggestion {
  id: string
  type: 'tip' | 'warning' | 'info' | 'shortcut'
  icon: string
  title: string
  detail: string
  action?: ConciergeAction
}

// ============ 费用类别智能推荐 ============

/** 关键词 → 费用类别映射 */
const CATEGORY_KEYWORDS: Array<{ category: ExpenseCategoryKey; keywords: string[]; confidence: number }> = [
  {
    category: 'transport',
    keywords: ['机票', '航班', '飞机', '高铁', '火车', '动车', '车票', '长途', '汽车票', '轮船', '船票', '地铁', '轨道交通', '机场大巴', '机场快线'],
    confidence: 0.95,
  },
  {
    category: 'taxi',
    keywords: ['打车', '出租车', '滴滴', '网约车', 'uber', '首汽', '曹操', '出行', '专车', '快车', '顺风车', '停车', '过路费', '过桥费', '通行费', '加油', '油费'],
    confidence: 0.9,
  },
  {
    category: 'hotel',
    keywords: ['酒店', '住宿', '宾馆', '旅馆', '民宿', '客栈', '套房', '入住', '退房', '房费', '住宿费', '如家', '汉庭', '全季', '希尔顿', '万豪', '洲际'],
    confidence: 0.95,
  },
  {
    category: 'meal',
    keywords: ['餐饮', '吃饭', '餐费', '用餐', '宴请', '聚餐', '团建', '外卖', '美团', '饿了么', '海底捞', '星巴克', '咖啡', '茶', '食堂', '工作餐', '午餐', '晚餐', '早餐'],
    confidence: 0.9,
  },
  {
    category: 'other',
    keywords: ['办公用品', '文具', '打印', '复印', '快递', '物流', '邮寄', '电话费', '通讯费', '会议', '培训', '教材', '资料', '礼品', '招待', '材料', '邮电', '宽带', '软件', '订阅'],
    confidence: 0.7,
  },
]

/** 根据描述文本推荐费用类别 */
export function recommendCategory(text: string): Array<{ category: ExpenseCategoryKey; confidence: number; reason: string }> {
  if (!text || !text.trim()) return []
  const lower = text.toLowerCase().trim()
  const results: Array<{ category: ExpenseCategoryKey; confidence: number; reason: string }> = []

  for (const rule of CATEGORY_KEYWORDS) {
    const matched = rule.keywords.filter((kw) => lower.includes(kw.toLowerCase()))
    if (matched.length > 0) {
      results.push({
        category: rule.category,
        confidence: rule.confidence * Math.min(1, 0.5 + matched.length * 0.3),
        reason: `匹配到关键词：${matched.slice(0, 3).join('、')}`,
      })
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence)
}

// ============ 填写进度提示 ============

/** 根据报销单填写状态生成建议 */
export function generateFormSuggestions(ctx: ConciergeContext): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = []
  const form = ctx.formState

  if (!form) return suggestions

  // 标题未填
  if (!form.title || !form.title.trim()) {
    suggestions.push({
      id: 'sug-title',
      type: 'tip',
      icon: 'edit',
      title: '请填写报销单标题',
      detail: '一个清晰的标题能帮助审批人快速了解报销内容，例如「8月北京出差费用报销」',
    })
  }

  // 无费用明细
  if (!form.rowsCount || form.rowsCount === 0) {
    suggestions.push({
      id: 'sug-rows',
      type: 'tip',
      icon: 'plus',
      title: '请添加费用明细',
      detail: '点击「添加费用行」录入每笔费用的日期、说明和金额。也可从发票池导入已识别的发票。',
    })
  }

  // 无发票
  if (!form.hasInvoice && (form.rowsCount || 0) > 0) {
    suggestions.push({
      id: 'sug-invoice',
      type: 'warning',
      icon: 'receipt',
      title: '建议关联发票',
      detail: '大多数费用需要附发票才能报销。可在发票池中上传发票图片，OCR 自动识别后一键导入。',
    })
  }

  // 超标
  if (form.overStandard) {
    suggestions.push({
      id: 'sug-overstandard',
      type: 'warning',
      icon: 'alert',
      title: '存在超标费用',
      detail: '部分费用超出公司标准，超标项将触发升级审批。建议在备注中说明超标原因（如旺季涨价、紧急出差等），可提高审批通过率。',
    })
  }

  // 超预算
  if (form.overBudget) {
    suggestions.push({
      id: 'sug-overbudget',
      type: 'warning',
      icon: 'alert',
      title: '部门预算不足',
      detail: '当前报销金额可能导致部门预算超支。建议与部门负责人确认后再提交，或调整费用归属部门/项目。',
    })
  }

  // 未启用分摊
  if (!form.hasAllocation && (form.totalAmount || 0) > 1000) {
    suggestions.push({
      id: 'sug-allocation',
      type: 'info',
      icon: 'split',
      title: '建议启用费用分摊',
      detail: '金额较大的报销单建议按部门或项目分摊费用，便于成本核算和预算追踪。',
    })
  }

  // 不完整字段
  if (form.incompleteFields && form.incompleteFields.length > 0) {
    suggestions.push({
      id: 'sug-incomplete',
      type: 'tip',
      icon: 'edit',
      title: '部分费用行信息不完整',
      detail: `以下字段建议补全：${form.incompleteFields.join('、')}。完整的信息能加快审批速度。`,
    })
  }

  // 一切就绪
  if (
    form.title &&
    (form.rowsCount || 0) > 0 &&
    form.hasInvoice &&
    !form.overStandard &&
    !form.overBudget &&
    (!form.incompleteFields || form.incompleteFields.length === 0)
  ) {
    suggestions.push({
      id: 'sug-ready',
      type: 'shortcut',
      icon: 'check',
      title: '报销单已就绪',
      detail: '所有必要信息已填写完整，可以提交审批了！点击「提交审批」按钮即可。',
    })
  }

  return suggestions
}

// ============ 页面级建议 ============

/** 根据当前页面生成建议 */
export function generatePageSuggestions(ctx: ConciergeContext): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = []

  switch (ctx.page) {
    case 'dashboard':
      suggestions.push({
        id: 'page-dashboard-1',
        type: 'info',
        icon: 'home',
        title: '欢迎回来',
        detail: '工作台展示了你的待办事项和费用概览。点击「新建报销单」开始填报。',
      })
      break
    case 'reimbursements':
      suggestions.push({
        id: 'page-reimb-1',
        type: 'shortcut',
        icon: 'plus',
        title: '新建报销单',
        detail: '点击「新建」按钮创建报销单，支持从发票池批量导入发票自动填充。',
      })
      break
    case 'spreadsheet':
      // spreadsheet 页面的建议由 generateFormSuggestions 处理
      break
    case 'invoices':
      suggestions.push({
        id: 'page-invoices-1',
        type: 'tip',
        icon: 'upload',
        title: '上传发票',
        detail: '上传发票图片后，系统会自动 OCR 识别并查重。也可点击「验真」对接税务总局验真。',
      })
      break
    case 'approvals':
      if (ctx.role === 'admin' || ctx.role === 'finance') {
        suggestions.push({
          id: 'page-approvals-1',
          type: 'tip',
          icon: 'check',
          title: '审批注意事项',
          detail: '审批时请关注：1) 发票是否验真 2) 费用是否超标 3) 预算是否充足。超标项会高亮显示。',
        })
      }
      break
    case 'analytics':
      suggestions.push({
        id: 'page-analytics-1',
        type: 'info',
        icon: 'chart',
        title: '费用分析',
        detail: '切换「预算执行」Tab 查看部门预算使用率，切换「异常预警」Tab 查看需关注的异常费用。',
      })
      break
    case 'budgets':
      suggestions.push({
        id: 'page-budgets-1',
        type: 'info',
        icon: 'wallet',
        title: '预算管理',
        detail: '为部门或项目设置预算额度，员工报销时系统会自动检查预算使用情况。',
      })
      break
    case 'settings':
      suggestions.push({
        id: 'page-settings-1',
        type: 'info',
        icon: 'gear',
        title: '系统配置',
        detail: '在「费用标准与预算」Tab 配置职级限额规则。例如：普通员工住宿费上限 400 元/天。',
      })
      break
  }

  return suggestions
}

// ============ FAQ 知识库 ============

interface FAQItem {
  id: string
  keywords: string[]
  question: string
  answer: string
  actions?: ConciergeAction[]
}

const FAQ_DATABASE: FAQItem[] = [
  {
    id: 'faq-how-to-submit',
    keywords: ['怎么提交', '如何提交', '怎么报销', '如何报销', '怎么申请', '提交报销'],
    question: '如何提交报销单？',
    answer: '提交报销单的步骤：\n1. 点击左侧菜单「报销管理」\n2. 点击「新建报销单」\n3. 填写标题、选择差旅类型\n4. 添加费用明细行（可从发票池导入）\n5. 确认费用标准检查通过\n6. 点击「提交审批」\n\n系统会根据金额和超标情况自动路由到对应审批人。',
    actions: [{ label: '去新建报销单', type: 'navigate', data: { path: '/dashboard/reimbursements/spreadsheet' } }],
  },
  {
    id: 'faq-ocr',
    keywords: ['ocr', '识别', '发票识别', '自动填充', '扫描', '拍照'],
    question: '如何使用 OCR 自动识别发票？',
    answer: 'OCR 使用方式：\n1. 进入「发票池」页面\n2. 点击「上传发票」选择图片\n3. 系统自动调用 OCR 识别发票信息（金额、日期、销方等）\n4. 识别完成后发票自动入池\n5. 在报销单中可「从发票池导入」已识别的发票\n\n当前 OCR 默认使用内置 Mock 模式，管理员可在系统设置中配置智谱 API 启用真实识别。',
    actions: [{ label: '去发票池', type: 'navigate', data: { path: '/dashboard/invoices' } }],
  },
  {
    id: 'faq-verify',
    keywords: ['验真', '查验', '真伪', '验证发票', '发票真伪'],
    question: '如何进行发票验真？',
    answer: '发票验真操作：\n1. 进入「发票池」页面\n2. 找到需要验真的发票\n3. 点击操作列的「验真」按钮\n4. 系统模拟调用国家税务总局查验接口\n5. 验真完成后点击「查看报告」查看详细结果\n\n验真结果分三种：查验一致（绿色）、存疑（黄色）、查验不一致（红色）。',
    actions: [{ label: '去发票池', type: 'navigate', data: { path: '/dashboard/invoices' } }],
  },
  {
    id: 'faq-overstandard',
    keywords: ['超标', '超标准', '超过限额', '限额', '超标怎么办'],
    question: '费用超标了怎么办？',
    answer: '费用超标的处理方式：\n\n1. **警告（warn）**：系统提示超标但允许提交，审批人会重点关注\n2. **升级审批（escalation）**：自动追加高级审批节点（如总经理审批）\n3. **阻断（block）**：无法提交，需调整金额或提供特殊说明\n\n建议：\n- 在备注中说明超标原因（旺季涨价、紧急出差等）\n- 提前与部门负责人沟通\n- 保留相关证明材料',
  },
  {
    id: 'faq-budget',
    keywords: ['预算', '超预算', '预算不足', '预算超支', '预算额度'],
    question: '部门预算不够怎么办？',
    answer: '预算不足的解决方案：\n\n1. **调整费用归属**：将部分费用分摊到其他有预算的部门或项目\n2. **申请追加预算**：联系管理员在「预算管理」页面追加额度\n3. **延期报销**：将非紧急费用延期到下个预算周期\n\n注意：超预算报销同样会触发审批升级，建议提前规划。',
    actions: [{ label: '去预算管理', type: 'navigate', data: { path: '/dashboard/budgets' } }],
  },
  {
    id: 'faq-allocation',
    keywords: ['分摊', '费用分摊', '按部门', '按项目', '分摊比例'],
    question: '如何使用费用分摊？',
    answer: '费用分摊操作：\n1. 在报销单填写页展开「费用分摊」面板\n2. 启用分摊\n3. 添加分摊行（选择部门/项目 + 比例）\n4. 确保分摊比例合计为 100%\n5. 系统自动按比例拆分金额到各部门/项目\n\n适用场景：跨部门项目、多项目共用费用、成本中心核算。',
  },
  {
    id: 'faq-approval',
    keywords: ['审批', '审批流程', '审批人', '审批路由', '多久'],
    question: '审批流程是怎样的？需要多久？',
    answer: '审批流程说明：\n\n**标准流程**：申请人提交 → 部门负责人 → 财务审核 → 完成\n\n**升级流程**（金额大或超标时）：申请人 → 部门负责人 → 总经理 → 财务审核 → 完成\n\n审批时效：\n- 一般报销单：1-3 个工作日\n- 超标/大额报销单：3-5 个工作日\n\n可在「审批管理」页面查看审批进度。',
    actions: [{ label: '去审批管理', type: 'navigate', data: { path: '/dashboard/approvals' } }],
  },
  {
    id: 'faq-duplicate',
    keywords: ['查重', '重复', '重复发票', '发票重复'],
    question: '发票查重是怎么工作的？',
    answer: '发票查重机制：\n\n系统在以下场景自动查重：\n1. **上传发票时**：OCR 识别后自动检查发票代码+号码\n2. **手动录入时**：提交前检查是否已存在相同发票\n3. **报销单关联时**：检查发票是否已在其他报销单中使用\n\n发现重复时：\n- 发票标记为「查重异常」状态\n- 弹窗提示重复发票信息\n- 阻止重复报销',
  },
  {
    id: 'faq-account',
    keywords: ['账号', '密码', '登录', '演示账号', '测试账号'],
    question: '演示账号有哪些？',
    answer: '系统提供三个演示账号体验不同角色：\n\n1. **管理员**：admin@example.com / 123456\n   - 全部功能权限，含系统设置\n\n2. **财务**：finance@example.com / 123456\n   - 审批、发票验真、预算管理\n\n3. **普通员工**：employee@example.com / 123456\n   - 创建报销单、查看个人费用',
  },
  {
    id: 'faq-export',
    keywords: ['导出', '下载', 'csv', 'excel', '报表'],
    question: '如何导出数据？',
    answer: '数据导出方式：\n\n1. **发票池导出**：发票池页面点击「导出」按钮，导出 CSV 文件（Excel 可打开）\n2. **报销单打印**：报销单详情页点击「打印」按钮，生成 PDF\n3. **分析报表**：统计分析页面查看可视化图表（后续支持导出 PDF）\n\n导出的数据包含完整字段，方便财务做账和归档。',
  },
]

/** 搜索 FAQ */
export function searchFAQ(query: string): FAQItem[] {
  if (!query || !query.trim()) return []
  const lower = query.toLowerCase().trim()

  const scored = FAQ_DATABASE.map((faq) => {
    let score = 0
    // 关键词匹配
    for (const kw of faq.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += kw.length  // 长关键词权重更高
      }
    }
    // 问题匹配
    if (faq.question.toLowerCase().includes(lower)) {
      score += 10
    }
    // 答案匹配
    if (faq.answer.toLowerCase().includes(lower)) {
      score += 3
    }
    return { faq, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.faq)
}

/** 获取所有 FAQ（用于展示快捷问题） */
export function getQuickQuestions(): string[] {
  return [
    '如何提交报销单？',
    '如何使用 OCR 识别发票？',
    '费用超标了怎么办？',
    '部门预算不够怎么办？',
    '演示账号有哪些？',
  ]
}

// ============ 对话引擎 ============

/** 生成助手回复 */
export function generateResponse(userInput: string, ctx: ConciergeContext): { content: string; actions?: ConciergeAction[] } {
  const input = userInput.trim()

  if (!input) {
    return { content: '你好！我是 Concierge 智能助手，有什么可以帮你的吗？' }
  }

  // 1. 先匹配 FAQ
  const faqs = searchFAQ(input)
  if (faqs.length > 0) {
    const faq = faqs[0]
    return {
      content: faq.answer,
      actions: faq.actions,
    }
  }

  // 2. 费用类别推荐
  if (/什么类别|哪个类别|分类|归类|属于/.test(input)) {
    // 提取要分类的文本：支持「打车费属于什么类别」「机票归类」等模式
    let text = input.replace(/[?？]/g, '').trim()
    const m1 = text.match(/^(.+?)\s*(属于|归类|分类)/)
    if (m1) {
      text = m1[1].trim()
    } else {
      text = text.replace(/(什么|哪个|属于|归类|分类|类别).*/g, '').trim()
    }
    if (text) {
      const recs = recommendCategory(text)
      if (recs.length > 0) {
        const catLabel: Record<ExpenseCategoryKey, string> = {
          transport: '交通费',
          taxi: '打车费',
          hotel: '住宿费',
          meal: '餐饮费',
          other: '其它费用',
        }
        const top = recs[0]
        return {
          content: `根据描述「${text}」，建议归类为「${catLabel[top.category]}」。\n\n推荐理由：${top.reason}（置信度 ${Math.round(top.confidence * 100)}%）`,
        }
      }
    }
  }

  // 3. 问候语
  if (/^(你好|您好|hi|hello|嗨|hey)/i.test(input)) {
    return {
      content: `你好！我是 Concierge 智能助手 👋\n\n我可以帮你：\n- 解答报销相关问题\n- 推荐费用类别\n- 提供填写建议\n- 指导使用系统功能\n\n有什么可以帮你的吗？`,
    }
  }

  // 4. 感谢
  if (/谢谢|感谢|thanks|thank you/i.test(input)) {
    return { content: '不客气！如果还有其他问题随时问我 😊' }
  }

  // 5. 兜底回复
  return {
    content: `我理解你想了解「${input}」相关的内容。\n\n你可以试试以下方式：\n- 问我具体问题，如「如何提交报销单」「费用超标怎么办」\n- 使用快捷问题按钮\n- 查看页面上的智能建议\n\n如果我没有答好，可以换个问法试试～`,
  }
}

// ============ Concierge Context Store ============
// 用于在页面间共享 Concierge 上下文（如报销单填写状态）

interface ConciergeStore {
  /** 报销单表单状态（由 spreadsheet 页面更新） */
  formState?: ConciergeContext['formState']
  /** 更新表单状态 */
  setFormState: (state: ConciergeContext['formState']) => void
  /** 清除表单状态 */
  clearFormState: () => void
}

export const useConciergeStore = create<ConciergeStore>((set) => ({
  formState: undefined,
  setFormState: (formState) => set({ formState }),
  clearFormState: () => set({ formState: undefined }),
}))
