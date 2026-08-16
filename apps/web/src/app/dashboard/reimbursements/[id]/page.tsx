'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Printer,
  Download,
  Share2,
  Pencil,
  Trash2,
  Undo2,
  DollarSign,
  FileText,
  Calendar,
  Building2,
  User,
  Copy,
  Eye,
  Send,
  Ban,
  Plus,
  ChevronRight,
  ShieldCheck,
  ScanSearch,
  ChevronDown,
  Info as InfoIcon,
} from 'lucide-react'
import {
  generateMockList,
  listItemToDetail,
  STATUS_META,
  TYPE_LABEL,
  type ReimbursementDetail,
  type ApprovalStep,
} from '@/lib/reimbursements'
import type { ExpenseCategory } from '@/lib/api'
import { runAudit, type AuditResult, type AuditCheckItem } from '@/lib/audit-engine'
import { useSubmittedStore } from '@/lib/submitted-store'

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  travel: '差旅住宿', transport: '交通出行', meal: '餐饮',
  office: '办公用品', communication: '通讯', entertainment: '招待/客户',
  training: '培训', other: '其他',
}

export default function ReimbursementDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [showRevoke, setShowRevoke] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectText, setRejectText] = useState('')
  const [revokeText, setRevokeText] = useState('')
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [showDelegate, setShowDelegate] = useState(false)
  const [delegateTo, setDelegateTo] = useState('')
  const [previewAttachment, setPreviewAttachment] = useState<ReimbursementDetail['attachmentUrls'][number] | null>(null)
  const [isProcessing, setIsProcessing] = useState<null | 'approve' | 'reject' | 'revoke' | 'delegate' | 'pay'>(null)

  // 根据路由 id 找对应 mock 数据；找不到就取第一条做 fallback 方便演示
  const submittedList = useSubmittedStore((s) => s.list)
  const detail = useMemo<ReimbursementDetail>(() => {
    const all = generateMockList(60)
    const found = all.find((r) => r.id === params.id) || all[0]
    const d = listItemToDetail(found)
    const submitted = submittedList.find((x) => x.id === params.id)
    if (submitted && submitted.invoices.length > 0) {
      return {
        ...d,
        title: submitted.title || d.title,
        code: submitted.code || d.code,
        invoiceCount: submitted.invoices.length,
        attachmentUrls: submitted.invoices.map((inv) => ({ name: inv.name, size: inv.size, thumbnail: inv.dataUrl || undefined, url: inv.dataUrl || '#' })),
      }
    }
    return d
  }, [params.id, submittedList])

  const statusMeta = STATUS_META[detail.status]

  // 智能审核结果
  const auditResult = useMemo<AuditResult>(() => {
    return runAudit({ detail })
  }, [detail])

  // --- 状态动作（UI 模拟即可） ---
  const doAction = async (
    kind: 'approve' | 'reject' | 'revoke' | 'delegate' | 'pay',
    comment?: string
  ) => {
    setIsProcessing(kind)
    await new Promise((r) => setTimeout(r, 900))
    setIsProcessing(null)
    const msgs: Record<string, string> = {
      approve: '审批通过，已流转到下一节点',
      reject: `已驳回：${comment || '原因未填写'}`,
      revoke: `已撤销申请：${comment || '未填写原因'}`,
      delegate: `已加签 / 转交审批人：${comment || delegateTo}`,
      pay: '已完成付款，状态已更新',
    }
    setToast({ kind: 'success', text: msgs[kind] })
    setShowRevoke(false); setShowReject(false); setShowDelegate(false)
    setTimeout(() => setToast(null), 2800)
  }

  const copyId = () => {
    if (typeof navigator !== 'undefined') navigator.clipboard?.writeText(detail.code)
    setToast({ kind: 'success', text: `报销单号 ${detail.code} 已复制` })
    setTimeout(() => setToast(null), 2200)
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* 顶部导航栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard/reimbursements"
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white truncate">
              {detail.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <button onClick={copyId} className="inline-flex items-center gap-1 hover:text-brand-600 dark:hover:text-brand-400">
                <FileText className="w-3 h-3" /> 单号：
                <span className="font-mono">{detail.code}</span>
                <Copy className="w-3 h-3" />
              </button>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 创建于 {detail.createdAt}
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {detail.department}
              </span>
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" /> {detail.submitter}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Printer className="w-4 h-4" /> 打印
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Download className="w-4 h-4" /> 导出 PDF
          </button>
          <button className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <Share2 className="w-4 h-4" /> 分享
          </button>
          {detail.canModify && (
            <button
              onClick={() => router.push('/dashboard/reimbursements/new')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
            >
              <Pencil className="w-4 h-4" /> 继续编辑
            </button>
          )}
          {detail.canRevoke && (
            <button
              onClick={() => setShowRevoke(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <Undo2 className="w-4 h-4" /> 撤销申请
            </button>
          )}
          {detail.canPay && (
            <button
              onClick={() => void doAction('pay')}
              disabled={isProcessing === 'pay'}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl text-white bg-green-600 hover:bg-green-700 shadow shadow-green-600/20 disabled:opacity-60 transition-colors"
            >
              <DollarSign className="w-4 h-4" />
              {isProcessing === 'pay' ? '付款处理中...' : '标记已付款'}
            </button>
          )}
          {detail.canDelete && (
            <button
              className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="删除"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 主内容 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 左：详情主体 */}
        <div className="lg:col-span-2 space-y-5">
          {/* 状态总览卡片 */}
          <StatusCard detail={detail} statusLabel={statusMeta.label} tone={statusMeta.tone} />

          {/* 基本信息 */}
          <Section title="基本信息" icon={<FileText className="w-4 h-4" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <Info label="报销类型">{TYPE_LABEL[detail.type] || detail.type}</Info>
              <Info label="报销单号">
                <button onClick={copyId} className="inline-flex items-center gap-1 font-mono hover:text-brand-600 dark:hover:text-brand-400">
                  {detail.code} <Copy className="w-3 h-3 text-slate-400" />
                </button>
              </Info>
              <Info label="提交人">{detail.submitter}（{detail.department}）</Info>
              <Info label="当前审批人">{detail.approver}</Info>
              <Info label="费用期间">
                {detail.startDate} ~ {detail.endDate}
              </Info>
              <Info label="提交时间">{detail.createdAt}</Info>
              <Info label="事由说明" span={2}>
                {detail.description}
              </Info>
            </div>
          </Section>

          {/* 费用明细 */}
          <Section
            title="费用明细"
            subtitle={`共 ${detail.items.length} 项 · 合计 ¥ ${detail.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`}
            icon={<FileText className="w-4 h-4" />}
          >
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40">
                    <th className="px-4 py-2.5 text-left font-medium w-[20%]">日期</th>
                    <th className="px-4 py-2.5 text-left font-medium w-[18%]">类别</th>
                    <th className="px-4 py-2.5 text-left font-medium">说明</th>
                    <th className="px-4 py-2.5 text-right font-medium w-[18%]">金额</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.items.map((it, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{it.date}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-md">
                          {CATEGORY_LABEL[it.category] || it.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{it.description}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        ¥ {it.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-slate-800/40 font-bold">
                    <td colSpan={3} className="px-4 py-3 text-right text-slate-700 dark:text-slate-200">合计</td>
                    <td className="px-4 py-3 text-right text-brand-600 dark:text-brand-400">
                      ¥ {detail.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* 智能审核结果 */}
          <AuditPanel result={auditResult} />

          {/* 附件 / 发票 */}
          <Section
            title="原始票据与附件"
            subtitle={`共 ${detail.invoiceCount} 份`}
            icon={<FileText className="w-4 h-4" />}
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {detail.attachmentUrls.map((a, i) => (
                <div
                  key={i}
                  className="group relative rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center relative">
                    {a.thumbnail ? (
                      <img src={a.thumbnail} alt={a.name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-8 h-8 text-slate-300 dark:text-slate-500" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setPreviewAttachment(a)} title="预览" className="p-2 rounded-lg bg-white/90 text-slate-700">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => setPreviewAttachment(a)} title="查看/下载" className="p-2 rounded-lg bg-white/90 text-slate-700">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="px-3 py-2 space-y-0.5">
                    <p className="text-xs text-slate-700 dark:text-slate-200 truncate font-medium">{a.name}</p>
                    <p className="text-[11px] text-slate-400">{a.size} KB</p>
                  </div>
                </div>
              ))}
              <button className="aspect-[4/3] rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:text-brand-600 hover:border-brand-300 dark:hover:border-brand-700 flex flex-col items-center justify-center gap-1 transition-colors">
                <Plus className="w-5 h-5" />
                <span className="text-xs">补充附件</span>
              </button>
            </div>
          </Section>

          {/* 审批时间线 */}
          <Section title="审批流转记录" icon={<Clock className="w-4 h-4" />}>
            <Timeline steps={detail.timeline} />
          </Section>
        </div>

        {/* 右：审批动作 & 下一审批人 */}
        <div className="space-y-5">
          {/* 当前流程卡片 */}
          <Section title="审批流程">
            {detail.nextApprovers.length > 0 ? (
              <div className="space-y-3">
                {detail.nextApprovers.map((n, i, arr) => (
                  <div key={n.id} className="flex items-center gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                        i === 0
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 ring-2 ring-amber-300 dark:ring-amber-700'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}>
                        {n.name.slice(0, 1)}
                      </div>
                      {i < arr.length - 1 && <div className="w-0.5 flex-1 min-h-[14px] bg-slate-200 dark:bg-slate-700" />}
                    </div>
                    <div className="flex-1 py-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{n.name}</p>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${
                          i === 0
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {i === 0 ? '待处理' : '待流转'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{n.role}</p>
                    </div>
                    {i === 0 && <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                流程已结束 / 暂无后续审批节点
              </div>
            )}
          </Section>

          {/* 审批人操作（仅在审批中，模拟「我是当前审批人」）*/}
          {detail.status === 'pending' && (
            <Section title="我的审批操作" subtitle="模拟当前登录用户为审批人场景">
              <div className="space-y-3">
                <button
                  onClick={() => void doAction('approve')}
                  disabled={!!isProcessing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-lg shadow-green-600/20 disabled:opacity-60 transition-colors"
                >
                  {isProcessing === 'approve' ? (
                    <Clock className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  同意
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={!!isProcessing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-xl border border-red-200 dark:border-red-800 disabled:opacity-60 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  驳回
                </button>
                <button
                  onClick={() => setShowDelegate(true)}
                  disabled={!!isProcessing}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-60 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  加签 / 转交他人
                </button>
              </div>
            </Section>
          )}

          {/* 金额汇总卡 */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white shadow-xl shadow-brand-600/20">
            <p className="text-xs uppercase tracking-widest text-white/60">报销总金额</p>
            <p className="mt-2 text-3xl font-bold">
              ¥ {detail.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </p>
            <div className="mt-4 pt-4 border-t border-white/15 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-white/60 text-xs">明细项</p>
                <p className="mt-0.5 font-semibold">{detail.items.length} 项</p>
              </div>
              <div>
                <p className="text-white/60 text-xs">附件数</p>
                <p className="mt-0.5 font-semibold">{detail.invoiceCount} 份</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 弹窗 ============ */}
      {showReject && (
        <ConfirmModal
          title="驳回申请"
          subtitle="请填写驳回原因，申请人将收到通知后可修改并重新提交"
          tone="danger"
          confirmLabel={isProcessing === 'reject' ? '处理中...' : '确认驳回'}
          cancelLabel="取消"
          onClose={() => !isProcessing && setShowReject(false)}
          onConfirm={() => void doAction('reject', rejectText)}
        >
          <textarea
            value={rejectText}
            onChange={(e) => setRejectText(e.target.value)}
            rows={4}
            autoFocus
            placeholder="请详细描述驳回原因，例如：票据不完整、金额与凭证不一致等"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 resize-none"
          />
        </ConfirmModal>
      )}

      {showRevoke && (
        <ConfirmModal
          title="撤销此申请？"
          subtitle="撤销后流程终止；可修改后重新发起"
          tone="warn"
          confirmLabel={isProcessing === 'revoke' ? '撤销中...' : '确认撤销'}
          cancelLabel="取消"
          onClose={() => !isProcessing && setShowRevoke(false)}
          onConfirm={() => void doAction('revoke', revokeText)}
        >
          <textarea
            value={revokeText}
            onChange={(e) => setRevokeText(e.target.value)}
            rows={3}
            autoFocus
            placeholder="撤销原因（可选）"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 resize-none"
          />
        </ConfirmModal>
      )}

      {showDelegate && (
        <ConfirmModal
          title="加签 / 转交审批"
          subtitle="选择或输入要转交的审批人，此人将作为新增审批节点介入"
          confirmLabel={isProcessing === 'delegate' ? '处理中...' : '确认转交'}
          cancelLabel="取消"
          onClose={() => !isProcessing && setShowDelegate(false)}
          onConfirm={() => void doAction('delegate', delegateTo)}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">选择审批人</span>
            <select
              value={delegateTo}
              onChange={(e) => setDelegateTo(e.target.value)}
              autoFocus
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            >
              <option value="">请选择...</option>
              {['王总监（部门负责人）', '赵财务', '陈副总（最终审批）', '张经理（跨部门协作）'].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
        </ConfirmModal>
      )}

      {previewAttachment && (
        <PreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60]">
          <div
            className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${
              toast.kind === 'success'
                ? 'text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900'
                : 'text-white bg-red-600'
            }`}
          >
            {toast.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-green-400" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {toast.text}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== 可复用小组件 =====
function Section({
  title, subtitle, icon, children,
}: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <div className="text-slate-400">{icon}</div>}
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm sm:text-base">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      </div>
      {children}
    </div>
  )
}

function Info({ label, children, span }: { label: string; children: React.ReactNode; span?: 2 }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : undefined}>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="text-slate-700 dark:text-slate-200">{children}</div>
    </div>
  )
}

function StatusCard({
  detail, statusLabel, tone,
}: { detail: ReimbursementDetail; statusLabel: string; tone: (typeof STATUS_META)[keyof typeof STATUS_META]['tone'] }) {
  const toneMap = {
    default: { dot: 'bg-slate-400', txt: 'text-slate-600 dark:text-slate-300', bar: 'from-slate-400 to-slate-300' },
    info:    { dot: 'bg-blue-500',   txt: 'text-blue-600 dark:text-blue-300',    bar: 'from-blue-500 to-sky-400' },
    warn:    { dot: 'bg-amber-500',  txt: 'text-amber-600 dark:text-amber-300',  bar: 'from-amber-500 to-orange-400' },
    success: { dot: 'bg-green-500',  txt: 'text-green-600 dark:text-green-300',  bar: 'from-green-500 to-emerald-400' },
    danger:  { dot: 'bg-red-500',    txt: 'text-red-600 dark:text-red-300',      bar: 'from-red-500 to-rose-400' },
    muted:   { dot: 'bg-slate-400',  txt: 'text-slate-500 dark:text-slate-400',  bar: 'from-slate-400 to-slate-300' },
  } as const
  const t = toneMap[tone]
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900`}>
      <div className={`h-1.5 w-full bg-gradient-to-r ${t.bar}`} />
      <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${t.dot} animate-pulse`} />
          <div>
            <p className="text-xs text-slate-400">当前状态</p>
            <p className={`mt-0.5 text-xl font-bold ${t.txt}`}>{statusLabel}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 sm:gap-8 text-sm">
          <MiniStat label="提交人" value={detail.submitter} />
          <MiniStat label="创建日期" value={detail.createdAt} />
          <MiniStat label="审批节点" value={`${detail.timeline.length} 步`} />
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  )
}

function Timeline({ steps }: { steps: ApprovalStep[] }) {
  const actionMeta: Record<ApprovalStep['action'], { icon: React.ReactNode; label: string; ring: string; iconBg: string }> = {
    submit:   { icon: <Send className="w-4 h-4" />,      label: '提交申请', ring: 'ring-brand-200 dark:ring-brand-800',   iconBg: 'bg-brand-500 text-white' },
    approve:  { icon: <CheckCircle2 className="w-4 h-4" />, label: '审批通过', ring: 'ring-green-200 dark:ring-green-800', iconBg: 'bg-green-500 text-white' },
    reject:   { icon: <XCircle className="w-4 h-4" />,      label: '驳回申请', ring: 'ring-red-200 dark:ring-red-800',     iconBg: 'bg-red-500 text-white' },
    delegate: { icon: <Send className="w-4 h-4" />,          label: '加签 / 转交', ring: 'ring-indigo-200 dark:ring-indigo-800', iconBg: 'bg-indigo-500 text-white' },
    reassign: { icon: <Send className="w-4 h-4" />,          label: '重新指定', ring: 'ring-indigo-200 dark:ring-indigo-800', iconBg: 'bg-indigo-500 text-white' },
    pending:  { icon: <Clock className="w-4 h-4" />,          label: '待处理',   ring: 'ring-amber-200 dark:ring-amber-800', iconBg: 'bg-amber-500 text-white' },
    revoke:   { icon: <Undo2 className="w-4 h-4" />,          label: '撤销申请', ring: 'ring-slate-200 dark:ring-slate-700', iconBg: 'bg-slate-500 text-white' },
    pay:      { icon: <DollarSign className="w-4 h-4" />,     label: '已付款',   ring: 'ring-blue-200 dark:ring-blue-800', iconBg: 'bg-blue-500 text-white' },
  }
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const m = actionMeta[s.action]
        const isLast = i === steps.length - 1
        return (
          <li key={s.id} className={`relative pl-12 pb-6 ${isLast ? 'pb-0' : ''}`}>
            {!isLast && (
              <span
                className={`absolute left-[18px] top-9 bottom-0 w-0.5 ${
                  s.action === 'pending'
                    ? 'border-l-2 border-dashed border-slate-200 dark:border-slate-700'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
            <div className={`absolute left-0 top-1 w-9 h-9 rounded-full ring-4 ${m.ring} ${m.iconBg} flex items-center justify-center`}>
              {m.icon}
            </div>
            <div className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{s.actor}</p>
                  <span className="text-xs text-slate-400">· {s.role}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {m.label}
                  </span>
                  {s.time && <span className="text-slate-400">{s.time}</span>}
                </div>
              </div>
              {s.comment && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  "{s.comment}"
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ===== 智能审核面板 =====
function AuditPanel({ result }: { result: AuditResult }) {
  const [expanded, setExpanded] = useState(true)
  const { summary } = result

  const overallConfig = {
    pass: { bg: 'from-green-500 to-emerald-600', icon: <CheckCircle2 className="w-5 h-5" />, label: '审核通过', ring: 'ring-green-200 dark:ring-green-800' },
    warn: { bg: 'from-amber-500 to-orange-500', icon: <AlertTriangle className="w-5 h-5" />, label: '存在警告', ring: 'ring-amber-200 dark:ring-amber-800' },
    fail: { bg: 'from-red-500 to-rose-600', icon: <XCircle className="w-5 h-5" />, label: '审核不通过', ring: 'ring-red-200 dark:ring-red-800' },
  } as const
  const cfg = overallConfig[summary.overallStatus]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* 头部：总览 */}
      <div className={`bg-gradient-to-r ${cfg.bg} px-5 sm:px-6 py-4 text-white`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <ScanSearch className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base">智能审核</h2>
              <p className="text-xs text-white/80 mt-0.5">
                共 {summary.total} 项检查 · 通过 {summary.passed} · 警告 {summary.warnings} · 不通过 {summary.failed}
                {summary.skipped > 0 && ` · 跳过 ${summary.skipped}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-white/60">审核评分</p>
              <p className="text-2xl font-bold">{summary.score}<span className="text-sm font-normal text-white/60">/100</span></p>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
              aria-label={expanded ? '收起' : '展开'}
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 逐条结果 */}
      {expanded && (
        <div className="p-4 sm:p-5 space-y-2">
          {result.items.map((item) => (
            <AuditCheckRow key={item.id} item={item} />
          ))}
          {/* 底部总结 */}
          <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-sm`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg.includes('green') ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300' : cfg.bg.includes('amber') ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300' : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300'}`}>
              {cfg.icon}
            </div>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {cfg.label}
            </span>
            <span className="text-slate-400 text-xs">
              · 审核结果仅供参考，最终以人工审批为准
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AuditCheckRow({ item }: { item: AuditCheckItem }) {
  const [showDetail, setShowDetail] = useState(false)
  const hasDetail = !!item.detail

  const statusConfig = {
    pass: { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-100 dark:border-green-900/30', label: '通过' },
    warn: { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-100 dark:border-amber-900/30', label: '警告' },
    fail: { icon: <XCircle className="w-4 h-4" />, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-100 dark:border-red-900/30', label: '不通过' },
    skip: { icon: <InfoIcon className="w-4 h-4" />, color: 'text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-100 dark:border-slate-800', label: '跳过' },
  } as const
  const cfg = statusConfig[item.status]

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => hasDetail && setShowDetail(!showDetail)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${hasDetail ? 'cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.02]' : 'cursor-default'}`}
      >
        <div className={`${cfg.color} flex-shrink-0`}>{cfg.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">{item.categoryLabel}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} font-medium`}>{cfg.label}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate">{item.message}</p>
        </div>
        {hasDetail && (
          <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showDetail ? 'rotate-180' : ''}`} />
        )}
      </button>
      {hasDetail && showDetail && (
        <div className="px-4 pb-3 pt-0">
          <pre className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap font-mono leading-relaxed pl-7">
            {item.detail}
          </pre>
        </div>
      )}
    </div>
  )
}

function ConfirmModal({
  title, subtitle, tone = 'default', confirmLabel, cancelLabel, children, onClose, onConfirm,
}: {
  title: string; subtitle?: string; tone?: 'default' | 'danger' | 'warn'
  confirmLabel: string; cancelLabel: string
  children: React.ReactNode
  onClose: () => void; onConfirm: () => void
}) {
  const confirmBtnCls =
    tone === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'
      : tone === 'warn'
      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
      : 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/20'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-semibold text-slate-900 dark:text-white">{title}</h3>
          {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        <div className="p-5">{children}</div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg ${confirmBtnCls}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}


function PreviewModal({
  attachment, onClose,
}: {
  attachment: { name: string; size: number; thumbnail?: string; url: string }
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900 dark:text-white">原始票据预览</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{attachment.name} · {attachment.size} KB</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex-shrink-0" title="关闭">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 flex items-center justify-center bg-slate-50 dark:bg-slate-800/40 min-h-[320px]">
          {attachment.thumbnail ? (
            <img src={attachment.thumbnail} alt={attachment.name} className="max-h-[62vh] max-w-full rounded-lg shadow-lg" />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 py-12">
              <FileText className="w-16 h-16 mb-3" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">{attachment.name}</p>
              <p className="text-xs mt-1 text-slate-400">演示数据 · 原始票据图片</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">关闭</button>
        </div>
      </div>
    </div>
  )
}
