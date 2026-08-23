/**
 * 统一角色与权限定义
 * 5 级权限体系：管理员(admin) / 总经理(gm) / 财务(finance) / 部门经理(manager) / 员工(employee)
 */

// --- 角色枚举（全项目唯一权威定义）---
export type Role = 'platform' | 'admin' | 'gm' | 'finance' | 'manager' | 'employee'

export const ROLES: Record<Role, { label: string; desc: string; color: string }> = {
  platform: { label: '平台管理员', desc: '平台运营方：管理所有企业（租户）的新增与删除', color: 'purple' },
  admin: { label: '系统管理员', desc: '全权管理本企业所有数据（软件本身除外）', color: 'amber' },
  gm: { label: '总经理', desc: '与管理员同权限，管理本企业所有数据', color: 'orange' },
  finance: { label: '财务人员', desc: '审核报销单、付款、查看统计报表', color: 'emerald' },
  manager: { label: '部门经理', desc: '审批本部门报销、管理本部门成员（非财务）', color: 'sky' },
  employee: { label: '普通员工', desc: '创建和提交报销单、查看个人记录', color: 'slate' },
}

// --- 权限枚举 ---
export type Permission =
  | 'dashboard:view'
  | 'reimbursement:create'
  | 'reimbursement:view'
  | 'reimbursement:edit'
  | 'reimbursement:delete'
  | 'reimbursement:submit'
  | 'approval:view'
  | 'approval:approve'
  | 'approval:records'
  | 'approval:pay'              // 付款（仅 admin/gm/finance）
  | 'analytics:view'
  | 'members:manage'            // 管理全体成员（admin/gm/finance）
  | 'members:manage_dept'       // 管理本部门成员（manager）
  | 'settings:manage'
  | 'settings:view'
  | 'tenants:manage'          // 平台管理员：管理企业（租户）

// --- 角色 → 权限映射 ---
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform: [
    'dashboard:view',
    'tenants:manage',
  ],
  admin: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:delete', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records', 'approval:pay',
    'analytics:view',
    'members:manage',
    'settings:manage', 'settings:view',
  ],
  // 总经理与管理员同权限
  gm: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:delete', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records', 'approval:pay',
    'analytics:view',
    'members:manage',
    'settings:manage', 'settings:view',
  ],
  finance: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records', 'approval:pay',
    'analytics:view',
    'settings:view',
    // 财务不管理全体成员（按需求：财务有大部分权限，但成员管理是 admin/gm 的）
  ],
  manager: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:submit',
    'approval:view', 'approval:approve', 'approval:records',
    'analytics:view',
    'members:manage_dept',
    'settings:view',
    // 部门经理：无付款权限，无财务相关
  ],
  employee: [
    'dashboard:view',
    'reimbursement:create', 'reimbursement:view', 'reimbursement:edit', 'reimbursement:submit',
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
  '/dashboard/tenants': 'tenants:manage',
}

// --- 演示账号（Mock 登录用）---
export const DEMO_ACCOUNTS: Array<{
  email: string
  password: string
  role: Role
  name: string
  department: string
  phone?: string
}> = [
  { email: 'platform@example.com', password: '123456', role: 'platform', name: '平台管理员', department: '平台运营', phone: '13900000000' },
  { email: 'admin@example.com', password: '123456', role: 'admin', name: '管理员', department: '管理层', phone: '13800000001' },
  { email: 'gm@example.com', password: '123456', role: 'gm', name: '总经理', department: '管理层', phone: '13800000005' },
  { email: 'finance@example.com', password: '123456', role: 'finance', name: '财务专员', department: '财务部', phone: '13800000002' },
  { email: 'manager@example.com', password: '123456', role: 'manager', name: '部门主管', department: '研发部', phone: '13800000006' },
  { email: 'employee@example.com', password: '123456', role: 'employee', name: '员工小李', department: '研发部', phone: '13800000003' },
  { email: 'demo@example.com', password: '123456', role: 'employee', name: '演示用户', department: '研发部', phone: '13800000004' },
]
