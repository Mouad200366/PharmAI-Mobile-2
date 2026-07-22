import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { AuthStackParamList } from './types'
import Landing from '../screens/auth/Landing'
import Login from '../screens/auth/Login'
import Register from '../screens/auth/Register'
import VerifyOTP from '../screens/auth/VerifyOTP'
import ForgotPassword from '../screens/auth/ForgotPassword'

const Stack = createNativeStackNavigator<AuthStackParamList>()

// Unauthenticated flow — equivalent of the web app's RequireGuest-wrapped
// routes (Register, Login) plus the always-public ones (Landing, VerifyOTP,
// ForgotPassword).
export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={Landing} />
      <Stack.Screen name="Login" component={Login} />
      <Stack.Screen name="Register" component={Register} />
      <Stack.Screen name="VerifyOTP" component={VerifyOTP} />
      <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
    </Stack.Navigator>
  )
}
