import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { timeout } from 'hono/timeout'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- 加载 apps/api/.env（tsx watch 默认不会自动读 .env；这里做一个零依赖的轻量加载）----
// 注意：系统环境变量（或用户终端 export 的变量）优先级 > .env 文件
function loadLocalEnvFile() {
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = dirname(__filename)
    // 从 src/index.ts 往上一级到 apps/api 根目录
    const envPath = resolve(__dirname, '..', '.env')
    if (!existsSync(envPath)) return
    const raw = readFileSync(envPath, 'utf-8')
    let lineNo = 0
    for (const rawLine of raw.split(/\r?\n/)) {
      lineNo++
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      // 支持 KEY=value 和 KEY="value" 和 KEY='value'
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      const [, key, tail] = m
      // 只在该变量未被「系统环境变量/命令行注入」覆盖时才写入 process.env
      if (key in process.env) continue
      let value = tail.trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      // 去掉行尾 # 注释（只处理不带空格紧邻的情况，避免误剪）
      const hashIdx = value.search(/\s+#\s*/)
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim()
      process.env[key] = value
    }
    console.log(`[env] 已加载 ${envPath}`)
  } catch (err: any) {
    console.warn('[env] 加载 .env 文件失败（忽略）：' + (err?.message || String(err)))
  }
}
loadLocalEnvFile()

import { authRoutes } from './routes/auth'
import { reimbursementRoutes } from './routes/reimbursement'
import { userRoutes } from './routes/user'
import { ocrRoutes } from './routes/ocr'
import { statsRoutes } from './routes/stats'
import { approvalRecordsRoutes } from './routes/approval-records'
import { budgetRoutes } from './routes/budgets'
import { settingsRoutes } from './routes/settings'
import { invoiceRoutes } from './routes/invoices'
import { analyticsRoutes } from './routes/analytics'
import { apiReference } from './routes/docs'

const app = new Hono({ strict: false })

// Middlewares
app.use('*', logger())
// OCR 识别链路较长（上传 + 视觉大模型调用通常 10~90s），默认超时 120s；其他路由仍用 30s。
app.use('/api/v1/ocr/*', timeout(120_000))
app.use('*', timeout(30_000))
app.use('*', prettyJSON())
app.use(
  '*',
  cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://your-domain.com']
      : ['http://localhost:3000', 'http://localhost:5173'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  })
)

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'ai-reimbursement-api',
    version: '1.0.0',
  })
})

// API routes
const api = new Hono()
api.route('/auth', authRoutes)
api.route('/reimbursements', reimbursementRoutes)
api.route('/users', userRoutes)
api.route('/ocr', ocrRoutes)
api.route('/stats', statsRoutes)
api.route('/approval-records', approvalRecordsRoutes)
api.route('/budgets', budgetRoutes)
api.route('/settings', settingsRoutes)
api.route('/invoices', invoiceRoutes)
api.route('/analytics', analyticsRoutes)

app.route('/api/v1', api)

// API Documentation
app.route('/docs', apiReference)

// 404
app.notFound((c) => {
  return c.json({
    code: 'NOT_FOUND',
    message: '请求的资源不存在',
  }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('[API Error]', err)

  if (err instanceof HTTPException) {
    return c.json({
      code: err.status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR',
      message: err.message,
    }, err.status)
  }

  return c.json({
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? '服务器内部错误，请稍后重试'
      : err.message || '服务器内部错误',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  }, 500)
})

const port = Number(process.env.PORT) || 4000
console.log(`\n🚀 AI 报销系统 API 服务启动中...`)
console.log(`📡 本地地址:    http://localhost:${port}`)
console.log(`📚 接口文档:    http://localhost:${port}/docs`)
console.log(`💚 健康检查:    http://localhost:${port}/health\n`)

serve({
  fetch: app.fetch,
  port,
})
