import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { AppTabParamList } from './types'
import Dashboard from '../screens/patient/Dashboard'
import Search from '../screens/patient/Search'
import MyOrders from '../screens/patient/MyOrders'
import Notifications from '../screens/patient/Notifications'
import Profile from '../screens/patient/Profile'
import Icon from '../components/ui/Icon'

const Tab = createBottomTabNavigator<AppTabParamList>()

// Direct mobile equivalent of DashboardLayout's sidebar NAV_ITEMS on web
// (Dashboard, Rechercher, My Orders, Notifications, Mon profil).
// "Saved Addresses" moves under Profile, matching the common mobile pattern
// of keeping the tab bar to ~5 items instead of a 6-item sidebar.
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
        options={{ tabBarIcon: ({ color, size }) => <Icon name="dashboard" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Search"
        component={Search}
        options={{ tabBarIcon: ({ color, size }) => <Icon name="search" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Orders"
        component={MyOrders}
        options={{ tabBarLabel: 'My Orders', tabBarIcon: ({ color, size }) => <Icon name="local_shipping" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Notifications"
        component={Notifications}
        options={{ tabBarIcon: ({ color, size }) => <Icon name="notifications" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={Profile}
        options={{ tabBarLabel: 'Mon profil', tabBarIcon: ({ color, size }) => <Icon name="person" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  )
}
