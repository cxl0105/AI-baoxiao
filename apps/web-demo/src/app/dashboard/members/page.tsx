'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import {
  Users,
  Search,
  Filter,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  Save,
  Building2,
  UserCircle,
  UserPlus,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  CalendarDays,
  ShieldAlert,
  BadgeCheck,
  Crown,
  UserCog,
  Award,
} from 'lucide-react'

const DEPARTMENTS = ['研发部', '产品部', '市场部', '销售部', '财务部', '人力资源部', '运营部', '行政部'] as const
type Department = (typeof DEPARTMENTS)[number]

const ROLES = [
  { value: 'employee', label: '员工', icon: UserCircle, color: 'slate' },
  { value: 'manager', label: '部门经理', icon: UserCog, color: 'sky' },
  { value: 'finance', label: '财务', icon: BadgeCheck, color: 'emerald' },
  { value: 'gm', label: '总经理', icon: Award, color: 'orange' },
  { value: 'admin', label: '系统管理员', icon: Crown, color: 'amber' },
] as const
type MemberRole = 'admin' | 'gm' | 'finance' | 'manager' | 'employee'

interface Member {
  id: string
  name: string
  email: string
  phone: string
  department: Department
  role: MemberRole
  status: 'active' | 'disabled'
  onboardDate: string
  joinedAt: string
  avatarColor: string
}

// 确定性伪随机：基于索引映射，确保 SSR/客户端输出一致，避免 hydration mismatch
function pickFrom<T>(arr: readonly T[], seed: number): T {
  return arr[seed % arr.length]
}
const AVATAR_COLORS = [
  'from-brand-400 to-brand-600',
  'from-indigo-400 to-indigo-600',
  'from-emerald-400 to-emerald-600',
  'from-amber-400 to-amber-600',
  'from-pink-400 to-pink-600',
  'from-sky-400 to-sky-600',
  'from-violet-400 to-violet-600',
]

// 固定锚点日期，避免 SSR/客户端因 Date() 产生差
const ANCHOR = '2026-08-08'
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

const SEED_NAMES = [
  '张伟', '王芳', '李娜', '刘洋', '陈静', '杨帆', '赵磊', '黄敏',
  '周杰', '吴强', '徐丽', '孙浩', '马超', '朱琳', '胡军', '郭颖',
  '何平', '高飞', '林涛', '罗兰', '郑凯', '梁雪', '谢涛', '宋佳',
  '唐宇', '韩露', '冯健', '董洁', '萧风', '程璐', '曹阳', '袁泉',
]

const NAME_PINYIN: Record<string, string> = {
  张伟: 'zhangwei', 王芳: 'wangfang', 李娜: 'lina', 刘洋: 'liuyang',
  陈静: 'chenjing', 杨帆: 'yangfan', 赵磊: 'zhaolei', 黄敏: 'huangmin',
  周杰: 'zhoujie', 吴强: 'wuqiang', 徐丽: 'xuli', 孙浩: 'sunhao',
  马超: 'machao', 朱琳: 'zhulin', 胡军: 'hujun', 郭颖: 'guoying',
  何平: 'heping', 高飞: 'gaofei', 林涛: 'lintao', 罗兰: 'luolan',
  郑凯: 'zhengkai', 梁雪: 'liangxue', 谢涛: 'xietao', 宋佳: 'songjia',
  唐宇: 'tangyu', 韩露: 'hanlu', 冯健: 'fengjian', 董洁: 'dongjie',
  萧风: 'xiaofeng', 程璐: 'chenglu', 曹阳: 'caoyang', 袁泉: 'yuanquan',
}

function makeMockMembers(n = 24): Member[] {
  return SEED_NAMES.slice(0, n).map((name, i) => ({
    id: `mem_${1001 + i}`,
    name,
    email: `${NAME_PINYIN[name] || 'user'}${1000 + i}@company.com`,
    phone: `138${String(10000000 + ((i * 137 + 19) % 90_000_000)).padStart(8, '0')}`,
    department: pickFrom(DEPARTMENTS, i * 7 + 3),
    role:
      i % 7 === 0 ? 'admin'
      : i % 3 === 0 ? 'finance'
      : 'employee',
    status: i % 11 === 0 ? 'disabled' : 'active',
    onboardDate: addDays(ANCHOR, -(30 + i * 17)),
    joinedAt: addDays(ANCHOR, -(i * 7 + 1)),
    avatarColor: pickFrom(AVATAR_COLORS, i * 3 + 1),
  }))
}

function roleMeta(v: MemberRole) {
  return ROLES.find((r) => r.value === v)!
}
function RoleBadge({ role }: { role: MemberRole }) {
  const m = roleMeta(role)
  const Icon = m.icon
  const colorMap: Record<string, string> = {
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700',
    indigo: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/50',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/50',
    amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/50',
    pink: 'bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 border-pink-200/60 dark:border-pink-800/50',
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-800/50',
    sky: 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-800/50',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${colorMap[m.color]}`}>
      <Icon className="w-3 h-3" />
      {m.label}
    </span>
  )
}
function StatusBadge({ s }: { s: Member['status'] }) {
  if (s === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        启用
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      禁用
    </span>
  )
}

export default function MembersPage() {
  // 惰性初始化（SSR/客户端同种子 → 字节一致 → 无 hydrate mismatch）
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dept, setDept] = useState<string>('all')
  const [role, setRole] = useState<string>('all')
  const [status, setStatus] = useState<'all' | Member['status']>('all')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const pageSize = 10

  // 加载成员列表（提取为 useCallback，供列表刷新/审批后复用）
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await api.listMembers()
      // 将后端返回的数据映射为前端 Member 类型
      const mapped: Member[] = result.list.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        phone: u.phone || '',
        department: u.department || '未分配',
        role: u.role,
        status: u.status || 'active',
        onboardDate: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        joinedAt: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        avatarColor: AVATAR_COLORS[Math.abs(u.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length],
      }))
      setMembers(mapped)
    } catch (err) {
      console.error('加载成员列表失败:', err)
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])


  const [showEditor, setShowEditor] = useState(false)
  const [editing, setEditing] = useState<Partial<Member> | null>(null)
  const [resetPwd, setResetPwd] = useState('')

  // 待审批注册申请
  const [pendingList, setPendingList] = useState<Array<{ id: string; name: string; email: string; phone: string; department: string; role: string; createdAt: string }>>([])
  const [showPending, setShowPending] = useState(false)
  const [pendingLoading, setPendingLoading] = useState(false)
  const loadPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const res = await api.listPendingMembers()
      setPendingList(res.list || [])
    } catch {
      // 无审批权限时后端返回 403，静默清空
      setPendingList([])
    } finally {
      setPendingLoading(false)
    }
  }, [])

  // 初次挂载：拉取成员列表 + 待审批注册申请
  useEffect(() => {
    loadMembers()
    loadPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase()
    return members.filter((m) => {
      if (dept !== 'all' && m.department !== dept) return false
      if (role !== 'all' && m.role !== role) return false
      if (status !== 'all' && m.status !== status) return false
      if (!kw) return true
      return (
        m.name.toLowerCase().includes(kw) ||
        m.email.toLowerCase().includes(kw) ||
        m.phone.includes(kw) ||
        m.department.toLowerCase().includes(kw)
      )
    })
  }, [members, search, dept, role, status])

  const stats = useMemo(() => {
    const total = members.length
    const active = members.filter((m) => m.status === 'active').length
    const disabled = total - active
    const depts = new Set(members.map((m) => m.department)).size
    const roles = new Set(members.map((m) => m.role)).size
    return { total, active, disabled, depts, roles }
  }, [members])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const curr = Math.min(page, totalPages)
  const pageRows = filtered.slice((curr - 1) * pageSize, curr * pageSize)

  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const toggleAll = () => {
    const ids = pageRows.map((r) => r.id)
    setSelected((s) => {
      if (ids.every((i) => s.has(i))) {
        const n = new Set(s)
        ids.forEach((i) => n.delete(i))
        return n
      } else {
        const n = new Set(s)
        ids.forEach((i) => n.add(i))
        return n
      }
    })
  }
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))

  const handleApprove = async (id: string) => {
    try {
      await api.approveMember(id)
      await loadPending()
      await loadMembers()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }
  const handleReject = async (id: string) => {
    if (!confirm('确认拒绝该注册申请？拒绝后将删除该记录。')) return
    try {
      await api.rejectMember(id)
      await loadPending()
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  const applyStatus = async (target: Member['status']) => {
    const ids = Array.from(selected)
    if (!ids.length) return

    try {
      // 批量更新
      await Promise.all(ids.map(id => api.updateMember(id, { status: target } as any)))
      // 刷新列表
      const result = await api.listMembers()
      const mapped: Member[] = result.list.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        phone: u.phone || '',
        department: u.department || '未分配',
        role: u.role,
        status: u.status || 'active',
        onboardDate: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        joinedAt: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        avatarColor: AVATAR_COLORS[Math.abs(u.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length],
      }))
      setMembers(mapped)
      setSelected(new Set())
    } catch (err) {
      alert('更新状态失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }
  const removeSelected = async () => {
    const ids = Array.from(selected)
    if (!ids.length) return
    if (!confirm(`确定删除选中的 ${ids.length} 位成员？`)) return

    try {
      await Promise.all(ids.map(id => api.deleteMember(id)))
      // 刷新列表
      const result = await api.listMembers()
      const mapped: Member[] = result.list.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        phone: u.phone || '',
        department: u.department || '未分配',
        role: u.role,
        status: u.status || 'active',
        onboardDate: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        joinedAt: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        avatarColor: AVATAR_COLORS[Math.abs(u.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length],
      }))
      setMembers(mapped)
      setSelected(new Set())
    } catch (err) {
      alert('删除失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }
  const toggleSingleStatus = async (id: string) => {
    const member = members.find(m => m.id === id)
    if (!member) return

    const newStatus = member.status === 'active' ? 'disabled' : 'active'
    try {
      await api.updateMember(id, { status: newStatus } as any)
      setMembers((ms) =>
        ms.map((m) => (m.id === id ? { ...m, status: newStatus } : m))
      )
    } catch (err) {
      alert('更新状态失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const openEditor = (m?: Member) => {
    setResetPwd('')
    setEditing(
      m ?? {
        id: '',
        name: '',
        email: '',
        phone: '',
        department: DEPARTMENTS[0],
        role: 'employee',
        status: 'active',
        onboardDate: new Date().toISOString().slice(0, 10),
      }
    )
    setShowEditor(true)
  }
  const submitEditor = async () => {
    if (!editing) return
    if (!editing.name || !editing.phone) {
      alert('请至少填写 姓名 和 手机号')
      return
    }

    try {
      if (editing.id) {
        // 更新
        const patch: any = {
          name: editing.name,
          email: editing.email,
          phone: editing.phone,
          role: editing.role,
          department: editing.department,
        }
        if (resetPwd.trim()) patch.password = resetPwd.trim()
        await api.updateMember(editing.id, patch)
      } else {
        // 创建
        await api.createMember({
          name: editing.name,
          email: editing.email,
          phone: editing.phone,
          role: editing.role,
          department: editing.department,
          password: '123456', // 默认密码
        })
      }

      // 刷新列表
      const result = await api.listMembers()
      const mapped: Member[] = result.list.map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        phone: u.phone || '',
        department: u.department || '未分配',
        role: u.role,
        status: u.status || 'active',
        onboardDate: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        joinedAt: u.createdAt ? u.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
        avatarColor: AVATAR_COLORS[Math.abs(u.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0)) % AVATAR_COLORS.length],
      }))
      setMembers(mapped)
      setShowEditor(false)
      setEditing(null)
    } catch (err) {
      alert((editing.id ? '更新' : '创建') + '失败: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* 顶部标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-violet-600 flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            成员管理
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            管理公司/单位的全部用户账号、角色权限、部门归属与启用状态
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowPending((v) => !v); if (!showPending) loadPending() }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors border ${
              showPending
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            待审批
            {pendingList.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold bg-red-500 text-white">
                {pendingList.length}
              </span>
            )}
          </button>
          <button
            onClick={() => openEditor()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors shadow-lg shadow-brand-600/20"
          >
            <Plus className="w-4 h-4" />
            添加成员
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="总成员" value={stats.total} tone="sky" icon={<Users className="w-4 h-4" />} sub={`${stats.active} 名在职`} />
        <Kpi label="已启用账号" value={stats.active} tone="emerald" icon={<UserCheck className="w-4 h-4" />} sub={`${Math.round((stats.active / (stats.total || 1)) * 100)}% 启用率`} />
        <Kpi label="已禁用账号" value={stats.disabled} tone="amber" icon={<UserX className="w-4 h-4" />} sub="可随时解除禁用" />
        <Kpi label="部门数量" value={stats.depts} tone="violet" icon={<Building2 className="w-4 h-4" />} sub={`${stats.roles} 种角色权限`} />
      </div>

      {/* 待审批视图 */}
      {showPending && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-500" />
              待审批的注册申请（{pendingList.length}）
            </h2>
            <span className="text-xs text-slate-400">部门经理仅可审批本部门员工</span>
          </div>
          {pendingLoading ? (
            <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
          ) : pendingList.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">暂无待审批的注册申请</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingList.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.phone}</span>
                      <span className="text-xs text-slate-400">{p.email}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      申请加入部门：<b>{p.department || '未分配'}</b> · 申请时间 {p.createdAt ? p.createdAt.slice(0, 10) : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(p.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      通过
                    </button>
                    <button
                      onClick={() => handleReject(p.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 过滤栏 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="搜索 姓名 / 邮箱 / 手机 / 部门"
            className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none"
          />
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={dept}
            onChange={(e) => {
              setDept(e.target.value)
              setPage(1)
            }}
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 pr-1"
          >
            <option value="all">全部部门</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(1)
            }}
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 pr-1"
          >
            <option value="all">全部角色</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as any)
              setPage(1)
            }}
            className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200"
          >
            <option value="all">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">禁用</option>
          </select>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => applyStatus('active')}
            disabled={!selected.size}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserCheck className="w-3.5 h-3.5" />
            批量启用{selected.size ? `(${selected.size})` : ''}
          </button>
          <button
            onClick={() => applyStatus('disabled')}
            disabled={!selected.size}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserX className="w-3.5 h-3.5" />
            批量禁用{selected.size ? `(${selected.size})` : ''}
          </button>
          <button
            onClick={removeSelected}
            disabled={!selected.size}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" />
            批量删除
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-12 px-4 py-3 text-left">
                  <input type="checkbox" checked={allOnPage} onChange={toggleAll} className="accent-brand-600" />
                </th>
                <th className="px-4 py-3 text-left font-semibold">成员</th>
                <th className="px-4 py-3 text-left font-semibold">部门</th>
                <th className="px-4 py-3 text-left font-semibold">角色</th>
                <th className="px-4 py-3 text-left font-semibold">联系方式</th>
                <th className="px-4 py-3 text-left font-semibold">入职日期</th>
                <th className="px-4 py-3 text-left font-semibold">加入系统</th>
                <th className="px-4 py-3 text-left font-semibold">状态</th>
                <th className="px-4 py-3 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-slate-400 dark:text-slate-500">
                    没有匹配的成员 — 换个搜索条件，或点击「添加成员」新建一位 🧑‍💻
                  </td>
                </tr>
              )}
              {pageRows.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} className="accent-brand-600" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold bg-gradient-to-br ${m.avatarColor}`}>
                        {m.name?.charAt(0) || 'U'}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 dark:text-white truncate">{m.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate inline-flex items-center gap-1">
                          <Mail className="w-3 h-3" />{m.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <Building2 className="w-3 h-3 text-slate-400" />
                      {m.department}
                    </span>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <Mail className="w-3 h-3 text-slate-400" />{m.email}
                      </div>
                      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <Phone className="w-3 h-3 text-slate-400" />{m.phone || '未填写'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                      <CalendarDays className="w-3 h-3 text-slate-400" />{m.onboardDate}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">{m.joinedAt}</td>
                  <td className="px-4 py-3"><StatusBadge s={m.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEditor(m)}
                        title="编辑资料"
                        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => toggleSingleStatus(m.id)}
                        title={m.status === 'active' ? '禁用账号' : '启用账号'}
                        className={`p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          m.status === 'active'
                            ? 'text-slate-500 hover:text-amber-600 dark:hover:text-amber-400'
                            : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
                        }`}
                      >
                        {m.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`确定删除成员「${m.name}」？删除后将同时清除数据库与本地数据，不可恢复。`)) {
                            void (async () => {
                              try {
                                await api.deleteMember(m.id)
                                await loadMembers()
                              } catch (err) {
                                alert('删除失败: ' + (err instanceof Error ? err.message : String(err)))
                              }
                            })()
                          }
                        }}
                        title="删除成员"
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-500 hover:text-red-600 dark:hover:text-red-300"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 分页 */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-sm">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            共 <b className="text-slate-700 dark:text-slate-200">{filtered.length}</b> 位匹配成员，
            当前第 <b className="text-slate-700 dark:text-slate-200">{curr}</b> / {totalPages} 页
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={curr <= 1}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1
              const show = Math.abs(p - curr) <= 1 || p === 1 || p === totalPages
              if (!show) return null
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`min-w-[32px] h-8 px-2 rounded-md text-xs font-medium ${
                    p === curr
                      ? 'bg-brand-600 text-white shadow shadow-brand-600/20'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={curr >= totalPages}
              className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 新建 / 编辑 弹窗 */}
      {showEditor && editing && (
        <MemberEditor
          editing={editing}
          setEditing={setEditing}
          resetPwd={resetPwd}
          setResetPwd={setResetPwd}
          onClose={() => {
            setShowEditor(false)
            setEditing(null)
          }}
          onSubmit={submitEditor}
        />
      )}
    </div>
  )
}

function Kpi({
  label, value, tone, icon, sub,
}: {
  label: string; value: number; tone: 'sky' | 'emerald' | 'amber' | 'violet'; icon: React.ReactNode; sub?: string;
}) {
  const m: Record<string, string> = {
    sky: 'from-sky-500 to-cyan-500',
    emerald: 'from-emerald-500 to-teal-500',
    amber: 'from-amber-500 to-orange-500',
    violet: 'from-violet-500 to-fuchsia-500',
  }
  return (
    <div className="relative overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
      <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${m[tone]} opacity-10`} />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{value}</div>
          {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</div>}
        </div>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${m[tone]} text-white shadow`}>{icon}</div>
      </div>
    </div>
  )
}

function MemberEditor({
  editing, setEditing, onClose, onSubmit, resetPwd, setResetPwd,
}: {
  editing: Partial<Member>
  setEditing: (m: Partial<Member> | null) => void
  onClose: () => void
  onSubmit: () => void
  resetPwd: string
  setResetPwd: (v: string) => void
}) {
  const isNew = !editing.id
  const field = (k: keyof Member) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditing({ ...editing, [k]: e.target.value } as any)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{isNew ? '添加新成员' : '编辑成员信息'}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isNew ? '系统会自动为新成员生成账号，可通过邮件进行初始登录' : '修改后将立即同步到权限和审批流规则'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="姓名" required>
              <input
                className={inputCls}
                value={editing.name || ''}
                placeholder="如：张三"
                onChange={field('name')}
              />
            </Field>
            <Field label="邮箱" required>
              <input
                className={inputCls}
                value={editing.email || ''}
                placeholder="name@company.com"
                onChange={field('email')}
              />
            </Field>
            <Field label="手机号码">
              <input
                className={inputCls}
                value={editing.phone || ''}
                placeholder="138 开头手机号"
                onChange={field('phone')}
              />
            </Field>
            <Field label="入职日期">
              <input type="date" className={inputCls} value={editing.onboardDate || ''} onChange={field('onboardDate')} />
            </Field>
            <Field label="所属部门" required>
              <select className={inputCls} value={editing.department || DEPARTMENTS[0]} onChange={field('department')}>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="角色权限" required>
              <select className={inputCls} value={editing.role || 'employee'} onChange={field('role')}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="账号状态">
              <select
                className={inputCls}
                value={editing.status || 'active'}
                onChange={(e) => setEditing({ ...editing, status: e.target.value as any })}
              >
                <option value="active">启用（可登录）</option>
                <option value="disabled">禁用（不可登录）</option>
              </select>
            </Field>
            {!isNew && (
              <Field label="重置密码（留空则不变）">
                <input
                  type="text"
                  className={inputCls}
                  value={resetPwd}
                  placeholder="输入新密码（至少 6 位）"
                  onChange={(e) => setResetPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            )}
            <Field label="工号（选填）">
              <input className={inputCls} placeholder="如：EMP-0001" disabled defaultValue="" />
            </Field>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50/70 dark:bg-slate-800/40">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700">
            取消
          </button>
          <button
            onClick={onSubmit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow shadow-brand-600/20"
          >
            <Save className="w-4 h-4" />
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

const inputCls = [
  'w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg',
  'focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100',
].join(' ')

function Field(props: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
        {props.label}
        {props.required && <span className="text-red-500">*</span>}
      </div>
      {props.children}
    </label>
  )
}
