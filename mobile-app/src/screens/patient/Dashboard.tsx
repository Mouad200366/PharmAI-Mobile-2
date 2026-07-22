import { useCallback, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import Icon from '../../components/ui/Icon'
import { ordersApi, type Order, STATUS_LABELS, STATUS_COLOR, isActiveOrder } from '../../api/orders'
import { usersApi, type UserProfile } from '../../api/users'
import { colors } from '../../theme/colors'

// Composite props because Dashboard needs to navigate both to sibling tabs
// (Search, Orders, Profile) AND to screens that live one level up in
// MainStack (Addresses, OrderDetail) -- web could just do a flat <Link to>
// for all of these since it's one router; native needs the parent stack's
// navigator merged in to type-check those cross-navigator jumps.
type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Dashboard'>,
  NativeStackScreenProps<MainStackParamList>
>

const QUICK_SEARCHES = ['Doliprane', 'Thermomètre', 'Amoxicilline', 'Paracétamol']

const QUICK_ACTIONS = [
  { icon: 'medication', label: 'Commander', color: colors.primary, bg: '#eff6ff' },
  { icon: 'local_shipping', label: 'Commandes', color: '#d97706', bg: '#fffbeb' },
  { icon: 'location_on', label: 'Adresses', color: '#16a34a', bg: '#f0fdf4' },
  { icon: 'person', label: 'Profil', color: '#9333ea', bg: '#faf5ff' },
] as const

// Mobile port of the web app's Dashboard.tsx. Same content and layout
// logic (greeting, search bar, quick-search chips, stat cards, quick
// actions, recent orders list), reflowed for a scrollable phone screen.
// Pull-to-refresh is added since it's the standard mobile idiom for this
// kind of data screen -- web has no equivalent (browser refresh covers it).
export default function Dashboard({ navigation }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const [profileRes, ordersRes] = await Promise.all([usersApi.me(), ordersApi.list()])
    setProfile(profileRes.data)
    setOrders(ordersRes.data.slice(0, 5))
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

  function goSearch(query: string) {
    navigation.navigate('Search', { q: query })
  }

  function goQuickAction(label: string) {
    if (label === 'Commander') navigation.navigate('Search', undefined)
    else if (label === 'Commandes') navigation.navigate('Orders')
    else if (label === 'Adresses') navigation.navigate('Addresses')
    else if (label === 'Profil') navigation.navigate('Profile')
  }

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const firstName = profile?.first_name || 'Mohamed'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const activeOrders = orders.filter((o) => isActiveOrder(o.status))
  const completedOrders = orders.filter((o) => o.status === 'delivered')

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* Greeting */}
      <View style={styles.greetingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greetingTitle}>
            {greeting}, {firstName} 👋
          </Text>
          <Text style={styles.greetingSubtitle}>Trouvez et commandez vos médicaments rapidement.</Text>
        </View>
      </View>
      <View style={styles.openBadge}>
        <View style={styles.openDot} />
        <Text style={styles.openBadgeText}>247 pharmacies ouvertes</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => goSearch(search)}
          placeholder="Rechercher un médicament (ex: Doliprane)..."
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
        />
        <View style={styles.locationChip}>
          <Icon name="location_on" size={14} color={colors.textSecondary} />
          <Text style={styles.locationChipText}>Casablanca</Text>
        </View>
      </View>
      <Pressable style={styles.searchButton} onPress={() => goSearch(search)}>
        <Text style={styles.searchButtonText}>Rechercher</Text>
      </Pressable>

      {/* Quick search chips */}
      <View style={styles.chipsRow}>
        <Text style={styles.chipsLabel}>Recherches fréquentes:</Text>
        {QUICK_SEARCHES.map((q) => (
          <Pressable key={q} style={styles.chip} onPress={() => goSearch(q)}>
            <Text style={styles.chipText}>{q}</Text>
          </Pressable>
        ))}
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard icon="shopping_bag" label="Total commandes" value={orders.length} color={colors.primary} bg="#eff6ff" />
        <StatCard icon="pending" label="En cours" value={activeOrders.length} color="#d97706" bg="#fffbeb" />
        <StatCard icon="check_circle" label="Livrées" value={completedOrders.length} color="#16a34a" bg="#f0fdf4" />
      </View>

      {/* PharmAgent entry point -- new AI assistant feature, given its own
          prominent card rather than folded into the quick-actions grid
          below, since it's a differentiator worth surfacing clearly. */}
      <Pressable onPress={() => navigation.navigate('Assistant')}>
        <LinearGradient
          colors={[colors.primary, '#00687a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.assistantCard}
        >
          <View style={styles.assistantIcon}>
            <Icon name="smart_toy" size={22} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.assistantTitle}>Assistant IA PharmAgent</Text>
            <Text style={styles.assistantSubtitle}>
              Décrivez vos symptômes, obtenez un conseil et la pharmacie la plus proche
            </Text>
          </View>
          <Icon name="chevron_right" size={20} color="#ffffffcc" />
        </LinearGradient>
      </Pressable>
      

      {/* Quick actions */}
      <View style={styles.actionsGrid}>
        {QUICK_ACTIONS.map((a) => (
          <Pressable key={a.label} style={styles.actionCard} onPress={() => goQuickAction(a.label)}>
            <View style={[styles.actionIcon, { backgroundColor: a.bg }]}>
              <Icon name={a.icon} size={20} color={a.color} />
            </View>
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Recent orders */}
      <View style={styles.ordersCard}>
        <View style={styles.ordersHeader}>
          <View style={styles.ordersHeaderTitle}>
            <Icon name="receipt_long" size={18} color={colors.primary} />
            <Text style={styles.ordersHeaderText}>Commandes récentes</Text>
          </View>
          <Pressable style={styles.seeAllLink} onPress={() => navigation.navigate('Orders')}>
            <Text style={styles.seeAllText}>Voir tout</Text>
            <Icon name="arrow_forward" size={14} color={colors.secondary} />
          </Pressable>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Icon name="shopping_bag" size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyText}>Aucune commande pour l'instant</Text>
            <Pressable style={styles.emptyLink} onPress={() => navigation.navigate('Search', undefined)}>
              <Icon name="add" size={14} color={colors.primary} />
              <Text style={styles.emptyLinkText}>Passer une commande</Text>
            </Pressable>
          </View>
        ) : (
          orders.map((order) => {
            const statusColor = STATUS_COLOR[order.status]
            return (
              <Pressable
                key={order.id}
                style={styles.orderRow}
                onPress={() => navigation.navigate('OrderDetail', { id: order.id })}
              >
                <View style={styles.orderLeft}>
                  <View style={styles.orderIcon}>
                    <Icon name="receipt" size={16} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={styles.orderTitle}>Commande #{order.id}</Text>
                    <Text style={styles.orderDate}>
                      {new Date(order.created_at).toLocaleDateString('fr-MA', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
                <View style={styles.orderRight}>
                  <View style={[styles.statusPill, { backgroundColor: statusColor.bg }]}>
                    <Text style={[styles.statusPillText, { color: statusColor.text }]}>
                      {STATUS_LABELS[order.status]}
                    </Text>
                  </View>
                  <Text style={styles.orderTotal}>{order.grand_total} MAD</Text>
                  <Icon name="chevron_right" size={16} color={colors.textMuted} />
                </View>
              </Pressable>
            )
          })
        )}
      </View>
    </ScrollView>
  )
}

function StatCard({ icon, label, value, color, bg }: { icon: string; label: string; value: number; color: string; bg: string }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-end' },
  greetingTitle: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  greetingSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  openBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  openBadgeText: { fontSize: 12, fontWeight: '600', color: '#15803d' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.textPrimary },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  locationChipText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchButtonText: { color: colors.white, fontSize: 14, fontWeight: '700' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chipsLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  chip: {
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textSecondary },
  assistantCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 16,
  },
  assistantIcon: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: '#ffffff26',
    alignItems: 'center', justifyContent: 'center',
  },
  assistantTitle: { color: colors.white, fontWeight: '700', fontSize: 14 },
  assistantSubtitle: { color: '#ffffffcc', fontSize: 11, marginTop: 3, lineHeight: 15 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionCard: {
    width: '47%',
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  ordersCard: {
    backgroundColor: colors.surfaceLowest,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ordersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  ordersHeaderTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ordersHeaderText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  seeAllLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  seeAllText: { fontSize: 12, color: colors.secondary, fontWeight: '600' },
  emptyState: { paddingVertical: 40, alignItems: 'center' },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyText: { fontSize: 13, color: colors.textSecondary },
  emptyLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  emptyLinkText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  orderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  orderDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  orderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  orderTotal: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
})