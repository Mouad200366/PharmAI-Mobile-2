import { useEffect } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { useAuthStore } from '../store/authStore'
import AuthStack from './AuthStack'
import MainStack from './MainStack'
import DeliveryMainStack from './DeliveryMainStack'
import { registerPushDevice } from '../services/pushRegistration'

// Mobile equivalent of App.tsx's RequireAuth / RequireGuest split — instead
// of guarding individual routes, we swap the entire navigator once
// isAuthenticated is known. hasHydrated gates rendering until SecureStore
// has been read, avoiding a flash of the login screen on cold start.
export default function RootNavigator() {
  const {
    isAuthenticated,
    hasHydrated,
    hydrate,
    role,
  } = useAuthStore()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    if (!hasHydrated || !isAuthenticated) {
      return
    }

    // Best effort only: push setup must never block or log out the user.
    void registerPushDevice()}, [hasHydrated, isAuthenticated])

  if (!hasHydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#00236f" />
      </View>
    )
  }

  let authenticatedNavigator = <MainStack />

  if (role === 'delivery') {
    authenticatedNavigator = <DeliveryMainStack />
  }

  return (
    <NavigationContainer>
      {isAuthenticated
        ? authenticatedNavigator
        : <AuthStack />}
    </NavigationContainer>
  )
}
