import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuthStore } from '../store/authStore'
import AuthStack from './AuthStack'
import MainStack from './MainStack'

// Mobile equivalent of App.tsx's RequireAuth / RequireGuest split — instead
// of guarding individual routes, we swap the entire navigator once
// isAuthenticated is known. hasHydrated gates rendering until SecureStore
// has been read, avoiding a flash of the login screen on cold start.
export default function RootNavigator() {
  const { isAuthenticated, hasHydrated, hydrate } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (!hasHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#00236f" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  )
}
