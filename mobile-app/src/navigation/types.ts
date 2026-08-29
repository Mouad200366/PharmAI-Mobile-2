import type { NavigatorScreenParams } from '@react-navigation/native'

// Mirrors the web app's route list in App.tsx.
export type AuthStackParamList = {
  Landing: undefined
  Login: undefined
  Register: undefined
  VerifyOTP: { phone: string; purpose: 'signup' | 'login' | 'password_reset' }
  ForgotPassword: undefined
}

export type PharmAgentAutoRequest = {
  requestId: string
  prompt: string
}

export type AppTabParamList = {
  Dashboard: undefined
  Assistant:
    | { autoRequest?: PharmAgentAutoRequest }
    | undefined
  Orders: undefined
  Notifications: undefined
  Profile: undefined
}

export type DeliveryTabParamList = {
  Home: undefined
  Deliveries: undefined
  Earnings: undefined
  Notifications: undefined
  Profile: undefined
}

// Screens pushed on top of the tab bar (web equivalents: /cart, /checkout,
// /orders/:id, /addresses — reachable from within the dashboard layout but
// not part of the primary nav).
export type MainStackParamList = {
  Tabs: NavigatorScreenParams<AppTabParamList>
  MedicineDetails: { id: number }
  Cart: undefined
  Checkout: undefined
  OrderDetail: { id: number }
  Addresses: undefined
}

export type DeliveryMainStackParamList = {
  Tabs: NavigatorScreenParams<DeliveryTabParamList>
  Incident: { orderId: number }
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
