import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { eq, or } from 'drizzle-orm'
import { db } from '../db'
import { users, companies } from '../db/schema'
import { signToken, authMiddleware, currentUser } from '../lib/auth'

const auth = new Hono()

function isPhone(s: string): boolean {
  return /^1[3-9]\d{9}$/.test(s.trim())
}

function toUser(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email || '',
    phone: u.phone || '',
    role: u.role,
    department: u.department || '',
  }
}

// --- Schemas ---
const loginSchema = z.object({
  identifier: z.string().min(1, '请输入手机号或邮箱'),
  password: z.string().min(6, '密码至少 6 个字符'),
})

const registerSchema = z.object({
  name: z.string().min(2, '姓名至少 2 个字符'),
  phone: z.string().min(1, '请输入手机号').length(11, '手机号必须为 11 位数字').regex(/^1[3-9]\d{9}$/, '手机号格式不正确，请输入中国大陆手机号'),
  email: z.string().optional().or(z.literal('')).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), '邮箱格式不正确，请检查'),
  password: z.string().min(1, '请输入密码').min(8, '密码至少 8 个字符').max(64, '密码最多 64 个字符').regex(/[a-zA-Z]/, '密码需包含字母').regex(/[0-9]/, '密码需包含数字'),
  confirmPassword: z.string().optional(),
  companyName: z.string().optional(),
})

// --- 登录 ---
auth.post(
  '/login',
  zValidator('json', loginSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const { identifier, password } = c.req.valid('json')
    const key = identifier.trim().toLowerCase()
    const rows = await db
      .select()
      .from(users)
      .where(or(eq(users.phone, key), eq(users.email, key)))
      .limit(1)
    const u = rows[0]
    if (!u) return c.json({ code: 'AUTH_FAILED', message: '账号或密码错误' }, 401)
    const ok = await bcrypt.compare(password, u.passwordHash)
    if (!ok) return c.json({ code: 'AUTH_FAILED', message: '账号或密码错误' }, 401)
    const token = signToken({ sub: u.id, role: u.role, name: u.name })
    return c.json({ code: 'SUCCESS', data: { token, user: toUser(u) } })
  }
)

// --- 注册 ---
auth.post(
  '/register',
  zValidator('json', registerSchema, (result, c) => {
    if (!result.success) {
      return c.json({ code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() }, 400)
    }
  }),
  async (c) => {
    const data = c.req.valid('json')
    if (data.confirmPassword && data.confirmPassword !== data.password) {
      return c.json({ code: 'VALIDATION_ERROR', message: '两次输入的密码不一致', errors: { confirmPassword: { _errors: ['两次输入的密码不一致'] } } }, 400)
    }
    const email = data.email ? data.email.toLowerCase() : null
    const conds = [eq(users.phone, data.phone)]
    if (email) conds.push(eq(users.email, email))
    const existing = await db.select().from(users).where(or(...conds)).limit(1)
    if (existing[0]) {
      return c.json({ code: 'CONFLICT', message: '该手机号或邮箱已注册' }, 409)
    }
    let companyRows = await db.select().from(companies).limit(1)
    let company = companyRows[0]
    if (!company) {
      const [cc] = await db.insert(companies).values({ name: data.companyName || '默认公司' }).returning()
      company = cc
    }
    const hash = await bcrypt.hash(data.password, 10)
    const [u] = await db
      .insert(users)
      .values({
        companyId: company.id,
        name: data.name,
        phone: data.phone,
        email,
        passwordHash: hash,
        role: 'employee',
        department: null,
      })
      .returning()
    return c.json({ code: 'SUCCESS', message: '注册成功', data: { userId: u.id, tenantId: company.id } }, 201)
  }
)

// --- 退出 ---
auth.post('/logout', async (c) => {
  return c.json({ code: 'SUCCESS', message: '退出成功' })
})

// --- 当前用户 ---
auth.get('/me', authMiddleware, async (c) => {
  const payload = currentUser(c)
  const rows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1)
  const u = rows[0]
  if (!u) return c.json({ code: 'UNAUTHORIZED', message: '用户不存在' }, 401)
  return c.json({ code: 'SUCCESS', data: toUser(u) })
})

export const authRoutes = auth
