import jwt from 'jsonwebtoken'
import type { MiddlewareHandler } from 'hono'
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

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

// 扩展后的当前用户上下文（含 companyId）
export interface UserContext extends JwtPayload {
  companyId: string
}

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getToken(c as any)
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    return c.json({ code: 'UNAUTHORIZED', message: '未登录或登录已过期' }, 401)
  }
  // 从数据库查 companyId（多租户隔离的根依据）
  let companyId = ''
  try {
    const rows = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, payload.sub)).limit(1)
    companyId = rows[0]?.companyId || ''
  } catch {
    companyId = ''
  }
  c.set('user', { ...payload, companyId } as UserContext)
  await next()
}

/** 从 Hono context 取当前用户（需先过 authMiddleware），含 companyId */
export function currentUser(c: any): UserContext {
  return c.get('user') as UserContext
}

// ============ 5 级角色权限辅助 ============

/** 超级管理员：admin + gm（总经理与管理员同权限） */
export function isSuperAdmin(role: string): boolean {
  return role === 'admin' || role === 'gm'
}

/** 财务 */
export function isFinance(role: string): boolean {
  return role === 'finance'
}

/** 部门经理 */
export function isManager(role: string): boolean {
  return role === 'manager'
}

/** 管理员或财务（兼容旧代码：管理全部数据、看全部成员） */
export function isAdminOrFinance(role: string): boolean {
  return isSuperAdmin(role) || isFinance(role)
}

/** 审批人：admin/gm/finance/manager 均可审批 */
export function isApprover(role: string): boolean {
  return isSuperAdmin(role) || isFinance(role) || isManager(role)
}

/** 付款权限：仅 admin/gm/finance（部门经理不能付款） */
export function canPay(role: string): boolean {
  return isSuperAdmin(role) || isFinance(role)
}

/** 管理全体成员：admin/gm/finance（部门经理只能管本部门） */
export function canManageAllMembers(role: string): boolean {
  return isSuperAdmin(role) || isFinance(role)
}
