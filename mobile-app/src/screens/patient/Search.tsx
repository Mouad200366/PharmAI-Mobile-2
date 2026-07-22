import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CompositeScreenProps } from '@react-navigation/native'
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { AppTabParamList, MainStackParamList } from '../../navigation/types'
import Icon from '../../components/ui/Icon'
import { catalogApi, type Medicine } from '../../api/catalog'
import { useCartStore } from '../../store/cartStore'
import { colors } from '../../theme/colors'

type Props = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, 'Search'>,
  NativeStackScreenProps<MainStackParamList>
>

const FILTERS = ['Tous', 'Ouvert maintenant', 'Garde de nuit', 'Sur ordonnance', 'Sans ordonnance']
const SORT_OPTIONS = ['Pertinence', 'Prix croissant', 'Distance']
const POPULAR_SEARCHES = ['Doliprane', 'Amoxicilline', 'Ibuprofène', 'Paracétamol', 'Vitamine C']

// Brand accents from the web app (desktop Search.tsx gradient).
const NAVY = '#00236f'
const CYAN = '#06B6D4'
const BG = '#f4f6fb'

// Professional redesign of the mobile Search screen.
// Same backend integration as before: 400ms debounced catalogApi.search,
// same filters, same sort options, same cart-store interactions.
export default function Search({ navigation, route }: Props) {
  const insets = useSafeAreaInsets()
  const initialQuery = (route.params as { q?: string } | undefined)?.q ?? ''

  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<Medicine[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeFilter, setActiveFilter] = useState('Tous')
  const [sortIndex, setSortIndex] = useState(0)
  const [sortOpen, setSortOpen] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const items = useCartStore((s) => s.items)
  const addItem = useCartStore((s) => s.addItem)
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const getCartItem = (id: number) => items.find((i) => i.medicine.id === id)

  // Same debounced search as the web app (400 ms).
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearched(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await catalogApi.search({ q, limit: 20 })
        setResults(res.data)
        setSearched(true)
      } catch {
        setResults([])
        setSearched(true)
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const resultsLabel = searched
    ? `${results.length} médicament${results.length !== 1 ? 's' : ''} trouvé${results.length !== 1 ? 's' : ''}${query ? ` pour « ${query} »` : ''}`
    : 'Recherchez un médicament'

  return (
    <View style={styles.screen}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          {/* Placeholder location — wire to geolocation later */}
          <View>
            <Text style={styles.locationLabel}>Votre position</Text>
            <View style={styles.locationRow}>
              <Icon name="location_on" size={16} color={CYAN} />
              <Text style={styles.locationText}>Casablanca</Text>
              <Icon name="expand_more" size={16} color="rgba(255,255,255,0.7)" />
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.cartButton, pressed && { opacity: 0.8 }]}
            onPress={() => navigation.navigate('Cart')}
            accessibilityLabel="Ouvrir le panier"
          >
            <Icon name="shopping_cart" size={20} color={colors.white} />
            {cartCount > 0 && (
              <View style={styles.cartBadge}>
                <Text style={styles.cartBadgeText}>{cartCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={[styles.searchBar, inputFocused && styles.searchBarFocused]}>
          <Icon name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher un médicament..."
            placeholderTextColor={colors.textMuted}
            autoFocus={!initialQuery}
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          {loading ? (
            <ActivityIndicator size="small" color={CYAN} />
          ) : query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Effacer la recherche">
              <View style={styles.clearButton}>
                <Icon name="close" size={13} color={colors.white} />
              </View>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Filter chips ───────────────────────────────────── */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(f) => f}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.filterRow}
        renderItem={({ item: f }) => {
          const active = activeFilter === f
          return (
            <Pressable
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f}</Text>
            </Pressable>
          )
        }}
      />

      {/* ── Results header ─────────────────────────────────── */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsLabel} numberOfLines={1}>
          {resultsLabel}
        </Text>
        <Pressable style={styles.sortChip} onPress={() => setSortOpen(true)}>
          <Icon name="sort" size={14} color={colors.textSecondary} />
          <Text style={styles.sortChipText}>{SORT_OPTIONS[sortIndex]}</Text>
          <Icon name="expand_more" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* ── Content ────────────────────────────────────────── */}
      {query.trim() === '' ? (
        <InitialState onSelect={setQuery} />
      ) : loading && results.length === 0 ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : searched && results.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Icon name="search_off" size={34} color={NAVY} />
          </View>
          <Text style={styles.emptyTitle}>Aucun résultat pour « {query} »</Text>
          <Text style={styles.emptySubtitle}>Essayez un autre nom ou le principe actif</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={[styles.list, { paddingBottom: cartCount > 0 ? 104 : 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: med }) => {
            const cartItem = getCartItem(med.id)
            return (
              <MedicineCard
                medicine={med}
                cartItem={cartItem}
                onAdd={() => addItem(med)}
                onIncrease={() => cartItem && updateQuantity(med.id, cartItem.quantity + 1)}
                onDecrease={() => cartItem && updateQuantity(med.id, cartItem.quantity - 1)}
                onDetails={() => {
                  // TODO: navigation.navigate('MedicineDetails', { id: med.id })
                }}
              />
            )
          }}
        />
      )}

      {/* ── Floating cart bar ──────────────────────────────── */}
      {cartCount > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.cartBar,
            { bottom: insets.bottom + 16 },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => navigation.navigate('Cart')}
        >
          <View style={styles.cartBarLeft}>
            <View style={styles.cartBarCount}>
              <Text style={styles.cartBarCountText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBarText}>
              {cartCount} article{cartCount > 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.cartBarRight}>
            <Text style={styles.cartBarCta}>Voir le panier</Text>
            <Icon name="arrow_forward" size={16} color={colors.white} />
          </View>
        </Pressable>
      )}

      {/* ── Sort bottom sheet ──────────────────────────────── */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSortOpen(false)}>
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Trier par</Text>
            {SORT_OPTIONS.map((option, i) => {
              const active = i === sortIndex
              return (
                <Pressable
                  key={option}
                  style={styles.sheetRow}
                  onPress={() => {
                    setSortIndex(i)
                    setSortOpen(false)
                  }}
                >
                  <Text style={[styles.sheetRowText, active && styles.sheetRowTextActive]}>{option}</Text>
                  {active && <Icon name="check" size={18} color={CYAN} />}
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

/* ── Initial state: popular searches ─────────────────────── */
function InitialState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Icon name="medication" size={34} color={NAVY} />
      </View>
      <Text style={styles.emptyTitle}>Recherchez un médicament</Text>
      <Text style={styles.emptySubtitle}>Nom commercial ou principe actif (DCI)</Text>

      <Text style={styles.popularLabel}>Recherches fréquentes</Text>
      <View style={styles.popularWrap}>
        {POPULAR_SEARCHES.map((p) => (
          <Pressable key={p} style={styles.popularChip} onPress={() => onSelect(p)}>
            <Icon name="search" size={13} color={colors.textSecondary} />
            <Text style={styles.popularChipText}>{p}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/* ── Skeleton card while loading ─────────────────────────── */
function SkeletonCard() {
  const opacity = useRef(new Animated.Value(0.45)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View style={[styles.card, { opacity }]}>
      <View style={styles.skeletonRow}>
        <View style={styles.skeletonImage} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '55%' }]} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={styles.skeletonButton} />
        <View style={styles.skeletonButton} />
      </View>
    </Animated.View>
  )
}

/* ── Medicine card ───────────────────────────────────────── */
function MedicineCard({
  medicine,
  cartItem,
  onAdd,
  onIncrease,
  onDecrease,
  onDetails,
}: {
  medicine: Medicine
  cartItem: { quantity: number } | undefined
  onAdd: () => void
  onIncrease: () => void
  onDecrease: () => void
  onDetails: () => void
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={styles.cardImageWrap}>
          {medicine.image ? (
            <Image source={{ uri: medicine.image }} style={styles.cardImage} resizeMode="contain" />
          ) : (
            <Icon name="medication" size={26} color={NAVY} />
          )}
        </View>

        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>
            {medicine.name}
          </Text>
          {!!medicine.generic_name && (
            <Text style={styles.cardGeneric} numberOfLines={1}>
              {medicine.generic_name}
            </Text>
          )}
          <View style={styles.cardMetaRow}>
            <Icon name="location_on" size={12} color={colors.textMuted} />
            <Text style={styles.cardMetaText}>Casablanca</Text>
          </View>
        </View>

        <View
          style={[
            styles.badge,
            medicine.requires_prescription ? styles.badgeAmber : styles.badgeGreen,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              medicine.requires_prescription ? styles.badgeAmberText : styles.badgeGreenText,
            ]}
          >
            {medicine.requires_prescription ? 'Sur ordonnance' : 'Sans ordonnance'}
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <Pressable
          style={({ pressed }) => [styles.detailsButton, pressed && { backgroundColor: BG }]}
          onPress={onDetails}
        >
          <Text style={styles.detailsButtonText}>Détails</Text>
        </Pressable>

        {!cartItem ? (
          <Pressable style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]} onPress={onAdd}>
            <Icon name="add" size={16} color={colors.white} />
            <Text style={styles.addButtonText}>Commander</Text>
          </Pressable>
        ) : (
          <View style={styles.qtyControl}>
            <Pressable style={styles.qtyButton} onPress={onDecrease} hitSlop={4}>
              <Icon name="remove" size={15} color={NAVY} />
            </Pressable>
            <Text style={styles.qtyText}>{cartItem.quantity}</Text>
            <Pressable style={styles.qtyButton} onPress={onIncrease} hitSlop={4}>
              <Icon name="add" size={15} color={NAVY} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },

  /* Header */
  header: {
    backgroundColor: NAVY,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  locationLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 15, fontWeight: '700', color: colors.white },
  cartButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: CYAN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: NAVY,
  },
  cartBadgeText: { fontSize: 10, fontWeight: '800', color: NAVY },

  /* Search bar */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 52,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  searchBarFocused: { borderColor: CYAN },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 0 },
  clearButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Filter chips */
  filterRow: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 8 },
  filterChip: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  filterChipActive: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: colors.white },

  /* Results header */
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  resultsLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  sortChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },

  /* List + cards */
  list: { paddingHorizontal: 20, gap: 12 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardRow: { flexDirection: 'row', gap: 12 },
  cardImageWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: { width: 48, height: 48 },
  cardInfo: { flex: 1, gap: 2 },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardGeneric: { fontSize: 12, color: colors.textMuted },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  cardMetaText: { fontSize: 11, color: colors.textSecondary },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  badgeAmber: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' },
  badgeGreen: { backgroundColor: '#f0fdf4' },
  badgeText: { fontSize: 9, fontWeight: '800' },
  badgeAmberText: { color: '#92400e' },
  badgeGreenText: { color: '#15803d' },

  cardFooter: { flexDirection: 'row', gap: 10 },
  detailsButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    paddingVertical: 10,
  },
  detailsButtonText: { fontSize: 12, fontWeight: '700', color: NAVY },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: NAVY,
    borderRadius: 12,
    paddingVertical: 10,
  },
  addButtonText: { fontSize: 12, fontWeight: '700', color: colors.white },
  qtyControl: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  qtyButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  qtyText: { fontSize: 14, fontWeight: '800', color: NAVY },

  /* Empty states */
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptySubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 6, textAlign: 'center' },
  popularLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 28,
    marginBottom: 10,
  },
  popularWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  popularChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  popularChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

  /* Skeleton */
  skeletonRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  skeletonImage: { width: 56, height: 56, borderRadius: 14, backgroundColor: '#e2e8f0' },
  skeletonLine: { height: 12, borderRadius: 6, backgroundColor: '#e2e8f0', width: '80%' },
  skeletonButton: { height: 40, borderRadius: 12, backgroundColor: '#e2e8f0', flex: 1 },

  /* Floating cart bar */
  cartBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: NAVY,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: NAVY,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  cartBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cartBarCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    paddingHorizontal: 6,
    backgroundColor: CYAN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBarCountText: { fontSize: 12, fontWeight: '800', color: NAVY },
  cartBarText: { fontSize: 13, fontWeight: '700', color: colors.white },
  cartBarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartBarCta: { fontSize: 13, fontWeight: '800', color: colors.white },

  /* Sort sheet */
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(2,18,60,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.outlineVariant,
  },
  sheetRowText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  sheetRowTextActive: { color: NAVY, fontWeight: '800' },
})