import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const auth = new Hono()

// 中国大陆手机号判断
function isPhone(s: string): boolean {
  return /^1[3-9]\d{9}$/.test(s.trim())
}

// --- 演示账号（与前端 rbac.ts DEMO_ACCOUNTS 保持一致）---
// key 为 email 或 phone 都可以查到同一个账号
const DEMO_USERS_BY_EMAIL: Record<string, { id: string; name: string; role: string; department: string; password: string; phone?: string }> = {
  'admin@example.com': { id: 'user_admin_001', name: '管理员', role: 'admin', department: '管理层', password: '123456', phone: '13800000001' },
  'finance@example.com': { id: 'user_finance_001', name: '财务专员', role: 'finance', department: '财务部', password: '123456', phone: '13800000002' },
  'employee@example.com': { id: 'user_employee_001', name: '员工小李', role: 'employee', department: '研发部', password: '123456', phone: '13800000003' },
  'demo@example.com': { id: 'user_demo_001', name: '演示用户', role: 'employee', department: '研发部', password: '123456', phone: '13800000004' },
}

// 生成手机号反向索引
const DEMO_USERS_BY_PHONE: Record<string, (typeof DEMO_USERS_BY_EMAIL)[string]> = {}
for (const u of Object.values(DEMO_USERS_BY_EMAIL)) {
  if (u.phone) DEMO_USERS_BY_PHONE[u.phone] = u
}

function findDemoUserByIdentifier(identifier: string): (typeof DEMO_USERS_BY_EMAIL)[string] | undefined {
  const key = identifier.trim().toLowerCase()
  if (isPhone(key)) return DEMO_USERS_BY_PHONE[key]
  return DEMO_USERS_BY_EMAIL[key]
}

// --- Schemas ---
const loginSchema = z.object({
  identifier: z.string().min(1, '请输入手机号或邮箱'),
  password: z.string().min(6, '密码至少 6 个字符'),
})

const registerSchema = z.object({
  name: z.string().min(2, '姓名至少 2 个字符'),
  phone: z
    .string()
    .min(1, '请输入手机号')
    .length(11, '手机号必须为 11 位数字')
    .regex(/^1[3-9]\d{9}$/, '手机号格式不正确，请输入中国大陆手机号'),
  email: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      '邮箱格式不正确，请检查'
    ),
  password: z
    .string()
    .min(1, '请输入密码')
    .min(8, '密码至少 8 个字符')
    .max(64, '密码最多 64 个字符')
    .regex(/[a-zA-Z]/, '密码需包含字母')
    .regex(/[0-9]/, '密码需包含数字'),
  confirmPassword: z.string().optional(),
  companyName: z.string().optional(),
})

// --- Routes ---
auth.post(
  '/login',
  zValidator('json', loginSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() },
        400
      )
    }
  }),
  async (c) => {
    const { identifier, password } = c.req.valid('json')
    const demoUser = findDemoUserByIdentifier(identifier)
    if (!demoUser || demoUser.password !== password) {
      return c.json(
        { code: 'AUTH_FAILED', message: '账号或密码错误' },
        401
      )
    }
    // 登录返回统一用 email 字段，如果没有邮箱就回填手机号
    const email = Object.keys(DEMO_USERS_BY_EMAIL).find((e) => DEMO_USERS_BY_EMAIL[e] === demoUser) || identifier
    const phone = demoUser.phone || (isPhone(identifier) ? identifier : '')
    return c.json({
      code: 'SUCCESS',
      data: {
        token: 'mock-jwt-token-' + demoUser.role + '-' + Date.now(),
        user: {
          id: demoUser.id,
          name: demoUser.name,
          email,
          phone,
          role: demoUser.role,
          department: demoUser.department,
        },
      },
    })
  }
)

auth.post(
  '/register',
  zValidator('json', registerSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: '参数验证失败', errors: result.error.flatten() },
        400
      )
    }
  }),
  async (c) => {
    const data = c.req.valid('json')
    if (data.confirmPassword && data.confirmPassword !== data.password) {
      return c.json(
        { code: 'VALIDATION_ERROR', message: '两次输入的密码不一致', errors: { confirmPassword: { _errors: ['两次输入的密码不一致'] } } },
        400
      )
    }
    return c.json({
      code: 'SUCCESS',
      message: '注册成功',
      data: {
        userId: 'new-user-id-' + Math.random().toString(36).slice(2, 8),
        tenantId: 'new-tenant-id',
      },
    }, 201)
  }
)

auth.post('/logout', async (c) => {
  return c.json({
    code: 'SUCCESS',
    message: '退出成功',
  })
})

auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const roleMatch = token.match(/mock-jwt-token-([a-z]+)-/)
  const role = roleMatch ? roleMatch[1] : 'employee'
  const email =
    role === 'admin'
      ? 'admin@example.com'
      : role === 'finance'
        ? 'finance@example.com'
        : role === 'employee'
          ? 'employee@example.com'
          : 'demo@example.com'
  const demoUser = DEMO_USERS_BY_EMAIL[email]

  return c.json({
    code: 'SUCCESS',
    data: {
      id: demoUser.id,
      name: demoUser.name,
      email,
      phone: demoUser.phone || '',
      role: demoUser.role,
      department: demoUser.department,
    },
  })
})

export const authRoutes = auth
