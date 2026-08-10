/**
 * 统一角色与权限定义
 * 参考 Expensify RBAC：管理员 / 财务 / 员工 三级权限体系
 */

// --- 角色枚举（全项目唯一权威定义）---
export type Role = 'admin' | 'finance' | 'employee'

export const ROLES: Record<Role, { label: string; desc: string; color: string }> = {
  admin: { label: '系统管理员', desc: '全权管理系统设置、成员、报销规则及所有审批', color: 'amber' },
  finance: { label: '财务人员', desc: '审核报销单、查看统计分析、管理审批记录', color: 'emerald' },
  employee: { label: '普通员工', desc: '创建和提交报销单、查看个人报销记录', color: 'slate' },
}

// --- 权限枚举 ---
export type Permission =
  | 'dashboard:view'          // 查看工作台
  | 'reimbursement:create'    // 创建报销单
  | 'reimbursement:view'      // 查看报销单
  | 'reimbursement:edit'      // 编辑报销单
  | 'reimbursement:delete'    // 删除报销单
  | 'reimbursement:submit'    // 提交审批
  | 'approval:view'           // 查看待审批
  | 'approval:approve'        // 审批通过/驳回
  | 'approval:records'        // 查看审批记录
  | 'analytics:view'          // 查看统计分析
  | 'members:manage'          // 管理成员
  | 'settings:manage'         // 管理系统设置
  | 'settings:view'           // 查看系统设置（仅公司信息等只读）

// --- 角色 → 权限映射 ---
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:delete', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records',
    'analytics:view',
    'members:manage',
    'settings:manage', 'settings:view',
  ],
  finance: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records',
    'analytics:view',
    'settings:view',
  ],
  employee: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:submit',
    // 员工看不到待审批和审批记录
    // 员工看不到统计分析、成员管理、系统设置
  ],
}

// --- 权限检查函数 ---
export function hasPermission(role: string | undefined | null, perm: Permission): boolean {
  if (!role) return false
  const perms = ROLE_PERMISSIONS[role as Role]
  if (!perms) return false
  return perms.includes(perm)
}

export function hasAnyPermission(role: string | undefined | null, perms: Permission[]): boolean {
  if (!role) return false
  return perms.some((p) => hasPermission(role, p))
}

// --- 导航菜单权限映射 ---
export const NAV_PERMISSIONS: Record<string, Permission | undefined> = {
  '/dashboard': 'dashboard:view',
  '/dashboard/reimbursements': 'reimbursement:view',
  '/dashboard/reimbursements/new': 'reimbursement:create',
  '/dashboard/reimbursements/spreadsheet': 'reimbursement:create',
  '/dashboard/approvals': 'approval:view',
  '/dashboard/approval-records': 'approval:records',
  '/dashboard/analytics': 'analytics:view',
  '/dashboard/members': 'members:manage',
  '/dashboard/settings': 'settings:view',
}

// --- 演示账号（Mock 登录用）---
export const DEMO_ACCOUNTS: Array<{
  email: string
  password: string
  role: Role
  name: string
  department: string
}> = [
  { email: 'admin@example.com', password: '123456', role: 'admin', name: '管理员', department: '管理层' },
  { email: 'finance@example.com', password: '123456', role: 'finance', name: '财务专员', department: '财务部' },
  { email: 'employee@example.com', password: '123456', role: 'employee', name: '员工小李', department: '研发部' },
  // 兼容旧 demo 账号
  { email: 'demo@example.com', password: '123456', role: 'employee', name: '演示用户', department: '研发部' },
]
