'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, X, Send, MessageCircle, Lightbulb, AlertTriangle,
  Info, CheckCircle2, ChevronRight, Bot, User as UserIcon,
  Upload, Plus, Edit3, Receipt, Split, Wallet, FileText,
  Home, BarChart3, Settings as SettingsIcon, Shield, HelpCircle,
} from 'lucide-react'
import {
  type ConciergeMessage,
  type ConciergeContext,
  type SmartSuggestion,
  generateFormSuggestions,
  generatePageSuggestions,
  generateResponse,
  getQuickQuestions,
} from '@/lib/concierge'

// ============ 图标映射 ============
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  edit: Edit3,
  plus: Plus,
  receipt: Receipt,
  alert: AlertTriangle,
  split: Split,
  check: CheckCircle2,
  upload: Upload,
  home: Home,
  chart: BarChart3,
  wallet: Wallet,
  gear: SettingsIcon,
}

// ============ 工具 ============
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

// ============ 主组件 ============
interface ConciergeProps {
  /** 上下文信息 */
  context: ConciergeContext
}

export default function Concierge({ context }: ConciergeProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ConciergeMessage[]>([])
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'chat' | 'suggestions'>('suggestions')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 生成建议
  const suggestions = useMemo<SmartSuggestion[]>(() => {
    const formSugs = context.formState ? generateFormSuggestions(context) : []
    const pageSugs = generatePageSuggestions(context)
    return [...formSugs, ...pageSugs].slice(0, 6)
  }, [context])

  // 初始欢迎消息
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: uid(),
          role: 'assistant',
          content: `你好！我是 细妹子智能助手 ✨\n\n我可以帮你解答报销问题、推荐费用类别、提供填写建议。\n\n试试问我「如何提交报销单」或点击下方的快捷问题吧！`,
          timestamp: new Date().toISOString(),
        },
      ])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, open])

  // 打开时聚焦输入框
  useEffect(() => {
    if (open && activeTab === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, activeTab])

  // 发送消息
  const handleSend = (text?: string) => {
    const content = (text ?? input).trim()
    if (!content) return

    const userMsg: ConciergeMessage = {
      id: uid(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')

    // 生成回复（模拟思考延迟）
    setTimeout(() => {
      const { content: reply, actions } = generateResponse(content, context)
      const assistantMsg: ConciergeMessage = {
        id: uid(),
        role: 'assistant',
        content: reply,
        actions,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMsg])
    }, 400 + Math.random() * 300)
  }

  // 处理快捷操作
  const handleAction = (action: NonNullable<ConciergeMessage['actions']>[number]) => {
    switch (action.type) {
      case 'navigate':
        if (action.data?.path) {
          router.push(action.data.path as string)
          setOpen(false)
        }
        break
      case 'dismiss':
        break
      default:
        break
    }
  }

  const quickQuestions = getQuickQuestions()

  return (
    <>
      {/* 浮动按钮 */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30 hover:shadow-xl hover:shadow-brand-500/40 hover:scale-105 transition-all flex items-center justify-center group"
          aria-label="打开智能助手"
        >
          <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
          {/* 提示气泡 */}
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center animate-pulse">
              {suggestions.length}
            </span>
          )}
          {/* 首次提示 */}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs px-3 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            细妹子 · 有 {suggestions.length} 条建议
          </span>
        </button>
      )}

      {/* 侧边面板 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-3rem)] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom-5">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-brand-500 to-brand-700 text-white">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">细妹子智能助手</h3>
                <p className="text-xs text-white/70">在线 · 随时为你解答</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab 切换 */}
          <div className="flex border-b border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === 'suggestions'
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <Lightbulb className="w-4 h-4 inline mr-1" />
              智能建议
              {suggestions.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] dark:bg-red-900/30 dark:text-red-400">
                  {suggestions.length}
                </span>
              )}
              {activeTab === 'suggestions' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors relative ${
                activeTab === 'chat'
                  ? 'text-brand-600 dark:text-brand-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <MessageCircle className="w-4 h-4 inline mr-1" />
              对话问答
              {activeTab === 'chat' && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          </div>

          {/* 内容区 */}
          {activeTab === 'suggestions' ? (
            /* 智能建议 Tab */
            <div className="flex-1 overflow-y-auto p-4 space-y-3" ref={scrollRef}>
              {suggestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-10">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">一切就绪！</p>
                  <p className="text-xs text-slate-400 mt-1">当前没有需要关注的建议</p>
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="mt-4 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    去对话问答 →
                  </button>
                </div>
              ) : (
                suggestions.map((sug) => {
                  const Icon = ICON_MAP[sug.icon] || Info
                  const styleMap = {
                    tip: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', iconColor: 'text-blue-500', label: '提示', labelBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400' },
                    warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', iconColor: 'text-amber-500', label: '注意', labelBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400' },
                    info: { bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700', iconColor: 'text-slate-500', label: '说明', labelBg: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
                    shortcut: { bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green-200 dark:border-green-800', iconColor: 'text-green-500', label: '快捷', labelBg: 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400' },
                  }
                  const s = styleMap[sug.type]
                  return (
                    <div key={sug.id} className={`rounded-xl border ${s.border} ${s.bg} p-3`}>
                      <div className="flex items-start gap-2.5">
                        <div className={`w-8 h-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center flex-shrink-0 ${s.iconColor}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.labelBg} font-medium`}>{s.label}</span>
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{sug.title}</p>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed whitespace-pre-line">{sug.detail}</p>
                          {sug.action && (
                            <button
                              onClick={() => handleAction(sug.action!)}
                              className="mt-2 text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium inline-flex items-center gap-0.5"
                            >
                              {sug.action.label}
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}

              {/* 快捷问题 */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  常见问题
                </p>
                <div className="flex flex-wrap gap-2">
                  {quickQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => {
                        setActiveTab('chat')
                        handleSend(q)
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/30 dark:hover:text-brand-400 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* 对话问答 Tab */
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {/* 头像 */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      msg.role === 'assistant'
                        ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}>
                      {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
                    </div>
                    {/* 消息气泡 */}
                    <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : ''}`}>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line ${
                        msg.role === 'user'
                          ? 'bg-brand-500 text-white rounded-tr-sm'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                      }`}>
                        {msg.content}
                      </div>
                      {/* 快捷操作 */}
                      {msg.actions && msg.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {msg.actions.map((action, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleAction(action)}
                              className="text-xs px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:hover:bg-brand-900/50 transition-colors inline-flex items-center gap-1"
                            >
                              {action.label}
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* 快捷问题（首次对话时显示） */}
                {messages.length <= 1 && (
                  <div className="pt-2">
                    <p className="text-xs text-slate-400 mb-2">你可以问我：</p>
                    <div className="flex flex-wrap gap-2">
                      {quickQuestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSend(q)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/30 dark:hover:text-brand-400 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 输入框 */}
              <div className="border-t border-slate-100 dark:border-slate-800 p-3">
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="输入你的问题..."
                    className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 outline-none"
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    className="w-8 h-8 rounded-lg bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    aria-label="发送"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
