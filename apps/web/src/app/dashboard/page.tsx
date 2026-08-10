'use client'

import Link from 'next/link'
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
} from 'lucide-react'

// --- Mock 数据 ---
const stats = [
  {
    label: '本月报销总额',
    value: '¥ 12,860.50',
    change: '+12.5%',
    trend: 'up',
    icon: Wallet,
    color: 'text-brand-600',
    bg: 'bg-brand-50 dark:bg-brand-900/20',
  },
  {
    label: '待审批',
    value: '3',
    change: '2 等我审批',
    trend: 'neutral',
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  {
    label: '已通过',
    value: '18',
    change: '+5 本月',
    trend: 'up',
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-900/20',
  },
  {
    label: '已驳回',
    value: '2',
    change: '-1 较上月',
    trend: 'down',
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
]

const recentReimbursements = [
  {
    id: 'R20240008',
    title: '6月北京出差报销',
    type: '差旅报销',
    amount: 3580.5,
    status: 'pending',
    date: '2024-06-15',
  },
  {
    id: 'R20240007',
    title: '办公用品采购',
    type: '采购报销',
    amount: 890.0,
    status: 'approved',
    date: '2024-06-12',
  },
  {
    id: 'R20240006',
    title: '客户招待费用',
    type: '日常费用',
    amount: 1280.0,
    status: 'rejected',
    date: '2024-06-10',
  },
  {
    id: 'R20240005',
    title: '5月团队建设费用',
    type: '日常费用',
    amount: 3200.0,
    status: 'paid',
    date: '2024-06-05',
  },
  {
    id: 'R20240004',
    title: '上海客户拜访差旅',
    type: '差旅报销',
    amount: 2850.0,
    status: 'approved',
    date: '2024-06-01',
  },
]

const pendingApprovals = [
  {
    id: 'R20240009',
    title: '市场部广告投放费用',
    applicant: '王五',
    amount: 15600.0,
    submittedAt: '2 小时前',
  },
  {
    id: 'R20240010',
    title: '研发部设备采购',
    applicant: '赵六',
    amount: 8800.0,
    submittedAt: '5 小时前',
  },
  {
    id: 'R20240011',
    title: '6月差旅报销',
    applicant: '钱七',
    amount: 2350.0,
    submittedAt: '1 天前',
  },
]

// 月度费用趋势数据（用于柱状图）
const monthlyData = [
  { month: '1月', amount: 8200 },
  { month: '2月', amount: 6800 },
  { month: '3月', amount: 11500 },
  { month: '4月', amount: 9300 },
  { month: '5月', amount: 12400 },
  { month: '6月', amount: 12860 },
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
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ============ 欢迎栏 ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            欢迎回来 👋
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            这是你的报销工作台，以下是最新动态
          </p>
        </div>
        <Link
          href="/dashboard/reimbursements/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/25 transition-all"
        >
          <Plus className="w-4 h-4" />
          新建报销单
        </Link>
      </div>

      {/* ============ 数据概览卡片 ============ */}
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

      {/* ============ 主内容区：两栏布局 ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============ 左栏：最近报销 + 月度趋势 ============ */}
        <div className="lg:col-span-2 space-y-6">
          {/* 最近报销单 */}
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
              {recentReimbursements.map((item) => {
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
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
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

          {/* 月度费用趋势 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-slate-900 dark:text-white">月度费用趋势</h2>
              <span className="text-xs text-slate-400">近 6 个月</span>
            </div>
            {/* 简易柱状图 */}
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
        </div>

        {/* ============ 右栏：待审批 + 快捷操作 ============ */}
        <div className="space-y-6">
          {/* 待我审批 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-semibold text-slate-900 dark:text-white">待我审批</h2>
              <span className="px-2 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                {pendingApprovals.length}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingApprovals.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/reimbursements/${item.id}`}
                  className="block px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
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

          {/* AI 助手提示 */}
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

          {/* 快捷操作 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
            <h2 className="font-semibold text-slate-900 dark:text-white mb-4">快捷操作</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: '新建报销', href: '/dashboard/reimbursements/new', icon: FileText },
                { label: '审批记录', href: '/dashboard/approval-records', icon: CheckCircle2 },
                { label: '统计分析', href: '/dashboard/analytics', icon: TrendingUp },
                { label: '系统设置', href: '/dashboard/settings', icon: Wallet },
              ].map((action) => {
                const Icon = action.icon
                return (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/10 transition-all"
                  >
                    <Icon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{action.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
