import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { DeliveryMainStackParamList } from './types'

import DeliveryTabs from './DeliveryTabs'
import DeliveryIncidentScreen from '../screens/delivery/Incident'
import OrderChat from '../screens/shared/OrderChat'
import { useDeliveryLocationHeartbeat } from '../hooks/useDeliveryLocationHeartbeat'

const Stack =
  createNativeStackNavigator<DeliveryMainStackParamList>()

export default function DeliveryMainStack() {
  useDeliveryLocationHeartbeat()

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: true }}
    >
      <Stack.Screen
        name="Tabs"
        component={DeliveryTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="OrderChat"
        component={OrderChat}
        options={{
          title: 'Discussion',
        }}
      />
      <Stack.Screen
        name="Incident"
        component={DeliveryIncidentScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  )
}
