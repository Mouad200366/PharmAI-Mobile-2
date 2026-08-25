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
  deliveryApi,
  type DeliveryOrder,
} from '../../api/delivery'
import { firstError } from '../../api/errors'
import { colors } from '../../theme/colors'

function orderStatusLabel(status: string) {
  switch (status) {
    case 'awaiting_agent':
      return 'En attente du livreur'
    case 'picked_up':
      return 'Colis récupéré'
    case 'out_for_delivery':
      return 'En cours de livraison'
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

function statusIcon(status: string) {
  switch (status) {
    case 'delivered':
      return 'check_circle'
    case 'failed':
      return 'error'
    case 'cancelled':
      return 'cancel'
    case 'out_for_delivery':
      return 'delivery_dining'
    case 'picked_up':
      return 'inventory_2'
    default:
      return 'local_shipping'
  }
}

interface OrderCardProps {
  order: DeliveryOrder
  active?: boolean
}

function OrderCard({
  order,
  active = false,
}: OrderCardProps) {
  return (
    <View
      style={[
        styles.orderCard,
        active && styles.activeOrderCard,
      ]}
    >
      <View style={styles.orderHeader}>
        <View style={styles.orderIdentity}>
          <View style={styles.orderIcon}>
            <Icon
              name={statusIcon(order.status)}
              size={22}
              color={colors.primary}
            />
          </View>

          <View style={styles.orderTitleGroup}>
            <Text style={styles.orderEyebrow}>
              Commande #{order.id}
            </Text>
            <Text style={styles.orderPharmacy}>
              {order.pharmacy_name}
            </Text>
          </View>
        </View>

        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>
            {orderStatusLabel(order.status)}
          </Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <Icon
          name="local_pharmacy"
          size={18}
          color={colors.primary}
        />
        <View style={styles.routeText}>
          <Text style={styles.routeLabel}>
            Pharmacie
          </Text>
          <Text style={styles.routeValue}>
            {order.pharmacy_address}
          </Text>
        </View>
      </View>

      <View style={styles.routeConnector} />

      <View style={styles.routeRow}>
        <Icon
          name="location_on"
          size={18}
          color={colors.secondary}
        />
        <View style={styles.routeText}>
          <Text style={styles.routeLabel}>
            Destination
          </Text>
          <Text style={styles.routeValue}>
            {order.delivery_address}
          </Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>
            Paiement
          </Text>
          <Text style={styles.metaValue}>
            {order.payment_method === 'cash'
              ? 'Espèces'
              : 'Carte'}
          </Text>
        </View>

        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>
            Total
          </Text>
          <Text style={styles.metaValue}>
            {order.grand_total} MAD
          </Text>
        </View>
      </View>

      <Text style={styles.orderDate}>
        {formatDate(order.updated_at || order.created_at)}
      </Text>
    </View>
  )
}

export default function DeliveryDeliveries() {
  const [activeOrder, setActiveOrder] =
    useState<DeliveryOrder | null>(null)
  const [history, setHistory] = useState<DeliveryOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

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
        activeResponse,
        historyResponse,
      ] = await Promise.all([
        deliveryApi.activeOrder(),
        deliveryApi.deliveryHistory(),
      ])

      setActiveOrder(activeResponse.data)
      setHistory(historyResponse.data)
    } catch (err: unknown) {
      setError(firstError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void loadDeliveries()
    }, [loadDeliveries]),
  )

  if (loading && history.length === 0 && activeOrder === null) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.centerStateText}>
          Chargement de vos livraisons…
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
            void loadDeliveries(true)
          }}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>
            Activité
          </Text>
          <Text style={styles.title}>
            Mes livraisons
          </Text>
          <Text style={styles.subtitle}>
            Suivez votre livraison en cours et consultez votre historique.
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Icon
            name="local_shipping"
            size={27}
            color={colors.primary}
          />
        </View>
      </View>

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
            color={colors.error}
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
        <OrderCard
          order={activeOrder}
          active
        />
      ) : (
        <View style={styles.emptyCard}>
          <Icon
            name="inventory_2"
            size={32}
            color={colors.textMuted}
          />
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

        <View style={styles.historyCount}>
          <Text style={styles.historyCountText}>
            {history.length}
          </Text>
        </View>
      </View>

      {history.length > 0 ? (
        <View style={styles.historyList}>
          {history.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Icon
            name="history"
            size={32}
            color={colors.textMuted}
          />
          <Text style={styles.emptyTitle}>
            Aucun historique
          </Text>
          <Text style={styles.emptyText}>
            Vos livraisons terminées, annulées ou échouées apparaîtront ici.
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
    marginBottom: 26,
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

  errorCard: {
    marginBottom: 20,
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

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 12,
  },

  activeOrderCard: {
    borderWidth: 1,
    borderColor: colors.primary,
  },

  orderCard: {
    marginBottom: 18,
    borderRadius: 22,
    padding: 17,
    backgroundColor: colors.surfaceLowest,
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
    gap: 10,
  },

  orderIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  orderTitleGroup: {
    flex: 1,
  },

  orderEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  orderPharmacy: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },

  statusBadge: {
    maxWidth: 120,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: colors.outlineVariant,
  },

  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textSecondary,
    textAlign: 'center',
  },

  routeRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },

  routeText: {
    flex: 1,
  },

  routeLabel: {
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },

  routeValue: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: colors.primary,
  },

  routeConnector: {
    width: 2,
    height: 13,
    marginLeft: 8,
    marginTop: 3,
    backgroundColor: colors.outlineVariant,
  },

  metaGrid: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },

  metaBox: {
    flex: 1,
    borderRadius: 13,
    padding: 10,
    backgroundColor: colors.surface,
  },

  metaLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },

  metaValue: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },

  orderDate: {
    marginTop: 12,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'right',
  },

  emptyCard: {
    marginBottom: 24,
    borderRadius: 22,
    padding: 24,
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

  historyHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  historyCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.outlineVariant,
  },

  historyCountText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },

  historyList: {
    gap: 0,
  },
})
