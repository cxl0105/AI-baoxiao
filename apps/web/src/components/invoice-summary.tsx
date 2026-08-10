'use client'

import React, { useMemo } from 'react'
import {
  FileText,
  CircleDollarSign,
  BadgePercent,
  Wallet,
  PieChart as PieIcon,
  BarChart3,
  AlertTriangle,
} from 'lucide-react'
import type { ExpenseCategory, OcrInvoice } from '@/lib/api'
import { CATEGORY_LABEL } from '@/lib/api'
import type { NormalizedOcrResult } from '@/lib/ocr-providers'
import type { AnyInvoice } from './invoice-table'

export interface InvoiceSummaryProps {
  invoices: AnyInvoice[]
  /** 金额小数位（读取 settings 传入，默认 2） */
  precision?: number
  /** 失败发票数（快速展示警示） */
  failedCount?: number
}

interface CategoryBucket {
  category: ExpenseCategory
  count: number
  amount: number
  tax: number
  total: number
  percent: number
}

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  travel: '#6366f1',
  meal: '#f59e0b',
  transport: '#10b981',
  office: '#8b5cf6',
  communication: '#06b6d4',
  entertainment: '#ef4444',
  training: '#14b8a6',
  other: '#64748b',
}

/** 取一组 HSL 颜色，用于 CATEGORY_COLORS 里没有的兜底（理论上不会） */
function getColor(cat: ExpenseCategory): string {
  return CATEGORY_COLORS[cat] || '#475569'
}

export const InvoiceSummary: React.FC<InvoiceSummaryProps> = ({
  invoices,
  precision = 2,
  failedCount = 0,
}) => {
  const { buckets, totalAmt, totalTax, totalGross, successCount, totalCount } = useMemo(() => {
    const all = new Map<ExpenseCategory, Omit<CategoryBucket, 'percent'>>()
    let successCount = 0
    let totalAmt = 0
    let totalTax = 0
    let totalGross = 0
    for (const r of invoices) {
      if (r.status === 'success') successCount++
      if (r.status !== 'success') continue
      const c = r.category
      if (!all.has(c)) all.set(c, { category: c, count: 0, amount: 0, tax: 0, total: 0 })
      const b = all.get(c)!
      b.count += 1
      const amt = r.amount || 0
      const tax = (r.taxAmount as number | undefined) || 0
      const gross = (r.totalAmount as number | undefined) || amt
      b.amount += amt
      b.tax += tax
      b.total += gross
      totalAmt += amt
      totalTax += tax
      totalGross += gross
    }
    const list: CategoryBucket[] = Array.from(all.values()).map((b) => ({
      ...b,
      percent: totalGross > 0 ? (b.total / totalGross) * 100 : 0,
    }))
    list.sort((a, b) => b.total - a.total)
    return {
      buckets: list,
      totalAmt,
      totalTax,
      totalGross,
      successCount,
      totalCount: invoices.length,
    }
  }, [invoices])

  const fmt = (n: number) => (isFinite(n) ? n : 0).toFixed(precision)

  return (
    <div className="space-y-4">
      {/* KPI 卡片组 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<FileText className="w-4 h-4" />}
          label="发票张数"
          value={`${successCount} / ${totalCount}`}
          sub={totalCount - successCount > 0 ? `含 ${totalCount - successCount} 张未成功` : '全部识别成功'}
          tone="sky"
          warn={totalCount - successCount > 0}
        />
        <KpiCard
          icon={<CircleDollarSign className="w-4 h-4" />}
          label="金额合计(¥)"
          value={fmt(totalAmt)}
          sub="不含税金额"
          tone="indigo"
        />
        <KpiCard
          icon={<BadgePercent className="w-4 h-4" />}
          label="税额合计(¥)"
          value={fmt(totalTax)}
          sub={`平均税率 ${totalAmt > 0 ? ((totalTax / totalAmt) * 100).toFixed(1) : '0.0'}%`}
          tone="amber"
        />
        <KpiCard
          icon={<Wallet className="w-4 h-4" />}
          label="价税合计(¥)"
          value={fmt(totalGross)}
          sub={failedCount > 0 ? `⚠ ${failedCount} 张识别失败` : '可用于报销单申报'}
          tone="emerald"
          warn={failedCount > 0}
        />
      </div>

      {/* 分类汇总：饼图 + 明细表 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <PieIcon className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">类别占比（按价税合计）</h3>
          </div>
          {buckets.length === 0 ? (
            <div className="h-[240px] rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700">
              暂无识别成功的发票 — 上传后这里会自动分类统计
            </div>
          ) : (
            <div className="flex items-center gap-4 flex-wrap">
              <DonutChart buckets={buckets} />
              <ul className="space-y-1.5 min-w-[180px] flex-1">
                {buckets.map((b) => (
                  <li key={b.category} className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: getColor(b.category) }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {CATEGORY_LABEL[b.category]}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <span className="tabular-nums font-medium text-slate-800 dark:text-slate-100">
                        {b.percent.toFixed(1)}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-brand-600" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">分类明细表</h3>
          </div>
          {buckets.length === 0 ? (
            <div className="h-[240px] rounded-lg bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-700">
              分类明细会在识别成功后自动生成
            </div>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left font-semibold px-3 py-2.5">类别</th>
                    <th className="text-right font-semibold px-3 py-2.5">张数</th>
                    <th className="text-right font-semibold px-3 py-2.5">金额(¥)</th>
                    <th className="text-right font-semibold px-3 py-2.5">税额(¥)</th>
                    <th className="text-right font-semibold px-3 py-2.5">价税合计(¥)</th>
                    <th className="px-3 py-2.5 w-[140px]">占比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {buckets.map((b) => (
                    <tr key={b.category} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: getColor(b.category) }}
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {CATEGORY_LABEL[b.category]}
                          </span>
                        </span>
                      </td>
                      <td align="right" className="px-3 py-2.5 tabular-nums">{b.count}</td>
                      <td align="right" className="px-3 py-2.5 tabular-nums">{fmt(b.amount)}</td>
                      <td align="right" className="px-3 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">{fmt(b.tax)}</td>
                      <td align="right" className="px-3 py-2.5 tabular-nums font-semibold text-slate-900 dark:text-slate-50">{fmt(b.total)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max(0, Math.min(100, b.percent))}%`,
                                backgroundColor: getColor(b.category),
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums w-[46px] text-right">
                            {b.percent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100">
                    <td className="px-3 py-3">合计</td>
                    <td align="right" className="px-3 py-3 tabular-nums">{successCount}</td>
                    <td align="right" className="px-3 py-3 tabular-nums">{fmt(totalAmt)}</td>
                    <td align="right" className="px-3 py-3 tabular-nums text-slate-500 dark:text-slate-300">{fmt(totalTax)}</td>
                    <td align="right" className="px-3 py-3 tabular-nums text-brand-700 dark:text-brand-300">{fmt(totalGross)}</td>
                    <td className="px-3 py-3">100.0%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- 小组件：KPI 卡片 ---------- */
function KpiCard(props: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone: 'sky' | 'indigo' | 'amber' | 'emerald'
  warn?: boolean
}) {
  const toneMap: Record<string, string> = {
    sky: 'from-sky-500 to-sky-600',
    indigo: 'from-indigo-500 to-indigo-600',
    amber: 'from-amber-500 to-amber-600',
    emerald: 'from-emerald-500 to-emerald-600',
  }
  return (
    <div className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 relative overflow-hidden ${props.warn ? 'ring-1 ring-red-200 dark:ring-red-800/60' : ''}`}>
      <div
        className={`absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10 bg-gradient-to-br ${toneMap[props.tone]}`}
      />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <span
              className={`inline-flex p-1 rounded-md bg-gradient-to-br text-white ${toneMap[props.tone]}`}
            >
              {props.icon}
            </span>
            {props.label}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50 break-all">
            {props.value}
          </div>
          {props.sub && (
            <div className={`mt-1 text-xs ${props.warn ? 'inline-flex items-center gap-1 text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}`}>
              {props.warn && <AlertTriangle className="w-3 h-3" />}
              {props.sub}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------- 小组件：Donut 饼图（纯 SVG，不依赖库）---------- */
function DonutChart({ buckets }: { buckets: CategoryBucket[] }) {
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const r = 72
  const innerR = 46
  // 角度：从 -90° 开始顺时针
  let angleStart = -Math.PI / 2
  const total = buckets.reduce((s, b) => s + b.total, 0) || 1
  const arcs = buckets.map((b) => {
    const span = (b.total / total) * Math.PI * 2
    const a0 = angleStart
    const a1 = angleStart + span
    angleStart = a1
    return {
      color: getColor(b.category),
      path: arcPath(cx, cy, r, innerR, a0, a1),
      category: b.category,
    }
  })
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0 w-[220px] h-[220px]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="hsl(var(--border))" strokeDasharray="2 4" opacity={0.6} />
        {arcs.map((a, i) => (
          <path
            key={i}
            d={a.path}
            fill={a.color}
            stroke="#fff"
            strokeWidth={1.5}
            className="transition-opacity hover:opacity-90"
          >
            <title>{`${CATEGORY_LABEL[a.category]}: ${buckets[i].total.toFixed(2)} 元 (${buckets[i].percent.toFixed(1)}%)`}</title>
          </path>
        ))}
        <circle cx={cx} cy={cy} r={innerR} fill="white" />
        <g>
          <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-400" fontSize={10}>
            价税合计
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize={18} fontWeight={700}>
            ¥{(total).toFixed(0)}
          </text>
        </g>
      </svg>
    </div>
  )
}

function arcPath(cx: number, cy: number, r: number, innerR: number, a0: number, a1: number): string {
  // 小于 0.5 度时跳过
  if (Math.abs(a1 - a0) < 1e-3) return ''
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const xi0 = cx + innerR * Math.cos(a1)
  const yi0 = cy + innerR * Math.sin(a1)
  const xi1 = cx + innerR * Math.cos(a0)
  const yi1 = cy + innerR * Math.sin(a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return [
    `M ${x0.toFixed(3)} ${y0.toFixed(3)}`,
    `A ${r} ${r} 0 ${large} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`,
    `L ${xi0.toFixed(3)} ${yi0.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${xi1.toFixed(3)} ${yi1.toFixed(3)}`,
    'Z',
  ].join(' ')
}

/* 占位，避免 TS 未使用误报（re-export 方便外部） */
export type { ExpenseCategory, OcrInvoice, NormalizedOcrResult }
