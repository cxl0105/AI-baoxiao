import Link from 'next/link'
import { Check, FileText, Sparkles, Building2, Users, Phone, ArrowRight } from 'lucide-react'

// 四档套餐（与后端 lib/plans.ts 对齐，前端展示用）
const PLANS = [
  {
    key: 'free',
    name: '免费版',
    priceLabel: '免费',
    price: '0',
    unit: '',
    desc: '适合个人或初创体验，手动录入发票',
    highlight: false,
    features: [
      '手动输入发票',
      '每月 10 张发票额度',
      '基础审批流程',
      '1 个企业 / 3 名成员',
      '报销单列表查询',
    ],
    cta: '免费开始',
  },
  {
    key: 'basic',
    name: '标准版',
    priceLabel: '299 元/人/年',
    price: '299',
    unit: '元/人/年',
    desc: '适合成长型中小企业，AI 识别提效',
    highlight: true,
    features: [
      'AI OCR 发票识别（不限张数）',
      '完整三级审批链（主管+财务→总经理）',
      '预算管理与统计分析',
      '成员管理（多角色权限）',
      '发票池 / 费用标准',
      '全部功能，人数越多越划算',
    ],
    cta: '立即开通',
  },
  {
    key: 'pro',
    name: '专业版',
    priceLabel: '399 元/人/年',
    price: '399',
    unit: '元/人/年',
    desc: '适合有差旅补贴制度的规范企业',
    highlight: false,
    features: [
      '标准版全部功能',
      '电子表格报销单（差旅补贴）',
      '费用标准校验（按职级/出差类型）',
      '智能审批路由（超标升级）',
      '费用分摊（多部门/项目）',
      '优先技术支持',
    ],
    cta: '联系开通',
  },
  {
    key: 'enterprise',
    name: '企业版',
    priceLabel: '联系销售',
    price: '定制',
    unit: '',
    desc: '集团/多法人/私有化部署需求',
    highlight: false,
    features: [
      '专业版全部功能',
      '私有化部署',
      '定制开发（对接 ERP/财务系统）',
      '专属客户成功经理',
      'SLA 服务保障',
      'API 开放接口',
    ],
    cta: '联系销售',
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <Link href="/" className="font-semibold text-lg text-slate-900 dark:text-white">智报销</Link>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600">首页</Link>
            <Link href="/login" className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600">登录</Link>
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors"
            >
              免费试用
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-700/30 mb-6">
              <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              <span className="text-sm font-medium text-brand-700 dark:text-brand-300">专为中小企业打造</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
              简单透明的<span className="text-brand-600 dark:text-brand-400">定价</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              按人数计费，无隐藏费用。免费版即可体验，随业务增长灵活升级。
            </p>
          </div>
        </section>

        {/* 套餐卡片 */}
        <section className="pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {PLANS.map((p) => (
              <div
                key={p.key}
                className={`relative rounded-2xl border bg-white dark:bg-slate-900 p-6 flex flex-col ${
                  p.highlight
                    ? 'border-brand-500 shadow-xl shadow-brand-500/10 ring-2 ring-brand-500'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-xs font-semibold text-white bg-brand-600 rounded-full shadow">
                      中小企业首选
                    </span>
                  </div>
                )}
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{p.name}</h3>
                <p className="text-xs text-slate-400 mt-1 min-h-[2.5rem]">{p.desc}</p>
                <div className="mt-4 mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-slate-900 dark:text-white">{p.price}</span>
                    {p.unit && <span className="text-sm text-slate-400">{p.unit}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{p.priceLabel}</p>
                </div>
                <ul className="space-y-2.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <Check className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={p.key === 'enterprise' ? '/contact' : '/register'}
                  className={`mt-6 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                    p.highlight
                      ? 'text-white bg-brand-600 hover:bg-brand-700'
                      : 'text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/30'
                  }`}
                >
                  {p.cta}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* 说明 */}
        <section className="pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="flex items-start gap-3">
              <Users className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white text-sm">按人数计费</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">只按活跃成员数收费，不按发票张数额外收费（付费版不限量）。</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Building2 className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white text-sm">中小企业友好</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">10 人团队标准版年费仅 2990 元起，远低于传统报销系统。</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white text-sm">更高需求？</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">集团/私有化/定制对接，请联系公司销售人员获取专属方案。</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
