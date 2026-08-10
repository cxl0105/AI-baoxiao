// 报销 / 审批 相关数据模型 & Mock 数据生成
// 保持与 dashboard 首页的数据风格一致，方便平滑衔接

import type { ExpenseCategory } from './api'

export type ReimbursementStatus =
  | 'draft'       // 草稿
  | 'pending'     // 审批中
  | 'approved'    // 已通过
  | 'rejected'    // 已驳回
  | 'paid'        // 已付款
  | 'revoked'     // 已撤销

export const STATUS_META: Record<
  ReimbursementStatus,
  { label: string; tone: 'default' | 'info' | 'warn' | 'success' | 'danger' | 'muted' }
> = {
  draft:     { label: '草稿',     tone: 'default' },
  pending:   { label: '审批中',   tone: 'warn' },
  approved:  { label: '已通过',   tone: 'success' },
  rejected:  { label: '已驳回',   tone: 'danger' },
  paid:      { label: '已付款',   tone: 'info' },
  revoked:   { label: '已撤销',   tone: 'muted' },
}

export const TYPE_LABEL: Record<string, string> = {
  travel: '差旅报销',
  purchase: '采购报销',
  daily: '日常费用',
  conference: '会议报销',
  training: '培训报销',
  other: '其他',
}

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: '差旅住宿', transport: '交通出行', meal: '餐饮',
  office: '办公用品', communication: '通讯', entertainment: '招待/客户',
  training: '培训', other: '其他',
}

export interface ReimbursementListItem {
  id: string
  code: string
  title: string
  type: string
  amount: number
  status: ReimbursementStatus
  createdAt: string
  updatedAt: string
  approver: string
  department: string
  submitter: string
  items: Array<{
    category: ExpenseCategory
    amount: number
    description: string
    date: string
  }>
}

export interface ApprovalStep {
  id: string
  stepIndex: number
  actor: string
  role: string
  action: 'pending' | 'approve' | 'reject' | 'delegate' | 'reassign' | 'submit' | 'revoke' | 'pay'
  time?: string
  comment?: string
  avatarColor?: string
}

export interface ReimbursementDetail extends ReimbursementListItem {
  description: string
  startDate: string
  endDate: string
  invoiceCount: number
  attachmentUrls: { name: string; size: number; thumbnail?: string; url: string }[]
  timeline: ApprovalStep[]
  nextApprovers: Array<{ id: string; name: string; role: string }>
  canRevoke: boolean
  canModify: boolean
  canDelete: boolean
  canPay: boolean
}

// 确定性伪随机（基于种子，保证 SSR 和客户端渲染一致，避免 React hydration 错误）
function seededRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}
// 固定锚点日期，避免 new Date()/Date.now() 在服务端和客户端产生不同值
const ANCHOR_DATE = new Date('2026-08-10T12:00:00Z').getTime()

// 生成 N 条 mock 报销单（按时间倒序）
export function generateMockList(count = 48): ReimbursementListItem[] {
  const titles = [
    { t: 'travel', title: '6月北京出差报销' },
    { t: 'meal', title: '客户招待餐饮费用' },
    { t: 'office', title: '办公用品批量采购' },
    { t: 'transport', title: '上海客户拜访出行' },
    { t: 'training', title: '团队外训课程费用' },
    { t: 'conference', title: '行业峰会参会报销' },
    { t: 'daily', title: '团队建设聚餐' },
    { t: 'purchase', title: '研发设备采购' },
  ]
  const approvers = ['张经理', '李主管', '王总监', '赵财务', '陈副总']
  const depts = ['研发部', '产品部', '市场部', '销售部', '财务部', '运营部']
  const submitters = ['你本人', '张三', '李四', '王五']
  const statuses: ReimbursementStatus[] = [
    'draft', 'pending', 'pending', 'pending',
    'approved', 'approved', 'approved', 'rejected', 'paid', 'revoked',
  ]
  const list: ReimbursementListItem[] = []
  for (let i = 0; i < count; i++) {
    const r1 = seededRand(i + 1)
    const r2 = seededRand(i + 100)
    const r3 = seededRand(i + 200)
    const daysAgo = Math.floor(r1 * 120)
    const createdAt = new Date(ANCHOR_DATE - daysAgo * 86400000)
    const titleEntry = titles[i % titles.length]
    const amount = +(50 + r2 * 15000).toFixed(2)
    const status = statuses[i % statuses.length]
    const itemCount = 1 + Math.floor(r3 * 4)
    const items: ReimbursementListItem['items'] = []
    for (let j = 0; j < itemCount; j++) {
      const catKeys = Object.keys(CATEGORY_LABEL) as ExpenseCategory[]
      const cat = catKeys[(i + j) % catKeys.length]
      items.push({
        category: cat,
        amount: +((amount / itemCount) + (seededRand(i * 10 + j + 300) * 40 - 20)).toFixed(2),
        description: CATEGORY_LABEL[cat] + ' - ' + (j + 1),
        date: createdAt.toISOString().slice(0, 10),
      })
    }
    const total = +items.reduce((s, x) => s + x.amount, 0).toFixed(2)
    list.push({
      id: 'r_' + i.toString(36) + seededRand(i + 400).toString(36).slice(2, 6),
      code: 'R2024' + String(10000 + count - i),
      title: titleEntry.title,
      type: titleEntry.t,
      amount: total,
      status,
      createdAt: createdAt.toISOString().slice(0, 10),
      updatedAt: createdAt.toISOString().slice(0, 10),
      approver: approvers[i % approvers.length],
      department: depts[i % depts.length],
      submitter: submitters[i % submitters.length],
      items,
    })
  }
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// 构造详情
export function listItemToDetail(item: ReimbursementListItem): ReimbursementDetail {
  const avatars = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6']
  const timeline: ApprovalStep[] = [
    {
      id: 's0', stepIndex: 0,
      actor: item.submitter, role: '申请人',
      action: 'submit', time: item.createdAt + ' 09:' + (10 + Math.floor(seededRand(item.code.length + 1) * 40)) + ':00',
      comment: '请领导审批，谢谢！', avatarColor: avatars[0],
    },
    {
      id: 's1', stepIndex: 1,
      actor: '部门主管', role: '直接主管',
      action: (item.status === 'rejected' ? 'reject' : (item.status === 'revoked' ? 'pending' : 'approve')) as any,
      time: item.createdAt + ' 11:20',
      comment: item.status === 'rejected' ? '票据信息不完整，请补充发票照片后重新提交' : '已核对，情况属实',
      avatarColor: avatars[1],
    },
  ]
  if (item.status === 'approved' || item.status === 'paid') {
    timeline.push({
      id: 's2', stepIndex: 2,
      actor: item.approver, role: '财务复核',
      action: 'approve', time: item.createdAt + ' 14:50',
      comment: '单据合规，已通过复核', avatarColor: avatars[2],
    })
  }
  if (item.status === 'paid') {
    timeline.push({
      id: 's3', stepIndex: 3,
      actor: '出纳：刘芳', role: '出纳',
      action: 'pay', time: item.createdAt + ' 17:05',
      comment: '已付款（建设银行 ****2345 转账）', avatarColor: avatars[3],
    })
  }
  if (item.status === 'revoked') {
    timeline[1] = { ...timeline[1], action: 'pending', comment: undefined, time: undefined }
    timeline.push({
      id: 's_revoke', stepIndex: 4,
      actor: item.submitter, role: '申请人',
      action: 'revoke', time: item.createdAt + ' 10:30',
      comment: '撤回修改后重新提交', avatarColor: avatars[4],
    })
  }

  const nextApprovers =
    item.status === 'pending'
      ? [
          { id: '1', name: item.approver, role: '当前审批人' },
          { id: '2', name: '赵财务', role: '财务复核' },
        ]
      : []

  const invoices = Array.from({ length: Math.min(item.items.length + 1, 5) }, (_, k) => ({
    name: `发票-${k + 1}.jpg`,
    size: Math.floor(200 + seededRand(k + 500) * 2800),
    url: '#',
  }))

  return {
    ...item,
    description: `${item.title} - 共 ${item.items.length} 项明细，已按财务规范粘贴原始票据`,
    startDate: item.createdAt,
    endDate: item.createdAt,
    invoiceCount: invoices.length,
    attachmentUrls: invoices,
    timeline,
    nextApprovers,
    canRevoke: item.status === 'pending',
    canModify: item.status === 'draft' || item.status === 'revoked',
    canDelete: item.status === 'draft' || item.status === 'revoked',
    canPay: item.status === 'approved',
  }
}

// 「待我审批」数据（当前用户 = 审批人，包含申请人头像/部门）
export function generatePendingApproval(count = 16) {
  const all = generateMockList(count + 20).filter((x) => x.status === 'pending').slice(0, count)
  return all.map((r, idx) => ({
    ...r,
    submittedAt: r.createdAt + ' ' + ['09:', '10:', '11:', '14:', '15:'][Math.floor(seededRand(idx + 600) * 5)] + String(Math.floor(seededRand(idx + 700) * 59)).padStart(2, '0'),
    urgent: seededRand(idx + 800) < 0.25,
    currentStep: 1 + Math.floor(seededRand(idx + 900) * 2),
    totalSteps: 3,
  }))
}
