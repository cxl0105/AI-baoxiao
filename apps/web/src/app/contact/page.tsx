import Link from 'next/link'
import { Building2, MapPin, Phone, FileText, ArrowLeft } from 'lucide-react'

export default function ContactPage() {
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
            <Link href="/pricing" className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600">套餐价格</Link>
            <Link href="/login" className="text-sm text-slate-600 dark:text-slate-300 hover:text-brand-600">登录</Link>
          </nav>
        </div>
      </header>

      <main className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8">
            <ArrowLeft className="w-4 h-4" /> 返回套餐价格
          </Link>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg overflow-hidden">
            <div className="px-8 py-10">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
                企业版 · 联系销售
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                集团 / 多法人 / 私有化部署 / 定制开发，请联系我们的销售人员获取专属方案。
              </p>

              <div className="space-y-5">
                <div className="flex items-start gap-4 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-11 h-11 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-400 mb-0.5">公司名称</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">西津门（赣州）智能科技有限公司</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-11 h-11 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-400 mb-0.5">公司地址</p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">赣州市高新区火炬大道 1 号</p>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="w-11 h-11 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-400 mb-0.5">联系电话</p>
                    <a
                      href="tel:15988809757"
                      className="text-lg font-semibold text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      15988809757
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                工作时间：周一至周五 9:00 - 18:00，欢迎来电咨询。
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
