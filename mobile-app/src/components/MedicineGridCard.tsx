import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { Medicine } from '../api/catalog'
import { useCartStore } from '../store/cartStore'
import Icon from './ui/Icon'

type MedicineGridCardProps = {
  medicine: Medicine
  onPress?: () => void

  /*
   * This permits older Dashboard props to remain temporarily.
   * The card now manages its cart controls directly.
   */
  [key: string]: unknown
}

function formatPrice(
  price: string | null,
  currency: string,
) {
  if (price === null) {
    return null
  }

  const numericPrice = Number(price)

  if (Number.isNaN(numericPrice)) {
    return `${price} ${currency}`
  }

  return `${numericPrice
    .toFixed(2)
    .replace('.', ',')} ${currency}`
}

export default function MedicineGridCard({
  medicine,
  onPress,
}: MedicineGridCardProps) {
  const cartItem = useCartStore((state) =>
    state.items.find(
      (item) =>
        item.medicine.id === medicine.id,
    ),
  )

  const addItem = useCartStore(
    (state) => state.addItem,
  )

  const updateQuantity = useCartStore(
    (state) => state.updateQuantity,
  )

  const quantity = cartItem?.quantity ?? 0

  const displayedPrice = formatPrice(
    medicine.min_price,
    medicine.currency,
  )

  const maximumQuantity =
    medicine.total_available_quantity > 0
      ? medicine.total_available_quantity
      : 0

  const canIncrease =
    medicine.is_available &&
    quantity < maximumQuantity

  function handleAdd() {
    if (!medicine.is_available) {
      return
    }

    addItem(medicine)
  }

  function handleIncrease() {
    if (!canIncrease) {
      return
    }

    addItem(medicine)
  }

  function handleDecrease() {
    updateQuantity(
      medicine.id,
      quantity - 1,
    )
  }

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.informationArea}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={styles.imageContainer}>
          {medicine.image ? (
            <Image
              source={{ uri: medicine.image }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imageFallback}>
              <Icon
                name="medication"
                size={42}
                color="#64748b"
              />
            </View>
          )}

          <View
            style={[
              styles.prescriptionBadge,
              medicine.requires_prescription
                ? styles.prescriptionRequired
                : styles.noPrescription,
            ]}
          >
            <Icon
              name={
                medicine.requires_prescription
                  ? 'lock'
                  : 'verified'
              }
              size={11}
              color={
                medicine.requires_prescription
                  ? '#b45309'
                  : '#15803d'
              }
            />

            <Text
              style={[
                styles.prescriptionText,
                medicine.requires_prescription
                  ? styles.prescriptionRequiredText
                  : styles.noPrescriptionText,
              ]}
              numberOfLines={1}
            >
              {medicine.requires_prescription
                ? 'Ordonnance'
                : 'Sans ordonnance'}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <Text
            style={styles.name}
            numberOfLines={2}
          >
            {medicine.name}
          </Text>

          <Text
            style={styles.genericName}
            numberOfLines={1}
          >
            {medicine.generic_name}
          </Text>

          <Text
            style={styles.manufacturer}
            numberOfLines={1}
          >
            {medicine.manufacturer}
          </Text>

          <View style={styles.priceArea}>
            {medicine.is_available &&
            displayedPrice ? (
              <>
                <Text style={styles.priceLabel}>
                  À partir de
                </Text>

                <Text style={styles.price}>
                  {displayedPrice}
                </Text>
              </>
            ) : (
              <Text style={styles.unavailablePrice}>
                Prix indisponible
              </Text>
            )}
          </View>

          <View style={styles.availabilityRow}>
            <View
              style={[
                styles.availabilityDot,
                {
                  backgroundColor:
                    medicine.is_available
                      ? '#16a34a'
                      : '#dc2626',
                },
              ]}
            />

            <Text
              style={[
                styles.availabilityText,
                !medicine.is_available &&
                  styles.unavailableText,
              ]}
              numberOfLines={1}
            >
              {medicine.is_available
                ? `${medicine.available_pharmacies_count} pharmacie${
                    medicine.available_pharmacies_count >
                    1
                      ? 's'
                      : ''
                  }`
                : 'Indisponible'}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.cartArea}>
        {!medicine.is_available ? (
          <View style={styles.disabledButton}>
            <Icon
              name="inventory_2"
              size={16}
              color="#94a3b8"
            />

            <Text style={styles.disabledButtonText}>
              Indisponible
            </Text>
          </View>
        ) : quantity === 0 ? (
          <Pressable
            style={styles.addButton}
            onPress={handleAdd}
          >
            <Icon
              name="add_shopping_cart"
              size={17}
              color="#ffffff"
            />

            <Text style={styles.addButtonText}>
              Ajouter
            </Text>
          </Pressable>
        ) : (
          <View style={styles.quantityControl}>
            <Pressable
              style={styles.quantityButton}
              onPress={handleDecrease}
              accessibilityLabel="Réduire la quantité"
            >
              <Icon
                name="remove"
                size={18}
                color="#00236f"
              />
            </Pressable>

            <View style={styles.quantityValue}>
              <Text style={styles.quantityText}>
                {quantity}
              </Text>
            </View>

            <Pressable
              style={[
                styles.quantityButton,
                !canIncrease &&
                  styles.quantityButtonDisabled,
              ]}
              onPress={handleIncrease}
              disabled={!canIncrease}
              accessibilityLabel="Augmenter la quantité"
            >
              <Icon
                name="add"
                size={18}
                color={
                  canIncrease
                    ? '#00236f'
                    : '#94a3b8'
                }
              />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },

  informationArea: {
    flex: 1,
  },

  imageContainer: {
    position: 'relative',
    height: 130,
    backgroundColor: '#f8fafc',
  },

  image: {
    width: '100%',
    height: '100%',
  },

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  prescriptionBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    maxWidth: '88%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
  },

  prescriptionRequired: {
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },

  noPrescription: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },

  prescriptionText: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '700',
  },

  prescriptionRequiredText: {
    color: '#b45309',
  },

  noPrescriptionText: {
    color: '#15803d',
  },

  content: {
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 8,
  },

  name: {
    minHeight: 40,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },

  genericName: {
    marginTop: 2,
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },

  manufacturer: {
    marginTop: 3,
    color: '#94a3b8',
    fontSize: 10,
  },

  priceArea: {
    minHeight: 48,
    justifyContent: 'flex-end',
    marginTop: 10,
  },

  priceLabel: {
    color: '#64748b',
    fontSize: 10,
  },

  price: {
    marginTop: 1,
    color: '#00236f',
    fontSize: 17,
    fontWeight: '900',
  },

  unavailablePrice: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700',
  },

  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
  },

  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },

  availabilityText: {
    flex: 1,
    color: '#15803d',
    fontSize: 10,
    fontWeight: '700',
  },

  unavailableText: {
    color: '#dc2626',
  },

  cartArea: {
    paddingHorizontal: 10,
    paddingTop: 3,
    paddingBottom: 10,
  },

  addButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#00236f',
  },

  addButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },

  disabledButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },

  disabledButtonText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },

  quantityControl: {
    minHeight: 38,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },

  quantityButton: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },

  quantityButtonDisabled: {
    backgroundColor: '#f1f5f9',
  },

  quantityValue: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },
})