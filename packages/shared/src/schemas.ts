import { z } from 'zod'

// 中国大陆手机号正则（13 4 5 6 7 8 9 开头，11 位）
export const PHONE_REGEX = /^1[3-9]\d{9}$/

// 邮箱校验
export const emailSchema = z.string().min(1, '请输入邮箱地址').email('邮箱格式不正确，请检查')

// 手机号校验
export const phoneSchema = z
  .string()
  .min(1, '请输入手机号码')
  .length(11, '手机号必须为 11 位数字')
  .regex(PHONE_REGEX, '手机号格式不正确，请输入中国大陆手机号')

// 登录标识：手机号或邮箱
export const loginIdentifierSchema = z.union(
  [
    z
      .string()
      .min(1, '请输入手机号或邮箱')
      .regex(/^1[3-9]\d{9}$/, '手机号或邮箱格式不正确'),
    z.string().min(1, '请输入手机号或邮箱').email('手机号或邮箱格式不正确'),
  ],
  {
    errorMap: () => ({ message: '请输入正确的手机号或邮箱地址' }),
  }
)

// 判断一个字符串是否像手机号
export function isPhone(s: string): boolean {
  return /^1[3-9]\d{9}$/.test(s.trim())
}

export const schemas = {
  // User
  UserId: z.number().positive(),
  UserCreate: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email().optional(),
    phone: z.string().regex(PHONE_REGEX, '手机号格式不正确'),
    password: z.string().min(6),
    role: z.enum(['admin', 'finance', 'manager', 'user']).default('user'),
  }),
  UserLogin: z.object({
    identifier: z.string().min(1, '请输入手机号或邮箱'),
    password: z.string().min(6),
  }),

  // Reimbursement
  ReimbursementId: z.string(),
  ReimbursementType: z.enum(['travel', 'daily', 'purchase', 'payment']),
  ReimbursementStatus: z.enum(['draft', 'processing', 'pending', 'approved', 'rejected', 'paid']),
  ReimbursementCreate: z.object({
    title: z.string().min(2).max(255),
    type: z.enum(['travel', 'daily', 'purchase', 'payment']),
    totalAmount: z.number().positive(),
    description: z.string().max(1000).optional(),
  }),
}

export type { schemas }
