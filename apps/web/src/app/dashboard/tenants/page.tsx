'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  Plus,
  Trash2,
  Search,
  Users,
  Phone,
  Hash,
  AlertTriangle,
  Clock,
  Loader2,
  X,
} from 'lucide-react'
import { api, formatApiError } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'
import { hasPermission } from '@/lib/rbac'

interface Tenant {
  id: string
  name: string
  taxNo: string
  fullName: string
  industry: string
  scale: string
  contactPhone: string
  createdAt: string
  userCount: number
  plan?: { key: string; name: string; priceLabel: string }
  admin: { name: string; phone: string } | null
}

export default function TenantsPage() {
  const { user } = useAuthStore()
  const [mounted, setMounted] = useState(false)
  const [list, setList] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  // 新增企业表单
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', taxNo: '', fullName: '', industry: '', scale: '', contactPhone: '', legalPerson: '', adminName: '', adminPhone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<null | { company: any; accounts: any[] }>(null)
  const [plans, setPlans] = useState<any[]>([])

  const canManage = hasPermission(user?.role, 'tenants:manage')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.listTenants()
      setList(res.list || [])
      api.listPlans().then((p) => setPlans(p)).catch(() => {})
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    if (canManage) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    if (!kw) return list
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(kw) ||
        (t.taxNo || '').toLowerCase().includes(kw) ||
        (t.fullName || '').toLowerCase().includes(kw)
    )
  }, [list, search])

  const submit = async () => {
    if (!form.name.trim() || !form.taxNo.trim() || !form.adminName.trim() || !form.adminPhone.trim()) {
      setError('请填写企业名称、纳税号、管理员姓名和手机号')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(form.adminPhone.trim())) {
      setError('管理员手机号格式不正确（需为 11 位大陆手机号）')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await api.createTenant({
        name: form.name.trim(),
        taxNo: form.taxNo.trim(),
        fullName: form.fullName.trim() || undefined,
        industry: form.industry.trim() || undefined,
        scale: form.scale.trim() || undefined,
        contactPhone: form.contactPhone.trim() || undefined,
        legalPerson: form.legalPerson.trim() || undefined,
        adminName: form.adminName.trim(),
        adminPhone: form.adminPhone.trim(),
      })
      setResult(res)
      setShowForm(false)
      setForm({ name: '', taxNo: '', fullName: '', industry: '', scale: '', contactPhone: '', legalPerson: '', adminName: '', adminPhone: '' })
      await load()
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const changePlan = async (t: Tenant, planKey: string) => {
    try {
      await api.setTenantPlan(t.id, planKey)
      await load()
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  const remove = async (t: Tenant) => {
    if (!confirm(`确认删除企业「${t.name}」？\n将同时删除该企业的所有账号和数据，此操作不可恢复。`)) return
    try {
      await api.deleteTenant(t.id)
      await load()
    } catch (e) {
      setError(formatApiError(e))
    }
  }

  if (!mounted) return null

  if (!canManage) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">无权访问</h2>
        <p className="text-slate-500 dark:text-slate-400">仅平台管理员可管理企业（租户）。</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-12">
      {/* 顶部 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-brand-600" />
            企业管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            按纳税号管理企业租户，新增企业时自动生成管理员/总经理/财务/部门经理账号
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setResult(null) }}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-lg shadow-brand-600/20"
        >
          <Plus className="w-4 h-4" /> 新增企业
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* 搜索结果统计 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索企业名称 / 纳税号"
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
          />
        </div>
        <span className="text-sm text-slate-400">共 {filtered.length} 家企业</span>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Clock className="w-6 h-6 text-brand-500 animate-spin mr-2" />
          <span className="text-slate-500">加载企业列表...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-16 text-center">
          <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">暂无企业，点击右上角「新增企业」</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <div key={t.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate">{t.name}</h3>
                    {t.plan && (
                      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full flex-shrink-0 ${
                        t.plan.key === 'free' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        : t.plan.key === 'basic' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
                        : t.plan.key === 'pro' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                      }`}>
                        {t.plan.name}
                      </span>
                    )}
                  </div>
                  {t.fullName && <p className="text-xs text-slate-400 truncate mt-0.5">{t.fullName}</p>}
                </div>
                <button
                  onClick={() => remove(t)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="删除企业"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <p className="flex items-center gap-1.5"><Hash className="w-3.5 h-3.5" /> 纳税号：{t.taxNo || '—'}</p>
                {t.industry && <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> {t.industry} {t.scale && `· ${t.scale}`}</p>}
                {t.admin && (
                  <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> 管理员：{t.admin.name}（{t.admin.phone}）</p>
                )}
                <p className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {t.userCount} 个账号</p>
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800 mt-1.5">
                  <span className="text-slate-400">套餐：</span>
                  <select
                    value={t.plan?.key || 'free'}
                    onChange={(e) => changePlan(t, e.target.value)}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    {plans.map((p) => (
                      <option key={p.key} value={p.key}>{p.name}（{p.priceLabel}）</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增企业弹窗 */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand-600" /> 新增企业
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">企业名称 *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：XX 科技有限公司" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">纳税号 / 统一社会信用代码 *</label>
                <input value={form.taxNo} onChange={(e) => setForm({ ...form, taxNo: e.target.value })} placeholder="如：91330100MA27XXXXX" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">管理员姓名 *</label>
                  <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="如：张三" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">管理员手机号 *</label>
                  <input value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} placeholder="如：13800000001" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">行业</label>
                  <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="如：制造业" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">规模</label>
                  <input value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} placeholder="如：50-100人" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">公司全称</label>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="完整工商注册名" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">法人姓名</label>
                  <input value={form.legalPerson} onChange={(e) => setForm({ ...form, legalPerson: e.target.value })} placeholder="如：李四" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">企业联系电话</label>
                <input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="如：0571-88888888" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
              </div>
              <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
                创建后自动生成 4 个账号：企业管理员、总经理、财务专员、部门经理（密码均为 123456）。部门经理可按部门在「成员管理」中继续添加。
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">取消</button>
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                创建企业
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建结果弹窗 */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setResult(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-white">企业创建成功</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                「{result.company.name}」已创建，自动生成以下账号（密码均为 123456）：
              </p>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5 text-sm">
                {result.accounts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-200">{a.name}</span>
                    <span className="text-xs text-slate-400">{a.role} · {a.phone}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setResult(null)} className="w-full py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl">知道了</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
