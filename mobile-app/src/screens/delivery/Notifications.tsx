import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import Icon from '../../components/ui/Icon'
import {
  notificationsApi,
  type Notification,
  type NotificationType,
} from '../../api/notifications'
import { firstError } from '../../api/errors'

const brand = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  blueBright: '#168BEE',
  cyan: '#18C7D9',
  blueSoft: '#EEF5FF',
  cyanSoft: '#E8FAFC',
  surface: '#F7FAFF',
  white: '#FFFFFF',
  text: '#0C1C4C',
  textSecondary: '#667085',
  textMuted: '#98A2B3',
  border: '#E7EDF7',
  error: '#DC2626',
  errorBg: '#FFF0EF',
  success: '#15803D',
  successBg: '#EAF8EF',
  warning: '#A16207',
  warningBg: '#FFF7DF',
  teal: '#087C8C',
  tealSoft: '#E8FAFC',
  neutralBg: '#F1F4F8',
} as const

function formatDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} · ${hours}:${minutes}`
}

function notificationVisual(type: NotificationType) {
  switch (type) {
    case 'delivery_offer_available':
      return {
        icon: 'notifications',
        iconColor: brand.blue,
        iconBackground: brand.blueSoft,
      }
    case 'agent_assigned':
      return {
        icon: 'delivery_dining',
        iconColor: brand.blue,
        iconBackground: brand.blueSoft,
      }
    case 'order_delivered':
      return {
        icon: 'check_circle',
        iconColor: brand.success,
        iconBackground: brand.successBg,
      }
    case 'order_cancelled':
      return {
        icon: 'cancel',
        iconColor: brand.error,
        iconBackground: brand.errorBg,
      }
    case 'payment_succeeded':
      return {
        icon: 'payments',
        iconColor: brand.teal,
        iconBackground: brand.tealSoft,
      }
    case 'payment_failed':
      return {
        icon: 'error',
        iconColor: brand.error,
        iconBackground: brand.errorBg,
      }
    case 'prescription_approved':
      return {
        icon: 'task_alt',
        iconColor: brand.success,
        iconBackground: brand.successBg,
      }
    case 'prescription_rejected':
      return {
        icon: 'block',
        iconColor: brand.error,
        iconBackground: brand.errorBg,
      }
    case 'order_status_changed':
      return {
        icon: 'sync',
        iconColor: brand.warning,
        iconBackground: brand.warningBg,
      }
    case 'order_placed':
      return {
        icon: 'receipt_long',
        iconColor: brand.blue,
        iconBackground: brand.blueSoft,
      }
    default:
      return {
        icon: 'notifications',
        iconColor: brand.blue,
        iconBackground: brand.blueSoft,
      }
  }
}

interface NotificationCardProps {
  notification: Notification
  marking: boolean
  onMarkRead: (notification: Notification) => void
}

function NotificationCard({
  notification,
  marking,
  onMarkRead,
}: NotificationCardProps) {
  const visual = notificationVisual(notification.type)
  const unread = !notification.is_read

  return (
    <Pressable
      style={({ pressed }) => [
        styles.notificationCard,
        unread && styles.notificationCardUnread,
        pressed && unread && styles.notificationCardPressed,
      ]}
      onPress={() => {
        if (unread && !marking) {
          onMarkRead(notification)
        }
      }}
      disabled={marking || !unread}
      accessibilityRole={unread ? 'button' : undefined}
      accessibilityLabel={
        unread
          ? `${notification.title}. Appuyez pour marquer comme lu.`
          : notification.title
      }
    >
      <View
        style={[
          styles.notificationIcon,
          { backgroundColor: visual.iconBackground },
        ]}
      >
        {marking ? (
          <ActivityIndicator
            size="small"
            color={visual.iconColor}
          />
        ) : (
          <Icon
            name={visual.icon}
            size={24}
            color={visual.iconColor}
          />
        )}
      </View>

      <View style={styles.notificationContent}>
        <View style={styles.notificationTopRow}>
          <Text
            style={[
              styles.notificationTitle,
              unread && styles.notificationTitleUnread,
            ]}
          >
            {notification.title}
          </Text>

          {unread ? (
            <View style={styles.unreadDot} />
          ) : null}
        </View>

        {notification.body ? (
          <Text style={styles.notificationBody}>
            {notification.body}
          </Text>
        ) : null}

        <Text style={styles.notificationDate}>
          {formatDate(notification.created_at)}
        </Text>

        {unread ? (
          <Text style={styles.tapHint}>
            Appuyez pour marquer comme lu
          </Text>
        ) : (
          <View style={styles.readStateRow}>
            <Icon
              name="done"
              size={14}
              color={brand.textMuted}
            />
            <Text style={styles.readStateText}>
              Lu
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}

export default function DeliveryNotifications() {
  const insets = useSafeAreaInsets()

  const [notifications, setNotifications] =
    useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const [markingId, setMarkingId] = useState<number | null>(null)

  const loadNotifications = useCallback(async (
    isRefresh = false,
  ) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [
        listResponse,
        unreadResponse,
      ] = await Promise.all([
        notificationsApi.list({
          page: 1,
          page_size: 100,
        }),
        notificationsApi.unreadCount(),
      ])

      setNotifications(listResponse.data.results)
      setUnreadCount(unreadResponse.data.unread_count)
    } catch (err: unknown) {
      setError(
        firstError(err)
        || 'Impossible de charger vos notifications.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadNotifications()
    }, [loadNotifications]),
  )

  const handleMarkRead = useCallback(async (
    notification: Notification,
  ) => {
    if (notification.is_read || markingId !== null) {
      return
    }

    setMarkingId(notification.id)
    setError('')

    try {
      const { data } = await notificationsApi.markRead(
        notification.id,
      )

      setNotifications((current) =>
        current.map((item) =>
          item.id === data.id
            ? data
            : item,
        ),
      )

      setUnreadCount((current) =>
        Math.max(0, current - 1),
      )
    } catch (err: unknown) {
      setError(
        firstError(err)
        || 'Impossible de marquer cette notification comme lue.',
      )
    } finally {
      setMarkingId(null)
    }
  }, [markingId])

  const handleMarkAllRead = useCallback(async () => {
    if (unreadCount === 0 || markingAll) {
      return
    }

    setMarkingAll(true)
    setError('')

    try {
      await notificationsApi.markAllRead()

      setNotifications((current) =>
        current.map((item) => ({
          ...item,
          is_read: true,
          read_at: item.read_at ?? new Date().toISOString(),
        })),
      )

      setUnreadCount(0)
    } catch (err: unknown) {
      setError(
        firstError(err)
        || 'Impossible de marquer toutes les notifications comme lues.',
      )
    } finally {
      setMarkingAll(false)
    }
  }, [markingAll, unreadCount])

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.centerState}>
        <StatusBar style="light" />

        <View
          pointerEvents="none"
          style={[
            styles.statusBarGuard,
            { height: insets.top },
          ]}
        />

        <ActivityIndicator
          size="large"
          color={brand.blue}
        />

        <Text style={styles.centerStateText}>
          Chargement de vos notifications…
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View
        pointerEvents="none"
        style={[
          styles.statusBarGuard,
          { height: insets.top },
        ]}
      />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void loadNotifications(true)
            }}
            tintColor={brand.blue}
            colors={[brand.blue]}
          />
        }
      >
        <LinearGradient
          colors={[
            brand.navy,
            brand.blue,
            brand.blueBright,
            brand.cyan,
          ]}
          locations={[0, 0.35, 0.72, 1]}
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.hero}
        >
          <View style={styles.heroText}>
            <Text style={styles.eyebrow}>
              Centre d’alertes
            </Text>

            <Text style={styles.title}>
              Notifications
            </Text>

            <Text style={styles.subtitle}>
              Retrouvez ici les mises à jour importantes liées à votre activité de livraison.
            </Text>
          </View>

          <View style={styles.heroIcon}>
            <Icon
              name="notifications"
              size={32}
              color={brand.navy}
            />

            {unreadCount > 0 ? (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.toolbar}>
            <View style={styles.unreadSummary}>
              <Text style={styles.toolbarValue}>
                {unreadCount}
              </Text>
              <Text style={styles.toolbarLabel}>
                non lue{unreadCount === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={styles.toolbarDivider} />

            <Pressable
              style={({ pressed }) => [
                styles.markAllButton,
                (
                  unreadCount === 0
                  || markingAll
                ) && styles.markAllButtonDisabled,
                pressed
                && unreadCount > 0
                && !markingAll
                && styles.markAllButtonPressed,
              ]}
              onPress={() => {
                void handleMarkAllRead()
              }}
              disabled={
                unreadCount === 0
                || markingAll
              }
              accessibilityRole="button"
              accessibilityLabel="Tout marquer comme lu"
            >
              {markingAll ? (
                <ActivityIndicator
                  size="small"
                  color={brand.blue}
                />
              ) : (
                <Icon
                  name="done_all"
                  size={21}
                  color={brand.blue}
                />
              )}

              <Text style={styles.markAllText}>
                {markingAll
                  ? 'Mise à jour…'
                  : 'Tout marquer comme lu'}
              </Text>
            </Pressable>
          </View>

          {error ? (
            <Pressable
              style={styles.errorCard}
              onPress={() => {
                void loadNotifications()
              }}
            >
              <Icon
                name="error"
                size={20}
                color={brand.error}
              />

              <View style={styles.errorContent}>
                <Text style={styles.errorTitle}>
                  Une erreur est survenue
                </Text>
                <Text style={styles.errorText}>
                  {error}
                </Text>
                <Text style={styles.retryText}>
                  Appuyez pour réessayer
                </Text>
              </View>
            </Pressable>
          ) : null}

          {notifications.length > 0 ? (
            <View style={styles.notificationList}>
              {notifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  marking={markingId === notification.id}
                  onMarkRead={(item) => {
                    void handleMarkRead(item)
                  }}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Icon
                  name="notifications_none"
                  size={32}
                  color={brand.blue}
                />
              </View>

              <Text style={styles.emptyTitle}>
                Aucune notification
              </Text>

              <Text style={styles.emptyText}>
                Les nouvelles offres et mises à jour importantes apparaîtront ici.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  statusBarGuard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: brand.navy,
  },

  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: brand.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: brand.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: brand.surface,
  },

  content: {
    paddingBottom: 34,
  },

  hero: {
    minHeight: 275,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 36,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  heroText: {
    flex: 1,
    paddingRight: 4,
  },

  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: '#7FE7F0',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
  },

  title: {
    marginTop: 10,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    color: brand.white,
    letterSpacing: -0.6,
  },

  subtitle: {
    marginTop: 15,
    maxWidth: 305,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.92)',
  },

  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 21,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
    shadowColor: '#071445',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },

  heroBadge: {
    position: 'absolute',
    top: -9,
    right: -7,
    minWidth: 34,
    height: 34,
    paddingHorizontal: 7,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF233C',
    borderWidth: 3,
    borderColor: brand.white,
  },

  heroBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: brand.white,
  },

  body: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },

  toolbar: {
    minHeight: 104,
    marginBottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 7 },
    shadowRadius: 16,
    elevation: 3,
  },

  unreadSummary: {
    width: 76,
    alignItems: 'flex-start',
  },

  toolbarValue: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: brand.navy,
  },

  toolbarLabel: {
    marginTop: 3,
    fontSize: 12,
    color: brand.textSecondary,
  },

  toolbarDivider: {
    width: 1,
    height: 50,
    marginHorizontal: 14,
    backgroundColor: brand.border,
  },

  markAllButton: {
    flex: 1,
    minHeight: 58,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: brand.blue,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: brand.white,
  },

  markAllButtonDisabled: {
    opacity: 0.42,
  },

  markAllButtonPressed: {
    backgroundColor: brand.blueSoft,
  },

  markAllText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: brand.blue,
    textAlign: 'center',
  },

  errorCard: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: brand.errorBg,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.error,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: brand.error,
  },

  retryText: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '800',
    color: brand.blue,
  },

  notificationList: {
    gap: 14,
  },

  notificationCard: {
    minHeight: 158,
    padding: 18,
    borderRadius: 27,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 2,
  },

  notificationCardUnread: {
    borderColor: '#D9E9FF',
    shadowOpacity: 0.075,
    elevation: 3,
  },

  notificationCardPressed: {
    backgroundColor: '#FBFDFF',
  },

  notificationIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notificationContent: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },

  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  notificationTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: brand.navy,
  },

  notificationTitleUnread: {
    fontWeight: '900',
  },

  unreadDot: {
    width: 10,
    height: 10,
    marginTop: 5,
    borderRadius: 5,
    backgroundColor: brand.blue,
  },

  notificationBody: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: brand.textSecondary,
  },

  notificationDate: {
    marginTop: 11,
    fontSize: 11,
    color: brand.textMuted,
  },

  tapHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    color: brand.blue,
  },

  readStateRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  readStateText: {
    fontSize: 10,
    color: brand.textMuted,
  },

  emptyCard: {
    padding: 30,
    borderRadius: 27,
    alignItems: 'center',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 2,
  },

  emptyIcon: {
    width: 70,
    height: 70,
    marginBottom: 16,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: brand.text,
    textAlign: 'center',
  },

  emptyText: {
    marginTop: 8,
    maxWidth: 300,
    fontSize: 12,
    lineHeight: 19,
    color: brand.textSecondary,
    textAlign: 'center',
  },
})
