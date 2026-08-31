import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import { useFocusEffect } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { LinearGradient } from 'expo-linear-gradient'

import {
  getNotificationOrderId,
  notificationsApi,
  type Notification,
  type NotificationType,
} from '../../api/notifications'
import { firstError } from '../../api/errors'
import Icon from '../../components/ui/Icon'
import type {
  AppTabParamList,
  MainStackParamList,
} from '../../navigation/types'
import { colors } from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Notifications'>,
  NativeStackScreenProps<MainStackParamList>
>

type FilterKey =
  | 'all'
  | 'orders'
  | 'delivery'
  | 'assistant'
  | 'payments'

type NotificationSection = {
  title: string
  data: Notification[]
}

type Presentation = {
  icon: string
  iconColor: string
  iconBackground: string
  title: string
  body: string
  category: string
  accent: string
  softAccent: string
  pillLabel: string
  pillTextColor: string
  pillBackground: string
  actionLabel: string | null
}

const ORDER_TYPES: NotificationType[] = [
  'order_placed',
  'order_status_changed',
  'order_delivered',
  'order_cancelled',
]

const PAYMENT_TYPES: NotificationType[] = [
  'payment_succeeded',
  'payment_failed',
]

const DELIVERY_STATUSES = new Set([
  'ready_for_pickup',
  'awaiting_agent',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed',
])

const FILTERS: {
  key: FilterKey
  label: string
  icon: string
}[] = [
  { key: 'all', label: 'Tout', icon: 'apps' },
  { key: 'orders', label: 'Commandes', icon: 'inventory_2' },
  { key: 'delivery', label: 'Livraison', icon: 'local_shipping' },
  { key: 'assistant', label: 'PharmAgent', icon: 'auto_awesome' },
  { key: 'payments', label: 'Paiement', icon: 'account_balance_wallet' },
]

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime())
}

function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  )
}

function sectionLabel(dateString: string) {
  const date = new Date(dateString)

  if (!isValidDate(date)) {
    return 'Date inconnue'
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (sameCalendarDay(date, today)) {
    return "Aujourd'hui"
  }

  if (sameCalendarDay(date, yesterday)) {
    return 'Hier'
  }

  return date.toLocaleDateString('fr-MA', {
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear()
      ? 'numeric'
      : undefined,
  })
}

function formatCardTime(dateString: string) {
  const date = new Date(dateString)

  if (!isValidDate(date)) {
    return 'Date inconnue'
  }

  const now = new Date()
  const time = date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (sameCalendarDay(date, now)) {
    return `Aujourd'hui · ${time}`
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (sameCalendarDay(date, yesterday)) {
    return `Hier · ${time}`
  }

  return `${date.toLocaleDateString('fr-MA', {
    day: 'numeric',
    month: 'short',
  })} · ${time}`
}

function matchesFilter(notification: Notification, filter: FilterKey) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'orders') {
    if (notification.type === 'prescription_approved' || notification.type === 'prescription_rejected') {
      return true
    }

    return (
      ORDER_TYPES.includes(notification.type)
      && !(
        notification.type === 'order_status_changed'
        && typeof notification.payload?.status === 'string'
        && DELIVERY_STATUSES.has(notification.payload.status)
      )
    )
  }

  if (filter === 'delivery') {
    return (
      notification.type === 'agent_assigned'
      || notification.type === 'order_delivered'
      || (
        notification.type === 'order_status_changed'
        && typeof notification.payload?.status === 'string'
        && DELIVERY_STATUSES.has(notification.payload.status)
      )
    )
  }

  if (filter === 'assistant') {
    const combined = `${notification.title} ${notification.body}`.toLocaleLowerCase('fr')
    return (
      combined.includes('pharmagent')
      || combined.includes('assistant')
      || combined.includes('conseil')
    )
  }

  if (filter === 'payments') {
    return PAYMENT_TYPES.includes(notification.type)
  }

  return true
}

function getNotificationPresentation(notification: Notification): Presentation {
  const orderId = getNotificationOrderId(notification)
  const orderSuffix = orderId ? ` #${orderId}` : ''
  const status = typeof notification.payload?.status === 'string'
    ? notification.payload.status
    : null

  if (notification.type === 'order_placed') {
    return {
      icon: 'inventory_2',
      iconColor: '#2563eb',
      iconBackground: '#eef4ff',
      title: `Commande reçue`,
      body: `Votre commande${orderSuffix} a bien été enregistrée.`,
      category: 'Commande',
      accent: '#2563eb',
      softAccent: '#eef4ff',
      pillLabel: 'Commande',
      pillTextColor: '#2563eb',
      pillBackground: '#eef4ff',
      actionLabel: orderId ? 'Commande' : null,
    }
  }

  if (notification.type === 'order_status_changed') {
    const byStatus: Record<string, Presentation> = {
      accepted: {
        icon: 'inventory_2',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Commande acceptée',
        body: `La pharmacie a accepté votre commande${orderSuffix} et prépare actuellement vos médicaments.`,
        category: 'Commande',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Commande',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Commande' : null,
      },
      preparing: {
        icon: 'inventory_2',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Commande en préparation',
        body: `La pharmacie prépare actuellement votre commande${orderSuffix}.`,
        category: 'Commande',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Commande',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Commande' : null,
      },
      ready_for_pickup: {
        icon: 'inventory_2',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Commande prête',
        body: `Votre commande${orderSuffix} est prête à être prise en charge pour la livraison.`,
        category: 'Livraison',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Livraison',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Suivre' : null,
      },
      awaiting_agent: {
        icon: 'person_search',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Recherche d’un livreur',
        body: `Nous recherchons un livreur pour la commande${orderSuffix}.`,
        category: 'Livraison',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Livraison',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Suivre' : null,
      },
      picked_up: {
        icon: 'local_shipping',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Livreur en route',
        body: `Votre commande${orderSuffix} a été récupérée et est en cours de livraison.`,
        category: 'Livraison',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Suivi',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Suivre' : null,
      },
      out_for_delivery: {
        icon: 'local_shipping',
        iconColor: '#2563eb',
        iconBackground: '#eef4ff',
        title: 'Livreur en route',
        body: `Votre commande${orderSuffix} est en cours de livraison. Suivez la position du livreur en temps réel.`,
        category: 'Livraison',
        accent: '#2563eb',
        softAccent: '#eef4ff',
        pillLabel: 'Suivi',
        pillTextColor: '#2563eb',
        pillBackground: '#eef4ff',
        actionLabel: orderId ? 'Suivre' : null,
      },
      delivered: {
        icon: 'verified_user',
        iconColor: '#16a34a',
        iconBackground: '#eefbf1',
        title: 'Commande livrée',
        body: `Votre commande${orderSuffix} a été livrée avec succès.`,
        category: 'Livraison',
        accent: '#16a34a',
        softAccent: '#eefbf1',
        pillLabel: 'Livrée',
        pillTextColor: '#16a34a',
        pillBackground: '#e8f7ec',
        actionLabel: null,
      },
      failed: {
        icon: 'assignment_late',
        iconColor: '#5b5ce2',
        iconBackground: '#f1efff',
        title: 'Retour traité',
        body: `Le retour de votre commande${orderSuffix} a bien été enregistré par la pharmacie.`,
        category: 'Information',
        accent: '#5b5ce2',
        softAccent: '#f1efff',
        pillLabel: 'Information',
        pillTextColor: '#667085',
        pillBackground: '#f3f4fa',
        actionLabel: null,
      },
      rejected: {
        icon: 'cancel',
        iconColor: colors.error,
        iconBackground: colors.errorBg,
        title: 'Commande refusée',
        body: notification.body || `La commande${orderSuffix} ne peut pas être préparée.`,
        category: 'Commande',
        accent: colors.error,
        softAccent: colors.errorBg,
        pillLabel: 'Commande',
        pillTextColor: colors.error,
        pillBackground: '#fee2e2',
        actionLabel: orderId ? 'Commande' : null,
      },
    }

    return byStatus[status ?? ''] ?? {
      icon: 'notifications',
      iconColor: '#2563eb',
      iconBackground: '#eef4ff',
      title: notification.title || 'Mise à jour de commande',
      body: notification.body || 'Le statut de votre commande a été mis à jour.',
      category: 'Commande',
      accent: '#2563eb',
      softAccent: '#eef4ff',
      pillLabel: 'Commande',
      pillTextColor: '#2563eb',
      pillBackground: '#eef4ff',
      actionLabel: orderId ? 'Commande' : null,
    }
  }

  if (notification.type === 'order_delivered') {
    return {
      icon: 'verified_user',
      iconColor: '#16a34a',
      iconBackground: '#eefbf1',
      title: 'Commande livrée',
      body: `Votre commande${orderSuffix} a été livrée avec succès.`,
      category: 'Livraison',
      accent: '#16a34a',
      softAccent: '#eefbf1',
      pillLabel: 'Livrée',
      pillTextColor: '#16a34a',
      pillBackground: '#e8f7ec',
      actionLabel: null,
    }
  }

  if (notification.type === 'order_cancelled') {
    return {
      icon: 'cancel',
      iconColor: colors.error,
      iconBackground: colors.errorBg,
      title: 'Commande annulée',
      body: notification.body || `Votre commande${orderSuffix} a été annulée.`,
      category: 'Commande',
      accent: colors.error,
      softAccent: colors.errorBg,
      pillLabel: 'Commande',
      pillTextColor: colors.error,
      pillBackground: '#fee2e2',
      actionLabel: orderId ? 'Commande' : null,
    }
  }

  if (notification.type === 'prescription_approved') {
    return {
      icon: 'description',
      iconColor: '#2563eb',
      iconBackground: '#eef4ff',
      title: 'Ordonnance validée',
      body: `L’ordonnance de la commande${orderSuffix} a été approuvée.`,
      category: 'Commande',
      accent: '#2563eb',
      softAccent: '#eef4ff',
      pillLabel: 'Commande',
      pillTextColor: '#2563eb',
      pillBackground: '#eef4ff',
      actionLabel: orderId ? 'Commande' : null,
    }
  }

  if (notification.type === 'prescription_rejected') {
    return {
      icon: 'report',
      iconColor: colors.error,
      iconBackground: colors.errorBg,
      title: 'Ordonnance refusée',
      body: notification.body || "L’ordonnance n’a pas pu être validée.",
      category: 'Commande',
      accent: colors.error,
      softAccent: colors.errorBg,
      pillLabel: 'Commande',
      pillTextColor: colors.error,
      pillBackground: '#fee2e2',
      actionLabel: orderId ? 'Commande' : null,
    }
  }

  if (notification.type === 'payment_succeeded') {
    const amount = typeof notification.payload?.amount === 'string'
      ? notification.payload.amount
      : null

    return {
      icon: 'payments',
      iconColor: '#0f766e',
      iconBackground: '#ecfeff',
      title: 'Paiement confirmé',
      body: amount
        ? `Le paiement de ${amount} MAD pour la commande${orderSuffix} a été confirmé.`
        : `Le paiement de la commande${orderSuffix} a été confirmé.`,
      category: 'Paiement',
      accent: '#0f766e',
      softAccent: '#ecfeff',
      pillLabel: 'Paiement',
      pillTextColor: '#0f766e',
      pillBackground: '#def7f7',
      actionLabel: null,
    }
  }

  if (notification.type === 'payment_failed') {
    return {
      icon: 'credit_card_off',
      iconColor: colors.error,
      iconBackground: colors.errorBg,
      title: 'Paiement échoué',
      body: `Le paiement de la commande${orderSuffix} n’a pas pu être traité.`,
      category: 'Paiement',
      accent: colors.error,
      softAccent: colors.errorBg,
      pillLabel: 'Paiement',
      pillTextColor: colors.error,
      pillBackground: '#fee2e2',
      actionLabel: null,
    }
  }

  if (notification.type === 'agent_assigned') {
    return {
      icon: 'local_shipping',
      iconColor: '#2563eb',
      iconBackground: '#eef4ff',
      title: 'Livreur assigné',
      body: `Un livreur a été assigné à la commande${orderSuffix}.`,
      category: 'Livraison',
      accent: '#2563eb',
      softAccent: '#eef4ff',
      pillLabel: 'Livraison',
      pillTextColor: '#2563eb',
      pillBackground: '#eef4ff',
      actionLabel: orderId ? 'Suivre' : null,
    }
  }

  if (notification.type === 'delivery_offer_available') {
    return {
      icon: 'notifications',
      iconColor: '#2563eb',
      iconBackground: '#eef4ff',
      title: notification.title || 'Mise à jour disponible',
      body: notification.body || 'Une nouvelle mise à jour est disponible.',
      category: 'Information',
      accent: '#2563eb',
      softAccent: '#eef4ff',
      pillLabel: 'Information',
      pillTextColor: '#667085',
      pillBackground: '#f3f4fa',
      actionLabel: null,
    }
  }

  return {
    icon: 'notifications',
    iconColor: colors.primary,
    iconBackground: '#eef4ff',
    title: notification.title || 'Notification',
    body: notification.body || '',
    category: 'Information',
    accent: colors.primary,
    softAccent: '#eef4ff',
    pillLabel: 'Information',
    pillTextColor: '#667085',
    pillBackground: '#f3f4fa',
    actionLabel: null,
  }
}

function groupNotifications(notifications: Notification[]) {
  const sections = new Map<string, Notification[]>()

  notifications.forEach((notification) => {
    const label = sectionLabel(notification.created_at)
    const current = sections.get(label) ?? []
    current.push(notification)
    sections.set(label, current)
  })

  return Array.from(sections.entries()).map(
    ([title, data]): NotificationSection => ({
      title,
      data,
    }),
  )
}

export default function Notifications({ navigation }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [openingId, setOpeningId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadNotifications = useCallback(
    async (showInitialLoader = false) => {
      if (showInitialLoader) {
        setLoading(true)
      }

      try {
        const [listResponse, unreadResponse] = await Promise.all([
          notificationsApi.list({ page_size: 100 }),
          notificationsApi.unreadCount(),
        ])

        setNotifications(listResponse.data.results)
        setTotalCount(listResponse.data.count)
        setUnreadCount(unreadResponse.data.unread_count)
        setError(null)
      } catch (err) {
        setError(firstError(err))
      } finally {
        if (showInitialLoader) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useFocusEffect(
    useCallback(() => {
      void loadNotifications(true)
    }, [loadNotifications]),
  )

  const filteredNotifications = useMemo(
    () => notifications.filter((notification) => matchesFilter(notification, filter)),
    [filter, notifications],
  )

  const sections = useMemo(
    () => groupNotifications(filteredNotifications),
    [filteredNotifications],
  )

  const filterCount = useCallback(
    (key: FilterKey) => {
      if (key === 'all') {
        return totalCount
      }

      return notifications.filter((notification) => matchesFilter(notification, key)).length
    },
    [notifications, totalCount],
  )

  async function handleRefresh() {
    setRefreshing(true)
    await loadNotifications(false)
    setRefreshing(false)
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || markingAll) {
      return
    }

    setMarkingAll(true)

    try {
      await notificationsApi.markAllRead()
      const now = new Date().toISOString()

      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at ?? now,
        })),
      )
      setUnreadCount(0)
      setError(null)
    } catch (err) {
      setError(firstError(err))
    } finally {
      setMarkingAll(false)
    }
  }

  async function markOneRead(notification: Notification) {
    if (notification.is_read) {
      return
    }

    const response = await notificationsApi.markRead(notification.id)

    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? response.data : item)),
    )
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function handleNotificationPress(notification: Notification) {
    if (openingId !== null) {
      return
    }

    setOpeningId(notification.id)

    try {
      await markOneRead(notification)
      setError(null)

      const orderId = getNotificationOrderId(notification)
      if (orderId) {
        navigation.navigate('OrderDetail', { id: orderId })
      }
    } catch (err) {
      setError(firstError(err))
    } finally {
      setOpeningId(null)
    }
  }

  if (loading && notifications.length === 0) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement de vos notifications…</Text>
      </View>
    )
  }

  if (error && notifications.length === 0) {
    return (
      <View style={styles.centerScreen}>
        <View style={styles.errorIcon}>
          <Icon name="cloud_off" size={28} color={colors.error} />
        </View>
        <Text style={styles.errorTitle}>Impossible de charger les notifications</Text>
        <Text style={styles.errorDescription}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadNotifications(true)}>
          <Icon name="refresh" size={18} color={colors.white} />
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => String(item.id)}
      stickySectionHeadersEnabled={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          <LinearGradient
            colors={['#08248f', '#1558ff', '#1dcde0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTextBlock}>
              <Text style={styles.heroEyebrow}>CENTRE DE NOTIFICATIONS</Text>
              <Text style={styles.heroTitle}>Notifications</Text>
              <Text style={styles.heroSubtitle}>
                Suivez vos commandes, vos livraisons et les mises à jour importantes en temps réel.
              </Text>
            </View>

            <View style={styles.heroBellCard}>
              <Icon name="notifications_none" size={34} color="#1f4fff" />
              {unreadCount > 0 ? (
                <View style={styles.heroCountBadge}>
                  <Text style={styles.heroCountBadgeText}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </LinearGradient>

          <View style={styles.summaryCard}>
            <View style={styles.summaryCountBlock}>
              <Text style={styles.summaryCountValue}>{unreadCount}</Text>
              <Text style={styles.summaryCountLabel}>non lue{unreadCount !== 1 ? 's' : ''}</Text>
            </View>

            <View style={styles.summaryDivider} />

            <Pressable
              style={[
                styles.markAllLargeButton,
                (unreadCount === 0 || markingAll) && styles.markAllLargeButtonDisabled,
              ]}
              disabled={unreadCount === 0 || markingAll}
              onPress={() => void handleMarkAllRead()}
            >
              {markingAll ? (
                <ActivityIndicator size="small" color="#1f4fff" />
              ) : (
                <Icon
                  name="check_circle_outline"
                  size={18}
                  color={unreadCount === 0 ? '#a0a6b5' : '#1f4fff'}
                />
              )}
              <Text
                style={[
                  styles.markAllLargeButtonText,
                  (unreadCount === 0 || markingAll) && styles.markAllLargeButtonTextDisabled,
                ]}
              >
                Tout marquer comme lu
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {FILTERS.map((item) => {
              const active = filter === item.key
              const count = filterCount(item.key)

              return (
                <Pressable
                  key={item.key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(item.key)}
                >
                  <Icon
                    name={item.icon}
                    size={17}
                    color={active ? colors.white : '#5c6478'}
                  />
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {item.label}
                  </Text>
                  {count > 0 ? (
                    <View style={[styles.filterChipCount, active && styles.filterChipCountActive]}>
                      <Text
                        style={[
                          styles.filterChipCountText,
                          active && styles.filterChipCountTextActive,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>

          {error ? (
            <View style={styles.inlineError}>
              <Icon name="error_outline" size={18} color={colors.error} />
              <Text style={styles.inlineErrorText}>{error}</Text>
              <Pressable
                onPress={() => {
                  setError(null)
                  void handleRefresh()
                }}
              >
                <Text style={styles.inlineRetryText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      }
      renderSectionHeader={() => null}
      renderItem={({ item }) => (
        <NotificationCard
          notification={item}
          opening={openingId === item.id}
          onPress={() => void handleNotificationPress(item)}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      ListEmptyComponent={<EmptyState filter={filter} />}
      ListFooterComponent={<View style={styles.footerSpacer} />}
    />
  )
}

function NotificationCard({
  notification,
  opening,
  onPress,
}: {
  notification: Notification
  opening: boolean
  onPress: () => void
}) {
  const presentation = getNotificationPresentation(notification)
  const orderId = getNotificationOrderId(notification)
  const showReadLabel = notification.is_read && !opening

  return (
    <Pressable
      style={({ pressed }) => [styles.notificationCard, pressed && styles.notificationCardPressed]}
      onPress={onPress}
      disabled={opening}
    >
      {!notification.is_read ? <View style={styles.cardUnreadDot} /> : null}

      <View style={[styles.cardIconWrap, { backgroundColor: presentation.iconBackground }]}>
        <Icon name={presentation.icon} size={25} color={presentation.iconColor} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{presentation.title}</Text>
        <Text style={styles.cardText}>{presentation.body}</Text>
        <Text style={styles.cardTime}>{formatCardTime(notification.created_at)}</Text>
      </View>

      <View style={styles.cardRightColumn}>
        {opening ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : presentation.actionLabel ? (
          <View style={[styles.cardPill, { backgroundColor: presentation.pillBackground }]}>
            <Text style={[styles.cardPillText, { color: presentation.pillTextColor }]}>
              {presentation.actionLabel}
            </Text>
          </View>
        ) : null}

        {showReadLabel ? (
          <View style={styles.readStateRow}>
            <Icon name="done" size={16} color="#98a2b3" />
            <Text style={styles.readStateText}>Lu</Text>
          </View>
        ) : orderId ? (
          <Text style={styles.hiddenOrderLink}>Commande #{orderId}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const activeLabel = FILTERS.find((item) => item.key === filter)?.label ?? 'notifications'

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateIcon}>
        <Icon name="notifications_none" size={30} color={colors.primary} />
      </View>
      <Text style={styles.emptyStateTitle}>Aucune notification</Text>
      <Text style={styles.emptyStateText}>
        Il n’y a aucune notification dans la section « {activeLabel} » pour le moment.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f2f5fb',
  },
  content: {
    paddingBottom: 28,
    flexGrow: 1,
  },
  centerScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#f2f5fb',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorBg,
  },
  errorTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 18,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  headerWrap: {
    paddingBottom: 10,
  },
  heroCard: {
    minHeight: 222,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  heroTextBlock: {
    flex: 1,
    paddingTop: 10,
  },
  heroEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#3ae6f0',
  },
  heroTitle: {
    marginTop: 8,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.96)',
    maxWidth: 270,
  },
  heroBellCard: {
    width: 86,
    height: 86,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#001957',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heroCountBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    backgroundColor: '#ff2147',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  heroCountBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
  },
  summaryCard: {
    marginTop: 18,
    marginHorizontal: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#20335d',
    shadowOpacity: 0.09,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  summaryCountBlock: {
    width: 82,
  },
  summaryCountValue: {
    fontSize: 38,
    lineHeight: 41,
    fontWeight: '800',
    color: '#1f4fff',
  },
  summaryCountLabel: {
    marginTop: 2,
    fontSize: 14,
    color: '#323b4f',
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 14,
    backgroundColor: '#e5e7eb',
  },
  markAllLargeButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#1f4fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
  },
  markAllLargeButtonDisabled: {
    borderColor: '#d0d7e7',
  },
  markAllLargeButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    color: '#1f4fff',
  },
  markAllLargeButtonTextDisabled: {
    color: '#a0a6b5',
  },
  filterRow: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  filterChip: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#20335d',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  filterChipActive: {
    backgroundColor: '#1f4fff',
  },
  filterChipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    color: '#5c6478',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  filterChipCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
  },
  filterChipCountActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  filterChipCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1f4fff',
  },
  filterChipCountTextActive: {
    color: '#ffffff',
  },
  inlineError: {
    marginHorizontal: 24,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.errorText,
  },
  inlineRetryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.error,
  },
  sectionHeader: {
    marginHorizontal: 18,
    marginTop: 10,
    marginBottom: 7,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#7b8497',
  },
  notificationCard: {
    marginHorizontal: 16,
    paddingHorizontal: 13,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    gap: 12,
    shadowColor: '#20335d',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  notificationCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.995 }],
  },
  cardUnreadDot: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#1f4fff',
    zIndex: 2,
  },
  cardIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },
  cardTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '800',
    color: '#18233c',
  },
  cardText: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: '#4c5870',
  },
  cardTime: {
    marginTop: 8,
    fontSize: 9,
    color: '#8a93a5',
  },
  cardRightColumn: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    minWidth: 82,
    paddingTop: 2,
  },
  cardPill: {
    minHeight: 30,
    minWidth: 76,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardPillText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
  },
  readStateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readStateText: {
    fontSize: 10,
    color: '#98a2b3',
  },
  hiddenOrderLink: {
    fontSize: 12,
    color: 'transparent',
  },
  itemSeparator: {
    height: 9,
  },
  sectionSeparator: {
    height: 6,
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 32,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#20335d',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  emptyStateIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef4ff',
  },
  emptyStateTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '800',
    color: '#172033',
  },
  emptyStateText: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#667085',
  },
  footerSpacer: {
    height: 16,
  },
})
