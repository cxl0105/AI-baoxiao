import jwt from 'jsonwebtoken'
import type { MiddlewareHandler } from 'hono'

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

export interface JwtPayload {
  sub: string
  role: string
  name: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload
  } catch {
    return null
  }
}

export function getToken(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const h = c.req.header('Authorization') || ''
  const t = h.replace('Bearer ', '').trim()
  return t || null
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getToken(c as any)
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    return c.json({ code: 'UNAUTHORIZED', message: '未登录或登录已过期' }, 401)
  }
  c.set('user', payload)
  await next()
}

/** 从 Hono context 取当前用户（需先过 authMiddleware） */
export function currentUser(c: any): JwtPayload {
  return c.get('user') as JwtPayload
}

export function isAdminOrFinance(role: string): boolean {
  return role === 'admin' || role === 'finance'
}
