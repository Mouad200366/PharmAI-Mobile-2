import { useCallback, useRef, useState } from 'react'
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
  deliveryApi,
  type DeliveryOrder,
} from '../../api/delivery'
import { firstError } from '../../api/errors'

const brand = {
  navy: '#0B1B63',
  blue: '#0D4EEB',
  blueBright: '#168BEE',
  cyan: '#18C7D9',
  cyanSoft: '#E8FAFC',
  blueSoft: '#EEF5FF',
  surface: '#F7FAFF',
  white: '#FFFFFF',
  text: '#0C1C4C',
  textSecondary: '#667085',
  textMuted: '#98A2B3',
  border: '#E7EDF7',
  success: '#15803D',
  successBg: '#EAF8EF',
  danger: '#C2413A',
  dangerBg: '#FFF0EF',
  neutralBg: '#F1F4F8',
} as const

const ACTIVE_ORDER_REFRESH_INTERVAL_MS = 5_000
const HISTORY_REFRESH_INTERVAL_MS = 30_000

function orderStatusLabel(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 'Vers la pharmacie'
    case 'picked_up':
      return 'Colis récupéré'
    case 'out_for_delivery':
      return 'En livraison'
    case 'delivered':
      return 'Livrée'
    case 'failed':
      return 'Échouée'
    case 'cancelled':
      return 'Annulée'
    default:
      return status.replaceAll('_', ' ')
  }
}

function paymentLabel(method: string) {
  return method === 'cash' ? 'Espèces' : 'Carte'
}

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

function orderTimestamp(order: DeliveryOrder) {
  const parsed = new Date(
    order.updated_at || order.created_at,
  ).getTime()

  return Number.isFinite(parsed) ? parsed : 0
}

function sortDeliveryHistory(
  orders: DeliveryOrder[],
) {
  return [...orders].sort((left, right) => {
    const timeDifference =
      orderTimestamp(right) - orderTimestamp(left)

    if (timeDifference !== 0) {
      return timeDifference
    }

    return right.id - left.id
  })
}

function statusVisual(status: string) {
  switch (status) {
    case 'delivered':
      return {
        icon: 'check',
        iconBackground: brand.blueSoft,
        iconColor: brand.blue,
        badgeBackground: brand.successBg,
        badgeColor: brand.success,
      }
    case 'failed':
      return {
        icon: 'error',
        iconBackground: brand.dangerBg,
        iconColor: brand.danger,
        badgeBackground: brand.dangerBg,
        badgeColor: brand.danger,
      }
    case 'cancelled':
      return {
        icon: 'close',
        iconBackground: brand.neutralBg,
        iconColor: brand.textSecondary,
        badgeBackground: brand.neutralBg,
        badgeColor: brand.textSecondary,
      }
    case 'out_for_delivery':
      return {
        icon: 'delivery_dining',
        iconBackground: brand.blueSoft,
        iconColor: brand.blue,
        badgeBackground: brand.blueSoft,
        badgeColor: brand.blue,
      }
    case 'picked_up':
      return {
        icon: 'inventory_2',
        iconBackground: brand.cyanSoft,
        iconColor: '#07889B',
        badgeBackground: brand.cyanSoft,
        badgeColor: '#087C8C',
      }
    default:
      return {
        icon: 'local_shipping',
        iconBackground: brand.blueSoft,
        iconColor: brand.blue,
        badgeBackground: brand.blueSoft,
        badgeColor: brand.blue,
      }
  }
}

interface StatusBadgeProps {
  status: string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const visual = statusVisual(status)

  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: visual.badgeBackground },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          { color: visual.badgeColor },
        ]}
      >
        {orderStatusLabel(status)}
      </Text>
    </View>
  )
}

interface DetailedOrderCardProps {
  order: DeliveryOrder
  active?: boolean
}

function DetailedOrderCard({
  order,
  active = false,
}: DetailedOrderCardProps) {
  const visual = statusVisual(order.status)

  return (
    <View
      style={[
        styles.detailedCard,
        active && styles.activeDetailedCard,
      ]}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderIdentity}>
          <View
            style={[
              styles.orderIconCircle,
              { backgroundColor: visual.iconBackground },
            ]}
          >
            <Icon
              name={visual.icon}
              size={22}
              color={visual.iconColor}
            />
          </View>

          <View style={styles.orderTitleGroup}>
            <Text style={styles.orderEyebrow}>
              Commande #{order.id}
            </Text>
            <Text
              style={styles.orderPharmacy}
              numberOfLines={1}
            >
              {order.pharmacy_name}
            </Text>
          </View>
        </View>

        <StatusBadge status={order.status} />
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeIconColumn}>
          <View style={styles.routeIconCircle}>
            <Icon
              name="local_pharmacy"
              size={19}
              color={brand.blue}
            />
          </View>
          <View style={styles.routeConnector} />
        </View>

        <View style={styles.routeTextColumn}>
          <Text style={styles.routeLabel}>
            Pharmacie
          </Text>
          <Text style={styles.routeValue}>
            {order.pharmacy_address}
          </Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeIconColumn}>
          <View style={styles.destinationIconCircle}>
            <Icon
              name="location_on"
              size={19}
              color="#087C8C"
            />
          </View>
        </View>

        <View style={styles.routeTextColumn}>
          <Text style={styles.routeLabel}>
            Destination
          </Text>
          <Text style={styles.routeValue}>
            {order.delivery_address}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaCard}>
          <View style={styles.metaIcon}>
            <Icon
              name="account_balance_wallet"
              size={17}
              color={brand.blue}
            />
          </View>
          <View style={styles.metaText}>
            <Text style={styles.metaLabel}>
              Paiement
            </Text>
            <Text style={styles.metaValue}>
              {paymentLabel(order.payment_method)}
            </Text>
          </View>
        </View>

        <View style={styles.metaCard}>
          <View style={styles.metaIcon}>
            <Icon
              name="payments"
              size={18}
              color={brand.blue}
            />
          </View>
          <View style={styles.metaText}>
            <Text style={styles.metaLabel}>
              Total
            </Text>
            <Text style={styles.metaValue}>
              {Number.isFinite(Number(order.grand_total))
                ? Number(order.grand_total).toFixed(2)
                : order.grand_total} MAD
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.orderDate}>
        {formatDate(order.updated_at || order.created_at)}
      </Text>
    </View>
  )
}

interface CompactOrderCardProps {
  order: DeliveryOrder
}

function CompactOrderCard({
  order,
}: CompactOrderCardProps) {
  const visual = statusVisual(order.status)

  return (
    <View style={styles.compactCard}>
      <View style={styles.compactTopRow}>
        <View
          style={[
            styles.compactIcon,
            { backgroundColor: visual.iconBackground },
          ]}
        >
          <Icon
            name={visual.icon}
            size={20}
            color={visual.iconColor}
          />
        </View>

        <View style={styles.compactIdentity}>
          <Text style={styles.compactEyebrow}>
            Commande #{order.id}
          </Text>
          <Text
            style={styles.compactPharmacy}
            numberOfLines={1}
          >
            {order.pharmacy_name}
          </Text>
        </View>

        <StatusBadge status={order.status} />
      </View>

      <View style={styles.compactMetaRow}>
        <View style={styles.compactMetaItem}>
          <Icon
            name="event"
            size={16}
            color={brand.textSecondary}
          />
          <Text
            style={styles.compactMetaText}
            numberOfLines={1}
          >
            {formatDate(order.updated_at || order.created_at)}
          </Text>
        </View>

        <View style={styles.compactMetaDivider} />

        <View style={styles.compactMetaItem}>
          <Icon
            name="account_balance_wallet"
            size={16}
            color={brand.textSecondary}
          />
          <Text style={styles.compactMetaText}>
            {paymentLabel(order.payment_method)}
          </Text>
        </View>

        <View style={styles.compactMetaDivider} />

        <View style={styles.compactMetaItem}>
          <Icon
            name="payments"
            size={16}
            color={brand.textSecondary}
          />
          <Text style={styles.compactMetaText}>
            {Number.isFinite(Number(order.grand_total))
                ? Number(order.grand_total).toFixed(2)
                : order.grand_total} MAD
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function DeliveryDeliveries() {
  const insets = useSafeAreaInsets()

  const [activeOrder, setActiveOrder] =
    useState<DeliveryOrder | null>(null)
  const [history, setHistory] = useState<DeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const activeOrderRef = useRef<DeliveryOrder | null>(null)

  const refreshHistorySilently = useCallback(async () => {
    try {
      const response = await deliveryApi.deliveryHistory()

      setHistory(
        sortDeliveryHistory(response.data),
      )
    } catch {
      // Keep the last known history during background refresh failures.
    }
  }, [])

  const refreshActiveOrderSilently = useCallback(async () => {
    try {
      const response = await deliveryApi.activeOrder()
      const previousOrder = activeOrderRef.current
      const nextOrder = response.data

      activeOrderRef.current = nextOrder
      setActiveOrder(nextOrder)

      // When an active delivery disappears after a successful refresh,
      // it has normally moved to terminal history. Refresh that history
      // immediately instead of waiting for the 30-second history poll.
      if (previousOrder !== null && nextOrder === null) {
        void refreshHistorySilently()
      }
    } catch {
      // Keep the last known active order during temporary polling errors.
    }
  }, [refreshHistorySilently])

  const loadDeliveries = useCallback(async (
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
        activeResult,
        historyResult,
      ] = await Promise.allSettled([
        deliveryApi.activeOrder(),
        deliveryApi.deliveryHistory(),
      ])

      const errors: string[] = []

      if (activeResult.status === 'fulfilled') {
        activeOrderRef.current = activeResult.value.data
        setActiveOrder(activeResult.value.data)
      } else {
        errors.push(
          firstError(activeResult.reason)
          || 'Impossible d’actualiser la livraison active.',
        )
      }

      if (historyResult.status === 'fulfilled') {
        setHistory(
          sortDeliveryHistory(historyResult.value.data),
        )
      } else {
        errors.push(
          firstError(historyResult.reason)
          || 'Impossible d’actualiser l’historique.',
        )
      }

      if (errors.length > 0) {
        setError(errors.join(' '))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadDeliveries()

      const activeOrderInterval = setInterval(() => {
        void refreshActiveOrderSilently()
      }, ACTIVE_ORDER_REFRESH_INTERVAL_MS)

      const historyInterval = setInterval(() => {
        void refreshHistorySilently()
      }, HISTORY_REFRESH_INTERVAL_MS)

      return () => {
        clearInterval(activeOrderInterval)
        clearInterval(historyInterval)
      }
    }, [
      loadDeliveries,
      refreshActiveOrderSilently,
      refreshHistorySilently,
    ]),
  )

  if (
    loading
    && history.length === 0
    && activeOrder === null
  ) {
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
          Chargement de vos livraisons…
        </Text>
      </View>
    )
  }

  const firstHistoryItem = history[0] ?? null
  const compactHistory = history.slice(1)

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
              void loadDeliveries(true)
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
            Activité
          </Text>
          <Text style={styles.title}>
            Mes livraisons
          </Text>
          <Text style={styles.subtitle}>
            Suivez vos livraisons en cours et consultez votre historique.
          </Text>
        </View>

        <View style={styles.heroIcon}>
          <Icon
            name="local_shipping"
            size={30}
            color={brand.blue}
          />
        </View>
      </LinearGradient>

      <View style={styles.body}>
        {error ? (
          <Pressable
            style={styles.errorCard}
            onPress={() => {
              void loadDeliveries()
            }}
          >
            <Icon
              name="error"
              size={20}
              color={brand.danger}
            />

            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>
                Impossible de charger les livraisons
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

        <Text style={styles.sectionTitle}>
          Livraison active
        </Text>

        {activeOrder ? (
          <DetailedOrderCard
            order={activeOrder}
            active
          />
        ) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Icon
                name="inventory_2"
                size={33}
                color={brand.blue}
              />
            </View>

            <Text style={styles.emptyTitle}>
              Aucune livraison active
            </Text>
            <Text style={styles.emptyText}>
              Une livraison acceptée apparaîtra ici automatiquement.
            </Text>
          </View>
        )}

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>
            Historique
          </Text>

          <View style={styles.historyHeaderRight}>
            <View style={styles.historyCount}>
              <Text style={styles.historyCountText}>
                {history.length}
              </Text>
            </View>

            {history.length > 0 ? (
              <Text style={styles.allHistoryText}>
                Total
              </Text>
            ) : null}
          </View>
        </View>

        {firstHistoryItem ? (
          <DetailedOrderCard
            order={firstHistoryItem}
          />
        ) : (
          <View style={styles.emptyHistoryCard}>
            <View style={styles.emptyHistoryIcon}>
              <Icon
                name="history"
                size={29}
                color={brand.blue}
              />
            </View>

            <Text style={styles.emptyTitle}>
              Aucun historique
            </Text>
            <Text style={styles.emptyText}>
              Vos livraisons terminées, annulées ou échouées apparaîtront ici.
            </Text>
          </View>
        )}

        {compactHistory.length > 0 ? (
          <View style={styles.compactList}>
            {compactHistory.map((order) => (
              <CompactOrderCard
                key={order.id}
                order={order}
              />
            ))}
          </View>
        ) : null}
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
    minHeight: 250,
    paddingTop: 58,
    paddingHorizontal: 24,
    paddingBottom: 34,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  heroText: {
    flex: 1,
    paddingRight: 8,
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
    marginTop: 14,
    maxWidth: 290,
    fontSize: 16,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.92)',
  },

  heroIcon: {
    width: 66,
    height: 66,
    borderRadius: 20,
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
    shadowColor: '#071445',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 5,
  },

  body: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: brand.text,
    letterSpacing: -0.35,
  },

  errorCard: {
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    padding: 14,
    backgroundColor: brand.dangerBg,
  },

  errorContent: {
    flex: 1,
  },

  errorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.danger,
  },

  errorText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: brand.danger,
  },

  retryText: {
    marginTop: 7,
    fontSize: 12,
    fontWeight: '800',
    color: brand.blue,
  },

  emptyCard: {
    marginTop: 16,
    marginBottom: 34,
    minHeight: 218,
    paddingHorizontal: 24,
    paddingVertical: 30,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F1F4FA',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },

  emptyIcon: {
    width: 80,
    height: 80,
    marginBottom: 18,
    borderRadius: 40,
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
    marginTop: 9,
    maxWidth: 310,
    fontSize: 13,
    lineHeight: 20,
    color: brand.textSecondary,
    textAlign: 'center',
  },

  historyHeader: {
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  historyHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  historyCount: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F3FF',
  },

  historyCountText: {
    fontSize: 16,
    fontWeight: '900',
    color: brand.blue,
  },

  allHistoryText: {
    fontSize: 13,
    fontWeight: '800',
    color: brand.blue,
  },

  detailedCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 27,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.07,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },

  activeDetailedCard: {
    marginTop: 16,
    marginBottom: 34,
    borderColor: '#CFE3FF',
  },

  orderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },

  orderIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  orderIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },

  orderTitleGroup: {
    flex: 1,
  },

  orderEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: brand.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  orderPharmacy: {
    marginTop: 4,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    color: brand.text,
  },

  statusBadge: {
    maxWidth: 116,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },

  routeBlock: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  routeIconColumn: {
    width: 46,
    alignItems: 'center',
  },

  routeIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  destinationIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.cyanSoft,
  },

  routeConnector: {
    width: 2,
    height: 21,
    marginTop: 4,
    backgroundColor: '#DDE5F0',
  },

  routeTextColumn: {
    flex: 1,
    paddingTop: 3,
    paddingLeft: 2,
  },

  routeLabel: {
    fontSize: 10,
    color: brand.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  routeValue: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: brand.text,
  },

  metaRow: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10,
  },

  metaCard: {
    flex: 1,
    minHeight: 72,
    paddingHorizontal: 11,
    paddingVertical: 12,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: brand.border,
  },

  metaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },

  metaText: {
    flex: 1,
  },

  metaLabel: {
    fontSize: 9,
    color: brand.textMuted,
    textTransform: 'uppercase',
  },

  metaValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '900',
    color: brand.text,
  },

  orderDate: {
    marginTop: 13,
    fontSize: 10,
    color: brand.textMuted,
    textAlign: 'right',
  },

  compactList: {
    gap: 12,
  },

  compactCard: {
    padding: 16,
    borderRadius: 23,
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
    shadowColor: '#0B1B63',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 14,
    elevation: 3,
  },

  compactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  compactIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },

  compactIdentity: {
    flex: 1,
  },

  compactEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    color: brand.textSecondary,
    textTransform: 'uppercase',
  },

  compactPharmacy: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '900',
    color: brand.text,
  },

  compactMetaRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },

  compactMetaItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  compactMetaText: {
    flexShrink: 1,
    fontSize: 9,
    color: brand.textSecondary,
  },

  compactMetaDivider: {
    width: 1,
    height: 20,
    marginHorizontal: 8,
    backgroundColor: brand.border,
  },

  emptyHistoryCard: {
    marginBottom: 16,
    padding: 24,
    borderRadius: 25,
    alignItems: 'center',
    backgroundColor: brand.white,
    borderWidth: 1,
    borderColor: '#F0F3F8',
  },

  emptyHistoryIcon: {
    width: 58,
    height: 58,
    marginBottom: 14,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.blueSoft,
  },
})
