'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FileText, Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, ArrowRight, Shield, Wallet, UserCircle } from 'lucide-react'
import { useAuthStore } from '@/lib/auth'
import { formatApiError } from '@/lib/api'
import { DEMO_ACCOUNTS, ROLES } from '@/lib/rbac'

// --- 表单校验规则 ---
const loginSchema = z.object({
  email: z
    .string()
    .min(1, '请输入邮箱地址')
    .email('邮箱格式不正确，请检查'),
  password: z
    .string()
    .min(1, '请输入密码')
    .min(6, '密码至少 6 个字符'),
  remember: z.boolean().default(true),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: true },
  })

  const onSubmit = async (data: LoginForm) => {
    setServerError('')
    try {
      await login(data.email, data.password)
      router.push('/dashboard')
    } catch (err) {
      setServerError(formatApiError(err))
    }
  }

  // 一键演示登录
  const quickLogin = async (email: string) => {
    setServerError('')
    try {
      // 直接用 setValue + 触发 submit 太复杂，这里直接调 login
      await login(email, '123456')
      router.push('/dashboard')
    } catch (err) {
      setServerError(formatApiError(err))
    }
  }

  // 演示账号图标
  const roleIcons: Record<string, typeof Shield> = { admin: Shield, finance: Wallet, employee: UserCircle }
  const roleColorMap: Record<string, string> = {
    amber: 'border-amber-200 dark:border-amber-800/50 hover:border-amber-400 dark:hover:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10',
    emerald: 'border-emerald-200 dark:border-emerald-800/50 hover:border-emerald-400 dark:hover:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10',
    slate: 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 bg-slate-50/50 dark:bg-slate-800/30',
  }
  const roleIconColorMap: Record<string, string> = {
    amber: 'text-amber-600 dark:text-amber-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    slate: 'text-slate-600 dark:text-slate-400',
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ============ 左侧品牌展示区 ============ */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 relative overflow-hidden">
        {/* 装饰图形 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full bg-indigo-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full bg-purple-300/10 blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-xl font-semibold">智报销</span>
          </div>

          {/* 品牌语 */}
          <div className="space-y-6">
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
              让报销变得
              <br />
              <span className="text-brand-200">智能又简单</span>
            </h1>
            <p className="text-lg text-white/80 leading-relaxed max-w-md">
              AI 自动识别发票信息，智能匹配报销政策，
              <br />
              一键发起审批流程，财务管理从未如此高效。
            </p>

            {/* 特性列表 */}
            <div className="space-y-3 pt-4">
              {[
                'AI OCR 票据识别，准确率 99%+',
                '灵活的多级审批工作流配置',
                'SaaS 多租户架构，数据安全隔离',
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-3 text-white/90">
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm">{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 底部 */}
          <p className="text-sm text-white/60">
            © {new Date().getFullYear()} 智报销 · AI 智能化报销系统
          </p>
        </div>
      </div>

      {/* ============ 右侧登录表单区 ============ */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md">
          {/* 移动端 Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-lg bg-brand-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg text-slate-900 dark:text-white">智报销</span>
          </div>

          {/* 标题 */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              欢迎回来 👋
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              登录你的账户，继续使用智能报销
            </p>
          </div>

          {/* 服务端错误提示 */}
          {serverError && (
            <div className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">登录失败</p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">{serverError}</p>
              </div>
              <button
                onClick={() => setServerError('')}
                className="text-red-400 hover:text-red-600 dark:hover:text-red-200 transition-colors"
                aria-label="关闭错误提示"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* 登录表单 */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {/* 邮箱 */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                邮箱地址
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  {...register('email')}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.email
                      ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* 密码 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  密码
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
                >
                  忘记密码？
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  {...register('password')}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.password
                      ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                      : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* 记住我 */}
            <div className="flex items-center">
              <input
                id="remember"
                type="checkbox"
                {...register('remember')}
                className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
              />
              <label htmlFor="remember" className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                7 天内自动登录
              </label>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 disabled:cursor-not-allowed text-white font-medium transition-all shadow-lg shadow-brand-600/25 hover:shadow-xl hover:shadow-brand-600/30"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  正在登录...
                </>
              ) : (
                <>
                  登录
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* 分隔线 */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
            <span className="text-sm text-slate-400">或</span>
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* 注册引导 */}
          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            还没有账户？{' '}
            <Link
              href="/register"
              className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
            >
              免费注册，立即试用
            </Link>
          </p>

          {/* 演示账号快速登录 */}
          <div className="mt-6">
            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mb-3">
              演示账号（密码均为 123456，点击直接登录）
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {DEMO_ACCOUNTS.filter((a) => a.email !== 'demo@example.com').map((acct) => {
                const Icon = roleIcons[acct.role] || UserCircle
                const info = ROLES[acct.role]
                const colorClass = roleColorMap[info.color]
                const iconColor = roleIconColorMap[info.color]
                return (
                  <button
                    key={acct.email}
                    onClick={() => quickLogin(acct.email)}
                    disabled={isSubmitting}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${colorClass}`}
                  >
                    <Icon className={`w-5 h-5 ${iconColor}`} />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{info.label}</span>
                    <span className="text-[10px] text-slate-400 truncate w-full text-center">{acct.email.split('@')[0]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 返回首页 */}
          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
