import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import { useFocusEffect } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

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
  | 'unread'
  | 'orders'
  | 'prescriptions'
  | 'payments'
  | 'delivery'

type NotificationSection = {
  title: string
  data: Notification[]
}

const ORDER_TYPES: NotificationType[] = [
  'order_placed',
  'order_status_changed',
  'order_delivered',
  'order_cancelled',
]

const PRESCRIPTION_TYPES: NotificationType[] = [
  'prescription_approved',
  'prescription_rejected',
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
])

const FILTERS: {
  key: FilterKey
  label: string
  icon: string
}[] = [
  { key: 'all', label: 'Toutes', icon: 'notifications' },
  { key: 'unread', label: 'Non lues', icon: 'mark_email_unread' },
  { key: 'orders', label: 'Commandes', icon: 'local_mall' },
  { key: 'prescriptions', label: 'Ordonnances', icon: 'description' },
  { key: 'payments', label: 'Paiements', icon: 'payments' },
  { key: 'delivery', label: 'Livraison', icon: 'two_wheeler' },
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

function formatNotificationTime(dateString: string) {
  const date = new Date(dateString)

  if (!isValidDate(date)) {
    return ''
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000))

  if (diffMinutes < 1) {
    return "À l'instant"
  }

  if (diffMinutes < 60) {
    return `Il y a ${diffMinutes} min`
  }

  if (sameCalendarDay(date, now)) {
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (sameCalendarDay(date, yesterday)) {
    return `Hier, ${date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`
  }

  return date.toLocaleDateString('fr-MA', {
    day: 'numeric',
    month: 'short',
  })
}

function matchesFilter(notification: Notification, filter: FilterKey) {
  if (filter === 'all') {
    return true
  }

  if (filter === 'unread') {
    return !notification.is_read
  }

  if (filter === 'orders') {
    return ORDER_TYPES.includes(notification.type)
  }

  if (filter === 'prescriptions') {
    return PRESCRIPTION_TYPES.includes(notification.type)
  }

  if (filter === 'payments') {
    return PAYMENT_TYPES.includes(notification.type)
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

  return true
}

function getNotificationPresentation(notification: Notification) {
  const orderId = getNotificationOrderId(notification)
  const orderSuffix = orderId ? ` #${orderId}` : ''
  const status = typeof notification.payload?.status === 'string'
    ? notification.payload.status
    : null

  if (notification.type === 'order_placed') {
    return {
      icon: 'receipt_long',
      color: colors.primary,
      background: '#e8eefc',
      category: 'Commande',
      title: `Commande${orderSuffix} reçue`,
      body: 'Votre commande a bien été enregistrée.',
    }
  }

  if (notification.type === 'order_status_changed') {
    const statusPresentation: Record<
      string,
      {
        title: string
        body: string
        icon: string
        color: string
        background: string
      }
    > = {
      accepted: {
        title: `Commande${orderSuffix} acceptée`,
        body: 'La pharmacie a accepté votre commande.',
        icon: 'check_circle',
        color: '#047857',
        background: '#ecfdf5',
      },
      preparing: {
        title: `Commande${orderSuffix} en préparation`,
        body: 'La pharmacie prépare actuellement vos médicaments.',
        icon: 'inventory_2',
        color: '#b45309',
        background: '#fffbeb',
      },
      ready_for_pickup: {
        title: `Commande${orderSuffix} prête`,
        body: 'Votre commande est prête à être prise en charge pour la livraison.',
        icon: 'shopping_bag',
        color: '#0369a1',
        background: '#eff6ff',
      },
      awaiting_agent: {
        title: `Recherche d'un livreur`,
        body: `Nous recherchons un livreur pour la commande${orderSuffix}.`,
        icon: 'person_search',
        color: '#0369a1',
        background: '#eff6ff',
      },
      picked_up: {
        title: `Commande${orderSuffix} récupérée`,
        body: 'Le livreur a récupéré votre commande à la pharmacie.',
        icon: 'two_wheeler',
        color: '#0e7490',
        background: '#ecfeff',
      },
      out_for_delivery: {
        title: `Commande${orderSuffix} en livraison`,
        body: 'Votre commande est en route vers votre adresse.',
        icon: 'two_wheeler',
        color: '#0e7490',
        background: '#ecfeff',
      },
      rejected: {
        title: `Commande${orderSuffix} refusée`,
        body: notification.body || 'La commande ne peut pas être préparée.',
        icon: 'cancel',
        color: colors.error,
        background: colors.errorBg,
      },
    }

    const presentation = status ? statusPresentation[status] : undefined

    if (presentation) {
      return {
        ...presentation,
        category: DELIVERY_STATUSES.has(status ?? '')
          ? 'Livraison'
          : 'Commande',
      }
    }

    return {
      icon: 'update',
      color: colors.primary,
      background: '#e8eefc',
      category: 'Commande',
      title: notification.title || `Mise à jour de la commande${orderSuffix}`,
      body: notification.body || 'Le statut de votre commande a été mis à jour.',
    }
  }

  if (notification.type === 'order_delivered') {
    return {
      icon: 'task_alt',
      color: '#047857',
      background: '#ecfdf5',
      category: 'Livraison',
      title: `Commande${orderSuffix} livrée`,
      body: 'Votre commande a été livrée.',
    }
  }

  if (notification.type === 'order_cancelled') {
    return {
      icon: 'cancel',
      color: colors.error,
      background: colors.errorBg,
      category: 'Commande',
      title: `Commande${orderSuffix} annulée`,
      body: notification.body || 'Votre commande a été annulée.',
    }
  }

  if (notification.type === 'prescription_approved') {
    return {
      icon: 'fact_check',
      color: '#047857',
      background: '#ecfdf5',
      category: 'Ordonnance',
      title: 'Ordonnance validée',
      body: `L'ordonnance de la commande${orderSuffix} a été approuvée.`,
    }
  }

  if (notification.type === 'prescription_rejected') {
    const rejectionBody = notification.body
      && notification.body !== 'Your prescription could not be approved.'
      ? notification.body
      : "L'ordonnance n'a pas pu être validée."

    return {
      icon: 'report',
      color: colors.error,
      background: colors.errorBg,
      category: 'Ordonnance',
      title: 'Ordonnance refusée',
      body: rejectionBody,
    }
  }

  if (notification.type === 'payment_succeeded') {
    const amount = typeof notification.payload?.amount === 'string'
      ? notification.payload.amount
      : null

    return {
      icon: 'payments',
      color: '#047857',
      background: '#ecfdf5',
      category: 'Paiement',
      title: 'Paiement confirmé',
      body: amount
        ? `Le paiement de ${amount} MAD pour la commande${orderSuffix} a été confirmé.`
        : `Le paiement de la commande${orderSuffix} a été confirmé.`,
    }
  }

  if (notification.type === 'payment_failed') {
    return {
      icon: 'credit_card_off',
      color: colors.error,
      background: colors.errorBg,
      category: 'Paiement',
      title: 'Paiement échoué',
      body: `Le paiement de la commande${orderSuffix} n'a pas pu être traité.`,
    }
  }

  if (notification.type === 'agent_assigned') {
    return {
      icon: 'two_wheeler',
      color: '#0e7490',
      background: '#ecfeff',
      category: 'Livraison',
      title: 'Livreur assigné',
      body: `Un livreur a été assigné à la commande${orderSuffix}.`,
    }
  }

  return {
    icon: 'notifications',
    color: colors.textSecondary,
    background: '#f3f4f6',
    category: 'Notification',
    title: notification.title || 'Notification',
    body: notification.body || '',
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
  const [search, setSearch] = useState('')

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

  const readCount = Math.max(0, totalCount - unreadCount)

  const filteredNotifications = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr')

    return notifications.filter((notification) => {
      if (!matchesFilter(notification, filter)) {
        return false
      }

      if (!normalizedSearch) {
        return true
      }

      const presentation = getNotificationPresentation(notification)
      const searchableText = [
        presentation.title,
        presentation.body,
        presentation.category,
        notification.title,
        notification.body,
        String(getNotificationOrderId(notification) ?? ''),
      ]
        .join(' ')
        .toLocaleLowerCase('fr')

      return searchableText.includes(normalizedSearch)
    })
  }, [filter, notifications, search])

  const sections = useMemo(
    () => groupNotifications(filteredNotifications),
    [filteredNotifications],
  )

  const filterCount = useCallback(
    (key: FilterKey) => {
      if (key === 'all') {
        return totalCount
      }

      if (key === 'unread') {
        return unreadCount
      }

      return notifications.filter((notification) =>
        matchesFilter(notification, key),
      ).length
    },
    [notifications, totalCount, unreadCount],
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
      current.map((item) =>
        item.id === notification.id
          ? response.data
          : item,
      ),
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
        <Text style={styles.loadingText}>
          Chargement de vos notifications…
        </Text>
      </View>
    )
  }

  if (error && notifications.length === 0) {
    return (
      <View style={styles.centerScreen}>
        <View style={styles.errorIcon}>
          <Icon name="cloud_off" size={28} color={colors.error} />
        </View>

        <Text style={styles.errorTitle}>
          Impossible de charger les notifications
        </Text>

        <Text style={styles.errorDescription}>
          {error}
        </Text>

        <Pressable
          style={styles.retryButton}
          onPress={() => void loadNotifications(true)}
        >
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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void handleRefresh()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerContent}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>
                Suivez vos commandes, ordonnances et livraisons.
              </Text>
            </View>

            <View
              style={[
                styles.unreadHeaderBadge,
                unreadCount === 0 && styles.unreadHeaderBadgeEmpty,
              ]}
            >
              <Text
                style={[
                  styles.unreadHeaderBadgeValue,
                  unreadCount === 0 && styles.unreadHeaderBadgeValueEmpty,
                ]}
              >
                {unreadCount}
              </Text>
              <Text
                style={[
                  styles.unreadHeaderBadgeLabel,
                  unreadCount === 0 && styles.unreadHeaderBadgeLabelEmpty,
                ]}
              >
                non lue{unreadCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon="notifications"
              label="Total"
              value={totalCount}
              iconColor={colors.primary}
              iconBackground="#e8eefc"
            />
            <StatCard
              icon="mark_email_unread"
              label="Non lues"
              value={unreadCount}
              iconColor="#0e7490"
              iconBackground="#ecfeff"
            />
            <StatCard
              icon="drafts"
              label="Lues"
              value={readCount}
              iconColor="#047857"
              iconBackground="#ecfdf5"
            />
          </View>

          <View style={styles.actionRow}>
            <View style={styles.searchBox}>
              <Icon name="search" size={19} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher une notification…"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />

              {search.length > 0 ? (
                <Pressable
                  style={styles.clearSearchButton}
                  onPress={() => setSearch('')}
                  hitSlop={8}
                >
                  <Icon
                    name="close"
                    size={17}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[
                styles.markAllButton,
                (unreadCount === 0 || markingAll)
                  && styles.markAllButtonDisabled,
              ]}
              disabled={unreadCount === 0 || markingAll}
              onPress={() => void handleMarkAllRead()}
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
                  color={
                    unreadCount === 0
                      ? colors.textMuted
                      : colors.primary
                  }
                />
              )}

              <Text
                style={[
                  styles.markAllButtonText,
                  unreadCount === 0
                    && styles.markAllButtonTextDisabled,
                ]}
              >
                Tout lire
              </Text>
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContent}
          >
            {FILTERS.map((item) => {
              const active = filter === item.key
              const count = filterCount(item.key)

              return (
                <Pressable
                  key={item.key}
                  style={[
                    styles.filterButton,
                    active && styles.filterButtonActive,
                  ]}
                  onPress={() => setFilter(item.key)}
                >
                  <Icon
                    name={item.icon}
                    size={16}
                    color={
                      active
                        ? colors.white
                        : colors.textSecondary
                    }
                  />

                  <Text
                    style={[
                      styles.filterButtonText,
                      active && styles.filterButtonTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>

                  {count > 0 ? (
                    <View
                      style={[
                        styles.filterCount,
                        active && styles.filterCountActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterCountText,
                          active && styles.filterCountTextActive,
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
              <Icon
                name="error_outline"
                size={18}
                color={colors.error}
              />
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

          <View style={styles.listIntroRow}>
            <Text style={styles.listIntroTitle}>
              {filter === 'all'
                ? 'Toutes les notifications'
                : FILTERS.find((item) => item.key === filter)?.label}
            </Text>
            <Text style={styles.listIntroCount}>
              {filteredNotifications.length}
            </Text>
          </View>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <NotificationCard
          notification={item}
          opening={openingId === item.id}
          onPress={() => void handleNotificationPress(item)}
        />
      )}
      ItemSeparatorComponent={() => (
        <View style={styles.itemSeparator} />
      )}
      SectionSeparatorComponent={() => (
        <View style={styles.sectionSeparator} />
      )}
      ListEmptyComponent={
        <EmptyState
          hasSearch={search.trim().length > 0}
          filter={filter}
          onClear={() => {
            setSearch('')
            setFilter('all')
          }}
        />
      }
      ListFooterComponent={
        notifications.length > 0 ? (
          <View style={styles.footerNote}>
            <Icon
              name="info_outline"
              size={17}
              color={colors.textMuted}
            />
            <Text style={styles.footerNoteText}>
              Les notifications liées à une commande ouvrent directement
              son suivi détaillé.
            </Text>
          </View>
        ) : null
      }
      showsVerticalScrollIndicator={false}
    />
  )
}

function StatCard({
  icon,
  label,
  value,
  iconColor,
  iconBackground,
}: {
  icon: string
  label: string
  value: number
  iconColor: string
  iconBackground: string
}) {
  return (
    <View style={styles.statCard}>
      <View
        style={[
          styles.statIcon,
          { backgroundColor: iconBackground },
        ]}
      >
        <Icon name={icon} size={18} color={iconColor} />
      </View>

      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
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

  return (
    <Pressable
      style={({ pressed }) => [
        styles.notificationCard,
        !notification.is_read && styles.notificationCardUnread,
        pressed && styles.notificationCardPressed,
      ]}
      onPress={onPress}
      disabled={opening}
    >
      <View
        style={[
          styles.notificationIcon,
          { backgroundColor: presentation.background },
        ]}
      >
        <Icon
          name={presentation.icon}
          size={22}
          color={presentation.color}
        />
      </View>

      <View style={styles.notificationContent}>
        <View style={styles.notificationMetaRow}>
          <View style={styles.notificationCategoryRow}>
            {!notification.is_read ? (
              <View style={styles.unreadDot} />
            ) : null}

            <Text style={styles.notificationCategory}>
              {presentation.category}
            </Text>
          </View>

          <Text style={styles.notificationTime}>
            {formatNotificationTime(notification.created_at)}
          </Text>
        </View>

        <Text
          style={[
            styles.notificationTitle,
            !notification.is_read
              && styles.notificationTitleUnread,
          ]}
        >
          {presentation.title}
        </Text>

        {presentation.body ? (
          <Text
            style={styles.notificationBody}
            numberOfLines={3}
          >
            {presentation.body}
          </Text>
        ) : null}

        {orderId ? (
          <View style={styles.notificationAction}>
            <Text style={styles.notificationActionText}>
              Voir la commande #{orderId}
            </Text>
            <Icon
              name="arrow_forward"
              size={15}
              color={colors.primary}
            />
          </View>
        ) : null}
      </View>

      {opening ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
        />
      ) : orderId ? (
        <Icon
          name="chevron_right"
          size={22}
          color={colors.textMuted}
        />
      ) : null}
    </Pressable>
  )
}

function EmptyState({
  hasSearch,
  filter,
  onClear,
}: {
  hasSearch: boolean
  filter: FilterKey
  onClear: () => void
}) {
  const isDefaultEmpty = !hasSearch && filter === 'all'

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon
          name={
            isDefaultEmpty
              ? 'notifications_none'
              : 'filter_alt_off'
          }
          size={30}
          color={colors.primary}
        />
      </View>

      <Text style={styles.emptyTitle}>
        {isDefaultEmpty
          ? 'Aucune notification pour le moment'
          : 'Aucun résultat'}
      </Text>

      <Text style={styles.emptyDescription}>
        {isDefaultEmpty
          ? 'Les mises à jour de vos commandes apparaîtront ici.'
          : 'Aucune notification ne correspond à votre recherche ou à ce filtre.'}
      </Text>

      {!isDefaultEmpty ? (
        <Pressable
          style={styles.emptyButton}
          onPress={onClear}
        >
          <Icon name="restart_alt" size={17} color={colors.primary} />
          <Text style={styles.emptyButtonText}>
            Réinitialiser les filtres
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
    backgroundColor: colors.surface,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.errorBg,
  },
  errorTitle: {
    marginTop: 3,
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 5,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  headerContent: {
    gap: 14,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  unreadHeaderBadge: {
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  unreadHeaderBadgeEmpty: {
    backgroundColor: '#f9fafb',
    borderColor: colors.outlineVariant,
  },
  unreadHeaderBadgeValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0e7490',
  },
  unreadHeaderBadgeValueEmpty: {
    color: colors.textMuted,
  },
  unreadHeaderBadgeLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '600',
    color: '#0e7490',
  },
  unreadHeaderBadgeLabelEmpty: {
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    marginTop: 1,
    fontSize: 9,
    color: colors.textMuted,
  },
  actionRow: {
    gap: 9,
  },
  searchBox: {
    minHeight: 47,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.textPrimary,
  },
  clearSearchButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markAllButton: {
    alignSelf: 'flex-end',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: '#eef3ff',
  },
  markAllButtonDisabled: {
    backgroundColor: '#f3f4f6',
  },
  markAllButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  markAllButtonTextDisabled: {
    color: colors.textMuted,
  },
  filtersContent: {
    gap: 8,
    paddingRight: 6,
  },
  filterButton: {
    minHeight: 37,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  filterButtonActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  filterCount: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  filterCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  filterCountTextActive: {
    color: colors.white,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: colors.errorBg,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: colors.errorText,
  },
  inlineRetryText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
  },
  listIntroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  listIntroTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  listIntroCount: {
    minWidth: 26,
    height: 26,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 13,
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: '#eef3ff',
  },
  sectionHeader: {
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  notificationCardUnread: {
    borderColor: '#bfdbfe',
    backgroundColor: '#fbfdff',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  notificationCardPressed: {
    opacity: 0.78,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationContent: {
    flex: 1,
    minWidth: 0,
  },
  notificationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notificationCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  notificationCategory: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.45,
    color: colors.textMuted,
  },
  notificationTime: {
    fontSize: 9,
    color: colors.textMuted,
  },
  notificationTitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notificationTitleUnread: {
    fontWeight: '800',
  },
  notificationBody: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  notificationAction: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notificationActionText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  itemSeparator: {
    height: 9,
  },
  sectionSeparator: {
    height: 8,
  },
  emptyState: {
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 42,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  emptyTitle: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 5,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#eef3ff',
  },
  emptyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  footerNote: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 4,
  },
  footerNoteText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: colors.textMuted,
  },
})