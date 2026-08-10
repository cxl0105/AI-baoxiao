'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Settings2,
  AlertTriangle,
  Eye,
  EyeOff,
  Sparkles,
  TestTube2,
  Building2,
  CreditCard,
  Palette,
  RotateCcw,
  Mail,
  Phone,
  Globe,
  MapPin,
  User,
  FileText,
  Hash,
  Users,
  Landmark,
  ClipboardList,
  Plus,
  Minus,
  Receipt,
  Wallet,
  BadgeCheck,
  Sigma,
  FileSignature,
  FileCode,
  Server,
  Shield,
  Gauge,
  Trash2,
} from 'lucide-react'
import {
  DEFAULT_OCR_CONFIG,
  DEFAULT_UI_SETTINGS,
  DEFAULT_COMPANY_INFO,
  DEFAULT_REIMBURSEMENT_POLICY,
  INDUSTRY_OPTIONS,
  SCALE_OPTIONS,
  EMPLOYEE_LEVELS,
  useSettingsStore,
  type OcrProviderConfig,
  type OcrProviderType,
  type UiSettings,
  type CompanyInfo,
  type ReimbursementPolicy,
  type TripSubsidyRule,
  type ApprovalSignerLevel,
  type ExpenseCategoryDef,
  type ReimbursementSerialFormat,
  type EmployeeLevel,
  type ExpenseStandardRule,
  type ApprovalRoutingRule,
  generateNextSerialNo,
} from '@/lib/settings'
import { runVisionLlmOcr, runBackendProxyOcr } from '@/lib/ocr-providers'
import { api, CATEGORY_LABEL, ocrProxyCheckConfig, type BackendProxyOcrPayload } from '@/lib/api'

type SettingsTab = 'ocr' | 'company' | 'ui' | 'policy' | 'standard'

const PROVIDER_OPTIONS: Array<{ value: OcrProviderType; label: string; desc: string }> = [
  { value: 'mock', label: '本地 Mock（演示/兜底）', desc: '不联网，基于文件名和内容正则推断，用于前端演示' },
  { value: 'vision_llm', label: '通用视觉大模型（推荐高精度）', desc: '兼容 OpenAI Chat Completions 协议的视觉模型（GPT-4o / GLM-4V / Qwen-VL-Max 等）' },
  { value: 'aliyun_invoice', label: '阿里云发票识别（预留）', desc: '阿里云 VAT invoice OCR 专用接口（AccessKey 认证，稍后开放）' },
  { value: 'tencent_invoice', label: '腾讯云发票识别（预留）', desc: '腾讯云发票 OCR 专用接口（稍后开放）' },
]

const QUICK_PRESETS: Array<{ label: string; baseUrl: string; model: string; hint: string }> = [
  { label: '智谱 GLM-4V (推荐)', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4v-plus', hint: '从 https://open.bigmodel.cn/ 拿 API Key' },
  { label: '阿里 Qwen-VL (兼容模式)', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max', hint: '从 https://dashscope.console.aliyun.com/ 拿 API Key（DASHSCOPE_API_KEY）' },
  { label: 'OpenAI GPT-4o', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', hint: '从 https://platform.openai.com/ 拿 Sk-Key' },
  { label: '字节豆包 Vision', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-1-5-vision-pro-32k-250115', hint: '火山方舟 ARK 控制台拿 Endpoint ID / Key' },
  { label: 'DeepSeek-VL (兼容)', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-vl2', hint: 'https://platform.deepseek.com/' },
]

const TAB_CONFIG: Array<{ key: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = [
  { key: 'ocr', label: 'AI OCR 大模型', icon: Sparkles, desc: '配置发票识别的视觉大模型 API' },
  { key: 'company', label: '公司信息', icon: Building2, desc: '公司抬头、开票信息、联系人等' },
  { key: 'policy', label: '报销规则', icon: ClipboardList, desc: '补贴标准、单据格式、签字审批流程' },
  { key: 'standard', label: '费用标准与预算', icon: Shield, desc: '差旅费用限额、部门/项目预算、智能审批路由' },
  { key: 'ui', label: '界面偏好', icon: Palette, desc: '视图、主题、金额精度等个性化' },
]

export default function SettingsPage() {
  const { ocr, ui, company, policy, patchOcr, setOcr, patchUi, patchCompany, setCompany, setPolicy, resetOcr, resetCompany, resetPolicy } = useSettingsStore()
  const [tab, setTab] = useState<SettingsTab>('ocr')

  // --- 本地表单状态（Cancel 时可还原）---
  const [form, setForm] = useState<OcrProviderConfig>(() => ({ ...ocr }))
  const [uiForm, setUiForm] = useState<UiSettings>(() => ({ ...ui }))
  const [companyForm, setCompanyForm] = useState<CompanyInfo>(() => ({ ...company }))
  const [policyForm, setPolicyForm] = useState<ReimbursementPolicy>(() => ({ ...policy }))
  const [keyVisible, setKeyVisible] = useState(false)
  const [secretVisible, setSecretVisible] = useState(false)

  // --- 追踪本地表单是否被用户编辑过，避免 useEffect 覆盖用户输入 ---
  const dirtyOcrRef = useRef(false)
  const dirtyUiRef = useRef(false)
  const dirtyCompanyRef = useRef(false)
  const dirtyPolicyRef = useRef(false)

  // --- 修复 zustand persist rehydration 竞争：首次初始化后如果 store 从
  //     localStorage 加载回真实数据，同步回尚未被用户编辑过的本地表单 ---
  useEffect(() => {
    if (!dirtyOcrRef.current && JSON.stringify(form) !== JSON.stringify(ocr)) {
      setForm({ ...ocr })
    }
  }, [ocr]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirtyUiRef.current && JSON.stringify(uiForm) !== JSON.stringify(ui)) {
      setUiForm({ ...ui })
    }
  }, [ui]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirtyCompanyRef.current && JSON.stringify(companyForm) !== JSON.stringify(company)) {
      setCompanyForm({ ...company })
    }
  }, [company]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirtyPolicyRef.current && JSON.stringify(policyForm) !== JSON.stringify(policy)) {
      setPolicyForm({ ...policy })
    }
  }, [policy]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- 测试连接状态 ---
  const [testState, setTestState] = useState<{
    running: boolean
    msg: string
    kind: 'idle' | 'ok' | 'err'
  }>({ running: false, msg: '', kind: 'idle' })

  // --- 后端 OCR 代理健康状态（callMode=proxy 时展示 Banner） ---
  const [proxyStatus, setProxyStatus] = useState<{
    loading: boolean
    data: BackendProxyOcrPayload | null
    error: string | null
  }>({ loading: false, data: null, error: null })
  const refreshProxyStatus = useCallback(async () => {
    setProxyStatus({ loading: true, data: null, error: null })
    try {
      const payload = await ocrProxyCheckConfig()
      setProxyStatus({ loading: false, data: payload, error: null })
    } catch (e) {
      setProxyStatus({
        loading: false,
        data: null,
        error: e instanceof Error ? e.message : '后端连接失败',
      })
    }
  }, [])
  // 进入 OCR Tab 或切换 callMode=proxy 时，自动拉一次后端状态
  useEffect(() => {
    if (tab !== 'ocr') return
    if (form.callMode === 'proxy') void refreshProxyStatus()
    else setProxyStatus({ loading: false, data: null, error: null })
  }, [tab, form.callMode, refreshProxyStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // --- 保存状态 ---
  const [saveState, setSaveState] = useState<{ kind: 'idle' | 'ok'; msg: string }>({ kind: 'idle', msg: '' })
  const saveTimerRef = useRef<number | null>(null)

  const showVisionLlm = form.provider === 'vision_llm'
  const showAliyun = form.provider === 'aliyun_invoice'
  const showTencent = form.provider === 'tencent_invoice'
  const isRealOcr = form.provider !== 'mock' && form.enabled
  // callMode=proxy 时，Base URL / Model / API Key 这些「前端直连敏感字段」应该隐藏
  const showDirectCredentials = form.callMode === 'direct'

  // --- 保存（四个分区一起保存）---
  const doSave = useCallback(() => {
    const ocrNext: OcrProviderConfig =
      form.provider === 'mock' ? { ...form, enabled: false } : form
    setOcr(ocrNext)
    patchUi(uiForm)
    setCompany(companyForm)
    setPolicy(policyForm)
    // 保存后：脏标记清零，允许后续 store 同步（比如其他 tab 或跨页面改动）
    dirtyOcrRef.current = false
    dirtyUiRef.current = false
    dirtyCompanyRef.current = false
    dirtyPolicyRef.current = false
    setSaveState({ kind: 'ok', msg: '所有设置已保存 ✓' })
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => setSaveState({ kind: 'idle', msg: '' }), 2600)
  }, [form, uiForm, companyForm, policyForm, setOcr, patchUi, setCompany, setPolicy])

  // --- 还原当前 Tab ---
  const doResetCurrent = useCallback(() => {
    if (tab === 'ocr') {
      dirtyOcrRef.current = false
      setForm({ ...DEFAULT_OCR_CONFIG })
      resetOcr()
    } else if (tab === 'company') {
      dirtyCompanyRef.current = false
      setCompanyForm({ ...DEFAULT_COMPANY_INFO })
      resetCompany()
    } else if (tab === 'policy') {
      dirtyPolicyRef.current = false
      setPolicyForm({ ...DEFAULT_REIMBURSEMENT_POLICY })
      resetPolicy()
    } else {
      dirtyUiRef.current = false
      setUiForm({ ...DEFAULT_UI_SETTINGS })
    }
  }, [tab, resetOcr, resetCompany, resetPolicy])

  // --- 还原全部 ---
  const doResetAll = useCallback(() => {
    dirtyOcrRef.current = false
    dirtyUiRef.current = false
    dirtyCompanyRef.current = false
    dirtyPolicyRef.current = false
    setForm({ ...DEFAULT_OCR_CONFIG })
    setUiForm({ ...DEFAULT_UI_SETTINGS })
    setCompanyForm({ ...DEFAULT_COMPANY_INFO })
    setPolicyForm({ ...DEFAULT_REIMBURSEMENT_POLICY })
    resetOcr()
    resetCompany()
    resetPolicy()
  }, [resetOcr, resetCompany, resetPolicy])

  const applyPreset = (p: { baseUrl: string; model: string }) => {
    setForm((f) => ({ ...f, baseUrl: p.baseUrl, model: p.model }))
  }

  // --- 测试连接 ---
  const doTestConnection = useCallback(async () => {
    setTestState({ running: true, msg: '正在调用视觉大模型识别样例发票…', kind: 'idle' })
    try {
      if (form.provider === 'mock') {
        await new Promise((r) => setTimeout(r, 700))
        setTestState({ running: false, msg: 'Mock 模式工作正常（不联网，直接返回）', kind: 'ok' })
        return
      }
      if (!form.enabled) {
        setTestState({ running: false, msg: '请先打开「启用真实 OCR」开关再测试', kind: 'err' })
        return
      }
      const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='
      const bin = atob(TINY_PNG_B64)
      const arr = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
      const sampleFile = new File([arr], '餐饮_¥128_6月15日.jpg', { type: 'image/png' })
      const start = Date.now()

      // B 方案优先：callMode=proxy 统一走后端代理
      if (form.callMode === 'proxy') {
        setTestState({ running: true, msg: '上传样例图片到服务器端代理 OCR 接口…', kind: 'idle' })
        const result = await runBackendProxyOcr(form, sampleFile)
        const elapsed = Date.now() - start
        const cat = CATEGORY_LABEL[result.category] || result.category
        setTestState({
          running: false,
          msg: `后端代理识别成功 ✓ (耗时 ${elapsed}ms)：分类「${cat}」，金额 ¥${result.amount.toFixed(2)}，日期 ${result.date}，发票号 ${result.invoiceNo}`,
          kind: 'ok',
        })
        return
      }

      if (form.provider === 'vision_llm') {
        const result = await runVisionLlmOcr(form, sampleFile)
        const elapsed = Date.now() - start
        const cat = CATEGORY_LABEL[result.category] || result.category
        setTestState({
          running: false,
          msg: `前端直连识别成功 ✓ (耗时 ${elapsed}ms)：分类「${cat}」，金额 ¥${result.amount.toFixed(2)}，日期 ${result.date}，发票号 ${result.invoiceNo}`,
          kind: 'ok',
        })
        return
      }
      setTestState({
        running: false,
        msg: `${PROVIDER_OPTIONS.find((o) => o.value === form.provider)?.label}：当前版本预留，稍后开放`,
        kind: 'err',
      })
    } catch (e) {
      const msg = api && (api as any).formatApiError ? (api as any).formatApiError(e) : (e instanceof Error ? e.message : String(e))
      const extraHint = form.callMode === 'proxy'
        ? '请检查后端服务是否启动、OCR_PROXY_* 环境变量是否完整，以及后端服务器能否访问大模型 API。'
        : '请检查 API Key、Base URL、模型名是否正确，以及服务是否支持 /chat/completions 视觉输入。'
      setTestState({
        running: false,
        msg: `失败：${msg || '未知错误'}。${extraHint}`,
        kind: 'err',
      })
    }
  }, [form])

  const canSave = useMemo(() => {
    if (!form.enabled || form.provider === 'mock') return true
    // proxy 模式：配置全在服务器 .env，前端不需要任何 Key，永远允许保存
    if (form.callMode === 'proxy') return true
    if (form.provider === 'vision_llm') return !!(form.apiKey.trim() && form.model.trim() && form.baseUrl.trim())
    if (form.provider === 'aliyun_invoice' || form.provider === 'tencent_invoice') {
      return !!(form.accessKeyId?.trim() && form.accessKeySecret?.trim() && form.region?.trim())
    }
    return true
  }, [form])

  void CATEGORY_LABEL

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回工作台
            </Link>
            <span>/</span>
            <span>系统设置</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-brand-600" />
            系统设置
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            配置 OCR 大模型、公司信息与界面偏好。所有设置保存在浏览器本地（localStorage），不会上传服务器。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={doResetCurrent}
            className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
            title={`重置当前 Tab：${TAB_CONFIG.find((t) => t.key === tab)?.label}`}
          >
            <RotateCcw className="w-4 h-4" />
            重置当前
          </button>
          <button
            onClick={doResetAll}
            className="px-3.5 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            恢复全部默认
          </button>
          <button
            onClick={doSave}
            disabled={!canSave}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              canSave
                ? 'bg-brand-600 hover:bg-brand-700 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
            }`}
          >
            {saveState.kind === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveState.kind === 'ok' ? saveState.msg : '保存全部设置'}
          </button>
        </div>
      </div>

      {/* ===== Tab 切换 ===== */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-1.5 inline-flex flex-wrap gap-1.5 w-full sm:w-auto">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 sm:flex-none inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all min-w-[160px] ${
                active
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 shadow-sm ring-1 ring-brand-500/20'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <div className="text-left min-w-0">
                <div>{t.label}</div>
                <div className={`text-[11px] font-normal truncate ${active ? 'text-brand-600/70 dark:text-brand-300/70' : 'text-slate-400 dark:text-slate-500'}`}>{t.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* ===== Tab 内容 ===== */}
      {tab === 'ocr' && (
        <OcrTab
          form={form}
          setForm={(updater) => { dirtyOcrRef.current = true; setForm(updater) }}
          keyVisible={keyVisible}
          setKeyVisible={setKeyVisible}
          secretVisible={secretVisible}
          setSecretVisible={setSecretVisible}
          showVisionLlm={showVisionLlm}
          showAliyun={showAliyun}
          showTencent={showTencent}
          showDirectCredentials={showDirectCredentials}
          isRealOcr={isRealOcr}
          canSave={canSave}
          applyPreset={(p) => { dirtyOcrRef.current = true; applyPreset(p) }}
          testState={testState}
          doTestConnection={doTestConnection}
          proxyStatus={proxyStatus}
          refreshProxyStatus={refreshProxyStatus}
        />
      )}

      {tab === 'company' && (
        <CompanyTab
          form={companyForm}
          setForm={(updater) => { dirtyCompanyRef.current = true; setCompanyForm(updater) }}
        />
      )}

      {tab === 'policy' && (
        <PolicyTab
          form={policyForm}
          setForm={(updater) => { dirtyPolicyRef.current = true; setPolicyForm(updater) }}
        />
      )}

      {tab === 'standard' && (
        <ExpenseStandardTab
          form={policyForm}
          setForm={(updater) => { dirtyPolicyRef.current = true; setPolicyForm(updater) }}
        />
      )}

      {tab === 'ui' && (
        <UiTab
          form={uiForm}
          setForm={(updater) => { dirtyUiRef.current = true; setUiForm(updater) }}
        />
      )}
    </div>
  )
}

/* ======================================================================
   Tab 1: AI OCR 大模型
   ====================================================================== */
type CallMode = 'proxy' | 'direct'
const CALL_MODE_OPTIONS: Array<{ value: CallMode; label: string; desc: string; tag: string; tagClass: string }> = [
  {
    value: 'proxy',
    label: '通过后端代理（推荐内测/生产）',
    desc: '前端只传发票文件，API Key 保存在服务器 .env（OCR_PROXY_*），不暴露浏览器。',
    tag: '安全 · 默认',
    tagClass: 'bg-emerald-500',
  },
  {
    value: 'direct',
    label: '前端直连（仅限本地/演示）',
    desc: '浏览器直接请求大模型 API，Key 会被保存在 localStorage。仅适合个人或小范围试用。',
    tag: '仅本地',
    tagClass: 'bg-amber-500',
  },
]
function OcrTab(props: {
  form: OcrProviderConfig
  setForm: React.Dispatch<React.SetStateAction<OcrProviderConfig>>
  keyVisible: boolean
  setKeyVisible: (v: boolean | ((p: boolean) => boolean)) => void
  secretVisible: boolean
  setSecretVisible: (v: boolean | ((p: boolean) => boolean)) => void
  showVisionLlm: boolean
  showAliyun: boolean
  showTencent: boolean
  showDirectCredentials: boolean
  isRealOcr: boolean
  canSave: boolean
  applyPreset: (p: { baseUrl: string; model: string }) => void
  testState: { running: boolean; msg: string; kind: 'idle' | 'ok' | 'err' }
  doTestConnection: () => Promise<void>
  proxyStatus: { loading: boolean; data: BackendProxyOcrPayload | null; error: string | null }
  refreshProxyStatus: () => Promise<void>
}) {
  const {
    form, setForm, keyVisible, setKeyVisible, secretVisible, setSecretVisible,
    showVisionLlm, showAliyun, showTencent, showDirectCredentials, isRealOcr, canSave,
    applyPreset, testState, doTestConnection, proxyStatus, refreshProxyStatus,
  } = props

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* 左：主配置 */}
      <section className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-brand-500 flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI OCR 大模型</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              启用后，上传发票将先调用您配置的大模型 API 做真实识别；失败时会自动降级到后端/Mock。
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">启用真实 OCR</label>
            <button
              type="button"
              role="switch"
              aria-checked={form.enabled}
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.enabled ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  form.enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Provider 选择 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">识别服务提供商</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROVIDER_OPTIONS.map((opt) => {
              const active = form.provider === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="ocr-provider"
                    className="mt-1 accent-brand-600"
                    checked={active}
                    onChange={() => setForm((f) => ({ ...f, provider: opt.value }))}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{opt.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{opt.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* 调用模式选择（B 方案新增） */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">调用模式</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CALL_MODE_OPTIONS.map((opt) => {
              const active = form.callMode === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="ocr-callmode"
                    className="mt-1 accent-brand-600"
                    checked={active}
                    onChange={() => setForm((f) => ({ ...f, callMode: opt.value }))}
                  />
                  <div className="min-w-0 w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{opt.label}</span>
                      <span className={`inline-flex items-center text-[10px] font-medium text-white px-1.5 py-0.5 rounded ${opt.tagClass}`}>{opt.tag}</span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{opt.desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* 代理模式下：显示后端配置健康状态 Banner */}
        {form.callMode === 'proxy' && (
          <div>
            {proxyStatus.loading && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5">
                <Loader2 className="w-4 h-4 text-slate-500 animate-spin mt-0.5 flex-shrink-0" />
                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">正在检查服务器端 OCR 代理配置…</div>
              </div>
            )}
            {!proxyStatus.loading && proxyStatus.error && (
              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200/60 dark:border-rose-800/50 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-rose-800 dark:text-rose-200 mb-1">后端 OCR 代理无法连接</div>
                  <div className="text-xs text-rose-700/90 dark:text-rose-300/90 leading-relaxed break-words">
                    {proxyStatus.error}
                  </div>
                  <div className="mt-2 text-[11px] text-rose-700/80 dark:text-rose-300/80 leading-relaxed">
                    请确认：① API 服务已启动并可从前端访问（NEXT_PUBLIC_API_URL 是否正确）；② 后端已配置 OCR_PROXY_BASE_URL / OCR_PROXY_API_KEY / OCR_PROXY_MODEL。
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshProxyStatus()}
                    className="mt-2 text-[11px] font-medium inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-200 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> 重试
                  </button>
                </div>
              </div>
            )}
            {!proxyStatus.loading && !proxyStatus.error && proxyStatus.data && (
              <div className={`p-3 rounded-lg flex items-start gap-2.5 border ${
                proxyStatus.data.enabled
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-800/50'
                  : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/50'
              }`}>
                {proxyStatus.data.enabled
                  ? <BadgeCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium mb-1 ${
                    proxyStatus.data.enabled
                      ? 'text-emerald-800 dark:text-emerald-200'
                      : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    {proxyStatus.data.enabled ? '后端 OCR 代理配置就绪 ✓' : '后端 OCR 代理未完全配置'}
                  </div>
                  {proxyStatus.data.hint && (
                    <div className={`text-xs leading-relaxed ${
                      proxyStatus.data.enabled
                        ? 'text-emerald-700/90 dark:text-emerald-300/90'
                        : 'text-amber-700/90 dark:text-amber-300/90'
                    }`}>{proxyStatus.data.hint}</div>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div className={`px-2 py-1 rounded ${proxyStatus.data.baseUrlConfigured ? 'bg-white/80 dark:bg-slate-900/80 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      Base URL {proxyStatus.data.baseUrlConfigured ? '✓' : '○'}
                    </div>
                    <div className={`px-2 py-1 rounded ${proxyStatus.data.apiKeyConfigured ? 'bg-white/80 dark:bg-slate-900/80 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      API Key {proxyStatus.data.apiKeyConfigured ? '✓' : '○'}
                    </div>
                    <div className={`px-2 py-1 rounded ${proxyStatus.data.modelConfigured ? 'bg-white/80 dark:bg-slate-900/80 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      Model {proxyStatus.data.modelConfigured ? '✓' : '○'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshProxyStatus()}
                    className="mt-2 text-[11px] font-medium inline-flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> 刷新状态
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 通用视觉大模型配置（仅在 callMode=direct 时显示敏感字段；预设按钮和高级参数仍显示但带灰化提示） */}
        {showVisionLlm && (
          <div className="space-y-5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {!showDirectCredentials && (
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200/60 dark:border-sky-800/50 flex items-start gap-2.5">
                <Server className="w-4 h-4 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-sky-800 dark:text-sky-200 leading-relaxed">
                  当前调用模式为「后端代理」：Base URL / Model / API Key 均由服务器端环境变量 <code className="px-1 rounded bg-white/70 dark:bg-slate-900/70 text-[11px]">OCR_PROXY_*</code> 统一配置，前端无需填写。以上字段仅用于前端直连模式。
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                快速预置
                {!showDirectCredentials && <span className="ml-2 text-[11px] font-normal text-slate-400">（代理模式下仅作参考）</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => applyPreset(p)}
                    title={p.hint}
                    disabled={!showDirectCredentials}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      showDirectCredentials
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                        : 'bg-slate-50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 border-slate-100 dark:border-slate-800 cursor-not-allowed'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {showDirectCredentials && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
                  <Field label="Base URL (API 服务地址)" icon={<Globe className="w-4 h-4" />} hint="如：https://open.bigmodel.cn/api/paas/v4 —— 不需要 /chat/completions 后缀">
                    <input
                      type="text"
                      value={form.baseUrl}
                      placeholder="https://open.bigmodel.cn/api/paas/v4"
                      onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
                    />
                  </Field>
                  <Field label="模型名称 (Model)" icon={<Sparkles className="w-4 h-4" />}>
                    <input
                      type="text"
                      value={form.model}
                      placeholder="glm-4v-plus / qwen-vl-max / gpt-4o"
                      onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
                    />
                  </Field>
                </div>

                <Field
                  label="API Key"
                  icon={<Hash className="w-4 h-4" />}
                  hint={(() => {
                    const cur = QUICK_PRESETS.find((p) => p.baseUrl === form.baseUrl)
                    return cur ? cur.hint : '从对应平台控制台获取的密钥（仅保存在本机）'
                  })()}
                >
                  <div className="relative">
                    <input
                      type={keyVisible ? 'text' : 'password'}
                      value={form.apiKey}
                      placeholder="sk-… 或自己平台的 Key"
                      onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                      autoComplete="off"
                      className="w-full pl-3.5 pr-11 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setKeyVisible((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title={keyVisible ? '隐藏密钥' : '显示密钥'}
                    >
                      {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </Field>
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="超时时间（毫秒）" hint={showDirectCredentials ? '默认 60s，网络慢可适当调大' : '代理模式：实际超时使用后端 OCR_PROXY_TIMEOUT_MS 配置'}>
                <input
                  type="number"
                  min={5000}
                  max={300_000}
                  step={1000}
                  value={form.timeoutMs}
                  readOnly={!showDirectCredentials}
                  onChange={(e) => setForm((f) => ({ ...f, timeoutMs: Math.max(5000, Math.min(300_000, +e.target.value || 60_000)) }))}
                  className={`w-full px-3.5 py-2 text-sm border rounded-lg outline-none ${
                    showDirectCredentials
                      ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-slate-800 dark:text-slate-100'
                      : 'bg-slate-100 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                />
              </Field>
              <Field label="Temperature（识别温度）" hint={showDirectCredentials ? '推荐 0~0.3，越低越稳定' : '代理模式：实际温度使用后端 OCR_PROXY_TEMPERATURE 配置'}>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={form.temperature}
                  readOnly={!showDirectCredentials}
                  onChange={(e) => setForm((f) => ({ ...f, temperature: Math.max(0, Math.min(1, +e.target.value || 0)) }))}
                  className={`w-full px-3.5 py-2 text-sm border rounded-lg outline-none ${
                    showDirectCredentials
                      ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-slate-800 dark:text-slate-100'
                      : 'bg-slate-100 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                />
              </Field>
              <Field label="上传大小上限（MB）" icon={<FileText className="w-4 h-4" />} hint="超过该大小的文件会被前端直接拒绝">
                <input
                  type="number"
                  min={1}
                  max={50}
                  readOnly
                  value={useSettingsStore.getState().ui.uploadMaxMb}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-800 dark:text-slate-100 text-slate-500"
                />
              </Field>
            </div>

            <Field label="自定义 System Prompt（高级，留空用内置默认）" hint={showDirectCredentials ? '内置默认非常详细。只有想补充约束时再填写，建议包含 JSON 格式要求。' : '代理模式：实际使用后端 OCR_PROXY_SYSTEM_PROMPT 配置；前端填写不会发送到后端。'}>
              <textarea
                rows={5}
                value={form.systemPrompt}
                placeholder="（留空使用内置默认）例如：请以金额字段优先按价税合计填充…"
                onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                readOnly={!showDirectCredentials}
                className={`w-full px-3.5 py-2 text-sm border rounded-lg outline-none font-mono leading-relaxed ${
                  showDirectCredentials
                    ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 text-slate-800 dark:text-slate-100'
                    : 'bg-slate-100 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                }`}
              />
            </Field>
          </div>
        )}

        {/* 阿里云 / 腾讯云（占位） */}
        {(showAliyun || showTencent) && (
          <div className="space-y-5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/50 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                阿里云 / 腾讯云专用发票识别接口将在后续版本开放（当前为预留位）。推荐先用「通用视觉大模型」体验高精度识别。
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="AccessKeyId / SecretId">
                <input
                  type="text"
                  value={form.accessKeyId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, accessKeyId: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg outline-none opacity-70 cursor-not-allowed"
                  disabled
                />
              </Field>
              <Field label="AccessKeySecret / SecretKey">
                <div className="relative">
                  <input
                    type={secretVisible ? 'text' : 'password'}
                    value={form.accessKeySecret || ''}
                    onChange={(e) => setForm((f) => ({ ...f, accessKeySecret: e.target.value }))}
                    className="w-full pl-3.5 pr-11 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg outline-none opacity-70 cursor-not-allowed"
                    disabled
                  />
                  <button
                    type="button"
                    onClick={() => setSecretVisible((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {secretVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Region（区域）" hint={showAliyun ? '默认 cn-shanghai' : '默认 ap-guangzhou'}>
                <input
                  type="text"
                  value={form.region || ''}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg outline-none opacity-70 cursor-not-allowed"
                  disabled
                />
              </Field>
            </div>
          </div>
        )}

        {/* 测试连接 */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={doTestConnection}
              disabled={testState.running || (isRealOcr && !canSave)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                testState.running || (isRealOcr && !canSave)
                  ? 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100'
              }`}
            >
              {testState.running ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TestTube2 className="w-4 h-4" />
              )}
              {testState.running ? '识别中…' : '测试连接 / 样例识别'}
            </button>
            {!canSave && isRealOcr && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                请先填完必填项（Provider、Base URL、API Key、Model）再测试
              </span>
            )}
          </div>
          {testState.msg && (
            <div
              className={`inline-flex items-start gap-2 max-w-full break-words px-3.5 py-2.5 text-sm rounded-xl border ${
                testState.kind === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-800/50'
                  : testState.kind === 'err'
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border-red-200/60 dark:border-red-800/50'
                  : 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              {testState.kind === 'ok' && <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {testState.kind === 'err' && <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              {testState.kind === 'idle' && <Loader2 className="w-4 h-4 mt-0.5 flex-shrink-0 animate-spin" />}
              <span className="whitespace-pre-wrap">{testState.msg}</span>
            </div>
          )}
        </div>
      </section>

      {/* 右：使用提示 */}
      <aside className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 via-white to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 shadow-sm p-6 space-y-3 h-fit">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          使用提示
        </h3>
        {form.callMode === 'proxy' && (
          <div className="p-3 rounded-lg bg-emerald-50/80 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/40 text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200 space-y-2">
            <div className="font-medium flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" /> 当前模式：后端代理（推荐）
            </div>
            <div>
              在 <code className="px-1 rounded bg-white/80 dark:bg-slate-900/80 text-[10.5px]">apps/api/.env</code> 中配置三项即可启用：
            </div>
            <pre className="text-[10.5px] leading-relaxed break-all whitespace-pre-wrap font-mono bg-white/80 dark:bg-slate-900/80 rounded px-2.5 py-2 border border-emerald-100 dark:border-emerald-900/40">
{`# 示例：智谱 GLM-4V-plus
OCR_PROXY_BASE_URL=https://open.bigmodel.cn/api/paas/v4
OCR_PROXY_MODEL=glm-4v-plus
OCR_PROXY_API_KEY=你的Key`}
            </pre>
            <div>
              重启 API 服务后回到本页，上方「后端 OCR 代理配置就绪」变绿即可。
            </div>
          </div>
        )}
        {form.callMode === 'direct' && (
          <div className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200 space-y-1.5">
            <div className="font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> 当前模式：前端直连（仅本地/演示）
            </div>
            <div>
              此模式下 API Key 会保存在浏览器 localStorage，<span className="font-semibold">不要在公网或共享环境使用</span>，建议切到「后端代理」。
            </div>
          </div>
        )}
        <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed list-disc list-inside marker:text-slate-400">
          <li>启用「通用视觉大模型」后，会把图片以 base64 方式发送到你配置的 API。</li>
          <li>
            {form.callMode === 'proxy'
              ? '「后端代理」模式：图片先传给你的 API 服务器，再由服务器调用大模型，Key 不暴露浏览器。'
              : '「前端直连」模式：图片不经过中间服务器，完全直连你填写的 Base URL。'}
          </li>
          <li>API Key 只保存在你本地浏览器 <code className="px-1 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px]">localStorage</code>{form.callMode === 'proxy' ? '（后端代理模式下该字段留空即可）' : ''}。</li>
          <li>建议文件名携带语义信息，如「餐饮_¥128_6月15日.jpg」，可提升视觉大模型对分类和金额字段的置信度。</li>
          <li>如果模型偶尔返回非合法 JSON，会自动提取 JSON 片段并做字段归一化；失败时会降级到后端接口或 Mock。</li>
          <li>上传文件大小上限在「界面偏好」Tab 里统一配置。</li>
        </ul>
      </aside>
    </div>
  )
}

/* ======================================================================
   Tab 2: 公司信息
   ====================================================================== */
function CompanyTab({ form, setForm }: { form: CompanyInfo; setForm: React.Dispatch<React.SetStateAction<CompanyInfo>> }) {
  const patch = (p: Partial<CompanyInfo>) => setForm((s) => ({ ...s, ...p }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* 左：公司基础信息 */}
      <section className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">公司 / 单位信息</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              填写后将用于报销单打印抬头、发票核验、邮件签名等场景。留空字段会使用系统内置默认值。
            </p>
          </div>
        </div>

        {/* 公司名称 + Logo */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row gap-5 items-start sm:items-center">
            {/* Logo 预览 */}
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <Building2 className="w-8 h-8" />
                    <span className="text-[10px] mt-1">LOGO</span>
                  </div>
                )}
              </div>
              <span className="text-[11px] text-slate-400">80×80 预览</span>
            </div>
            <div className="flex-1 space-y-3 w-full">
              <Field label="公司全称（发票抬头用）" icon={<CreditCard className="w-4 h-4" />} hint="用于增值税发票抬头、打印页公司名称，需与营业执照完全一致" required>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => patch({ fullName: e.target.value })}
                  placeholder="例：智报销科技（北京）有限公司"
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
                />
              </Field>
              <Field label="公司简称（系统展示用）" icon={<Building2 className="w-4 h-4" />} hint="侧边栏、首页问候语等处显示的短名称">
                <input
                  type="text"
                  value={form.shortName}
                  onChange={(e) => patch({ shortName: e.target.value })}
                  placeholder="例：智报销"
                  className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
                />
              </Field>
            </div>
          </div>
          <div className="mt-4">
            <Field label="公司 Logo URL（选填）" hint="支持 https:// 外链或项目内相对路径。留空显示系统默认图标。">
              <input
                type="text"
                value={form.logoUrl}
                onChange={(e) => patch({ logoUrl: e.target.value })}
                placeholder="https://example.com/logo.png 或 /logo.png"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
          </div>
        </div>

        {/* 注册/行业信息 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="统一社会信用代码" icon={<Hash className="w-4 h-4" />} hint="18 位，用于发票核验、税号对接">
            <input
              type="text"
              value={form.creditCode}
              onChange={(e) => patch({ creditCode: e.target.value.trim().toUpperCase() })}
              placeholder="91110000MA01XXXXXX"
              maxLength={18}
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100 font-mono tracking-wider"
            />
          </Field>
          <Field label="行业类型" icon={<Landmark className="w-4 h-4" />}>
            <select
              value={form.industry}
              onChange={(e) => patch({ industry: e.target.value })}
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
            >
              {INDUSTRY_OPTIONS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </Field>
          <Field label="公司规模" icon={<Users className="w-4 h-4" />}>
            <select
              value={form.scale}
              onChange={(e) => patch({ scale: e.target.value as CompanyInfo['scale'] })}
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
            >
              {SCALE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="公司官网（选填）" icon={<Globe className="w-4 h-4" />}>
            <input
              type="url"
              value={form.website}
              onChange={(e) => patch({ website: e.target.value })}
              placeholder="https://www.example.com"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
            />
          </Field>
        </div>

        {/* 联系信息 */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-1.5">
            <Phone className="w-4 h-4 text-slate-500" /> 办公与联系信息
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="联系电话（前台/行政）" icon={<Phone className="w-4 h-4" />}>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                placeholder="010-88888888 或 400-xxx-xxxx"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
            <div />
            <Field label="办公地址" icon={<MapPin className="w-4 h-4" />} className="sm:col-span-2">
              <input
                type="text"
                value={form.address}
                onChange={(e) => patch({ address: e.target.value })}
                placeholder="省/市/区 街道 门牌号 楼层"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
          </div>
        </div>

        {/* 财务 & 税务联系人 */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-1.5">
            <User className="w-4 h-4 text-slate-500" /> 财务与税务对接人
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="财务联系人" icon={<User className="w-4 h-4" />} hint="审批流程邮件通知默认抄送">
              <input
                type="text"
                value={form.financeContact}
                onChange={(e) => patch({ financeContact: e.target.value })}
                placeholder="例：李会计"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
            <Field label="财务联系邮箱" icon={<Mail className="w-4 h-4" />} hint="报销单导出 PDF 默认发送地址">
              <input
                type="email"
                value={form.financeEmail}
                onChange={(e) => patch({ financeEmail: e.target.value })}
                placeholder="finance@example.com"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
            <Field label="税务联系人" icon={<User className="w-4 h-4" />} hint="专票认证、进项税核对对接">
              <input
                type="text"
                value={form.taxContact}
                onChange={(e) => patch({ taxContact: e.target.value })}
                placeholder="例：王税务"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
            <div />
            <Field label="开票银行" icon={<Landmark className="w-4 h-4" />} hint="增值税专票必填">
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => patch({ bankName: e.target.value })}
                placeholder="例：中国工商银行北京中关村支行"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </Field>
            <Field label="银行账号" icon={<CreditCard className="w-4 h-4" />}>
              <input
                type="text"
                value={form.bankAccount}
                onChange={(e) => patch({ bankAccount: e.target.value.replace(/\s/g, '') })}
                placeholder="0200 0000 0000 0000 000"
                className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100 font-mono tracking-wider"
              />
            </Field>
          </div>
        </div>

        {/* 备注 */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <Field label="备注说明（选填）" icon={<FileText className="w-4 h-4" />} hint="可填写公司报销制度摘要、审批签字规则、打印位置提示等，会显示在打印页页脚。">
            <textarea
              rows={4}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="例：本公司每月 25 日为报销截止日；所有差旅需附行程单；超过 5000 元需总经理审批…"
              className="w-full px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100 leading-relaxed resize-none"
            />
          </Field>
        </div>
      </section>

      {/* 右：信息预览卡片 */}
      <aside className="space-y-6">
        {/* 名片预览 */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> 名片实时预览
          </h3>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-900 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-emerald-500 flex items-center justify-center text-white overflow-hidden flex-shrink-0">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Building2 className="w-6 h-6" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-900 dark:text-white truncate">
                  {form.shortName || '智报销演示公司'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {form.industry || '互联网/信息技术'} · {SCALE_OPTIONS.find((s) => s.value === form.scale)?.label || '51-200 人'}
                </div>
              </div>
            </div>
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700 pt-2.5 space-y-1.5 text-xs">
              <InfoLine icon={<Building2 className="w-3.5 h-3.5" />} label="全称" value={form.fullName || '（未填写）'} dim={!form.fullName} />
              <InfoLine icon={<Hash className="w-3.5 h-3.5" />} label="信用代码" value={form.creditCode || '（未填写）'} dim={!form.creditCode} mono />
              <InfoLine icon={<MapPin className="w-3.5 h-3.5" />} label="地址" value={form.address || '（未填写）'} dim={!form.address} />
              <InfoLine icon={<Phone className="w-3.5 h-3.5" />} label="电话" value={form.phone || '（未填写）'} dim={!form.phone} />
              <InfoLine icon={<Mail className="w-3.5 h-3.5" />} label="财务邮箱" value={form.financeEmail || '（未填写）'} dim={!form.financeEmail} />
              {form.bankName && (
                <InfoLine icon={<Landmark className="w-3.5 h-3.5" />} label="开户银行" value={form.bankName + (form.bankAccount ? ` · ${form.bankAccount}` : '')} mono={!!form.bankAccount} />
              )}
            </div>
          </div>
        </section>

        {/* 使用提示 */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-emerald-500" />
            这些信息会出现在哪里
          </h3>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed list-disc list-inside marker:text-slate-400">
            <li><b>报销单打印页</b>：顶部「公司全称 + Logo」作为发票抬头。</li>
            <li><b>导出 PDF</b>：页脚包含银行账号、财务联系人、信用代码。</li>
            <li><b>邮件签名</b>：审批通知邮件附带公司联系信息。</li>
            <li><b>发票核验</b>：统一社会信用代码用于专票真伪核对（后端对接后生效）。</li>
            <li><b>首页欢迎语</b>：侧边栏 Logo 旁显示「公司简称」。</li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

/* ======================================================================
   Tab 3: 界面偏好
   ====================================================================== */
function UiTab({ form, setForm }: { form: UiSettings; setForm: React.Dispatch<React.SetStateAction<UiSettings>> }) {
  const patch = (p: Partial<UiSettings>) => setForm((s) => ({ ...s, ...p }))

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <section className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">界面偏好</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              个性化你使用智报销的视觉与交互细节。
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
            新建报销单 - 发票默认视图
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: 'cards', label: '卡片视图', hint: '大图卡 + 状态标签' },
              { v: 'table', label: '表格视图', hint: '类 Excel 可编辑、批量操作' },
            ].map((opt) => {
              const active = form.invoiceViewMode === opt.v
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => patch({ invoiceViewMode: opt.v as UiSettings['invoiceViewMode'] })}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-900/20 ring-2 ring-brand-500/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{opt.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{opt.hint}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">主题模式</label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { v: 'light', label: '浅色', hint: '清爽明亮' },
              { v: 'dark', label: '深色', hint: '护眼专注' },
              { v: 'system', label: '跟随系统', hint: '自动切换' },
            ] as const).map((t) => {
              const active = form.theme === t.v
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => patch({ theme: t.v })}
                  className={`py-3 rounded-xl border text-sm transition-all ${
                    active
                      ? 'border-brand-500 bg-brand-50/60 text-brand-700 dark:text-brand-300 dark:bg-brand-900/20 ring-2 ring-brand-500/20'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-[11px] mt-0.5 opacity-70">{t.hint}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Field label="金额显示精度（小数位）" hint="报表、列表、详情页的金额小数位数">
            <select
              value={form.currencyPrecision}
              onChange={(e) => patch({ currencyPrecision: +e.target.value as 0 | 1 | 2 })}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100"
            >
              <option value={0}>0 位（¥ 128）</option>
              <option value={1}>1 位（¥ 128.5）</option>
              <option value={2}>2 位（¥ 128.50）</option>
            </select>
          </Field>
          <Field label="上传文件大小上限（MB）" hint="超过该大小的文件会被前端直接拒绝，推荐 5–20 MB">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={50}
                value={form.uploadMaxMb}
                onChange={(e) => patch({ uploadMaxMb: Math.max(1, Math.min(50, +e.target.value)) })}
                className="flex-1 accent-brand-600"
              />
              <div className="w-16 text-right text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{form.uploadMaxMb} MB</div>
            </div>
          </Field>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-pink-50 via-white to-rose-50 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 shadow-sm p-6 space-y-3 h-fit">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-pink-500" />
            偏好说明
          </h3>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed list-disc list-inside marker:text-slate-400">
            <li><b>发票默认视图</b>：新建报销单页「发票区」是卡片还是表格。</li>
            <li><b>主题</b>：浅色 / 深色 / 跟随系统，修改后立即生效。</li>
            <li><b>金额精度</b>：推荐 2 位（财务标准）；日常统计可选 0 位更简洁。</li>
            <li><b>上传上限</b>：大图发票建议 ≥ 5MB；批量多张时可调大。</li>
            <li>所有偏好保存在本机，不同浏览器需分别配置。</li>
          </ul>
        </section>
      </aside>
    </div>
  )
}

/* ======================================================================
   Tab 3: 报销规则（补贴标准、单据格式、签字审批流程）
   ====================================================================== */
function PolicyTab(props: {
  form: ReimbursementPolicy
  setForm: React.Dispatch<React.SetStateAction<ReimbursementPolicy>>
}) {
  const { form, setForm } = props
  const patch = (partial: Partial<ReimbursementPolicy>) =>
    setForm((f) => ({ ...f, ...partial }))
  const patchSerial = (partial: Partial<ReimbursementSerialFormat>) =>
    setForm((f) => ({ ...f, serial: { ...f.serial, ...partial } }))
  const updateCategory = (idx: number, partial: Partial<ExpenseCategoryDef>) =>
    setForm((f) => ({
      ...f,
      categories: f.categories.map((c, i) => (i === idx ? { ...c, ...partial } : c)),
    }))
  const updateSubsidy = (idx: number, partial: Partial<TripSubsidyRule>) =>
    setForm((f) => ({
      ...f,
      subsidies: f.subsidies.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
    }))
  const addSubsidy = () =>
    setForm((f) => ({
      ...f,
      subsidies: [...f.subsidies, { key: `custom_${Date.now()}`, label: '新出差类型', perDay: 80, enabled: true, maxDays: 0 }],
    }))
  const removeSubsidy = (idx: number) =>
    setForm((f) => ({ ...f, subsidies: f.subsidies.filter((_, i) => i !== idx) }))
  const updateSigner = (idx: number, partial: Partial<ApprovalSignerLevel>) =>
    setForm((f) => ({
      ...f,
      signerLevels: f.signerLevels.map((s, i) => (i === idx ? { ...s, ...partial } : s)),
    }))
  const addSigner = () =>
    setForm((f) => ({
      ...f,
      signerLevels: [...f.signerLevels, { key: `signer_${Date.now()}`, title: '新节点', placeholderRole: '签字', enabled: true }],
    }))
  const removeSigner = (idx: number) =>
    setForm((f) => ({ ...f, signerLevels: f.signerLevels.filter((_, i) => i !== idx) }))

  const previewSerial = (() => {
    try { return generateNextSerialNo(form, new Date()) } catch { return `${form.serial.prefix}-DEMO-0001` }
  })()

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* 左：主配置区 */}
      <section className="xl:col-span-2 space-y-6">
        {/* 单据抬头 */}
        <Card title="单据抬头与格式" icon={<ClipboardList className="w-5 h-5" />} color="from-sky-500 to-indigo-500"
          subtitle="控制西门子风格报销单的标题、副标题与编号生成规则。">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="单据标题（抬头）" icon={<Receipt className="w-4 h-4" />} required hint="如：出差费用报销单 / 员工差旅费报销申请表">
              <input value={form.formTitle} onChange={(e) => patch({ formTitle: e.target.value })}
                className={INPUT} placeholder="出差费用报销单" />
            </Field>
            <Field label="币种符号" icon={<Wallet className="w-4 h-4" />} hint="¥ ￥ $ € 等">
              <input value={form.currency} onChange={(e) => patch({ currency: e.target.value })}
                className={INPUT} placeholder="¥" maxLength={3} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="单据副标题 / 说明" hint="会展示在单据标题下方，提示报销人填写规范。">
              <textarea value={form.formSubtitle} onChange={(e) => patch({ formSubtitle: e.target.value })}
                rows={2} className={`${INPUT} resize-none`}
                placeholder="本单据由报销人逐项填写，附原始发票后按签字顺序递交审批。" />
            </Field>
          </div>

          <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-sky-500" />
                  编号生成格式
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">形如：<code className="px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono">BX-202608-0001</code>，每月序号自动重置。</p>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500">下一张单号预览</div>
                <div className="font-mono text-brand-700 dark:text-brand-300 font-semibold mt-0.5">{previewSerial}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Field label="前缀（Prefix）">
                <input value={form.serial.prefix} onChange={(e) => patchSerial({ prefix: e.target.value.toUpperCase().slice(0, 12) })}
                  className={INPUT} placeholder="BX" />
              </Field>
              <Field label="日期段">
                <select value={form.serial.datePart} onChange={(e) => patchSerial({ datePart: e.target.value as ReimbursementSerialFormat['datePart'] })}
                  className={INPUT}>
                  <option value="yyyyMM">YYYYMM（推荐）</option>
                  <option value="yyyyMMdd">YYYYMMDD</option>
                  <option value="none">无日期段</option>
                </select>
              </Field>
              <Field label="序号位数">
                <select value={form.serial.seqDigits} onChange={(e) => patchSerial({ seqDigits: +e.target.value as ReimbursementSerialFormat['seqDigits'] })}
                  className={INPUT}>
                  {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} 位（{String(1).padStart(n, '0')}）</option>)}
                </select>
              </Field>
              <Field label="分隔符">
                <select value={form.serial.separator} onChange={(e) => patchSerial({ separator: e.target.value as ReimbursementSerialFormat['separator'] })}
                  className={INPUT}>
                  <option value="-">短横线  -</option>
                  <option value="_">下划线  _</option>
                  <option value="/">斜杠  /</option>
                  <option value="">无分隔符</option>
                </select>
              </Field>
            </div>
          </div>
        </Card>

        {/* 费用分类列 */}
        <Card title="费用分类列（电子表格表头）" icon={<Sigma className="w-5 h-5" />} color="from-emerald-500 to-teal-500"
          subtitle="勾选启用的分类会出现在报销单明细表中，从左到右依次为：交通费 / 打车费 / 住宿费 / 餐饮费 / 其它费用。">
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium w-10">启用</th>
                  <th className="px-4 py-2.5 text-left font-medium">分类键</th>
                  <th className="px-4 py-2.5 text-left font-medium">中文列名（表头显示）</th>
                  <th className="px-4 py-2.5 text-left font-medium">悬停提示</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {form.categories.map((c, i) => (
                  <tr key={c.key} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <Switch checked={c.enabled} onChange={(v) => updateCategory(i, { enabled: v })} />
                    </td>
                    <td className="px-4 py-2.5">
                      <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-xs">{c.key}</code>
                    </td>
                    <td className="px-4 py-2.5">
                      <input value={c.label} onChange={(e) => updateCategory(i, { label: e.target.value })}
                        className={`${INPUT} !py-1.5`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <input value={c.hint || ''} onChange={(e) => updateCategory(i, { hint: e.target.value })}
                        className={`${INPUT} !py-1.5`} placeholder="（选填）" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <label className="inline-flex items-center gap-2">
              <Switch checked={form.subsidyInSeparateRow} onChange={(v) => patch({ subsidyInSeparateRow: v })} />
              补贴在明细表末尾单独一行展示（西门子风格）
            </label>
          </div>
        </Card>

        {/* 出差补贴标准 */}
        <Card title="出差补贴标准（管理员配置）" icon={<BadgeCheck className="w-5 h-5" />} color="from-amber-500 to-orange-500"
          subtitle="不同出差类型对应不同的每日补贴金额。报销单中选择出差类型和天数后会自动汇总到「出差补贴」行。默认国内出差 80 元/天。">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm">
              <Switch checked={form.halfDaySubsidyEnabled} onChange={(v) => patch({ halfDaySubsidyEnabled: v })} />
              <span className="text-slate-700 dark:text-slate-200">允许「半天补贴」（按单日标准 × 50%）</span>
            </label>
            <div className="flex-1" />
            <Field label="默认补贴类型" hint="新建报销单时的默认选中项">
              <select value={form.defaultSubsidyKey} onChange={(e) => patch({ defaultSubsidyKey: e.target.value })}
                className={INPUT}>
                {form.subsidies.filter((s) => s.enabled).map((s) =>
                  <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium w-10">启用</th>
                  <th className="px-3 py-2.5 text-left font-medium">出差类型名称</th>
                  <th className="px-3 py-2.5 text-left font-medium w-28">每天标准（元）</th>
                  <th className="px-3 py-2.5 text-left font-medium w-24">天数上限</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {form.subsidies.map((s, i) => (
                  <tr key={s.key + i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                    <td className="px-3 py-2"><Switch checked={s.enabled} onChange={(v) => updateSubsidy(i, { enabled: v })} /></td>
                    <td className="px-3 py-2">
                      <input value={s.label} onChange={(e) => updateSubsidy(i, { label: e.target.value })}
                        className={`${INPUT} !py-1.5`} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">¥</span>
                        <input type="number" min={0} step={1} value={s.perDay}
                          onChange={(e) => updateSubsidy(i, { perDay: Math.max(0, +e.target.value || 0) })}
                          className={`${INPUT} !py-1.5`} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} step={1} value={s.maxDays || 0}
                        onChange={(e) => updateSubsidy(i, { maxDays: Math.max(0, +e.target.value || 0) })}
                        className={`${INPUT} !py-1.5`} placeholder="0=不限" />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeSubsidy(i)}
                        title="删除此类型"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addSubsidy}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors">
            <Plus className="w-3.5 h-3.5" /> 新增出差类型
          </button>
        </Card>

        {/* 签字审批节点 */}
        <Card title="签字审批流程（报销单底部签字栏）" icon={<FileSignature className="w-5 h-5" />} color="from-violet-500 to-fuchsia-500"
          subtitle="按顺序展示在签字栏中，从左到右依次为：申请人 → 部门负责人 → 财务审核 → 总经理批准。报销人递交前需确认自己已签字。">
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium w-12">#</th>
                  <th className="px-3 py-2.5 text-left font-medium w-10">启用</th>
                  <th className="px-3 py-2.5 text-left font-medium">签字节点名称</th>
                  <th className="px-3 py-2.5 text-left font-medium">占位提示（建议角色）</th>
                  <th className="px-3 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {form.signerLevels.map((s, i) => (
                  <tr key={s.key + i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30">
                    <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i + 1}</td>
                    <td className="px-3 py-2"><Switch checked={s.enabled} onChange={(v) => updateSigner(i, { enabled: v })} /></td>
                    <td className="px-3 py-2">
                      <input value={s.title} onChange={(e) => updateSigner(i, { title: e.target.value })}
                        className={`${INPUT} !py-1.5`} />
                    </td>
                    <td className="px-3 py-2">
                      <input value={s.placeholderRole} onChange={(e) => updateSigner(i, { placeholderRole: e.target.value })}
                        className={`${INPUT} !py-1.5`} />
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeSigner(i)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                        <Minus className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addSigner}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors">
            <Plus className="w-3.5 h-3.5" /> 新增签字节点
          </button>
        </Card>

        {/* 字段开关 + 底部说明 */}
        <Card title="附加字段与制度说明" icon={<Users className="w-5 h-5" />} color="from-slate-500 to-slate-700">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <CheckboxRow checked={form.requireEmployeeId} onChange={(v) => patch({ requireEmployeeId: v })}
              label="要求填写工号" desc="单据头显示「工号」必填字段" />
            <CheckboxRow checked={form.requireDepartment} onChange={(v) => patch({ requireDepartment: v })}
              label="要求填写所属部门" desc="单据头显示「部门」必填字段" />
            <CheckboxRow checked={form.requireProjectCode} onChange={(v) => patch({ requireProjectCode: v })}
              label="要求填写项目号" desc="单据头显示「项目编号/成本中心」字段" />
          </div>
          <div className="mt-5">
            <Field label="报销制度摘要 / 备注" hint="会打印在报销单最底部，用于告知制度、规则、联系方式等。支持换行。">
              <textarea rows={4} value={form.footerNotes} onChange={(e) => patch({ footerNotes: e.target.value })}
                className={`${INPUT} resize-none`}
                placeholder="说明：① 所有费用须凭真实合法发票报销…" />
            </Field>
          </div>
        </Card>
      </section>

      {/* 右：说明卡 */}
      <aside className="space-y-6 h-fit">
        <Card title="管理员权限提示" icon={<BadgeCheck className="w-5 h-5" />} color="from-rose-500 to-red-500" compact>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed list-disc list-inside marker:text-rose-400">
            <li>本 Tab 的配置<b className="text-slate-800 dark:text-slate-100">建议仅由公司管理员修改</b>，普通报销人保持默认即可。</li>
            <li>修改后点「保存全部设置」，所有新建电子表格报销单会立即生效。</li>
            <li>补贴标准、签字层级改动<b>不影响已保存的历史报销单</b>（历史单据保留创建时快照）。</li>
          </ul>
        </Card>
        <Card title="西门子风格报销单要点" icon={<Receipt className="w-5 h-5" />} color="from-sky-500 to-blue-600" compact>
          <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed list-decimal list-inside marker:text-sky-400 marker:font-semibold">
            <li>单据头：<b>编号 · 报销人 · 部门 · 出差事由 · 起止日期 · 出差地点</b></li>
            <li>明细表：按日期分多行，每行包含 <b>交通 / 打车 / 住宿 / 餐饮 / 其它</b> 5 列 + 小计</li>
            <li>末尾单独一行：<b>出差补贴</b>（天数 × 标准，按设置中的规则自动计算）</li>
            <li>最下：<b>大写金额合计</b>、<b>张数统计</b>、<b>多级签字栏</b>（按签字节点顺序）</li>
          </ol>
        </Card>
      </aside>
    </div>
  )
}

/* ======================================================================
   小组件
   ====================================================================== */
function Field(props: {
  label: string
  hint?: string
  icon?: React.ReactNode
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${props.className || ''}`}>
      <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 inline-flex items-center gap-1.5">
        {props.icon && <span className="text-slate-400">{props.icon}</span>}
        {props.label}
        {props.required && <span className="text-red-500 font-normal">*</span>}
      </span>
      {props.children}
      {props.hint && (
        <span className="block mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {props.hint}
        </span>
      )}
    </label>
  )
}

function InfoLine({
  icon,
  label,
  value,
  dim,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  dim?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 flex-shrink-0 ${dim ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <span className={`text-slate-400 dark:text-slate-500 mr-1.5 ${dim ? 'opacity-60' : ''}`}>{label}：</span>
        <span
          className={`break-all ${dim ? 'text-slate-400 dark:text-slate-500 italic' : 'text-slate-700 dark:text-slate-200'} ${mono ? 'font-mono' : ''}`}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

const INPUT = 'w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 outline-none text-slate-800 dark:text-slate-100'

function Card(props: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  /** 渐变颜色，如 from-sky-500 to-indigo-500 */
  color?: string
  compact?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm ${props.compact ? 'p-5' : 'p-6'} space-y-4`}>
      {(props.title || props.icon) && (
        <div className="flex items-start gap-3">
          {props.icon && (
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${props.color || 'from-brand-500 to-indigo-500'} flex items-center justify-center text-white flex-shrink-0 shadow-sm`}>
              {props.icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{props.title}</h2>
            {props.subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{props.subtitle}</p>}
          </div>
        </div>
      )}
      <div>{props.children}</div>
    </section>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

function CheckboxRow(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  desc?: string
}) {
  return (
    <label className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
      props.checked
        ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-1 ring-brand-500/20'
        : 'border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-600'
    }`}>
      <input
        type="checkbox"
        className="mt-0.5 accent-brand-600 w-4 h-4"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{props.label}</div>
        {props.desc && <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{props.desc}</div>}
      </div>
    </label>
  )
}

/* ======================================================================
   Tab 5: 费用标准与预算控制（汇联易风格）
   ====================================================================== */
const CATEGORY_OPTIONS = [
  { value: 'transport', label: '交通费' },
  { value: 'taxi',      label: '打车费' },
  { value: 'hotel',     label: '住宿费' },
  { value: 'meal',      label: '餐饮费' },
  { value: 'other',     label: '其它费用' },
] as const

const TRIP_TYPE_OPTIONS = [
  { value: 'any',      label: '全部' },
  { value: 'domestic', label: '国内出差' },
  { value: 'overseas', label: '海外出差' },
  { value: 'local',    label: '市内/近郊' },
  { value: 'remote',   label: '偏远地区' },
] as const

const OVER_LIMIT_OPTIONS = [
  { value: 'warn',       label: '仅提示' },
  { value: 'block',      label: '阻断提交' },
  { value: 'escalation', label: '升级审批' },
] as const

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

function ExpenseStandardTab({ form, setForm }: {
  form: ReimbursementPolicy
  setForm: React.Dispatch<React.SetStateAction<ReimbursementPolicy>>
}) {
  const standards = form.expenseStandards || []
  const bc = form.budgetControl
  const routing = form.approvalRouting || []

  /* --- 费用标准规则操作 --- */
  const addStandard = () => {
    const newRule: ExpenseStandardRule = {
      id: uid(),
      level: 'staff',
      category: 'hotel',
      tripType: 'domestic',
      perReceiptLimit: 0,
      perDayLimit: 400,
      overLimitAction: 'warn',
      remark: '',
    }
    setForm((f) => ({ ...f, expenseStandards: [...(f.expenseStandards || []), newRule] }))
  }
  const updateStandard = (id: string, patch: Partial<ExpenseStandardRule>) => {
    setForm((f) => ({ ...f, expenseStandards: (f.expenseStandards || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }
  const removeStandard = (id: string) => {
    setForm((f) => ({ ...f, expenseStandards: (f.expenseStandards || []).filter((r) => r.id !== id) }))
  }

  /* --- 预算控制操作 --- */
  const updateBudgetControl = (patch: Partial<typeof bc>) => {
    setForm((f) => ({ ...f, budgetControl: { ...f.budgetControl, ...patch } as typeof f.budgetControl }))
  }

  /* --- 审批路由操作 --- */
  const addRouting = () => {
    const newRule: ApprovalRoutingRule = {
      id: uid(),
      name: '新规则',
      enabled: true,
      amountThreshold: 5000,
      hasOverStandard: false,
      hasOverBudget: false,
      appendSignerKey: 'gm',
    }
    setForm((f) => ({ ...f, approvalRouting: [...(f.approvalRouting || []), newRule] }))
  }
  const updateRouting = (id: string, patch: Partial<ApprovalRoutingRule>) => {
    setForm((f) => ({ ...f, approvalRouting: (f.approvalRouting || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))
  }
  const removeRouting = (id: string) => {
    setForm((f) => ({ ...f, approvalRouting: (f.approvalRouting || []).filter((r) => r.id !== id) }))
  }

  const inputCls = 'w-full px-2 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md outline-none focus:ring-2 focus:ring-brand-500/30 text-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-5">
      {/* ===== 费用标准规则 ===== */}
      <Card title="差旅费用标准规则" icon={<Shield className="w-5 h-5" />} color="from-amber-500 to-orange-500"
        subtitle="按职级 × 费用类别 × 差旅类型配置单笔/单日限额。报销单填写时实时检查，超标可触发提示/阻断/升级审批。">
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-300 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">职级</th>
                <th className="text-left px-3 py-2 font-medium">费用类别</th>
                <th className="text-left px-3 py-2 font-medium">差旅类型</th>
                <th className="text-right px-3 py-2 font-medium">单笔限额</th>
                <th className="text-right px-3 py-2 font-medium">单日限额</th>
                <th className="text-left px-3 py-2 font-medium">超标处理</th>
                <th className="text-left px-3 py-2 font-medium">备注</th>
                <th className="text-center px-3 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {standards.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-slate-400 text-sm">暂无规则，点击下方「添加规则」</td></tr>
              )}
              {standards.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-3 py-2">
                    <select className={inputCls} value={rule.level} onChange={(e) => updateStandard(rule.id, { level: e.target.value as EmployeeLevel })}>
                      {EMPLOYEE_LEVELS.map((lv) => <option key={lv.value} value={lv.value}>{lv.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select className={inputCls} value={rule.category} onChange={(e) => updateStandard(rule.id, { category: e.target.value as ExpenseStandardRule['category'] })}>
                      {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select className={inputCls} value={rule.tripType} onChange={(e) => updateStandard(rule.id, { tripType: e.target.value })}>
                      {TRIP_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className={`${inputCls} text-right`} value={rule.perReceiptLimit} onChange={(e) => updateStandard(rule.id, { perReceiptLimit: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" className={`${inputCls} text-right`} value={rule.perDayLimit} onChange={(e) => updateStandard(rule.id, { perDayLimit: Number(e.target.value) || 0 })} />
                  </td>
                  <td className="px-3 py-2">
                    <select className={inputCls} value={rule.overLimitAction} onChange={(e) => updateStandard(rule.id, { overLimitAction: e.target.value as ExpenseStandardRule['overLimitAction'] })}>
                      {OVER_LIMIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input className={inputCls} value={rule.remark || ''} onChange={(e) => updateStandard(rule.id, { remark: e.target.value })} placeholder="选填" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => removeStandard(rule.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors" title="删除">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <button onClick={addStandard} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 添加规则
          </button>
        </div>
      </Card>

      {/* ===== 预算控制 ===== */}
      <Card title="预算控制" icon={<Gauge className="w-5 h-5" />} color="from-emerald-500 to-teal-500"
        subtitle="按部门/项目设置预算额度，报销单递交时实时核算使用率，超预算可触发提示/阻断/升级审批。">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">启用预算控制</span>
            </div>
            <Switch checked={bc?.enabled ?? false} onChange={(v) => updateBudgetControl({ enabled: v })} />
          </div>
          {bc?.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">预算周期</label>
                <select className={inputCls} value={bc.period} onChange={(e) => updateBudgetControl({ period: e.target.value as 'monthly' | 'quarterly' | 'yearly' })}>
                  <option value="monthly">月度</option>
                  <option value="quarterly">季度</option>
                  <option value="yearly">年度</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">超预算处理策略</label>
                <select className={inputCls} value={bc.overBudgetAction} onChange={(e) => updateBudgetControl({ overBudgetAction: e.target.value as 'warn' | 'block' | 'escalation' })}>
                  {OVER_LIMIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}
          {bc?.enabled && (
            <div className="text-xs text-slate-500 dark:text-slate-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              提示：部门预算和项目预算的额度明细请在「预算管理」页面维护。
            </div>
          )}
        </div>
      </Card>

      {/* ===== 智能审批路由 ===== */}
      <Card title="智能审批路由规则" icon={<ClipboardList className="w-5 h-5" />} color="from-violet-500 to-fuchsia-500"
        subtitle="满足条件（金额阈值/超标/超预算）时自动追加审批节点。规则间为 OR 关系，命中任一即触发。">
        <div className="space-y-3">
          {routing.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">暂无规则，点击下方「添加规则」</div>
          )}
          {routing.map((rule) => (
            <div key={rule.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={rule.enabled} onChange={(v) => updateRouting(rule.id, { enabled: v })} />
                <input
                  className={`flex-1 ${inputCls} font-medium`}
                  value={rule.name}
                  onChange={(e) => updateRouting(rule.id, { name: e.target.value })}
                  placeholder="规则名称"
                />
                <button onClick={() => removeRouting(rule.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">金额阈值（元）</label>
                  <input type="number" className={inputCls} value={rule.amountThreshold} onChange={(e) => updateRouting(rule.id, { amountThreshold: Number(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">追加审批节点</label>
                  <select className={inputCls} value={rule.appendSignerKey} onChange={(e) => updateRouting(rule.id, { appendSignerKey: e.target.value })}>
                    {(form.signerLevels || []).map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
                  </select>
                </div>
                <label className="flex items-end gap-2 text-xs text-slate-600 dark:text-slate-300 pb-2">
                  <input type="checkbox" className="accent-brand-600 w-4 h-4" checked={rule.hasOverStandard} onChange={(e) => updateRouting(rule.id, { hasOverStandard: e.target.checked })} />
                  存在超标时触发
                </label>
                <label className="flex items-end gap-2 text-xs text-slate-600 dark:text-slate-300 pb-2">
                  <input type="checkbox" className="accent-brand-600 w-4 h-4" checked={rule.hasOverBudget} onChange={(e) => updateRouting(rule.id, { hasOverBudget: e.target.checked })} />
                  超预算时触发
                </label>
              </div>
            </div>
          ))}
          <button onClick={addRouting} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> 添加规则
          </button>
        </div>
      </Card>
    </div>
  )
}
