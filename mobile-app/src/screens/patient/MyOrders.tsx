import { useCallback, useState } from 'react'
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, RefreshControl } from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import { ordersApi, type Order, STATUS_LABELS, STATUS_COLOR, isActiveOrder } from '../../api/orders'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

// Composite props: MyOrders lives inside the Tabs navigator but needs to
// push OrderDetail, which lives one level up in MainStack -- same pattern
// as Dashboard.
type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Orders'>,
  NativeStackScreenProps<MainStackParamList>
>

const FILTER_TABS: { key: string; label: string; fn: (o: Order) => boolean }[] = [
  { key: '', label: 'Toutes', fn: () => true },
  { key: 'active', label: 'En cours', fn: (o) => isActiveOrder(o.status) },
  { key: 'delivered', label: 'Livrées', fn: (o) => o.status === 'delivered' },
  { key: 'cancelled', label: 'Annulées', fn: (o) => ['cancelled', 'rejected', 'failed'].includes(o.status) },
]

// Mobile port of the web app's MyOrders.tsx. Same stats strip, filter
// tabs, and order list -- `<Link>` rows become `Pressable` rows pushing
// OrderDetail, and pull-to-refresh replaces the browser's own refresh.
export default function MyOrders({ navigation }: Props) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState('')

  const load = useCallback(async () => {
    const r = await ordersApi.list()
    setOrders(r.data)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false))
    }, [load]),
  )

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const activeTab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]
  const filtered = orders.filter(activeTab.fn)

  const stats = {
    total: orders.length,
    active: orders.filter((o) => isActiveOrder(o.status)).length,
    delivered: orders.filter((o) => o.status === 'delivered').length,
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      data={filtered}
      keyExtractor={(o) => String(o.id)}
      ListHeaderComponent={
        <View style={{ gap: 16, marginBottom: 16 }}>
          <Text style={styles.title}>Mes commandes</Text>

          {/* Stats strip */}
          <View style={styles.statsRow}>
            <StatCard value={stats.total} label="Total" color={colors.primary} />
            <StatCard value={stats.active} label="En cours" color="#d97706" />
            <StatCard value={stats.delivered} label="Livrées" color="#16a34a" />
          </View>

          {/* Filter tabs */}
          <View style={styles.tabsRow}>
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key
              return (
                <Pressable
                  key={tab.key}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                  onPress={() => setFilter(tab.key)}
                >
                  <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>{tab.label}</Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <OrderRow order={item} onPress={() => navigation.navigate('OrderDetail', { id: item.id })} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Icon name="receipt_long" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>Aucune commande trouvée</Text>
        </View>
      }
    />
  )
}

function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const itemCount = order.items?.length ?? 0
  const statusColor = STATUS_COLOR[order.status]
  const date = new Date(order.created_at).toLocaleDateString('fr-MA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <Pressable style={styles.orderRow} onPress={onPress}>
      <View style={styles.orderIcon}>
        <Icon name="local_shipping" size={22} color={colors.primary} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.orderTopLine}>
          <Text style={styles.orderId}>Commande #{order.id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
              {STATUS_LABELS[order.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.orderMeta} numberOfLines={1}>
          {date}{itemCount > 0 ? ` · ${itemCount} article${itemCount > 1 ? 's' : ''}` : ''}
        </Text>
        {!!order.delivery_address && (
          <View style={styles.orderAddressRow}>
            <Icon name="location_on" size={13} color={colors.textMuted} />
            <Text style={styles.orderAddress} numberOfLines={1}>{order.delivery_address}</Text>
          </View>
        )}
      </View>

      <View style={styles.orderRight}>
        <Text style={styles.orderPrice}>{order.grand_total} MAD</Text>
        <Icon name="chevron_right" size={20} color={colors.textMuted} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 24 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, paddingVertical: 16, alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  tabsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tabChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    backgroundColor: colors.surfaceLowest, borderWidth: 1, borderColor: colors.outlineVariant,
  },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  tabChipTextActive: { color: colors.white },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, padding: 14,
  },
  orderIcon: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#f2f3ff',
    alignItems: 'center', justifyContent: 'center',
  },
  orderTopLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  orderId: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  orderMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  orderAddressRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  orderAddress: { fontSize: 12, color: colors.textSecondary, flexShrink: 1 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  orderPrice: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },

  emptyState: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 10,
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant,
  },
  emptyText: { fontSize: 13, color: colors.textMuted },
})