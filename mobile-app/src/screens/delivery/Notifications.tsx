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
import { useFocusEffect } from '@react-navigation/native'

import Icon from '../../components/ui/Icon'
import {
  notificationsApi,
  type Notification,
} from '../../api/notifications'
import { firstError } from '../../api/errors'
import { colors } from '../../theme/colors'

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

function notificationIcon(type: string) {
  switch (type) {
    case 'order_delivered':
      return 'check_circle'
    case 'order_cancelled':
      return 'cancel'
    case 'payment_succeeded':
      return 'payments'
    case 'payment_failed':
      return 'error'
    case 'agent_assigned':
      return 'delivery_dining'
    default:
      return 'notifications'
  }
}

export default function DeliveryNotifications() {
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
      setError(firstError(err))
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
      setError(firstError(err))
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
      setError(firstError(err))
    } finally {
      setMarkingAll(false)
    }
  }, [markingAll, unreadCount])

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.centerStateText}>
          Chargement de vos notifications…
        </Text>
      </View>
    )
  }

  return (
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
        />
      }
    >
      <View style={styles.header}>
        <View>
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

        <View style={styles.headerIcon}>
          <Icon
            name="notifications"
            size={27}
            color={colors.primary}
          />

          {unreadCount > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.toolbar}>
        <View>
          <Text style={styles.toolbarValue}>
            {unreadCount}
          </Text>
          <Text style={styles.toolbarLabel}>
            non lue{unreadCount === 1 ? '' : 's'}
          </Text>
        </View>

        <Pressable
          style={[
            styles.markAllButton,
            (
              unreadCount === 0
              || markingAll
            ) && styles.markAllButtonDisabled,
          ]}
          onPress={() => {
            void handleMarkAllRead()
          }}
          disabled={
            unreadCount === 0
            || markingAll
          }
        >
          {markingAll ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
            />
          ) : (
            <Icon
              name="done_all"
              size={18}
              color={colors.primary}
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
            color={colors.error}
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
          {notifications.map((notification) => {
            const isMarking =
              markingId === notification.id

            return (
              <Pressable
                key={notification.id}
                style={[
                  styles.notificationCard,
                  !notification.is_read
                    && styles.notificationCardUnread,
                ]}
                onPress={() => {
                  void handleMarkRead(notification)
                }}
                disabled={isMarking}
              >
                <View
                  style={[
                    styles.notificationIcon,
                    !notification.is_read
                      && styles.notificationIconUnread,
                  ]}
                >
                  {isMarking ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.primary}
                    />
                  ) : (
                    <Icon
                      name={notificationIcon(notification.type)}
                      size={21}
                      color={colors.primary}
                    />
                  )}
                </View>

                <View style={styles.notificationContent}>
                  <View style={styles.notificationTopRow}>
                    <Text
                      style={[
                        styles.notificationTitle,
                        !notification.is_read
                          && styles.notificationTitleUnread,
                      ]}
                    >
                      {notification.title}
                    </Text>

                    {!notification.is_read ? (
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

                  {!notification.is_read ? (
                    <Text style={styles.tapHint}>
                      Appuyez pour marquer comme lu
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Icon
            name="notifications_none"
            size={34}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            Aucune notification
          </Text>
          <Text style={styles.emptyText}>
            Les nouvelles offres et mises à jour importantes apparaîtront ici.
          </Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.surface,
  },

  centerStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 32,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 24,
  },

  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  title: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
  },

  subtitle: {
    marginTop: 8,
    maxWidth: 285,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
  },

  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error,
  },

  headerBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.white,
  },

  toolbar: {
    marginBottom: 20,
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.surfaceLowest,
  },

  toolbarValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary,
  },

  toolbarLabel: {
    marginTop: 2,
    fontSize: 10,
    color: colors.textSecondary,
  },

  markAllButton: {
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },

  markAllButtonDisabled: {
    opacity: 0.45,
  },

  markAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  errorCard: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: colors.errorBg,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.error,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: colors.error,
  },

  retryText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },

  notificationList: {
    gap: 10,
  },

  notificationCard: {
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: colors.surfaceLowest,
  },

  notificationCardUnread: {
    borderWidth: 1,
    borderColor: colors.primary,
  },

  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  notificationIconUnread: {
    backgroundColor: colors.outlineVariant,
  },

  notificationContent: {
    flex: 1,
  },

  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },

  notificationTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },

  notificationTitleUnread: {
    fontWeight: '800',
  },

  unreadDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  notificationBody: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },

  notificationDate: {
    marginTop: 8,
    fontSize: 10,
    color: colors.textMuted,
  },

  tapHint: {
    marginTop: 5,
    fontSize: 9,
    fontWeight: '700',
    color: colors.secondary,
  },

  emptyCard: {
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLowest,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
  },

  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
})
