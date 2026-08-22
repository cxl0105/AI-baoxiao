'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, formatApiError } from '@/lib/api'
import {
  Mail,
  Lock,
  ShieldCheck,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Send,
} from 'lucide-react'

type Step = 'email' | 'reset' | 'done'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // 发送验证码
  const handleSendCode = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('请输入正确的邮箱地址')
      return
    }
    setSending(true)
    try {
      const res = await api.forgotPassword(email.trim())
      setInfo(res?.message || '验证码已发送，请查收邮件')
      setCountdown(60)
      setStep('reset')
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSending(false)
    }
  }

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [countdown])

  // 重置密码
  const handleReset = async () => {
    setError(null)
    if (!/^\d{6}$/.test(code.trim())) {
      setError('请输入 6 位数字验证码')
      return
    }
    if (password.length < 8) {
      setError('新密码至少 8 个字符')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      await api.resetPassword(email.trim(), code.trim(), password)
      setStep('done')
    } catch (e) {
      setError(formatApiError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full pl-10 pr-3 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-slate-800 dark:text-slate-100'

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        {/* 品牌区 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 dark:text-white">智报销</span>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 pt-6 pb-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {step === 'done' ? '密码重置成功' : '忘记密码'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {step === 'email' && '输入注册邮箱，我们将发送验证码'}
              {step === 'reset' && '请输入邮件中的验证码和新密码'}
              {step === 'done' && '您可以使用新密码登录了'}
            </p>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {/* 提示信息 */}
            {info && (
              <div className="flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {info}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* 步骤 1：输入邮箱 */}
            {step === 'email' && (
              <>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                    placeholder="请输入注册邮箱"
                    className={inputCls}
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSendCode}
                  disabled={sending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  发送验证码
                </button>
              </>
            )}

            {/* 步骤 2：验证码 + 新密码 */}
            {step === 'reset' && (
              <>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6 位验证码"
                    maxLength={6}
                    inputMode="numeric"
                    className={inputCls}
                    autoFocus
                  />
                  <button
                    onClick={handleSendCode}
                    disabled={sending || countdown > 0}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '重新发送'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="新密码（至少 8 位）"
                    className={inputCls}
                  />
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                    placeholder="确认新密码"
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={handleReset}
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 rounded-lg transition-colors"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  重置密码
                </button>
              </>
            )}

            {/* 步骤 3：完成 */}
            {step === 'done' && (
              <button
                onClick={() => router.push('/login')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
              >
                返回登录
              </button>
            )}

            {/* 返回登录 */}
            {step !== 'done' && (
              <Link
                href="/login"
                className="flex items-center justify-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                返回登录
              </Link>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          如果无法收到验证码，请联系管理员在「成员管理」中重置密码
        </p>
      </div>
    </div>
  )
}
