import * as SecureStore from 'expo-secure-store'

// Mirrors the web app's localStorage token handling, but on-device tokens
// go into the encrypted keychain/keystore via expo-secure-store instead.
const ACCESS_KEY = 'pharmaai_access_token'
const REFRESH_KEY = 'pharmaai_refresh_token'
const USER_ID_KEY = 'pharmaai_user_id'

export const tokenStorage = {
  async getAccessToken() {
    return SecureStore.getItemAsync(ACCESS_KEY)
  },
  async getRefreshToken() {
    return SecureStore.getItemAsync(REFRESH_KEY)
  },
  async getUserId() {
    const v = await SecureStore.getItemAsync(USER_ID_KEY)
    return v ? Number(v) : null
  },
  async setTokens(access: string, refresh: string, userId: number) {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, access),
      SecureStore.setItemAsync(REFRESH_KEY, refresh),
      SecureStore.setItemAsync(USER_ID_KEY, String(userId)),
    ])
  },
  async setAccessToken(access: string) {
    await SecureStore.setItemAsync(ACCESS_KEY, access)
  },
  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_ID_KEY),
    ])
  },
}
