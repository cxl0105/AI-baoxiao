import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'AI 智能报销系统',
  description: '一站式智能报销管理平台 - SaaS 多租户解决方案',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans antialiased min-h-screen bg-slate-50 dark:bg-slate-900">
        {children}
      </body>
    </html>
  )
}
