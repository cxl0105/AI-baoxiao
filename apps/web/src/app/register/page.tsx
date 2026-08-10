'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  FileText,
  Mail,
  Lock,
  User,
  Building2,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react'
import { api, formatApiError } from '@/lib/api'

// --- 表单校验规则 ---
const registerSchema = z
  .object({
    name: z.string().min(2, '姓名至少 2 个字符').max(50, '姓名最多 50 个字符'),
    email: z.string().min(1, '请输入邮箱地址').email('邮箱格式不正确，请检查'),
    companyName: z.string().min(2, '企业名称至少 2 个字符').max(100, '企业名称最多 100 个字符'),
    password: z
      .string()
      .min(1, '请输入密码')
      .min(8, '密码至少 8 个字符')
      .max(64, '密码最多 64 个字符')
      .regex(/[a-zA-Z]/, '密码需包含字母')
      .regex(/[0-9]/, '密码需包含数字'),
    confirmPassword: z.string().min(1, '请再次输入密码'),
    agree: z.literal(true, {
      errorMap: () => ({ message: '请阅读并同意服务协议' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  })

type RegisterForm = z.infer<typeof registerSchema>

export default function RegisterPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', companyName: '', password: '', confirmPassword: '', agree: false as unknown as true },
  })

  const password = watch('password')

  // 密码强度计算
  const strength = (() => {
    if (!password) return { score: 0, label: '', color: '' }
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^a-zA-Z0-9]/.test(password)) score++
    const labels = ['', '弱', '一般', '中等', '强', '很强']
    const colors = ['', '#EF4444', '#F59E0B', '#EAB308', '#22C55E', '#16A34A']
    return { score, label: labels[score], color: colors[score] }
  })()

  const onSubmit = async (data: RegisterForm) => {
    setServerError('')
    try {
      await api.register({
        name: data.name,
        email: data.email,
        password: data.password,
        companyName: data.companyName,
      })
      setSuccess(true)
      // 2 秒后跳转登录页
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setServerError(formatApiError(err))
    }
  }

  // 注册成功页面
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">注册成功！</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">
            企业账户已创建，即将跳转到登录页面...
          </p>
          <Loader2 className="w-5 h-5 animate-spin text-brand-500 mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ============ 左侧品牌展示区 ============ */}
      <div className="hidden lg:flex lg:w-2/5 bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-800 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full bg-indigo-400/20 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-xl font-semibold">智报销</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-4xl xl:text-5xl font-bold leading-tight">
              开启智能
              <br />
              <span className="text-brand-200">报销新时代</span>
            </h1>
            <p className="text-lg text-white/80 leading-relaxed max-w-md">
              注册即可免费试用 14 天，体验 AI 驱动的报销管理全流程。
            </p>

            <div className="space-y-3 pt-4">
              {[
                '14 天免费试用，无需绑定信用卡',
                '5 分钟完成企业配置，立即开始使用',
                'AI 自动识别发票，告别手工录入',
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

          <p className="text-sm text-white/60">© {new Date().getFullYear()} 智报销 · AI 智能化报销系统</p>
        </div>
      </div>

      {/* ============ 右侧注册表单区 ============ */}
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
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">创建账户 🚀</h2>
            <p className="text-slate-500 dark:text-slate-400">填写以下信息，开始免费试用</p>
          </div>

          {/* 服务端错误提示 */}
          {serverError && (
            <div className="mb-5 flex items-start gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">注册失败</p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-0.5">{serverError}</p>
              </div>
              <button onClick={() => setServerError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* 注册表单 */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* 姓名 */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                姓名
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="name"
                  type="text"
                  placeholder="请输入你的姓名"
                  {...register('name')}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.name ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
              </div>
              {errors.name && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* 企业名称 */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                企业名称
              </label>
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="companyName"
                  type="text"
                  placeholder="如：某某科技有限公司"
                  {...register('companyName')}
                  className={`w-full pl-11 pr-4 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.companyName ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
              </div>
              {errors.companyName && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.companyName.message}
                </p>
              )}
            </div>

            {/* 邮箱 */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                企业邮箱
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
                    errors.email ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
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
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="至少 8 位，含字母和数字"
                  {...register('password')}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.password ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {/* 密码强度条 */}
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-1.5 flex-1 rounded-full transition-colors"
                        style={{ background: i <= strength.score ? strength.color : 'rgba(148,163,184,0.2)' }}
                      />
                    ))}
                  </div>
                  {strength.label && (
                    <span className="text-xs font-medium" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  )}
                </div>
              )}
              {errors.password && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* 确认密码 */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                确认密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="请再次输入密码"
                  {...register('confirmPassword')}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                    errors.confirmPassword ? 'border-red-300 dark:border-red-700 focus:border-red-500' : 'border-slate-200 dark:border-slate-700 focus:border-brand-500'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* 服务协议 */}
            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('agree')}
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  我已阅读并同意
                  <Link href="/terms" className="text-brand-600 dark:text-brand-400 hover:underline mx-1">服务协议</Link>
                  和
                  <Link href="/privacy" className="text-brand-600 dark:text-brand-400 hover:underline mx-1">隐私政策</Link>
                </span>
              </label>
              {errors.agree && (
                <p className="mt-1.5 text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.agree.message as string}
                </p>
              )}
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
                  正在创建账户...
                </>
              ) : (
                <>
                  免费注册 · 试用 14 天
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* 登录引导 */}
          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            已有账户？{' '}
            <Link href="/login" className="font-medium text-brand-600 dark:text-brand-400 hover:underline">
              立即登录
            </Link>
          </p>

          {/* 返回首页 */}
          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              ← 返回首页
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
