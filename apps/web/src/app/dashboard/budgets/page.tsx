'use client'

import { useMemo, useState } from 'react'
import {
  Gauge,
  Plus,
  Trash2,
  Edit3,
  TrendingUp,
  TrendingDown,
  Building2,
  FolderKanban,
  AlertTriangle,
  CheckCircle2,
  Save,
  X,
} from 'lucide-react'
import { useSettingsStore, type DepartmentBudget, type ProjectBudget } from '@/lib/settings'
import { utilizationLevel } from '@/lib/expense-standard'
import { useAuthStore } from '@/lib/auth'
import { hasPermission } from '@/lib/rbac'

const fmtMoney = (v: number) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

type Tab = 'department' | 'project'

export default function BudgetManagementPage() {
  const { user } = useAuthStore()
  const { policy, patchPolicy } = useSettingsStore()
  const bc = policy?.budgetControl
  const canManage = hasPermission(user?.role, 'settings:view')

  const [tab, setTab] = useState<Tab>('department')
  const [editing, setEditing] = useState<DepartmentBudget | ProjectBudget | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  // 统计
  const stats = useMemo(() => {
    if (!bc) return { totalBudget: 0, totalUsed: 0, count: 0, overCount: 0 }
    const list = tab === 'department' ? bc.departmentBudgets : bc.projectBudgets
    const totalBudget = list.reduce((s, x) => s + x.amount, 0)
    const totalUsed = list.reduce((s, x) => s + x.usedAmount, 0)
    const overCount = list.filter((x) => x.usedAmount > x.amount).length
    return { totalBudget, totalUsed, count: list.length, overCount }
  }, [bc, tab])

  if (!bc) {
    return (
      <div className="p-8 text-center text-slate-500">
        预算控制未启用
      </div>
    )
  }

  const handleSave = (item: DepartmentBudget | ProjectBudget) => {
    if (tab === 'department') {
      const exists = bc.departmentBudgets.find((d) => d.id === (item as DepartmentBudget).id)
      const next = exists
        ? bc.departmentBudgets.map((d) => (d.id === (item as DepartmentBudget).id ? (item as DepartmentBudget) : d))
        : [...bc.departmentBudgets, item as DepartmentBudget]
      patchPolicy({ budgetControl: { ...bc, departmentBudgets: next } })
    } else {
      const exists = bc.projectBudgets.find((p) => p.id === (item as ProjectBudget).id)
      const next = exists
        ? bc.projectBudgets.map((p) => (p.id === (item as ProjectBudget).id ? (item as ProjectBudget) : p))
        : [...bc.projectBudgets, item as ProjectBudget]
      patchPolicy({ budgetControl: { ...bc, projectBudgets: next } })
    }
    setEditing(null)
    setIsAdding(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('确认删除该预算项？')) return
    if (tab === 'department') {
      patchPolicy({ budgetControl: { ...bc, departmentBudgets: bc.departmentBudgets.filter((d) => d.id !== id) } })
    } else {
      patchPolicy({ budgetControl: { ...bc, projectBudgets: bc.projectBudgets.filter((p) => p.id !== id) } })
    }
  }

  const list = (tab === 'department' ? bc.departmentBudgets : bc.projectBudgets) as Array<DepartmentBudget | ProjectBudget>

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gauge className="w-6 h-6 text-brand-600" />
            预算管理
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            管理部门与项目的费用预算额度，实时监控使用情况。
            周期：
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {bc.period === 'monthly' ? '月度' : bc.period === 'quarterly' ? '季度' : '年度'}
            </span>
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => { setEditing(null); setIsAdding(true) }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            新增预算
          </button>
        )}
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="预算总额"
          value={`¥${fmtMoney(stats.totalBudget)}`}
          icon={<Gauge className="w-5 h-5" />}
          color="brand"
        />
        <StatCard
          title="已使用"
          value={`¥${fmtMoney(stats.totalUsed)}`}
          icon={<TrendingDown className="w-5 h-5" />}
          color="amber"
          subtitle={`${stats.totalBudget > 0 ? ((stats.totalUsed / stats.totalBudget) * 100).toFixed(1) : 0}%`}
        />
        <StatCard
          title="剩余可用"
          value={`¥${fmtMoney(Math.max(0, stats.totalBudget - stats.totalUsed))}`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="emerald"
        />
        <StatCard
          title="超支项数"
          value={`${stats.overCount}`}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={stats.overCount > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* Tab 切换 */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setTab('department')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'department'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          部门预算（{bc.departmentBudgets.length}）
        </button>
        <button
          onClick={() => setTab('project')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'project'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FolderKanban className="w-4 h-4" />
          项目预算（{bc.projectBudgets.length}）
        </button>
      </div>

      {/* 预算列表 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                {tab === 'department' ? (
                  <>
                    <th className="text-left px-4 py-3 font-medium">部门名称</th>
                  </>
                ) : (
                  <>
                    <th className="text-left px-4 py-3 font-medium">项目编号</th>
                    <th className="text-left px-4 py-3 font-medium">项目名称</th>
                  </>
                )}
                <th className="text-right px-4 py-3 font-medium">预算额度</th>
                <th className="text-right px-4 py-3 font-medium">已使用</th>
                <th className="text-right px-4 py-3 font-medium">剩余</th>
                <th className="text-left px-4 py-3 font-medium w-48">使用率</th>
                {canManage && <th className="text-right px-4 py-3 font-medium">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="text-center py-12 text-slate-400">
                    暂无{tab === 'department' ? '部门' : '项目'}预算，点击右上角「新增预算」添加
                  </td>
                </tr>
              )}
              {list.map((item) => {
                const used = item.usedAmount
                const budget = item.amount
                const remain = Math.max(0, budget - used)
                const rate = budget > 0 ? used / budget : 0
                const level = utilizationLevel(rate)
                const barColor = level === 'exceeded' ? 'bg-red-500' : level === 'danger' ? 'bg-orange-500' : level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'
                const isDept = tab === 'department'
                return (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    {isDept ? (
                      <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">
                        {(item as DepartmentBudget).department}
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                          {(item as ProjectBudget).projectCode}
                        </td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                          {(item as ProjectBudget).projectName}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">¥{fmtMoney(budget)}</td>
                    <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">¥{fmtMoney(used)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${remain > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      ¥{fmtMoney(remain)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, rate * 100)}%` }} />
                        </div>
                        <span className={`text-xs font-medium w-12 text-right ${
                          level === 'exceeded' ? 'text-red-600 dark:text-red-400' :
                          level === 'danger' ? 'text-orange-600 dark:text-orange-400' :
                          level === 'warning' ? 'text-amber-600 dark:text-amber-400' :
                          'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {(rate * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditing(item); setIsAdding(false) }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded transition-colors"
                            title="编辑"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 编辑/新增弹窗 */}
      {(editing || isAdding) && (
        <BudgetEditModal
          tab={tab}
          item={editing}
          onClose={() => { setEditing(null); setIsAdding(false) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

/* ===== 统计卡片 ===== */
function StatCard({ title, value, icon, color, subtitle }: {
  title: string
  value: string
  icon: React.ReactNode
  color: 'brand' | 'amber' | 'emerald' | 'red' | 'slate'
  subtitle?: string
}) {
  const colorMap = {
    brand: 'bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-500',
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">{title}</span>
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </span>
      </div>
      <div className="text-xl font-bold text-slate-900 dark:text-white">{value}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
    </div>
  )
}

/* ===== 编辑弹窗 ===== */
function BudgetEditModal({ tab, item, onClose, onSave }: {
  tab: Tab
  item: DepartmentBudget | ProjectBudget | null
  onClose: () => void
  onSave: (item: DepartmentBudget | ProjectBudget) => void
}) {
  const isDept = tab === 'department'
  const [form, setForm] = useState<any>(
    item || (isDept
      ? { id: uid(), department: '', amount: 0, usedAmount: 0 }
      : { id: uid(), projectCode: '', projectName: '', amount: 0, usedAmount: 0 })
  )

  const valid = isDept ? form.department?.trim() : (form.projectCode?.trim() && form.projectName?.trim())

  const handleSubmit = () => {
    if (!valid) return
    onSave({ ...form, amount: Number(form.amount) || 0, usedAmount: Number(form.usedAmount) || 0 })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {item ? '编辑预算' : '新增预算'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          {isDept ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">部门名称 *</label>
              <input
                value={form.department || ''}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="如：研发部"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">项目编号 *</label>
                <input
                  value={form.projectCode || ''}
                  onChange={(e) => setForm({ ...form, projectCode: e.target.value })}
                  placeholder="如：P2026-001"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">项目名称 *</label>
                <input
                  value={form.projectName || ''}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                  placeholder="如：AI报销系统V2"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100"
                />
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">预算额度（元）</label>
              <input
                type="number"
                value={form.amount || 0}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">已使用（元）</label>
              <input
                type="number"
                value={form.usedAmount || 0}
                onChange={(e) => setForm({ ...form, usedAmount: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!valid}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
