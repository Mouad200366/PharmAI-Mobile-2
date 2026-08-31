import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { MainStackParamList } from './types'

import AppTabs from './AppTabs'
import Cart from '../screens/patient/Cart'
import Checkout from '../screens/patient/Checkout'
import OrderDetail from '../screens/patient/OrderDetail'
import OrderChat from '../screens/shared/OrderChat'
import Addresses from '../screens/patient/Addresses'
import MedicineDetails from '../screens/patient/MedicineDetails'

const Stack =
  createNativeStackNavigator<MainStackParamList>()

export default function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{ headerShown: true }}
    >
      <Stack.Screen
        name="Tabs"
        component={AppTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="MedicineDetails"
        component={MedicineDetails}
        options={{
          title: 'Détails du médicament',
  }}
/>

      <Stack.Screen
        name="Cart"
        component={Cart}
        options={{ title: 'Mon panier' }}
      />

      <Stack.Screen
        name="Checkout"
        component={Checkout}
        options={{ title: 'Commande' }}
      />

      <Stack.Screen
        name="OrderDetail"
        component={OrderDetail}
        options={{
          title: 'Détail de la commande',
        }}
      />

      <Stack.Screen
        name="OrderChat"
        component={OrderChat}
        options={{
          title: 'Discussion',
        }}
      />

      <Stack.Screen
        name="Addresses"
        component={Addresses}
        options={{
          title: 'Adresses enregistrées',
        }}
      />
    </Stack.Navigator>
  )
}