import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import bcrypt from 'bcryptjs'
import { eq, or } from 'drizzle-orm'
import { db } from '../db'
import { users, companies } from '../db/schema'
import { signToken, authMiddleware, currentUser } from '../lib/auth'
import { sendVerificationCodeEmail, mailConfigured } from '../lib/mailer'

const auth = new Hono()

// --- 邮箱验证码存储（内存 Map，10 分钟过期；单进程 tsx 足够，重启后需重新发送） ---
interface ResetCodeEntry {
  code: string
  expiresAt: number
  attempts: number
}
const resetCodes = new Map<string, ResetCodeEntry>()
const CODE_TTL_MS = 10 * 60 * 1000
const CODE_MAX_ATTEMPTS = 5

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

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
    companyId: u.companyId || '',
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
  // 企业纳税号（统一社会信用代码，多租户隔离的租户键）
  taxNo: z.string().min(1, '请输入企业纳税号（统一社会信用代码）').max(32, '纳税号过长'),
  department: z.string().optional(),
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
    // 附带企业基础信息
    let companyInfo: any = null
    if (u.companyId) {
      const cRows = await db.select().from(companies).where(eq(companies.id, u.companyId)).limit(1)
      const c0 = cRows[0]
      if (c0) {
        companyInfo = {
          id: c0.id,
          name: c0.name,
          taxNo: c0.taxNo || '',
          fullName: c0.fullName || c0.name || '',
          industry: c0.industry || '',
          scale: c0.scale || '',
          address: c0.address || '',
          creditCode: c0.creditCode || '',
          contactPhone: c0.contactPhone || '',
        }
      }
    }
    return c.json({ code: 'SUCCESS', data: { token, user: toUser(u), company: companyInfo } })
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

    // 多租户：按纳税号查企业
    const taxNo = data.taxNo.trim().toUpperCase()
    let companyRows = await db.select().from(companies).where(eq(companies.taxNo, taxNo)).limit(1)
    let company = companyRows[0]
    let isFirstUser = false
    if (!company) {
      // 企业不存在 → 创建，注册者成为该企业第一个用户（管理员）
      const [cc] = await db.insert(companies).values({
        name: data.companyName || '新企业',
        taxNo,
        fullName: data.companyName || '新企业',
      }).returning()
      company = cc
      isFirstUser = true
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
        // 第一个注册者 = 企业管理员；后续同号注册者 = 普通员工
        role: isFirstUser ? 'admin' : 'employee',
        department: data.department || null,
      })
      .returning()
    return c.json({
      code: 'SUCCESS',
      message: isFirstUser ? '企业已创建，您已成为企业管理员' : '已加入企业',
      data: { userId: u.id, tenantId: company.id, isFirstUser },
    }, 201)
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

// --- 忘记密码：发送验证码 ---
const forgotSchema = z.object({
  email: z.string().min(1, '请输入邮箱').email('邮箱格式不正确'),
})

auth.post(
  '/forgot-password',
  zValidator('json', forgotSchema, (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: '邮箱格式不正确' }, 400)
  }),
  async (c) => {
    const { email } = c.req.valid('json')
    const key = email.trim().toLowerCase()

    // 查用户是否存在（不泄露账号是否存在，统一返回成功）
    const rows = await db.select().from(users).where(eq(users.email, key)).limit(1)
    if (!rows[0]) {
      // 账号不存在也返回成功，避免被用于枚举邮箱
      return c.json({ code: 'SUCCESS', message: '如果该邮箱已注册，验证码将发送至邮箱' })
    }

    if (!mailConfigured()) {
      return c.json({ code: 'MAIL_NOT_CONFIGURED', message: '邮件服务未配置，请联系管理员重置密码' }, 503)
    }

    // 限流：60 秒内不重复发送
    const existing = resetCodes.get(key)
    if (existing && Date.now() - existing.expiresAt < CODE_TTL_MS - 60 * 1000) {
      return c.json({ code: 'TOO_FREQUENT', message: '验证码已发送，请 60 秒后再试' }, 429)
    }

    const code = genCode()
    resetCodes.set(key, { code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0 })

    try {
      await sendVerificationCodeEmail(key, code)
    } catch (e: any) {
      console.error('[forgot-password] 邮件发送失败:', e?.message || e)
      return c.json({ code: 'MAIL_SEND_FAILED', message: '邮件发送失败，请稍后再试或联系管理员' }, 502)
    }

    return c.json({ code: 'SUCCESS', message: '验证码已发送至邮箱，10 分钟内有效' })
  }
)

// --- 忘记密码：校验验证码并重置密码 ---
const resetSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  code: z.string().length(6, '验证码为 6 位数字'),
  password: z.string().min(8, '密码至少 8 个字符').max(64, '密码最多 64 个字符'),
})

auth.post(
  '/reset-password',
  zValidator('json', resetSchema, (result, c) => {
    if (!result.success) return c.json({ code: 'VALIDATION_ERROR', message: result.error.issues?.[0]?.message || '参数验证失败' }, 400)
  }),
  async (c) => {
    const { email, code, password } = c.req.valid('json')
    const key = email.trim().toLowerCase()

    const entry = resetCodes.get(key)
    if (!entry || Date.now() > entry.expiresAt) {
      return c.json({ code: 'CODE_EXPIRED', message: '验证码已过期，请重新获取' }, 400)
    }
    if (entry.attempts >= CODE_MAX_ATTEMPTS) {
      resetCodes.delete(key)
      return c.json({ code: 'CODE_EXPIRED', message: '尝试次数过多，请重新获取验证码' }, 400)
    }
    entry.attempts += 1
    if (entry.code !== code.trim()) {
      return c.json({ code: 'CODE_INVALID', message: '验证码错误' }, 400)
    }

    const rows = await db.select().from(users).where(eq(users.email, key)).limit(1)
    const u = rows[0]
    if (!u) return c.json({ code: 'NOT_FOUND', message: '账号不存在' }, 404)

    const hash = await bcrypt.hash(password, 10)
    await db.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, u.id))
    resetCodes.delete(key)

    return c.json({ code: 'SUCCESS', message: '密码已重置，请使用新密码登录' })
  }
)

export const authRoutes = auth
