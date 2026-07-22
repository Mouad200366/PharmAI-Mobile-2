import type { NavigatorScreenParams } from '@react-navigation/native'

// Mirrors the web app's route list in App.tsx.
export type AuthStackParamList = {
  Landing: undefined
  Login: undefined
  Register: undefined
  VerifyOTP: { phone: string; purpose: 'signup' | 'login' | 'password_reset' }
  ForgotPassword: undefined
}

export type AppTabParamList = {
  Dashboard: undefined
  Search: { q?: string } | undefined
  Orders: undefined
  Notifications: undefined
  Profile: undefined
}

// Screens pushed on top of the tab bar (web equivalents: /cart, /checkout,
// /orders/:id, /addresses — reachable from within the dashboard layout but
// not part of the primary nav).
export type MainStackParamList = {
  Tabs: NavigatorScreenParams<AppTabParamList>
  Cart: undefined
  Checkout: undefined
  OrderDetail: { id: number }
  Addresses: undefined
  Assistant: undefined
}

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>
  Main: NavigatorScreenParams<MainStackParamList>
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
