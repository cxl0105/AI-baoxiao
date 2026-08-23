'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FileText,
  LayoutDashboard,
  ListChecks,
  CheckSquare,
  BarChart3,
  Settings,
  Users,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Bell,
  Search,
  Table2,
  ChevronRight,
  Shield,
  Wallet,
  UserCircle,
  Stamp,
  Gauge,
  Building2,
} from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { hasPermission, NAV_PERMISSIONS, ROLES, type Role } from '@/lib/rbac'
import Concierge from '@/components/Concierge'
import { useConciergeStore, type ConciergeContext } from '@/lib/concierge'

// --- 导航菜单配置（每个菜单项标注所需权限）---
const navItemsConfig = [
  { label: '工作台', href: '/dashboard', icon: LayoutDashboard, perm: undefined as any },
  {
    label: '我的报销',
    href: '/dashboard/reimbursements',
    icon: FileText,
    perm: undefined as any,
    children: [
      { label: '报销单列表', href: '/dashboard/reimbursements' },
      { label: '智能新建（发票识别）', href: '/dashboard/reimbursements/new' },
      { label: '电子表格报销单', href: '/dashboard/reimbursements/spreadsheet' },
    ],
  },
  { label: '待我审批', href: '/dashboard/approvals', icon: CheckSquare, badge: 3, perm: 'approval:view' as const },
  { label: '发票池', href: '/dashboard/invoices', icon: Stamp, perm: undefined as any },
  { label: '预算管理', href: '/dashboard/budgets', icon: Gauge, perm: undefined as any },
  { label: '审批记录', href: '/dashboard/approval-records', icon: ListChecks, perm: 'approval:records' as const },
  { label: '统计分析', href: '/dashboard/analytics', icon: BarChart3, perm: 'analytics:view' as const },
  { label: '成员管理', href: '/dashboard/members', icon: Users, perm: 'members:manage' as const },
  { label: '系统设置', href: '/dashboard/settings', icon: Settings, perm: 'settings:view' as const },
  { label: '企业管理', href: '/dashboard/tenants', icon: Building2, perm: 'tenants:manage' as const },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuthStore()
  const formState = useConciergeStore((s) => s.formState)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // 构建 Concierge 上下文
  const conciergeContext: ConciergeContext = useMemo(() => {
    let page: ConciergeContext['page'] = 'other'
    if (pathname === '/dashboard') page = 'dashboard'
    else if (pathname.startsWith('/dashboard/reimbursements/spreadsheet')) page = 'spreadsheet'
    else if (pathname.startsWith('/dashboard/reimbursements')) page = 'reimbursements'
    else if (pathname.startsWith('/dashboard/invoices')) page = 'invoices'
    else if (pathname.startsWith('/dashboard/approvals')) page = 'approvals'
    else if (pathname.startsWith('/dashboard/approval-records')) page = 'approvals'
    else if (pathname.startsWith('/dashboard/analytics')) page = 'analytics'
    else if (pathname.startsWith('/dashboard/budgets')) page = 'budgets'
    else if (pathname.startsWith('/dashboard/settings')) page = 'settings'
    return {
      page,
      role: user?.role || 'employee',
      formState: page === 'spreadsheet' ? formState : undefined,
    }
  }, [pathname, user?.role, formState])

  // 按角色权限过滤导航菜单
  const navItems = useMemo(() => {
    const role = user?.role
    return navItemsConfig.filter((item) => {
      if (!item.perm) return true // 无权限要求的菜单（工作台、我的报销）所有人可见
      return hasPermission(role, item.perm)
    })
  }, [user?.role])

  // 角色标签样式
  const roleInfo = ROLES[(user?.role as Role) || 'employee'] || ROLES.employee
  const roleColorMap: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  }
  const roleBadgeClass = roleColorMap[roleInfo.color] || roleColorMap.slate

  // 是否能看到"新建报销"按钮
  const canCreateReimbursement = hasPermission(user?.role, 'reimbursement:create')

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* ============ 侧边栏 ============ */}
      {/* 遮罩层（移动端） */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-40 transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg text-slate-900 dark:text-white">智报销</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href)
            const Icon = item.icon
            const hasChildren = Array.isArray((item as any).children) && (item as any).children.length > 0
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {hasChildren && (
                    <ChevronRight className={`w-3.5 h-3.5 opacity-60 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                  )}
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-xs font-semibold text-white bg-red-500 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
                {hasChildren && isActive && (
                  <div className="mt-1 ml-3 pl-3 border-l border-slate-200 dark:border-slate-800 space-y-0.5">
                    {(item as any).children.map((ch: any) => {
                      const chActive = pathname === ch.href || (ch.href !== item.href && pathname.startsWith(ch.href))
                      return (
                        <Link
                          key={ch.href}
                          href={ch.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                            chActive
                              ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300'
                              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          <span className="flex-1 truncate">{ch.label}</span>
                          {ch.badge && (
                            <span className={`px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white rounded-full ${ch.badgeClass || 'bg-red-500'}`}>
                              {ch.badge}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* 底部用户区 */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {user?.name || '用户'}
                </p>
                <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${roleBadgeClass} flex-shrink-0`}>
                  {roleInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{user?.email || 'user@example.com'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-500 transition-colors p-1.5"
              title="退出登录"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============ 主内容区 ============ */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 flex-shrink-0">
          {/* 左侧：移动端菜单按钮 + 搜索 */}
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="relative hidden sm:block max-w-xs flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="搜索报销单..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* 右侧：通知 + 新建 + 用户 */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/dashboard/reimbursements/new"
              className={`hidden sm:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors ${canCreateReimbursement ? '' : 'pointer-events-none opacity-0'}`}
            >
              <FileText className="w-4 h-4" />
              新建报销
            </Link>

            {/* 通知 */}
            <button className="relative p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            {/* 用户菜单 */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-medium text-sm">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-2 z-40">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{user?.name || '用户'}</p>
                        <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded ${roleBadgeClass}`}>
                          {roleInfo.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">{user?.email || ''}</p>
                    </div>
                    {hasPermission(user?.role, 'settings:view') && (
                      <Link
                        href="/dashboard/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Settings className="w-4 h-4" />
                        账户设置
                      </Link>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* 页面内容 */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">{children}</main>
      </div>

      {/* Concierge AI 智能助手 */}
      <Concierge context={conciergeContext} />
    </div>
  )
}
