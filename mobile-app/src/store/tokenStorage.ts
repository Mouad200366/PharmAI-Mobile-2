import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const ACCESS_KEY = 'pharmaai_access_token'
const REFRESH_KEY = 'pharmaai_refresh_token'
const USER_ID_KEY = 'pharmaai_user_id'

function getWebItem(key: string) {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(key)
}

function setWebItem(
  key: string,
  value: string,
) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    key,
    value,
  )
}

function removeWebItem(key: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(key)
}

export const tokenStorage = {
  async getAccessToken() {
    if (Platform.OS === 'web') {
      return getWebItem(ACCESS_KEY)
    }

    return SecureStore.getItemAsync(
      ACCESS_KEY,
    )
  },

  async getRefreshToken() {
    if (Platform.OS === 'web') {
      return getWebItem(REFRESH_KEY)
    }

    return SecureStore.getItemAsync(
      REFRESH_KEY,
    )
  },

  async getUserId() {
    let storedValue: string | null

    if (Platform.OS === 'web') {
      storedValue =
        getWebItem(USER_ID_KEY)
    } else {
      storedValue =
        await SecureStore.getItemAsync(
          USER_ID_KEY,
        )
    }

    if (!storedValue) {
      return null
    }

    const parsedValue =
      Number(storedValue)

    return Number.isNaN(parsedValue)
      ? null
      : parsedValue
  },

  async setTokens(
    access: string,
    refresh: string,
    userId: number,
  ) {
    if (Platform.OS === 'web') {
      setWebItem(ACCESS_KEY, access)
      setWebItem(REFRESH_KEY, refresh)
      setWebItem(
        USER_ID_KEY,
        String(userId),
      )

      return
    }

    await Promise.all([
      SecureStore.setItemAsync(
        ACCESS_KEY,
        access,
      ),

      SecureStore.setItemAsync(
        REFRESH_KEY,
        refresh,
      ),

      SecureStore.setItemAsync(
        USER_ID_KEY,
        String(userId),
      ),
    ])
  },

  async setAccessToken(
    access: string,
  ) {
    if (Platform.OS === 'web') {
      setWebItem(ACCESS_KEY, access)
      return
    }

    await SecureStore.setItemAsync(
      ACCESS_KEY,
      access,
    )
  },

  async clear() {
    if (Platform.OS === 'web') {
      removeWebItem(ACCESS_KEY)
      removeWebItem(REFRESH_KEY)
      removeWebItem(USER_ID_KEY)

      return
    }

    await Promise.all([
      SecureStore.deleteItemAsync(
        ACCESS_KEY,
      ),

      SecureStore.deleteItemAsync(
        REFRESH_KEY,
      ),

      SecureStore.deleteItemAsync(
        USER_ID_KEY,
      ),
    ])
  },
}