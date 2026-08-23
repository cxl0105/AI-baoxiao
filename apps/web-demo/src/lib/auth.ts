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
        // 先清旧登录态，避免残留 mock/过期 token 干扰新登录
        set({ token: null, user: null, isAuthenticated: false })
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
        // 先同步清本地态（不等待后端，避免 logout 请求挂起/超时阻塞导致残留）
        set({ token: null, user: null, isAuthenticated: false })
        try {
          await api.logout()
        } catch {
          // ignore：后端清理失败不影响本地登出
        }
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
