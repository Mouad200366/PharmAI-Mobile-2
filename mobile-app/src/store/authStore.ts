import { create } from 'zustand'
import { tokenStorage } from './tokenStorage'

// Same shape and role as the web app's authStore, with two differences
// forced by the platform:
//  1. SecureStore is async, so there's a `hasHydrated` flag the navigator
//     waits on before deciding which stack (auth vs app) to mount.
//  2. `pendingPhone` (used between Register -> VerifyOTP) lives in plain
//     in-memory state instead of sessionStorage — RN has no session
//     storage, and the OTP flow happens in one continuous app session.
interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: number | null
  isAuthenticated: boolean
  hasHydrated: boolean
  pendingPhone: string | null
  resetAccess: string | null
  resetRefresh: string | null

  hydrate: () => Promise<void>
  setPendingPhone: (phone: string) => void
  login: (access: string, refresh: string, userId: number) => Promise<void>
  logout: () => void
  setResetTokens: (access: string, refresh: string) => void
  clearResetTokens: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  isAuthenticated: false,
  hasHydrated: false,
  pendingPhone: null,
  resetAccess: null,
  resetRefresh: null,

  hydrate: async () => {
    const [accessToken, refreshToken, userId] = await Promise.all([
      tokenStorage.getAccessToken(),
      tokenStorage.getRefreshToken(),
      tokenStorage.getUserId(),
    ])
    set({
      accessToken,
      refreshToken,
      userId,
      isAuthenticated: !!accessToken,
      hasHydrated: true,
    })
  },

  setPendingPhone: (phone) => set({ pendingPhone: phone }),
  setResetTokens: (access, refresh) => set({ resetAccess: access, resetRefresh: refresh }),
  clearResetTokens: () => set({ resetAccess: null, resetRefresh: null }),

  login: async (access, refresh, userId) => {
    await tokenStorage.setTokens(access, refresh, userId)
    set({
      accessToken: access,
      refreshToken: refresh,
      userId,
      isAuthenticated: true,
      pendingPhone: null,
    })
  },

  logout: () => {
    tokenStorage.clear()
    set({
      accessToken: null,
      refreshToken: null,
      userId: null,
      isAuthenticated: false,
      pendingPhone: null,
    })
  },
}))
