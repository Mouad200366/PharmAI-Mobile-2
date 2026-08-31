import { useCallback, useMemo, useState } from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'

import type { AppTabParamList } from './types'

import Dashboard from '../screens/patient/Dashboard'
import Assistant from '../screens/patient/Assistant'
import MyOrders from '../screens/patient/MyOrders'
import Notifications from '../screens/patient/Notifications'
import Profile from '../screens/patient/Profile'
import Icon from '../components/ui/Icon'
import { notificationsApi } from '../api/notifications'

const Tab = createBottomTabNavigator<AppTabParamList>()

const BADGE_REFRESH_INTERVAL_MS = 30_000

export default function AppTabs() {
  const [unreadCount, setUnreadCount] = useState(0)

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await notificationsApi.unreadCount()
      const count = Number(response.data.unread_count)

      setUnreadCount(
        Number.isFinite(count) && count > 0
          ? Math.floor(count)
          : 0,
      )
    } catch {
      // A badge is secondary UI. A temporary network error should not
      // interrupt navigation or show a blocking error to the patient.
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadUnreadCount()

      const interval = setInterval(() => {
        void loadUnreadCount()
      }, BADGE_REFRESH_INTERVAL_MS)

      return () => {
        clearInterval(interval)
      }
    }, [loadUnreadCount]),
  )

  const notificationBadge = useMemo(() => {
    if (unreadCount <= 0) {
      return undefined
    }

    return unreadCount > 99 ? '99+' : unreadCount
  }, [unreadCount])

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: '#F7FAFF',
      }}
      edges={['top']}
    >
      <Tab.Navigator
      screenListeners={{
        state: () => {
          void loadUnreadCount()
        },
      }}
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
          tabBarLabel: 'Mes commandes',
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
        listeners={{
          focus: () => {
            void loadUnreadCount()
          },
          blur: () => {
            void loadUnreadCount()
          },
        }}
        options={{
          tabBarLabel: 'Notifications',
          tabBarBadge: notificationBadge,
          tabBarBadgeStyle: {
            backgroundColor: '#dc2626',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: '700',
          },
          tabBarIcon: ({ color, size }) => (
            <Icon
              name={
                unreadCount > 0
                  ? 'notifications_active'
                  : 'notifications'
              }
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
    </SafeAreaView>
  )
}