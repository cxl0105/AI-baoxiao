import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { companies, companySettings } from '../db/schema'
import { authMiddleware, currentUser, isAdminOrFinance } from '../lib/auth'

const s = new Hono()
s.use('*', authMiddleware)

const num = (v: any): number => Number(v || 0)

// 获取（或惰性创建）当前公司的 settings 行
async function getOrCreateSettings(companyId: string) {
  const rows = await db.select().from(companySettings).where(eq(companySettings.companyId, companyId)).limit(1)
  if (rows[0]) return rows[0]
  const [r] = await db
    .insert(companySettings)
    .values({ companyId, company: {}, policy: {}, ocr: {}, ui: {} })
    .returning()
  return r
}

async function getCompanyId(): Promise<string> {
  const rows = await db.select().from(companies).limit(1)
  if (rows[0]) return rows[0].id
  const [cc] = await db.insert(companies).values({ name: '默认公司' }).returning()
  return cc.id
}

// GET /api/v1/settings — 返回公司信息 + 报销规则 + OCR + UI
s.get('/', async (c) => {
  const companyId = await getCompanyId()
  const row = await getOrCreateSettings(companyId)
  return c.json({
    code: 'SUCCESS',
    data: {
      company: row.company || {},
      policy: row.policy || {},
      ocr: row.ocr || {},
      ui: row.ui || {},
    },
  })
})

const settingsSchema = z.object({
  company: z.any().optional(),
  policy: z.any().optional(),
  ocr: z.any().optional(),
  ui: z.any().optional(),
})

// PUT /api/v1/settings — 保存（仅管理员/财务可写）
s.put(
  '/',
  zValidator('json', settingsSchema, (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败' }, 400)
  }),
  async (c) => {
    const me = currentUser(c)
    if (!isAdminOrFinance(me.role)) return c.json({ code: 'FORBIDDEN', message: '无权限' }, 403)
    const data = c.req.valid('json')
    const companyId = await getCompanyId()
    await getOrCreateSettings(companyId)
    const upd: any = { updatedAt: new Date() }
    if (data.company !== undefined) upd.company = data.company
    if (data.policy !== undefined) upd.policy = data.policy
    if (data.ocr !== undefined) upd.ocr = data.ocr
    if (data.ui !== undefined) upd.ui = data.ui
    await db.update(companySettings).set(upd).where(eq(companySettings.companyId, companyId))
    return c.json({ code: 'SUCCESS', message: '设置已保存' })
  }
)

export const settingsRoutes = s
