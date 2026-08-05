import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

import type {
  MainStackParamList,
} from '../../navigation/types'
import { useCartStore } from '../../store/cartStore'
import Icon from '../../components/ui/Icon'
import { colors } from '../../theme/colors'

type Props = NativeStackScreenProps<
  MainStackParamList,
  'Cart'
>

const DELIVERY_FEE = 15

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
  const {
    items,
    updateQuantity,
    removeItem,
    clearCart,
  } = useCartStore()

  if (items.length === 0) {
    return (
      <View style={styles.emptyScreen}>
        <View style={styles.emptyIconWrap}>
          <Icon
            name="shopping_cart"
            size={48}
            color={colors.textMuted}
          />
        </View>

        <Text style={styles.emptyTitle}>
          Votre panier est vide
        </Text>

        <Text style={styles.emptySubtitle}>
          Ajoutez des médicaments depuis le
          Dashboard.
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
            name="medication"
            size={18}
            color={colors.white}
          />

          <Text style={styles.emptyCtaText}>
            Voir les médicaments
          </Text>
        </Pressable>
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

  const estimatedTotal =
    estimatedSubtotal + DELIVERY_FEE

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>
              Mon panier
            </Text>

            <Text style={styles.headerSubtitle}>
              {itemCount} article
              {itemCount > 1 ? 's' : ''}
            </Text>
          </View>

          <Pressable
            style={styles.clearButton}
            onPress={clearCart}
          >
            <Icon
              name="delete_sweep"
              size={18}
              color={colors.error}
            />

            <Text style={styles.clearButtonText}>
              Vider
            </Text>
          </Pressable>
        </View>

        <View style={styles.itemsCard}>
          {items.map(
            (
              {
                medicine,
                quantity,
              },
              index,
            ) => {
              const unitPrice =
                getMedicinePrice(
                  medicine.min_price,
                )

              const lineTotal =
                unitPrice === null
                  ? null
                  : unitPrice * quantity

              const maximumQuantity =
                medicine.total_available_quantity ??
                quantity

              const canIncrease =
                medicine.is_available &&
                quantity < maximumQuantity

              return (
                <View
                  key={medicine.id}
                  style={[
                    styles.itemContainer,
                    index > 0 &&
                      styles.itemBorder,
                  ]}
                >
                  <Pressable
                    style={styles.itemMainRow}
                    onPress={() =>
                      navigation.navigate(
                        'MedicineDetails',
                        {
                          id: medicine.id,
                        },
                      )
                    }
                  >
                    <View
                      style={
                        styles.itemImageWrap
                      }
                    >
                      {medicine.image ? (
                        <Image
                          source={{
                            uri: medicine.image,
                          }}
                          style={styles.itemImage}
                          resizeMode="contain"
                        />
                      ) : (
                        <Icon
                          name="medication"
                          size={30}
                          color={
                            colors.accentLight
                          }
                        />
                      )}
                    </View>

                    <View
                      style={styles.itemInfo}
                    >
                      <Text
                        style={styles.itemName}
                        numberOfLines={1}
                      >
                        {medicine.name}
                      </Text>

                      {!!medicine.generic_name && (
                        <Text
                          style={
                            styles.itemGeneric
                          }
                          numberOfLines={1}
                        >
                          {
                            medicine.generic_name
                          }
                        </Text>
                      )}

                      {medicine.requires_prescription && (
                        <View
                          style={styles.rxBadge}
                        >
                          <Icon
                            name="lock"
                            size={10}
                            color="#c2410c"
                          />

                          <Text
                            style={
                              styles.rxBadgeText
                            }
                          >
                            Ordonnance requise
                          </Text>
                        </View>
                      )}

                      {!medicine.is_available && (
                        <View
                          style={
                            styles.unavailableBadge
                          }
                        >
                          <Text
                            style={
                              styles.unavailableBadgeText
                            }
                          >
                            Indisponible
                          </Text>
                        </View>
                      )}
                    </View>

                    <Icon
                      name="chevron_right"
                      size={20}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  <View
                    style={styles.priceRow}
                  >
                    <View>
                      <Text
                        style={
                          styles.unitPriceLabel
                        }
                      >
                        Prix unitaire estimé
                      </Text>

                      <Text
                        style={[
                          styles.unitPrice,
                          unitPrice === null &&
                            styles.priceUnavailable,
                        ]}
                      >
                        {unitPrice === null
                          ? 'Prix indisponible'
                          : formatPrice(
                              unitPrice,
                            )}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.lineTotalArea
                      }
                    >
                      <Text
                        style={
                          styles.lineTotalLabel
                        }
                      >
                        Total
                      </Text>

                      <Text
                        style={[
                          styles.lineTotal,
                          lineTotal === null &&
                            styles.priceUnavailable,
                        ]}
                      >
                        {lineTotal === null
                          ? '—'
                          : formatPrice(
                              lineTotal,
                            )}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.itemActionRow
                    }
                  >
                    <View
                      style={
                        styles.quantityControl
                      }
                    >
                      <Pressable
                        style={
                          styles.quantityButton
                        }
                        onPress={() =>
                          updateQuantity(
                            medicine.id,
                            quantity - 1,
                          )
                        }
                        accessibilityLabel="Réduire la quantité"
                      >
                        <Icon
                          name="remove"
                          size={18}
                          color={
                            colors.textSecondary
                          }
                        />
                      </Pressable>

                      <Text
                        style={
                          styles.quantityValue
                        }
                      >
                        {quantity}
                      </Text>

                      <Pressable
                        style={[
                          styles.quantityButton,
                          !canIncrease &&
                            styles.quantityButtonDisabled,
                        ]}
                        onPress={() =>
                          updateQuantity(
                            medicine.id,
                            quantity + 1,
                          )
                        }
                        disabled={!canIncrease}
                        accessibilityLabel="Augmenter la quantité"
                      >
                        <Icon
                          name="add"
                          size={18}
                          color={
                            canIncrease
                              ? colors.textSecondary
                              : colors.textMuted
                          }
                        />
                      </Pressable>
                    </View>

                    <Pressable
                      style={
                        styles.removeButton
                      }
                      onPress={() =>
                        removeItem(medicine.id)
                      }
                    >
                      <Icon
                        name="delete"
                        size={18}
                        color="#dc2626"
                      />

                      <Text
                        style={
                          styles.removeButtonText
                        }
                      >
                        Supprimer
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )
            },
          )}
        </View>

        {hasUnavailableItem && (
          <View style={styles.errorBox}>
            <Icon
              name="warning"
              size={19}
              color="#b91c1c"
            />

            <Text style={styles.errorText}>
              Un médicament est indisponible ou ne
              possède pas de prix. Retirez-le ou
              ajoutez-le à nouveau depuis le
              Dashboard.
            </Text>
          </View>
        )}

        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <Icon
              name="receipt_long"
              size={21}
              color={colors.primary}
            />

            <Text style={styles.summaryTitle}>
              Récapitulatif estimatif
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
              Livraison
            </Text>

            <Text style={styles.summaryValue}>
              {formatPrice(DELIVERY_FEE)}
            </Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.totalRow}>
            <View>
              <Text style={styles.totalLabel}>
                Total estimé
              </Text>

              <Text style={styles.totalNotice}>
                Le prix final dépend de la
                pharmacie sélectionnée.
              </Text>
            </View>

            <Text style={styles.totalValue}>
              {formatPrice(estimatedTotal)}
            </Text>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Icon
            name="info"
            size={19}
            color="#2563eb"
          />

          <Text style={styles.noteText}>
            Les prix affichés sont les prix
            minimums disponibles. Le prix exact
            sera confirmé lorsque le système aura
            sélectionné une pharmacie capable de
            préparer toute la commande.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.checkoutBar}>
        <View style={styles.checkoutTotal}>
          <Text
            style={styles.checkoutTotalLabel}
          >
            Total estimé
          </Text>

          <Text
            style={styles.checkoutTotalValue}
          >
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
          <Text
            style={[
              styles.checkoutButtonText,
              hasUnavailableItem &&
                styles.checkoutButtonTextDisabled,
            ]}
          >
            Commander
          </Text>

          <Icon
            name="arrow_forward"
            size={19}
            color={
              hasUnavailableItem
                ? '#94a3b8'
                : colors.white
            }
          />
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },

  content: {
    gap: 16,
    padding: 16,
    paddingBottom: 24,
  },

  emptyScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.surface,
  },

  emptyIconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderRadius: 28,
    backgroundColor: colors.surfaceLowest,
  },

  emptyTitle: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },

  emptySubtitle: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },

  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },

  emptyCtaText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  headerTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
  },

  headerSubtitle: {
    marginTop: 3,
    color: colors.textSecondary,
    fontSize: 13,
  },

  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
  },

  clearButtonText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '600',
  },

  itemsCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 18,
    backgroundColor: colors.surfaceLowest,
  },

  itemContainer: {
    padding: 14,
  },

  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },

  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  itemImageWrap: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: '#eef6f7',
  },

  itemImage: {
    width: '100%',
    height: '100%',
  },

  itemInfo: {
    flex: 1,
    minWidth: 0,
  },

  itemName: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },

  itemGeneric: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 12,
  },

  rxBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#fff7ed',
  },

  rxBadgeText: {
    color: '#c2410c',
    fontSize: 10,
    fontWeight: '600',
  },

  unavailableBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },

  unavailableBadgeText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '700',
  },

  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },

  unitPriceLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },

  unitPrice: {
    marginTop: 3,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  lineTotalArea: {
    alignItems: 'flex-end',
  },

  lineTotalLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },

  lineTotal: {
    marginTop: 3,
    color: colors.primary,
    fontSize: 15,
    fontWeight: '800',
  },

  priceUnavailable: {
    color: colors.textMuted,
  },

  itemActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
  },

  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
  },

  quantityButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },

  quantityButtonDisabled: {
    backgroundColor: '#f1f5f9',
  },

  quantityValue: {
    minWidth: 38,
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },

  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 8,
  },

  removeButtonText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '600',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 16,
    backgroundColor: '#fef2f2',
  },

  errorText: {
    flex: 1,
    color: '#991b1b',
    fontSize: 12,
    lineHeight: 18,
  },

  summaryCard: {
    padding: 17,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 18,
    backgroundColor: colors.surfaceLowest,
  },

  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 17,
  },

  summaryTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },

  summaryValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },

  summaryDivider: {
    height: 1,
    marginVertical: 5,
    backgroundColor: colors.outlineVariant,
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },

  totalLabel: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },

  totalNotice: {
    maxWidth: 200,
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },

  totalValue: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '900',
  },

  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: 16,
    backgroundColor: '#eff6ff',
  },

  noteText: {
    flex: 1,
    color: '#1d4ed8',
    fontSize: 12,
    lineHeight: 18,
  },

  checkoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surfaceLowest,
  },

  checkoutTotal: {
    minWidth: 100,
  },

  checkoutTotalLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },

  checkoutTotalValue: {
    marginTop: 2,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
  },

  checkoutButton: {
    minHeight: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 15,
    backgroundColor: colors.primary,
  },

  checkoutButtonDisabled: {
    backgroundColor: '#e2e8f0',
  },

  checkoutButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },

  checkoutButtonTextDisabled: {
    color: '#94a3b8',
  },
})