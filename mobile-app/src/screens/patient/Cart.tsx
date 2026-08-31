// CART_APPROVED_MOCKUP_V1
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import {
  useLayoutEffect,
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
import { useCartStore } from '../../store/cartStore'
import Icon from '../../components/ui/Icon'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'Cart'
>

const DELIVERY_FEE = 15

const NAVY = '#00236f'
const BLUE = '#073bdf'
const BRIGHT_BLUE = '#087dff'
const CYAN = '#10d1d0'
const TEXT = '#0b1f4d'
const MUTED = '#6b7c96'
const BORDER = '#dfe8f4'
const SURFACE = '#f7faff'

function getMedicinePrice(
  price: string | null | undefined,
) {
  if (price === null || price === undefined) {
    return null
  }

  const numericPrice = Number(price)

  if (
    Number.isNaN(numericPrice) ||
    numericPrice < 0
  ) {
    return null
  }

  return numericPrice
}

function formatPrice(value: number) {
  return `${value
    .toFixed(2)
    .replace('.', ',')} MAD`
}

export default function Cart({
  navigation,
}: Props) {
  const insets = useSafeAreaInsets()

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    })
  }, [navigation])

  const {
    items,
    updateQuantity,
    removeItem,
  } = useCartStore()

  if (items.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <StatusBar style="light" />

        <LinearGradient
          colors={[
            NAVY,
            BLUE,
            BRIGHT_BLUE,
            CYAN,
          ]}
          start={{ x: 0, y: 0.15 }}
          end={{ x: 1, y: 0.85 }}
          style={[
            styles.emptyHero,
            {
              paddingTop: insets.top + 18,
            },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Icon
                name="medical_services"
                size={24}
                color="#ffffff"
              />
            </View>

            <Text style={styles.brandText}>
              Pharm
              <Text style={styles.brandAccent}>
                AI
              </Text>
            </Text>
          </View>

          <Text style={styles.emptyHeroEyebrow}>
            Finalisez votre commande
          </Text>

          <Text style={styles.emptyHeroTitle}>
            Mon panier
          </Text>

          <View style={styles.emptyCartArt}>
            <Icon
              name="shopping_cart"
              size={72}
              color="rgba(255,255,255,0.92)"
            />
          </View>
        </LinearGradient>

        <View style={styles.emptyContent}>
          <View style={styles.emptyIconWrap}>
            <Icon
              name="shopping_bag"
              size={44}
              color={BLUE}
            />
          </View>

          <Text style={styles.emptyTitle}>
            Votre panier est vide
          </Text>

          <Text style={styles.emptySubtitle}>
            Ajoutez des médicaments depuis le
            Dashboard pour préparer votre commande.
          </Text>

          <Pressable
            style={styles.emptyCta}
            onPress={() =>
              navigation.navigate('Tabs', {
                screen: 'Dashboard',
              })
            }
          >
            <Icon
              name="arrow_back"
              size={19}
              color="#ffffff"
            />

            <Text style={styles.emptyCtaText}>
              Continuer mes achats
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const itemCount = items.reduce(
    (total, item) =>
      total + item.quantity,
    0,
  )

  const estimatedSubtotal = items.reduce(
    (total, item) => {
      const unitPrice = getMedicinePrice(
        item.medicine.min_price,
      )

      if (unitPrice === null) {
        return total
      }

      return (
        total +
        unitPrice * item.quantity
      )
    },
    0,
  )

  const hasUnavailableItem = items.some(
    (item) =>
      !item.medicine.is_available ||
      getMedicinePrice(
        item.medicine.min_price,
      ) === null,
  )

  const hasPrescriptionItem = items.some(
    (item) =>
      item.medicine.requires_prescription,
  )

  const estimatedTotal =
    estimatedSubtotal + DELIVERY_FEE

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              176 + Math.max(insets.bottom, 10),
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
          start={{ x: 0, y: 0.1 }}
          end={{ x: 1, y: 0.9 }}
          style={[
            styles.hero,
            {
              paddingTop: insets.top + 18,
            },
          ]}
        >
          <View style={styles.brandRow}>
            <View style={styles.brandIcon}>
              <Icon
                name="medical_services"
                size={24}
                color="#ffffff"
              />
            </View>

            <Text style={styles.brandText}>
              Pharm
              <Text style={styles.brandAccent}>
                AI
              </Text>
            </Text>
          </View>

          <Text style={styles.heroEyebrow}>
            Finalisez votre commande
          </Text>

          <Text style={styles.heroTitle}>
            Mon panier
          </Text>

          <View style={styles.heroCartArt}>
            <Icon
              name="shopping_cart"
              size={86}
              color="rgba(255,255,255,0.88)"
            />
          </View>

          <View style={styles.waveOne} />
          <View style={styles.waveTwo} />
        </LinearGradient>

        <View style={styles.itemCountRow}>
          <View style={styles.itemCountPill}>
            <Icon
              name="shopping_bag"
              size={18}
              color={BLUE}
            />

            <Text style={styles.itemCountText}>
              {itemCount} article
              {itemCount > 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        <View style={styles.itemsList}>
          {items.map(
            ({
              medicine,
              quantity,
            }) => {
              const unitPrice =
                getMedicinePrice(
                  medicine.min_price,
                )

              const maximumQuantity =
                medicine.total_available_quantity ??
                quantity

              const canIncrease =
                medicine.is_available &&
                quantity < maximumQuantity

              const showPrescriptionBadge =
                medicine.requires_prescription

              return (
                <Pressable
                  key={medicine.id}
                  style={styles.itemCard}
                  onPress={() =>
                    navigation.navigate(
                      'MedicineDetails',
                      {
                        id: medicine.id,
                      },
                    )
                  }
                >
                  <View style={styles.itemImageWrap}>
                    {medicine.image ? (
                      <Image
                        source={{
                          uri: medicine.image,
                        }}
                        style={styles.itemImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View
                        style={styles.itemImageFallback}
                      >
                        <Icon
                          name="medication"
                          size={38}
                          color="#7c8aa0"
                        />
                      </View>
                    )}
                  </View>

                  <View style={styles.itemBody}>
                    <View style={styles.itemTopRow}>
                      <View style={styles.itemTextArea}>
                        <Text
                          style={styles.itemName}
                          numberOfLines={2}
                        >
                          {medicine.name}
                        </Text>

                        {!!medicine.generic_name && (
                          <Text
                            style={styles.itemGeneric}
                            numberOfLines={1}
                          >
                            {medicine.generic_name}
                          </Text>
                        )}
                      </View>

                      <Pressable
                        style={styles.deleteButton}
                        onPress={(event) => {
                          event.stopPropagation()
                          removeItem(medicine.id)
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          `Supprimer ${medicine.name}`
                        }
                      >
                        <Icon
                          name="delete_outline"
                          size={20}
                          color="#ef233c"
                        />
                      </Pressable>
                    </View>

                    <Text
                      style={[
                        styles.itemPrice,
                        unitPrice === null &&
                          styles.itemPriceUnavailable,
                      ]}
                    >
                      {unitPrice === null
                        ? 'Prix indisponible'
                        : formatPrice(unitPrice)}
                    </Text>

                    <View style={styles.itemBottomRow}>
                      <View
                        style={[
                          styles.statusBadge,
                          showPrescriptionBadge
                            ? styles.prescriptionBadge
                            : medicine.is_available
                              ? styles.availableBadge
                              : styles.unavailableBadge,
                        ]}
                      >
                        <Icon
                          name={
                            showPrescriptionBadge
                              ? 'assignment'
                              : medicine.is_available
                                ? 'check_circle'
                                : 'error'
                          }
                          size={15}
                          color={
                            showPrescriptionBadge
                              ? '#c95a14'
                              : medicine.is_available
                                ? '#18a653'
                                : '#d92d3d'
                          }
                        />

                        <Text
                          style={[
                            styles.statusBadgeText,
                            showPrescriptionBadge
                              ? styles.prescriptionBadgeText
                              : medicine.is_available
                                ? styles.availableBadgeText
                                : styles.unavailableBadgeText,
                          ]}
                          numberOfLines={1}
                        >
                          {showPrescriptionBadge
                            ? 'Ordonnance requise'
                            : medicine.is_available
                              ? 'En stock'
                              : 'Indisponible'}
                        </Text>
                      </View>

                      <View style={styles.quantityControl}>
                        <Pressable
                          style={styles.quantityButton}
                          onPress={(event) => {
                            event.stopPropagation()
                            updateQuantity(
                              medicine.id,
                              quantity - 1,
                            )
                          }}
                          accessibilityLabel="Réduire la quantité"
                        >
                          <Icon
                            name="remove"
                            size={18}
                            color="#6d7c91"
                          />
                        </Pressable>

                        <Text style={styles.quantityValue}>
                          {quantity}
                        </Text>

                        <Pressable
                          style={[
                            styles.quantityButton,
                            !canIncrease &&
                              styles.quantityButtonDisabled,
                          ]}
                          onPress={(event) => {
                            event.stopPropagation()
                            updateQuantity(
                              medicine.id,
                              quantity + 1,
                            )
                          }}
                          disabled={!canIncrease}
                          accessibilityLabel="Augmenter la quantité"
                        >
                          <Icon
                            name="add"
                            size={19}
                            color={
                              canIncrease
                                ? BRIGHT_BLUE
                                : '#aab5c5'
                            }
                          />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </Pressable>
              )
            },
          )}
        </View>

        {hasPrescriptionItem ? (
          <View style={styles.prescriptionNotice}>
            <View style={styles.prescriptionNoticeIcon}>
              <Icon
                name="assignment"
                size={23}
                color={BLUE}
              />
            </View>

            <View style={styles.prescriptionNoticeText}>
              <Text style={styles.prescriptionNoticeTitle}>
                Une ordonnance sera demandée
              </Text>

              <Text style={styles.prescriptionNoticeSubtitle}>
                pour certains produits. Vous pourrez la
                joindre à l’étape suivante.
              </Text>
            </View>
          </View>
        ) : null}

        {hasUnavailableItem ? (
          <View style={styles.unavailableNotice}>
            <Icon
              name="warning"
              size={20}
              color="#b4232f"
            />

            <Text style={styles.unavailableNoticeText}>
              Un article est indisponible ou ne possède
              pas de prix. Retirez-le avant de passer la
              commande.
            </Text>
          </View>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryTitleRow}>
            <View style={styles.summaryIcon}>
              <Icon
                name="receipt_long"
                size={20}
                color="#ffffff"
              />
            </View>

            <Text style={styles.summaryTitle}>
              Résumé de la commande
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Sous-total
            </Text>

            <Text style={styles.summaryValue}>
              {formatPrice(
                estimatedSubtotal,
              )}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Frais de livraison
            </Text>

            <Text style={styles.summaryValue}>
              {formatPrice(DELIVERY_FEE)}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Total estimé
            </Text>

            <Text style={styles.totalValue}>
              {formatPrice(estimatedTotal)}
            </Text>
          </View>

          <Text style={styles.summaryNotice}>
            Le prix final sera confirmé selon la
            pharmacie capable de préparer la commande.
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.checkoutPanel,
          {
            paddingBottom:
              Math.max(insets.bottom, 10),
          },
        ]}
      >
        <View style={styles.checkoutMainRow}>
          <View style={styles.checkoutTotal}>
            <Text style={styles.checkoutTotalLabel}>
              Total estimé
            </Text>

            <Text style={styles.checkoutTotalValue}>
              {formatPrice(estimatedTotal)}
            </Text>
          </View>

          <Pressable
            style={[
              styles.checkoutButton,
              hasUnavailableItem &&
                styles.checkoutButtonDisabled,
            ]}
            onPress={() =>
              navigation.navigate('Checkout')
            }
            disabled={hasUnavailableItem}
          >
            <Icon
              name="lock_outline"
              size={19}
              color={
                hasUnavailableItem
                  ? '#8d99aa'
                  : '#ffffff'
              }
            />

            <Text
              style={[
                styles.checkoutButtonText,
                hasUnavailableItem &&
                  styles.checkoutButtonTextDisabled,
              ]}
            >
              Passer à la commande
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.continueButton}
          onPress={() =>
            navigation.navigate('Tabs', {
              screen: 'Dashboard',
            })
          }
        >
          <Icon
            name="arrow_back"
            size={18}
            color={BLUE}
          />

          <Text style={styles.continueButtonText}>
            Continuer mes achats
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SURFACE,
  },

  content: {
    backgroundColor: SURFACE,
  },

  hero: {
    minHeight: 292,
    paddingHorizontal: 20,
    paddingBottom: 36,
    overflow: 'hidden',
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 42,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  brandIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  brandText: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.6,
  },

  brandAccent: {
    color: '#88efff',
    fontWeight: '500',
  },

  heroEyebrow: {
    marginTop: 28,
    color: '#dcecff',
    fontSize: 16,
    fontWeight: '500',
  },

  heroTitle: {
    marginTop: 4,
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.3,
  },

  heroCartArt: {
    position: 'absolute',
    top: 68,
    right: 38,
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [
      {
        rotate: '8deg',
      },
    ],
  },

  waveOne: {
    position: 'absolute',
    right: -50,
    bottom: -38,
    width: 320,
    height: 96,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 80,
    transform: [
      {
        rotate: '-9deg',
      },
    ],
  },

  waveTwo: {
    position: 'absolute',
    right: -15,
    bottom: -16,
    width: 360,
    height: 78,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 80,
    transform: [
      {
        rotate: '-7deg',
      },
    ],
  },

  itemCountRow: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },

  itemCountPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#bdd0ff',
    borderRadius: 22,
    backgroundColor: '#ffffff',
  },

  itemCountText: {
    color: BLUE,
    fontSize: 16,
    fontWeight: '900',
  },

  itemsList: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  itemCard: {
    flexDirection: 'row',
    minHeight: 164,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 23,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },

  itemImageWrap: {
    width: 112,
    height: 118,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 14,
    borderRadius: 17,
    backgroundColor: '#f7f9fc',
  },

  itemImage: {
    width: '100%',
    height: '100%',
  },

  itemImageFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  itemBody: {
    flex: 1,
    minWidth: 0,
  },

  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  itemTextArea: {
    flex: 1,
    minWidth: 0,
  },

  itemName: {
    paddingRight: 6,
    color: TEXT,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },

  itemGeneric: {
    marginTop: 4,
    color: MUTED,
    fontSize: 13,
    fontWeight: '500',
  },

  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
    borderWidth: 1,
    borderColor: '#ffc9d0',
    borderRadius: 12,
    backgroundColor: '#fff7f8',
  },

  itemPrice: {
    marginTop: 7,
    color: '#0751df',
    fontSize: 18,
    fontWeight: '900',
  },

  itemPriceUnavailable: {
    color: '#b4232f',
    fontSize: 14,
  },

  itemBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
  },

  statusBadge: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '57%',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 11,
  },

  availableBadge: {
    borderColor: '#beeacb',
    backgroundColor: '#effcf2',
  },

  prescriptionBadge: {
    borderColor: '#ffd6ad',
    backgroundColor: '#fff8ee',
  },

  unavailableBadge: {
    borderColor: '#f5c2c7',
    backgroundColor: '#fff2f3',
  },

  statusBadgeText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
  },

  availableBadgeText: {
    color: '#168a47',
  },

  prescriptionBadgeText: {
    color: '#bf5312',
  },

  unavailableBadgeText: {
    color: '#bd2635',
  },

  quantityControl: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d7e0ec',
    borderRadius: 13,
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
    minWidth: 32,
    color: TEXT,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },

  prescriptionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 15,
    borderWidth: 1,
    borderColor: '#b9d0ff',
    borderRadius: 19,
    backgroundColor: '#f6f9ff',
  },

  prescriptionNoticeIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 16,
    backgroundColor: '#e5efff',
  },

  prescriptionNoticeText: {
    flex: 1,
  },

  prescriptionNoticeTitle: {
    color: '#0c329b',
    fontSize: 14,
    fontWeight: '900',
  },

  prescriptionNoticeSubtitle: {
    marginTop: 2,
    color: '#50617d',
    fontSize: 13,
    lineHeight: 18,
  },

  unavailableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#f0c3c8',
    borderRadius: 18,
    backgroundColor: '#fff6f6',
  },

  unavailableNoticeText: {
    flex: 1,
    color: '#8e2c36',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },

  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    shadowColor: '#0b1f4d',
    shadowOffset: {
      width: 0,
      height: 7,
    },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 3,
  },

  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },

  summaryIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderRadius: 10,
    backgroundColor: BLUE,
  },

  summaryTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '900',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
  },

  summaryLabel: {
    color: '#263956',
    fontSize: 14,
  },

  summaryValue: {
    color: TEXT,
    fontSize: 14,
    fontWeight: '700',
  },

  summaryDivider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: '#e2e8f1',
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  totalLabel: {
    color: TEXT,
    fontSize: 17,
    fontWeight: '900',
  },

  totalValue: {
    color: '#0751df',
    fontSize: 23,
    fontWeight: '900',
  },

  summaryNotice: {
    marginTop: 10,
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
  },

  checkoutPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dbe5f2',
    backgroundColor: '#ffffff',
    shadowColor: '#00184d',
    shadowOffset: {
      width: 0,
      height: -6,
    },
    shadowOpacity: 0.11,
    shadowRadius: 16,
    elevation: 16,
  },

  checkoutMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 9,
    borderWidth: 1,
    borderColor: '#b9d4ff',
    borderRadius: 16,
    backgroundColor: '#eef7ff',
  },

  checkoutTotal: {
    width: 112,
    paddingLeft: 3,
  },

  checkoutTotalLabel: {
    color: '#2451b7',
    fontSize: 11,
    fontWeight: '700',
  },

  checkoutTotalValue: {
    marginTop: 2,
    color: '#0b49d5',
    fontSize: 19,
    fontWeight: '900',
  },

  checkoutButton: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#0751df',
  },

  checkoutButtonDisabled: {
    backgroundColor: '#d8e0ea',
  },

  checkoutButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  checkoutButtonTextDisabled: {
    color: '#8491a3',
  },

  continueButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 4,
  },

  continueButtonText: {
    color: BLUE,
    fontSize: 14,
    fontWeight: '800',
  },

  emptyScreen: {
    flex: 1,
    backgroundColor: SURFACE,
  },

  emptyHero: {
    minHeight: 330,
    paddingHorizontal: 20,
    paddingBottom: 38,
    overflow: 'hidden',
    borderBottomLeftRadius: 42,
    borderBottomRightRadius: 42,
  },

  emptyHeroEyebrow: {
    marginTop: 28,
    color: '#dcecff',
    fontSize: 16,
  },

  emptyHeroTitle: {
    marginTop: 5,
    color: '#ffffff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.2,
  },

  emptyCartArt: {
    position: 'absolute',
    right: 46,
    bottom: 42,
  },

  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },

  emptyIconWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: '#eaf2ff',
  },

  emptyTitle: {
    marginTop: 18,
    color: TEXT,
    fontSize: 21,
    fontWeight: '900',
  },

  emptySubtitle: {
    marginTop: 7,
    color: MUTED,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  emptyCta: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 22,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: BLUE,
  },

  emptyCtaText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
})
