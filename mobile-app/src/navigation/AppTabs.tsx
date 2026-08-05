import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import type { AppTabParamList } from './types'

import Dashboard from '../screens/patient/Dashboard'
import Assistant from '../screens/patient/Assistant'
import MyOrders from '../screens/patient/MyOrders'
import Notifications from '../screens/patient/Notifications'
import Profile from '../screens/patient/Profile'
import Icon from '../components/ui/Icon'

const Tab = createBottomTabNavigator<AppTabParamList>()

export default function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00236f',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={Dashboard}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="dashboard"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Assistant"
        component={Assistant}
        options={{
          tabBarLabel: 'Assistant IA',
          tabBarIcon: ({ color, size }) => (
            <Icon
              name="smart_toy"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="Orders"
        component={MyOrders}
        options={{
          tabBarLabel: 'My Orders',
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
        name="Notifications"
        component={Notifications}
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
        component={Profile}
        options={{
          tabBarLabel: 'Mon profil',
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