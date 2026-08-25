import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import type { DeliveryTabParamList } from './types'

import DeliveryHome from '../screens/delivery/Home'
import DeliveryDeliveries from '../screens/delivery/Deliveries'
import DeliveryEarnings from '../screens/delivery/Earnings'
import DeliveryNotifications from '../screens/delivery/Notifications'
import DeliveryProfile from '../screens/delivery/Profile'
import Icon from '../components/ui/Icon'

const Tab = createBottomTabNavigator<DeliveryTabParamList>()

export default function DeliveryTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00236f',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tab.Screen
        name="Home"
        component={DeliveryHome}
        options={{
          tabBarLabel: 'Accueil',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="home"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Deliveries"
        component={DeliveryDeliveries}
        options={{
          tabBarLabel: 'Livraisons',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="local_shipping"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Earnings"
        component={DeliveryEarnings}
        options={{
          tabBarLabel: 'Gains',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="payments"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Notifications"
        component={DeliveryNotifications}
        options={{
          tabBarLabel: 'Notifications',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="notifications"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Profile"
        component={DeliveryProfile}
        options={{
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="person"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
