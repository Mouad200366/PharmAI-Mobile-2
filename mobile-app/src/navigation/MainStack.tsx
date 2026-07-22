import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { MainStackParamList } from './types'
import AppTabs from './AppTabs'
import Cart from '../screens/patient/Cart'
import Checkout from '../screens/patient/Checkout'
import OrderDetail from '../screens/patient/OrderDetail'
import Addresses from '../screens/patient/Addresses'
import Assistant from '../screens/patient/Assistant'


const Stack = createNativeStackNavigator<MainStackParamList>()

// Authenticated flow — equivalent of the web app's <RequireAuth> +
// <DashboardLayout> route group. The tab bar is the "layout", and
// Cart/Checkout/OrderDetail/Addresses push on top of it like modal-ish
// detail screens, matching how they behave inside the web dashboard shell.
export default function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen name="Cart" component={Cart} options={{ title: 'Mon panier' }} />
      <Stack.Screen name="Checkout" component={Checkout} options={{ title: 'Commande' }} />
      <Stack.Screen name="OrderDetail" component={OrderDetail} options={{ title: 'Détail de la commande' }} />
      <Stack.Screen name="Addresses" component={Addresses} options={{ title: 'Adresses enregistrées' }} />
      <Stack.Screen name="Assistant" component={Assistant} options={{ title: 'PharmAgent' }} />
    </Stack.Navigator>
  )
}
