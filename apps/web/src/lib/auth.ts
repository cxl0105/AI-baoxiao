'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { api, type LoginResult } from './api'

// --- 类型 ---
interface AuthUser {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  department?: string
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean

  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

// --- Store ---
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (identifier, password) => {
        set({ isLoading: true })
        try {
          const result: LoginResult = await api.login({ identifier, password })
          set({
            token: result.token,
            user: result.user,
            isAuthenticated: true,
            isLoading: false,
          })
        } catch (err) {
          set({ isLoading: false })
          throw err
        }
      },

      logout: async () => {
        await api.logout()
        set({ token: null, user: null, isAuthenticated: false })
      },

      fetchMe: async () => {
        try {
          const user = await api.getMe()
          set({ user, isAuthenticated: true })
        } catch {
          set({ token: null, user: null, isAuthenticated: false })
        }
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
