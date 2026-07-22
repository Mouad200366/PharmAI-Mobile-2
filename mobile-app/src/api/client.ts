import axios from 'axios'
import { API_BASE_URL } from '../config/env'
import { tokenStorage } from '../store/tokenStorage'
import { useAuthStore } from '../store/authStore'

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the access token on every request.
client.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On a 401, try exactly one silent refresh before giving up and logging out.
// (Mirrors web's client.ts, using SecureStore instead of localStorage and
// the auth store's logout() instead of a hard window.location redirect —
// RootNavigator reacts to isAuthenticated and swaps to the auth stack.)
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await tokenStorage.getRefreshToken()
  if (!refresh) return null

  try {
    const { data } = await axios.post(`${API_BASE_URL}/auth/refresh/`, { refresh })
    await tokenStorage.setAccessToken(data.access)
    return data.access as string
  } catch {
    return null
  }
}

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      // De-dupe concurrent refreshes if several requests 401 at once.
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null
        })
      }
      const newAccess = await refreshPromise

      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`
        return client(original)
      }

      // Refresh failed — clear tokens and let the auth store's subscribers
      // (RootNavigator) redirect to the login screen.
      await tokenStorage.clear()
      useAuthStore.getState().logout()
    }
    return Promise.reject(error)
  },
)

export default client
