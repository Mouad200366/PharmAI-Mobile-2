import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { DeliveryMainStackParamList } from './types'

import DeliveryTabs from './DeliveryTabs'
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
    </Stack.Navigator>
  )
}
