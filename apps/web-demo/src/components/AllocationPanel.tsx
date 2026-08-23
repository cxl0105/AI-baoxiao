'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  PieChart,
  Plus,
  Trash2,
  Building2,
  FolderKanban,
  Percent,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Calculator,
} from 'lucide-react'

// ============ 类型定义 ============

export type AllocationBasis = 'department' | 'project' | 'cost_center'

export interface AllocationItem {
  id: string
  /** 分摊维度：部门 / 项目 / 成本中心 */
  basis: AllocationBasis
  /** 部门名称（basis=department 时） */
  department?: string
  /** 项目名称（basis=project 时） */
  project?: string
  /** 成本中心（basis=cost_center 时） */
  costCenter?: string
  /** 分摊比例（百分比，0-100） */
  percentage: number
  /** 分摊金额（根据总额 × 比例自动计算） */
  amount: number
  /** 备注 */
  remark?: string
}

export interface AllocationConfig {
  /** 是否启用费用分摊 */
  enabled: boolean
  /** 分摊维度 */
  basis: AllocationBasis
  /** 分摊明细 */
  items: AllocationItem[]
}

// ============ 常量 ============

export const ALLOCATION_BASIS_LABEL: Record<AllocationBasis, string> = {
  department: '按部门分摊',
  project: '按项目分摊',
  cost_center: '按成本中心分摊',
}

export const DEPARTMENTS = [
  '研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部', '行政部',
]

export const PROJECTS = [
  '核心产品线', '企业版定制', '移动端APP', '数据中台', '品牌升级', '海外拓展', '内部信息化',
]

export const COST_CENTERS = [
  'CC-001 华东区', 'CC-002 华南区', 'CC-003 华北区', 'CC-004 西南区', 'CC-005 研发中心', 'CC-006 管理中心',
]

// ============ 工具函数 ============

/** 生成唯一 ID */
function genId(): string {
  return `alloc_${Date.now()}_${Math.floor(Math.random() * 1000)}`
}

/** 创建默认分摊项 */
function createDefaultItem(basis: AllocationBasis): AllocationItem {
  const item: AllocationItem = {
    id: genId(),
    basis,
    percentage: 100,
    amount: 0,
  }
  if (basis === 'department') item.department = DEPARTMENTS[0]
  if (basis === 'project') item.project = PROJECTS[0]
  if (basis === 'cost_center') item.costCenter = COST_CENTERS[0]
  return item
}

/** 计算分摊比例是否合计 100% */
export function validateAllocation(items: AllocationItem[]): {
  isValid: boolean
  total: number
  message: string
} {
  const total = items.reduce((sum, item) => sum + item.percentage, 0)
  if (items.length === 0) return { isValid: true, total: 0, message: '未设置分摊' }
  if (Math.abs(total - 100) < 0.01) {
    return { isValid: true, total, message: '分摊比例合计 100%' }
  }
  return {
    isValid: false,
    total,
    message: `分摊比例合计 ${total.toFixed(2)}%，需调整为 100%`,
  }
}

// ============ 主组件 ============

interface AllocationPanelProps {
  /** 报销总金额（含税合计） */
  totalAmount: number
  /** 当前分摊配置 */
  config: AllocationConfig
  /** 配置变更回调 */
  onChange: (config: AllocationConfig) => void
  /** 是否只读（查看详情时） */
  readOnly?: boolean
}

export default function AllocationPanel({
  totalAmount,
  config,
  onChange,
  readOnly = false,
}: AllocationPanelProps) {
  const { enabled, basis, items } = config

  // 切换分摊维度时重置分摊项
  const handleBasisChange = (newBasis: AllocationBasis) => {
    if (readOnly) return
    const newItem = createDefaultItem(newBasis)
    onChange({ ...config, basis: newBasis, items: [newItem] })
  }

  // 启用/禁用分摊
  const handleToggle = () => {
    if (readOnly) return
    if (!enabled) {
      // 启用时初始化一个默认项
      onChange({ ...config, enabled: true, items: items.length > 0 ? items : [createDefaultItem(basis)] })
    } else {
      onChange({ ...config, enabled: false })
    }
  }

  // 添加分摊行
  const handleAddItem = () => {
    if (readOnly) return
    // 新行默认比例：如果已有项，取剩余比例；否则 100%
    const usedPercent = items.reduce((sum, item) => sum + item.percentage, 0)
    const remaining = Math.max(0, 100 - usedPercent)
    const newItem = createDefaultItem(basis)
    newItem.percentage = remaining
    onChange({ ...config, items: [...items, newItem] })
  }

  // 删除分摊行
  const handleRemoveItem = (id: string) => {
    if (readOnly) return
    onChange({ ...config, items: items.filter((item) => item.id !== id) })
  }

  // 更新分摊行
  const handleUpdateItem = (id: string, patch: Partial<AllocationItem>) => {
    if (readOnly) return
    onChange({
      ...config,
      items: items.map((item) =>
        item.id === id
          ? { ...item, ...patch, amount: +((patch.percentage ?? item.percentage) / 100 * totalAmount).toFixed(2) }
          : item
      ),
    })
  }

  // 重新计算每行金额（当总额变化时）
  useEffect(() => {
    if (!enabled || items.length === 0) return
    const updated = items.map((item) => ({
      ...item,
      amount: +(item.percentage / 100 * totalAmount).toFixed(2),
    }))
    // 仅在金额变化时更新，避免无限循环
    const changed = updated.some((item, i) => item.amount !== items[i]?.amount)
    if (changed) {
      onChange({ ...config, items: updated })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAmount, enabled])

  // 校验状态
  const validation = useMemo(() => validateAllocation(items), [items])
  const totalAllocated = items.reduce((sum, item) => sum + item.amount, 0)

  // 分摊维度选项
  const basisOptions: Array<{ value: AllocationBasis; label: string; icon: typeof Building2 }> = [
    { value: 'department', label: '按部门', icon: Building2 },
    { value: 'project', label: '按项目', icon: FolderKanban },
    { value: 'cost_center', label: '按成本中心', icon: Calculator },
  ]

  // 当前维度的可选项
  const dimensionOptions = basis === 'department' ? DEPARTMENTS : basis === 'project' ? PROJECTS : COST_CENTERS

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-brand-500" />
          <h3 className="font-semibold text-slate-900 dark:text-white">费用分摊</h3>
          {enabled && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
              已启用
            </span>
          )}
        </div>
        {!readOnly && (
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm text-slate-500 dark:text-slate-400">启用分摊</span>
            <button
              type="button"
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        )}
      </div>

      {!enabled ? (
        /* 未启用状态 */
        <div className="px-5 py-8 text-center">
          <PieChart className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {readOnly ? '未启用费用分摊' : '未启用费用分摊，整笔费用归属单一部门/项目'}
          </p>
          {!readOnly && (
            <p className="text-xs text-slate-400 mt-1">开启后可将费用按比例分摊到多个部门/项目/成本中心</p>
          )}
        </div>
      ) : (
        <>
          {/* 分摊维度选择 */}
          {!readOnly && (
            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">分摊维度</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {basisOptions.map((opt) => {
                  const Icon = opt.icon
                  const isActive = basis === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleBasisChange(opt.value)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                        isActive
                          ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 分摊明细表格 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-xs text-slate-400 uppercase">
                  <th className="px-5 py-2.5 text-left font-medium">
                    {basis === 'department' ? '部门' : basis === 'project' ? '项目' : '成本中心'}
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">
                    <Percent className="w-3.5 h-3.5 inline mr-1" />
                    分摊比例
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium w-32">
                    <Wallet className="w-3.5 h-3.5 inline mr-1" />
                    分摊金额
                  </th>
                  {!readOnly && <th className="px-3 py-2.5 text-center font-medium w-16">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-2.5">
                      {readOnly ? (
                        <span className="text-slate-700 dark:text-slate-200 font-medium">
                          {item.department || item.project || item.costCenter || '-'}
                        </span>
                      ) : (
                        <select
                          value={item.department || item.project || item.costCenter || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (basis === 'department') handleUpdateItem(item.id, { department: val })
                            if (basis === 'project') handleUpdateItem(item.id, { project: val })
                            if (basis === 'cost_center') handleUpdateItem(item.id, { costCenter: val })
                          }}
                          className="w-full px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                        >
                          {dimensionOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {readOnly ? (
                        <span className="text-slate-700 dark:text-slate-200 font-medium">{item.percentage.toFixed(2)}%</span>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.percentage}
                            onChange={(e) => handleUpdateItem(item.id, { percentage: parseFloat(e.target.value) || 0 })}
                            className="w-20 px-2 py-1 text-sm text-right rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                          />
                          <span className="text-slate-400 text-xs">%</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-slate-900 dark:text-white font-semibold">
                        ¥ {item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={items.length <= 1}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="删除此行"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                  <td className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                    合计
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-sm font-bold ${validation.isValid ? 'text-slate-700 dark:text-slate-200' : 'text-red-600'}`}>
                      {validation.total.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      ¥ {totalAllocated.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  {!readOnly && <td className="px-3 py-2.5" />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 底部操作与提示 */}
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            {/* 校验提示 */}
            <div className="flex items-center gap-2 text-sm">
              {validation.isValid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">{validation.message}</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-amber-600 dark:text-amber-400">{validation.message}</span>
                </>
              )}
            </div>

            {/* 添加按钮 */}
            {!readOnly && (
              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800 hover:bg-brand-100 dark:hover:bg-brand-900/30 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                添加分摊行
              </button>
            )}
          </div>

          {/* 分摊可视化条 */}
          {items.length > 1 && (
            <div className="px-5 pb-4">
              <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                {items.map((item, idx) => {
                  const colors = [
                    'bg-brand-500', 'bg-emerald-500', 'bg-amber-500',
                    'bg-sky-500', 'bg-purple-500', 'bg-rose-500',
                  ]
                  return (
                    <div
                      key={item.id}
                      className={`${colors[idx % colors.length]} transition-all`}
                      style={{ width: `${item.percentage}%` }}
                      title={`${item.department || item.project || item.costCenter}: ${item.percentage}%`}
                    />
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {items.map((item, idx) => {
                  const colors = [
                    'bg-brand-500', 'bg-emerald-500', 'bg-amber-500',
                    'bg-sky-500', 'bg-purple-500', 'bg-rose-500',
                  ]
                  const name = item.department || item.project || item.costCenter || '-'
                  return (
                    <div key={item.id} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className={`w-2.5 h-2.5 rounded-full ${colors[idx % colors.length]}`} />
                      {name} ({item.percentage.toFixed(1)}%)
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
