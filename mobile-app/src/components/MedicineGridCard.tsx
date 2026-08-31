import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { Medicine } from '../api/catalog'
import { useCartStore } from '../store/cartStore'
import { colors } from '../theme/colors'
import Icon from './ui/Icon'

type MedicineGridCardProps = {
  medicine: Medicine
  onPress?: () => void

  /*
   * Dashboard still passes a few historical cart props.
   * Keep accepting them while this card owns the real cart state.
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

  const pharmacyCount =
    medicine.available_pharmacies_count

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.informationArea}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={
          onPress ? 'button' : undefined
        }
        accessibilityLabel={
          onPress
            ? `Voir ${medicine.name}`
            : undefined
        }
      >
        <View style={styles.imageContainer}>
          <View style={styles.imageGlow} />

          {medicine.image ? (
            <Image
              source={{ uri: medicine.image }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.imageFallback}>
              <View style={styles.fallbackIconShell}>
                <Icon
                  name="medication"
                  size={34}
                  color="#0B5CFF"
                />
              </View>
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
                  ? 'description'
                  : 'verified'
              }
              size={11}
              color={
                medicine.requires_prescription
                  ? '#B45309'
                  : '#0A9B67'
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
                : 'Disponible'}
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
            {medicine.generic_name ||
              medicine.manufacturer}
          </Text>

          <View style={styles.availabilityRow}>
            <View
              style={[
                styles.availabilityDot,
                medicine.is_available
                  ? styles.availabilityDotAvailable
                  : styles.availabilityDotUnavailable,
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
                ? `${pharmacyCount} pharmacie${
                    pharmacyCount > 1 ? 's' : ''
                  }`
                : 'Indisponible'}
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.bottomRow}>
        <View style={styles.priceArea}>
          {medicine.is_available &&
          displayedPrice ? (
            <>
              <Text style={styles.priceLabel}>
                À partir de
              </Text>

              <Text
                style={styles.price}
                numberOfLines={1}
              >
                {displayedPrice}
              </Text>
            </>
          ) : (
            <Text style={styles.unavailablePrice}>
              Prix indisponible
            </Text>
          )}
        </View>

        {!medicine.is_available ? (
          <View
            style={styles.disabledAddButton}
            accessibilityLabel="Médicament indisponible"
          >
            <Icon
              name="block"
              size={17}
              color="#94A3B8"
            />
          </View>
        ) : quantity === 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}
            onPress={handleAdd}
            accessibilityRole="button"
            accessibilityLabel={`Ajouter ${medicine.name} au panier`}
          >
            <Icon
              name="add"
              size={22}
              color={colors.white}
            />
          </Pressable>
        ) : (
          <View style={styles.quantityControl}>
            <Pressable
              style={styles.quantityButton}
              onPress={handleDecrease}
              accessibilityRole="button"
              accessibilityLabel="Réduire la quantité"
            >
              <Icon
                name="remove"
                size={16}
                color="#0B5CFF"
              />
            </Pressable>

            <Text style={styles.quantityText}>
              {quantity}
            </Text>

            <Pressable
              style={[
                styles.quantityButton,
                !canIncrease &&
                  styles.quantityButtonDisabled,
              ]}
              onPress={handleIncrease}
              disabled={!canIncrease}
              accessibilityRole="button"
              accessibilityLabel="Augmenter la quantité"
            >
              <Icon
                name="add"
                size={16}
                color={
                  canIncrease
                    ? '#0B5CFF'
                    : '#94A3B8'
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
    borderColor: '#E1EAF6',
    borderRadius: 19,
    backgroundColor: colors.white,

    shadowColor: '#12366F',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.08,
    shadowRadius: 13,
    elevation: 3,
  },

  informationArea: {
    flex: 1,
  },

  imageContainer: {
    position: 'relative',
    height: 124,
    overflow: 'hidden',
    backgroundColor: '#F8FBFF',
  },

  imageGlow: {
    position: 'absolute',
    top: 11,
    right: 7,
    width: 78,
    height: 78,
    borderRadius: 45,
    backgroundColor: '#22D3EE12',
  },

  image: {
    width: '100%',
    height: '100%',
    marginTop: 3,
  },

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fallbackIconShell: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D7E8FF',
    backgroundColor: '#EEF6FF',
  },

  prescriptionBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    maxWidth: '88%',
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },

  prescriptionRequired: {
    borderColor: '#FDE7A8',
    backgroundColor: '#FFFBEBEE',
  },

  noPrescription: {
    borderColor: '#B9F0D5',
    backgroundColor: '#F0FDF8EE',
  },

  prescriptionText: {
    flexShrink: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },

  prescriptionRequiredText: {
    color: '#9A5B08',
  },

  noPrescriptionText: {
    color: '#087A55',
  },

  content: {
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 6,
  },

  name: {
    minHeight: 38,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: -0.2,
    color: '#0B1F4D',
  },

  genericName: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    color: '#71809A',
  },

  availabilityRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  availabilityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  availabilityDotAvailable: {
    backgroundColor: '#12B981',
  },

  availabilityDotUnavailable: {
    backgroundColor: '#EF4444',
  },

  availabilityText: {
    flex: 1,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: '#13855F',
  },

  unavailableText: {
    color: '#C24141',
  },

  bottomRow: {
    minHeight: 67,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 12,
  },

  priceArea: {
    flex: 1,
    minWidth: 0,
  },

  priceLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#8491A8',
  },

  price: {
    marginTop: 1,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: -0.2,
    color: '#0B5CFF',
  },

  unavailablePrice: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    color: '#94A3B8',
  },

  addButton: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#0B5CFF',

    shadowColor: '#0B5CFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },

  addButtonPressed: {
    opacity: 0.86,
    transform: [
      {
        scale: 0.96,
      },
    ],
  },

  disabledAddButton: {
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
  },

  quantityControl: {
    height: 39,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D6E5FA',
    borderRadius: 13,
    backgroundColor: '#F8FBFF',
  },

  quantityButton: {
    width: 31,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonDisabled: {
    backgroundColor: '#F1F5F9',
  },

  quantityText: {
    minWidth: 21,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    color: '#0B1F4D',
  },
})
