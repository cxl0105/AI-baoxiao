import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const auth = new Hono()

// --- 演示账号（与前端 rbac.ts DEMO_ACCOUNTS 保持一致）---
const DEMO_USERS: Record<string, { id: string; name: string; role: string; department: string; password: string }> = {
  'admin@example.com': { id: 'user_admin_001', name: '管理员', role: 'admin', department: '管理层', password: '123456' },
  'finance@example.com': { id: 'user_finance_001', name: '财务专员', role: 'finance', department: '财务部', password: '123456' },
  'employee@example.com': { id: 'user_employee_001', name: '员工小李', role: 'employee', department: '研发部', password: '123456' },
  'demo@example.com': { id: 'user_demo_001', name: '演示用户', role: 'employee', department: '研发部', password: '123456' },
}

// --- Schemas ---
const loginSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 个字符'),
})

const registerSchema = z.object({
  name: z.string().min(2, '姓名至少 2 个字符'),
  email: z.string().email('邮箱格式不正确'),
  password: z.string().min(6, '密码至少 6 个字符'),
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
    const { email, password } = c.req.valid('json')

    // Mock 认证：根据邮箱匹配演示账号
    const demoUser = DEMO_USERS[email.toLowerCase()]
    if (!demoUser || demoUser.password !== password) {
      return c.json(
        { code: 'AUTH_FAILED', message: '账号或密码错误' },
        401
      )
    }

    return c.json({
      code: 'SUCCESS',
      data: {
        token: 'mock-jwt-token-' + demoUser.role + '-' + Date.now(),
        user: {
          id: demoUser.id,
          name: demoUser.name,
          email,
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

    // TODO: Implement actual registration
    return c.json({
      code: 'SUCCESS',
      message: '注册成功',
      data: {
        userId: 'new-user-id',
        tenantId: 'new-tenant-id',
      },
    }, 201)
  }
)

auth.post('/logout', async (c) => {
  // TODO: Implement logout (invalidate token)
  return c.json({
    code: 'SUCCESS',
    message: '退出成功',
  })
})

auth.get('/me', async (c) => {
  // Mock: 从 token 中解析用户角色（token 格式: mock-jwt-token-{role}-{timestamp}）
  const authHeader = c.req.header('Authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  const roleMatch = token.match(/mock-jwt-token-([a-z]+)-/)
  const role = roleMatch ? roleMatch[1] : 'employee'
  const email = role === 'admin' ? 'admin@example.com' : role === 'finance' ? 'finance@example.com' : 'employee@example.com'
  const demoUser = DEMO_USERS[email]

  return c.json({
    code: 'SUCCESS',
    data: {
      id: demoUser.id,
      name: demoUser.name,
      email,
      role: demoUser.role,
      department: demoUser.department,
    },
  })
})

export const authRoutes = auth
