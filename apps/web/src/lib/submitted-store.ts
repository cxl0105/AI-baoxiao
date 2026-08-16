'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ReimbursementListItem, ReimbursementStatus } from './reimbursements'
import type { ExpenseCategory } from './api'

export interface SubmittedInvoice {
  name: string
  size: number
  dataUrl: string
}

export interface SubmittedReimbursement {
  id: string
  code: string
  title: string
  type: string
  department: string
  submitter: string
  totalAmount: number
  status: 'pending' | 'draft'
  createdAt: string
  items: Array<{ category: string; amount: number; description: string; invoiceNo?: string; date?: string }>
  invoices: SubmittedInvoice[]
}

interface SubmittedState {
  list: SubmittedReimbursement[]
  add: (r: SubmittedReimbursement) => void
}

export const useSubmittedStore = create<SubmittedState>()(
  persist(
    (set) => ({
      list: [],
      add: (r) => set((s) => ({ list: [r, ...s.list] })),
    }),
    { name: 'submitted-reimbursements-v1', storage: createJSONStorage(() => localStorage) }
  )
)

// 把真实提交的报销单映射成列表项，便于在「我的报销 / 待我审批」中展示
export function submittedToListItem(r: SubmittedReimbursement): ReimbursementListItem {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    type: r.type,
    amount: r.totalAmount,
    status: r.status as ReimbursementStatus,
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
    approver: '王总监（部门负责人）',
    department: r.department,
    submitter: r.submitter,
    items: r.items.map((it) => ({
      category: (it.category || 'other') as ExpenseCategory,
      amount: it.amount,
      description: it.description,
      date: it.date || r.createdAt.slice(0, 10),
    })),
  }
}

