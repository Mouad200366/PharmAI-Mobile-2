import { View, Text, StyleSheet, Pressable, ScrollView, Image } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { MainStackParamList } from '../../navigation/types'
import { useCartStore } from '../../store/cartStore'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<MainStackParamList, 'Cart'>

// Mobile port of the web app's Cart.tsx. Same content (empty state, item
// list with quantity steppers, price-confirmation note, checkout CTA) --
// just RN primitives instead of Tailwind divs, and `navigation.navigate`
// instead of <Link to>. Cart lives directly in MainStack (a sibling of the
// Tabs navigator), so jumping to Search needs the nested-navigator form:
// navigate('Tabs', { screen: 'Search' }).
export default function Cart({ navigation }: Props) {
  const { items, updateQuantity, removeItem, clearCart } = useCartStore()

  if (items.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <View style={styles.emptyIconWrap}>
          <Icon name="shopping_cart" size={48} color={colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Votre panier est vide</Text>
        <Text style={styles.emptySubtitle}>Ajoutez des médicaments depuis la recherche</Text>
        <Pressable
          style={styles.emptyCta}
          onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}
        >
          <Icon name="search" size={18} color={colors.white} />
          <Text style={styles.emptyCtaText}>Rechercher un médicament</Text>
        </Pressable>
      </View>
    )
  }

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Mon panier</Text>
            <Text style={styles.headerSubtitle}>
              {itemCount} article{itemCount > 1 ? 's' : ''}
            </Text>
          </View>
          <Pressable style={styles.clearBtn} onPress={clearCart}>
            <Icon name="delete_sweep" size={18} color={colors.error} />
            <Text style={styles.clearBtnText}>Vider</Text>
          </Pressable>
        </View>

        {/* Items */}
        <View style={styles.card}>
          {items.map(({ medicine, quantity }, idx) => (
            <View
              key={medicine.id}
              style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
            >
              <View style={styles.itemImageWrap}>
                {medicine.image ? (
                  <Image source={{ uri: medicine.image }} style={styles.itemImage} />
                ) : (
                  <Icon name="medication" size={26} color={colors.accentLight} />
                )}
              </View>

              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{medicine.name}</Text>
                {!!medicine.generic_name && (
                  <Text style={styles.itemGeneric} numberOfLines={1}>{medicine.generic_name}</Text>
                )}
                {medicine.requires_prescription && (
                  <View style={styles.rxBadge}>
                    <Text style={styles.rxBadgeText}>Ordonnance requise</Text>
                  </View>
                )}
              </View>

              <View style={styles.itemControls}>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => updateQuantity(medicine.id, quantity - 1)}
                >
                  <Icon name="remove" size={16} color={colors.textSecondary} />
                </Pressable>
                <Text style={styles.stepperValue}>{quantity}</Text>
                <Pressable
                  style={styles.stepperBtn}
                  onPress={() => updateQuantity(medicine.id, quantity + 1)}
                >
                  <Icon name="add" size={16} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  style={styles.removeBtn}
                  onPress={() => removeItem(medicine.id)}
                >
                  <Icon name="delete" size={17} color="#f87171" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {/* Price note */}
        <View style={styles.noteBox}>
          <Icon name="info" size={18} color="#3b82f6" />
          <Text style={styles.noteText}>
            Le prix sera confirmé par la pharmacie après validation de votre commande.
          </Text>
        </View>
      </ScrollView>

      {/* CTA */}
      <View style={styles.ctaBar}>
        <Pressable style={styles.ctaButton} onPress={() => navigation.navigate('Checkout')}>
          <Icon name="shopping_bag" size={20} color={colors.white} />
          <Text style={styles.ctaText}>Passer la commande</Text>
          <Icon name="arrow_forward" size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: 16, paddingBottom: 24, gap: 16 },

  // Empty state
  emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.surface },
  emptyIconWrap: {
    width: 96, height: 96, borderRadius: 24, backgroundColor: colors.surfaceLowest,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: colors.textSecondary },
  emptySubtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
  emptyCta: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  emptyCtaText: { color: colors.white, fontWeight: '600', fontSize: 14 },

  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearBtnText: { color: colors.error, fontSize: 14, fontWeight: '500' },

  // Card / items
  card: {
    backgroundColor: colors.surfaceLowest, borderRadius: 16,
    borderWidth: 1, borderColor: colors.outlineVariant, overflow: 'hidden',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  itemRowBorder: { borderTopWidth: 1, borderTopColor: colors.outlineVariant },
  itemImageWrap: {
    width: 48, height: 48, borderRadius: 12, backgroundColor: '#eef6f7',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  itemImage: { width: '100%', height: '100%' },
  itemInfo: { flex: 1, minWidth: 0, gap: 2 },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  itemGeneric: { fontSize: 12, color: colors.textMuted },
  rxBadge: { alignSelf: 'flex-start', backgroundColor: '#fff7ed', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, marginTop: 2 },
  rxBadgeText: { fontSize: 10, fontWeight: '500', color: '#c2410c' },
  itemControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.outlineVariant, alignItems: 'center', justifyContent: 'center',
  },
  stepperValue: { width: 22, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  removeBtn: { marginLeft: 4, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  // Note
  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe', borderRadius: 16, padding: 14,
  },
  noteText: { flex: 1, fontSize: 13, color: '#1d4ed8', lineHeight: 18 },

  // CTA bar (pinned to bottom, above the tab/home indicator area)
  ctaBar: {
    padding: 16, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.outlineVariant,
  },
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 16,
  },
  ctaText: { color: colors.white, fontWeight: '700', fontSize: 14 },
})