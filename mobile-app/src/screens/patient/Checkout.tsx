import {
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useFocusEffect,
} from '@react-navigation/native'
import type {
  NativeStackScreenProps,
} from '@react-navigation/native-stack'

import type {
  MainStackParamList,
} from '../../navigation/types'
import {
  ordersApi,
  type PaymentMethod,
  type PrescriptionMode,
} from '../../api/orders'
import {
  addressesApi,
  type Address,
} from '../../api/addresses'
import {
  useCartStore,
} from '../../store/cartStore'
import {
  firstError,
} from '../../api/errors'
import Icon from '../../components/ui/Icon'
import {
  colors,
} from '../../theme/colors'

type Props =
  NativeStackScreenProps<
    MainStackParamList,
    'Checkout'
  >

const DELIVERY_FEE = 15

const PRESCRIPTION_OPTIONS: {
  value: PrescriptionMode
  label: string
}[] = [
  {
    value: 'none',
    label: 'Aucune',
  },
  {
    value: 'photo',
    label: 'Photo',
  },
  {
    value: 'pickup',
    label: 'À la livraison',
  },
]

function getMedicinePrice(
  price: string | null | undefined,
) {
  if (
    price === null ||
    price === undefined
  ) {
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

function formatPrice(
  value: number,
) {
  return `${value
    .toFixed(2)
    .replace('.', ',')} MAD`
}

export default function Checkout({
  navigation,
}: Props) {
  const {
    items,
    clearCart,
  } = useCartStore()

  const [
    addresses,
    setAddresses,
  ] = useState<Address[]>([])

  const [
    addressesLoading,
    setAddressesLoading,
  ] = useState(true)

  const [
    selectedAddress,
    setSelectedAddress,
  ] = useState<Address | null>(null)

  const [
    customAddress,
    setCustomAddress,
  ] = useState('')

  const [
    useCustom,
    setUseCustom,
  ] = useState(false)

  const [
    prescriptionMode,
    setPrescriptionMode,
  ] =
    useState<PrescriptionMode>('none')

  const [
    paymentMethod,
    setPaymentMethod,
  ] =
    useState<PaymentMethod>('cash')

  const [
    notes,
    setNotes,
  ] = useState('')

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const loadAddresses =
    useCallback(() => {
      let isActive = true

      setAddressesLoading(true)

      addressesApi
        .list()
        .then((response) => {
          if (!isActive) {
            return
          }

          const nextAddresses =
            response.data.results

          setAddresses(nextAddresses)

          const defaultAddress =
            nextAddresses.find(
              (address) =>
                address.is_default,
            )

          setSelectedAddress(
            (currentAddress) => {
              const existingAddress =
                nextAddresses.find(
                  (address) =>
                    address.id ===
                    currentAddress?.id,
                )

              return (
                existingAddress ??
                defaultAddress ??
                nextAddresses[0] ??
                null
              )
            },
          )

          setUseCustom(
            nextAddresses.length === 0,
          )
        })
        .catch(() => {
          if (!isActive) {
            return
          }

          setAddresses([])
          setSelectedAddress(null)
          setUseCustom(true)
        })
        .finally(() => {
          if (isActive) {
            setAddressesLoading(false)
          }
        })

      return () => {
        isActive = false
      }
    }, [])

  useFocusEffect(
    useCallback(() => {
      return loadAddresses()
    }, [loadAddresses]),
  )

  useEffect(() => {
    if (
      items.length === 0 &&
      !submitting
    ) {
      navigation.replace(
        'Tabs',
        {
          screen: 'Dashboard',
        },
      )
    }
  }, [
    items.length,
    navigation,
    submitting,
  ])

  if (items.length === 0) {
    return null
  }

  const hasPrescriptionItem =
    items.some(
      (item) =>
        item.medicine
          .requires_prescription,
    )

  const hasInvalidPricing =
    items.some((item) => {
      const unitPrice =
        getMedicinePrice(
          item.medicine.min_price,
        )

      return (
        !item.medicine.is_available ||
        unitPrice === null
      )
    })

  const estimatedSubtotal =
    items.reduce(
      (total, item) => {
        const unitPrice =
          getMedicinePrice(
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

  const estimatedTotal =
    estimatedSubtotal +
    DELIVERY_FEE

  async function handleSubmit() {
    setError('')

    if (hasInvalidPricing) {
      setError(
        'Un médicament est indisponible ou ne possède pas de prix valide. Retournez au panier pour le retirer.',
      )
      return
    }

    if (useCustom) {
      if (!customAddress.trim()) {
        setError(
          'Veuillez saisir une adresse de livraison.',
        )
        return
      }

      setError(
        "Cette adresse ne possède pas de localisation GPS. Veuillez l'ajouter dans vos adresses enregistrées avant de commander.",
      )
      return
    }

    if (!selectedAddress) {
      setError(
        'Veuillez sélectionner une adresse de livraison.',
      )
      return
    }

    const latitude =
      selectedAddress.latitude

    const longitude =
      selectedAddress.longitude

    if (
      latitude === null ||
      latitude === undefined ||
      longitude === null ||
      longitude === undefined
    ) {
      setError(
        "Cette adresse ne possède pas de localisation GPS. Veuillez la modifier depuis l'écran des adresses.",
      )
      return
    }

    if (
      hasPrescriptionItem &&
      prescriptionMode === 'none'
    ) {
      setError(
        'Certains médicaments nécessitent une ordonnance. Sélectionnez un mode de transmission.',
      )
      return
    }

    const deliveryAddress =
      `${selectedAddress.street}, ${selectedAddress.city}`

    setSubmitting(true)

    try {
      const response =
        await ordersApi.create({
          items: items.map(
            (item) => ({
              medicine:
                item.medicine.id,

              quantity:
                item.quantity,
            }),
          ),

          delivery_address:
            deliveryAddress,

          latitude,
          longitude,

          prescription_mode:
            prescriptionMode,

          payment_method:
            paymentMethod,

          notes:
            notes.trim() ||
            undefined,
        })

      clearCart()

      navigation.replace(
        'OrderDetail',
        {
          id: response.data.id,
        },
      )
    } catch (submitError) {
      setError(
        firstError(submitError) ||
          'Une erreur est survenue. Veuillez réessayer.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>
        Confirmer la commande
      </Text>

      {/* Order summary */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="receipt"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Récapitulatif
          </Text>
        </View>

        <View
          style={styles.summaryList}
        >
          {items.map(
            ({
              medicine,
              quantity,
            }) => {
              const unitPrice =
                getMedicinePrice(
                  medicine.min_price,
                )

              const lineTotal =
                unitPrice === null
                  ? null
                  : unitPrice *
                    quantity

              return (
                <View
                  key={medicine.id}
                  style={
                    styles.summaryRow
                  }
                >
                  <View
                    style={
                      styles.summaryLeft
                    }
                  >
                    <View
                      style={
                        styles.summaryIcon
                      }
                    >
                      <Icon
                        name="medication"
                        size={16}
                        color={
                          colors.accentLight
                        }
                      />
                    </View>

                    <View
                      style={
                        styles.summaryInformation
                      }
                    >
                      <Text
                        style={
                          styles.summaryName
                        }
                        numberOfLines={1}
                      >
                        {medicine.name}
                      </Text>

                      {!!medicine.generic_name && (
                        <Text
                          style={
                            styles.summaryGeneric
                          }
                          numberOfLines={1}
                        >
                          {
                            medicine.generic_name
                          }
                        </Text>
                      )}

                      <Text
                        style={[
                          styles.summaryUnitPrice,

                          unitPrice === null &&
                            styles.priceUnavailable,
                        ]}
                      >
                        {unitPrice === null
                          ? 'Prix indisponible'
                          : `${formatPrice(
                              unitPrice,
                            )} l’unité`}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={
                      styles.summaryRight
                    }
                  >
                    <Text
                      style={
                        styles.summaryQty
                      }
                    >
                      × {quantity}
                    </Text>

                    <Text
                      style={[
                        styles.summaryLineTotal,

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
              )
            },
          )}
        </View>

        <View
          style={styles.pricingDivider}
        />

        <View
          style={styles.pricingRow}
        >
          <Text
            style={styles.pricingLabel}
          >
            Sous-total estimé
          </Text>

          <Text
            style={styles.pricingValue}
          >
            {formatPrice(
              estimatedSubtotal,
            )}
          </Text>
        </View>

        <View
          style={styles.pricingRow}
        >
          <Text
            style={styles.pricingLabel}
          >
            Frais de livraison
          </Text>

          <Text
            style={styles.pricingValue}
          >
            {formatPrice(
              DELIVERY_FEE,
            )}
          </Text>
        </View>

        <View
          style={
            styles.pricingTotalRow
          }
        >
          <View style={styles.totalInfo}>
            <Text
              style={
                styles.pricingTotalLabel
              }
            >
              Total estimé
            </Text>

            <Text
              style={
                styles.pricingNotice
              }
            >
              Le montant final dépend
              de la pharmacie
              sélectionnée.
            </Text>
          </View>

          <Text
            style={
              styles.pricingTotalValue
            }
          >
            {formatPrice(
              estimatedTotal,
            )}
          </Text>
        </View>

        <Text
          style={styles.summaryFootnote}
        >
          Les prix affichés correspondent
          aux prix minimums actuellement
          disponibles. Le prix final sera
          confirmé après la sélection de
          la pharmacie.
        </Text>
      </View>

      {/* Address */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="location_on"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Adresse de livraison
          </Text>
        </View>

        {addressesLoading ? (
          <View
            style={
              styles.addressLoading
            }
          >
            <ActivityIndicator
              color={colors.primary}
            />

            <Text
              style={
                styles.addressLoadingText
              }
            >
              Chargement des adresses…
            </Text>
          </View>
        ) : (
          <>
            {addresses.length > 0 &&
              !useCustom && (
                <View
                  style={
                    styles.addressList
                  }
                >
                  {addresses.map(
                    (address) => {
                      const active =
                        selectedAddress?.id ===
                        address.id

                      const hasCoordinates =
                        address.latitude !==
                          null &&
                        address.latitude !==
                          undefined &&
                        address.longitude !==
                          null &&
                        address.longitude !==
                          undefined

                      return (
                        <Pressable
                          key={
                            address.id
                          }
                          style={[
                            styles.addressOption,

                            active &&
                              styles.addressOptionActive,
                          ]}
                          onPress={() => {
                            setError('')

                            setSelectedAddress(
                              address,
                            )
                          }}
                        >
                          <View
                            style={[
                              styles.radio,

                              active &&
                                styles.radioActive,
                            ]}
                          >
                            {active && (
                              <View
                                style={
                                  styles.radioDot
                                }
                              />
                            )}
                          </View>

                          <View
                            style={
                              styles.addressInformation
                            }
                          >
                            <View
                              style={
                                styles.addressLabelRow
                              }
                            >
                              <Text
                                style={
                                  styles.addressLabel
                                }
                              >
                                {
                                  address.label
                                }
                              </Text>

                              {address.is_default && (
                                <View
                                  style={
                                    styles.defaultBadge
                                  }
                                >
                                  <Text
                                    style={
                                      styles.defaultBadgeText
                                    }
                                  >
                                    Par défaut
                                  </Text>
                                </View>
                              )}
                            </View>

                            <Text
                              style={
                                styles.addressText
                              }
                            >
                              {
                                address.street
                              }
                              , {address.city}
                            </Text>

                            {!hasCoordinates && (
                              <View
                                style={
                                  styles.locationWarning
                                }
                              >
                                <Icon
                                  name="location_off"
                                  size={13}
                                  color="#b91c1c"
                                />

                                <Text
                                  style={
                                    styles.locationWarningText
                                  }
                                >
                                  Localisation
                                  GPS manquante
                                </Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                      )
                    },
                  )}
                </View>
              )}

            {(addresses.length === 0 ||
              useCustom) && (
              <>
                <TextInput
                  value={customAddress}
                  onChangeText={
                    setCustomAddress
                  }
                  placeholder="Ex : 12 Rue Mohammed V, Casablanca"
                  placeholderTextColor={
                    colors.textMuted
                  }
                  style={
                    styles.textInput
                  }
                />

                <View
                  style={
                    styles.customAddressWarning
                  }
                >
                  <Icon
                    name="info"
                    size={17}
                    color="#1d4ed8"
                  />

                  <Text
                    style={
                      styles.customAddressWarningText
                    }
                  >
                    Pour commander, cette
                    adresse doit être
                    enregistrée avec sa
                    localisation GPS.
                  </Text>
                </View>
              </>
            )}

            {addresses.length > 0 && (
              <Pressable
                onPress={() => {
                  setError('')

                  setUseCustom(
                    (currentValue) =>
                      !currentValue,
                  )
                }}
              >
                <Text
                  style={styles.linkText}
                >
                  {useCustom
                    ? '← Utiliser une adresse enregistrée'
                    : '+ Saisir une autre adresse'}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={
                styles.manageAddressButton
              }
              onPress={() =>
                navigation.navigate(
                  'Addresses',
                )
              }
            >
              <Icon
                name="add_location_alt"
                size={18}
                color={colors.primary}
              />

              <Text
                style={
                  styles.manageAddressText
                }
              >
                Ajouter ou modifier mes
                adresses
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Prescription */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="description"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Ordonnance
          </Text>
        </View>

        {hasPrescriptionItem && (
          <View
            style={styles.warningBox}
          >
            <Icon
              name="warning"
              size={14}
              color="#c2410c"
            />

            <Text
              style={styles.warningText}
            >
              Certains médicaments
              nécessitent une ordonnance.
            </Text>
          </View>
        )}

        <View
          style={styles.segmentRow}
        >
          {PRESCRIPTION_OPTIONS.map(
            (option) => {
              const active =
                prescriptionMode ===
                option.value

              return (
                <Pressable
                  key={option.value}
                  style={[
                    styles.segmentButton,

                    active &&
                      styles.segmentButtonActive,
                  ]}
                  onPress={() => {
                    setError('')

                    setPrescriptionMode(
                      option.value,
                    )
                  }}
                >
                  <Text
                    style={[
                      styles.segmentText,

                      active &&
                        styles.segmentTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            },
          )}
        </View>

        {prescriptionMode ===
          'photo' && (
          <View
            style={styles.uploadBox}
          >
            <Icon
              name="upload"
              size={18}
              color={colors.primary}
            />

            <Text
              style={styles.uploadText}
            >
              Joindre une photo
              (fonctionnalité à venir)
            </Text>
          </View>
        )}
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="payment"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Mode de paiement
          </Text>
        </View>

        <View style={styles.payRow}>
          <PayOption
            icon="payments"
            label="Espèces"
            active={
              paymentMethod === 'cash'
            }
            onPress={() =>
              setPaymentMethod('cash')
            }
          />

          <PayOption
            icon="credit_card"
            label="Carte bancaire"
            active={
              paymentMethod === 'card'
            }
            onPress={() =>
              setPaymentMethod('card')
            }
          />
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <View
          style={styles.sectionHeader}
        >
          <Icon
            name="notes"
            size={18}
            color={colors.primary}
          />

          <Text
            style={styles.sectionTitle}
          >
            Notes (optionnel)
          </Text>
        </View>

        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholder="Informations supplémentaires pour la pharmacie..."
          placeholderTextColor={
            colors.textMuted
          }
          style={[
            styles.textInput,
            styles.textArea,
          ]}
        />
      </View>

      {hasInvalidPricing && (
        <View style={styles.errorBox}>
          <Icon
            name="warning"
            size={16}
            color={colors.errorText}
          />

          <Text
            style={styles.errorText}
          >
            Un médicament est indisponible
            ou ne possède pas de prix
            valide. Retournez au panier
            pour le retirer.
          </Text>
        </View>
      )}

      {!!error && (
        <View style={styles.errorBox}>
          <Icon
            name="error"
            size={16}
            color={colors.errorText}
          />

          <Text
            style={styles.errorText}
          >
            {error}
          </Text>
        </View>
      )}

      <Pressable
        style={[
          styles.submitButton,

          (submitting ||
            hasInvalidPricing) &&
            styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={
          submitting ||
          hasInvalidPricing
        }
      >
        {submitting ? (
          <>
            <ActivityIndicator
              color={colors.white}
            />

            <Text
              style={styles.submitText}
            >
              Création de la commande…
            </Text>
          </>
        ) : (
          <>
            <Text
              style={styles.submitText}
            >
              Confirmer la commande
            </Text>

            <Icon
              name="arrow_forward"
              size={19}
              color={colors.white}
            />
          </>
        )}
      </Pressable>
    </ScrollView>
  )
}

type PayOptionProps = {
  icon: string
  label: string
  active: boolean
  onPress: () => void
}

function PayOption({
  icon,
  label,
  active,
  onPress,
}: PayOptionProps) {
  return (
    <Pressable
      style={[
        styles.payOption,

        active &&
          styles.payOptionActive,
      ]}
      onPress={onPress}
    >
      <Icon
        name={icon}
        size={22}
        color={
          active
            ? colors.primary
            : colors.textSecondary
        }
      />

      <Text
        style={[
          styles.payLabel,

          active &&
            styles.payLabelActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        colors.surface,
    },

    content: {
      gap: 16,
      padding: 16,
      paddingBottom: 32,
    },

    title: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
    },

    card: {
      gap: 12,
      padding: 16,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 16,
      backgroundColor:
        colors.surfaceLowest,
    },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    sectionTitle: {
      color:
        colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },

    summaryList: {
      gap: 13,
    },

    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 12,
    },

    summaryLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    summaryIcon: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        colors.surface,
    },

    summaryInformation: {
      flex: 1,
      minWidth: 0,
    },

    summaryName: {
      color:
        colors.textPrimary,
      fontSize: 14,
      fontWeight: '700',
    },

    summaryGeneric: {
      marginTop: 2,
      color: colors.textMuted,
      fontSize: 11,
    },

    summaryUnitPrice: {
      marginTop: 4,
      color:
        colors.textSecondary,
      fontSize: 11,
      fontWeight: '600',
    },

    summaryRight: {
      alignItems: 'flex-end',
      gap: 4,
    },

    summaryQty: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
    },

    summaryLineTotal: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '800',
    },

    priceUnavailable: {
      color: colors.textMuted,
    },

    pricingDivider: {
      height: 1,
      marginVertical: 3,
      backgroundColor:
        colors.outlineVariant,
    },

    pricingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    pricingLabel: {
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    pricingValue: {
      color:
        colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },

    pricingTotalRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent:
        'space-between',
      gap: 12,
      marginTop: 4,
    },

    totalInfo: {
      flex: 1,
    },

    pricingTotalLabel: {
      color:
        colors.textPrimary,
      fontSize: 15,
      fontWeight: '800',
    },

    pricingNotice: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 14,
    },

    pricingTotalValue: {
      color: colors.primary,
      fontSize: 19,
      fontWeight: '900',
    },

    summaryFootnote: {
      marginTop: 4,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor:
        colors.outlineVariant,
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },

    addressLoading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
    },

    addressLoadingText: {
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    addressList: {
      gap: 8,
    },

    addressOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    addressOptionActive: {
      borderColor:
        colors.primary,
      backgroundColor: '#eff6ff',
    },

    radio: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 10,
    },

    radioActive: {
      borderColor:
        colors.primary,
    },

    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor:
        colors.primary,
    },

    addressInformation: {
      flex: 1,
    },

    addressLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },

    addressLabel: {
      color:
        colors.textPrimary,
      fontSize: 13,
      fontWeight: '700',
    },

    defaultBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#dbeafe',
    },

    defaultBadgeText: {
      color: '#1d4ed8',
      fontSize: 9,
      fontWeight: '700',
    },

    addressText: {
      marginTop: 2,
      color:
        colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },

    locationWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 6,
    },

    locationWarningText: {
      color: '#b91c1c',
      fontSize: 10,
      fontWeight: '600',
    },

    textInput: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
      backgroundColor:
        colors.surfaceLowest,
      color: colors.textPrimary,
      fontSize: 14,
    },

    textArea: {
      minHeight: 72,
      textAlignVertical: 'top',
    },

    customAddressWarning: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 11,
      borderWidth: 1,
      borderColor: '#bfdbfe',
      borderRadius: 12,
      backgroundColor: '#eff6ff',
    },

    customAddressWarningText: {
      flex: 1,
      color: '#1d4ed8',
      fontSize: 11,
      lineHeight: 16,
    },

    linkText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '600',
    },

    manageAddressButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 11,
      borderWidth: 1,
      borderColor:
        colors.primary,
      borderRadius: 12,
    },

    manageAddressText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },

    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: '#fff7ed',
    },

    warningText: {
      flex: 1,
      color: '#c2410c',
      fontSize: 12,
    },

    segmentRow: {
      flexDirection: 'row',
      gap: 8,
    },

    segmentButton: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    segmentButtonActive: {
      borderColor:
        colors.primary,
      backgroundColor:
        colors.primary,
    },

    segmentText: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },

    segmentTextActive: {
      color: colors.white,
    },

    uploadBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      borderWidth: 2,
      borderColor: '#bfdbfe',
      borderStyle: 'dashed',
      borderRadius: 12,
    },

    uploadText: {
      flex: 1,
      color:
        colors.textSecondary,
      fontSize: 13,
    },

    payRow: {
      flexDirection: 'row',
      gap: 12,
    },

    payOption: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
      paddingVertical: 16,
      borderWidth: 2,
      borderColor:
        colors.outlineVariant,
      borderRadius: 12,
    },

    payOptionActive: {
      borderColor:
        colors.primary,
      backgroundColor: '#eff6ff',
    },

    payLabel: {
      color:
        colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },

    payLabelActive: {
      color: colors.primary,
    },

    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#fecaca',
      borderRadius: 12,
      backgroundColor:
        colors.errorBg,
    },

    errorText: {
      flex: 1,
      color:
        colors.errorText,
      fontSize: 13,
      lineHeight: 18,
    },

    submitButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
      borderRadius: 16,
      backgroundColor:
        colors.primary,
    },

    submitButtonDisabled: {
      opacity: 0.55,
    },

    submitText: {
      color: colors.white,
      fontSize: 14,
      fontWeight: '700',
    },
  })