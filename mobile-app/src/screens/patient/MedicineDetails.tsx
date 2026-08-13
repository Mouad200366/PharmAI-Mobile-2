import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

import type {
  MainStackParamList,
} from '../../navigation/types'
import {
  catalogApi,
  type Medicine,
} from '../../api/catalog'
import { useCartStore } from '../../store/cartStore'
import Icon from '../../components/ui/Icon'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'MedicineDetails'
>

function buildMedicinePrompt(medicine: Medicine) {
  const genericName = (medicine.generic_name ?? '').trim()
  const genericDetails = genericName
    ? ` (nom générique : ${genericName})`
    : ''

  return (
    `Donne-moi des informations complètes et fiables sur le médicament « ${medicine.name} »${genericDetails}. ` +
    `Explique clairement ses indications, son mode d’utilisation général, les précautions à prendre, ` +
    `les contre-indications, les effets indésirables possibles et les interactions médicamenteuses importantes. ` +
    `Précise également s’il nécessite une ordonnance et rappelle que ces informations ne remplacent pas ` +
    `l’avis d’un médecin ou d’un pharmacien.`
  )
}

function formatPrice(
  price: string | null,
  currency: string,
) {
  if (price === null) {
    return 'Prix indisponible'
  }

  const numericPrice = Number(price)

  if (Number.isNaN(numericPrice)) {
    return `${price} ${currency}`
  }

  return `${numericPrice
    .toFixed(2)
    .replace('.', ',')} ${currency}`
}

export default function MedicineDetails({
  navigation,
  route,
}: Props) {
  const [medicine, setMedicine] =
    useState<Medicine | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState<string | null>(null)

  const cartItem = useCartStore((state) =>
    state.items.find(
      (item) =>
        item.medicine.id === route.params.id,
    ),
  )

  const addItem = useCartStore(
    (state) => state.addItem,
  )

  const updateQuantity = useCartStore(
    (state) => state.updateQuantity,
  )

  const quantity = cartItem?.quantity ?? 0

  const loadMedicine = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      const response = await catalogApi.detail(
        route.params.id,
      )

      setMedicine(response.data)
    } catch {
      setError(
        'Impossible de charger les informations du médicament.',
      )
    } finally {
      setLoading(false)
    }
  }, [route.params.id])

  useEffect(() => {
    loadMedicine()
  }, [loadMedicine])

  function handleIncrease() {
    if (!medicine || !medicine.is_available) {
      return
    }

    if (
      quantity >=
      medicine.total_available_quantity
    ) {
      return
    }

    addItem(medicine)
  }

  function handleDecrease() {
    if (!medicine) {
      return
    }

    updateQuantity(
      medicine.id,
      quantity - 1,
    )
  }

  function handleBuyNow() {
    if (!medicine || !medicine.is_available) {
      return
    }

    if (quantity === 0) {
      addItem(medicine)
    }

    navigation.navigate('Cart')
  }

  if (loading) {
    return (
      <View style={styles.centeredScreen}>
        <ActivityIndicator
          size="large"
          color="#00236f"
        />

        <Text style={styles.loadingText}>
          Chargement du médicament…
        </Text>
      </View>
    )
  }

  if (error || !medicine) {
    return (
      <View style={styles.centeredScreen}>
        <View style={styles.errorIcon}>
          <Icon
            name="error_outline"
            size={42}
            color="#dc2626"
          />
        </View>

        <Text style={styles.errorTitle}>
          Une erreur est survenue
        </Text>

        <Text style={styles.errorText}>
          {error}
        </Text>

        <Pressable
          style={styles.retryButton}
          onPress={loadMedicine}
        >
          <Icon
            name="refresh"
            size={18}
            color="#ffffff"
          />

          <Text style={styles.retryButtonText}>
            Réessayer
          </Text>
        </Pressable>
      </View>
    )
  }

  const displayedPrice = formatPrice(
    medicine.min_price,
    medicine.currency,
  )

  const canIncrease =
    medicine.is_available &&
    quantity <
      medicine.total_available_quantity

  const pharmacyLabel =
    medicine.available_pharmacies_count === 1
      ? '1 pharmacie disponible'
      : `${medicine.available_pharmacies_count} pharmacies disponibles`

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.imageSection}>
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
                size={80}
                color="#64748b"
              />
            </View>
          )}
        </View>

        <View style={styles.mainInformation}>
          <View style={styles.titleRow}>
            <View style={styles.titleContent}>
              <Text style={styles.name}>
                {medicine.name}
              </Text>

              <Text style={styles.genericName}>
                {medicine.generic_name}
              </Text>
            </View>

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
                size={14}
                color={
                  medicine.requires_prescription
                    ? '#b45309'
                    : '#15803d'
                }
              />

              <Text
                style={[
                  styles.prescriptionText,
                  {
                    color:
                      medicine.requires_prescription
                        ? '#b45309'
                        : '#15803d',
                  },
                ]}
              >
                {medicine.requires_prescription
                  ? 'Ordonnance requise'
                  : 'Sans ordonnance'}
              </Text>
            </View>
          </View>

          <View style={styles.manufacturerRow}>
            <Icon
              name="business"
              size={16}
              color="#64748b"
            />

            <Text style={styles.manufacturer}>
              {medicine.manufacturer}
            </Text>
          </View>
        </View>

        <View style={styles.priceCard}>
          <View>
            <Text style={styles.priceLabel}>
              Prix à partir de
            </Text>

            <Text
              style={[
                styles.price,
                !medicine.is_available &&
                  styles.unavailablePrice,
              ]}
            >
              {medicine.is_available
                ? displayedPrice
                : 'Indisponible'}
            </Text>

            <Text style={styles.priceNotice}>
              Prix estimatif selon la pharmacie
            </Text>
          </View>

          <View
            style={[
              styles.availabilityBox,
              medicine.is_available
                ? styles.availableBox
                : styles.unavailableBox,
            ]}
          >
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
                {
                  color: medicine.is_available
                    ? '#15803d'
                    : '#dc2626',
                },
              ]}
            >
              {medicine.is_available
                ? pharmacyLabel
                : 'Stock indisponible'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon
              name="description"
              size={20}
              color="#00236f"
            />

            <Text style={styles.sectionTitle}>
              Description
            </Text>
          </View>

          <Text style={styles.description}>
            {medicine.description ||
              'Aucune description disponible pour ce médicament.'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Icon
              name="inventory_2"
              size={20}
              color="#00236f"
            />

            <Text style={styles.sectionTitle}>
              Disponibilité
            </Text>
          </View>

          <View style={styles.informationRow}>
            <Text style={styles.informationLabel}>
              Pharmacies
            </Text>

            <Text style={styles.informationValue}>
              {
                medicine.available_pharmacies_count
              }
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.informationRow}>
            <Text style={styles.informationLabel}>
              Quantité totale disponible
            </Text>

            <Text style={styles.informationValue}>
              {medicine.total_available_quantity}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.assistantButton}
          onPress={() =>
            navigation.navigate('Tabs', {
              screen: 'Assistant',
              params: {
                autoRequest: {
                  requestId: `${medicine.id}-${Date.now()}`,
                  prompt: buildMedicinePrompt(medicine),
                },
              },
            })
          }
        >
          <View style={styles.assistantIcon}>
            <Icon
              name="smart_toy"
              size={22}
              color="#ffffff"
            />
          </View>

          <View style={styles.assistantContent}>
            <Text style={styles.assistantTitle}>
              Demander à PharmAgent
            </Text>

            <Text style={styles.assistantSubtitle}>
              Obtenir des informations et précautions
              concernant {medicine.name}
            </Text>
          </View>

          <Icon
            name="chevron_right"
            size={22}
            color="#ffffff"
          />
        </Pressable>

        <View style={styles.bottomSpace} />
      </ScrollView>

      <View style={styles.purchaseBar}>
        {medicine.is_available ? (
          <>
            {quantity === 0 ? (
              <Pressable
                style={styles.addButton}
                onPress={handleIncrease}
              >
                <Icon
                  name="add_shopping_cart"
                  size={20}
                  color="#00236f"
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
                >
                  <Icon
                    name="remove"
                    size={20}
                    color="#00236f"
                  />
                </Pressable>

                <Text style={styles.quantityValue}>
                  {quantity}
                </Text>

                <Pressable
                  style={[
                    styles.quantityButton,
                    !canIncrease &&
                      styles.disabledQuantityButton,
                  ]}
                  onPress={handleIncrease}
                  disabled={!canIncrease}
                >
                  <Icon
                    name="add"
                    size={20}
                    color={
                      canIncrease
                        ? '#00236f'
                        : '#94a3b8'
                    }
                  />
                </Pressable>
              </View>
            )}

            <Pressable
              style={styles.buyButton}
              onPress={handleBuyNow}
            >
              <Text style={styles.buyButtonText}>
                Acheter maintenant
              </Text>

              <Icon
                name="arrow_forward"
                size={19}
                color="#ffffff"
              />
            </Pressable>
          </>
        ) : (
          <View style={styles.unavailableButton}>
            <Icon
              name="inventory_2"
              size={20}
              color="#94a3b8"
            />

            <Text style={styles.unavailableButtonText}>
              Médicament indisponible
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  content: {
    paddingBottom: 20,
  },

  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },

  loadingText: {
    marginTop: 12,
    color: '#64748b',
    fontSize: 14,
  },

  errorIcon: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#fef2f2',
  },

  errorTitle: {
    marginTop: 16,
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },

  errorText: {
    marginTop: 7,
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#00236f',
  },

  retryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  imageSection: {
    height: 280,
    padding: 24,
    backgroundColor: '#ffffff',
  },

  image: {
    width: '100%',
    height: '100%',
  },

  imageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
  },

  mainInformation: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
  },

  titleRow: {
    gap: 12,
  },

  titleContent: {
    flex: 1,
  },

  name: {
    color: '#0f172a',
    fontSize: 26,
    fontWeight: '900',
  },

  genericName: {
    marginTop: 4,
    color: '#475569',
    fontSize: 16,
    fontWeight: '600',
  },

  prescriptionBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderRadius: 999,
  },

  prescriptionRequired: {
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },

  noPrescription: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },

  prescriptionText: {
    fontSize: 12,
    fontWeight: '800',
  },

  manufacturerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 16,
  },

  manufacturer: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
  },

  priceCard: {
    margin: 16,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 18,
    backgroundColor: '#eff6ff',
  },

  priceLabel: {
    color: '#64748b',
    fontSize: 12,
  },

  price: {
    marginTop: 2,
    color: '#00236f',
    fontSize: 27,
    fontWeight: '900',
  },

  unavailablePrice: {
    color: '#94a3b8',
  },

  priceNotice: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 11,
  },

  availabilityBox: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  availableBox: {
    backgroundColor: '#dcfce7',
  },

  unavailableBox: {
    backgroundColor: '#fee2e2',
  },

  availabilityDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },

  availabilityText: {
    fontSize: 12,
    fontWeight: '800',
  },

  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },

  sectionTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '800',
  },

  description: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 22,
  },

  informationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },

  informationLabel: {
    flex: 1,
    color: '#64748b',
    fontSize: 13,
  },

  informationValue: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '800',
  },

  separator: {
    height: 1,
    marginVertical: 13,
    backgroundColor: '#e2e8f0',
  },

  assistantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#00687a',
  },

  assistantIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#ffffff22',
  },

  assistantContent: {
    flex: 1,
  },

  assistantTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  assistantSubtitle: {
    marginTop: 3,
    color: '#dbeafe',
    fontSize: 11,
    lineHeight: 16,
  },

  bottomSpace: {
    height: 10,
  },

  purchaseBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },

  addButton: {
    minWidth: 110,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#00236f',
    borderRadius: 14,
  },

  addButtonText: {
    color: '#00236f',
    fontSize: 13,
    fontWeight: '800',
  },

  quantityControl: {
    minWidth: 118,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
  },

  quantityButton: {
    width: 38,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },

  disabledQuantityButton: {
    backgroundColor: '#f1f5f9',
  },

  quantityValue: {
    minWidth: 30,
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },

  buyButton: {
    minHeight: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#00236f',
  },

  buyButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },

  unavailableButton: {
    minHeight: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },

  unavailableButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
  },
})