// MEDICINE_DETAILS_APPROVED_MOCKUP_V1
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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

const SCREEN_BACKGROUND = '#f7faff'
const NAVY = '#00236f'
const BLUE = '#073bdf'
const BRIGHT_BLUE = '#087dff'
const CYAN = '#10d1d0'
const TEXT = '#0b1f4d'
const MUTED = '#687892'
const BORDER = '#e2eaf5'

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

function formatTotalPrice(
  price: string | null,
  currency: string,
  quantity: number,
) {
  if (price === null) {
    return null
  }

  const numericPrice = Number(price)

  if (Number.isNaN(numericPrice)) {
    return null
  }

  return `${(numericPrice * quantity)
    .toFixed(2)
    .replace('.', ',')} ${currency}`
}

export default function MedicineDetails({
  navigation,
  route,
}: Props) {
  const insets = useSafeAreaInsets()

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

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

  const cartCount = useCartStore(
    (state) => state.totalItems(),
  )

  const [selectedQuantity, setSelectedQuantity] =
    useState(cartItem?.quantity ?? 1)

  useEffect(() => {
    if (cartItem?.quantity) {
      setSelectedQuantity(cartItem.quantity)
    }
  }, [cartItem?.quantity])

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
    void loadMedicine()
  }, [loadMedicine])

  const displayedPrice = useMemo(() => {
    if (!medicine) {
      return ''
    }

    return formatPrice(
      medicine.min_price,
      medicine.currency,
    )
  }, [medicine])

  const totalPrice = useMemo(() => {
    if (!medicine) {
      return null
    }

    return formatTotalPrice(
      medicine.min_price,
      medicine.currency,
      selectedQuantity,
    )
  }, [medicine, selectedQuantity])

  const maxQuantity =
    medicine?.total_available_quantity ?? 0

  const canDecrease = selectedQuantity > 1

  const canIncrease = Boolean(
    medicine?.is_available
      && selectedQuantity < maxQuantity,
  )

  function handleDecrease() {
    if (!canDecrease) {
      return
    }

    setSelectedQuantity((current) => current - 1)
  }

  function handleIncrease() {
    if (!canIncrease) {
      return
    }

    setSelectedQuantity((current) => current + 1)
  }

  function commitSelectedQuantity() {
    if (!medicine || !medicine.is_available) {
      return
    }

    if (cartItem) {
      updateQuantity(
        medicine.id,
        selectedQuantity,
      )
      return
    }

    addItem(
      medicine,
      selectedQuantity,
    )
  }

  function handleAddToCart() {
    commitSelectedQuantity()
  }

  function handleBuyNow() {
    if (!medicine || !medicine.is_available) {
      return
    }

    commitSelectedQuantity()
    navigation.navigate('Cart')
  }

  async function handleShare() {
    if (!medicine) {
      return
    }

    const genericName =
      medicine.generic_name?.trim()

    const message = genericName
      ? `${medicine.name} — ${genericName}`
      : medicine.name

    try {
      await Share.share({
        message,
        title: medicine.name,
      })
    } catch {
      // Native sharing can be dismissed by the user.
    }
  }

  if (loading) {
    return (
      <View style={styles.centeredScreen}>
        <StatusBar style="dark" />

        <ActivityIndicator
          size="large"
          color={NAVY}
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
        <StatusBar style="dark" />

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
          onPress={() => {
            void loadMedicine()
          }}
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

  const pharmacyLabel =
    medicine.available_pharmacies_count === 1
      ? '1 pharmacie'
      : `${medicine.available_pharmacies_count} pharmacies`

  const prescriptionLabel =
    medicine.requires_prescription
      ? 'Ordonnance requise'
      : 'Sans ordonnance'

  const availabilityLabel =
    medicine.is_available
      ? 'En stock'
      : 'Indisponible'

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              178 + Math.max(insets.bottom, 10),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={[
            NAVY,
            BLUE,
            BRIGHT_BLUE,
            CYAN,
          ]}
          start={{ x: 0, y: 0.2 }}
          end={{ x: 1, y: 0.85 }}
          style={[
            styles.hero,
            {
              paddingTop: insets.top + 12,
            },
          ]}
        >
          <View style={styles.heroActions}>
            <Pressable
              style={styles.heroActionButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Icon
                name="arrow_back_ios_new"
                size={19}
                color="#ffffff"
              />
            </Pressable>

            <View style={styles.heroActionGroup}>
              <Pressable
                style={styles.heroActionButton}
                onPress={() =>
                  navigation.navigate('Cart')
                }
                accessibilityRole="button"
                accessibilityLabel="Ouvrir le panier"
              >
                <Icon
                  name="shopping_cart"
                  size={22}
                  color="#ffffff"
                />

                {cartCount > 0 ? (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>
                      {cartCount > 99 ? '99+' : cartCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              <Pressable
                style={styles.heroActionButton}
                onPress={() => {
                  void handleShare()
                }}
                accessibilityRole="button"
                accessibilityLabel="Partager"
              >
                <Icon
                  name="ios_share"
                  size={22}
                  color="#ffffff"
                />
              </Pressable>
            </View>
          </View>

          <View style={styles.heroProductRow}>
            <View style={styles.productImageCard}>
              {medicine.image ? (
                <Image
                  source={{ uri: medicine.image }}
                  style={styles.productImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.productImageFallback}>
                  <Icon
                    name="medication"
                    size={62}
                    color="#6b7c96"
                  />

                  <Text style={styles.imageFallbackText}>
                    Image non disponible
                  </Text>
                </View>
              )}

              <View style={styles.imageDots}>
                <View
                  style={[
                    styles.imageDot,
                    styles.imageDotActive,
                  ]}
                />
                <View style={styles.imageDot} />
                <View style={styles.imageDot} />
                <View style={styles.imageDot} />
              </View>
            </View>

            <View style={styles.heroInformation}>
              <View
                style={[
                  styles.stockBadge,
                  medicine.is_available
                    ? styles.stockBadgeAvailable
                    : styles.stockBadgeUnavailable,
                ]}
              >
                <Text
                  style={[
                    styles.stockBadgeText,
                    {
                      color: medicine.is_available
                        ? '#14945b'
                        : '#c2413b',
                    },
                  ]}
                >
                  {availabilityLabel}
                </Text>
              </View>

              <Text
                style={styles.productName}
                numberOfLines={3}
              >
                {medicine.name}
              </Text>

              {medicine.generic_name?.trim() ? (
                <Text
                  style={styles.genericName}
                  numberOfLines={2}
                >
                  {medicine.generic_name}
                </Text>
              ) : null}

              <View style={styles.medicineBadge}>
                <Icon
                  name="science"
                  size={15}
                  color={BLUE}
                />

                <Text style={styles.medicineBadgeText}>
                  Médicament
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.priceOverview}>
          <View style={styles.manufacturerLine}>
            <Icon
              name="business"
              size={18}
              color="#f6ad17"
            />

            <Text
              style={styles.manufacturerText}
              numberOfLines={1}
            >
              {medicine.manufacturer || 'Fabricant non renseigné'}
            </Text>
          </View>

          <Text
            style={[
              styles.price,
              !medicine.is_available
                && styles.priceUnavailable,
            ]}
          >
            {medicine.is_available
              ? displayedPrice
              : 'Indisponible'}
          </Text>

          <Text style={styles.priceHint}>
            Prix minimum disponible • TTC
          </Text>
        </View>

        <View style={styles.trustCard}>
          <View style={styles.trustItem}>
            <View
              style={[
                styles.trustIcon,
                { backgroundColor: '#eef4ff' },
              ]}
            >
              <Icon
                name={
                  medicine.requires_prescription
                    ? 'lock'
                    : 'verified_user'
                }
                size={24}
                color={BLUE}
              />
            </View>

            <Text style={styles.trustTitle}>
              Ordonnance
            </Text>

            <Text
              style={styles.trustSubtitle}
              numberOfLines={2}
            >
              {medicine.requires_prescription
                ? 'Requise'
                : 'Non requise'}
            </Text>
          </View>

          <View style={styles.trustDivider} />

          <View style={styles.trustItem}>
            <View
              style={[
                styles.trustIcon,
                { backgroundColor: '#ecfbf4' },
              ]}
            >
              <Icon
                name="inventory_2"
                size={24}
                color="#11a865"
              />
            </View>

            <Text style={styles.trustTitle}>
              Disponibilité
            </Text>

            <Text
              style={styles.trustSubtitle}
              numberOfLines={2}
            >
              {availabilityLabel}
            </Text>
          </View>

          <View style={styles.trustDivider} />

          <View style={styles.trustItem}>
            <View
              style={[
                styles.trustIcon,
                { backgroundColor: '#f4efff' },
              ]}
            >
              <Icon
                name="local_pharmacy"
                size={24}
                color="#8157ef"
              />
            </View>

            <Text style={styles.trustTitle}>
              Pharmacies
            </Text>

            <Text
              style={styles.trustSubtitle}
              numberOfLines={2}
            >
              {pharmacyLabel}
            </Text>
          </View>

          <View style={styles.trustDivider} />

          <View style={styles.trustItem}>
            <View
              style={[
                styles.trustIcon,
                { backgroundColor: '#fff5e6' },
              ]}
            >
              <Icon
                name="inventory"
                size={24}
                color="#f59e0b"
              />
            </View>

            <Text style={styles.trustTitle}>
              Stock
            </Text>

            <Text
              style={styles.trustSubtitle}
              numberOfLines={2}
            >
              {medicine.total_available_quantity} unité
              {medicine.total_available_quantity > 1
                ? 's'
                : ''}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Description
          </Text>

          <Text style={styles.description}>
            {medicine.description?.trim()
              || 'Aucune description disponible pour ce médicament.'}
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>
            Informations
          </Text>

          <View style={styles.informationRow}>
            <View style={styles.informationIcon}>
              <Icon
                name="business"
                size={19}
                color={BLUE}
              />
            </View>

            <Text style={styles.informationLabel}>
              Fabricant
            </Text>

            <Text
              style={styles.informationValue}
              numberOfLines={1}
            >
              {medicine.manufacturer || 'Non renseigné'}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.informationRow}>
            <View style={styles.informationIcon}>
              <Icon
                name="prescriptions"
                size={19}
                color={BLUE}
              />
            </View>

            <Text style={styles.informationLabel}>
              Prescription
            </Text>

            <Text
              style={styles.informationValue}
              numberOfLines={1}
            >
              {prescriptionLabel}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.informationRow}>
            <View style={styles.informationIcon}>
              <Icon
                name="local_pharmacy"
                size={19}
                color={BLUE}
              />
            </View>

            <Text style={styles.informationLabel}>
              Pharmacies
            </Text>

            <Text style={styles.informationValue}>
              {medicine.available_pharmacies_count}
            </Text>
          </View>

          <View style={styles.separator} />

          <View style={styles.informationRow}>
            <View style={styles.informationIcon}>
              <Icon
                name="inventory_2"
                size={19}
                color={BLUE}
              />
            </View>

            <Text style={styles.informationLabel}>
              Stock total
            </Text>

            <Text style={styles.informationValue}>
              {medicine.total_available_quantity}
            </Text>
          </View>
        </View>

        <View style={styles.adviceCard}>
          <View style={styles.adviceHeader}>
            <View style={styles.adviceAvatar}>
              <Icon
                name="smart_toy"
                size={24}
                color="#ffffff"
              />
            </View>

            <View style={styles.adviceHeaderText}>
              <Text style={styles.adviceTitle}>
                Besoin d’un conseil ?
              </Text>

              <Text style={styles.adviceSubtitle}>
                PharmAgent peut expliquer les précautions,
                indications et interactions importantes.
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.adviceButton}
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'Assistant',
                params: {
                  autoRequest: {
                    requestId:
                      `${medicine.id}-${Date.now()}`,
                    prompt:
                      buildMedicinePrompt(medicine),
                  },
                },
              })
            }
          >
            <Icon
              name="forum"
              size={19}
              color="#ffffff"
            />

            <Text style={styles.adviceButtonText}>
              Demander à PharmAgent
            </Text>

            <Icon
              name="arrow_forward"
              size={18}
              color="#ffffff"
            />
          </Pressable>
        </View>
      </ScrollView>

      <View
        style={[
          styles.purchasePanel,
          {
            paddingBottom:
              Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.quantityArea}>
          <Text style={styles.quantityLabel}>
            Quantité
          </Text>

          <View style={styles.quantityControl}>
            <Pressable
              style={[
                styles.quantityButton,
                !canDecrease
                  && styles.quantityButtonDisabled,
              ]}
              onPress={handleDecrease}
              disabled={!canDecrease}
            >
              <Icon
                name="remove"
                size={20}
                color={
                  canDecrease
                    ? TEXT
                    : '#a8b2c2'
                }
              />
            </Pressable>

            <Text style={styles.quantityValue}>
              {selectedQuantity}
            </Text>

            <Pressable
              style={[
                styles.quantityButton,
                !canIncrease
                  && styles.quantityButtonDisabled,
              ]}
              onPress={handleIncrease}
              disabled={!canIncrease}
            >
              <Icon
                name="add"
                size={20}
                color={
                  canIncrease
                    ? BLUE
                    : '#a8b2c2'
                }
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.purchaseActions}>
          <Pressable
            style={[
              styles.addToCartButton,
              !medicine.is_available
                && styles.disabledPurchaseButton,
            ]}
            onPress={handleAddToCart}
            disabled={!medicine.is_available}
          >
            <Icon
              name="shopping_cart"
              size={20}
              color="#ffffff"
            />

            <Text style={styles.addToCartText}>
              {medicine.is_available
                ? 'Ajouter au panier'
                : 'Indisponible'}
            </Text>

            {totalPrice && medicine.is_available ? (
              <Text style={styles.addToCartPrice}>
                {totalPrice}
              </Text>
            ) : null}
          </Pressable>

          <Pressable
            style={[
              styles.buyNowButton,
              !medicine.is_available
                && styles.buyNowButtonDisabled,
            ]}
            onPress={handleBuyNow}
            disabled={!medicine.is_available}
          >
            <Icon
              name="bolt"
              size={19}
              color={
                medicine.is_available
                  ? BLUE
                  : '#94a3b8'
              }
            />

            <Text
              style={[
                styles.buyNowText,
                !medicine.is_available
                  && styles.buyNowTextDisabled,
              ]}
            >
              Acheter maintenant
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SCREEN_BACKGROUND,
  },

  content: {
    backgroundColor: SCREEN_BACKGROUND,
  },

  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: SCREEN_BACKGROUND,
  },

  loadingText: {
    marginTop: 12,
    color: MUTED,
    fontSize: 14,
    fontWeight: '600',
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
    color: TEXT,
    fontSize: 20,
    fontWeight: '900',
  },

  errorText: {
    marginTop: 8,
    color: MUTED,
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
    borderRadius: 14,
    backgroundColor: NAVY,
  },

  retryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },

  hero: {
    minHeight: 352,
    paddingHorizontal: 18,
    paddingBottom: 30,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
  },

  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  heroActionGroup: {
    flexDirection: 'row',
    gap: 10,
  },

  heroActionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  cartBadge: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 11,
    backgroundColor: '#ff304f',
  },

  cartBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },

  heroProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  productImageCard: {
    width: '48%',
    height: 214,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 26,
    backgroundColor: '#ffffff',
    shadowColor: '#00184d',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 9,
  },

  productImage: {
    width: '100%',
    height: 168,
  },

  productImageFallback: {
    width: '100%',
    height: 164,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },

  imageFallbackText: {
    marginTop: 9,
    color: '#7a879b',
    fontSize: 11,
    fontWeight: '700',
  },

  imageDots: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 6,
  },

  imageDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#c9d2df',
  },

  imageDotActive: {
    width: 16,
    backgroundColor: BLUE,
  },

  heroInformation: {
    flex: 1,
    alignItems: 'flex-start',
  },

  stockBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },

  stockBadgeAvailable: {
    backgroundColor: '#f0fff7',
  },

  stockBadgeUnavailable: {
    backgroundColor: '#fff2f1',
  },

  stockBadgeText: {
    fontSize: 13,
    fontWeight: '900',
  },

  productName: {
    marginTop: 14,
    color: '#ffffff',
    fontSize: 25,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.45,
  },

  genericName: {
    marginTop: 7,
    color: '#edf8ff',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },

  medicineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  medicineBadgeText: {
    color: BLUE,
    fontSize: 12,
    fontWeight: '900',
  },

  priceOverview: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },

  manufacturerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  manufacturerText: {
    flex: 1,
    color: '#53627a',
    fontSize: 14,
    fontWeight: '700',
  },

  price: {
    marginTop: 10,
    color: BLUE,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.4,
  },

  priceUnavailable: {
    color: '#c2413b',
    fontSize: 24,
  },

  priceHint: {
    marginTop: 3,
    color: MUTED,
    fontSize: 13,
  },

  trustCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: 16,
    marginBottom: 14,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.07,
    shadowRadius: 15,
    elevation: 4,
  },

  trustItem: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 5,
  },

  trustDivider: {
    width: 1,
    marginVertical: 7,
    backgroundColor: '#e8eef7',
  },

  trustIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },

  trustTitle: {
    marginTop: 8,
    color: TEXT,
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
  },

  trustSubtitle: {
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },

  sectionCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.06,
    shadowRadius: 15,
    elevation: 3,
  },

  sectionTitle: {
    color: TEXT,
    fontSize: 19,
    fontWeight: '900',
  },

  description: {
    marginTop: 12,
    color: '#53627a',
    fontSize: 14,
    lineHeight: 22,
  },

  informationRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
  },

  informationIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    borderRadius: 11,
    backgroundColor: '#edf4ff',
  },

  informationLabel: {
    flex: 1,
    color: TEXT,
    fontSize: 14,
    fontWeight: '800',
  },

  informationValue: {
    maxWidth: '44%',
    color: '#41516d',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },

  separator: {
    height: 1,
    marginLeft: 45,
    backgroundColor: '#e8eef7',
  },

  adviceCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#dfe9ff',
    borderRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.06,
    shadowRadius: 15,
    elevation: 3,
  },

  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  adviceAvatar: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: BLUE,
  },

  adviceHeaderText: {
    flex: 1,
    marginLeft: 12,
  },

  adviceTitle: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },

  adviceSubtitle: {
    marginTop: 4,
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
  },

  adviceButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 15,
    borderRadius: 15,
    backgroundColor: BLUE,
  },

  adviceButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },

  purchasePanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 14,
    borderWidth: 1,
    borderColor: '#dfe7f3',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#00184d',
    shadowOffset: {
      width: 0,
      height: -7,
    },
    shadowOpacity: 0.11,
    shadowRadius: 18,
    elevation: 15,
  },

  quantityArea: {
    width: 112,
  },

  quantityLabel: {
    marginBottom: 7,
    color: '#687892',
    fontSize: 11,
    fontWeight: '800',
  },

  quantityControl: {
    height: 49,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dce5f1',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },

  quantityButton: {
    width: 36,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  quantityButtonDisabled: {
    backgroundColor: '#f8fafc',
  },

  quantityValue: {
    flex: 1,
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  purchaseActions: {
    flex: 1,
    gap: 8,
  },

  addToCartButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    borderRadius: 15,
    backgroundColor: BLUE,
  },

  disabledPurchaseButton: {
    backgroundColor: '#cbd5e1',
  },

  addToCartText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },

  addToCartPrice: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },

  buyNowButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: BLUE,
    borderRadius: 15,
    backgroundColor: '#ffffff',
  },

  buyNowButtonDisabled: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },

  buyNowText: {
    color: BLUE,
    fontSize: 13,
    fontWeight: '900',
  },

  buyNowTextDisabled: {
    color: '#94a3b8',
  },
})
