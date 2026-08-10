'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Wallet,
  Plus,
  ArrowRight,
  Sparkles,
  Users,
  Building2,
  AlertTriangle,
  BarChart3,
  ListChecks,
  Settings as SettingsIcon,
  Send,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { hasPermission, ROLES, type Role } from '@/lib/rbac'

// ============ Mock 数据 ============

// 员工视角数据：个人最近报销
const employeeRecent = [
  { id: 'R20240008', title: '6月北京出差报销', type: '差旅报销', amount: 3580.5, status: 'pending', date: '2024-06-15' },
  { id: 'R20240007', title: '办公用品采购', type: '采购报销', amount: 890.0, status: 'approved', date: '2024-06-12' },
  { id: 'R20240006', title: '客户招待费用', type: '日常费用', amount: 1280.0, status: 'rejected', date: '2024-06-10' },
  { id: 'R20240005', title: '5月团队建设费用', type: '日常费用', amount: 3200.0, status: 'paid', date: '2024-06-05' },
]

// 财务/管理员视角：待审批列表
const pendingApprovals = [
  { id: 'R20240009', title: '市场部广告投放费用', applicant: '王五', department: '市场部', amount: 15600.0, submittedAt: '2 小时前', urgent: true, step: 2, totalSteps: 3 },
  { id: 'R20240010', title: '研发部设备采购', applicant: '赵六', department: '研发部', amount: 8800.0, submittedAt: '5 小时前', urgent: false, step: 1, totalSteps: 3 },
  { id: 'R20240011', title: '6月差旅报销', applicant: '钱七', department: '销售部', amount: 2350.0, submittedAt: '1 天前', urgent: false, step: 3, totalSteps: 3 },
  { id: 'R20240012', title: '客户招待费用', applicant: '孙八', department: '市场部', amount: 1680.0, submittedAt: '1 天前', urgent: false, step: 1, totalSteps: 2 },
]

// 月度费用趋势
const monthlyData = [
  { month: '1月', amount: 8200 },
  { month: '2月', amount: 6800 },
  { month: '3月', amount: 11500 },
  { month: '4月', amount: 9300 },
  { month: '5月', amount: 12400 },
  { month: '6月', amount: 12860 },
]

// 部门统计（管理员视角）
const departmentStats = [
  { name: '研发部', amount: 45800, count: 18, color: 'bg-brand-500' },
  { name: '市场部', amount: 38200, count: 15, color: 'bg-emerald-500' },
  { name: '销售部', amount: 32500, count: 12, color: 'bg-amber-500' },
  { name: '行政部', amount: 12300, count: 6, color: 'bg-sky-500' },
]

const statusConfig: Record<string, { label: string; class: string }> = {
  draft: { label: '草稿', class: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  pending: { label: '审批中', class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  approved: { label: '已通过', class: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rejected: { label: '已驳回', class: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  paid: { label: '已付款', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
}

const maxAmount = Math.max(...monthlyData.map((d) => d.amount))

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const role = (user?.role as Role) || 'employee'
  const roleInfo = ROLES[role] || ROLES.employee

  // 权限标记
  const canApprove = hasPermission(role, 'approval:approve')
  const canViewApprovals = hasPermission(role, 'approval:view')
  const canViewAnalytics = hasPermission(role, 'analytics:view')
  const canManageMembers = hasPermission(role, 'members:manage')
  const canManageSettings = hasPermission(role, 'settings:manage')
  const canViewSettings = hasPermission(role, 'settings:view')
  const canViewApprovalRecords = hasPermission(role, 'approval:records')
  const canCreateReimbursement = hasPermission(role, 'reimbursement:create')

  // 欢迎语
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 9) return '早上好'
    if (hour < 12) return '上午好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  // 角色副标题
  const roleSubtitle: Record<Role, string> = {
    employee: '这是你的个人报销工作台，查看你的报销进度',
    finance: '财务管理中心，及时处理待审批单据与统计分析',
    admin: '系统全局概览，掌握全公司报销动态与关键指标',
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* === SSR 水合前 loading（避免服务端 user 为 null 误判角色）=== */}
      {!mounted ? (
        <div className="flex items-center justify-center py-20">
          <Clock className="w-6 h-6 text-brand-500 animate-spin mr-2" />
          <span className="text-slate-500 dark:text-slate-400">加载工作台...</span>
        </div>
      ) : (
        <>
      {/* ============ 欢迎栏 ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {greeting}，{user?.name || '同学'} 👋
            </h1>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                role === 'admin'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  : role === 'finance'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {roleInfo.label}
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{roleSubtitle[role]}</p>
        </div>
        {canCreateReimbursement && (
          <Link
            href="/dashboard/reimbursements/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/25 transition-all"
          >
            <Plus className="w-4 h-4" />
            新建报销单
          </Link>
        )}
      </div>

      {/* ============ 数据概览卡片：按角色差异化 ============ */}
      <DashboardStats role={role} canApprove={canApprove} canViewApprovals={canViewApprovals} />

      {/* ============ 主内容区 ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* === 左栏 === */}
        <div className="lg:col-span-2 space-y-6">
          {/* 财务/管理员：待我审批；员工：最近报销 */}
          {canViewApprovals ? (
            <PendingApprovalPanel approvals={pendingApprovals} />
          ) : (
            <RecentReimbursementPanel reimbursements={employeeRecent} />
          )}

          {/* 月度费用趋势：仅财务/管理员可见 */}
          {canViewAnalytics && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-slate-900 dark:text-white">月度费用趋势</h2>
                <span className="text-xs text-slate-400">近 6 个月</span>
              </div>
              <div className="flex items-end justify-between gap-3 h-40">
                {monthlyData.map((d) => (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-2 group">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-brand-400 to-brand-600 hover:from-brand-500 hover:to-brand-700 transition-colors relative group-hover:opacity-90"
                        style={{ height: `${(d.amount / maxAmount) * 100}%` }}
                      >
                        <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap transition-opacity">
                          ¥{d.amount.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 员工视角：报销小贴士 */}
          {!canViewApprovals && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <h2 className="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-500" />
                报销小贴士
              </h2>
              <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
                <TipItem>上传发票时，AI 会自动识别发票号、金额、日期，请核对后提交。</TipItem>
                <TipItem>差旅报销需附出差审批单，餐费报销需注明事由与参与人员。</TipItem>
                <TipItem>提交后可在「我的报销」中实时跟踪审批进度。</TipItem>
                <TipItem>电子表格报销单支持西门子风格多级签字流程，适合复杂报销场景。</TipItem>
              </div>
            </div>
          )}

          {/* 管理员视角：部门统计 */}
          {canManageMembers && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  部门报销统计
                </h2>
                <Link href="/dashboard/analytics" className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1">
                  详细分析 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="space-y-3">
                {departmentStats.map((dept) => {
                  const max = Math.max(...departmentStats.map((d) => d.amount))
                  return (
                    <div key={dept.name}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="text-slate-700 dark:text-slate-200 font-medium">{dept.name}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          ¥ {dept.amount.toLocaleString('zh-CN')} · {dept.count} 单
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${dept.color}`}
                          style={{ width: `${(dept.amount / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* === 右栏 === */}
        <div className="space-y-6">
          {/* 财务/管理员：快捷审批入口 */}
          {canViewApprovals && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold text-slate-900 dark:text-white">待我审批</h2>
                <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                  {pendingApprovals.length}
                </span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {pendingApprovals.slice(0, 4).map((item) => (
                  <Link
                    key={item.id}
                    href="/dashboard/approvals"
                    className="block px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                        {item.urgent && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        {item.title}
                      </p>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{item.applicant} · {item.submittedAt}</span>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        ¥ {item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
              <Link
                href="/dashboard/approvals"
                className="block text-center py-3 text-sm text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 transition-colors"
              >
                查看全部待审批 →
              </Link>
            </div>
          )}

          {/* 员工视角：最近报销简表 */}
          {!canViewApprovals && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="font-semibold text-slate-900 dark:text-white">最近报销</h2>
                <Link
                  href="/dashboard/reimbursements"
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                >
                  查看全部 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {employeeRecent.slice(0, 4).map((item) => {
                  const status = statusConfig[item.status] || statusConfig.draft
                  return (
                    <Link
                      key={item.id}
                      href={`/dashboard/reimbursements/${item.id}`}
                      className="block px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${status.class}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{item.id} · {item.date}</span>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          ¥ {item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* AI 助手提示 */}
          {canCreateReimbursement && (
            <div className="bg-gradient-to-br from-brand-600 to-indigo-700 rounded-2xl p-5 text-white relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-5 h-5" />
                  <h3 className="font-semibold">AI 智能助手</h3>
                </div>
                <p className="text-sm text-white/80 mb-4 leading-relaxed">
                  上传发票照片，AI 自动识别发票信息并填充报销单，准确率 99%+。
                </p>
                <Link
                  href="/dashboard/reimbursements/new"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg border border-white/20 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  试试 AI 识别
                </Link>
              </div>
            </div>
          )}

          {/* 快捷操作：按角色差异化 */}
          <QuickActions
            role={role}
            canCreateReimbursement={canCreateReimbursement}
            canViewApprovals={canViewApprovals}
            canViewApprovalRecords={canViewApprovalRecords}
            canViewAnalytics={canViewAnalytics}
            canManageMembers={canManageMembers}
            canManageSettings={canManageSettings}
            canViewSettings={canViewSettings}
          />
        </div>
      </div>
        </>
      )}
    </div>
  )
}

// ============ 角色差异化统计卡片 ============
function DashboardStats({ role, canApprove, canViewApprovals }: { role: Role; canApprove: boolean; canViewApprovals: boolean }) {
  // 员工：个人报销视角
  if (role === 'employee') {
    const stats = [
      { label: '本月报销总额', value: '¥ 3,580.50', change: '+12.5%', trend: 'up' as const, icon: Wallet, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-900/20' },
      { label: '审批中', value: '1', change: '1 等待审批', trend: 'neutral' as const, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
      { label: '已通过', value: '3', change: '+2 本月', trend: 'up' as const, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
      { label: '已驳回', value: '1', change: '-1 较上月', trend: 'down' as const, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    ]
    return <StatsGrid stats={stats} />
  }

  // 财务：审批中心视角
  if (role === 'finance') {
    const stats = [
      { label: '待我审批', value: '3', change: '1 加急', trend: 'neutral' as const, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
      { label: '待审批金额', value: '¥ 28,430', change: '4 张单据', trend: 'neutral' as const, icon: Wallet, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-900/20' },
      { label: '本月已处理', value: '46', change: '+8 较上月', trend: 'up' as const, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
      { label: '超时预警', value: '2', change: '> 48h 未处理', trend: 'down' as const, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20' },
    ]
    return <StatsGrid stats={stats} />
  }

  // 管理员：全局概览视角
  const stats = [
    { label: '全公司月度报销', value: '¥ 128,605', change: '+12.5%', trend: 'up' as const, icon: Wallet, color: 'text-brand-600', bg: 'bg-brand-50 dark:bg-brand-900/20' },
    { label: '待审批总数', value: '12', change: '3 加急', trend: 'neutral' as const, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: '活跃成员', value: '48', change: '+3 本月', trend: 'up' as const, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    { label: '本月增长', value: '+12.5%', change: '同比上升', trend: 'up' as const, icon: TrendingUp, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-900/20' },
  ]
  return <StatsGrid stats={stats} />
}

function StatsGrid({ stats }: { stats: Array<{ label: string; value: string; change: string; trend: 'up' | 'down' | 'neutral'; icon: typeof Wallet; color: string; bg: string }> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.label}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              {stat.trend === 'up' && (
                <span className="flex items-center gap-0.5 text-xs font-medium text-green-600">
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </span>
              )}
              {stat.trend === 'neutral' && (
                <span className="text-xs text-slate-400">{stat.change}</span>
              )}
              {stat.trend === 'down' && (
                <span className="text-xs text-green-600">{stat.change}</span>
              )}
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
          </div>
        )
      })}
    </div>
  )
}

// ============ 最近报销面板（员工视角） ============
function RecentReimbursementPanel({ reimbursements }: { reimbursements: typeof employeeRecent }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-white">最近报销单</h2>
        <Link
          href="/dashboard/reimbursements"
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          查看全部
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {reimbursements.map((item) => {
          const status = statusConfig[item.status] || statusConfig.draft
          return (
            <Link
              key={item.id}
              href={`/dashboard/reimbursements/${item.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {item.id} · {item.type} · {item.date}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  ¥ {item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
                <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${status.class}`}>
                  {status.label}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ============ 待审批面板（财务/管理员视角） ============
function PendingApprovalPanel({ approvals }: { approvals: typeof pendingApprovals }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          待我审批
          <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">{approvals.length}</span>
        </h2>
        <Link
          href="/dashboard/approvals"
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
        >
          全部待审批
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {approvals.map((item) => (
          <Link
            key={item.id}
            href="/dashboard/approvals"
            className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${item.urgent ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
              {item.urgent ? (
                <AlertTriangle className="w-5 h-5 text-red-500" />
              ) : (
                <Clock className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                {item.title}
                {item.urgent && (
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">
                    加急
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.id} · {item.applicant} · {item.department} · {item.submittedAt}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden max-w-[120px]">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                    style={{ width: `${(item.step / item.totalSteps) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  {item.step}/{item.totalSteps}
                </span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                ¥ {item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </p>
              <Link
                href="/dashboard/approvals"
                className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1 inline-block"
              >
                去审批 →
              </Link>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ============ 快捷操作：按角色差异化 ============
function QuickActions({
  role,
  canCreateReimbursement,
  canViewApprovals,
  canViewApprovalRecords,
  canViewAnalytics,
  canManageMembers,
  canManageSettings,
  canViewSettings,
}: {
  role: Role
  canCreateReimbursement: boolean
  canViewApprovals: boolean
  canViewApprovalRecords: boolean
  canViewAnalytics: boolean
  canManageMembers: boolean
  canManageSettings: boolean
  canViewSettings: boolean
}) {
  const actions: Array<{ label: string; href: string; icon: typeof FileText; show: boolean }> = [
    { label: '新建报销', href: '/dashboard/reimbursements/new', icon: FileText, show: canCreateReimbursement },
    { label: '电子表格报销单', href: '/dashboard/reimbursements/spreadsheet', icon: Send, show: canCreateReimbursement },
    { label: '待我审批', href: '/dashboard/approvals', icon: CheckCircle2, show: canViewApprovals },
    { label: '审批记录', href: '/dashboard/approval-records', icon: ListChecks, show: canViewApprovalRecords },
    { label: '统计分析', href: '/dashboard/analytics', icon: BarChart3, show: canViewAnalytics },
    { label: '成员管理', href: '/dashboard/members', icon: Users, show: canManageMembers },
    { label: '系统设置', href: '/dashboard/settings', icon: SettingsIcon, show: canViewSettings },
  ]

  const visible = actions.filter((a) => a.show)
  if (visible.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <h2 className="font-semibold text-slate-900 dark:text-white mb-4">快捷操作</h2>
      <div className="grid grid-cols-2 gap-3">
        {visible.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all"
            >
              <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300 text-center">{action.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ============ 小组件 ============
function TipItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  )
}
