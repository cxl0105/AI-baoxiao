import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

const auth = new Hono()

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

    // TODO: Implement actual authentication
    return c.json({
      code: 'SUCCESS',
      data: {
        token: 'mock-jwt-token-' + Date.now(),
        user: {
          id: '1',
          name: '演示用户',
          email,
          role: 'admin',
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
  // TODO: Get current user from auth middleware
  return c.json({
    code: 'SUCCESS',
    data: {
      id: '1',
      name: '演示用户',
      email: 'demo@example.com',
      role: 'admin',
      tenant: {
        id: '1',
        name: '演示公司',
      },
    },
  })
})

export const authRoutes = auth
