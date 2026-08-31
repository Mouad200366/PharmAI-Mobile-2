import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import {
  isActiveOrder,
  ordersApi,
  STATUS_COLOR,
  STATUS_LABELS,
  type Order,
  type OrderStatus,
} from '../../api/orders'
import {
  createOrderTrackingSocket,
  parseOrderTrackingEvent,
} from '../../api/orderRealtime'
import { tokenStorage } from '../../store/tokenStorage'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Orders'>,
  NativeStackScreenProps<MainStackParamList>
>

type FilterKey = 'all' | 'active' | 'delivered' | 'cancelled'

type FilterDefinition = {
  key: FilterKey
  label: string
  matches: (order: Order) => boolean
}

const CANCELLED_STATUSES: OrderStatus[] = ['cancelled', 'rejected', 'failed']
const ORDER_REALTIME_RECONNECT_MS = 3_000

const FILTERS: FilterDefinition[] = [
  { key: 'all', label: 'Toutes', matches: () => true },
  { key: 'active', label: 'En cours', matches: (order) => isActiveOrder(order.status) },
  { key: 'delivered', label: 'Livrées', matches: (order) => order.status === 'delivered' },
  {
    key: 'cancelled',
    label: 'Annulées',
    matches: (order) => CANCELLED_STATUSES.includes(order.status),
  },
]

const ACTIVE_STAGES = ['Validation', 'Préparation', 'Prête', 'En route'] as const

const ACTIVE_STAGE_BY_STATUS: Partial<Record<OrderStatus, number>> = {
  pending_payment: 0,
  pending_review: 0,
  accepted: 0,
  preparing: 1,
  ready_for_pickup: 2,
  awaiting_agent: 2,
  picked_up: 3,
  out_for_delivery: 3,
}

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending_payment: 'Votre commande attend la confirmation du paiement.',
  pending_review: 'La pharmacie vérifie les produits et votre ordonnance.',
  rejected: "La pharmacie n'a pas pu accepter cette commande.",
  accepted: 'Votre commande a été acceptée par la pharmacie.',
  preparing: 'La pharmacie prépare actuellement vos médicaments.',
  ready_for_pickup: 'Votre commande est prête à être remise au livreur.',
  awaiting_agent: "Nous recherchons un livreur disponible pour votre commande.",
  picked_up: 'Le livreur a récupéré votre commande à la pharmacie.',
  out_for_delivery: 'Votre commande est en route vers votre adresse.',
  delivered: 'Votre commande a été livrée avec succès.',
  cancelled: 'Cette commande a été annulée.',
  failed: "Cette commande n'a pas pu être finalisée.",
}

export default function MyOrders({ navigation }: Props) {
  const isFocused = useIsFocused()
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedOnce = useRef(false)

  const loadOrders = useCallback(async () => {
    try {
      const response = await ordersApi.list()
      const nextOrders = [...response.data].sort(
        (first, second) =>
          new Date(second.created_at).getTime() - new Date(first.created_at).getTime(),
      )

      setOrders(nextOrders)
      setError(null)
    } catch (loadError) {
      setError(getOrdersErrorMessage(loadError))
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce.current) {
        setLoading(true)
      }

      void loadOrders().finally(() => {
        hasLoadedOnce.current = true
        setLoading(false)
      })
    }, [loadOrders]),
  )

  const activeOrderKey = orders
    .filter((order) => isActiveOrder(order.status))
    .map((order) => order.id)
    .sort((left, right) => left - right)
    .join(',')

  useEffect(() => {
    if (!isFocused || !activeOrderKey) {
      return
    }

    const orderIds = activeOrderKey
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))

    let active = true
    const sockets = new Map<number, WebSocket>()
    const reconnectTimers = new Map<
      number,
      ReturnType<typeof setTimeout>
    >()

    const clearReconnectTimer = (orderId: number) => {
      const timer = reconnectTimers.get(orderId)

      if (timer) {
        clearTimeout(timer)
        reconnectTimers.delete(orderId)
      }
    }

    const scheduleReconnect = (
      orderId: number,
      connectOrder: (id: number) => Promise<void>,
    ) => {
      if (!active || reconnectTimers.has(orderId)) {
        return
      }

      const timer = setTimeout(() => {
        reconnectTimers.delete(orderId)
        void connectOrder(orderId)
      }, ORDER_REALTIME_RECONNECT_MS)

      reconnectTimers.set(orderId, timer)
    }

    const connectOrder = async (orderId: number) => {
      const accessToken = await tokenStorage.getAccessToken()

      if (!active || !accessToken) {
        return
      }

      clearReconnectTimer(orderId)

      try {
        const socket = createOrderTrackingSocket(
          orderId,
          accessToken,
        )

        sockets.set(orderId, socket)

        socket.onmessage = (event) => {
          if (!active) {
            return
          }

          const realtimeEvent =
            parseOrderTrackingEvent(event.data)

          if (
            !realtimeEvent
            || realtimeEvent.type !== 'status_change'
            || realtimeEvent.order_id !== orderId
          ) {
            return
          }

          // Update the visible list immediately so filters, badges and the
          // featured active order react without a manual refresh.
          setOrders((currentOrders) =>
            currentOrders.map((order) =>
              order.id === orderId
                ? {
                    ...order,
                    status: realtimeEvent.status,
                  }
                : order,
            ),
          )

          // REST remains authoritative for timestamps, history and any other
          // fields that may have changed with the same transition.
          void loadOrders()
        }

        socket.onerror = () => {
          // onclose owns reconnect scheduling. REST refresh still works.
        }

        socket.onclose = () => {
          if (sockets.get(orderId) === socket) {
            sockets.delete(orderId)
          }

          scheduleReconnect(orderId, connectOrder)
        }
      } catch {
        scheduleReconnect(orderId, connectOrder)
      }
    }

    orderIds.forEach((orderId) => {
      void connectOrder(orderId)
    })

    return () => {
      active = false

      reconnectTimers.forEach((timer) => {
        clearTimeout(timer)
      })
      reconnectTimers.clear()

      sockets.forEach((socket) => {
        socket.close()
      })
      sockets.clear()
    }
  }, [
    activeOrderKey,
    isFocused,
    loadOrders,
  ])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadOrders()
    setRefreshing(false)
  }, [loadOrders])

  const handleRetry = useCallback(async () => {
    setLoading(true)
    await loadOrders()
    setLoading(false)
  }, [loadOrders])

  const selectedFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[0]
  const filteredOrders = orders.filter(selectedFilter.matches)

  const latestActiveOrder =
    filter === 'all' || filter === 'active'
      ? orders.find((order) => isActiveOrder(order.status)) ?? null
      : null

  const displayedOrders = latestActiveOrder
    ? filteredOrders.filter((order) => order.id !== latestActiveOrder.id)
    : filteredOrders

  const filterCounts: Record<FilterKey, number> = {
    all: orders.length,
    active: orders.filter((order) => isActiveOrder(order.status)).length,
    delivered: orders.filter((order) => order.status === 'delivered').length,
    cancelled: orders.filter((order) => CANCELLED_STATUSES.includes(order.status)).length,
  }

  const heroActiveOrder =
    orders.find((order) => isActiveOrder(order.status)) ?? null

  const openOrder = useCallback(
    (orderId: number) => navigation.navigate('OrderDetail', { id: orderId }),
    [navigation],
  )

  if (loading) {
    return <OrdersLoadingState />
  }

  if (error && orders.length === 0) {
    return <OrdersErrorState message={error} onRetry={handleRetry} />
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={displayedOrders}
      keyExtractor={(order) => String(order.id)}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#073BDF"
          colors={['#073BDF']}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerContent}>
          <LinearGradient
            colors={['#073BDF', '#087DFF', '#10D1D0']}
            start={{ x: 0, y: 0.1 }}
            end={{ x: 1, y: 0.9 }}
            style={styles.hero}
          >
            <View style={styles.heroGlowOne} />
            <View style={styles.heroGlowTwo} />

            <View style={styles.heroTopRow}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>SUIVI DES COMMANDES</Text>
                <Text style={styles.heroTitle}>Mes commandes</Text>
                <Text style={styles.heroSubtitle}>
                  Retrouvez vos commandes en cours et votre historique en un coup d'œil.
                </Text>
              </View>

              <View style={styles.heroBag}>
                <Icon name="shopping_bag" size={31} color="#073BDF" />
                <View style={styles.heroBagSpark}>
                  <Text style={styles.heroBagSparkText}>AI</Text>
                </View>
              </View>
            </View>

            {heroActiveOrder ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Ouvrir la commande active numéro ${heroActiveOrder.id}`}
                style={({ pressed }) => [
                  styles.heroActiveBanner,
                  pressed && styles.buttonPressed,
                ]}
                onPress={() => openOrder(heroActiveOrder.id)}
              >
                <View style={styles.heroActiveIcon}>
                  <Icon
                    name={getStatusIcon(heroActiveOrder.status)}
                    size={22}
                    color="#073BDF"
                  />
                </View>

                <View style={styles.heroActiveContent}>
                  <Text style={styles.heroActiveTitle}>
                    {filterCounts.active} commande
                    {filterCounts.active !== 1 ? 's' : ''} active
                    {filterCounts.active !== 1 ? 's' : ''}
                  </Text>
                  <Text style={styles.heroActiveText} numberOfLines={1}>
                    {STATUS_DESCRIPTIONS[heroActiveOrder.status]}
                  </Text>
                </View>

                <Icon name="chevron_right" size={25} color="#073BDF" />
              </Pressable>
            ) : (
              <View style={styles.heroActiveBanner}>
                <View style={styles.heroActiveIcon}>
                  <Icon name="task_alt" size={22} color="#073BDF" />
                </View>
                <View style={styles.heroActiveContent}>
                  <Text style={styles.heroActiveTitle}>Aucune commande active</Text>
                  <Text style={styles.heroActiveText}>
                    Votre historique reste disponible ci-dessous.
                  </Text>
                </View>
              </View>
            )}
          </LinearGradient>

          <View style={styles.statsRow}>
            <StatCard
              icon="receipt_long"
              value={filterCounts.all}
              label="Total"
              iconColor="#073BDF"
              iconBackground="#EEF5FF"
            />
            <StatCard
              icon="schedule"
              value={filterCounts.active}
              label="En cours"
              iconColor="#087DFF"
              iconBackground="#EAF4FF"
            />
            <StatCard
              icon="check_circle"
              value={filterCounts.delivered}
              label="Livrées"
              iconColor="#10AFAE"
              iconBackground="#EAFBFA"
            />
            <StatCard
              icon="cancel"
              value={filterCounts.cancelled}
              label="Annulées"
              iconColor="#D92D20"
              iconBackground="#FFF0F0"
            />
          </View>

          {error ? <InlineError message={error} onRetry={handleRefresh} /> : null}

          <FilterTabs
            selectedFilter={filter}
            counts={filterCounts}
            onSelect={setFilter}
          />

          {latestActiveOrder ? (
            <View style={styles.featuredSection}>
              <View style={styles.sectionHeading}>
                <View>
                  <Text style={styles.sectionEyebrow}>EN COURS</Text>
                  <Text style={styles.sectionTitle}>Commande active</Text>
                </View>

                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Suivi actif</Text>
                </View>
              </View>

              <FeaturedActiveOrder
                order={latestActiveOrder}
                onPress={() => openOrder(latestActiveOrder.id)}
              />
            </View>
          ) : null}

          {displayedOrders.length > 0 ? (
            <View style={styles.historyHeading}>
              <View>
                <Text style={styles.sectionEyebrow}>
                  {filter === 'all' ? 'HISTORIQUE' : 'COMMANDES'}
                </Text>
                <Text style={styles.sectionTitle}>{getSectionTitle(filter)}</Text>
              </View>

              <View style={styles.historyCountPill}>
                <Text style={styles.historyCountText}>
                  {displayedOrders.length}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <OrderCard
          order={item}
          onPress={() => openOrder(item.id)}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      ListEmptyComponent={
        latestActiveOrder ? null : (
          <OrdersEmptyState
            filter={filter}
            onRefresh={handleRefresh}
          />
        )
      }
    />
  )
}

function OrdersLoadingState() {
  return (
    <View style={styles.centeredScreen}>
      <View style={styles.loadingIconContainer}>
        <Icon name="receipt_long" size={28} color={colors.primary} />
      </View>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingTitle}>Chargement de vos commandes</Text>
      <Text style={styles.loadingText}>Nous récupérons les dernières informations.</Text>
    </View>
  )
}

function OrdersErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centeredScreen}>
      <View style={[styles.loadingIconContainer, styles.errorIconContainer]}>
        <Icon name="cloud_off" size={30} color={colors.error} />
      </View>
      <Text style={styles.errorStateTitle}>Impossible de charger vos commandes</Text>
      <Text style={styles.errorStateText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
        onPress={onRetry}
      >
        <Icon name="refresh" size={19} color={colors.white} />
        <Text style={styles.primaryButtonText}>Réessayer</Text>
      </Pressable>
    </View>
  )
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.inlineError}>
      <View style={styles.inlineErrorIcon}>
        <Icon name="wifi_off" size={19} color={colors.error} />
      </View>
      <View style={styles.inlineErrorContent}>
        <Text style={styles.inlineErrorTitle}>Mise à jour impossible</Text>
        <Text style={styles.inlineErrorText} numberOfLines={2}>
          {message}
        </Text>
      </View>
      <Pressable accessibilityRole="button" style={styles.retryIconButton} onPress={onRetry}>
        <Icon name="refresh" size={20} color={colors.primary} />
      </Pressable>
    </View>
  )
}

function StatCard({
  icon,
  value,
  label,
  iconColor,
  iconBackground,
}: {
  icon: string
  value: number
  label: string
  iconColor: string
  iconBackground: string
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: iconBackground }]}>
        <Icon name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

function FilterTabs({
  selectedFilter,
  counts,
  onSelect,
}: {
  selectedFilter: FilterKey
  counts: Record<FilterKey, number>
  onSelect: (filter: FilterKey) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filtersContent}
    >
      {FILTERS.map((item) => {
        const selected = selectedFilter === item.key

        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.filterChip,
              selected && styles.filterChipSelected,
              pressed && styles.buttonPressed,
            ]}
            onPress={() => onSelect(item.key)}
          >
            <Text
              style={[
                styles.filterLabel,
                selected && styles.filterLabelSelected,
              ]}
            >
              {item.label}
            </Text>

            <View
              style={[
                styles.filterCount,
                selected && styles.filterCountSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterCountText,
                  selected && styles.filterCountTextSelected,
                ]}
              >
                {counts[item.key]}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function FeaturedActiveOrder({
  order,
  onPress,
}: {
  order: Order
  onPress: () => void
}) {
  const statusColors = STATUS_COLOR[order.status]
  const currentStage = ACTIVE_STAGE_BY_STATUS[order.status] ?? 0
  const articleCount = getArticleCount(order)

  return (
    <View style={styles.featuredCard}>
      <View style={styles.featuredHeader}>
        <View style={styles.featuredIdentity}>
          <View style={styles.featuredIcon}>
            <Icon
              name={getStatusIcon(order.status)}
              size={25}
              color="#073BDF"
            />
          </View>

          <View style={styles.flexContent}>
            <Text style={styles.featuredOrderId}>
              Commande #{order.id}
            </Text>
            <Text
              style={styles.featuredMedicineSummary}
              numberOfLines={1}
            >
              {getMedicineSummary(order)}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColors.bg },
          ]}
        >
          <Text
            style={[
              styles.statusBadgeText,
              { color: statusColors.text },
            ]}
          >
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.featuredDescription}>
        {STATUS_DESCRIPTIONS[order.status]}
      </Text>

      <View style={styles.progressRow}>
        {ACTIVE_STAGES.map((stage, index) => {
          const completed = index < currentStage
          const current = index === currentStage

          return (
            <View key={stage} style={styles.progressStage}>
              <View style={styles.progressTrackRow}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.progressConnector,
                      index <= currentStage &&
                        styles.progressConnectorActive,
                    ]}
                  />
                ) : (
                  <View style={styles.progressConnectorSpacer} />
                )}

                <View
                  style={[
                    styles.progressDot,
                    completed && styles.progressDotCompleted,
                    current && styles.progressDotCurrent,
                  ]}
                >
                  {completed ? (
                    <Icon name="check" size={12} color="#FFFFFF" />
                  ) : current ? (
                    <View style={styles.progressCurrentCenter} />
                  ) : null}
                </View>

                {index < ACTIVE_STAGES.length - 1 ? (
                  <View
                    style={[
                      styles.progressConnector,
                      index < currentStage &&
                        styles.progressConnectorActive,
                    ]}
                  />
                ) : (
                  <View style={styles.progressConnectorSpacer} />
                )}
              </View>

              <Text
                style={[
                  styles.progressStageLabel,
                  current && styles.progressStageLabelCurrent,
                ]}
                numberOfLines={1}
              >
                {stage}
              </Text>
            </View>
          )
        })}
      </View>

      <View style={styles.featuredMetrics}>
        <View style={styles.featuredMetric}>
          <Text style={styles.metricLabel}>Articles</Text>
          <Text style={styles.metricValue}>{articleCount}</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.featuredMetric}>
          <Text style={styles.metricLabel}>Total</Text>
          <Text style={styles.metricValue}>
            {formatMoney(order.grand_total)}
          </Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.featuredMetric}>
          <Text style={styles.metricLabel}>Statut</Text>
          <Text
            style={styles.metricStatusValue}
            numberOfLines={1}
          >
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      {order.delivery_address ? (
        <View style={styles.featuredAddress}>
          <View style={styles.addressIcon}>
            <Icon name="location_on" size={17} color="#087DFF" />
          </View>
          <Text
            style={styles.featuredAddressText}
            numberOfLines={2}
          >
            {order.delivery_address}
          </Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.trackButton,
          pressed && styles.buttonPressed,
        ]}
        onPress={onPress}
      >
        <Icon name="my_location" size={18} color="#FFFFFF" />
        <Text style={styles.trackButtonText}>
          Suivre la commande
        </Text>
        <Icon name="arrow_forward" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  )
}

function OrderCard({
  order,
  onPress,
}: {
  order: Order
  onPress: () => void
}) {
  const statusColors = STATUS_COLOR[order.status]
  const articleCount = getArticleCount(order)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la commande numéro ${order.id}`}
      style={({ pressed }) => [
        styles.orderCard,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.orderStatusIcon,
          { backgroundColor: statusColors.bg },
        ]}
      >
        <Icon
          name={getStatusIcon(order.status)}
          size={20}
          color={statusColors.text}
        />
      </View>

      <View style={styles.orderMain}>
        <Text style={styles.orderId}>
          Commande #{order.id}
        </Text>
        <Text style={styles.orderDate}>
          {formatOrderDate(order.created_at)}
        </Text>
        <Text
          style={styles.orderMedicine}
          numberOfLines={1}
        >
          {getMedicineSummary(order)}
        </Text>
        <Text style={styles.articleCount}>
          {articleCount} article
          {articleCount !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.orderRight}>
        <View
          style={[
            styles.compactStatusBadge,
            { backgroundColor: statusColors.bg },
          ]}
        >
          <Text
            style={[
              styles.compactStatusText,
              { color: statusColors.text },
            ]}
            numberOfLines={1}
          >
            {STATUS_LABELS[order.status]}
          </Text>
        </View>

        <Text style={styles.orderTotal}>
          {formatMoney(order.grand_total)}
        </Text>
      </View>

      <Icon name="chevron_right" size={22} color="#073BDF" />
    </Pressable>
  )
}

function OrdersEmptyState({ filter, onRefresh }: { filter: FilterKey; onRefresh: () => void }) {
  const content: Record<FilterKey, { icon: string; title: string; text: string }> = {
    all: {
      icon: 'receipt_long',
      title: 'Aucune commande pour le moment',
      text: 'Vos prochaines commandes apparaîtront ici avec leur suivi détaillé.',
    },
    active: {
      icon: 'schedule',
      title: 'Aucune commande en cours',
      text: "Vous n'avez actuellement aucune commande en préparation ou en livraison.",
    },
    delivered: {
      icon: 'check_circle_outline',
      title: 'Aucune commande livrée',
      text: 'Les commandes livrées seront conservées ici pour vous permettre de les consulter.',
    },
    cancelled: {
      icon: 'cancel',
      title: 'Aucune commande annulée',
      text: "Vous n'avez aucune commande annulée, rejetée ou échouée.",
    },
  }

  const selectedContent = content[filter]

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Icon name={selectedContent.icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{selectedContent.title}</Text>
      <Text style={styles.emptyText}>{selectedContent.text}</Text>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
        onPress={onRefresh}
      >
        <Icon name="refresh" size={18} color={colors.primary} />
        <Text style={styles.secondaryButtonText}>Actualiser</Text>
      </Pressable>
    </View>
  )
}

function getSectionTitle(filter: FilterKey) {
  switch (filter) {
    case 'active':
      return 'Commandes en cours'
    case 'delivered':
      return 'Commandes livrées'
    case 'cancelled':
      return 'Commandes annulées'
    default:
      return 'Historique des commandes'
  }
}

function getArticleCount(order: Order) {
  return order.items.reduce((total, item) => total + item.quantity, 0)
}

function getMedicineSummary(order: Order) {
  if (!order.items.length) {
    return 'Détails des médicaments indisponibles'
  }

  const visibleItems = order.items.slice(0, 2).map((item) => {
    const quantity = item.quantity > 1 ? ` ×${item.quantity}` : ''
    return `${item.medicine_name}${quantity}`
  })

  const remainingCount = order.items.length - visibleItems.length

  if (remainingCount > 0) {
    return `${visibleItems.join(', ')} +${remainingCount} autre${remainingCount > 1 ? 's' : ''}`
  }

  return visibleItems.join(', ')
}

function formatOrderDate(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date indisponible'
  }

  return date.toLocaleDateString('fr-MA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatMoney(value: string) {
  const amount = Number(value)

  if (Number.isNaN(amount)) {
    return `${value} MAD`
  }

  return `${amount.toFixed(2).replace('.', ',')} MAD`
}

function getStatusIcon(status: OrderStatus) {
  const icons: Record<OrderStatus, string> = {
    pending_payment: 'payments',
    pending_review: 'fact_check',
    rejected: 'cancel',
    accepted: 'check_circle',
    preparing: 'inventory_2',
    ready_for_pickup: 'inventory',
    awaiting_agent: 'person_search',
    picked_up: 'local_shipping',
    out_for_delivery: 'delivery_dining',
    delivered: 'task_alt',
    cancelled: 'block',
    failed: 'error_outline',
  }

  return icons[status]
}

function getOrdersErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '')

    if (message.toLowerCase().includes('network')) {
      return 'Vérifiez votre connexion et assurez-vous que le serveur PharmAI est accessible.'
    }
  }

  return 'Une erreur est survenue pendant le chargement. Veuillez réessayer.'
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFF',
  },
  content: {
    paddingBottom: 38,
  },
  headerContent: {
    gap: 16,
    marginBottom: 14,
  },
  flexContent: {
    flex: 1,
    minWidth: 0,
  },

  hero: {
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroGlowOne: {
    position: 'absolute',
    top: -82,
    right: -72,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  heroGlowTwo: {
    position: 'absolute',
    bottom: -100,
    right: 82,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroEyebrow: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.15,
    color: '#D9F9FF',
  },
  heroTitle: {
    marginTop: 7,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -0.8,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    marginTop: 7,
    maxWidth: 285,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    color: '#EDF9FF',
  },
  heroBag: {
    position: 'relative',
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.70)',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  heroBagSpark: {
    position: 'absolute',
    right: 7,
    bottom: 7,
    minWidth: 25,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: '#10D1D0',
  },
  heroBagSparkText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  heroActiveBanner: {
    minHeight: 78,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  heroActiveIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#EAF3FF',
  },
  heroActiveContent: {
    flex: 1,
    minWidth: 0,
  },
  heroActiveTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  heroActiveText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#657791',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 102,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#12366F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 9,
    elevation: 2,
  },
  statIcon: {
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  statLabel: {
    marginTop: 7,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: '#657791',
  },
  statValue: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
    color: '#0B1F4D',
  },

  inlineError: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
  },
  inlineErrorIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  inlineErrorContent: {
    flex: 1,
  },
  inlineErrorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B42318',
  },
  inlineErrorText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    color: '#991B1B',
  },
  retryIconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },

  filtersContent: {
    gap: 8,
    paddingHorizontal: 16,
    paddingRight: 22,
  },
  filterChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#D8E4F3',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  filterChipSelected: {
    borderColor: '#073BDF',
    backgroundColor: '#073BDF',
    shadowColor: '#073BDF',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.17,
    shadowRadius: 7,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: '#526684',
  },
  filterLabelSelected: {
    color: '#FFFFFF',
  },
  filterCount: {
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderRadius: 8,
    backgroundColor: '#EEF4FB',
  },
  filterCountSelected: {
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  filterCountText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    color: '#526684',
  },
  filterCountTextSelected: {
    color: '#FFFFFF',
  },

  featuredSection: {
    gap: 10,
    paddingHorizontal: 16,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.05,
    color: '#087DFF',
  },
  sectionTitle: {
    marginTop: 2,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: -0.35,
    color: '#0B1F4D',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#EAFBFA',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B9B2',
  },
  liveText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: '#0F766E',
  },

  featuredCard: {
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 14,
    borderWidth: 1.5,
    borderColor: '#8CB9FF',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#073BDF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 13,
    elevation: 3,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  featuredIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featuredIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8E8FF',
    borderRadius: 16,
    backgroundColor: '#EEF5FF',
  },
  featuredOrderId: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: -0.2,
    color: '#0B1F4D',
  },
  featuredMedicineSummary: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#087DFF',
  },
  statusBadge: {
    maxWidth: 116,
    minHeight: 29,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  featuredDescription: {
    marginTop: 12,
    fontSize: 10,
    lineHeight: 16,
    fontWeight: '600',
    color: '#657791',
  },

  progressRow: {
    marginTop: 17,
    flexDirection: 'row',
  },
  progressStage: {
    flex: 1,
    alignItems: 'center',
  },
  progressTrackRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressConnector: {
    flex: 1,
    height: 3,
    backgroundColor: '#DCE6F2',
  },
  progressConnectorActive: {
    backgroundColor: '#087DFF',
  },
  progressConnectorSpacer: {
    flex: 1,
    height: 3,
    backgroundColor: 'transparent',
  },
  progressDot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#DCE6F2',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  progressDotCompleted: {
    borderColor: '#087DFF',
    backgroundColor: '#087DFF',
  },
  progressDotCurrent: {
    borderColor: '#087DFF',
    backgroundColor: '#FFFFFF',
  },
  progressCurrentCenter: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#087DFF',
  },
  progressStageLabel: {
    marginTop: 7,
    paddingHorizontal: 2,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    textAlign: 'center',
    color: '#8491A8',
  },
  progressStageLabelCurrent: {
    color: '#073BDF',
  },

  featuredMetrics: {
    minHeight: 68,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E4ECF7',
  },
  featuredMetric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  metricDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#E4ECF7',
  },
  metricLabel: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    color: '#8491A8',
  },
  metricValue: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B1F4D',
  },
  metricStatusValue: {
    marginTop: 3,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
    color: '#087DFF',
  },

  featuredAddress: {
    marginTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressIcon: {
    width: 29,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: '#EEF5FF',
  },
  featuredAddressText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: '600',
    color: '#657791',
  },

  trackButton: {
    minHeight: 45,
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#073BDF',
    shadowColor: '#073BDF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  trackButtonText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center',
    color: '#FFFFFF',
  },

  historyHeading: {
    marginTop: 2,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  historyCountPill: {
    minWidth: 34,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#EAF3FF',
  },
  historyCountText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: '#073BDF',
  },

  orderCard: {
    marginHorizontal: 16,
    minHeight: 108,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    shadowColor: '#12366F',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
    elevation: 1,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  orderStatusIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  orderMain: {
    flex: 1,
    minWidth: 0,
  },
  orderId: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0B1F4D',
  },
  orderDate: {
    marginTop: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#8491A8',
  },
  orderMedicine: {
    marginTop: 5,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
    color: '#526684',
  },
  articleCount: {
    marginTop: 2,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '600',
    color: '#8491A8',
  },
  orderRight: {
    width: 85,
    alignItems: 'flex-end',
  },
  compactStatusBadge: {
    maxWidth: 85,
    minHeight: 25,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 9,
  },
  compactStatusText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    textAlign: 'center',
  },
  orderTotal: {
    marginTop: 9,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    textAlign: 'right',
    color: '#0B1F4D',
  },
  itemSeparator: {
    height: 10,
  },

  emptyState: {
    marginHorizontal: 16,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderWidth: 1,
    borderColor: '#DDE8F5',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#EEF5FF',
  },
  emptyTitle: {
    marginTop: 15,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B1F4D',
  },
  emptyText: {
    maxWidth: 290,
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#657791',
  },
  secondaryButton: {
    minHeight: 42,
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 13,
    backgroundColor: '#EEF5FF',
  },
  secondaryButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#073BDF',
  },

  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#F7FAFF',
  },
  loadingIconContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    borderRadius: 20,
    backgroundColor: '#EEF5FF',
  },
  errorIconContainer: {
    backgroundColor: '#FEF2F2',
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B1F4D',
  },
  loadingText: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    color: '#657791',
  },
  errorStateTitle: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
    color: '#0B1F4D',
  },
  errorStateText: {
    maxWidth: 310,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    color: '#657791',
  },
  primaryButton: {
    minHeight: 46,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: '#073BDF',
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.78,
  },
})
