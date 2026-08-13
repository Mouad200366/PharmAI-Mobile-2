import { useCallback, useRef, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import {
  isActiveOrder,
  ordersApi,
  STATUS_COLOR,
  STATUS_LABELS,
  type Order,
  type OrderStatus,
} from '../../api/orders'
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
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.title}>Mes commandes</Text>
            <Text style={styles.subtitle}>
              Suivez vos médicaments de la pharmacie jusqu'à votre porte.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon="receipt_long"
              value={filterCounts.all}
              label="Total"
              iconColor={colors.primary}
              iconBackground="#eef2ff"
            />
            <StatCard
              icon="schedule"
              value={filterCounts.active}
              label="En cours"
              iconColor="#d97706"
              iconBackground="#fff7ed"
            />
            <StatCard
              icon="check_circle"
              value={filterCounts.delivered}
              label="Livrées"
              iconColor={colors.success}
              iconBackground={colors.successBg}
            />
          </View>

          {error ? <InlineError message={error} onRetry={handleRefresh} /> : null}

          <FilterTabs
            selectedFilter={filter}
            counts={filterCounts}
            onSelect={setFilter}
          />

          {latestActiveOrder ? (
            <FeaturedActiveOrder order={latestActiveOrder} onPress={() => openOrder(latestActiveOrder.id)} />
          ) : null}

          {displayedOrders.length > 0 ? (
            <View style={styles.sectionHeadingRow}>
              <View>
                <Text style={styles.sectionTitle}>{getSectionTitle(filter)}</Text>
                <Text style={styles.sectionCount}>
                  {displayedOrders.length} commande
                  {displayedOrders.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <OrderCard order={item} onPress={() => openOrder(item.id)} />}
      ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
      ListEmptyComponent={
        latestActiveOrder ? null : (
          <OrdersEmptyState filter={filter} onRefresh={handleRefresh} />
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
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
            <Text style={[styles.filterLabel, selected && styles.filterLabelSelected]}>
              {item.label}
            </Text>
            <View style={[styles.filterCount, selected && styles.filterCountSelected]}>
              <Text style={[styles.filterCountText, selected && styles.filterCountTextSelected]}>
                {counts[item.key]}
              </Text>
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function FeaturedActiveOrder({ order, onPress }: { order: Order; onPress: () => void }) {
  const statusColors = STATUS_COLOR[order.status]
  const currentStage = ACTIVE_STAGE_BY_STATUS[order.status] ?? 0
  const articleCount = getArticleCount(order)

  return (
    <View style={styles.featuredCard}>
      <View style={styles.featuredAccent} />

      <View style={styles.featuredHeader}>
        <View style={styles.featuredTitleRow}>
          <View style={styles.featuredIcon}>
            <Icon name={getStatusIcon(order.status)} size={24} color={colors.primary} />
          </View>
          <View style={styles.flexContent}>
            <Text style={styles.featuredEyebrow}>COMMANDE ACTIVE</Text>
            <Text style={styles.featuredOrderId}>Commande #{order.id}</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.featuredDescription}>{STATUS_DESCRIPTIONS[order.status]}</Text>

      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>{ACTIVE_STAGES[currentStage]}</Text>
        <Text style={styles.progressStep}>Étape {currentStage + 1} sur {ACTIVE_STAGES.length}</Text>
      </View>

      <View style={styles.progressSegments}>
        {ACTIVE_STAGES.map((stage, index) => (
          <View
            key={stage}
            style={[
              styles.progressSegment,
              index <= currentStage && styles.progressSegmentCompleted,
            ]}
          />
        ))}
      </View>

      <View style={styles.featuredDetails}>
        <View style={styles.featuredDetailItem}>
          <Icon name="medication" size={18} color={colors.textSecondary} />
          <Text style={styles.featuredDetailText} numberOfLines={1}>
            {getMedicineSummary(order)}
          </Text>
        </View>

        <View style={styles.featuredDetailItem}>
          <Icon name="shopping_bag" size={18} color={colors.textSecondary} />
          <Text style={styles.featuredDetailText}>
            {articleCount} article{articleCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      <View style={styles.featuredFooter}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.featuredTotal}>{formatMoney(order.grand_total)}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.trackButton, pressed && styles.buttonPressed]}
          onPress={onPress}
        >
          <Text style={styles.trackButtonText}>Suivre la commande</Text>
          <Icon name="arrow_forward" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const statusColors = STATUS_COLOR[order.status]
  const articleCount = getArticleCount(order)
  const isActive = isActiveOrder(order.status)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ouvrir la commande numéro ${order.id}`}
      style={({ pressed }) => [styles.orderCard, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.orderCardHeader}>
        <View style={styles.orderIdentity}>
          <View style={[styles.orderStatusIcon, { backgroundColor: statusColors.bg }]}>
            <Icon name={getStatusIcon(order.status)} size={21} color={statusColors.text} />
          </View>
          <View style={styles.flexContent}>
            <Text style={styles.orderId}>Commande #{order.id}</Text>
            <Text style={styles.orderDate}>{formatOrderDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColors.text }]}>
            {STATUS_LABELS[order.status]}
          </Text>
        </View>
      </View>

      <Text style={styles.orderDescription}>{STATUS_DESCRIPTIONS[order.status]}</Text>

      <View style={styles.orderInformationBox}>
        <View style={styles.informationRow}>
          <Icon name="medication" size={17} color={colors.textSecondary} />
          <Text style={styles.informationText} numberOfLines={2}>
            {getMedicineSummary(order)}
          </Text>
        </View>

        {order.delivery_address ? (
          <View style={styles.informationRow}>
            <Icon name="location_on" size={17} color={colors.textSecondary} />
            <Text style={styles.informationText} numberOfLines={1}>
              {order.delivery_address}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.orderCardFooter}>
        <View>
          <Text style={styles.articleCount}>
            {articleCount} article{articleCount !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.orderTotal}>{formatMoney(order.grand_total)}</Text>
        </View>

        <View style={styles.detailsAction}>
          <Text style={styles.detailsActionText}>
            {isActive ? 'Suivre' : 'Voir les détails'}
          </Text>
          <Icon name="chevron_right" size={21} color={colors.primary} />
        </View>
      </View>
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
    backgroundColor: colors.surface,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
  },
  headerContent: {
    gap: 18,
    marginBottom: 14,
  },
  flexContent: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
    maxWidth: 340,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 9,
  },
  statCard: {
    flex: 1,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 8,
    paddingVertical: 12,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.errorBg,
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  inlineErrorIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
    borderRadius: 11,
  },
  inlineErrorContent: {
    flex: 1,
  },
  inlineErrorTitle: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '700',
  },
  inlineErrorText: {
    color: '#991b1b',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  retryIconButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLowest,
    borderRadius: 12,
  },
  filtersContent: {
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  filterChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterLabelSelected: {
    color: colors.white,
  },
  filterCount: {
    minWidth: 25,
    height: 25,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  filterCountSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  filterCountText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  filterCountTextSelected: {
    color: colors.white,
  },
  featuredCard: {
    overflow: 'hidden',
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 22,
    padding: 17,
  },
  featuredAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: colors.primary,
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  featuredTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  featuredIcon: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 14,
  },
  featuredEyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  featuredOrderId: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  statusBadge: {
    maxWidth: 132,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  featuredDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 17,
    marginBottom: 8,
  },
  progressTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  progressStep: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  progressSegments: {
    flexDirection: 'row',
    gap: 5,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
  },
  progressSegmentCompleted: {
    backgroundColor: colors.primary,
  },
  featuredDetails: {
    gap: 9,
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  featuredDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featuredDetailText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 12,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
  },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  featuredTotal: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingHorizontal: 15,
    backgroundColor: colors.primary,
    borderRadius: 14,
  },
  trackButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  orderCard: {
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 19,
    padding: 15,
  },
  cardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.995 }],
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  orderIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderStatusIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  orderId: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  orderDate: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  orderDescription: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  orderInformationBox: {
    gap: 9,
    marginTop: 12,
    padding: 11,
    backgroundColor: colors.surface,
    borderRadius: 13,
  },
  informationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  informationText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  orderCardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  articleCount: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  orderTotal: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  detailsAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  detailsActionText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  itemSeparator: {
    height: 11,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyIcon: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 22,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 290,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 16,
    backgroundColor: '#eef2ff',
    borderRadius: 13,
    marginTop: 18,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 30,
  },
  loadingIconContainer: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    borderRadius: 20,
    marginBottom: 18,
  },
  errorIconContainer: {
    backgroundColor: colors.errorBg,
  },
  loadingTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 16,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
  },
  errorStateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorStateText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 310,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 14,
    marginTop: 20,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.76,
  },
})