import * as schemas from './schemas'
import { z } from 'zod'

export const schemas = {
  // User
  UserId: z.number().positive(),
  UserCreate: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['admin', 'finance', 'manager', 'user']).default('user'),
  }),
  UserLogin: z.object({
    email: z.string().email(),
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
